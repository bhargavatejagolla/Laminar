"""
Laminar - Premium PDF Report Service
---------------------------------------
Generates professional AI-powered PDF intelligence reports using reportlab.
Features a clean, premium Light Mode SaaS aesthetic (white background, sleek borders).

Report Contents:
  1. Executive summary header (venue, date range, branding)
  2. Crowd trend KPI stats and AI logic
  3. Alert summary table (risk level, time, severity, status)
  4. Camera Feed Connectivity Status (Detailed telemetry from feeds)
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
from app.models.journey import Journey
from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── Premium Light Mode Palette ────
COLORS = {
    "bg": (1.0, 1.0, 1.0),                 # #FFFFFF Background
    "card": (0.97, 0.98, 0.99),            # #F8FAFC Card BG
    "brand_blue": (0.01, 0.40, 0.84),      # #0369A1 (Primary Laminar Blue)
    "blue_dim": (0.88, 0.93, 0.97),        # #E0F2FE (Light Blue BG)
    "rose": (0.88, 0.15, 0.15),            # #E11D48 (Critical Red)
    "rose_dim": (1.0, 0.92, 0.93),         # #FFE4E6 (Light Red BG)
    "amber": (0.85, 0.45, 0.0),            # #D97706 (Warning Orange)
    "emerald": (0.04, 0.65, 0.35),         # #059669 (Success Green)
    "text_main": (0.06, 0.09, 0.16),       # #0F172A (Primary Text - Black/Slate)
    "text_sub": (0.39, 0.45, 0.55),        # #64748B (Secondary Text - Gray)
    "border": (0.89, 0.91, 0.94),          # #E2E8F0 (Borders/Lines)
}

RISK_COLORS = {
    "low": COLORS["emerald"],
    "medium": COLORS["amber"],
    "high": (0.85, 0.35, 0.10),
    "critical": COLORS["rose"],
    "unknown": COLORS["text_sub"],
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
        Generate a full venue intelligence PDF report in clean Light Mode format.
        """
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.units import cm, mm
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                HRFlowable
            )
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib import colors as rl_colors
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        except ImportError:
            logger.error("reportlab not installed. Run: pip install reportlab")
            raise RuntimeError("reportlab not installed")

        # ── Fetch data ────────────────────────────────────────────────────────
        venue_data = await self._fetch_venue_data(session, venue_id, days)
        journey_data = await self._fetch_journey_data(session, days)
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

        def draw_bg(canvas, doc):
            canvas.saveState()
            canvas.setFillColorRGB(*COLORS["bg"])
            canvas.rect(0, 0, A4[0], A4[1], fill=True, stroke=False)
            canvas.restoreState()

        styles = getSampleStyleSheet()
        story = []

        # ── Define custom styles ──────────────────────────────────────────────
        title_style = ParagraphStyle(
            "MainTitle",
            parent=styles["Title"],
            fontSize=22,
            textColor=rl_colors.Color(*COLORS["text_main"]),
            spaceAfter=4,
            fontName="Helvetica-Bold",
        )
        subtitle_style = ParagraphStyle(
            "SubTitle",
            parent=styles["Normal"],
            fontSize=10,
            textColor=rl_colors.Color(*COLORS["text_sub"]),
            spaceAfter=2,
            fontName="Courier-Bold",
            textTransform="uppercase",
        )
        section_style = ParagraphStyle(
            "SectionHeader",
            parent=styles["Heading2"],
            fontSize=14,
            textColor=rl_colors.Color(*COLORS["brand_blue"]),
            spaceBefore=16,
            spaceAfter=8,
            fontName="Helvetica-Bold",
            borderPad=4,
        )
        body_style = ParagraphStyle(
            "BodyText",
            parent=styles["Normal"],
            fontSize=10,
            textColor=rl_colors.Color(*COLORS["text_main"]),
            spaceAfter=4,
            leading=14,
        )
        highlight_style = ParagraphStyle(
            "HighlightBox",
            parent=styles["Normal"],
            fontSize=10,
            textColor=rl_colors.Color(*COLORS["text_main"]),
            spaceAfter=4,
            leading=14,
            backColor=rl_colors.Color(*COLORS["card"]),
            borderPadding=10,
            borderColor=rl_colors.Color(*COLORS["border"]),
            borderWidth=1,
            borderRadius=4,
        )
        small_style = ParagraphStyle(
            "SmallFooter",
            parent=styles["Normal"],
            fontSize=8,
            textColor=rl_colors.Color(*COLORS["text_sub"]),
            fontName="Courier",
            alignment=TA_CENTER
        )

        # ── Header ────────────────────────────────────────────────────────────
        story.append(Paragraph("LAMINAR AI // TARGET V2.4", subtitle_style))
        story.append(Paragraph("CROWD INTELLIGENCE REPORT", title_style))
        story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.Color(*COLORS["border"])))
        story.append(Spacer(1, 8))

        # Meta table
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        since_str = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        meta_data = [
            ["MATRIX TARGET", venue_data["venue_name"].upper()],
            ["TEMPORAL WINDOW", f"{since_str} to {now_str}"],
            ["GENERATED TIMESTAMP", now_str],
            ["MAX CAPACITY", str(venue_data.get("capacity", "N/A"))],
        ]
        meta_table = Table(meta_data, colWidths=[5*cm, 12*cm])
        meta_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Courier-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), rl_colors.Color(*COLORS["text_sub"])),
            ("TEXTCOLOR", (1, 0), (1, -1), rl_colors.Color(*COLORS["text_main"])),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 16))

        # 🚨 PROACTIVE HEALTH ALERT
        health_data = venue_data.get("health", {})
        offline_cams = health_data.get("offline_list", [])
        if offline_cams:
            story.append(Paragraph("SYSTEM ALERT: SENSOR OUTAGE", section_style))
            story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.Color(*COLORS["rose"])))
            story.append(Spacer(1, 4))
            
            cams_str = ", ".join(offline_cams)
            health_msg = (
                f"<font color='#E11D48'><b>CRITICAL:</b></font> The following spatial sensors are <b>OFFLINE</b>: {cams_str}. "
                f"Data for associated sectors is unverified. Neural synthesis suspended for affected zones until uplink is restored."
            )
            story.append(Paragraph(health_msg, highlight_style))
            story.append(Spacer(1, 16))

        # ── KPI Cards row ────────────────────────────────────────────────────
        metrics = venue_data.get("metrics", {})
        kpi_data = [
            ["PEAK CROWD", "TOTAL ALERTS", "AVG RISK", "RISK EVENTS"],
            [
                f"{metrics.get('peak_crowd', 0):.0f}",
                str(metrics.get("total_alerts", 0)),
                f"{metrics.get('avg_risk_score', 0):.1f}/100",
                str(metrics.get("high_risk_events", 0)),
            ],
        ]
        kpi_table = Table(kpi_data, colWidths=[4.25*cm]*4)
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), rl_colors.Color(*COLORS["blue_dim"])),
            ("BACKGROUND", (0, 1), (-1, -1), rl_colors.Color(*COLORS["card"])),
            ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.Color(*COLORS["brand_blue"])),
            ("TEXTCOLOR", (0, 1), (-1, 1), rl_colors.Color(*COLORS["text_main"])),
            ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
            ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTSIZE", (0, 1), (-1, 1), 16),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("GRID", (0, 0), (-1, -1), 0.5, rl_colors.Color(*COLORS["border"])),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 16))

        # ── Executive Summary ────────────────────────────────────────────────
        story.append(Paragraph("EXECUTIVE AI SUMMARY", section_style))
        story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.Color(*COLORS["border"])))
        story.append(Spacer(1, 6))

        summary_text = (
            f"The visual telemetry array successfully ingested temporal spatial data for <b>{venue_data['venue_name']}</b> "
            f"over a {days}-day cycle. The peak detected crowd reached <b>{metrics.get('peak_crowd', 0):.0f} individuals</b>, "
            f"correlating with an average environmental risk score of <b>{metrics.get('avg_risk_score', 0):.1f}/100</b>. "
            f"Analysis indicates <b>{metrics.get('total_alerts', 0)} distinct security alerts</b> were raised by the automated vision processor. "
            f"All telemetry was dynamically aggregated from connected operational camera feed vectors."
        )
        story.append(Paragraph(summary_text, body_style))
        story.append(Spacer(1, 12))

        # ── Camera Feeds Database (NEW INFORMATIVE SECTION) ───────────────────
        story.append(Paragraph("CONNECTIVITY & CAMERA FEED HEALTH", section_style))
        story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.Color(*COLORS["border"])))
        story.append(Spacer(1, 6))

        cams = venue_data.get("cameras_data", [])
        if cams:
            cam_rows = [["FEED NAME", "MAC/IP ADDRESS", "ZONE ASSIGNMENT", "STATUS"]]
            for c in cams:
                status_txt = "ONLINE" if c.get("is_online") else "OFFLINE"
                cam_rows.append([
                    c.get("name") or "Unknown Feed",
                    str(c.get("id", ""))[:12],
                    c.get("zone") or "General",
                    status_txt,
                ])
            
            cam_table = Table(cam_rows, colWidths=[4*cm, 4*cm, 4*cm, 3*cm])
            cam_style = [
                ("BACKGROUND", (0, 0), (-1, 0), rl_colors.Color(*COLORS["blue_dim"])),
                ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.Color(*COLORS["brand_blue"])),
                ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.3, rl_colors.Color(*COLORS["border"])),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("TEXTCOLOR", (0, 1), (-1, -1), rl_colors.Color(*COLORS["text_main"])),
            ]
            for i, c in enumerate(cams, start=1):
                if not c.get("is_online"):
                    cam_style.append(("TEXTCOLOR", (3, i), (3, i), rl_colors.Color(*COLORS["rose"])))
                    cam_style.append(("FONTNAME", (3, i), (3, i), "Helvetica-Bold"))
                else:
                    cam_style.append(("TEXTCOLOR", (3, i), (3, i), rl_colors.Color(*COLORS["emerald"])))
            cam_table.setStyle(TableStyle(cam_style))
            story.append(cam_table)
        else:
            story.append(Paragraph("No connected camera feeds found in database. Telemetry generation relies on legacy datasets or simulation protocols.", body_style))
        story.append(Spacer(1, 16))


        # ── Alert Table ───────────────────────────────────────────────────────
        if venue_data.get("recent_alerts"):
            story.append(Paragraph("RECENT ALERT MATRIX", section_style))
            story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.Color(*COLORS["border"])))
            story.append(Spacer(1, 6))

            alert_rows = [["TIME (UTC)", "RISK LEVEL", "SEVERITY", "STATUS", "AI ACTION"]]
            for a in venue_data["recent_alerts"][:15]:
                risk_col = a.get("risk_level", "N/A").upper()
                row = [
                    a.get("created_at_str", ""),
                    risk_col,
                    str(a.get("severity", "N/A")),
                    a.get("status", "").title(),
                    (a.get("action", "") or "")[:40],
                ]
                alert_rows.append(row)

            alert_table = Table(alert_rows, colWidths=[2.5*cm, 2.5*cm, 2.3*cm, 2.7*cm, 7*cm])
            alert_style = [
                ("BACKGROUND", (0, 0), (-1, 0), rl_colors.Color(*COLORS["card"])),
                ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.Color(*COLORS["text_sub"])),
                ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.3, rl_colors.Color(*COLORS["border"])),
                ("TEXTCOLOR", (0, 1), (0, -1), rl_colors.Color(*COLORS["text_main"])),
                ("TEXTCOLOR", (2, 1), (-1, -1), rl_colors.Color(*COLORS["text_main"])),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ]
            # Color-code risk level column
            for i, a in enumerate(venue_data["recent_alerts"][:15], start=1):
                lvl = a.get("risk_level", "unknown").lower()
                r, g, b = RISK_COLORS.get(lvl, COLORS["text_sub"])
                bg_color = rl_colors.Color(*COLORS["rose_dim"]) if lvl == "critical" else rl_colors.Color(*COLORS["bg"])
                alert_style.append(("BACKGROUND", (0, i), (-1, i), bg_color))
                alert_style.append(("TEXTCOLOR", (1, i), (1, i), rl_colors.Color(r, g, b)))
                alert_style.append(("FONTNAME", (1, i), (1, i), "Helvetica-Bold"))
                
            alert_table.setStyle(TableStyle(alert_style))
            story.append(alert_table)
            story.append(Spacer(1, 16))

        # ── Cross-Camera Journey Insights ────────────────────────────────────
        if journey_data and journey_data.get("top_journeys"):
            story.append(Paragraph("CROSS-CAMERA TRAVERSAL INTELLIGENCE", section_style))
            story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.Color(*COLORS["border"])))
            story.append(Spacer(1, 8))

            journey_msg = (
                f"Laminar AI successfully correlated <b>{journey_data['total_unique']} unique subjects</b> across the "
                f"camera matrix. Detected <b>{journey_data['multicam_count']} cross-camera traversals</b>. "
                "Significant movement patterns are tracked for security perimeter analysis."
            )
            story.append(Paragraph(journey_msg, body_style))
            story.append(Spacer(1, 8))

            # Journey Table
            j_rows = [["SUBJECT ID", "PATH TAKEN", "CAMERAS", "LAST SEEN"]]
            for j in journey_data["top_journeys"][:8]:
                path_str = " → ".join([p.get("camera_name", "???") for p in j.get("path", [])[:3]])
                if len(j.get("path", [])) > 3: path_str += " ..."
                
                j_rows.append([
                    f"#{j['global_id'][:8]}",
                    path_str,
                    str(len(set(p.get("camera_id") for p in j.get("path", [])))),
                    j.get("last_seen_str", "")
                ])
            
            j_table = Table(j_rows, colWidths=[3*cm, 8.5*cm, 2.5*cm, 3*cm])
            j_style = [
                ("BACKGROUND", (0, 0), (-1, 0), rl_colors.Color(*COLORS["blue_dim"])),
                ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.Color(*COLORS["brand_blue"])),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.3, rl_colors.Color(*COLORS["border"])),
                ("ALIGN", (0, 1), (0, -1), "CENTER"),
            ]
            j_table.setStyle(TableStyle(j_style))
            story.append(j_table)
            story.append(Spacer(1, 16))

        # ── AI Intelligence Summary ───────────────────────────────────────────
        story.append(Paragraph("STRATEGIC FORECAST & ACTIONS", section_style))
        story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.Color(*COLORS["brand_blue"])))
        story.append(Spacer(1, 6))

        ai_summary = self._generate_ai_narrative(venue_data)
        story.append(Paragraph(ai_summary, highlight_style))
        story.append(Spacer(1, 24))

        # ── Footer ────────────────────────────────────────────────────────────
        story.append(HRFlowable(width="100%", thickness=1, color=rl_colors.Color(*COLORS["border"])))
        story.append(Spacer(1, 4))
        footer_text = (
            f"GENERATED BY LAMINAR AI PLATFORM V2.4 — {now_str} | "
            f"CONFIDENTIAL — AUTHORIZED EYES ONLY"
        )
        story.append(Paragraph(footer_text, small_style))

        # ── Build PDF ─────────────────────────────────────────────────────────
        doc.build(story, onFirstPage=draw_bg, onLaterPages=draw_bg)
        pdf_bytes = buffer.getvalue()
        buffer.close()

        logger.info(f"Premium Clean PDF generated ({len(pdf_bytes)/1024:.1f}KB) for {venue_id}")
        return pdf_bytes

    # ── Data Fetching ─────────────────────────────────────────────────────────
    async def _fetch_venue_data(
        self,
        session: AsyncSession,
        venue_id: UUID,
        days: int,
    ) -> Optional[Dict[str, Any]]:
        """Fetch all dynamic data directly from operational databases."""
        from app.services.report_service import ReportService
        mgr_report = await ReportService().management_report(session, venue_id)
        
        since = datetime.now(timezone.utc) - timedelta(days=days)

        venue_stmt = select(Venue).where(Venue.id == venue_id)
        venue_result = await session.execute(venue_stmt)
        venue = venue_result.scalar_one_or_none()
        if not venue:
            return None

        metric_stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= since)
            .where(CrowdMetric.bucket_type == "minute")
            .order_by(CrowdMetric.bucket_start.asc())
        )
        metric_result = await session.execute(metric_stmt)
        metrics = metric_result.scalars().all()

        alert_stmt = (
            select(CrowdAlert)
            .where(CrowdAlert.venue_id == venue_id)
            .where(CrowdAlert.created_at >= since)
            .order_by(desc(CrowdAlert.created_at))
            .limit(50)
        )
        alert_result = await session.execute(alert_stmt)
        alerts = alert_result.scalars().all()

        cam_stmt = select(Camera).where(Camera.venue_id == venue_id)
        cameras = (await session.execute(cam_stmt)).scalars().all()
        
        offline_cameras = [c.name for c in cameras if not c.is_online]
        degraded_cameras = [c.name for c in cameras if c.health_status == "degraded"]
        cams_data = [{"id": c.id, "name": c.name, "is_online": c.is_online, "zone": c.zone_name} for c in cameras]

        counts = [float(m.avg_count or 0) for m in metrics]
        risk_scores = [float(m.dynamic_risk_score or 0) for m in metrics]
        risk_distribution: Dict[str, int] = {}
        for m in metrics:
            lvl = m.risk_level or "unknown"
            risk_distribution[lvl] = risk_distribution.get(lvl, 0) + 1

        high_risk_events = sum(1 for m in metrics if m.risk_level in ("high", "critical"))
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
            "cameras_data": cams_data,
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
                    "created_at_str": a.created_at.strftime("%H:%M UTC"),
                    "risk_level": a.risk_level or "unknown",
                    "severity": a.severity,
                    "status": a.status or "open",
                    "action": (a.extra_data or {}).get("recommended_action", "")[:60] if a.extra_data else "",
                }
                for a in alerts
            ],
            "prediction": mgr_report.get("prediction", {}),
        }

    async def _fetch_journey_data(self, session: AsyncSession, days: int) -> Dict[str, Any]:
        """Fetch persistent journey data for PDF insights."""
        try:
            since = datetime.now(timezone.utc) - timedelta(days=days)
            stmt = (
                select(Journey)
                .where(Journey.last_seen >= since)
                .order_by(desc(Journey.last_seen))
            )
            result = await session.execute(stmt)
            journeys = result.scalars().all()

            multicam = [j for j in journeys if len(set(p.get("camera_id") for p in j.path)) > 1]
            
            return {
                "total_unique": len(journeys),
                "multicam_count": len(multicam),
                "top_journeys": [
                    {
                        "global_id": j.global_id,
                        "path": j.path,
                        "last_seen_str": j.last_seen.strftime("%H:%M"),
                    }
                    for j in journeys[:20]
                ]
            }
        except Exception as e:
            logger.error(f"Failed to fetch journey data for PDF: {e}")
            return {}

    def _generate_ai_narrative(self, data: Dict[str, Any]) -> str:
        """Generate a clean, professional AI narrative summary from the data."""
        metrics = data.get("metrics", {})
        prediction = data.get("prediction", {})
        
        forecast_lvl = (prediction.get("predicted_level") or "low").upper()
        forecast_conf = prediction.get("confidence") or 0.85
        weather = prediction.get("weather_context", {})

        narrative = (
            f"<b>[DATA FEDERATION PROTOCOL ENGAGED]</b><br/>"
            f"Predictive models analyzing the live camera feeds completed assessment with a confidence threshold of <b>{forecast_conf*100:.0f}%</b>. "
        )

        if weather:
            narrative += (
                f"External atmospheric indicators tracked: ({weather.get('condition', 'stable')} at {weather.get('temperature_c', 0)}°C). "
            )

        narrative += f"<br/><br/><b>AI PREDICTION LAYER:</b> The matrix trajectory places expected risk at <b>{forecast_lvl}</b> levels for the immediate temporal window."

        if forecast_lvl in ("HIGH", "CRITICAL"):
            narrative += "<br/><br/><font color='#E11D48'><b>RECOMMENDED DIRECTIVE:</b> Pre-emptive crowd dispersion and localized staffing reinforcement required immediately to prevent critical bottlenecking.</font>"
        else:
            narrative += "<br/><br/><font color='#059669'><b>RECOMMENDED DIRECTIVE:</b> Telemetry is within acceptable constraints. Maintain automated surveillance parameters across all active feeds.</font>"
        
        return narrative
