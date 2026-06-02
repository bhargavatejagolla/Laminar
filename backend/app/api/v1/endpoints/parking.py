import os
import io
import json
import time
import asyncio
import tempfile
import cv2
import numpy as np
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID

from fastapi import APIRouter, Body, UploadFile, File, Query, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from app.vision.parking_detector import parking_detector
from app.services.sms_alert_service import SmsAlertService
from app.services.notification_service import notification_service
from app.core.database import db_manager
from sqlalchemy import select
from app.models.user import User

import smtplib
from email.message import EmailMessage
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()
_sse_subscribers = set()
_last_alert_state = {}
_last_injected_frame_bytes = {} # Fixes NameError in feed

async def send_dedicated_parking_email(venue_obj, occ_pct, occupancy, capacity, tier_label):
    def _sync_send():
        try:
            msg = EmailMessage()
            msg["Subject"] = f"[LAMINAR] {tier_label} ALERT: {venue_obj.name} Parking Capacity"
            msg["From"] = settings.SMTP_USER
            
            # Fetch emails directly from settings
            recipients = []
            if settings.MANAGEMENT_EMAILS:
                recipients.extend([e.strip() for e in settings.MANAGEMENT_EMAILS.split(",") if e.strip()])
            if tier_label in ["MEDIUM", "HIGH", "CRITICAL"] and settings.SUPERVISOR_EMAILS:
                recipients.extend([e.strip() for e in settings.SUPERVISOR_EMAILS.split(",") if e.strip()])
            if tier_label in ["HIGH", "CRITICAL"] and settings.POLICE_EMAILS:
                recipients.extend([e.strip() for e in settings.POLICE_EMAILS.split(",") if e.strip()])
            
            recipients = list(set(recipients))
            if not recipients:
                logger.warning("No recipients found for dedicated email.")
                return
                
            msg["To"] = ", ".join(recipients)
            
            lat = getattr(venue_obj, 'latitude', 'Unknown')
            lng = getattr(venue_obj, 'longitude', 'Unknown')
            maps_link = f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
            
            color = "#dc2626" if tier_label == "CRITICAL" else "#ea580c" if tier_label == "HIGH" else "#eab308"
            
            html = f"""
            <html>
            <body style="font-family: sans-serif; background: #f8fafc; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <div style="background: {color}; color: white; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px;">🚨 {tier_label} PARKING ALERT</h1>
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="margin-top: 0; color: #1e293b;">📍 {venue_obj.name}</h2>
                        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
                            The <strong>{venue_obj.name}</strong> parking facility has reached <strong>{int(occ_pct)}% capacity</strong> and triggered a {tier_label} alert.
                        </p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin: 25px 0; background: #f1f5f9; border-radius: 6px;">
                            <tr>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #475569;"><strong>Detected Vehicles:</strong></td>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 18px; color: #0f172a;">{occupancy}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #475569;"><strong>Total Zones:</strong></td>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 18px; color: #0f172a;">{capacity}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #475569;"><strong>Coordinates:</strong></td>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #3b82f6;">{lat}, {lng}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 15px; color: #475569;"><strong>Threshold Reached:</strong></td>
                                <td style="padding: 12px 15px; text-align: right; font-weight: bold; color: {color};">{tier_label}</td>
                            </tr>
                        </table>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="{maps_link}" style="display: inline-block; background: #0f172a; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; letter-spacing: 1px;">OPEN IN GOOGLE MAPS ↗</a>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            """
            
            msg.add_alternative(html, subtype="html")
            
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
                
            logger.info(f"✅ DEDICATED PARKING EMAIL SENT for {venue_obj.name} to {recipients}")
            
        except Exception as e:
            logger.error(f"❌ DEDICATED PARKING EMAIL FAILED: {e}")
            
    await asyncio.to_thread(_sync_send)

# ─────────────────────────────────────────────
# SSE Subscribers
# ─────────────────────────────────────────────

def _push_event(camera_id: str, event: dict):
    """Push a detection event to central store and all SSE subscribers."""
    from app.core.global_state import GLOBAL_STATE
    GLOBAL_STATE.push_event("parking", camera_id, event)
    
    # Broadcast to SSE subscribers (non-blocking)
    for q in list(_sse_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass  # Slow consumer, drop


def push_parking_event(camera_id: str, vehicles: list, frame_shape: tuple, venue_id: Optional[str] = None, avg_velocity: float = 0.0, occupancy_pct: float = 0.0, capacity: int = 100, occupancy: int = 0, warn_thresh_override: int = None, crit_thresh_override: int = None, venue_name_override: str = None, lat_override: float = None, lng_override: float = None):
    # ── Calculate Current Risk Context ──
    count = len(vehicles)

    risk_level = "low"
    density = "Low"
    warn_pct = 75.0
    crit_pct = 100.0
    lat, lng = 0.0, 0.0
    venue_name = "Unknown Facility"
    
    
    if venue_id:
        try:
            from app.core.global_state import GLOBAL_STATE
            v_state = GLOBAL_STATE.get_venue_state("parking", venue_id)
            if v_state:
                if capacity <= 0 and "capacity" in v_state:
                    capacity = v_state.get("capacity", 100)
                if "warning_threshold" in v_state:
                    warn_cnt = float(v_state.get("warning_threshold", 75))
                    warn_pct = (warn_cnt / capacity) * 100 if capacity > 0 else 75.0
                if "critical_threshold" in v_state:
                    crit_cnt = float(v_state.get("critical_threshold", 100))
                    crit_pct = (crit_cnt / capacity) * 100 if capacity > 0 else 100.0
                if "location" in v_state and v_state["location"]:
                    lat = float(v_state["location"].get("lat", 0.0))
                    lng = float(v_state["location"].get("lng", 0.0))
                if "name" in v_state:
                    venue_name = v_state["name"]
            else:
                from app.core.database import db_manager
                # fallback to db if not in state
                import asyncio
                # Use a background task or run_until_complete if we must, but since this is synchronous, 
                # we can't easily await. We rely on the unified `GLOBAL_STATE` or passing thresholds correctly.
                pass
        except Exception:
            pass
            
    # Apply Overrides if they were passed (critical for DB fallback from async caller)
    if warn_thresh_override is not None and capacity > 0:
        warn_pct = (warn_thresh_override / capacity) * 100
    if crit_thresh_override is not None and capacity > 0:
        crit_pct = (crit_thresh_override / capacity) * 100
    if venue_name_override is not None:
        venue_name = venue_name_override
    if lat_override is not None:
        lat = float(lat_override)
    if lng_override is not None:
        lng = float(lng_override)
        
    if capacity <= 0: capacity = 100
    
    calc_occ_pct = occupancy_pct
    if calc_occ_pct <= 0 and capacity > 0:
        calc_occ_pct = (count / capacity * 100)

    if calc_occ_pct >= crit_pct:
        risk_level = "critical"
    elif calc_occ_pct >= warn_pct:
        risk_level = "high"
    elif calc_occ_pct >= warn_pct * 0.75:
        risk_level = "medium"

    # Push Individual Events
    for idx, v in enumerate(vehicles):
        b = v.get("bbox", [0,0,0,0])
        event = {
            "id": f"{camera_id[:8]}-{int(time.time()*1000)}-{idx}",
            "camera_id": camera_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": v.get("type", "vehicle"),
            "confidence": round(v.get("confidence", 0) * 100, 1),
            "bbox": [round(x, 1) for x in b],
            "position": f"({int(b[0])},{int(b[1])})",
            "risk": risk_level
        }
        _push_event(camera_id, event)

    # Push Aggregate Summary Event for the Log
    car_count = sum(1 for v in vehicles if v.get("type", "").lower() == "car")
    bike_count = sum(1 for v in vehicles if v.get("type", "").lower() in ["motorcycle", "bike", "bicycle"])
    truck_count = sum(1 for v in vehicles if v.get("type", "").lower() in ["truck", "bus"])
    summary_msg = f"Detected {car_count} cars, {bike_count} bikes, and {truck_count} trucks."
    
    _push_event(camera_id, {
        "id": f"SUMMARY-{camera_id[:8]}-{int(time.time()*1000)}",
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "summary",
        "message": summary_msg,
        "confidence": 100.0,
        "position": "overview",
        "risk": risk_level
    })

    # Classify risk
    if occupancy_pct >= crit_pct:
        risk_level = "critical"
        density = "Critical"
    elif occupancy_pct >= warn_pct:
        risk_level = "high"
        density = "High"
    elif occupancy_pct >= warn_pct * 0.75: # e.g. if warning is 80%, this triggers at 60%
        risk_level = "medium"
        density = "Medium"
    else:
        risk_level = "low"
        density = "Low"

    # High Velocity Threat Override
    if avg_velocity > 15.0:
        risk_level = "critical"
        density = "High Velocity Hazard"

    # Block if low risk (unless it's an upload demo)
    if risk_level == "low" and camera_id != "upload-demo":
        return
    
    # State transition guard (per camera)
    last_state = _last_alert_state.get(camera_id, "low")
    if risk_level == last_state and camera_id != "upload-demo":
        return
    _last_alert_state[camera_id] = risk_level

    if risk_level != "low":
        insight = _generate_parking_insight(count, density, capacity)
        prediction = _generate_parking_prediction(density)
        recommendation = _generate_parking_recommendation(density)
        
        # Always store in notifications feed (used by PDF and dashboard bell)
        from app.core.global_state import GLOBAL_STATE
        GLOBAL_STATE.push_event("notifications", "parking", {
            "id": f"NOTIF-PRK-{int(time.time()*1000)}",
            "domain": "parking",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "risk_level": risk_level,
            "total_vehicles": count,
            "congestion_level": density,
            "wait_time": 0,
            "insight": insight,
            "prediction": prediction,
            "recommendation": recommendation,
            "venue_id": venue_id,
            "venue_name": venue_name,
            "lat": lat,
            "lng": lng,
            "recipients": ["management", "user_profile", "security"]
        })

        # CRITICAL: Push to unified mesh SSE so NotificationMesh picks it up
        async def _trigger_mesh():
            try:
                from app.core.database import db_manager
                async with db_manager.session() as session:
                    # Sanitize venue_id
                    v_id = venue_id
                    if v_id == "undefined" or not v_id:
                        v_id = None
                    
                    if not v_id:
                        from app.models.venue import Venue as VenueModel
                        stmt = select(VenueModel).where(VenueModel.name == 'chat')
                        res = await session.execute(stmt)
                        v_obj = res.scalar_one_or_none()
                        if v_obj: v_id = str(v_obj.id)

                    if v_id:
                        await notification_service.notify_realtime_event(
                            session=session,
                            domain="parking",
                            type=f"Parking {density} Alert",
                            priority=risk_level.upper(),
                            description=insight,
                            venue_id=v_id,
                            venue_name="Parking Facility",
                            camera_id=camera_id,
                            metadata={
                                "total_vehicles": count, 
                                "occupancy_pct": round(calc_occ_pct, 1), 
                                "insight": insight,
                                "prediction": prediction,
                                "recommendation": recommendation
                            }
                        )
            except Exception as e:
                logger.error(f"Mesh notification failed: {e}")

        # Fire dedicated email
        async def _fire_dedicated_email():
            try:
                from app.core.database import db_manager
                from app.models.venue import Venue as VenueModel
                async with db_manager.session() as session:
                    v_id = venue_id
                    if v_id == "undefined" or not v_id:
                        v_id = None
                    
                    v_obj = None
                    if v_id:
                        v_obj = await session.get(VenueModel, UUID(v_id))
                    
                    if not v_obj:
                        stmt = select(VenueModel).where(VenueModel.name == 'chat')
                        res = await session.execute(stmt)
                        v_obj = res.scalar_one_or_none()
                    
                    if v_obj:
                        await send_dedicated_parking_email(v_obj, calc_occ_pct, count, capacity, risk_level.upper())
            except Exception as e:
                logger.error(f"Email notification failed: {e}")

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_trigger_mesh())
            loop.create_task(_fire_dedicated_email())
        except Exception as e:
            logger.error(f"Failed to create notification tasks: {e}")


def _generate_parking_insight(count: int, density: str, capacity: int) -> str:
    if density == "Critical":
        return f"URGENT: Facility is 100% full ({count}/{capacity}). Re-routing required."
    elif density == "High":
        return f"WARNING: Load is crossing warning thresholds ({count}/{capacity})."
    return f"Load update: Facility has crossed 50% capacity ({count}/{capacity})."


def _generate_parking_prediction(density: str) -> str:
    if density == "Critical":
        return "Complete gridlock. No spaces available."
    elif density == "High":
        return "Expect peak capacity saturation shortly."
    return "Entering secondary capacity loads."


def _generate_parking_recommendation(density: str) -> str:
    if density == "Critical":
        return "STRATEGIC: Activate Overflow Lot immediately. Shut entry gates."
    elif density == "High":
        return "TACTICAL: Monitor active outflow. Deploy floor marshals."
    return "OPERATIONAL: Display 'Limited Availability' on digital signs."


# ─────────────────────────────────────────────
# Notification
# ─────────────────────────────────────────────

class NotifyPayload(BaseModel):
    message: str

# Standard notification handled via notification_service


# ─────────────────────────────────────────────
# Status & Insights
# ─────────────────────────────────────────────

@router.get("/status")
async def get_parking_status():
    """Raw occupancy mapping."""
    return parking_detector.get_current_status()


@router.get("/insights")
async def get_parking_insights():
    """LAMINAR intelligence layer."""
    return await parking_detector.get_current_insights()


# ─────────────────────────────────────────────
# Notify Endpoint
# ─────────────────────────────────────────────

@router.post("/notify")
async def parking_notify(payload: dict = Body(default={})):
    """Send a notification alert for parking threshold events."""
    message = payload.get("message", "Parking alert triggered.")
    logger.info(f"PARKING NOTIFY: {message}")
    # Fire via SMS/notification service if available
    try:
        from app.services.notification_service import get_notification_service
        ns = get_notification_service()
        await ns.send_parking_alert(message)
    except Exception as e:
        logger.warning(f"Notification service unavailable: {e}")
    return {"status": "ok", "message": message}


@router.post("/reset-frame")
async def reset_parking_frame(camera_id: Optional[str] = Query(None)):
    """Reset/clear an injected static frame so the feed returns to live stream."""
    from app.core.global_state import GLOBAL_STATE
    state = GLOBAL_STATE.get_domain_state("parking")
    
    cam_id = camera_id or (list(state.get("slots", {}).keys())[0] if state.get("slots") else None)
    if cam_id and cam_id in state.get("slots", {}):
        GLOBAL_STATE.update_parking_state(cam_id, {
            "slots": {},
            "total_slots": 0,
            "total_occupied": 0,
            "total_available": 0,
            "frame": None,
        })
        logger.info(f"Frame reset for camera {cam_id}")
    if cam_id in _last_injected_frame_bytes:
        _last_injected_frame_bytes.pop(cam_id)
    return {"status": "cleared", "camera_id": cam_id}


# ─────────────────────────────────────────────
# Image Injection (MVP Demo)
# ─────────────────────────────────────────────

@router.post("/upload")
async def upload_parking_source(
    venue_id: Optional[str] = Query(None),
    camera_id: str = Query(default="upload-demo"),
    file: UploadFile = File(...)
):
    """
    Accept an image or video, run YOLO detection, and return immediate parking stats.
    Supports multi-frame sampling for videos.
    """
    try:
        contents = await file.read()
        
        # ── 1. Create temp file for processing ──
        suffix = ".mp4"
        if file.filename and "." in file.filename:
            suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
        
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        # ── 2. Determine if Video or Image ──
        cap = cv2.VideoCapture(tmp_path)
        is_video = cap.get(cv2.CAP_PROP_FRAME_COUNT) > 1
        
        img = None
        all_detections = []
        best_vehicles = []
        avg_velocity = 0.0
        
        if not is_video:
            # Single Image Path
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is not None:
                res = await parking_detector.detect_vehicles(img, camera_id)
                best_vehicles = res.get("vehicles", [])
                all_detections = res.get("all_detections", best_vehicles)
                avg_velocity = res.get("avg_velocity", 0.0)
        else:
            # Video Path: Sample frames
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            sample_every = max(1, total_frames // 10) # 10 samples
            
            samples_data = []
            frame_idx = 0
            while True:
                ret, frame = cap.read()
                if not ret: break
                if frame_idx % sample_every == 0:
                    res = await parking_detector.detect_vehicles(frame, camera_id)
                    samples_data.append({
                        "frame": frame.copy(),
                        "count": len(res.get("all_detections", [])),
                        "res": res
                    })
                frame_idx += 1
            
            # Use the frame with highest occupancy as the 'representative' one
            if samples_data:
                highest = max(samples_data, key=lambda x: x["count"])
                img = highest["frame"]
                best_vehicles = highest["res"].get("vehicles", [])
                all_detections = highest["res"].get("all_detections", [])
                avg_velocity = highest["res"].get("avg_velocity", 0.0)
        
        cap.release()
        try: os.unlink(tmp_path)
        except: pass

        if img is None:
            raise HTTPException(400, "Invalid media file")

        # ── 3. Strategic Worker Injection (for live feed sync) ──
        from app.vision.orchestrator import ORCHESTRATOR
        from app.vision.parking_worker import ParkingWorker
        worker_to_inject = None
        if camera_id and camera_id != "upload-demo":
            try:
                cam_uuid = UUID(camera_id)
                w = ORCHESTRATOR._workers.get(cam_uuid)
                if w and isinstance(w, ParkingWorker):
                    worker_to_inject = w
            except: pass
        
        # ── 4. Strategic Capacity Resolution ──
        venue_capacity = None
        warn_thresh = None
        crit_thresh = None
        v_name = None
        v_lat = None
        v_lng = None
        
        if venue_id:
            from app.core.global_state import GLOBAL_STATE
            v_state = GLOBAL_STATE.get_venue_state("parking", venue_id)
            if v_state and v_state.get("capacity", 0) > 0:
                venue_capacity = v_state["capacity"]
                warn_thresh = v_state.get("warning_threshold")
                crit_thresh = v_state.get("critical_threshold")
                v_name = v_state.get("name")
                if "location" in v_state and v_state["location"]:
                    v_lat = v_state["location"].get("lat")
                    v_lng = v_state["location"].get("lng")
            else:
                try:
                    async with db_manager.session() as session:
                        from app.models.venue import Venue as VenueModel
                        v_obj = await session.get(VenueModel, UUID(venue_id))
                        if v_obj and v_obj.capacity:
                            venue_capacity = v_obj.capacity
                            warn_thresh = v_obj.warning_threshold
                            crit_thresh = v_obj.critical_threshold
                            v_name = v_obj.name
                            v_lat = v_obj.latitude
                            v_lng = v_obj.longitude
                except: pass

        # ── 4. Zone Occupancy ──
        slot_states = await parking_detector.detect_occupancy(img, all_detections, max_slots=venue_capacity)
        occupancy = sum(1 for s in slot_states.values() if s["occupied"])
        capacity = len(slot_states)
        occ_pct = round((occupancy / capacity) * 100) if capacity > 0 else 0

        # ── 5. Global State & Injection ──
        try:
            push_parking_event(
                camera_id=camera_id, vehicles=best_vehicles, frame_shape=img.shape,
                venue_id=venue_id, avg_velocity=avg_velocity, 
                occupancy_pct=occ_pct, capacity=capacity, occupancy=occupancy,
                warn_thresh_override=warn_thresh, crit_thresh_override=crit_thresh,
                venue_name_override=v_name, lat_override=v_lat, lng_override=v_lng
            )
        except Exception as e:
            logger.error(f"FAILURE IN push_parking_event: {str(e)}", exc_info=True)

        # ── 6. UI Visualization ──
        v_overlay = img.copy()
        
        # Draw green polygons only for EMPTY spaces
        for zid, state in slot_states.items():
            if not state["occupied"]:
                poly = np.array(state["polygon"], dtype=np.int32)
                cv2.fillPoly(v_overlay, [poly], (0, 200, 0))
        shaded_img = cv2.addWeighted(v_overlay, 0.15, img, 0.85, 0)

        # Draw red bounding boxes exclusively around the detected vehicles
        for v in best_vehicles:
            bbox = v.get("bbox", [])
            if len(bbox) == 4:
                vx1, vy1, vx2, vy2 = map(int, bbox)
                cv2.rectangle(shaded_img, (vx1, vy1), (vx2, vy2), (0, 0, 255), 2)
                conf = int(v.get("confidence", 0) * 100)
                # Small label on vehicle
                cv2.putText(shaded_img, f"veh {conf}%", (vx1, max(vy1 - 8, 0)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        # Cache for feed fallback
        _, buf = cv2.imencode(".jpg", shaded_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        _last_injected_frame_bytes[camera_id] = buf.tobytes()

        # Detailed AI context
        status = "CRITICAL" if occ_pct > 85 else "HIGH" if occ_pct > 60 else "NOMINAL"
        suggestion = (
            "CRITICAL COMMAND: Total spatial saturation threshold breached. Initiating active redirect." if status == "CRITICAL" else
            "CAUTION: High-density cluster forming. Analyzing ingress telemetry." if status == "HIGH" else
            "SYSTEM NOMINAL: Neural heuristic shows optimal throughput."
        )
        
        # Prepare response object but don't return yet
        res_obj = {
            "success": True,
            "overall": {
                "occupancy_pct": occ_pct,
                "total_slots": capacity,
                "total_available": capacity - occupancy,
                "status": status,
                "occupied_spots": occupancy
            },
            "suggestion": suggestion,
            "prediction": "Peak saturation imminent" if status == "CRITICAL" else "Stable flow trajectory",
            "zones": {
                zid: {
                    "occupancy_pct": 100 if s["occupied"] else 0, 
                    "available": 0 if s["occupied"] else 1, 
                    "capacity": 1, 
                    "status": "CRITICAL" if s["occupied"] else "AVAILABLE"
                } for zid, s in slot_states.items()
            }
        }

    except Exception as e:
        logger.error(f"Media analysis failed: {e}", exc_info=True)
        raise HTTPException(500, f"Analysis aborted: {str(e)}")

    # Always update Global State so /insights polling picks up the new occupancy
    from app.core.global_state import GLOBAL_STATE
    GLOBAL_STATE.update_domain_camera(
        domain="parking",
        camera_id=camera_id,
        payload={
            "venue_id": venue_id,
            "occupied_spots": occupancy,
            "total_slots": capacity,
            "available_slots": capacity - occupancy,
            "camera_id": camera_id,
            "slot_states": slot_states,
            "analysis_mode": True
        }
    )
    # Also update venue-level if we have venue_id
    if venue_id:
        GLOBAL_STATE.update(
            domain="parking",
            venue_id=venue_id,
            payload={
                "venue_id": venue_id,
                "occupied_spots": occupancy,
                "total_slots": capacity,
                "available_slots": capacity - occupancy,
                "camera_id": camera_id,
                "slot_states": slot_states,
                "analysis_mode": True
            }
        )
    
    # Injected Frame is set to the correct worker
    if worker_to_inject:
        worker_to_inject.injected_frame = img.copy()

    # Notifications are now handled centrally via push_parking_event

    return res_obj


# ─────────────────────────────────────────────
# SSE Events Stream
# ─────────────────────────────────────────────

@router.get("/events/stream")
async def parking_events_stream():
    """
    Server-Sent Events stream for real-time detection notifications.
    Frontend subscribes with EventSource('/api/v1/parking/events/stream').
    """
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _sse_subscribers.add(q)

    async def event_generator():
        try:
            # Send initial ping
            yield "data: {\"type\": \"connected\"}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"  # prevent proxy timeouts
        finally:
            _sse_subscribers.remove(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# ─────────────────────────────────────────────
# Recent Detection Events
# ─────────────────────────────────────────────

@router.get("/events/recent")
async def get_recent_events(camera_id: Optional[str] = Query(None), limit: int = Query(20)):
    """Return the N most recent detection events, optionally filtered by camera."""
    from app.core.global_state import GLOBAL_STATE
    events = GLOBAL_STATE.get_events("parking", camera_id, limit=limit)
    return {"events": events, "total": len(events)}


# ─────────────────────────────────────────────
# 10-Second Video Snapshot Download
# ─────────────────────────────────────────────

@router.get("/snapshot/video")
async def download_parking_snapshot(camera_id: Optional[str] = Query(None)):
    """
    Encodes the last 10 seconds of the live parking feed into an MP4 and returns
    it as a downloadable response.
    """
    from app.vision.orchestrator import ORCHESTRATOR
    from app.vision.parking_worker import ParkingWorker
    import uuid

    # Find the target worker
    worker = None
    for cid, w in list(ORCHESTRATOR._workers.items()):
        if isinstance(w, ParkingWorker):
            if camera_id is None or str(cid) == camera_id:
                worker = w
                break

    if not worker:
        return Response(content="No active parking worker found", status_code=404)

    # Collect frames over 10 seconds
    fps = 5
    duration = 10
    frames = []
    for _ in range(fps * duration):
        raw = getattr(worker, "last_annotated_frame", None)
        if raw is not None:
            frames.append(raw.copy())
        await asyncio.sleep(1.0 / fps)

    if not frames:
        return Response(content="No frames available", status_code=404)

    # Encode to MP4 in memory
    h, w = frames[0].shape[:2]
    tmp_path = os.path.join(tempfile.gettempdir(), f"parking_{uuid.uuid4().hex}.mp4")
    out = cv2.VideoWriter(tmp_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for f in frames:
        out.write(f)
    out.release()

    with open(tmp_path, "rb") as fh:
        video_bytes = fh.read()
    os.remove(tmp_path)

    return Response(
        content=video_bytes,
        media_type="video/mp4",
        headers={"Content-Disposition": "attachment; filename=parking_capture.mp4"},
    )


# ─────────────────────────────────────────────
# Heatmap Endpoint
# ─────────────────────────────────────────────

@router.get("/heatmap/{camera_id}")
async def get_parking_heatmap(camera_id: str):
    """Returns a JPEG heatmap of vehicle activity for the specified camera."""
    from app.vision.orchestrator import ORCHESTRATOR
    from app.vision.parking_worker import ParkingWorker
    try:
        cam_uuid = UUID(camera_id)
    except ValueError:
        return Response(content="Invalid camera_id", status_code=400)

    worker = ORCHESTRATOR._workers.get(cam_uuid)
    heatmap = getattr(worker, "_heatmap", None) if worker else None

    if heatmap is None or not isinstance(worker, ParkingWorker):
        # Return blank placeholder
        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(blank, "HEATMAP NOT READY", (160, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 200, 200), 2)
        _, buf = cv2.imencode(".jpg", blank)
        return Response(content=buf.tobytes(), media_type="image/jpeg")

    # Normalize and colorize
    norm = cv2.normalize(heatmap, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    colored = cv2.applyColorMap(norm, cv2.COLORMAP_JET)
    
    # Overlay on last annotated frame if available
    base = getattr(worker, "last_annotated_frame", None)
    if base is not None:
        resized_heat = cv2.resize(colored, (base.shape[1], base.shape[0]))
        output = cv2.addWeighted(base, 0.5, resized_heat, 0.5, 0)
    else:
        output = colored

    _, buf = cv2.imencode(".jpg", output, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return Response(
        content=buf.tobytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-cache"},
    )


# ─────────────────────────────────────────────
# PDF Report
# ─────────────────────────────────────────────

@router.get("/report/pdf")
async def download_parking_report(camera_id: Optional[str] = Query(None)):
    """
    Generates and downloads a PDF detection matrix report.
    Uses fpdf2 if installed, falls back to a plain CSV-like text response.
    """
    from app.core.global_state import GLOBAL_STATE
    events = GLOBAL_STATE.get_events("parking", camera_id, limit=200)

    try:
        from fpdf import FPDF
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "LAMINAR - Parking Intelligence Report", ln=True, align="C")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 6, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", ln=True, align="C")
        pdf.ln(5)

        # Table header
        pdf.set_fill_color(20, 20, 30)
        pdf.set_text_color(0, 220, 180)
        pdf.set_font("Helvetica", "B", 9)
        col_w = [12, 38, 25, 18, 40]
        headers = ["#", "Timestamp", "Type", "Conf%", "Position"]
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 7, h, border=1, fill=True)
        pdf.ln()

        # Rows
        pdf.set_text_color(40, 40, 40)
        pdf.set_font("Helvetica", "", 8)
        for idx, ev in enumerate(events, 1):
            ts = ev.get("timestamp", "")[:19].replace("T", " ")
            row = [str(idx), ts, ev.get("type",""), f"{ev.get('confidence',0)}%", ev.get("position","")]
            fill = idx % 2 == 0
            pdf.set_fill_color(245, 245, 255) if fill else pdf.set_fill_color(255, 255, 255)
            for i, cell in enumerate(row):
                pdf.cell(col_w[i], 6, cell, border=1, fill=fill)
            pdf.ln()

        # Summary
        pdf.ln(5)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(20, 20, 30)
        pdf.cell(0, 8, f"Total Detections: {len(events)}", ln=True)
        # Class distribution
        class_counts = {}
        for ev in events:
            t = ev.get('type', 'unknown')
            class_counts[t] = class_counts.get(t, 0) + 1
        pdf.cell(0, 8, f"Class Distribution: {', '.join([f'{k}: {v}' for k,v in class_counts.items()])}", ln=True)

        buf = io.BytesIO()
        buf.write(pdf.output())
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=parking_report.pdf"},
        )

    except ImportError:
        # Fallback: plain CSV
        lines = ["#,Timestamp,Type,Confidence%,Position,Camera"]
        for idx, ev in enumerate(events, 1):
            lines.append(f"{idx},{ev.get('timestamp','')},{ev.get('type','')},{ev.get('confidence',0)},{ev.get('position','')},{ev.get('camera_id','')}")
        content = "\n".join(lines)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=parking_report.csv"},
        )


# ─────────────────────────────────────────────
# MJPEG Live Stream
# ─────────────────────────────────────────────

@router.get("/stream/{camera_id}")
async def stream_parking_camera(camera_id: str):
    """
    MJPEG live stream for a parking camera.
    Returns annotated frames from the active ParkingWorker.
    Frontend should use: /api/v1/parking/stream/{camera_id}
    """
    from app.vision.orchestrator import ORCHESTRATOR
    from app.vision.parking_worker import ParkingWorker

    # Sanitize camera_id (handle cases like 'parking/UUID')
    if "/" in camera_id:
        camera_id = camera_id.split("/")[-1]

    try:
        cam_uuid = UUID(camera_id)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(404, f"Invalid camera_id UUID: {camera_id}")

    blank = np.zeros((360, 640, 3), dtype=np.uint8)
    cv2.putText(blank, "PARKING FEED INITIALIZING", (120, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 200), 2)
    _, blank_jpg = cv2.imencode(".jpg", blank)
    blank_bytes = blank_jpg.tobytes()

    async def frame_generator():
        boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        while True:
            worker = ORCHESTRATOR._workers.get(cam_uuid)
            
            # Prioritize injected frame (if analysis mode is active)
            injected = _last_injected_frame_bytes.get(camera_id)
            if injected:
                frame_bytes = injected
            elif worker and isinstance(worker, ParkingWorker):
                frame_bytes = getattr(worker, "_cached_frame_bytes", None)
                
            yield boundary + (frame_bytes if frame_bytes else blank_bytes) + b"\r\n"
            await asyncio.sleep(0.08)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Duplicate removed


# ─────────────────────────────────────────────
# Legacy feed (keep for backward compatibility)
# ─────────────────────────────────────────────

@router.get("/feed")
async def parking_video_feed():
    """Active visual stream relay for the global dashboard."""
    from app.vision.orchestrator import ORCHESTRATOR
    from app.vision.parking_worker import ParkingWorker
    
    async def frame_gen():
        boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        while True:
            frame_bytes = None
            for w in ORCHESTRATOR._workers.values():
                if isinstance(w, ParkingWorker):
                    frame_bytes = getattr(w, "_cached_frame_bytes", None)
                    break
            
            # Fallback to general upload-demo or the first available injected cache item
            if not frame_bytes and _last_injected_frame_bytes:
                fallback_key = "upload-demo" if "upload-demo" in _last_injected_frame_bytes else list(_last_injected_frame_bytes.keys())[0]
                frame_bytes = _last_injected_frame_bytes[fallback_key]
            
            if frame_bytes is not None:
                yield boundary + frame_bytes + b"\r\n"
            else:
                blank = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(blank, "WAITING FOR CAMERA", (100, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,200,200), 2)
                _, buf = cv2.imencode(".jpg", blank)
                yield boundary + buf.tobytes() + b"\r\n"
                
            await asyncio.sleep(0.08)

    return StreamingResponse(frame_gen(), media_type="multipart/x-mixed-replace; boundary=frame")
