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
        Send a specialized notification for camera health issues.
        These are distinct from crowd risk alerts.
        """
        venue_repo = Repository[Venue](Venue)
        venue = await venue_repo.get_by_id(session, alert.venue_id)
        
        if not venue:
            return

        extra = alert.extra_data or {}
        issue_label = extra.get("issue_label", "Camera Health Issue")
        cam_name = extra.get("camera_name", "Unknown Camera")
        
        # Resolve recipients (already handles camera issues in _resolve_recipients)
        role_recipients = self._resolve_recipients(alert)
        
        if not role_recipients:
            return

        all_emails = set()
        for emails in role_recipients.values():
            all_emails.update(emails)
            
        from app.models.user import User
        stmt_lang = select(User.email, User.language_preference).where(User.email.in_(all_emails))
        result_lang = await session.execute(stmt_lang)
        user_langs = {row[0]: row[1] or "en" for row in result_lang.all()}

        color = "#eab308" # Yellow for health issues
        
        # Generate AI explanation for the camera issue
        from app.services.ai_provider_service import get_ai_provider
        ai_provider = get_ai_provider()
        
        prompt = (
            f"You are a technical security analyst for the Laminar physical security system. "
            f"A camera health issue has been detected: '{issue_label}' on camera '{cam_name}' at venue '{venue.name}'. "
            f"Please write a short, professional, 2-sentence executive summary explaining what this technical issue means "
            f"and what immediate physical or technical maintenance action might be required."
        )
        ai_explanation = await ai_provider.generate_response(prompt)
        
        ai_html = ""
        if ai_explanation:
            ai_html = f"""
            <div style="background:#1f2937; border-left: 5px solid #3b82f6; padding:15px; color:#f3f4f6; margin-bottom:20px; font-size:16px; border-radius:4px;">
                <div style="font-size:12px; color:#93c5fd; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">
                    🤖 AI Hardware Diagnostic
                </div>
                <em>"{ai_explanation}"</em>
            </div>
            """
        
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
                    msg = EmailMessage()
                    msg["From"] = settings.SMTP_USER
                    msg["Subject"] = f"[CAMERA ALERT] {issue_label} — {cam_name} [{role_label.upper()}]"
                    
                    html = f"""
                    <html>
                    <body style="font-family: Arial, sans-serif; background:#f9fafb; padding:0; margin:0;">
                        <div style="background:{color}; padding:25px; color:white;">
                            <h1 style="margin:0;">Camera Health Alert</h1>
                            <h2 style="margin:0;">{issue_label}</h2>
                        </div>
                        <div style="padding:25px;">
                            {ai_html}
                            <p><strong>Camera:</strong> {cam_name}</p>
                            <p><strong>Venue:</strong> {venue.name}</p>
                            <p><strong>Description:</strong> {alert.explanation or getattr(alert, "notes", "A technical issue was detected with the camera stream.")}</p>
                            <p><strong>Status:</strong> {alert.status.upper()}</p>
                            <p><strong>Time:</strong> {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}</p>
                            <hr style="border:1px solid #eee; margin:20px 0;"/>
                            <p style="font-size:14px; color:#666;">This is a technical health alert. Maintenance may be required.</p>
                            <p><a href="http://localhost:3000/cameras/health" style="display:inline-block; padding:10px 20px; background-color:#2563eb; color:white; text-decoration:none; border-radius:5px;">Check Camera Health</a></p>
                        </div>
                    </body>
                    </html>
                    """
                    msg.add_alternative(html, subtype="html")
                    await self._send_email(msg, lang_emails)
                    
                except Exception as e:
                    logger.error(f"Failed to send camera notification: {e}")

        alert.last_notified_at = datetime.now(timezone.utc)
        await session.commit()

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

        # Cooldown protection
        if alert.last_notified_at:
            diff = datetime.now(timezone.utc) - alert.last_notified_at
            if diff.total_seconds() < 300:  # 5 minutes
                logger.info(
                    "Notification skipped due to cooldown",
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
        role_recipients = self._resolve_recipients(alert)

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

        # Generate AI brief once (tuple: text, is_ai_generated), reuse for all role emails
        ai_brief, ai_brief_is_llm = await self._generate_ai_brief(alert, venue, location_text, session)

        # Get SMS recipient count for critical alerts
        sms_count = 0
        if alert.risk_level in ["critical", "high", "medium"]:
            stmt_sms = select(User.phone_number).where(User.receive_sms_alerts == True, User.phone_number.isnot(None))
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


    def _resolve_recipients(self, alert: CrowdAlert) -> dict[str, list[str]]:
        """
        Returns a dict mapping role label → recipient emails.
        """
        recipients: dict[str, list[str]] = {}

        mgmt = settings.get_management_emails()
        if mgmt:
            recipients["Management"] = mgmt

        # For regular crowd alerts, escalation logic
        if alert.risk_level in ["high", "critical"]:
            sup = settings.get_supervisor_emails()
            if sup:
                recipients["Supervisor"] = sup

        # Special casing for camera issues
        is_camera_issue = alert.extra_data and alert.extra_data.get("type") == "camera_issue"
        
        if is_camera_issue:
            # Camera issues ALWAYS go to Supervisors too
            sup = settings.get_supervisor_emails()
            if sup and "Supervisor" not in recipients:
                recipients["Supervisor"] = sup
            
            # Critical camera issues (offline/covered) go to Police/Security as well sometimes?
            # User said "keep aside, make separate alert", so maybe just Management/Supervisor for health
            return recipients

        if alert.risk_level == "critical":
            police = settings.get_police_emails()
            if police:
                recipients["Police / Security"] = police

        return recipients

    # ==========================================================
    # Offline SMS Alert Method
    # ==========================================================

    async def _trigger_offline_sms(self, session: AsyncSession, alert: CrowdAlert, venue: Venue, location_text: str, live_metrics: dict = None) -> None:
        """Fetch alert contacts from DB and dispatch SMS in background."""
        try:
            from app.models.user import User
            logger.info("Fetching registered SMS contacts from User accounts...")
            stmt = select(User.phone_number, User.language_preference).where(User.receive_sms_alerts == True, User.phone_number.isnot(None))
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
                
                sms_msg = (
                    f"\U0001f6a8 {alert_title} [{alert.risk_level.upper()}] \U0001f6a8\n"
                    f"{t(lang, 'venue')}: {venue.name}\n"
                    f"{t(lang, 'location')}: {location_text}\n"
                    f"Current: {int(avg_count)} persons | Velocity: {growth_rate:+.1f}%/min\n"
                    f"{t(lang, 'severity')}: {severity} | {t(lang, 'escalation_risk')}: {prob_str}\n"
                    f"{t(lang, 'time')}: {datetime.now(timezone.utc).strftime('%H:%M UTC')}\n"
                    f"{t(lang, 'action_required')}"
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

    def _rule_based_brief(self, alert: CrowdAlert, venue: Venue, location_text: str) -> str:
        """
        Generate a professional situation brief from alert data — no LLM needed.
        Always produces meaningful human-readable content.
        """
        risk = alert.risk_level.upper()
        severity = getattr(alert, 'severity', 'N/A')
        escalation_prob = getattr(alert, 'escalation_probability', 0)
        predicted_level = getattr(alert, 'predicted_level', None)
        prob_pct = f"{int(escalation_prob * 100)}%" if escalation_prob else "unknown"

        action_map = {
            "critical": "Immediate management intervention and security deployment required.",
            "high": "Supervisors should be notified and crowd-control measures activated.",
            "medium": "Monitor closely and prepare contingency staff.",
            "low": "Situation is developing — continue standard monitoring.",
        }
        action = action_map.get(alert.risk_level.lower(), "Review dashboard for details.")

        trajectory = ""
        if predicted_level and escalation_prob:
            trajectory = (
                f" The system predicts escalation to {predicted_level.upper()} "
                f"with {prob_pct} probability."
            )

        staffing_cfg = getattr(venue, "staffing_config", {}) or {}
        required_staff = staffing_cfg.get(alert.risk_level.lower(), "N/A")

        return (
            f"A {risk} crowd risk (severity {severity}) has been detected at {venue.name} "
            f"near {location_text}.{trajectory} {action} "
            f"Recommended Staffing: {required_staff} personnel."
        )

    async def _generate_ai_brief(self, alert: CrowdAlert, venue: Venue, location_text: str, session: AsyncSession = None) -> tuple[str, bool]:
        """
        Generate a full AI intelligence brief using the Laminar Intelligence Engine.
        Returns (brief_text, is_ai_generated).
        
        Uses Llama 3.2 (via Ollama) with multi-camera correlation and structured
        Situation/Trends/Risk/Prediction/Action format.
        Falls back to a structured rule-based brief if Ollama is offline.
        """
        try:
            brief = await laminar_intelligence.generate_notification_brief(
                session=session,
                alert=alert,
                venue_name=venue.name,
                location=location_text,
            )
            is_llm = laminar_intelligence._ollama_online
            return brief, is_llm
        except Exception as e:
            logger.warning(f"Intelligence engine brief failed ({e}) — using rule-based brief.")
            return self._rule_based_brief(alert, venue, location_text), False

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

        # Camera issue subject override
        if alert.extra_data and alert.extra_data.get("type") == "camera_issue":
            issue_label = alert.extra_data.get("issue_label", "Camera Issue")
            cam_name = alert.extra_data.get("camera_name", "Unknown Camera")
            msg["Subject"] = f"[CAMERA ALERT] {issue_label} — {cam_name} [{role_label.upper()}]"
        else:
            msg["Subject"] = f"[{subject_prefix}] {t(lang, 'email_subject_prefix', 'Crowd Alert')} — {venue.name} [{role_label.upper()}]"

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
        required_staff = staffing_cfg.get(alert.risk_level.lower(), "Not configured")

        # ── Live crowd metrics ──
        avg_count     = live.get("avg_count", 0)
        max_count     = live.get("max_count", 0)
        occupancy_pct = live.get("occupancy_percent", 0)
        growth_rate   = live.get("growth_rate", 0)
        risk_score    = live.get("dynamic_risk_score", 0)
        metric_time   = live.get("bucket_start", "—")

        # ── Derive surge velocity label relative to venue thresholds ──
        # A surge is significant if it would cross a threshold within 10 minutes
        surge_threshold = (warning_threshold * 0.1) if warning_threshold else (capacity * 0.05 if capacity else 10.0)
        
        if growth_rate > (surge_threshold * 2):
            surge_label = f"🔴 RAPID (+{growth_rate:.1f}%/min)"
        elif growth_rate > surge_threshold:
            surge_label = f"🟠 RISING (+{growth_rate:.1f}%/min)"
        elif growth_rate < -surge_threshold:
            surge_label = f"🟢 FALLING ({growth_rate:.1f}%/min)"
        else:
            surge_label = f"🟡 STABLE ({growth_rate:+.1f}%/min)"

        # ── Venue threshold display ──
        capacity_display = f"{capacity} persons" if capacity else "Not configured"
        if warning_threshold and critical_threshold:
            threshold_display = f"Warning ≥ {warning_threshold} | Critical ≥ {critical_threshold} persons"
        elif warning_threshold:
            threshold_display = f"Warning ≥ {warning_threshold} persons | Critical: Not configured"
        else:
            threshold_display = "Thresholds not configured — edit Venue Settings to set limits."

        # ── Occupancy fill bar (relative to venue limits) ──
        occ_pct_clamped = min(100, max(0, int(occupancy_pct)))
        
        # Color based on absolute counts vs thresholds
        if avg_count >= (critical_threshold or (capacity * 0.85 if capacity else 999)):
            occ_bar_color = "#dc2626" # red
        elif avg_count >= (warning_threshold or (capacity * 0.60 if capacity else 999)):
            occ_bar_color = "#f97316" # orange/high
        else:
            occ_bar_color = "#16a34a" # green/low

        occupancy_bar = f"""
        <div style="margin:10px 0; background:#374151; border-radius:4px; height:14px; overflow:hidden;">
            <div style="width:{occ_pct_clamped}%; height:100%; background:{occ_bar_color}; transition:width 0.3s;"></div>
        </div>
        <div style="font-size:11px; color:#9ca3af; margin-top:2px;">{occ_pct_clamped}% occupancy — {int(avg_count)} of {capacity or '?'} persons</div>
        """

        # ── Prediction block ──
        if predicted_level is not None and predicted_score is not None:
            esc_pct = int(escalation_probability * 100) if escalation_probability else 0
            pred_color = {"critical": "#dc2626", "high": "#f97316", "medium": "#eab308", "low": "#16a34a"}.get(str(predicted_level).lower(), "#6b7280")
            prediction_block = f"""
            <div style="background:#0f172a; border:1px solid {pred_color}; border-radius:8px; padding:14px; margin:10px 0;">
                <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">🔮 Prediction Intelligence (next 15 min)</div>
                <table width="100%" style="color:#e2e8f0; font-size:13px;">
                    <tr><td>Predicted Level</td><td style="text-align:right; color:{pred_color}; font-weight:bold;">{str(predicted_level).upper()}</td></tr>
                    <tr><td>Predicted Risk Score</td><td style="text-align:right;">{predicted_score:.1f}/100</td></tr>
                    <tr><td>Escalation Probability</td><td style="text-align:right;">{esc_pct}%</td></tr>
                </table>
            </div>
            """
        else:
            prediction_block = f"""
            <div style="background:#1f2937; border:1px solid #374151; border-radius:8px; padding:14px; margin:10px 0;">
                <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">🔮 Prediction Intelligence</div>
                <p style="color:#9ca3af; font-size:12px; margin:0;">Gathering baseline data — predictions will be available after 5+ crowd readings have been collected for this venue. Check the dashboard for real-time trends.</p>
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
                📅 Today is {holiday.get('name')} ({holiday.get('type')} Holiday). Crowd activity may be higher than usual.
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
                <strong>🔮 EARLY WARNING:</strong> System predicts escalation to
                <strong>{(predicted_level or 'UNKNOWN').upper()}</strong> within next few minutes.<br/>
                Escalation Probability: {int(escalation_probability * 100) if escalation_probability else 0}%
            </div>
            """

        police_block = ""
        if police_required:
            police_block = """<div style="background:#000; color:white; padding:10px; margin-bottom:20px;">🚔 POLICE ESCALATION REQUIRED</div>"""

        # ── AI Brief block ──
        ai_brief_block = ""
        if ai_brief:
            brief_label = "🤖 AI Executive Brief" if ai_brief_is_llm else f"📋 {t(lang, 'system_brief', 'System Brief')}"
            border_color = "#3b82f6" if ai_brief_is_llm else "#f59e0b"
            source_note = "Generated by Local LLM" if ai_brief_is_llm else t(lang, "system_brief", "System Generated Brief")
            ai_brief_block = f"""
            <div style="background:#1f2937; border-left:5px solid {border_color}; padding:15px; color:#f3f4f6; margin-bottom:20px; font-size:15px; line-height:1.5; border-radius:4px;">
                <div style="font-size:12px; color:#93c5fd; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">{brief_label}</div>
                <em>"{ai_brief}"</em>
                <div style="font-size:10px; color:#6b7280; margin-top:8px;">{source_note}</div>
            </div>
            """

        sms_block = ""
        if sms_count > 0:
            sms_block = f"""<div style="background:#4b5563; padding:10px; color:white; margin-bottom:15px; font-weight:bold; border-radius:4px;">📱 SMS dispatched to {sms_count} critical contacts</div>"""

        # ── Evidence ──
        snapshot_block = ""
        clip_block = ""
        snapshot_path = extra.get("snapshot_path")
        clip_path = extra.get("clip_path")
        if snapshot_path:
            snapshot_block = f"""
            <div style="margin-top:20px; padding:14px; background:#0f172a; border-radius:8px;">
                <div style="font-size:12px; color:#94a3b8; text-transform:uppercase; font-weight:bold; margin-bottom:10px;">📸 Alert Snapshot</div>
                <img src="cid:alert_snapshot" alt="Alert Snapshot" style="max-width:100%; border-radius:6px; border:2px solid {color};"/>
            </div>
            """
        if clip_path:
            clip_name = os.path.basename(clip_path)
            clip_block = f"""
            <div style="margin-top:12px; padding:10px; background:#1e293b; border-radius:6px; color:#e2e8f0; font-size:14px;">
                📹 <strong>10-Second Clip Saved:</strong> {clip_name}
            </div>
            """

        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; margin:0; padding:0; background:#f1f5f9;">

          <!-- Header -->
          <div style="background:{color}; padding:28px 25px; color:white;">
            <h1 style="margin:0; font-size:24px;">{t(lang, 'email_header', 'Crowd Risk Alert')} — {alert.risk_level.upper()}</h1>
            <p style="margin:6px 0 0; font-size:14px; opacity:0.85;">📍 {venue.name} &nbsp;|&nbsp; {location_text} &nbsp;|&nbsp; {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}</p>
          </div>

          <div style="padding:24px;">

            {ai_brief_block}
            {weather_html}
            {holiday_html}
            {early_warning_block}
            {police_block}
            {sms_block}

            <!-- Live Crowd Snapshot -->
            <div style="background:white; border:1px solid #e5e7eb; border-radius:8px; padding:18px; margin-bottom:18px;">
              <h3 style="margin:0 0 12px; color:#111827; font-size:15px;">📡 Live Crowd Snapshot <span style="font-size:11px; color:#6b7280;">as of {metric_time}</span></h3>
              {occupancy_bar}
              <table width="100%" style="font-size:13px; color:#374151; border-collapse:collapse; margin-top:12px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:7px 10px;">Current Count</td>
                  <td style="padding:7px 10px; text-align:right; font-weight:bold;">{int(avg_count)} persons</td>
                </tr>
                <tr>
                  <td style="padding:7px 10px;">Peak Count (last min)</td>
                  <td style="padding:7px 10px; text-align:right;">{int(max_count)} persons</td>
                </tr>
                <tr style="background:#f9fafb;">
                  <td style="padding:7px 10px;">Surge Velocity</td>
                  <td style="padding:7px 10px; text-align:right;">{surge_label}</td>
                </tr>
                <tr>
                  <td style="padding:7px 10px;">Dynamic Risk Score</td>
                  <td style="padding:7px 10px; text-align:right;">{risk_score:.1f} / 100</td>
                </tr>
              </table>
            </div>

            <!-- Venue Capacity Config -->
            <div style="background:white; border:1px solid #e5e7eb; border-radius:8px; padding:18px; margin-bottom:18px;">
              <h3 style="margin:0 0 12px; color:#111827; font-size:15px;">🏟 Venue Configuration</h3>
              <table width="100%" style="font-size:13px; color:#374151; border-collapse:collapse;">
                <tr style="background:#f9fafb;">
                  <td style="padding:7px 10px;">Venue Capacity</td>
                  <td style="padding:7px 10px; text-align:right; font-weight:bold;">{capacity_display}</td>
                </tr>
                <tr>
                  <td style="padding:7px 10px;">Alert Thresholds</td>
                  <td style="padding:7px 10px; text-align:right;">{threshold_display}</td>
                </tr>
                <tr style="background:#f9fafb;">
                  <td style="padding:7px 10px;">Required Staffing</td>
                  <td style="padding:7px 10px; text-align:right; font-weight:bold;">{required_staff}</td>
                </tr>
                <tr>
                  <td style="padding:7px 10px;">Alert Status</td>
                  <td style="padding:7px 10px; text-align:right;">{alert.status.upper()} | Severity {alert.severity} | Escalation Level {alert.escalation_level}</td>
                </tr>
              </table>
              {event_text}
            </div>

            <!-- Prediction Intelligence -->
            {prediction_block}

            {snapshot_block}
            {clip_block}

            <hr style="border:1px solid #e5e7eb; margin:20px 0;"/>
            <p style="font-size:12px; color:#6b7280;">
              This is an automated alert generated by <strong>Laminar Predictive Monitoring System</strong>.
            </p>
            <p>
              <a href="http://localhost:3000" style="display:inline-block; padding:10px 20px; background-color:#2563eb; color:white; text-decoration:none; border-radius:5px;">{t(lang, 'view_dashboard', 'View Dashboard')}</a>
            </p>
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

        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=settings.SMTP_USE_TLS,
        )
