"""
Laminar - Email Alert Service
-------------------------------
Sends detailed HTML email notifications to police/admin on critical incident detection.
Uses Python's built-in smtplib — no external dependencies required.

Configuration (set in .env):
    SMTP_HOST     = smtp.gmail.com
    SMTP_PORT     = 587
    SMTP_USER     = your@email.com
    SMTP_PASS     = your_app_password
    ALERT_EMAIL_TO = police@dept.gov,admin@laminar.ai  (comma-separated)
"""

import smtplib
import traceback
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from typing import Any, Dict, Optional, List

from app.core.logging import get_logger
from app.core.config import settings

logger = get_logger(__name__)

class EmailAlertService:
    """
    Lightweight email dispatcher for critical incident notifications.
    Fails silently (with warning log) if SMTP is not configured.
    """

    def __init__(self):
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.user = settings.SMTP_USER
        self.password = settings.SMTP_PASSWORD
        
        # Combine all relevant recipients for tactical alerts
        recipients = set()
        recipients.update(settings.get_police_emails())
        recipients.update(settings.get_management_emails())
        recipients.update(settings.get_supervisor_emails())
        
        self.recipients: List[str] = list(recipients)
        self.configured = bool(self.host and self.user and self.password and self.recipients)

    def send_accident_alert(
        self,
        incident: Dict[str, Any],
        venue_name: str = "Unknown Location",
        latitude: float = 0.0,
        longitude: float = 0.0,
        vehicle_count: int = 0,
        vehicle_types: Optional[Dict[str, int]] = None,
        recording_name: Optional[str] = None,
        extra_details: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Send a detailed police alert email for a detected accident.
        Returns True on success, False on failure / not configured.
        """
        if not self.configured:
            logger.warning(
                "Email alert skipped — SMTP not configured. "
                "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO in .env"
            )
            return False

        try:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            incident_id = incident.get("id", "N/A")
            incident_type = incident.get("type", "Unknown Incident")
            priority = incident.get("priority", "HIGH")
            description = incident.get("description", "No description available.")
            explanation = incident.get("explanation", "")
            timestamp = incident.get("timestamp", now)

            # Format vehicle types
            veh_type_html = ""
            if vehicle_types:
                rows = "".join(
                    f"<tr><td style='padding:4px 10px;border:1px solid #333;color:#e2e8f0'>{cls.title()}</td>"
                    f"<td style='padding:4px 10px;border:1px solid #333;color:#22d3ee;font-weight:700'>{cnt}</td></tr>"
                    for cls, cnt in vehicle_types.items()
                )
                veh_type_html = f"""
                <table style='border-collapse:collapse;width:100%;margin:8px 0'>
                  <tr>
                    <th style='background:#1a1a2e;color:#94a3b8;padding:6px 10px;border:1px solid #333;text-align:left'>Vehicle Type</th>
                    <th style='background:#1a1a2e;color:#94a3b8;padding:6px 10px;border:1px solid #333;text-align:left'>Count</th>
                  </tr>{rows}
                </table>"""
            else:
                veh_type_html = f"<p style='color:#94a3b8'>{vehicle_count} vehicles detected</p>"

            priority_color = "#ef4444" if priority == "CRITICAL" else "#f97316"
            google_maps_link = f"https://maps.google.com/?q={latitude},{longitude}"

            html_body = f"""
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background:#0a0a10; color:#e2e8f0; margin:0; padding:0; }}
  .container {{ max-width:680px; margin:0 auto; border:1px solid #1e293b; border-radius:12px; overflow:hidden; }}
  .header {{ background:linear-gradient(135deg,#1a0a0a,#2d0a0a); padding:28px 32px; border-bottom:2px solid {priority_color}; }}
  .body {{ background:#0f0f1a; padding:28px 32px; }}
  .footer {{ background:#080810; padding:18px 32px; border-top:1px solid #1e293b; color:#475569; font-size:11px; }}
  .badge {{ display:inline-block; background:{priority_color}20; color:{priority_color}; border:1px solid {priority_color}40; padding:4px 14px; border-radius:999px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; }}
  .section {{ margin:20px 0; padding:16px; background:#13131f; border-radius:8px; border:1px solid #1e293b; }}
  .label {{ font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.15em; font-weight:700; margin-bottom:4px; }}
  .value {{ font-size:15px; color:#f1f5f9; font-weight:600; }}
  .map-btn {{ display:inline-block; background:#22d3ee; color:#000; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:800; font-size:12px; letter-spacing:0.08em; margin-top:12px; }}
  .ai-box {{ background:#0a0a1a; border:1px solid #22d3ee20; border-left:3px solid #22d3ee; padding:12px 16px; margin-top:12px; border-radius:0 8px 8px 0; }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <div style="background:{priority_color}20;border:2px solid {priority_color};border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:24px">🚨</div>
      <div>
        <p style="margin:0;font-size:10px;color:#ef4444;text-transform:uppercase;letter-spacing:0.2em;font-weight:700">Laminar Emergency Dispatch</p>
        <h1 style="margin:4px 0 0;font-size:22px;color:#fff;font-weight:900;letter-spacing:-0.02em">{incident_type}</h1>
      </div>
    </div>
    <span class="badge">⚠ {priority} PRIORITY</span>
    <span style="margin-left:8px;font-size:11px;color:#64748b">Incident ID: {incident_id}</span>
  </div>

  <div class="body">
    <!-- Location -->
    <div class="section">
      <div class="label">📍 Incident Location</div>
      <div class="value">{venue_name}</div>
      <div style="margin-top:6px;font-size:13px;color:#94a3b8">
        Latitude: <strong style="color:#22d3ee">{latitude:.6f}</strong> &nbsp;|&nbsp;
        Longitude: <strong style="color:#22d3ee">{longitude:.6f}</strong>
      </div>
      <a href="{google_maps_link}" class="map-btn">📌 Open in Google Maps</a>
    </div>

    <!-- Time -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="section" style="margin:0">
        <div class="label">🕐 Detection Time</div>
        <div class="value">{timestamp[:19].replace('T',' ')}</div>
      </div>
      <div class="section" style="margin:0">
        <div class="label">🚗 Vehicles Detected</div>
        <div class="value" style="color:#22d3ee">{vehicle_count}</div>
      </div>
    </div>

    <!-- Vehicle Types -->
    <div class="section" style="margin-top:12px">
      <div class="label">🚙 Vehicle Breakdown</div>
      {veh_type_html}
    </div>

    <!-- AI Description -->
    <div class="section">
      <div class="label">🤖 AI Incident Analysis</div>
      <p style="color:#e2e8f0;margin:8px 0;line-height:1.6">{description}</p>
      {f'<div class="ai-box"><p style="margin:0;font-size:12px;color:#94a3b8"><strong style="color:#22d3ee">NEURAL INSIGHT:</strong> {explanation}</p></div>' if explanation else ''}
    </div>

    <!-- Recording -->
    {f'<div class="section"><div class="label">📹 Recording Reference</div><div class="value" style="font-family:monospace;font-size:13px">{recording_name}</div></div>' if recording_name else ''}

    <!-- Action Required -->
    <div style="background:#1a0a0a;border:1px solid {priority_color}40;border-radius:8px;padding:16px;margin-top:16px;text-align:center">
      <p style="color:{priority_color};font-weight:800;font-size:14px;margin:0 0 8px">⚠ IMMEDIATE RESPONSE REQUESTED</p>
      <p style="color:#94a3b8;font-size:12px;margin:0">
        Laminar AI has detected a {priority.lower()} priority incident at {venue_name}.<br>
        Please dispatch appropriate emergency response units to the coordinates above.
      </p>
    </div>
  </div>

  <div class="footer">
    <p style="margin:0">Generated by <strong>Laminar AI Incident Intelligence</strong> · {now}</p>
    <p style="margin:4px 0 0">This is an automated alert. Do not reply to this email.</p>
  </div>
</div>
</body>
</html>"""

            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"🚨 [{priority}] ACCIDENT ALERT — {venue_name} | Laminar AI"
            msg["From"] = f"Laminar Emergency AI <{self.user}>"
            msg["To"] = ", ".join(self.recipients)

            # Plain text fallback
            plain = (
                f"LAMINAR EMERGENCY DISPATCH\n"
                f"{'=' * 40}\n"
                f"TYPE: {incident_type}\n"
                f"PRIORITY: {priority}\n"
                f"LOCATION: {venue_name}\n"
                f"LAT/LNG: {latitude:.6f}, {longitude:.6f}\n"
                f"TIME: {timestamp[:19].replace('T', ' ')}\n"
                f"VEHICLES: {vehicle_count}\n"
                f"DESCRIPTION: {description}\n"
                f"{'=' * 40}\n"
                f"Google Maps: {google_maps_link}\n"
            )

            msg.attach(MIMEText(plain, "plain"))
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(self.host, self.port, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.login(self.user, self.password)
                server.sendmail(self.user, self.recipients, msg.as_string())

            logger.info(f"Accident email alert sent to {self.recipients} for incident {incident_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send accident email alert: {e}\n{traceback.format_exc()}")
            return False

    def send_dispatch_email(
        self,
        incident_id: str,
        dispatch_event: Dict[str, Any],
        incident_details: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Send a notification that police/emergency units have been dispatched.
        """
        if not self.configured:
            return False

        try:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            venue_name = incident_details.get("venue_name", "Unknown Area") if incident_details else "Tactical Sector"
            
            html_body = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif; background:#0a0a10; color:#e2e8f0; padding:20px;">
  <div style="max-width:600px; margin:0 auto; background:#0f0f1a; border:1px solid #22d3ee40; border-radius:12px; overflow:hidden;">
    <div style="background:linear-gradient(135deg, #064e3b, #065f46); padding:24px; text-align:center;">
      <h1 style="margin:0; color:#fff; font-size:20px;">🚨 POLICE DISPATCHED</h1>
      <p style="margin:8px 0 0; color:#34d399; font-size:12px; font-weight:700; letter-spacing:0.1em;">MISSION CRITICAL ENGAGEMENT</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:14px; line-height:1.6; color:#94a3b8;">
        Emergency response units have been successfully routed to <strong>{venue_name}</strong> in response to Incident <strong>#{incident_id}</strong>.
      </p>
      <div style="background:#13131f; padding:16px; border-radius:8px; margin:20px 0;">
        <p style="margin:0 0 8px; font-size:10px; color:#64748b; text-transform:uppercase;">Dispatch Description</p>
        <p style="margin:0; color:#f1f5f9; font-size:14px;">{dispatch_event.get('description', 'Unit broadcast engaged.')}</p>
      </div>
      <p style="font-size:12px; color:#475569; text-align:center;">Dispatch Timestamp: {now}</p>
    </div>
  </div>
</body>
</html>
"""
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"✅ [DISPATCHED] Incident #{incident_id} Overridden | Laminar AI"
            msg["From"] = f"Laminar AI Dispatch <{self.user}>"
            msg["To"] = ", ".join(self.recipients)
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(self.host, self.port, timeout=10) as server:
                server.ehlo(); server.starttls(); server.login(self.user, self.password)
                server.sendmail(self.user, self.recipients, msg.as_string())

            return True
        except Exception as e:
            logger.error(f"Dispatch email failed: {e}")
            return False


# Singleton instance
email_alert_service = EmailAlertService()
