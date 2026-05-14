"""
Laminar - Notification Service
------------------------------

Handles real email notifications for Crowd Alerts.

Responsibilities:
- Send colored HTML emails
- Route to management / police / supervisors
- Respect cooldown window
- Update last_notified_at
- Include camera & venue location
- Production-safe async SMTP
"""

from typing import List
from uuid import UUID
from datetime import datetime, timezone

import aiosmtplib
from email.message import EmailMessage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
import httpx
import json
import os
import asyncio
import time
from collections import deque

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.models.crowd_alert import CrowdAlert
from app.models.camera import Camera
from app.models.venue import Venue
from app.models.alert_contact import AlertContact
from app.core.repository import Repository
from app.core.logging import get_logger
from app.services.sms_alert_service import SmsAlertService
from app.services.translation_service import TranslationService
# Import the Laminar AI Intelligence Engine
from app.services.laminar_intelligence_service import laminar_intelligence



logger = get_logger(__name__)

# Tactical Mesh State (In-Memory Buffer)
_notification_buffer = deque(maxlen=50)
_sse_subscribers: List[asyncio.Queue] = []


class NotificationService:
    """
    Production-ready email notification engine.
    """

    COLOR_MAP = {
        "low": "#16a34a",       # green
        "medium": "#eab308",    # yellow
        "high": "#f97316",      # orange
        "critical": "#dc2626",  # red
    }

    def __init__(self):
        self.sms_service = SmsAlertService()

    async def notify_camera_issue(
        self,
        session: AsyncSession,
        alert: CrowdAlert,
    ) -> None:
        """
        Send a specialized notification for camera health issues with
        actionable, issue-type-specific descriptions and step-by-step guidance.
        """
        venue_repo = Repository[Venue](Venue)
        venue = await venue_repo.get_by_id(session, alert.venue_id)
        if not venue:
            return

        extra = alert.extra_data or {}
        issue_label = extra.get("issue_label", "Camera Health Issue")
        cam_name    = extra.get("camera_name", "Unknown Camera")
        cam_location = extra.get("camera_location", "")
        issue_type  = extra.get("issue_type", "unknown")

        # ─── Issue-specific actionable content ────────────────────────────────
        ISSUE_GUIDE: dict = {
            "offline": {
                "description": (
                    f"Camera '{cam_name}' has stopped transmitting heartbeats and is considered "
                    f"offline. Common causes include a network/PoE outage, power failure, or "
                    f"physical cable disconnection."
                ),
                "steps": [
                    "Verify the network switch and PoE injector powering this camera are active.",
                    "Check power indicator LEDs on the camera housing.",
                    "Attempt a remote restart from the Camera Health dashboard.",
                    "Dispatch a technician if the camera remains offline for more than 10 minutes.",
                ],
                "color": "#dc2626",
            },
            "black_screen": {
                "description": (
                    f"Camera '{cam_name}' is transmitting frames that are completely black. "
                    f"The IR illuminator may have failed, the aperture may be blocked, or the "
                    f"camera may be in an incorrect low-light exposure mode."
                ),
                "steps": [
                    "Confirm the camera is not pointed at a sealed surface or placed inside an enclosure.",
                    "Check IR LEDs — they should glow faint red in darkness when active.",
                    "Review exposure and night-mode settings via the camera's web interface.",
                    "Clean the lens if IR LEDs appear active but the image remains black.",
                ],
                "color": "#7c3aed",
            },
            "lens_covered": {
                "description": (
                    f"Camera '{cam_name}' has critically low frame variance indicative of lens "
                    f"obstruction. This is a recognised tamper signature and requires immediate "
                    f"physical investigation."
                ),
                "steps": [
                    "⚠️ SECURITY — Physically inspect the camera immediately.",
                    "Check for tape, spray paint, cloth, or any object placed over the lens.",
                    "Review adjacent camera footage and access logs for suspicious activity.",
                    "File a security incident report if intentional tampering is confirmed.",
                ],
                "color": "#dc2626",
            },
            "blurred": {
                "description": (
                    f"Camera '{cam_name}' is producing severely blurred frames. Likely causes: "
                    f"condensation inside the housing, dust accumulation on the lens, or a "
                    f"drifted auto-focus motor."
                ),
                "steps": [
                    "Clean the external lens surface with a clean microfiber cloth.",
                    "Inspect the dome cover for internal moisture or condensation.",
                    "Trigger the auto-focus function via the camera's web interface.",
                    "Replace the dome gasket if moisture ingress is suspected.",
                ],
                "color": "#d97706",
            },
            "rotated": {
                "description": (
                    f"Camera '{cam_name}' appears to have been physically rotated or misaligned — "
                    f"the structural horizon in the frame has shifted significantly from baseline."
                ),
                "steps": [
                    "Physically inspect and tighten any loose fasteners on the camera mount.",
                    "Re-align the camera to its original field of view using the live preview.",
                    "Check whether vibration or tampering caused the bracket to shift.",
                    "Update the camera baseline snapshot in the system after re-alignment.",
                ],
                "color": "#f97316",
            },
        }

        guide = ISSUE_GUIDE.get(issue_type, {
            "description": f"Camera '{cam_name}' has reported a health issue: {issue_label}.",
            "steps": ["Review the Camera Health dashboard and inspect the camera."],
            "color": "#eab308",
        })
        color       = guide["color"]
        description = guide["description"]
        steps: list = guide["steps"]
        location_suffix = f" — {cam_location}" if cam_location else ""

        role_recipients = await self._resolve_recipients(session, alert.risk_level, extra)
        if not role_recipients:
            return

        all_emails: set = set()
        for emails in role_recipients.values():
            all_emails.update(emails)

        from app.models.user import User
        stmt_lang  = select(User.email, User.language_preference).where(User.email.in_(all_emails))
        result_lang = await session.execute(stmt_lang)
        user_langs  = {row[0]: row[1] or "en" for row in result_lang.all()}

        from app.services.translation_service import TranslationService
        t = TranslationService.t

        # Optional AI block
        ai_html = ""
        try:
            from app.services.ai_provider_service import get_ai_provider
            ai_provider = get_ai_provider()
            prompt = (
                f"Security systems engineer context. Camera issue '{issue_label}' detected on "
                f"'{cam_name}' at '{venue.name}'{location_suffix}. Write a precise 2-sentence "
                f"technical summary of the most likely root cause and the single most critical "
                f"immediate action required."
            )
            ai_text = await ai_provider.generate_response(prompt)
            if ai_text:
                ai_html = (
                    f'<div style="background:#1f2937;border-left:5px solid #3b82f6;'
                    f'padding:15px;color:#f3f4f6;margin-bottom:20px;font-size:14px;border-radius:4px;">'
                    f'<div style="font-size:11px;color:#93c5fd;text-transform:uppercase;'
                    f'font-weight:bold;margin-bottom:8px;">🤖 AI Hardware Diagnostic</div>'
                    f'<em>"{ai_text}"</em></div>'
                )
        except Exception:
            pass

        steps_html = "".join(
            f'<li style="margin-bottom:8px;line-height:1.6;">{s}</li>' for s in steps
        )
        location_row = (
            f'<tr style="border-bottom:1px solid #e5e7eb;">'
            f'<td style="padding:8px 0;font-weight:bold;width:130px;">Location</td>'
            f'<td style="padding:8px 0;">{cam_location}</td></tr>'
        ) if cam_location else ""

        for role_label, emails in role_recipients.items():
            if not emails:
                continue
            emails_by_lang: dict = {}
            for email in emails:
                lang = user_langs.get(email, "en")
                emails_by_lang.setdefault(lang, []).append(email)

            for lang, lang_emails in emails_by_lang.items():
                try:
                    html = (
                        f'<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;'
                        f'background:#f1f5f9;margin:0;padding:0;">'
                        f'<div style="background:{color};padding:24px 28px;color:white;">'
                        f'<div style="font-size:11px;opacity:.75;text-transform:uppercase;margin-bottom:4px;">'
                        f'Laminar AI &mdash; Camera Health Alert</div>'
                        f'<h1 style="margin:0;font-size:22px;">{issue_label}</h1>'
                        f'<p style="margin:5px 0 0;opacity:.9;font-size:14px;">'
                        f'{cam_name}{location_suffix}</p></div>'
                        f'<div style="padding:28px;background:#ffffff;">'
                        f'{ai_html}'
                        f'<div style="background:#fef9c3;border:1px solid #fbbf24;border-radius:8px;'
                        f'padding:16px;margin-bottom:20px;">'
                        f'<div style="font-size:11px;color:#92400e;font-weight:bold;'
                        f'text-transform:uppercase;margin-bottom:8px;">⚠ What This Means</div>'
                        f'<p style="margin:0;color:#78350f;font-size:13px;line-height:1.6;">{description}</p></div>'
                        f'<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;'
                        f'padding:16px;margin-bottom:20px;">'
                        f'<div style="font-size:11px;color:#166534;font-weight:bold;'
                        f'text-transform:uppercase;margin-bottom:10px;">✅ Recommended Actions</div>'
                        f'<ol style="margin:0;padding-left:20px;color:#15803d;font-size:13px;">'
                        f'{steps_html}</ol></div>'
                        f'<table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151;">'
                        f'<tr style="border-bottom:1px solid #e5e7eb;">'
                        f'<td style="padding:8px 0;font-weight:bold;width:130px;">Camera</td>'
                        f'<td style="padding:8px 0;">{cam_name}</td></tr>'
                        f'<tr style="border-bottom:1px solid #e5e7eb;">'
                        f'<td style="padding:8px 0;font-weight:bold;">Venue</td>'
                        f'<td style="padding:8px 0;">{venue.name}</td></tr>'
                        f'{location_row}'
                        f'<tr style="border-bottom:1px solid #e5e7eb;">'
                        f'<td style="padding:8px 0;font-weight:bold;">Issue Type</td>'
                        f'<td style="padding:8px 0;">{issue_label}</td></tr>'
                        f'<tr style="border-bottom:1px solid #e5e7eb;">'
                        f'<td style="padding:8px 0;font-weight:bold;">Status</td>'
                        f'<td style="padding:8px 0;">{alert.status.upper()}</td></tr>'
                        f'<tr><td style="padding:8px 0;font-weight:bold;">Detected</td>'
                        f'<td style="padding:8px 0;">'
                        f'{datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}'
                        f'</td></tr></table>'
                        f'<div style="margin-top:24px;">'
                        f'<a href="http://localhost:3000/cameras/health" style="display:inline-block;'
                        f'padding:12px 28px;background:{color};color:white;text-decoration:none;'
                        f'border-radius:6px;font-weight:bold;font-size:14px;">'
                        f'Open Camera Health Dashboard &rarr;</a></div>'
                        f'<hr style="border:1px solid #e5e7eb;margin:24px 0;"/>'
                        f'<p style="font-size:11px;color:#9ca3af;">Auto-generated by Laminar AI &mdash; '
                        f'sent to {role_label} contacts only.</p>'
                        f'</div></body></html>'
                    )
                    msg = EmailMessage()
                    msg["From"] = settings.SMTP_USER
                    msg["Subject"] = (
                        f"[CAMERA ALERT] {issue_label} — {cam_name}"
                        f" | {venue.name} [{role_label.upper()}]"
                    )
                    msg.add_alternative(html, subtype="html")
                    await self._send_email(msg, lang_emails)
                except Exception as e:
                    logger.error(f"Failed to send camera notification: {e}")

        alert.last_notified_at = datetime.now(timezone.utc)
        await session.commit()

    async def notify_status_change(
        self,
        session: AsyncSession,
        alert: CrowdAlert,
        status: str,
    ) -> None:
        """
        Handle notifications for alert status changes (resolved, acknowledged).
        For now, this just logs the change, as WebSocket handles the real-time push. 
        Could be expanded to send email confirmations for resolved alerts.
        """
        logger.info(
            f"NotificationService: Alert {alert.id} status changed to {status}",
            extra={"alert_id": str(alert.id), "status": status}
        )
        if status != "resolved":
            return
            
        venue_repo = Repository[Venue](Venue)
        venue = await venue_repo.get_by_id(session, alert.venue_id)
        if not venue:
            return

        location_text = getattr(venue, 'location', None) or getattr(venue, 'address', None) or venue.name
        if alert.extra_data and alert.extra_data.get("camera_location"):
            location_text = alert.extra_data.get("camera_location")
            
        role_recipients = await self._resolve_recipients(session, alert.risk_level, alert.extra_data)
        if not role_recipients:
            return
        
        is_auto = alert.resolved_by is None
        actor = "Laminar AI System" if is_auto else "Operator"
        reason = alert.notes if alert.notes else "Risk levels decreased."
        label_color = "#16a34a" # Green for resolved
        
        all_emails = set()
        for emails in role_recipients.values():
            all_emails.update(emails)
            
        from app.models.user import User
        stmt_lang = select(User.email, User.language_preference).where(User.email.in_(all_emails))
        result_lang = await session.execute(stmt_lang)
        user_langs = {row[0]: row[1] or "en" for row in result_lang.all()}
        
        for role_label, emails in role_recipients.items():
            if not emails:
                continue
                
            emails_by_lang = {}
            for email in emails:
                lang = user_langs.get(email, "en")
                if lang not in emails_by_lang:
                    emails_by_lang[lang] = []
                emails_by_lang[lang].append(email)
            
            for lang, lang_emails in emails_by_lang.items():
                try:
                    html = (
                        f'<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;'
                        f'background:#f1f5f9;margin:0;padding:0;">'
                        f'<div style="background:{label_color};padding:24px 28px;color:white;">'
                        f'<div style="font-size:11px;opacity:.75;text-transform:uppercase;margin-bottom:4px;">'
                        f'Laminar AI &mdash; Alert Resolution</div>'
                        f'<h1 style="margin:0;font-size:22px;">✅ Incident Resolved</h1>'
                        f'<p style="margin:5px 0 0;opacity:.9;font-size:14px;">'
                        f'Venue: {venue.name}</p></div>'
                        f'<div style="padding:28px;background:#ffffff;">'
                        f'<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">'
                        f'The crowd alert at <strong>{location_text}</strong> has been successfully closed by <strong>{actor}</strong>.</p>'
                        f'<div style="margin-top:20px;padding:16px;background:#f8fafc;border-left:4px solid {label_color};">'
                        f'<div style="font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;margin-bottom:4px;">Resolution Notes</div>'
                        f'<div style="color:#0f172a;font-size:14px;">{reason}</div></div>'
                        f'<div style="margin-top:24px;">'
                        f'<a href="http://localhost:3000/alerts" style="display:inline-block;'
                        f'padding:12px 28px;background:{label_color};color:white;text-decoration:none;'
                        f'border-radius:6px;font-weight:bold;font-size:14px;">'
                        f'View Analytics Dashboard &rarr;</a></div>'
                        f'<hr style="border:1px solid #e5e7eb;margin:24px 0;"/>'
                        f'<p style="font-size:11px;color:#9ca3af;">Auto-generated by Laminar AI &mdash; '
                        f'sent to {role_label} contacts only.</p>'
                        f'</div></body></html>'
                    )
                    
                    msg = EmailMessage()
                    msg["From"] = settings.SMTP_USER
                    msg["Subject"] = f"[RESOLVED] Crowd Alert — {venue.name} [{role_label.upper()}]"
                    msg.add_alternative(html, subtype="html")
                    await self._send_email(msg, lang_emails)
                except Exception as e:
                    logger.error(f"Failed to send resolution notification: {e}")
                    
        # Send Offline SMS (using simulation mode typically, but routing logic counts)
        try:
            stmt = select(User.phone_number, User.language_preference).where(
                User.receive_sms_alerts == True,
                User.is_active == True,
                User.phone_number.isnot(None)
            )
            result = await session.execute(stmt)
            contacts = result.all()
            
            if contacts:
                lang_groups = {}
                for phone, lang in contacts:
                    lang = lang or "en"
                    if lang not in lang_groups:
                        lang_groups[lang] = []
                    lang_groups[lang].append(phone)
                    
                for lang, phone_numbers in lang_groups.items():
                    sms_msg = (
                        f"✅ ALERT RESOLVED ✅\n"
                        f"Venue: {venue.name}\n"
                        f"Loc: {location_text}\n"
                        f"Closed by: {actor}\n"
                        f"Notes: {reason}"
                    )
                    
                    async def _send_sms_resolve():
                        await self.sms_service.notify_recipients(phone_numbers, sms_msg)
                        
                    asyncio.create_task(_send_sms_resolve())
        except Exception as e:
            logger.error(f"Failed to trigger offline SMS resolution alerts: {e}")

    async def notify(
        self,
        session: AsyncSession,
        alert: CrowdAlert,
    ) -> None:
        """
        Send notification for alert if cooldown allows.
        Each role group (Management / Supervisors / Police) receives
        a SEPARATE email so coordinators only get relevant messages.
        """

        # Cooldown protection - Reduced from 300s to 10s for "fast" alerts
        if alert.last_notified_at:
            diff = datetime.now(timezone.utc) - alert.last_notified_at
            if diff.total_seconds() < 10:  # 10 seconds instead of 5 minutes
                logger.info(
                    "Notification skipped due to cooldown (10s)",
                    extra={"alert_id": str(alert.id)},
                )
                return

        venue_repo = Repository[Venue](Venue)
        venue = await venue_repo.get_by_id(session, alert.venue_id)

        if not venue:
            logger.warning(f"Venue not found for alert {alert.id}")
            return

        color = self.COLOR_MAP.get(alert.risk_level, "#16a34a")

        location_text = getattr(venue, 'location', None) or getattr(venue, 'address', None) or venue.name
        if alert.extra_data and alert.extra_data.get("camera_location"):
            location_text = alert.extra_data.get("camera_location")

        # Get per-role recipient groups
        role_recipients = await self._resolve_recipients(session, alert.risk_level, alert.extra_data)

        if not role_recipients:
            logger.warning("No email recipients configured for any role.")
            return

        # Fetch languages for all email recipients
        all_emails = set()
        for emails in role_recipients.values():
            all_emails.update(emails)
            
        from app.models.user import User
        stmt_lang = select(User.email, User.language_preference).where(User.email.in_(all_emails))
        result_lang = await session.execute(stmt_lang)
        user_langs = {row[0]: row[1] or "en" for row in result_lang.all()}

        # Fetch live crowd metrics for richer notification context
        live_metrics = await self._get_latest_metrics(session, alert.venue_id)

        # Fetch live crowd metrics for richer notification context
        live_metrics = await self._get_latest_metrics(session, alert.venue_id)

        # Get SMS recipient count for critical alerts
        sms_count = 0
        if alert.risk_level in ["critical", "high", "medium"]:
            stmt_sms = select(User.phone_number).where(
                User.receive_sms_alerts == True,
                User.is_active == True,
                User.phone_number.isnot(None)
            )
            result_sms = await session.execute(stmt_sms)
            sms_count = len(result_sms.all())

        sent_any = False
        for role_label, emails in role_recipients.items():
            if not emails:
                continue
                
            emails_by_lang = {}
            for email in emails:
                lang = user_langs.get(email, "en")
                if lang not in emails_by_lang:
                    emails_by_lang[lang] = []
                emails_by_lang[lang].append(email)
            
            for lang, lang_emails in emails_by_lang.items():
                try:
                    # Generate AI brief per language
                    ai_brief, ai_brief_is_llm = await self._generate_ai_brief(alert, venue, location_text, session, lang=lang)

                    message = self._build_email(
                        alert=alert,
                        venue=venue,
                        location_text=location_text,
                        color=color,
                        ai_brief=ai_brief,
                        ai_brief_is_llm=ai_brief_is_llm,
                        role_label=role_label,
                        sms_count=sms_count,
                        lang=lang,
                        live_metrics=live_metrics,
                    )
                    await self._send_email(message, lang_emails)
                    sent_any = True
                    logger.info(
                        f"Notification sent to {role_label} ({lang})",
                        extra={
                            "alert_id": str(alert.id),
                            "role": role_label,
                            "lang": lang,
                            "recipients": lang_emails,
                        },
                    )
                except Exception as e:
                    logger.warning(
                        f"Email to {role_label} ({lang}) failed",
                        extra={
                            "alert_id": str(alert.id),
                            "role": role_label,
                            "lang": lang,
                            "error": str(e),
                        },
                    )

        if sent_any:
            alert.last_notified_at = datetime.now(timezone.utc)
            await session.commit()

        # ==========================================================
        # 🔥 STEP: Offline SMS Alerts (Medium/High/Critical levels)
        # ==========================================================
        if alert.risk_level in ["medium", "high", "critical"]:
            await self._trigger_offline_sms(session, alert, venue, location_text, live_metrics)


    async def _resolve_recipients(self, session: AsyncSession, risk_level: str, extra_data: dict = None) -> dict[str, list[str]]:
        """
        Returns a dict mapping role label → recipient emails.
        Fetches static config emails and active profiles from the DB.
        """
        recipients: dict[str, list[str]] = {}

        mgmt = settings.get_management_emails()
        if mgmt:
            recipients["Management"] = mgmt.copy()

        sup = settings.get_supervisor_emails()
        if sup:
            recipients["Supervisor"] = sup.copy()

        pol = settings.get_police_emails()
        if pol:
            recipients["Police / Security"] = pol.copy()

        # Fetch dynamic DB users with receive_email_alerts=True
        try:
            from app.models.user import User, UserRole
            stmt = select(User.email, User.alert_email, User.role).where(
                User.receive_email_alerts == True,
                User.is_active == True
            )
            res = await session.execute(stmt)
            for email, alert_email, role in res.all():
                contact_email = alert_email if alert_email else email
                label = None
                role_val = getattr(role, 'value', role)
                if role_val in ("super_admin", "admin", "manager", "user"):
                    label = "Management"
                elif role_val == "operator":
                    label = "Supervisor"
                
                if label:
                    if label not in recipients:
                        recipients[label] = []
                    if contact_email not in recipients[label]:
                        recipients[label].append(contact_email)
        except Exception as e:
            logger.error(f"Failed to fetch profile emails for alerts: {e}")

        # Filter by alert scope/severity
        filtered: dict[str, list[str]] = {}
        filtered["Management"] = recipients.get("Management", [])

        extra = extra_data or {}
        is_camera_issue = extra.get("type") == "camera_issue"
        police_only = extra.get("requires_police_only") == True
        risk_level = (risk_level or "low").lower()
        
        if police_only:
            filtered.clear()
            if "Police / Security" in recipients:
                filtered["Police / Security"] = recipients["Police / Security"]
            return {k: v for k, v in filtered.items() if v}
        
        if is_camera_issue or risk_level in ["medium", "high", "critical"]:
            if "Supervisor" in recipients:
                filtered["Supervisor"] = recipients["Supervisor"]
            
        # Police receive both High and Critical for non-camera issues
        if not is_camera_issue and risk_level in ["high", "critical"]:
            if "Police / Security" in recipients:
                filtered["Police / Security"] = recipients["Police / Security"]

        return {k: v for k, v in filtered.items() if v}


    async def notify_realtime_event(
        self,
        session: AsyncSession,
        domain: str,
        type: str,
        priority: str,
        description: str,
        venue_id: str,
        venue_name: str,
        camera_id: str = None,
        metadata: dict = None,
        lang: str = "en"
    ) -> None:
        """
        Refined tactical notification trigger for Smart City events.
        Automatically captures evidence snapshots if camera_id is provided.
        """
        # Map tactical priority to risk_level
        risk_map = {
            "CRITICAL": "critical",
            "HIGH": "high",
            "MEDIUM": "medium",
            "LOW": "low"
        }
        risk_level = risk_map.get(priority.upper(), "low")

        # Get recipients
        role_recipients = await self._resolve_recipients(session, risk_level, metadata)
        if not role_recipients:
            return

        # Fetch venue for location context
        venue_repo = Repository[Venue](Venue)
        try:
            venue = await venue_repo.get_by_id(session, UUID(venue_id))
        except:
            venue = None

        if not venue:
            return

        location_text = getattr(venue, 'location', None) or getattr(venue, 'address', None) or venue_name
        if metadata and metadata.get("camera_location"):
            location_text = metadata.get("camera_location")

        # Build a temporary CrowdAlert for email builder
        # Add domain to extra_data so AI engine and email builder can see it
        temp_alert = CrowdAlert(
            venue_id=venue.id,
            risk_level=risk_level,
            explanation=description,
            status="open",
            extra_data={**(metadata or {}), "domain": domain, "type": type}
        )
        
        color = self.COLOR_MAP.get(risk_level, "#16a34a")

        # Fetch languages for all email recipients
        all_emails = set()
        for emails in role_recipients.values():
            all_emails.update(emails)
            
        from app.models.user import User
        stmt_lang = select(User.email, User.language_preference).where(User.email.in_(all_emails))
        result_lang = await session.execute(stmt_lang)
        user_langs = {row[0]: row[1] or "en" for row in result_lang.all()}

        for role_label, emails in role_recipients.items():
            if not emails:
                continue
                
            emails_by_lang = {}
            for email in emails:
                lang = user_langs.get(email, "en")
                emails_by_lang.setdefault(lang, []).append(email)
            
            for lang, lang_emails in emails_by_lang.items():
                try:
                    # Leverage rich insights from metadata for the AI Executive Brief
                    ai_brief = (metadata or {}).get("insight")
                    ai_brief_is_llm = True if ai_brief else False

                    message = self._build_email(
                        alert=temp_alert,
                        venue=venue,
                        location_text=location_text,
                        color=color,
                        ai_brief=ai_brief,
                        ai_brief_is_llm=ai_brief_is_llm,
                        role_label=role_label,
                        lang=lang,
                        live_metrics={**(metadata or {}), "domain": domain, "type": type}
                    )
                    # Subject is already set correctly inside _build_email — do NOT set it again here
                    # (EmailMessage["key"] = val APPENDS, not replaces — causes Gmail 550 duplicate Subject)

                    logger.info(f"Real-time {domain} notification sent to {role_label} ({lang})")
                    await self._send_email(message, lang_emails)
                    logger.info(f"Email dispatched to {role_label} ({len(lang_emails)} recipients)")
                except Exception as e:
                    logger.warning(f"Real-time email to {role_label} failed: {e}")

        # Trigger SMS for critical/high
        if risk_level in ["high", "critical"]:
            await self._trigger_offline_sms(session, temp_alert, venue, location_text, metadata)

    # ==========================================================
    # Offline SMS Alert Method
    # ==========================================================

    async def _trigger_offline_sms(self, session: AsyncSession, alert: CrowdAlert, venue: Venue, location_text: str, live_metrics: dict = None) -> None:
        """Fetch alert contacts from DB and dispatch SMS in background."""
        try:
            from app.models.user import User
            logger.info("Fetching registered SMS contacts from User accounts...")
            stmt = select(User.phone_number, User.language_preference).where(
                User.receive_sms_alerts == True,
                User.is_active == True,
                User.phone_number.isnot(None)
            )
            result = await session.execute(stmt)
            contacts = result.all()

            if not contacts:
                logger.warning("No User accounts found with receive_sms_alerts enabled and a configured phone number.")
                return

            live = live_metrics or {}
            severity = getattr(alert, 'severity', alert.risk_level.upper())
            escalation_prob = getattr(alert, 'escalation_probability', 0)
            prob_str = f"{int(escalation_prob * 100)}%" if escalation_prob else "0%"
            avg_count = live.get("avg_count", 0)
            growth_rate = live.get("growth_rate", 0)
            
            is_surge = False
            if alert.extra_data and "SURGE" in alert.extra_data.get("recommended_action", "").upper():
                is_surge = True
                
            # Group by language
            lang_groups = {}
            for phone, lang in contacts:
                lang = lang or "en"
                if lang not in lang_groups:
                    lang_groups[lang] = []
                lang_groups[lang].append(phone)
                
            logger.info(f"Dispatching SMS to {len(contacts)} contacts across {len(lang_groups)} languages.")

            for lang, phone_numbers in lang_groups.items():
                t = TranslationService.t
                alert_title = t(lang, "surge_alert") if is_surge else t(lang, "critical_alert")
                
                current_label = t(lang, "current_count", "Current")
                persons_label = t(lang, "persons", "persons")
                velocity_label = t(lang, "surge_velocity", "Velocity")
                escalation_label = t(lang, "escalation_risk", "Escalation Risk")

                sms_msg = (
                    f"\U0001f6a8 {alert_title} [{alert.risk_level.upper()}] \U0001f6a8\n"
                    f"{t(lang, 'venue', 'Venue')}: {venue.name}\n"
                    f"{t(lang, 'location', 'Location')}: {location_text}\n"
                    f"{current_label}: {int(avg_count)} {persons_label} | {velocity_label}: {growth_rate:+.1f}%/min\n"
                    f"{t(lang, 'severity', 'Severity')}: {severity} | {escalation_label}: {prob_str}\n"
                    f"{t(lang, 'time', 'Time')}: {datetime.now(timezone.utc).strftime('%H:%M UTC')}\n"
                    f"{t(lang, 'action_required', 'Action Required')}"
                )

                async def _send_and_log():
                    result = await self.sms_service.notify_recipients(phone_numbers, sms_msg)
                    logger.info(
                        f"SMS broadcast complete",
                        extra={
                            "sent": result.get('sent', 0),
                            "failed": result.get('failed', 0),
                            "mode": result.get('mode', 'unknown'),
                            "alert_id": str(alert.id),
                        }
                    )

                asyncio.create_task(_send_and_log())

        except Exception as e:
            logger.error(f"Failed to trigger offline SMS alerts: {e}")

    # ==========================================================
    # Live Metrics Fetcher
    # ==========================================================

    async def _get_latest_metrics(self, session: AsyncSession, venue_id) -> dict:
        """Fetch the latest crowd metric data to enrich notification content."""
        try:
            from uuid import UUID as _UUID
            from app.models.crowd_metric import CrowdMetric
            from sqlalchemy import desc
            stmt = (
                select(CrowdMetric)
                .where(CrowdMetric.venue_id == venue_id)
                .where(CrowdMetric.bucket_type == "minute")
                .order_by(desc(CrowdMetric.bucket_start))
                .limit(1)
            )
            result = await session.execute(stmt)
            metric = result.scalar_one_or_none()
            if metric:
                return {
                    "avg_count": float(metric.avg_count or 0),
                    "max_count": float(metric.max_count or 0),
                    "occupancy_percent": float(metric.occupancy_percent or 0),
                    "growth_rate": float(metric.growth_rate_percent or 0),
                    "risk_level": metric.risk_level or "unknown",
                    "dynamic_risk_score": float(metric.dynamic_risk_score or 0),
                    "bucket_start": metric.bucket_start.strftime("%H:%M UTC") if metric.bucket_start else "—",
                }
        except Exception as e:
            logger.warning(f"Failed to fetch latest metrics for notification: {e}")
        return {}

    # ==========================================================
    # AI Executive Brief Generator (Ollama + Rule-Based Fallback)
    # ==========================================================

    # Preferred model order — auto-detected from installed Ollama models
    _PREFERRED_MODELS = ["llama3.2", "llama3", "mistral", "phi3", "phi", "gemma", "deepseek-coder"]
    _ollama_model_cache: str = ""

    async def _detect_ollama_model(self) -> str:
        """Auto-detect the best available Ollama model. Returns empty string if Ollama unreachable."""
        if self._ollama_model_cache:
            return self._ollama_model_cache
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get("http://localhost:11434/api/tags")
                if resp.status_code == 200:
                    installed = [m["name"].split(":")[0] for m in resp.json().get("models", [])]
                    for preferred in self._PREFERRED_MODELS:
                        if preferred in installed:
                            logger.info(f"Ollama model auto-selected: {preferred}")
                            type(self)._ollama_model_cache = preferred
                            return preferred
                    if installed:
                        # Fall back to first available
                        type(self)._ollama_model_cache = installed[0]
                        logger.info(f"Ollama fallback model selected: {installed[0]}")
                        return installed[0]
        except Exception as e:
            logger.warning(f"Ollama not reachable during model detection: {e}")
        return ""

    def _rule_based_brief(self, alert: CrowdAlert, venue: Venue, location_text: str, lang: str = "en") -> str:
        """
        Generate a professional situation brief from alert data.
        Optimized to handle low-data states gracefully.
        """
        t = TranslationService.t
        risk = alert.risk_level.upper()
        severity = getattr(alert, 'severity', 'N/A')
        escalation_prob = getattr(alert, 'escalation_probability', 0)
        predicted_level = getattr(alert, 'predicted_level', None)
        prob_pct = f"{int(escalation_prob * 100)}%" if escalation_prob else t(lang, "unknown", "unknown")

        action_map = {
            "critical": t(lang, "critical_action", "Immediate management intervention and security response deployment required."),
            "high": t(lang, "high_action", "Supervisors should activate crowd-control protocols and verify sensor data."),
            "medium": t(lang, "medium_action", "Monitor closely and prepare contingency staff for deployment."),
            "low": t(lang, "low_action", "Situation is developing — continue standard monitoring and maintain readiness."),
        }
        action = action_map.get(alert.risk_level.lower(), t(lang, "default_action", "Examine dashboard for tactical details."))

        trajectory = ""
        if predicted_level and escalation_prob:
            traj_text = t(lang, "trajectory_prediction", "AI engine predicts escalation to {level} with {prob} probability.")
            trajectory = " " + traj_text.format(level=predicted_level.upper(), prob=prob_pct)

        staffing_cfg = getattr(venue, "staffing_config", {}) or {}
        required_staff_val = staffing_cfg.get(alert.risk_level.lower())
        
        if not required_staff_val:
            capacity = getattr(venue, 'capacity', None)
            if capacity:
                warn = getattr(venue, 'warning_threshold', None) or int(capacity * 0.70)
                crit = getattr(venue, 'critical_threshold', None) or int(capacity * 0.90)
                if alert.risk_level.lower() in ['critical', 'high']:
                    required_staff_val = str(max(5, crit // 40))
                elif alert.risk_level.lower() == 'medium':
                    required_staff_val = str(max(3, warn // 60))
                else:
                    required_staff_val = str(max(1, capacity // 100))
            else:
                required_staff_val = t(lang, "dynamic", "Dynamic Deployment")
        
        # Determine if data is sparse (e.g. initial alert or low ingest)
        data_state_note = ""
        if alert.extra_data and alert.extra_data.get("count", 0) == 0 and "incident" not in alert.extra_data.get("domain", ""):
            data_state_note = t(lang, "sparse_data_note", " [SYSTEM READY - STANDING BY FOR DATA]")

        brief_fmt = t(lang, "brief_format", "A {risk} {domain} risk detected at {venue} near {location}.{trajectory} {action} Recommended Staffing: {staff}{note}")
        
        domain_label = alert.extra_data.get("domain", "crowd").title() if alert.extra_data else "Crowd"

        return brief_fmt.format(
            risk=risk,
            domain=domain_label,
            venue=venue.name,
            location=location_text,
            trajectory=trajectory,
            action=action,
            staff=required_staff_val,
            note=data_state_note
        )

    async def _generate_ai_brief(self, alert: CrowdAlert, venue: Venue, location_text: str, session: AsyncSession = None, lang: str = "en") -> tuple[str, bool]:
        """
        Generate a full AI intelligence brief using the Laminar Intelligence Engine.
        Returns (brief_text, is_ai_generated).
        """
        try:
            from app.services.laminar_intelligence_service import laminar_intelligence
            brief = await laminar_intelligence.generate_notification_brief(
                session=session,
                alert=alert,
                venue_name=venue.name,
                location=location_text,
                lang=lang
            )
            is_llm = laminar_intelligence._ollama_online
            return brief, is_llm
        except Exception as e:
            logger.warning(f"Intelligence engine brief failed ({e}) — using rule-based brief.")
            return self._rule_based_brief(alert, venue, location_text, lang=lang), False

    # ==========================================================
    # Enhanced email builder with all context
    # ==========================================================

    def _build_email(
        self,
        alert: CrowdAlert,
        venue: Venue,
        location_text: str,
        color: str,
        ai_brief: str = "",
        ai_brief_is_llm: bool = False,
        role_label: str = "Management",
        sms_count: int = 0,
        lang: str = "en",
        live_metrics: dict = None,
    ) -> EmailMessage:

        msg = EmailMessage()
        msg["From"] = settings.SMTP_USER
        t = TranslationService.t
        live = live_metrics or {}

        # Enhanced subject line showing target role
        subject_prefix = alert.risk_level.upper()
        if hasattr(alert, 'early_warning_triggered') and alert.early_warning_triggered:
            predicted = getattr(alert, 'predicted_level', 'unknown')
            subject_prefix = f"PREDICTED {predicted.upper()}"

        # Domain-aware Iconography & Labels
        extra = alert.extra_data or {}
        domain = extra.get("domain", "crowd")
        icon = {"parking": "🅿️", "traffic": "🚗", "incident": "🚨", "crowd": "👥"}.get(domain, "🔔")
        
        # Protective Labels (Ensure crowd remains "Crowd Alert" and "occupancy")
        if domain == "crowd":
            domain_label = t(lang, 'email_subject_prefix', 'Crowd Alert')
            count_label = t(lang, 'persons', 'persons')
            occupancy_term = t(lang, 'occupancy', 'occupancy')
        else:
            domain_label = {"parking": "Smart Parking", "traffic": "Traffic Flow", "incident": "Tactical Incident"}.get(domain, "System Alert")
            count_label = {"parking": "Vehicles", "traffic": "Vehicles", "incident": "Units"}.get(domain, "Count")
            occupancy_term = f"{domain} saturation"

        # Translate role label if possible
        role_key = "role_management" if "Management" in role_label else "role_police" if "Police" in role_label else None
        display_role = t(lang, role_key, role_label) if role_key else role_label

        # Set Subject
        if alert.extra_data and alert.extra_data.get("type") == "camera_issue":
            issue_label = alert.extra_data.get("issue_label", "Camera Issue")
            cam_name = alert.extra_data.get("camera_name", "Unknown Camera")
            msg["Subject"] = f"[CAMERA ALERT] {issue_label} — {cam_name} [{display_role.upper()}]"
        else:
            msg["Subject"] = f"[{subject_prefix}] {icon} {domain_label} — {venue.name} [{display_role.upper()}]"

        msg.set_content("This email requires HTML support.")

        # ── Read prediction data (from extra_data first, then DB columns) ──
        extra = alert.extra_data or {}
        predicted_level = extra.get("predicted_level") or getattr(alert, 'predicted_level', None)
        predicted_score = extra.get("predicted_risk_score") or getattr(alert, 'predicted_risk_score', None)
        escalation_probability = extra.get("escalation_probability") or getattr(alert, 'escalation_probability', 0.0) or 0.0
        early_warning = getattr(alert, 'early_warning_triggered', False)
        police_required = extra.get("requires_police", False)

        # ── Venue capacity context (from admin config) ──
        capacity = getattr(venue, 'capacity', None)
        warning_threshold = getattr(venue, 'warning_threshold', None)
        critical_threshold = getattr(venue, 'critical_threshold', None)
        staffing_cfg = getattr(venue, "staffing_config", {}) or {}
        required_staff = staffing_cfg.get(alert.risk_level.lower())
        if not required_staff:
            if capacity:
                _crit = critical_threshold or int(capacity * 0.9)
                _warn = warning_threshold or int(capacity * 0.7)
                if alert.risk_level.lower() in ['critical', 'high']:
                    required_staff = str(max(5, _crit // 40))
                elif alert.risk_level.lower() == 'medium':
                    required_staff = str(max(3, _warn // 60))
                else:
                    required_staff = str(max(1, int(capacity // 100)))
            else:
                required_staff = t(lang, "dynamic", "Dynamic Deployment")

        # ── Metric Mapping (Bridge domain-specific keys to standard variables) ──
        if domain == "traffic":
            avg_count     = extra.get("vehicle_count") or extra.get("count") or live.get("avg_count", 0)
            max_count     = extra.get("vehicle_count") or extra.get("max_count", 0)
            risk_score    = extra.get("risk_score") or live.get("dynamic_risk_score", 0)
            growth_rate   = extra.get("velocity") or live.get("growth_rate", 0.0)
            if capacity and avg_count:
                occupancy_pct = min(100, (avg_count / capacity) * 100)
        elif domain == "parking":
            avg_count     = extra.get("occupancy") or live.get("avg_count", 0)
            max_count     = extra.get("occupancy") or live.get("max_count", 0)
            risk_score    = extra.get("risk_score") or live.get("dynamic_risk_score", 0)
            if capacity and avg_count:
                occupancy_pct = min(100, (avg_count / capacity) * 100)
        else:
            avg_count     = live.get("avg_count", 0)
            max_count     = live.get("max_count", 0)
            occupancy_pct = live.get("occupancy_percent", 0)
            growth_rate   = live.get("growth_rate") or extra.get("velocity", 0.0)
            risk_score    = live.get("dynamic_risk_score", 0)

        metric_time = live.get("bucket_start") or datetime.now().strftime("%H:%M")

        # ── Alert Context / Explanation ──
        explanation_html = ""
        if getattr(alert, "explanation", None):
            expl_label = t(lang, "alert_explanation", "Risk Engine Explanation")
            explanation_html = f"""
            <div style="background:#f8fafc; border-left:4px solid #94a3b8; padding:12px; margin-bottom:18px; font-size:14px; color:#334155;">
                <div style="font-size:11px; text-transform:uppercase; font-weight:bold; color:#64748b; margin-bottom:4px;">💡 {expl_label}</div>
                {alert.explanation}
            </div>
            """

        # ── Derive surge velocity label relative to venue thresholds ──
        # A surge is significant if it would cross a threshold within 10 minutes
        surge_threshold = (warning_threshold * 0.1) if warning_threshold else (capacity * 0.05 if capacity else 10.0)
        
        rapid_label = t(lang, "rapid", "RAPID")
        rising_label = t(lang, "rising", "RISING")
        falling_label = t(lang, "falling", "FALLING")
        stable_label = t(lang, "stable", "STABLE")

        surge_unit = "px/s" if domain == "traffic" else "%/min"
        surge_block = ""
        if growth_rate > (surge_threshold * 2):
            surge_label = f"🔴 {rapid_label} (+{growth_rate:.1f}{surge_unit})"
            surge_block = f"""
            <div style="background:#b91c1c; padding:15px; color:white; margin-bottom:20px; border-radius:4px; font-weight:bold; font-size:16px; border:2px solid #fecaca; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                📈 <strong>{t(lang, 'surge_monitor_alert', 'SURGE MONITOR ALERT')}</strong>: {t(lang, 'rapid_growth_detected', 'Rapid growth/flow detected at')} {growth_rate:.1f}{surge_unit}.
            </div>
            """
        elif growth_rate > surge_threshold:
            surge_label = f"🟠 {rising_label} (+{growth_rate:.1f}{surge_unit})"
            surge_block = f"""
            <div style="background:#ea580c; padding:15px; color:white; margin-bottom:20px; border-radius:4px; font-weight:bold; border:1px solid #fed7aa; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                📈 <strong>{t(lang, 'surge_monitor_warning', 'SURGE MONITOR WARNING')}</strong>: {t(lang, 'steady_growth_detected', 'Steady growth/flow identified at')} {growth_rate:.1f}{surge_unit}.
            </div>
            """
        elif growth_rate < -surge_threshold:
            surge_label = f"🟢 {falling_label} ({growth_rate:.1f}{surge_unit})"
        else:
            surge_label = f"🟡 {stable_label} ({growth_rate:+.1f}{surge_unit})"

        # ── Venue threshold display ──
        capacity_display = f"{capacity} {count_label}" if capacity else t(lang, "not_configured", "Not configured")
        if warning_threshold and critical_threshold:
            threshold_display = f"{t(lang, 'warning', 'Warning')} ≥ {warning_threshold} | {t(lang, 'critical', 'Critical')} ≥ {critical_threshold} {count_label}"
        elif warning_threshold:
            threshold_display = f"{t(lang, 'warning', 'Warning')} ≥ {warning_threshold} {count_label} | {t(lang, 'critical', 'Critical')}: {t(lang, 'not_configured', 'Not configured')}"
        else:
            threshold_display = t(lang, "thresholds_not_set", "Thresholds not configured — edit Venue Settings to set limits.")

        # ── Occupancy fill bar (relative to venue limits) ──
        occ_pct_clamped = min(100, max(0, int(occupancy_pct)))
        
        # Color based on absolute counts vs thresholds
        if avg_count >= (critical_threshold or (capacity * 0.85 if capacity else 999)):
            occ_bar_color = "#dc2626" # red
        elif avg_count >= (warning_threshold or (capacity * 0.60 if capacity else 999)):
            occ_bar_color = "#f97316" # orange/high
        else:
            occ_bar_color = "#16a34a" # green/low

        occupancy_bar = ""
        if domain != "incident":
            occupancy_bar = f"""
            <div style="margin:10px 0; background:#374151; border-radius:4px; height:14px; overflow:hidden;">
                <div style="width:{occ_pct_clamped}%; height:100%; background:{occ_bar_color}; transition:width 0.3s;"></div>
            </div>
            <div style="font-size:11px; color:#9ca3af; margin-top:2px;">{occ_pct_clamped}% {occupancy_term} — {int(avg_count)} of {capacity or '?'} {count_label.lower()}</div>
            """

        # ── Prediction block ──
        if predicted_level is not None and predicted_score is not None:
            esc_pct = int(escalation_probability * 100) if escalation_probability else 0
            pred_color = {"critical": "#dc2626", "high": "#f97316", "medium": "#eab308", "low": "#16a34a"}.get(str(predicted_level).lower(), "#6b7280")
            prediction_block = f"""
            <div style="background:#0f172a; border:1px solid {pred_color}; border-radius:8px; padding:14px; margin:10px 0;">
                <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">🔮 {t(lang, "prediction_intel", "Prediction Intelligence")} (next 15 min)</div>
                <table width="100%" style="color:#e2e8f0; font-size:13px;">
                    <tr><td>{t(lang, "predicted_level", "Predicted Level")}</td><td style="text-align:right; color:{pred_color}; font-weight:bold;">{str(predicted_level).upper()}</td></tr>
                    <tr><td>{t(lang, "predicted_score", "Predicted Risk Score")}</td><td style="text-align:right;">{predicted_score:.1f}/100</td></tr>
                    <tr><td>{t(lang, "escalation_prob", "Escalation Probability")}</td><td style="text-align:right;">{esc_pct}%</td></tr>
                </table>
            </div>
            """
        else:
            prediction_block = f"""
            <div style="background:#1f2937; border:1px solid #374151; border-radius:8px; padding:14px; margin:10px 0;">
                <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">🔮 {t(lang, "prediction_intel", "Prediction Intelligence")}</div>
                <p style="color:#9ca3af; font-size:12px; margin:0;">{t(lang, "prediction_gathering", "Gathering baseline data — predictions will be available soon.")}</p>
            </div>
            """

        # ── Event/holiday/weather banners ──
        event_text = ""
        if extra.get("event_type"):
            event_text = f"<p><strong>Event:</strong> {extra['event_type']}</p>"

        holiday_html = ""
        if extra.get("holiday_context"):
            holiday = extra["holiday_context"]
            holiday_html = f"""
            <div style="background:#1e3a8a; padding:10px; color:white; margin-bottom:15px;">
                📅 {t(lang, "today_is", "Today is")} {holiday.get('name')} ({holiday.get('type')} {t(lang, "holiday", "Holiday")}). {t(lang, "holiday_note", "Crowd activity may be higher than usual.")}
            </div>
            """

        weather_html = ""
        if extra.get("weather_context"):
            weather = extra["weather_context"]
            condition = weather.get("condition", "unknown").replace("_", " ").title()
            temp = weather.get("temperature", "N/A")
            weather_html = f"""
            <div style="background:#0ea5e9; padding:10px; color:white; margin-bottom:15px;">
                <strong>🌦 Weather:</strong> {condition} &nbsp; <strong>🌡 Temperature:</strong> {temp}°C
            </div>
            """

        early_warning_block = ""
        if early_warning:
            early_warning_block = f"""
            <div style="background:#7c3aed; padding:15px; color:white; margin-bottom:20px;">
                <strong>🔮 {t(lang, "early_warning_label", "EARLY WARNING")}:</strong> {t(lang, "early_warning_desc", "System predicts escalation to")}
                <strong>{(predicted_level or 'UNKNOWN').upper()}</strong> {t(lang, "within_minutes", "within next few minutes")}.<br/>
                {t(lang, "escalation_prob", "Escalation Probability")}: {int(escalation_probability * 100) if escalation_probability else 0}%
            </div>
            """

        police_block = ""
        if police_required:
            police_label = t(lang, "police_escalation_label", "POLICE ESCALATION REQUIRED")
            police_block = f"""<div style="background:#000; color:white; padding:10px; margin-bottom:20px;">🚔 {police_label}</div>"""

        tactical_info = ""
        if domain == "traffic":
            # ── Traffic-specific telemetry block ──────────────────────────────
            trf_vehicles   = extra.get("vehicle_count") or live.get("avg_count", 0)
            trf_speed      = extra.get("flow_speed") or live.get("flow_speed", 0.0)
            trf_wait       = extra.get("wait_time") or live.get("wait_time", 0.0)
            trf_congestion = extra.get("congestion_level") or extra.get("density", "-")
            trf_risk       = extra.get("risk_score") or live.get("dynamic_risk_score", 0)
            trf_insight    = extra.get("insight", "")
            trf_rec        = extra.get("recommendation", "")
            flow_label     = "Stalled" if trf_speed < 5 else "Slow Crawl" if trf_speed < 20 else "Moderate" if trf_speed < 60 else "Fast"
            trf_color_map  = {"Critical": "#dc2626", "High": "#f97316", "Medium": "#eab308", "Low": "#16a34a"}
            cong_color     = trf_color_map.get(trf_congestion, "#94a3b8")
            risk_pct       = min(100, max(0, int(trf_risk)))
            risk_bar_color = "#dc2626" if risk_pct > 70 else "#f97316" if risk_pct > 40 else "#16a34a"
            if trf_congestion in ("Critical", "High"):
                ops_text = (
                    f"At {int(trf_vehicles)} vehicles with {float(trf_wait):.1f} min average wait and "
                    f"{flow_label.lower()} flow ({float(trf_speed):.1f} px/s), this corridor is operating "
                    f"beyond safe throughput capacity. Immediate signal override and marshal deployment are required."
                )
            elif trf_congestion == "Medium":
                ops_text = (
                    f"{int(trf_vehicles)} vehicles are moving at {float(trf_speed):.1f} px/s with a "
                    f"{float(trf_wait):.1f} min wait estimate. Load balancing is advised — extend green phase "
                    f"by 10–15 s on primary corridors and activate alternate route signage."
                )
            else:
                ops_text = (
                    f"Traffic is flowing normally: {int(trf_vehicles)} vehicles at {float(trf_speed):.1f} px/s. "
                    f"No immediate intervention required. Continue standard monitoring cadence."
                )
            insight_html = ""
            if trf_insight:
                insight_html += f'<div style="background:#0f172a;border-left:4px solid {cong_color};padding:14px;border-radius:6px;margin-top:14px;"><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:700;letter-spacing:1px;margin-bottom:6px;">&#129504; AI Insight</div><p style="color:#e2e8f0;margin:0;font-size:13px;line-height:1.55;">{trf_insight}</p></div>'
            if trf_rec:
                insight_html += f'<div style="background:#172554;border-left:4px solid #3b82f6;padding:14px;border-radius:6px;margin-top:10px;"><div style="font-size:10px;color:#93c5fd;text-transform:uppercase;font-weight:700;letter-spacing:1px;margin-bottom:6px;">&#128203; Recommendation</div><p style="color:#e2e8f0;margin:0;font-size:13px;line-height:1.55;">{trf_rec}</p></div>'
            tactical_info = f"""
            <div style="background:#1f2937; padding:18px; color:#f3f4f6; margin-bottom:16px; font-size:14px; border-radius:8px; border-left:4px solid #f59e0b;">
                <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:#f59e0b; letter-spacing:1px; margin-bottom:12px;">&#128663; Traffic Telemetry</div>
                <table width="100%" style="border-collapse:collapse; color:#e2e8f0; font-size:13px;">
                  <tr><td style="padding:6px 0; border-bottom:1px solid #374151;">&#128205; Location</td><td style="text-align:right; font-weight:600; border-bottom:1px solid #374151;">{location_text}</td></tr>
                  <tr><td style="padding:6px 0; border-bottom:1px solid #374151;">&#128336; Timestamp</td><td style="text-align:right; border-bottom:1px solid #374151;">{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</td></tr>
                  <tr><td style="padding:6px 0; border-bottom:1px solid #374151;">&#128663; Vehicles Detected</td><td style="text-align:right; font-weight:800; font-size:16px; border-bottom:1px solid #374151;">{int(trf_vehicles)}</td></tr>
                  <tr><td style="padding:6px 0; border-bottom:1px solid #374151;">&#127937; Congestion Level</td><td style="text-align:right; font-weight:700; color:{cong_color}; border-bottom:1px solid #374151;">{trf_congestion}</td></tr>
                  <tr><td style="padding:6px 0; border-bottom:1px solid #374151;">&#9889; Flow Speed</td><td style="text-align:right; border-bottom:1px solid #374151;">{float(trf_speed):.1f} px/s &nbsp;({flow_label})</td></tr>
                  <tr><td style="padding:6px 0; border-bottom:1px solid #374151;">&#9201; Est. Wait Time</td><td style="text-align:right; font-weight:700; border-bottom:1px solid #374151;">{float(trf_wait):.1f} min</td></tr>
                  <tr><td style="padding:6px 0;">&#127919; Risk Score</td><td style="text-align:right; font-weight:800; color:{cong_color};">{risk_pct}%</td></tr>
                </table>
                <div style="margin-top:10px; background:#111827; border-radius:4px; height:8px; overflow:hidden;">
                  <div style="width:{risk_pct}%; height:100%; background:{risk_bar_color}; border-radius:4px;"></div>
                </div>
                <div style="font-size:10px; color:#6b7280; margin-top:4px; text-align:right;">{risk_pct}% risk index</div>
            </div>
            <div style="background:#0d1117; border:1px solid #21262d; border-radius:8px; padding:16px; margin-bottom:20px;">
                <div style="font-size:10px; color:#7d8590; text-transform:uppercase; font-weight:700; letter-spacing:1px; margin-bottom:8px;">&#9881;&#65039; What This Means For Operations</div>
                <p style="color:#c9d1d9; margin:0; font-size:13px; line-height:1.6;">{ops_text}</p>
                {insight_html}
            </div>
            """
        elif domain == "incident":
            lat = extra.get("latitude")
            lng = extra.get("longitude")
            coords_html = f"🌐 <strong>Coordinates:</strong> {float(lat):.4f}, {float(lng):.4f}<br/>" if lat and lng else ""
            
            tactical_info = f"""
            <div style="background:#1f2937; padding:15px; color:#f3f4f6; margin-bottom:20px; font-size:14px; border-radius:4px;">
                <div style="margin-bottom:8px; color:#cbd5e1;">
                    📍 <strong>Location:</strong> {location_text}<br/>
                    {coords_html}
                    🕒 <strong>Timestamp:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}<br/>
                    🚨 <strong>Classification:</strong> {extra.get('type', 'Standard Alert').replace('_', ' ').title()}<br/>
                    🚗 <strong>Vehicles Involved:</strong> {extra.get('vehicle_count', 'N/A')}
                </div>
            </div>
            """
        elif domain == "parking":
            tactical_info = f"""
            <div style="background:#1f2937; padding:15px; color:#f3f4f6; margin-bottom:20px; font-size:14px; border-radius:4px;">
                <div style="margin-bottom:8px; color:#cbd5e1;">
                    📍 <strong>Location:</strong> {location_text}<br/>
                    🕒 <strong>Timestamp:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}<br/>
                    🚨 <strong>Classification:</strong> {extra.get('type', 'Standard Alert').replace('_', ' ').title()}<br/>
                    📊 <strong>Capacity Reached:</strong> {extra.get('occupancy', 'N/A')} vehicles detected
                </div>
            </div>
            """

        # ── AI Brief/Insights block ──
        ai_brief_block = ""
        if ai_brief:
            ai_brief_html = str(ai_brief).replace("\n", "<br/>")
            brief_label = f"🤖 {t(lang, 'ai_brief_label', 'AI Executive Brief')}" if ai_brief_is_llm else f"📋 {t(lang, 'system_brief', 'System Brief')}"
            border_color = "#3b82f6" if ai_brief_is_llm else "#f59e0b"
            source_note = f"{t(lang, 'generated_by_label', 'Generated by')} {t(lang, 'source_local_llm', 'Local LLM')}" if ai_brief_is_llm else t(lang, "system_brief", "System Generated Brief")
            
            ai_brief_block = f"""
            <div style="background:#1f2937; border-left:5px solid {border_color}; padding:15px; color:#f3f4f6; margin-bottom:20px; font-size:15px; line-height:1.5; border-radius:4px;">
                <div style="font-size:12px; color:#93c5fd; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">{brief_label}</div>
                <div style="font-style: italic;">{ai_brief_html}</div>
                <div style="font-size:10px; color:#6b7280; margin-top:8px;">{source_note}</div>
            </div>
            """

        sms_block = ""
        if sms_count > 0:
            sms_fmt = t(lang, "sms_dispatched_label", "SMS dispatched to {count} critical contacts")
            sms_block = f"""<div style="background:#4b5563; padding:10px; color:white; margin-bottom:15px; font-weight:bold; border-radius:4px;">📱 {sms_fmt.format(count=sms_count)}</div>"""

        # ── Evidence ──
        snapshot_block = ""
        clip_block = ""
        snapshot_path = extra.get("snapshot_path")
        clip_path = extra.get("clip_path")
        if snapshot_path:
            snapshot_label = t(lang, "snapshot_label", "Alert Snapshot")
            snapshot_block = f"""
            <div style="margin-top:20px; padding:14px; background:#0f172a; border-radius:8px;">
                <div style="font-size:12px; color:#94a3b8; text-transform:uppercase; font-weight:bold; margin-bottom:10px;">📸 {snapshot_label}</div>
                <img src="cid:alert_snapshot" alt="Alert Snapshot" style="max-width:100%; border-radius:6px; border:2px solid {color};"/>
            </div>
            """
        if clip_path:
            clip_name = os.path.basename(clip_path)
            clip_label = t(lang, "clip_saved_label", "10-Second Clip Saved")
            clip_block = f"""
            <div style="margin-top:12px; padding:10px; background:#1e293b; border-radius:6px; color:#e2e8f0; font-size:14px;">
                📹 <strong>{clip_label}:</strong> {clip_name}
            </div>
            """

        # Define Gradient and Theme based on domain
        gradients = {
            "crowd": "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",      # Indigo to Violet
            "parking": "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",    # Sky to Blue
            "traffic": "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",    # Amber to Yellow
            "incident": "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)"    # Red to Dark Red
        }
        header_bg = gradients.get(domain, color)
        maps_link = f"https://www.google.com/maps/search/?api=1&query={venue.latitude},{venue.longitude}"
        domain_label = domain.upper() if domain else "ALERT"
        subject_prefix = alert.risk_level.upper()
        icon = "🚨" if domain == "incident" else "📊"

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; line-height: 1.6; }}
            .container {{ max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }}
            .header {{ background: {header_bg}; padding: 32px 24px; color: #ffffff; position: relative; }}
            .header h1 {{ margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }}
            .header p {{ margin: 8px 0 0; font-size: 14px; opacity: 0.9; font-weight: 500; }}
            .content {{ padding: 24px; }}
            .card {{ background: #fdfdfd; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }}
            .ai-brief {{ background: #0f172a; border-radius: 12px; padding: 20px; color: #f1f5f9; position: relative; border-left: 4px solid #3b82f6; }}
            .ai-brief h2 {{ margin: 0 0 12px; font-size: 11px; text-transform: uppercase; color: #3b82f6; letter-spacing: 1px; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }}
            .badge-risk {{ background: #fee2e2; color: #991b1b; }}
            .stat-table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
            .stat-table td {{ padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }}
            .stat-table td:last-child {{ text-align: right; font-weight: 600; color: #0f172a; }}
            .btn-primary {{ display: inline-block; padding: 12px 24px; background: #0f172a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 10px; }}
            .btn-maps {{ display: inline-block; margin-top: 8px; font-size: 13px; color: #3b82f6; text-decoration: none; font-weight: 500; }}
            .footer {{ background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }}
            .progress-bg {{ background: #e2e8f0; height: 8px; border-radius: 4px; margin: 10px 0; overflow: hidden; }}
            .progress-fill {{ background: {color}; height: 100%; border-radius: 4px; }}
          </style>
        </head>
        <body>
          <div class="container">
            <!-- Premium Header -->
            <div class="header">
              <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 8px; letter-spacing: 1px; opacity: 0.8;">Laminar Tactical Network</div>
              <h1>{icon} {subject_prefix} — {domain_label}</h1>
              <p>📍 {venue.name} &nbsp;|&nbsp; {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}</p>
            </div>

            <div class="content">
              {tactical_info}
              {ai_brief_block}

              {explanation_html}
              {early_warning_block}
              {police_block}
              {surge_block}

              <!-- Tactical Telemetry Card -->
              <div class="card">
                <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 15px; display: flex; justify-content: space-between;">
                  <span>📡 Tactical Telemetry</span>
                  <span style="font-weight: 400; color: #94a3b8;">As of {metric_time}</span>
                </div>
                
                {occupancy_bar}
                
                <table class="stat-table">
                  <tr>
                    <td>Current {count_label}</td>
                    <td>{int(avg_count)}</td>
                  </tr>
                  <tr>
                    <td>{t(lang, "peak_count", "Peak Recorded")}</td>
                    <td>{int(max_count)}</td>
                  </tr>
                  <tr>
                    <td>{t(lang, "surge_velocity", "Flow Speed/Growth")}</td>
                    <td>{surge_label}</td>
                  </tr>
                  <tr>
                    <td>{t(lang, "risk_score", "Neural Risk Score")}</td>
                    <td style="color: {color}!important;">{risk_score:.1f} / 100</td>
                  </tr>
                </table>
              </div>

              <!-- Venue Infrastructure -->
              <div class="card">
                <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px;">🏟 Infrastructure & Staffing</div>
                <table class="stat-table">
                  <tr>
                    <td>{t(lang, "capacity_label", "Design Capacity")}</td>
                    <td>{capacity_display}</td>
                  </tr>
                   <tr>
                    <td>{t(lang, "staffing_label", "Deployment Requirement")}</td>
                    <td style="color: #2563eb!important;">{required_staff}</td>
                  </tr>
                  <tr>
                    <td>{t(lang, "thresholds_label", "Response Thresholds")}</td>
                    <td style="font-size: 12px;">{threshold_display}</td>
                  </tr>
                  <tr>
                    <td>Location</td>
                    <td>
                      <a href="{maps_link}" class="btn-maps">View on Fleet Map ↗</a>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Prediction Intel -->
              {prediction_block}

              <!-- Evidence -->
              {snapshot_block}
              {clip_block}

              <div style="text-align: center; margin-top: 30px;">
                <a href="http://localhost:3000" class="btn-primary">{t(lang, 'view_dashboard', 'Open Command Center')}</a>
              </div>
            </div>

            <div class="footer">
              <p>INTERNAL USE ONLY — Laminar Tactical Network Protocol</p>
              <p>&copy; {datetime.now().year} Laminar Intelligence. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
        """

        # Build multipart email to support inline image
        if snapshot_path and os.path.isfile(snapshot_path):
            outer = MIMEMultipart("related")
            outer["From"]    = msg["From"]
            outer["Subject"] = msg["Subject"]

            alt = MIMEMultipart("alternative")
            alt.attach(MIMEText("This email requires HTML support.", "plain"))
            alt.attach(MIMEText(html_content, "html"))
            outer.attach(alt)

            try:
                with open(snapshot_path, "rb") as img_file:
                    img_data = img_file.read()
                img_part = MIMEImage(img_data, _subtype="jpeg")
                img_part.add_header("Content-ID", "<alert_snapshot>")
                img_part.add_header("Content-Disposition", "inline", filename=os.path.basename(snapshot_path))
                outer.attach(img_part)
            except Exception as ex:
                logger.warning(f"Could not embed snapshot image: {ex}")

            return outer  # type: ignore[return-value]
        else:
            msg.add_alternative(html_content, subtype="html")
            return msg

    async def _send_email(
        self,
        message: EmailMessage,
        recipients: List[str],
    ) -> None:

        message["To"] = ", ".join(recipients)

        def sync_send():
            import smtplib
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

        try:
            await asyncio.to_thread(sync_send)
        except Exception as e:
            logger.error(f"Failed to send email to {recipients}: {e}")

    # === GLOBAL MESH BROADCAST ===
    async def push_notification(self, type: str, priority: str, description: str, venue_id: str = None, venue_name: str = None, camera_id: str = None, domain: str = None, metadata: dict = None):
        """Broadcasts a tactical alert to the unified emergency mesh."""
        from app.core.global_state import GLOBAL_STATE
        
        notif = {
            "id": f"mesh_{int(time.time()*1000)}",
            "type": type,
            "priority": priority,
            "description": description,
            "venue_id": str(venue_id) if venue_id else None,
            "venue_name": venue_name,
            "camera_id": str(camera_id) if camera_id else None,
            "domain": domain,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Persistence
        _notification_buffer.append(notif)
        # Update GLOBAL_STATE for direct dashboard access
        GLOBAL_STATE.update(
            domain="notifications",
            venue_id="MESH_BUFFER",
            payload={"recent": list(_notification_buffer)}
        )
        
        # Real-time dispatch
        for q in _sse_subscribers[:]:
            try:
                await q.put(notif)
            except:
                if q in _sse_subscribers:
                    _sse_subscribers.remove(q)

    def get_recent(self, limit: int = 50):
        buffer_list = list(_notification_buffer)
        return buffer_list[-limit:] if limit else buffer_list

    async def get_sse_subscriber(self):
        q = asyncio.Queue()
        _sse_subscribers.append(q)
        return q

    def remove_sse_subscriber(self, q):
        if q in _sse_subscribers:
            _sse_subscribers.remove(q)

notification_service = NotificationService()
