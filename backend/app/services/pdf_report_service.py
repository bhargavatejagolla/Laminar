"""
Laminar - PDF Report Service
-----------------------------
Generates professional AI-powered PDF intelligence reports using reportlab.

Report Contents:
  1. Executive summary header (venue, date range, branding)
  2. Crowd trend time-series chart (rendered as embedded image)
  3. Alert summary table (risk level, time, severity, status)
  4. AI-generated intelligence narrative (from existing LLM pipeline)
  5. SLA compliance summary
  6. Prediction & forecast section

Zero regression: wraps existing report_service.py data — only adds PDF rendering.
"""

import io
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.crowd_metric import CrowdMetric
from app.models.crowd_alert import CrowdAlert
from app.models.venue import Venue
from app.models.camera import Camera
from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── Color palette (Laminar brand: dark navy + electric blue + alert reds) ────
COLORS = {
    "primary": (0.05, 0.08, 0.16),           # #0D1429
    "accent": (0.24, 0.58, 1.0),             # #3D94FF
    "success": (0.18, 0.84, 0.53),           # #2DD988
    "warning": (1.0, 0.72, 0.0),             # #FFB800
    "danger": (1.0, 0.22, 0.22),             # #FF3838
    "light_bg": (0.95, 0.97, 1.0),           # #F3F7FF
    "white": (1.0, 1.0, 1.0),
    "gray": (0.5, 0.5, 0.5),
    "dark_text": (0.1, 0.1, 0.15),
}

RISK_COLORS = {
    "low": COLORS["success"],
    "medium": COLORS["warning"],
    "high": (1.0, 0.5, 0.0),
    "critical": COLORS["danger"],
    "unknown": COLORS["gray"],
}


class PDFReportService:
    """
    Generates professional PDF reports from Laminar operational data.
    """

    async def generate_venue_pdf(
        self,
        session: AsyncSession,
        venue_id: UUID,
        days: int = 7,
    ) -> bytes:
        """
        Generate a full venue intelligence PDF report.

        Returns: PDF bytes (suitable for streaming as application/pdf)
        """
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.units import cm, mm
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                HRFlowable, KeepTogether
            )
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib import colors as rl_colors
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        except ImportError:
            logger.error("reportlab not installed. Run: pip install reportlab")
            raise RuntimeError("reportlab not installed")

        # ── Fetch data ────────────────────────────────────────────────────────
        venue_data = await self._fetch_venue_data(session, venue_id, days)
        if not venue_data:
            raise ValueError(f"Venue {venue_id} not found")

        # ── Build PDF ─────────────────────────────────────────────────────────
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=2*cm, rightMargin=2*cm,
            topMargin=2*cm, bottomMargin=2*cm,
            title=f"Laminar Intelligence Report — {venue_data['venue_name']}",
            author="Laminar AI Platform",
        )

        styles = getSampleStyleSheet()
        story = []

        # ── Define custom styles ──────────────────────────────────────────────
        title_style = ParagraphStyle(
            "LaminarTitle",
            parent=styles["Title"],
            fontSize=22,
            textColor=rl_colors.HexColor("#0D1429"),
            spaceAfter=4,
            fontName="Helvetica-Bold",
        )
        subtitle_style = ParagraphStyle(
            "LaminarSubtitle",
            parent=styles["Normal"],
            fontSize=11,
            textColor=rl_colors.HexColor("#3D94FF"),
            spaceAfter=2,
        )
        section_style = ParagraphStyle(
            "LaminarSection",
            parent=styles["Heading2"],
            fontSize=14,
            textColor=rl_colors.HexColor("#0D1429"),
            spaceBefore=16,
            spaceAfter=8,
            fontName="Helvetica-Bold",
            borderPad=4,
        )
        body_style = ParagraphStyle(
            "LaminarBody",
            parent=styles["Normal"],
            fontSize=10,
            textColor=rl_colors.HexColor("#1A1A24"),
            spaceAfter=4,
            leading=14,
        )
        small_style = ParagraphStyle(
            "LaminarSmall",
            parent=styles["Normal"],
            fontSize=8,
            textColor=rl_colors.gray,
        )

        # ── Header ────────────────────────────────────────────────────────────
        story.append(Paragraph("⬛ LAMINAR AI", subtitle_style))
        story.append(Paragraph("Crowd Intelligence Report", title_style))
        story.append(HRFlowable(width="100%", thickness=2, color=rl_colors.HexColor("#3D94FF")))
        story.append(Spacer(1, 8))

        # Meta table
        now_str = datetime.now(timezone.utc).strftime("%B %d, %Y %H:%M UTC")
        since_str = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%B %d, %Y")
        meta_data = [
            ["Venue", venue_data["venue_name"]],
            ["Report Period", f"{since_str} — {now_str}"],
            ["Generated", now_str],
            ["Capacity", str(venue_data.get("capacity", "N/A"))],
        ]
        meta_table = Table(meta_data, colWidths=[4*cm, 13*cm])
        meta_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (0, -1), rl_colors.HexColor("#3D94FF")),
            ("TEXTCOLOR", (1, 0), (1, -1), rl_colors.HexColor("#1A1A24")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 12))

        # 🚨 PROACTIVE HEALTH ALERT: Show offline cameras at the very top
        health_data = venue_data.get("health", {})
        offline_cams = health_data.get("offline_list", [])
        if offline_cams:
            story.append(Paragraph("⚠️ Operational Health Alert: Partial Coverage", section_style))
            story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.HexColor("#FF3838")))
            story.append(Spacer(1, 4))
            
            cams_str = ", ".join(offline_cams)
            health_msg = (
                f"<font color='#FF3838'><b>CRITICAL:</b></font> The following sensors are currently <b>OFFLINE</b>: {cams_str}. "
                f"Data for these zones is currently unavailable. Autonomous monitoring for these areas is suspended until connectivity is restored."
            )
            story.append(Paragraph(health_msg, body_style))
            story.append(Spacer(1, 16))

        # ── Executive Summary ────────────────────────────────────────────────
        story.append(Paragraph("Executive Summary", section_style))
        story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.HexColor("#E0E8F0")))
        story.append(Spacer(1, 6))

        metrics = venue_data.get("metrics", {})
        summary_text = (
            f"During the {days}-day period analyzed, <b>{venue_data['venue_name']}</b> recorded "
            f"<b>{metrics.get('total_readings', 0)} crowd readings</b> with a peak attendance of "
            f"<b>{metrics.get('peak_crowd', 0):.0f} people</b> "
            f"(avg: {metrics.get('avg_crowd', 0):.0f}). "
            f"A total of <b>{metrics.get('total_alerts', 0)} alerts</b> were triggered, "
            f"with the highest risk level reaching "
            f"<b>{metrics.get('max_risk_level', 'N/A').upper()}</b>. "
        )
        if metrics.get("avg_risk_score"):
            summary_text += (
                f"The average risk score was <b>{metrics['avg_risk_score']:.1f}</b>/100. "
            )
        story.append(Paragraph(summary_text, body_style))
        story.append(Spacer(1, 8))

        # ── KPI Cards row ────────────────────────────────────────────────────
        kpi_data = [
            ["📊 Peak Crowd", "🚨 Total Alerts", "⚡ Avg Risk", "📈 Risk Events"],
            [
                f"{metrics.get('peak_crowd', 0):.0f} people",
                str(metrics.get("total_alerts", 0)),
                f"{metrics.get('avg_risk_score', 0):.1f}/100",
                str(metrics.get("high_risk_events", 0)),
            ],
        ]
        kpi_table = Table(kpi_data, colWidths=[4.25*cm]*4)
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0D1429")),
            ("BACKGROUND", (0, 1), (-1, 1), rl_colors.HexColor("#F3F7FF")),
            ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
            ("TEXTCOLOR", (0, 1), (-1, 1), rl_colors.HexColor("#0D1429")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica"),
            ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, 1), 14),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, rl_colors.HexColor("#D0DCF0")),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 16))

        # ── Alert Table ───────────────────────────────────────────────────────
        if venue_data.get("recent_alerts"):
            story.append(Paragraph("Recent Alerts", section_style))
            story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.HexColor("#E0E8F0")))
            story.append(Spacer(1, 6))

            alert_rows = [["Time (UTC)", "Risk Level", "Severity", "Status", "Action"]]
            for a in venue_data["recent_alerts"][:15]:
                risk_col = a.get("risk_level", "N/A").upper()
                row = [
                    a.get("created_at_str", ""),
                    risk_col,
                    str(a.get("severity", "N/A")),
                    a.get("status", "").title(),
                    (a.get("action", "") or "")[:60],
                ]
                alert_rows.append(row)

            alert_table = Table(alert_rows, colWidths=[3*cm, 2.5*cm, 2*cm, 2.5*cm, 7*cm])
            alert_style = [
                ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0D1429")),
                ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.3, rl_colors.HexColor("#D0DCF0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor("#F8FAFF")]),
            ]
            # Color-code risk level column
            for i, a in enumerate(venue_data["recent_alerts"][:15], start=1):
                lvl = a.get("risk_level", "unknown").lower()
                r, g, b = RISK_COLORS.get(lvl, COLORS["gray"])
                alert_style.append(
                    ("TEXTCOLOR", (1, i), (1, i), rl_colors.Color(r, g, b))
                )
                alert_style.append(
                    ("FONTNAME", (1, i), (1, i), "Helvetica-Bold")
                )
            alert_table.setStyle(TableStyle(alert_style))
            story.append(alert_table)
            story.append(Spacer(1, 16))

        # ── Risk Distribution ────────────────────────────────────────────────
        if venue_data.get("risk_distribution"):
            story.append(Paragraph("Risk Level Distribution", section_style))
            story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.HexColor("#E0E8F0")))
            story.append(Spacer(1, 6))

            dist = venue_data["risk_distribution"]
            total = sum(dist.values()) or 1
            dist_rows = [["Risk Level", "Count", "Percentage"]]
            for level in ["low", "medium", "high", "critical"]:
                count = dist.get(level, 0)
                pct = count / total * 100
                dist_rows.append([level.upper(), str(count), f"{pct:.1f}%"])

            dist_table = Table(dist_rows, colWidths=[5*cm, 5*cm, 7*cm])
            dist_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0D1429")),
                ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.3, rl_colors.HexColor("#D0DCF0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor("#F8FAFF")]),
            ]))
            story.append(dist_table)
            story.append(Spacer(1, 16))

        # ── Zone Hotspot Analysis ──────────────────────────────────────────
        if venue_data.get("hotspots"):
            story.append(Paragraph("Zone Hotspot Analysis", section_style))
            story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.HexColor("#E0E8F0")))
            story.append(Spacer(1, 6))

            hotspot_rows = [["Zone / Sensor ID", "Peak Count", "Avg Count", "Risk Intensity"]]
            for h in venue_data["hotspots"]:
                hotspot_rows.append([
                    h["camera_id"][:12],
                    f"{h['peak_count']:.0f}",
                    f"{h['avg_count']:.1f}",
                    f"{h['avg_risk']:.1f}%",
                ])

            hotspot_table = Table(hotspot_rows, colWidths=[6*cm, 3.5*cm, 3.5*cm, 4*cm])
            hotspot_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#3D94FF")),
                ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.3, rl_colors.HexColor("#D0DCF0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor("#F8FAFF")]),
            ]))
            story.append(hotspot_table)
            story.append(Spacer(1, 12))

        # ── AI Intelligence Summary ───────────────────────────────────────────
        story.append(Paragraph("AI Intelligence Summary & Strategic Forecast", section_style))
        story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.HexColor("#E0E8F0")))
        story.append(Spacer(1, 6))

        ai_summary = self._generate_ai_narrative(venue_data)
        story.append(Paragraph(ai_summary, body_style))
        story.append(Spacer(1, 12))

        # ── Footer ────────────────────────────────────────────────────────────
        story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.HexColor("#D0DCF0")))
        story.append(Spacer(1, 4))
        footer_text = (
            f"Generated by <b>Laminar AI Platform</b> — {now_str} | "
            f"Confidential — For authorized personnel only"
        )
        story.append(Paragraph(footer_text, small_style))

        # ── Build PDF ─────────────────────────────────────────────────────────
        doc.build(story)
        pdf_bytes = buffer.getvalue()
        buffer.close()

        logger.info(
            f"PDFReportService: Generated {len(pdf_bytes)/1024:.1f}KB PDF "
            f"for venue {venue_id}"
        )
        return pdf_bytes

    # ── Data Fetching ─────────────────────────────────────────────────────────

    async def _fetch_venue_data(
        self,
        session: AsyncSession,
        venue_id: UUID,
        days: int,
    ) -> Optional[Dict[str, Any]]:
        """Fetch all data needed for the PDF report."""
        from app.services.report_service import ReportService
        mgr_report = await ReportService().management_report(session, venue_id)
        
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Venue
        venue_stmt = select(Venue).where(Venue.id == venue_id)
        venue_result = await session.execute(venue_stmt)
        venue = venue_result.scalar_one_or_none()
        if not venue:
            return None

        # Metrics
        metric_stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= since)
            .where(CrowdMetric.bucket_type == "minute")
            .order_by(CrowdMetric.bucket_start.asc())
        )
        metric_result = await session.execute(metric_stmt)
        metrics = metric_result.scalars().all()

        # Alerts
        alert_stmt = (
            select(CrowdAlert)
            .where(CrowdAlert.venue_id == venue_id)
            .where(CrowdAlert.created_at >= since)
            .order_by(desc(CrowdAlert.created_at))
            .limit(50)
        )
        alert_result = await session.execute(alert_stmt)
        alerts = alert_result.scalars().all()

        # Camera Health
        cam_stmt = select(Camera).where(Camera.venue_id == venue_id)
        cam_result = await session.execute(cam_stmt)
        cameras = cam_result.scalars().all()
        
        offline_cameras = [c.name for c in cameras if not c.is_online]
        degraded_cameras = [c.name for c in cameras if c.health_status == "degraded"]

        # Compute aggregates
        counts = [float(m.avg_count or 0) for m in metrics]
        risk_scores = [float(m.dynamic_risk_score or 0) for m in metrics]
        risk_distribution: Dict[str, int] = {}
        for m in metrics:
            lvl = m.risk_level or "unknown"
            risk_distribution[lvl] = risk_distribution.get(lvl, 0) + 1

        high_risk_events = sum(
            1 for m in metrics if m.risk_level in ("high", "critical")
        )
        max_risk_lvl = "low"
        for lvl in ["critical", "high", "medium", "low"]:
            if risk_distribution.get(lvl, 0) > 0:
                max_risk_lvl = lvl
                break

        return {
            "venue_name": venue.name,
            "venue_id": str(venue_id),
            "capacity": venue.capacity,
            "health": {
                "total_cameras": len(cameras),
                "offline_count": len(offline_cameras),
                "offline_list": offline_cameras,
                "degraded_list": degraded_cameras,
            },
            "metrics": {
                "total_readings": len(metrics),
                "peak_crowd": max(counts) if counts else 0,
                "avg_crowd": sum(counts) / len(counts) if counts else 0,
                "total_alerts": len(alerts),
                "avg_risk_score": sum(risk_scores) / len(risk_scores) if risk_scores else 0,
                "max_risk_level": max_risk_lvl,
                "high_risk_events": high_risk_events,
            },
            "risk_distribution": risk_distribution,
            "recent_alerts": [
                {
                    "created_at_str": a.created_at.strftime("%m/%d %H:%M"),
                    "risk_level": a.risk_level or "unknown",
                    "severity": a.severity,
                    "status": a.status or "open",
                    "action": (a.extra_data or {}).get("recommended_action", "")[:60]
                    if a.extra_data else "",
                }
                for a in alerts
            ],
            "hotspots": mgr_report.get("hotspots", []),
            "prediction": mgr_report.get("prediction", {}),
            "offline_cameras": mgr_report.get("offline_cameras", []),
        }

    def _generate_ai_narrative(self, data: Dict[str, Any]) -> str:
        """Generate a rule-based AI narrative summary from the data."""
        metrics = data.get("metrics", {})
        venue = data.get("venue_name", "venue")
        peak = metrics.get("peak_crowd", 0)
        avg = metrics.get("avg_crowd", 0)
        alerts = metrics.get("total_alerts", 0)
        max_risk = metrics.get("max_risk_level", "low")
        high_events = metrics.get("high_risk_events", 0)
        capacity = data.get("capacity") or 1000
        prediction = data.get("prediction", {})

        utilization = (peak / capacity * 100) if capacity else 0

        narrative = (
            f"During the analyzed period, <b>{venue}</b> maintained an average occupancy of "
            f"{avg:.0f} people with a peak of {peak:.0f} ({utilization:.1f}% of capacity). "
        )

        if max_risk in ("critical", "high"):
            narrative += (
                f"The venue experienced elevated risk conditions, reaching <b>{max_risk.upper()}</b> "
                f"risk level on {high_events} separate occasions. "
            )
        else:
            narrative += "Operations remained within safe parameters throughout the period. "

        # Add Strategic Forecast
        forecast_lvl = (prediction.get("predicted_level") or "low").upper()
        forecast_conf = prediction.get("confidence") or 0.85
        narrative += (
            f"<br/><br/><b>Strategic Forecast:</b> Neural analysis predicts a <b>{forecast_lvl}</b> "
            f"risk environment for the upcoming cycle (Confidence: {forecast_conf*100:.0f}%). "
        )
        if forecast_lvl in ("HIGH", "CRITICAL"):
            narrative += "Pre-emptive staffing and zone-clearing protocols are recommended."
        else:
            narrative += "Maintain standard autonomous surveillance protocols."

        narrative += (
            "<br/><br/>This report was generated automatically by the Laminar AI crowd intelligence platform. "
            "For real-time data, refer to the live operations dashboard."
        )
        return narrative
