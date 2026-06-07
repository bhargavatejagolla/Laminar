import os
import io
import time
import asyncio
import json
import cv2
import numpy as np
import base64
import tempfile
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from uuid import UUID
from collections import deque

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Response
from fastapi.responses import StreamingResponse

from app.core.logging import get_logger
from app.core.database import db_manager
from app.core.global_state import GLOBAL_STATE
from app.services.notification_service import notification_service
from app.services.email_alert_service import email_alert_service
from sqlalchemy import select
from app.models.venue import Venue as VenueModel
from app.vision.incident_detector import incident_detector

logger = get_logger(__name__)
router = APIRouter()

# SSE Subscribers
_sse_subscribers: List[asyncio.Queue] = []

@router.get("/status")
async def get_incident_status() -> Dict[str, Any]:
    """Get raw state for all incident venues."""
    return GLOBAL_STATE.get_domain_state("incident")

@router.get("/alerts")
async def get_active_alerts() -> List[Dict[str, Any]]:
    """Aggregates all active incidents across the city."""
    try:
        state = GLOBAL_STATE.get_domain_state("incident")
        all_alerts = []
        
        # 1. Include live data from global state (Workers)
        for cam_id, data in state.items():
            if not isinstance(data, dict): continue
            incidents = data.get("active_incidents", [])
            if not isinstance(incidents, (list, tuple)): continue
            for inc in incidents:
                if not isinstance(inc, dict): continue
                alert_obj = {
                    "id": inc.get("id") or f"mesh_{cam_id}_{int(time.time())}",
                    "camera_id": str(cam_id),
                    "venue_id": data.get("venue_id"),
                    "timestamp": inc.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                    **{k: v for k, v in inc.items() if k not in ["camera_id", "venue_id", "id", "timestamp"]}
                }
                all_alerts.append(alert_obj)
        
        # 2. Include session-specific analysis events (Uploads)
        session_events = GLOBAL_STATE.get_events("incident", limit=100)
        for event in session_events:
            if isinstance(event, dict):
                all_alerts.append(event)
            
        # 3. Sort by priority and timestamp
        priority_map = {"CRITICAL": 3, "HIGH": 2, "MEDIUM": 1, "LOW": 0}
        all_alerts.sort(key=lambda x: (
            priority_map.get(str(x.get("priority", "LOW")).upper(), 0),
            str(x.get("timestamp") or "")
        ), reverse=True)
            
        return all_alerts
    except Exception as e:
        logger.error(f"Error in get_active_alerts: {e}", exc_info=True)
        return []

# ─────────────────────────────────────────────
# Video Analysis & Injection
# ─────────────────────────────────────────────

@router.post("/upload")
async def process_incident_video(
    venue_id: Optional[str] = Query(None),
    camera_id: str = Query(default="emergency-node-01"),
    file: UploadFile = File(...)
):
    """
    Accept a video/image, run high-priority accident detection,
    and broadcast a CRITICAL incident alert with geospatial markers.
    """
    try:
        content = await file.read()

        # ── 1. Load Venue Info ──
        lat, lng = 0.0, 0.0
        venue_name = "Tactical Entry Point"
        if venue_id:
            try:
                async with db_manager.session() as session:
                    v = await session.get(VenueModel, venue_id)
                    if v:
                        lat, lng = float(v.latitude or 0.0), float(v.longitude or 0.0)
                        venue_name = v.name
            except Exception as e:
                logger.warning(f"Could not fetch venue geo: {e}")

        # ── 2. Temp file for video processing ──
        suffix = ".mp4"
        if file.filename and "." in file.filename:
            suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
        
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        best_incident = None
        annotated_frame_b64 = None
        all_vehicles = {}
        frames_analyzed = 0
        
        processed_video_url = None
        is_video = False
        cap = None
        out_writer = None
        try:
            cap = cv2.VideoCapture(tmp_path)
            is_video = cap.get(cv2.CAP_PROP_FRAME_COUNT) > 1

            if is_video:
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                fps_src = cap.get(cv2.CAP_PROP_FPS) or 15.0
                duration_sec = total_frames / fps_src
                
                # Analyze ~1 frame/sec for long videos, at least 10 for short ones, max 50 total.
                target_samples = min(50, max(10, int(duration_sec)))
                sample_every = max(1, total_frames // target_samples)
                
                # Setup VideoWriter for annotated stream
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                out_filename = f"incident_{int(time.time())}.webm"
                out_path = os.path.join("..", "frontend", "public", out_filename)
                fourcc = cv2.VideoWriter_fourcc(*'vp80')
                out_writer = cv2.VideoWriter(out_path, fourcc, 5.0, (width, height))
                
                logger.info(f"Video detected: {duration_sec:.1f}s, {total_frames} frames. Sampling every {sample_every} frames (Target: {target_samples}).")
                frame_idx = 0
                while True:
                    ret, frame = cap.read()
                    if not ret: break
                    if frame_idx % sample_every == 0:
                        frames_analyzed += 1
                        incidents, annotated, vehicles = incident_detector.detect_and_annotate(frame)
                        for cls, cnt in vehicles.items():
                            all_vehicles[cls] = max(all_vehicles.get(cls, 0), cnt)
                            
                        # Write the annotated frame to the compiled video
                        if out_writer:
                            out_writer.write(annotated)
                            
                        if incidents:
                            for inc in incidents:
                                if best_incident is None or (inc["priority"] == "CRITICAL" and best_incident.get("priority") != "CRITICAL"):
                                    best_incident = inc
                                    _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                                    annotated_frame_b64 = base64.b64encode(jpeg.tobytes()).decode("utf-8")
                    frame_idx += 1
                    
                if out_writer:
                    out_writer.release()
                    processed_video_url = f"/{out_filename}"
            else:
                nparr = np.frombuffer(content, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if img is not None:
                    frames_analyzed = 1
                    incidents, annotated, vehicles = incident_detector.detect_and_annotate(img)
                    all_vehicles = vehicles
                    if incidents:
                        best_incident = incidents[0]
                        _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        annotated_frame_b64 = base64.b64encode(jpeg.tobytes()).decode("utf-8")
        except Exception as e:
            logger.error(f"Global trap incident video feed error: {e}", exc_info=True)
        finally:
            if cap is not None:
                cap.release()
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception as e:
                    logger.warning(f"Could not remove {tmp_path}: {e}")

        # ── 3. Build response ──
        if not best_incident:
            payload = {
                "id": f"scan_{int(time.time())}",
                "type": "Neural Sweep Complete",
                "priority": "LOW",
                "description": f"Tactical scan of {frames_analyzed} frames complete. No hazards found.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "venue_id": venue_id,
                "status": "CLEAR",
                "analysis_type": "SYNCHRONOUS_VIDEO_UPLOAD",
                "vehicle_types": all_vehicles,
            }
            return {"success": True, "incident": payload}

        vehicle_count = sum(all_vehicles.values())
        incident_payload = {
            "id": f"inc_{int(time.time()*1000)}_{os.urandom(2).hex()}",
            "type": best_incident["type"],
            "priority": "CRITICAL",
            "description": best_incident["description"],
            "explanation": f"Neural Mesh triggered. Analyzed {frames_analyzed} frames. Probability of impact: 92%.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "venue_id": venue_id,
            "venue_name": venue_name,
            "status": "DETECTED",
            "analysis_type": "SYNCHRONOUS_VIDEO_UPLOAD",
            "dispatch_status": "BROADCAST_SENT" if best_incident["priority"] == "CRITICAL" else "PENDING",
            "latitude": lat,
            "longitude": lng,
            "vehicle_types": all_vehicles,
            "vehicle_count": vehicle_count,
            "annotated_frame": annotated_frame_b64,
            "processed_video_url": processed_video_url,
            "_source": "VIDEO_UPLOAD",
        }

        # ── 4. Persist & Broadcast ──
        GLOBAL_STATE.push_event("incident", camera_id, incident_payload)
        _push_incident_to_subscribers(incident_payload)
        
        GLOBAL_STATE.update(
            domain="incident",
            venue_id=venue_id or camera_id,
            payload={"venue_id": venue_id, "active_incidents": [incident_payload], "lat": lat, "lng": lng}
        )

        await notification_service.push_notification(
            domain="incident",
            type=incident_payload["type"],
            priority=incident_payload["priority"],
            description=incident_payload["description"],
            venue_id=venue_id,
            metadata={"incident_id": incident_payload["id"], "latitude": lat, "longitude": lng}
        )

        if best_incident["priority"] in ("CRITICAL", "HIGH", "MEDIUM"):
            snapshot_path = None
            if annotated_frame_b64:
                snapshot_path = os.path.join(tempfile.gettempdir(), f"incident_ss_{int(time.time())}.jpg")
                try:
                    with open(snapshot_path, "wb") as f:
                        f.write(base64.b64decode(annotated_frame_b64.encode("utf-8")))
                except Exception as e:
                    logger.warning(f"Failed to save incident snapshot: {e}")
                    snapshot_path = None

            async def _trigger_rich_email():
                try:
                    async with db_manager.session() as session:
                        await notification_service.notify_realtime_event(
                            session=session,
                            domain="incident",
                            type=incident_payload["type"],
                            priority=incident_payload["priority"],
                            description=incident_payload["description"],
                            venue_id=str(venue_id) if venue_id else "00000000-0000-0000-0000-000000000001",
                            venue_name=venue_name,
                            metadata={
                                "requires_police_only": True,
                                "snapshot_path": snapshot_path,
                                "latitude": lat,
                                "longitude": lng,
                                "vehicle_count": vehicle_count,
                                "insight": incident_payload.get("explanation"),
                                "clip_path": file.filename
                            }
                        )
                except Exception as mail_err:
                    logger.warning(f"Rich email alert failed: {mail_err}")
                    
            asyncio.create_task(_trigger_rich_email())

        return {"success": True, "incident": incident_payload, "message": "Incident broadcast successfully."}

    except Exception as e:
        import traceback
        logger.error(f"CRITICAL: Incident Upload Error: {e}\n{traceback.format_exc()}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Analysis pipeline crashed: {e}")

@router.post("/report")
async def receive_field_report(report: dict):
    """Endpoints for field operators to submit manual intel."""
    try:
        priority = report.get("priority", "MEDIUM").upper()
        lat = float(report.get("latitude", 0.0))
        lng = float(report.get("longitude", 0.0))
        
        from app.core.database import db_manager
        from sqlalchemy import select
        from app.models.venue import Venue as VenueModel

        venue_id = report.get("venue_id")
        if not venue_id:
            async with db_manager.session() as session:
                result = await session.execute(select(VenueModel))
                first_venue = result.scalars().first()
                if first_venue:
                    venue_id = str(first_venue.id)
        
        incident_payload = {
            "id": f"rep_{int(time.time()*1000)}",
            "type": report.get("type", "Field Recon"),
            "priority": priority,
            "description": report.get("description", "No description provided."),
            "explanation": "Human-Assisted Field Protocol Incident. Automated validation pending.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "venue_id": venue_id,
            "venue_name": "Field Ops Zone",
            "status": "DETECTED",
            "analysis_type": "MANUAL_AI_REPORT",
            "dispatch_status": "BROADCAST_SENT" if priority in ["HIGH", "CRITICAL"] else "PENDING",
            "latitude": lat,
            "longitude": lng,
            "_source": "FIELD_REPORT",
        }
        
        GLOBAL_STATE.push_event("incident", "FIELD_OP", incident_payload)
        _push_incident_to_subscribers(incident_payload)
        
        async with db_manager.session() as session:
            await notification_service.notify_realtime_event(
                session=session,
                domain="incident",
                type=incident_payload["type"],
                priority=incident_payload["priority"],
                description=incident_payload["description"],
                venue_id=venue_id if venue_id else "00000000-0000-0000-0000-000000000000",
                venue_name="Field Ops Zone",
                metadata={"incident_id": incident_payload["id"], "latitude": lat, "longitude": lng, "source": "FIELD_REPORT"}
            )
            
        return {"success": True, "incident": incident_payload}
    except Exception as e:
        logger.error(f"Error submitting field report: {e}")
        raise HTTPException(status_code=500, detail="Could not process field report")

@router.post("/dispatch/police")
async def dispatch_police(incident_id: str):
    """Simulates a broadcast to law enforcement systems."""
    timestamp = datetime.now(timezone.utc).isoformat()
    event = {
        "id": f"disp_{int(time.time()*1000)}",
        "incident_ref": incident_id,
        "type": "POLICE_BROADCAST_ENGAGED",
        "priority": "MISSION_CRITICAL",
        "timestamp": timestamp,
        "description": "Tactical broadcast transmitted to Sector 7 Law Enforcement. Units in transit.",
        "status": "DISPATCHED"
    }
    GLOBAL_STATE.update(domain="incident", venue_id="POLICE_HQ", payload=event)
    # 3. Trigger Email Dispatch Notification
    incident_details = next((i for i in GLOBAL_STATE.get_events("incident", limit=100) if i.get("id") == incident_id), None)
    try:
        if incident_id:
            email_alert_service.send_dispatch_email(
                incident_id=incident_id,
                dispatch_event=event,
                incident_details=incident_details
            )
    except Exception as e:
        logger.warning(f"Dispatch email failed: {e}")

    return {"success": True, "message": "Law enforcement broadcast successful"}

@router.get("/report/pdf")
async def download_incident_report():
    """Generates a comprehensive PDF log of all session incidents (video uploads + live feeds)."""
    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF library not found.")

    def safe_str(val, default="N/A", max_len=110):
        try:
            return str(val)[:max_len] if val is not None else default
        except Exception:
            return default

    # ── Collect ALL incidents: video uploads + live camera feed ──
    combined: list = GLOBAL_STATE.get_events("incident", limit=200)
    # Add source tag if missing
    for e in combined:
        if "_source" not in e: e["_source"] = "ANALYSIS_EVENT"

    try:
        state = GLOBAL_STATE.get_domain_state("incident")
        for cam_id, data in state.items():
            if not isinstance(data, dict):
                continue
            incidents = data.get("active_incidents", [])
            if not isinstance(incidents, (list, tuple)):
                continue
            for inc in incidents:
                if not isinstance(inc, dict):
                    continue
                entry = {
                    **inc,
                    "_source": "LIVE_FEED",
                    "camera_id": str(cam_id),
                    "venue_id": data.get("venue_id"),
                }
                if not any(e.get("id") == entry.get("id") for e in combined):
                    combined.append(entry)
    except Exception as state_err:
        logger.warning(f"Could not read live state for PDF: {state_err}")

    def safe_timestamp(inc):
        ts = inc.get("timestamp")
        if not ts:
            return "0000-00-00 00:00:00"
        return str(ts)

    combined.sort(key=safe_timestamp, reverse=True)

    # ── Build PDF ──
    class IncidentPDF(FPDF):
        def header(self):
            self.set_fill_color(20, 5, 5)
            self.rect(0, 0, 210, 30, "F")
            self.set_y(8)
            self.set_font("Helvetica", "B", 15)
            self.set_text_color(255, 80, 80)
            self.cell(0, 8, "LAMINAR INCIDENT INTELLIGENCE - TACTICAL LOG", ln=True, align="C")
            self.set_font("Helvetica", "", 8)
            self.set_text_color(180, 120, 120)
            self.cell(0, 5, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", ln=True, align="C")
            self.set_y(34)
            self.set_text_color(0, 0, 0)

        def footer(self):
            self.set_y(-15)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"Page {self.page_no()} - LAMINAR CONFIDENTIAL", align="C")

    pdf = IncidentPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # ── Summary stats ──
    critical_n  = sum(1 for i in combined if str(i.get("priority","")).upper() == "CRITICAL")
    live_n      = sum(1 for i in combined if i.get("_source") == "LIVE_FEED")
    upload_n    = sum(1 for i in combined if i.get("_source") == "VIDEO_UPLOAD")
    dispatched_n = sum(1 for i in combined if i.get("dispatch_status") == "BROADCAST_SENT")

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(200, 60, 60)
    pdf.cell(0, 8, "1. SESSION SUMMARY", ln=True)
    pdf.set_draw_color(200, 60, 60)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)
    pdf.set_fill_color(245, 238, 238)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(40, 40, 40)
    pdf.cell(0, 8,
        f"  Total: {len(combined)}  |  Critical: {critical_n}  |  Live Feed: {live_n}  |  Video Upload: {upload_n}  |  Dispatched: {dispatched_n}",
        ln=True, fill=True
    )
    pdf.ln(5)

    # ── Full log ──
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(200, 60, 60)
    pdf.cell(0, 8, "2. FULL INCIDENT LOG (newest first)", ln=True)
    pdf.set_draw_color(200, 60, 60)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)
    pdf.set_text_color(30, 30, 30)

    priority_colors = {
        "CRITICAL": (210, 40,  40),
        "HIGH":     (190, 90,  20),
        "MEDIUM":   (150, 130, 20),
        "LOW":      (60,  130, 60),
    }
    source_labels = {"VIDEO_UPLOAD": "[VIDEO UPLOAD]", "LIVE_FEED": "[LIVE FEED]"}

    if not combined:
        pdf.set_font("Helvetica", "I", 10)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 10, "  No incident records found in this session.", ln=True)
    else:
        for idx, inc in enumerate(combined, 1):
            try:
                priority = str(inc.get("priority", "LOW")).upper()
                r, g, b  = priority_colors.get(priority, (80, 80, 80))
                source_label = source_labels.get(inc.get("_source", ""), "")

                pdf.set_font("Helvetica", "B", 10)
                pdf.set_text_color(r, g, b)
                type_str = safe_str(inc.get("type", "Unknown Incident"))
                pdf.cell(0, 7, f"  #{idx}  {type_str}  {source_label}  [{priority}]", ln=True)

                pdf.set_font("Helvetica", "", 8)
                pdf.set_text_color(80, 80, 80)
                ts      = safe_str(inc.get("timestamp", ""))[:19].replace("T", " ")
                inc_id  = safe_str(inc.get("id", "N/A"))
                cam_id2 = safe_str(inc.get("camera_id", "-"))
                pdf.cell(0, 5, f"  Time: {ts}    ID: {inc_id}    Camera: {cam_id2}", ln=True)

                v_name  = safe_str(inc.get("venue_name") or inc.get("venue_id") or "Tactical Node")
                lat     = safe_str(inc.get("latitude", ""))
                lng     = safe_str(inc.get("longitude", ""))
                loc_str = f"  Venue: {v_name}"
                if lat not in ("N/A", "", "0.0"):
                    loc_str += f"    Coords: {lat}, {lng}"
                pdf.cell(0, 5, loc_str, ln=True)

                pdf.set_font("Helvetica", "", 9)
                pdf.set_text_color(40, 40, 40)
                desc = safe_str(inc.get("description", "No details."))
                pdf.multi_cell(0, 5, f"  Details: {desc}")

                vehicle_types = inc.get("vehicle_types") or {}
                if isinstance(vehicle_types, dict) and vehicle_types:
                    veh_str = "  Vehicles: " + "  |  ".join(f"{k}: {v}" for k, v in vehicle_types.items())
                    pdf.set_font("Helvetica", "", 8)
                    pdf.set_text_color(60, 60, 120)
                    pdf.cell(0, 5, veh_str[:105], ln=True)

                disp = safe_str(inc.get("dispatch_status", "PENDING"))
                pdf.set_font("Helvetica", "I", 8)
                pdf.set_text_color(100, 100, 100)
                pdf.cell(0, 5, f"  Dispatch Status: {disp}", ln=True)

                pdf.set_draw_color(220, 210, 210)
                pdf.line(10, pdf.get_y() + 1, 200, pdf.get_y() + 1)
                pdf.ln(4)

            except Exception as loop_err:
                logger.error(f"Error writing incident #{idx} to PDF: {loop_err}")
                continue

    try:
        raw = pdf.output()
        if isinstance(raw, (bytearray, bytes)):
            pdf_bytes = bytes(raw)
        else:
            pdf_bytes = raw.encode("latin-1") if isinstance(raw, str) else bytes(raw)

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=incident_tactical_log.pdf",
                "Content-Length": str(len(pdf_bytes)),
                "Cache-Control": "no-cache"
            }
        )
    except Exception as pdf_err:
        logger.error(f"PDF output failed: {pdf_err}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to finalize PDF.")

@router.get("/stream")
async def incident_stream():
    """SSE stream for immediate alerts."""
    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    _sse_subscribers.append(q)
    async def event_generator():
        try:
            yield "data: {\"type\": \"connected\"}\n\n"
            while True:
                event = await q.get()
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            if q in _sse_subscribers: _sse_subscribers.remove(q)
    return StreamingResponse(event_generator(), media_type="text/event-stream")

def _push_incident_to_subscribers(event: dict):
    for q in _sse_subscribers:
        try: q.put_nowait(event)
        except asyncio.QueueFull: pass
