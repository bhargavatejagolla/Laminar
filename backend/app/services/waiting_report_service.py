"""
Laminar - Waiting Intelligence Report Service
----------------------------------------------
Generates detailed PDF reports for person waiting monitoring.
Includes:
- Executive KPI summary banner
- Zone analysis table with risk levels
- EVIDENCE GRID: One annotated photo per person with dwell timing
- Individual dwell records table
"""

import io
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.models.dwell_monitor import PersonDwellTime, MonitoringZone
from app.models.camera import Camera
from app.core.logging import get_logger

logger = get_logger(__name__)


class WaitingReportService:
    async def generate_waiting_pdf(
        self,
        session: AsyncSession,
        camera_id: UUID,
        hours: int = 24
    ) -> bytes:
        try:
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.units import cm, mm
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                HRFlowable, Image, PageBreak, KeepTogether
            )
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib import colors as rl_colors
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        except ImportError:
            raise RuntimeError("reportlab not installed")

        # ── 1. Fetch Data ────────────────────────────────────────────────────
        since = datetime.now(timezone.utc) - timedelta(hours=hours)

        cam_stmt = select(Camera).where(Camera.id == camera_id)
        cam = (await session.execute(cam_stmt)).scalar_one_or_none()
        cam_name = cam.name if cam else str(camera_id)

        # Top 20 by wait time (for evidence grid)
        stmt = (
            select(PersonDwellTime)
            .where(PersonDwellTime.camera_id == camera_id)
            .where(PersonDwellTime.created_at >= since)
            .order_by(desc(PersonDwellTime.dwell_seconds))
            .limit(20)
        )
        records = (await session.execute(stmt)).scalars().all()
        valid_records = [r for r in records if r.dwell_seconds and r.dwell_seconds > 0]

        # Zone breakdown
        zone_stmt = (
            select(
                PersonDwellTime.zone_name,
                func.avg(PersonDwellTime.dwell_seconds).label("avg_dwell"),
                func.count(PersonDwellTime.id).label("count"),
                func.max(PersonDwellTime.dwell_seconds).label("max_dwell"),
            )
            .where(PersonDwellTime.camera_id == camera_id)
            .where(PersonDwellTime.created_at >= since)
            .group_by(PersonDwellTime.zone_name)
            .order_by(desc("avg_dwell"))
        )
        try:
            zone_rows = (await session.execute(zone_stmt)).all()
        except Exception:
            zone_rows = []

        # ── 2. Analytics ──────────────────────────────────────────────────────
        avg_wait = sum(r.dwell_seconds for r in valid_records) / len(valid_records) if valid_records else 0
        max_wait = max((r.dwell_seconds for r in valid_records), default=0)
        total_time_spent = sum(r.dwell_seconds for r in valid_records)
        alert_count = sum(1 for r in valid_records if r.alert_triggered)
        with_photos = [r for r in valid_records if r.snapshot_path and os.path.exists(r.snapshot_path)]

        def fmt(seconds):
            if seconds < 60: return f"{int(seconds)}s"
            if seconds < 3600: return f"{seconds / 60:.1f}m"
            return f"{seconds / 3600:.1f}h"

        # ── 3. Color Palette ───────────────────────────────────────────────────
        C = rl_colors.Color
        DARK    = C(0.04, 0.06, 0.12)
        DARKER  = C(0.02, 0.03, 0.08)
        BRAND   = C(0.95, 0.62, 0.04)     # amber
        CYAN    = C(0.0, 0.75, 0.90)
        ROSE    = C(0.88, 0.15, 0.15)
        EMERALD = C(0.04, 0.65, 0.35)
        AMBER   = C(0.85, 0.45, 0.0)
        WHITE   = rl_colors.white
        GRAY    = C(0.55, 0.60, 0.68)
        BORDER  = C(0.10, 0.14, 0.22)
        ROW_ODD = C(0.06, 0.09, 0.15)
        ROW_EVN = C(0.04, 0.06, 0.11)

        def risk_color(seconds):
            if seconds < 60: return EMERALD
            if seconds < 300: return AMBER
            return ROSE

        # ── 4. Styles ─────────────────────────────────────────────────────────
        styles = getSampleStyleSheet()

        def ps(name, **kw):
            return ParagraphStyle(name, parent=styles["Normal"], **kw)

        label_s    = ps("lbl", fontSize=7, textColor=GRAY, fontName="Helvetica-Bold", letterSpacing=2, spaceAfter=2)
        title_s    = ps("tit", fontSize=24, textColor=BRAND, spaceAfter=4, fontName="Helvetica-Bold")
        sub_s      = ps("sub", fontSize=8, textColor=GRAY, fontName="Helvetica-Bold", letterSpacing=3)
        sect_s     = ps("sec", fontSize=11, textColor=BRAND, fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=6)
        body_s     = ps("bod", fontSize=10, leading=15, textColor=C(0.85, 0.88, 0.92))
        mono_s     = ps("mon", fontSize=8, fontName="Courier", textColor=GRAY)
        white_s    = ps("wh",  fontSize=9, textColor=WHITE)
        white_b_s  = ps("whb", fontSize=9, textColor=WHITE, fontName="Helvetica-Bold")
        cyan_s     = ps("cy",  fontSize=9, textColor=CYAN,  fontName="Helvetica-Bold")
        small_s    = ps("sm",  fontSize=8, textColor=GRAY)
        center_s   = ps("cn",  fontSize=9, textColor=WHITE, alignment=1)
        center_b_s = ps("cnb", fontSize=10, textColor=WHITE, fontName="Helvetica-Bold", alignment=1)
        amber_b_s  = ps("ambb",fontSize=9, textColor=BRAND, fontName="Helvetica-Bold", alignment=1)

        story  = []
        buffer = io.BytesIO()
        W      = A4[0] - 3 * cm

        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            leftMargin=1.5*cm, rightMargin=1.5*cm,
            topMargin=1.5*cm, bottomMargin=2*cm,
            title=f"Wait Intelligence Report — {cam_name}"
        )

        # ── PAGE 1: Header ─────────────────────────────────────────────────────
        hdr = Table([[
            Paragraph("LAMINAR AI // TACTICAL UNIT", label_s),
            Paragraph(cam_name.upper(), ps("hr", fontSize=7, textColor=BRAND, fontName="Helvetica-Bold", letterSpacing=2, alignment=2))
        ]], colWidths=[W/2, W/2])
        hdr.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), DARKER),
            ('TOPPADDING',    (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('LEFTPADDING',   (0,0), (-1,-1), 12),
            ('RIGHTPADDING',  (0,0), (-1,-1), 12),
        ]))
        story.append(hdr)
        story.append(Spacer(1, 12))
        story.append(Paragraph("WAIT & DWELL INTELLIGENCE", sub_s))
        story.append(Paragraph("Person Monitoring Report", title_s))
        story.append(Paragraph(
            f"<b>SENSOR:</b> {cam_name}  |  <b>WINDOW:</b> Last {hours}h  |  "
            f"<b>GENERATED:</b> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}  |  "
            f"<b>EVIDENCE PHOTOS:</b> {len(with_photos)} / {len(valid_records)}",
            mono_s
        ))
        story.append(Spacer(1, 16))
        story.append(HRFlowable(width="100%", thickness=1.5, color=BRAND))
        story.append(Spacer(1, 16))

        # ── EXECUTIVE KPI BANNER ───────────────────────────────────────────────
        story.append(Paragraph("EXECUTIVE SUMMARY", label_s))
        story.append(Spacer(1, 6))

        kpi_items = [
            (str(len(valid_records)), "Total Events"),
            (fmt(avg_wait),           "Avg Wait Time"),
            (fmt(max_wait),           "Peak Wait"),
            (fmt(total_time_spent),   "Total Time Spent"),
            (str(alert_count),        f"Violations"),
            (str(len(with_photos)),   "Evidence Photos"),
        ]
        kpi_data = [[
            Paragraph(
                f"<b><font size='20'>{v}</font></b><br/>"
                f"<font size='7' color='#8899aa'>{l}</font>",
                ps(f"kpi{i}", parent=styles["Normal"], fontSize=20, alignment=1)
            )
            for i, (v, l) in enumerate(kpi_items)
        ]]
        kpi_table = Table(kpi_data, colWidths=[W/6]*6)
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), DARK),
            ('TEXTCOLOR',  (0,0), (-1,-1), WHITE),
            ('ALIGN',      (0,0), (-1,-1), 'CENTER'),
            ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING',    (0,0), (-1,-1), 14),
            ('BOTTOMPADDING', (0,0), (-1,-1), 14),
            ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER),
            ('BOX',       (0,0), (-1,-1), 0.5, BORDER),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 12))

        # Insight text
        severity = "CRITICAL" if avg_wait > 300 else "ELEVATED" if avg_wait > 120 else "MODERATE" if avg_wait > 60 else "OK"
        sev_color = "#DC2626" if severity == "CRITICAL" else "#D97706" if severity == "ELEVATED" else "#F59E0B" if severity == "MODERATE" else "#10B981"
        story.append(Paragraph(
            f"{len(valid_records)} dwell events recorded over {hours}h. "
            f"Mean wait: <b>{fmt(avg_wait)}</b>. Peak: <b>{fmt(max_wait)}</b>. "
            f"Total person-time spent: <b>{fmt(total_time_spent)}</b>. "
            f"Congestion severity: <font color='{sev_color}'><b>{severity}</b></font>.",
            body_s
        ))

        if avg_wait > 300:
            story.append(Spacer(1, 8))
            adv = Table([[Paragraph(
                "⚠ TACTICAL ADVISORY: Critical congestion — mean wait exceeds 5 minutes. "
                "Immediate staffing realignment or flow diversion recommended.",
                ps("adv", fontSize=9, textColor=WHITE, fontName="Helvetica-Bold")
            )]], colWidths=[W])
            adv.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), ROSE),
                ('TOPPADDING',    (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                ('LEFTPADDING',   (0,0), (-1,-1), 12),
            ]))
            story.append(adv)

        # ── ZONE TABLE ──────────────────────────────────────────────────────────
        if zone_rows:
            story.append(Spacer(1, 20))
            story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER))
            story.append(Spacer(1, 10))
            story.append(Paragraph("ZONE ANALYSIS", label_s))
            story.append(Spacer(1, 6))

            zh = [
                Paragraph("Zone", white_b_s),
                Paragraph("People", white_b_s),
                Paragraph("Avg Wait", white_b_s),
                Paragraph("Max Wait", white_b_s),
                Paragraph("Total Time", white_b_s),
                Paragraph("Risk", white_b_s),
            ]
            zd = [zh]
            for i, z in enumerate(zone_rows):
                avg_z = float(z.avg_dwell or 0)
                max_z = float(z.max_dwell or 0)
                cnt_z = int(z.count or 0)
                total_z = avg_z * cnt_z
                rc = risk_color(avg_z)
                risk_str = "CRITICAL" if avg_z > 300 else "ELEVATED" if avg_z > 120 else "OK"
                zd.append([
                    Paragraph(z.zone_name or "Main", white_s),
                    Paragraph(str(cnt_z), center_s),
                    Paragraph(fmt(avg_z), ps(f"za{i}", fontSize=9, textColor=rc, fontName="Helvetica-Bold", alignment=1)),
                    Paragraph(fmt(max_z), center_s),
                    Paragraph(fmt(total_z), ps(f"zt{i}", fontSize=9, textColor=CYAN, alignment=1)),
                    Paragraph(risk_str, ps(f"zr{i}", fontSize=8, textColor=rc, fontName="Helvetica-Bold", alignment=1)),
                ])

            zt = Table(zd, colWidths=[W*0.30, W*0.10, W*0.15, W*0.15, W*0.15, W*0.15])
            zst = [
                ('BACKGROUND', (0,0), (-1,0), DARKER),
                ('TEXTCOLOR', (0,0), (-1,0), BRAND),
                ('TOPPADDING',    (0,0), (-1,-1), 6),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                ('LEFTPADDING',   (0,0), (-1,-1), 8),
                ('RIGHTPADDING',  (0,0), (-1,-1), 8),
                ('INNERGRID', (0,0), (-1,-1), 0.3, BORDER),
                ('BOX',       (0,0), (-1,-1), 0.5, BORDER),
            ]
            for i in range(1, len(zd)):
                zst.append(('BACKGROUND', (0,i), (-1,i), ROW_ODD if i%2==1 else ROW_EVN))
                zst.append(('TEXTCOLOR', (0,i), (-1,i), WHITE))
            zt.setStyle(TableStyle(zst))
            story.append(zt)

        # ── PAGE 2: EVIDENCE GRID  ──────────────────────────────────────────────
        story.append(PageBreak())
        story.append(Paragraph("INTERCEPTED SUBJECTS — VISUAL EVIDENCE", label_s))
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            "One annotated photograph per subject. Dwell time, zone, and session timestamps embedded.",
            ps("evdesc", fontSize=9, textColor=GRAY)
        ))
        story.append(Spacer(1, 12))

        if not valid_records:
            story.append(Paragraph("No dwell records found for this period.", body_s))
        else:
            COLS = 3
            IMG_W = (W - (COLS - 1) * 0.3*cm) / COLS
            IMG_H = IMG_W * 0.85

            grid_rows = []
            row_cells = []

            for i, r in enumerate(valid_records):
                # ── Photo or Placeholder ──
                img_cell = None
                has_photo = r.snapshot_path and os.path.exists(r.snapshot_path)

                if has_photo:
                    try:
                        photo = Image(r.snapshot_path, width=IMG_W, height=IMG_H)
                        photo.hAlign = 'CENTER'
                        img_cell = photo
                    except Exception:
                        has_photo = False

                if not has_photo:
                    # Styled placeholder when no photo captured
                    img_cell = Table(
                        [[Paragraph(
                            f"<font size='24'>👤</font><br/>"
                            f"<font size='7' color='#445566'>PHOTO NOT YET<br/>CAPTURED</font>",
                            ps(f"ph{i}", fontSize=8, textColor=GRAY, alignment=1)
                        )]],
                        colWidths=[IMG_W], rowHeights=[IMG_H]
                    )
                    img_cell.setStyle(TableStyle([
                        ('BACKGROUND', (0,0), (-1,-1), C(0.04, 0.06, 0.12)),
                        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                        ('BOX', (0,0), (-1,-1), 0.5, BORDER),
                    ]))

                # ── Info Panel beneath the image ──
                minutes = int(r.dwell_seconds) // 60
                seconds = int(r.dwell_seconds) % 60
                dwell_str = f"{minutes}m {seconds}s" if minutes else f"{seconds}s"
                enter_str = r.enter_time.strftime("%H:%M:%S") if r.enter_time else "—"
                exit_str  = r.last_seen_time.strftime("%H:%M:%S") if r.last_seen_time else "—"
                date_str  = r.enter_time.strftime("%d %b %Y") if r.enter_time else "—"
                alert_txt = "⚠ ALERT TRIGGERED" if r.alert_triggered else "✓ NORMAL"
                alert_col = ROSE if r.alert_triggered else EMERALD
                rc = risk_color(r.dwell_seconds)

                info_items = [
                    [Paragraph(f"#{r.tracker_id}", ps(f"tid{i}", fontSize=16, textColor=CYAN, fontName="Helvetica-Bold"))],
                    [Spacer(1, 2)],
                    [Paragraph(
                        f"<font color='#f59e0b'><b>DWELL: {dwell_str}</b></font>",
                        ps(f"dw{i}", fontSize=11, alignment=0)
                    )],
                    [Paragraph(f"Zone: <b>{r.zone_name or 'Main'}</b>", ps(f"zn{i}", fontSize=8, textColor=WHITE))],
                    [Paragraph(f"Date: {date_str}", small_s)],
                    [Paragraph(f"Enter:  {enter_str}", ps(f"en{i}", fontSize=7, fontName="Courier", textColor=GRAY))],
                    [Paragraph(f"Exit:   {exit_str}", ps(f"ex{i}", fontSize=7, fontName="Courier", textColor=GRAY))],
                    [Spacer(1, 4)],
                    [Paragraph(alert_txt, ps(f"al{i}", fontSize=7, textColor=alert_col, fontName="Helvetica-Bold"))],
                ]
                info_tbl = Table(info_items, colWidths=[IMG_W])
                info_tbl.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,-1), DARK),
                    ('TOPPADDING',    (0,0), (-1,-1), 3),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                    ('LEFTPADDING',   (0,0), (-1,-1), 6),
                    ('RIGHTPADDING',  (0,0), (-1,-1), 6),
                    ('BOX', (0,0), (-1,-1), 0.5, BORDER),
                ]))

                # ── Card = image + info ──
                card = Table(
                    [[img_cell], [info_tbl]],
                    colWidths=[IMG_W]
                )
                card.setStyle(TableStyle([
                    ('TOPPADDING',    (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 0),
                    ('LEFTPADDING',   (0,0), (-1,-1), 0),
                    ('RIGHTPADDING',  (0,0), (-1,-1), 0),
                    ('BOX', (0,0), (-1,-1), 1, rc),
                ]))

                row_cells.append(card)
                if len(row_cells) == COLS:
                    grid_rows.append(row_cells)
                    row_cells = []

            if row_cells:
                while len(row_cells) < COLS:
                    row_cells.append("")
                grid_rows.append(row_cells)

            grid = Table(grid_rows, colWidths=[IMG_W]*COLS,
                         hAlign='LEFT')
            grid.setStyle(TableStyle([
                ('VALIGN',        (0,0), (-1,-1), 'TOP'),
                ('LEFTPADDING',   (0,0), (-1,-1), 3),
                ('RIGHTPADDING',  (0,0), (-1,-1), 3),
                ('TOPPADDING',    (0,0), (-1,-1), 0),
                ('BOTTOMPADDING', (0,0), (-1,-1), 12),
            ]))
            story.append(grid)

        # ── PAGE 3: Full Records Table ─────────────────────────────────────────
        story.append(PageBreak())
        story.append(Paragraph("FULL DWELL RECORDS LOG", label_s))
        story.append(Spacer(1, 8))

        if valid_records:
            rh = [
                Paragraph("Track ID", white_b_s),
                Paragraph("Zone", white_b_s),
                Paragraph("Duration", white_b_s),
                Paragraph("Enter Time", white_b_s),
                Paragraph("Exit Time", white_b_s),
                Paragraph("Total Spent", white_b_s),
                Paragraph("Alert", white_b_s),
            ]
            rd = [rh]
            for i, r in enumerate(valid_records):
                rc = risk_color(r.dwell_seconds)
                enter_s = r.enter_time.strftime("%H:%M:%S")  if r.enter_time else "—"
                exit_s  = r.last_seen_time.strftime("%H:%M:%S") if r.last_seen_time else "—"
                rd.append([
                    Paragraph(f"#{r.tracker_id}", ps(f"ri{i}", fontSize=8, textColor=CYAN, fontName="Courier")),
                    Paragraph(r.zone_name or "—", white_s),
                    Paragraph(fmt(r.dwell_seconds), ps(f"rd{i}", fontSize=9, textColor=rc, fontName="Helvetica-Bold")),
                    Paragraph(enter_s, ps(f"re{i}", fontSize=8, textColor=GRAY, fontName="Courier")),
                    Paragraph(exit_s,  ps(f"rx{i}", fontSize=8, textColor=GRAY, fontName="Courier")),
                    Paragraph(fmt(r.dwell_seconds), ps(f"rt{i}", fontSize=8, textColor=CYAN, alignment=1)),
                    Paragraph("⚠ YES" if r.alert_triggered else "✓ OK",
                              ps(f"ra{i}", fontSize=8, fontName="Helvetica-Bold",
                                 textColor=ROSE if r.alert_triggered else EMERALD, alignment=1)),
                ])

            rt = Table(rd, colWidths=[W*0.10, W*0.22, W*0.13, W*0.14, W*0.14, W*0.13, W*0.14])
            rst = [
                ('BACKGROUND', (0,0), (-1,0), DARKER),
                ('TEXTCOLOR', (0,0), (-1,0), BRAND),
                ('TOPPADDING',    (0,0), (-1,-1), 6),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                ('LEFTPADDING',   (0,0), (-1,-1), 6),
                ('RIGHTPADDING',  (0,0), (-1,-1), 6),
                ('INNERGRID', (0,0), (-1,-1), 0.3, BORDER),
                ('BOX',       (0,0), (-1,-1), 0.5, BORDER),
            ]
            for i in range(1, len(rd)):
                rst.append(('BACKGROUND', (0,i), (-1,i), ROW_ODD if i%2==1 else ROW_EVN))
                rst.append(('TEXTCOLOR', (0,i), (-1,i), WHITE))
            rt.setStyle(TableStyle(rst))
            story.append(rt)
        else:
            story.append(Paragraph("No dwell records found.", body_s))

        # ── Footer ─────────────────────────────────────────────────────────────
        story.append(Spacer(1, 24))
        story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER))
        story.append(Spacer(1, 6))
        ft = Table([[
            Paragraph("GENERATED BY LAMINAR AI // CONFIDENTIAL", label_s),
            Paragraph(
                datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'),
                ps("ft", fontSize=7, textColor=GRAY, fontName="Courier", alignment=2)
            ),
        ]], colWidths=[W*0.65, W*0.35])
        ft.setStyle(TableStyle([('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 0)]))
        story.append(ft)

        doc.build(story)
        pdf = buffer.getvalue()
        buffer.close()
        return pdf
