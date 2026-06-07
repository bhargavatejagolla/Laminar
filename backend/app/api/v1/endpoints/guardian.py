from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from app.vision.orchestrator import VisionOrchestrator
import logging
import cv2
import asyncio
import time
import math
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from app.vision.detector import get_detector
from app.vision.kinetic_detector import KineticDetector
from app.vision.kinetic_worker import draw_pose_overlay
from app.services.notification_service import notification_service
from app.core.database import db_manager

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/stream/{camera_id}", summary="Get MJPEG Guardian Video Stream")
async def guardian_video_stream(camera_id: str):
    worker = VisionOrchestrator.get_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Guardian worker not initialized or camera not active")
        
    return StreamingResponse(
        worker.get_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/events/{camera_id}", summary="Get SSE events for Guardian Route tracking")
async def guardian_event_stream(camera_id: str):
    worker = VisionOrchestrator.get_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Guardian worker not initialized or camera not active")

    return StreamingResponse(
        worker.get_events(),
        media_type="text/event-stream"
    )

# --- GUARDIAN ROUTE WEBCAM DEMO ---

GUARDIAN_STATE = {
    "subject_id": "Protected Subject (A91)",
    "current_zone": "Scanning...",
    "route_progress": 0,
    "safety_score": 96,
    "risk_trend": "Stable",
    "timeline": [],
    "reasoning": [],
    "sos_activated": False,
    "incident_created": False,
    "incident_id": None,
    "randy_summary": "Guardian system online. Awaiting subject detection."
}

FORCE_STOP_GUARDIAN = False
GUARDIAN_SNAPSHOT = None

def add_timeline_event(message: str):
    global GUARDIAN_STATE
    ts = datetime.now().strftime("%H:%M:%S")
    if not GUARDIAN_STATE["timeline"] or GUARDIAN_STATE["timeline"][-1]["message"] != message:
        GUARDIAN_STATE["timeline"].append({"timestamp": ts, "message": message})

@router.post("/webcam_reset")
def reset_guardian_state():
    global GUARDIAN_STATE, FORCE_STOP_GUARDIAN
    GUARDIAN_STATE = {
        "subject_id": "A91",
        "current_zone": "Scanning...",
        "route_progress": 0,
        "safety_score": 96,
        "risk_trend": "Stable",
        "timeline": [],
        "reasoning": [],
        "sos_activated": False,
        "incident_created": False,
        "incident_id": None,
        "randy_summary": "Guardian system online. Awaiting subject detection."
    }
    FORCE_STOP_GUARDIAN = True
    return {"status": "reset"}

@router.get("/webcam_state")
async def get_state():
    return GUARDIAN_STATE

from fastapi.responses import Response

@router.get("/snapshot")
async def get_snapshot():
    global GUARDIAN_SNAPSHOT
    if GUARDIAN_SNAPSHOT is None:
        raise HTTPException(status_code=404, detail="No snapshot available")
    return Response(content=GUARDIAN_SNAPSHOT, media_type="image/jpeg")

import random
@router.post("/trigger_sos")
async def trigger_voice_sos(camera_id: str = None):
    global GUARDIAN_STATE
    if not GUARDIAN_STATE["sos_activated"]:
        GUARDIAN_STATE["sos_activated"] = True
        GUARDIAN_STATE["safety_score"] = 10
        GUARDIAN_STATE["risk_trend"] = "CRITICAL"
        add_timeline_event("Voice SOS Detected")
        
        GUARDIAN_STATE["incident_created"] = True
        GUARDIAN_STATE["incident_id"] = "GR-V" + str(random.randint(100, 999))
        add_timeline_event(f"Incident {GUARDIAN_STATE['incident_id']} Created")
        
        async def dispatch_alert():
            async with db_manager.session() as session:
                coords_str = "Unknown Location"
                vname = "Virtual City Corridor"
                if camera_id:
                    from app.models.camera import Camera
                    from sqlalchemy.orm import selectinload
                    from sqlalchemy import select
                    stmt = select(Camera).options(selectinload(Camera.venue)).where(Camera.id == camera_id)
                    res = await session.execute(stmt)
                    cam = res.scalar_one_or_none()
                    if cam and cam.venue:
                        vname = cam.venue.name or vname
                        lat = float(cam.venue.latitude) if cam.venue.latitude else None
                        lng = float(cam.venue.longitude) if cam.venue.longitude else None
                        if lat and lng:
                            lat_dir = "N" if lat >= 0 else "S"
                            lng_dir = "E" if lng >= 0 else "W"
                            coords_str = f"{abs(lat):.4f}° {lat_dir}, {abs(lng):.4f}° {lng_dir}"
                        else:
                            coords_str = f"Coordinates Not Set"
                            
                await notification_service.push_notification(
                    type="VOICE_SOS_CRITICAL",
                    priority="CRITICAL",
                    description="[AUTONOMOUS SOS] Voice distress signal 'HELP' detected. Dispatching emergency alert.",
                    venue_name=vname,
                    domain="incident",
                    metadata={
                        "insight": "Protected subject triggered a voice SOS distress signal. Emergency response workflow activated.",
                        "recommended_action": "DISPATCH security team immediately to the location.",
                        "coordinates": coords_str,
                        "screenshot_url": f"/api/v1/guardian/snapshot"
                    }
                )
        
        asyncio.create_task(dispatch_alert())
        GUARDIAN_STATE["randy_summary"] = "Voice SOS detected. Emergency confidence: 99%. Guardian Route escalated to Voice SOS. Coordinates attached. Dispatch security immediately."
        
    return {"status": "triggered"}

@router.get("/webcam_stream")
async def guardian_stream(request: Request, camera_id: str = None):
    async def frame_generator():
        global GUARDIAN_STATE
        
        stream_url = 0
        if camera_id:
            async with db_manager.session() as session:
                from app.models.camera import Camera
                cam = await session.get(Camera, camera_id)
                if cam and getattr(cam, "stream_url", None):
                    s_url = cam.stream_url
                    stream_url = int(s_url) if str(s_url).isdigit() else str(s_url)
                    
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            yield b''
            return
            
        detector = get_detector()
        kinetic_engine = KineticDetector(fps=15)
        loiter_start_time = 0
        unknown_present = False
        
        global FORCE_STOP_GUARDIAN
        FORCE_STOP_GUARDIAN = False
        
        while cap.isOpened():
            if FORCE_STOP_GUARDIAN:
                break
                
            if await request.is_disconnected():
                break
                
                
            ret, frame = cap.read()
            if not ret:
                break
                
            result = await asyncio.to_thread(detector.detect_pose, frame.copy(), return_boxes=True)
            anomalies = []
            boxes = getattr(result, 'bounding_boxes', [])
            kpts = getattr(result, 'keypoints', [])
            
            if kpts and boxes:
                anomalies = kinetic_engine.detect_anomalies(boxes, kpts)
                
                if anomalies and not GUARDIAN_STATE["sos_activated"]:
                    for anomaly in anomalies:
                        atype = anomaly.get('type', '')
                        if atype in ['MEDICAL_EMERGENCY', 'ATTACKING', 'FIGHTING', 'FALL_DETECTED']:
                            GUARDIAN_STATE["sos_activated"] = True
                            GUARDIAN_STATE["safety_score"] = 12
                            GUARDIAN_STATE["risk_trend"] = "CRITICAL"
                            add_timeline_event(f"Critical {atype} Detected")
                            
                            GUARDIAN_STATE["incident_created"] = True
                            GUARDIAN_STATE["incident_id"] = f"GR-K{random.randint(100, 999)}"
                            add_timeline_event(f"Incident {GUARDIAN_STATE['incident_id']} Created")
                            
                            conf = int(anomaly.get('confidence', 1.0) * 100)
                            GUARDIAN_STATE["randy_summary"] = f"CRITICAL KINETIC EVENT: {atype}. Emergency confidence: {conf}%. Guardian Route escalated. Dispatch security immediately."
                            
                            async def dispatch_kinetic_alert(a_type=atype):
                                async with db_manager.session() as session:
                                    coords_str = "Unknown Location"
                                    vname = "Virtual City Corridor"
                                    if camera_id:
                                        from app.models.camera import Camera
                                        from sqlalchemy.orm import selectinload
                                        from sqlalchemy import select
                                        stmt = select(Camera).options(selectinload(Camera.venue)).where(Camera.id == camera_id)
                                        res = await session.execute(stmt)
                                        cam = res.scalar_one_or_none()
                                        if cam and cam.venue:
                                            vname = cam.venue.name or vname
                                            lat = float(cam.venue.latitude) if cam.venue.latitude else None
                                            lng = float(cam.venue.longitude) if cam.venue.longitude else None
                                            if lat and lng:
                                                lat_dir = "N" if lat >= 0 else "S"
                                                lng_dir = "E" if lng >= 0 else "W"
                                                coords_str = f"{abs(lat):.4f}° {lat_dir}, {abs(lng):.4f}° {lng_dir}"
                                                
                                    await notification_service.push_notification(
                                        type="KINETIC_SOS_CRITICAL",
                                        priority="CRITICAL",
                                        description=f"[AUTONOMOUS SOS] Kinetic anomaly {a_type} detected. Dispatching emergency alert.",
                                        venue_name=vname,
                                        domain="incident",
                                        metadata={
                                            "insight": f"Protected subject triggered a kinetic {a_type} signal. Emergency response workflow activated.",
                                            "recommended_action": "DISPATCH medical/security team immediately to the location.",
                                            "coordinates": coords_str,
                                            "screenshot_url": f"/api/v1/guardian/snapshot"
                                        }
                                    )
                            asyncio.create_task(dispatch_kinetic_alert())
                            break

                if len(boxes) >= 1 and not GUARDIAN_STATE["sos_activated"]:
                    try:
                        def box_area(b):
                            try:
                                bb = b.get('bbox', [[0,0,0,0]])
                                if len(bb) == 1 and isinstance(bb[0], (list, tuple)): bb = bb[0]
                                if hasattr(bb, 'tolist') and bb.ndim == 2: bb = bb[0]
                                return (bb[2] - bb[0]) * (bb[3] - bb[1])
                            except:
                                return 0
                            
                        primary = max(boxes, key=box_area)
                        pb = primary.get('bbox', [[0,0,0,0]])
                        if len(pb) == 1 and isinstance(pb[0], (list, tuple)): pb = pb[0]
                        if hasattr(pb, 'tolist') and pb.ndim == 2: pb = pb[0]
                        px1, py1, px2, py2 = pb
                        p_cx = (px1 + px2) / 2
                        p_cy = (py1 + py2) / 2
                        
                        f_w = frame.shape[1]
                        
                        new_zone = "Metro Entrance"
                        new_prog = 33
                        if p_cx > f_w * 0.66:
                            new_zone = "Residential Gate"
                            new_prog = 100
                        elif p_cx > f_w * 0.33:
                            new_zone = "Library Walkway"
                            new_prog = 67
                            
                        if GUARDIAN_STATE["current_zone"] != new_zone:
                            old_zone = GUARDIAN_STATE["current_zone"]
                            GUARDIAN_STATE["current_zone"] = new_zone
                            GUARDIAN_STATE["route_progress"] = new_prog
                            if old_zone == "Scanning...":
                                add_timeline_event("Protected Subject Detected")
                            else:
                                add_timeline_event(f"Entered {new_zone}")
                                
                        if len(boxes) > 1:
                            if not unknown_present:
                                unknown_present = True
                                loiter_start_time = time.time()
                                add_timeline_event("Unknown Actor Detected")
                            
                            elapsed = time.time() - loiter_start_time
                            
                            min_dist = float('inf')
                            for b in boxes:
                                if b == primary: continue
                                ub = b['bbox']
                                if len(ub) == 1 and isinstance(ub[0], (list, tuple)): ub = ub[0]
                                if hasattr(ub, 'tolist') and ub.ndim == 2: ub = ub[0]
                                ux1, uy1, ux2, uy2 = ub
                                u_cx = (ux1 + ux2) / 2
                                u_cy = (uy1 + uy2) / 2
                                dist = math.hypot(u_cx - p_cx, u_cy - p_cy)
                                if dist < min_dist: min_dist = dist
                                
                            if min_dist < max(px2-px1, py2-py1)*2.0 and elapsed > 5.0:
                                if GUARDIAN_STATE["safety_score"] > 82:
                                    GUARDIAN_STATE["safety_score"] = 82
                                    GUARDIAN_STATE["risk_trend"] = "Elevated"
                                    add_timeline_event("Risk Elevated")
                                    GUARDIAN_STATE["reasoning"] = [
                                        {"text": "Unknown actor detected", "value": "+4"},
                                        {"text": "Distance < 1.5m", "value": "+6"},
                                        {"text": "Loitering > 5 sec", "value": "+8"}
                                    ]
                                    GUARDIAN_STATE["randy_summary"] = f"Subject A91 entered {new_zone}. Unknown actor detected within safety radius. Risk elevated to 82%. Recommendation: Maintain observation."
                        else:
                            unknown_present = False
                            loiter_start_time = 0
                            if GUARDIAN_STATE["safety_score"] == 82:
                                GUARDIAN_STATE["safety_score"] = 96
                                GUARDIAN_STATE["risk_trend"] = "Stable"
                                GUARDIAN_STATE["reasoning"] = []
                                add_timeline_event("Area Secured")
                                GUARDIAN_STATE["randy_summary"] = f"Subject A91 entered {new_zone}. Area secure. Maintaining observation."
                                
                    except Exception as e:
                        print("Error in Guardian tracking:", e)

            fusion_state = kinetic_engine.get_fusion_state()
            if fusion_state["sos_activated"] and not GUARDIAN_STATE["sos_activated"]:
                GUARDIAN_STATE["sos_activated"] = True
                GUARDIAN_STATE["safety_score"] = 18
                GUARDIAN_STATE["risk_trend"] = "CRITICAL"
                add_timeline_event("SOS Gesture Detected")
                add_timeline_event("Kinetic SOS Activated")
                
                GUARDIAN_STATE["incident_created"] = True
                GUARDIAN_STATE["incident_id"] = "GR-204"
                add_timeline_event("Incident GR-204 Created")
                
                async def dispatch_alert():
                    async with db_manager.session() as session:
                        coords_str = "Unknown Location"
                        vname = "Virtual City Corridor"
                        if camera_id:
                            from app.models.camera import Camera
                            from sqlalchemy.orm import selectinload
                            from sqlalchemy import select
                            stmt = select(Camera).options(selectinload(Camera.venue)).where(Camera.id == camera_id)
                            res = await session.execute(stmt)
                            cam = res.scalar_one_or_none()
                            if cam and cam.venue:
                                vname = cam.venue.name or vname
                                lat = float(cam.venue.latitude) if cam.venue.latitude else None
                                lng = float(cam.venue.longitude) if cam.venue.longitude else None
                                if lat and lng:
                                    lat_dir = "N" if lat >= 0 else "S"
                                    lng_dir = "E" if lng >= 0 else "W"
                                    coords_str = f"{abs(lat):.4f}° {lat_dir}, {abs(lng):.4f}° {lng_dir}"
                                else:
                                    coords_str = f"Coordinates Not Set"
                                    
                        await notification_service.push_notification(
                            type="KINETIC_SOS_CRITICAL",
                            priority="CRITICAL",
                            description="[AUTONOMOUS SOS] AI Confidence Fusion breached threshold. Dispatching emergency alert.",
                            venue_name=vname,
                            domain="incident",
                            metadata={
                                "insight": "Protected subject triggered an emergency distress signal. Unknown actor remained within safety radius for 8 seconds. Emergency response workflow activated. Incident #GR-204 created.",
                                "recommended_action": "DISPATCH security team immediately to the location.",
                                "coordinates": coords_str,
                                "screenshot_url": f"/api/v1/guardian/snapshot"
                            }
                        )
                
                asyncio.create_task(dispatch_alert())
                add_timeline_event("Emergency Notification Sent")
                GUARDIAN_STATE["randy_summary"] = "SOS gesture detected. Emergency confidence: 94%. Guardian Route escalated to Kinetic SOS. Dispatch security immediately."
                
            annotated = draw_pose_overlay(frame.copy(), result, anomalies)
            h, w = annotated.shape[:2]
            cv2.line(annotated, (int(w*0.33), 0), (int(w*0.33), h), (255, 255, 255), 1)
            cv2.line(annotated, (int(w*0.66), 0), (int(w*0.66), h), (255, 255, 255), 1)
            
            if GUARDIAN_STATE["sos_activated"]:
                cv2.rectangle(annotated, (0, 0), (w, h), (0, 0, 255), 10)

            _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])
            
            global GUARDIAN_SNAPSHOT
            GUARDIAN_SNAPSHOT = jpeg.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                   
            await asyncio.sleep(0.05)

        if cap:
            cap.release()

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")
