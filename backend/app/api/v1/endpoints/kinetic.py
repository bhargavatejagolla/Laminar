import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID

from fastapi import APIRouter, Query, File, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse, JSONResponse
import cv2
import numpy as np

from app.core.global_state import GLOBAL_STATE
from app.core.logging import get_logger
from app.services.sms_alert_service import SmsAlertService
from app.services.notification_service import notification_service
from app.core.database import db_manager

logger = get_logger(__name__)
router = APIRouter()

# ── Autonomous Kinetic Intelligence Engine ─────────────────────────────────────
# Runs continuously in the background, analyzing all active cameras.
_kinetic_engine_task = None
_standalone_kinetic_frames: Dict[str, bytes] = {}  # camera_id -> jpeg bytes
_standalone_kinetic_tasks: Dict[str, asyncio.Task] = {}  # camera_id -> Task

def get_worker(camera_id: UUID):
    from app.vision.orchestrator import ORCHESTRATOR
    from app.vision.manager import vision_manager
    w = ORCHESTRATOR._workers.get(camera_id)
    if not w:
        w = vision_manager._workers.get(camera_id)
    return w

async def _autonomous_kinetic_loop():
    logger.info("Starting Autonomous Kinetic SOS Engine")
    from app.vision.detector import get_detector
    from app.vision.kinetic_detector import KineticDetector
    from app.vision.orchestrator import ORCHESTRATOR
    from app.vision.manager import vision_manager
    
    # We delay initialization slightly to ensure AI models are loaded
    await asyncio.sleep(5)
    detector = get_detector()
    kinetic_engine = KineticDetector()
    
    while True:
        try:
            # Aggregate all cameras across the entire Laminar system
            workers = list(ORCHESTRATOR._workers.items()) + list(vision_manager._workers.items())
            for camera_id, worker in workers:
                raw_frame = getattr(worker, "_current_raw_frame", None)
                if raw_frame is not None:
                    # Run pose detection
                    result = await asyncio.to_thread(detector.detect_pose, raw_frame.copy(), return_boxes=True)
                    
                    if hasattr(result, 'keypoints') and result.keypoints:
                        anomalies = kinetic_engine.detect_anomalies(result.bounding_boxes, result.keypoints)
                        
                        if anomalies:
                            # Push to SSE
                            for inc in anomalies:
                                push_kinetic_event(str(camera_id), inc)

                            # Trigger real-time notifications
                            async with db_manager.session() as session:
                                from app.models.camera import Camera
                                from app.models.venue import Venue
                                cam = await session.get(Camera, camera_id)
                                venue_id = str(cam.venue_id) if cam else "unknown"
                                venue_name = "Unknown Venue"
                                if cam and cam.venue_id:
                                    venue = await session.get(Venue, cam.venue_id)
                                    if venue:
                                        venue_name = venue.name

                                for inc in anomalies:
                                    # 1. Save Snapshot manually for the real-time event
                                    snapshot_path = None
                                    try:
                                        from app.services.evidence_snapshot_service import EvidenceSnapshotService, SNAPSHOT_DIR
                                        from app.vision.kinetic_worker import draw_pose_overlay
                                        svc = EvidenceSnapshotService()
                                        filename = f"cam{str(camera_id)[:8]}_{int(datetime.now().timestamp())}.jpg"
                                        full_path = os.path.join(SNAPSHOT_DIR, filename)
                                        # Use the annotated frame from worker or draw it now
                                        annotated = draw_pose_overlay(raw_frame.copy(), result, anomalies)
                                        stamped = svc._stamp_frame(annotated, inc.get("risk_level", "CRITICAL").lower(), venue_name, datetime.now(timezone.utc))
                                        success = await asyncio.to_thread(svc._save_snapshot, stamped, full_path)
                                        if success:
                                            snapshot_path = full_path
                                    except Exception as e:
                                        logger.error(f"Failed to save kinetic snapshot: {e}")

                                    # 2. Push UI Toast
                                    await notification_service.push_notification(
                                        domain="incident",
                                        type=inc["type"],
                                        priority=inc.get("risk_level", "CRITICAL").upper(),
                                        description=f"[AUTONOMOUS SOS] {inc['message']}",
                                        venue_id=venue_id,
                                        venue_name=venue_name,
                                        metadata={"camera_id": str(camera_id), "snapshot_path": snapshot_path}
                                    )
                                    
                                    # 3. Trigger Real Emails and SMS
                                    await notification_service.notify_realtime_event(
                                        session=session,
                                        domain="incident",
                                        type=inc["type"],
                                        priority=inc.get("risk_level", "CRITICAL").upper(),
                                        description=f"[AUTONOMOUS SOS] {inc['message']}",
                                        venue_id=venue_id,
                                        venue_name=venue_name,
                                        camera_id=str(camera_id),
                                        metadata={
                                            "camera_id": str(camera_id), 
                                            "snapshot_path": snapshot_path, 
                                            "camera_location": getattr(cam, "location", "") or venue_name,
                                            "insight": "AI Engine detected kinetic signatures indicating potential violence or distress.",
                                            "recommended_action": "DISPATCH security team immediately to the location."
                                        }
                                    )
                                    
                            # Update global state
                            GLOBAL_STATE.update(
                                domain="kinetic",
                                venue_id=str(getattr(worker, "venue_id", "unknown")),
                                payload={
                                    "venue_id": str(getattr(worker, "venue_id", "unknown")),
                                    "camera_id": str(camera_id),
                                    "active_subjects": result.count if hasattr(result, 'count') else 0,
                                    "anomalies_detected": len(anomalies),
                                    "latest_anomalies": anomalies,
                                    "last_updated": datetime.utcnow().isoformat()
                                }
                            )
            
            # Run the autonomous loop at 1 Hz across the network
            await asyncio.sleep(1.0)
        except Exception as e:
            logger.error(f"Autonomous Kinetic Engine error: {e}")
            await asyncio.sleep(5.0)

@router.on_event("startup")
async def start_autonomous_engine():
    global _kinetic_engine_task
    _kinetic_engine_task = asyncio.create_task(_autonomous_kinetic_loop())
# ─────────────────────────────────────────────────────────────────────────────

# Global subscribers for Kinetic SSE
_kinetic_subscribers: List[asyncio.Queue] = []

def push_kinetic_event(camera_id: str, payload: Dict[str, Any]):
    """Called by KineticWorker to broadcast live pose analytics."""
    event = {
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload
    }
    for q in list(_kinetic_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass

@router.get("/status")
async def get_kinetic_status() -> Dict[str, Any]:
    """Returns the live state of all kinetic cameras."""
    return GLOBAL_STATE.get_domain_state("kinetic")

@router.get("/insights")
async def get_kinetic_insights() -> Dict[str, Any]:
    """Returns aggregated insights and risk state for kinetic anomalies."""
    state = GLOBAL_STATE.get_domain_state("kinetic")
    
    total_subjects = 0
    total_anomalies = 0
    latest_events = []
    highest_risk = "LOW"
    cameras_data = {}
    
    risk_weights = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
    
    for venue_id, venue_data in state.items():
        total_subjects += venue_data.get("active_subjects", 0)
        total_anomalies += venue_data.get("anomalies_detected", 0)
        cam_id = venue_data.get("camera_id")
        if cam_id:
            cameras_data[str(cam_id)] = {
                "active_subjects": venue_data.get("active_subjects", 0),
                "anomalies_detected": venue_data.get("anomalies_detected", 0),
                "latest_anomalies": venue_data.get("latest_anomalies", [])
            }

        events = venue_data.get("latest_anomalies", [])
        latest_events.extend(events)
        
        for e in events:
            risk = e.get("risk_level", "LOW")
            if risk_weights.get(risk, 0) > risk_weights.get(highest_risk, 0):
                highest_risk = risk
                
    # Sort events by confidence or risk (simple latest logic)
    latest_events = latest_events[:10]
    
    return {
        "active_subjects": total_subjects,
        "anomalies_detected": total_anomalies,
        "risk_level": highest_risk,
        "latest_events": latest_events,
        "cameras": cameras_data
    }

@router.get("/events/stream")
async def kinetic_events_stream():
    """SSE stream for real-time kinetic anomalies and pose counts."""
    q = asyncio.Queue(maxsize=100)
    _kinetic_subscribers.append(q)

    async def event_generator():
        try:
            yield 'data: {"status": "connected"}\n\n'
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps(ev, default=lambda o: float(o) if isinstance(o, (np.float32, np.float64)) else (int(o) if isinstance(o, (np.int32, np.int64)) else str(o)))}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            if q in _kinetic_subscribers:
                _kinetic_subscribers.remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/stream/{camera_id}")
async def kinetic_video_stream(camera_id: UUID):
    """
    MJPEG stream providing the neon-skeleton overlay.
    Routes to the active worker and performs on-the-fly kinetic analysis.
    """
    worker = get_worker(camera_id)
    
    async def frame_generator():
        from app.vision.detector import get_detector
        from app.vision.kinetic_detector import KineticDetector
        from app.vision.kinetic_worker import draw_pose_overlay
        import time
        
        detector = get_detector()
        kinetic_engine = KineticDetector()
        last_processed = 0
        
        while True:
            # 1. Priority: Standalone Injected Frame
            standalone_frame = _standalone_kinetic_frames.get(str(camera_id))
            if standalone_frame is not None:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + standalone_frame + b'\r\n')
                await asyncio.sleep(0.05)
                continue

            # 2. Live camera feed
            raw_frame = getattr(worker, "_current_raw_frame", None)
            if raw_frame is not None:
                # Throttle heavy pose detection to 3 FPS for live overlays
                if time.time() - last_processed > 0.33:
                    last_processed = time.time()
                    try:
                        result = await asyncio.to_thread(detector.detect_pose, raw_frame.copy(), return_boxes=True)
                        anomalies = []
                        if hasattr(result, 'keypoints') and result.keypoints:
                            anomalies = kinetic_engine.detect_anomalies(result.bounding_boxes, result.keypoints)
                        
                        annotated = draw_pose_overlay(raw_frame.copy(), result, anomalies)
                        
                        # Force STANDBY overlay if the resulting frame is completely black
                        if np.mean(annotated) < 2:
                            raise Exception("Black frame generated, fallback to standby")
                            
                        _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        worker.kinetic_live_frame = jpeg.tobytes()
                    except Exception as e:
                        logger.error(f"Error in kinetic live feed processing: {e}", exc_info=True)
                        # Fallback frame for processing errors
                        standby = np.zeros((480, 640, 3), dtype=np.uint8)
                        cv2.putText(standby, "KINETIC ENGINE STANDBY", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
                        cv2.putText(standby, "WAITING FOR SIGNAL...", (170, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
                        _, s_jpeg = cv2.imencode(".jpg", standby, [cv2.IMWRITE_JPEG_QUALITY, 50])
                        worker.kinetic_live_frame = s_jpeg.tobytes()
                
                # Serve the latest processed live frame
                if hasattr(worker, "kinetic_live_frame") and worker.kinetic_live_frame:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + worker.kinetic_live_frame + b'\r\n')
                elif getattr(worker, "_cached_frame_bytes", None):
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + worker._cached_frame_bytes + b'\r\n')
            else:
                # 3. Fallback if camera has no raw frame
                if getattr(worker, "_cached_frame_bytes", None):
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + worker._cached_frame_bytes + b'\r\n')
                else:
                    # Generate a STANDBY frame so the stream doesn't hang/turn black
                    standby = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(standby, "KINETIC ENGINE STANDBY", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
                    cv2.putText(standby, "WAITING FOR SIGNAL...", (170, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
                    _, s_jpeg = cv2.imencode(".jpg", standby, [cv2.IMWRITE_JPEG_QUALITY, 50])
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + s_jpeg.tobytes() + b'\r\n')

            await asyncio.sleep(0.1)

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

@router.post("/upload")
async def inject_kinetic_media(camera_id: UUID, file: UploadFile = File(...)):
    """
    Manually injects media (image or video) to process via the Kinetic Engine.
    """
    contents = await file.read()
    filename = file.filename.lower()
    worker = get_worker(camera_id)
    
    if filename.endswith(('.mp4', '.avi', '.mov', '.webm')):
        import tempfile, os
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as f:
            f.write(contents)
            temp_path = f.name
            
        async def process_video():
            try:
                cap = cv2.VideoCapture(temp_path)
                if not cap.isOpened():
                    raise Exception(f"OpenCV failed to open video file: {temp_path}. The file may be corrupt or an unsupported format.")

                from app.vision.detector import get_detector
                from app.vision.kinetic_detector import KineticDetector
                from app.vision.kinetic_worker import draw_pose_overlay
                
                venue_id_str = "unknown"
                async with db_manager.session() as session:
                    from app.models.camera import Camera
                    cam = await session.get(Camera, camera_id)
                    if cam and cam.venue_id:
                        venue_id_str = str(cam.venue_id)
                        
                detector = get_detector()
                kinetic_engine = KineticDetector()
                
                frame_count = 0
                while cap.isOpened():
                    ret, frame = cap.read()
                    if not ret:
                        if frame_count == 0:
                            raise Exception("Could not read any frames. Unsupported codec or corrupt file.")
                        break
                    frame_count += 1
                    
                    result = await asyncio.to_thread(detector.detect_pose, frame.copy(), return_boxes=True)
                    
                    anomalies = []
                    if hasattr(result, 'keypoints') and result.keypoints:
                        anomalies = kinetic_engine.detect_anomalies(result.bounding_boxes, result.keypoints)
                        
                    annotated = draw_pose_overlay(frame.copy(), result, anomalies)
                    
                    if hasattr(result, 'keypoints') and result.keypoints:
                        for inc in anomalies:
                            push_kinetic_event(str(camera_id), inc)
                            
                            # Save Snapshot manually
                            snapshot_path = None
                            try:
                                from app.services.evidence_snapshot_service import EvidenceSnapshotService, SNAPSHOT_DIR
                                svc = EvidenceSnapshotService()
                                filename = f"cam{str(camera_id)[:8]}_{int(datetime.now().timestamp())}.jpg"
                                full_path = os.path.join(SNAPSHOT_DIR, filename)
                                stamped = svc._stamp_frame(annotated.copy(), inc.get("risk_level", "CRITICAL").lower(), "Uploaded Video", datetime.now(timezone.utc))
                                success = await asyncio.to_thread(svc._save_snapshot, stamped, full_path)
                                if success:
                                    snapshot_path = full_path
                            except Exception:
                                pass

                            # Push Notifications (UI + Email/SMS)
                            async with db_manager.session() as session:
                                from app.services.notification_service import notification_service
                                from app.models.camera import Camera
                                from app.models.venue import Venue
                                cam = await session.get(Camera, camera_id)
                                venue_id = str(cam.venue_id) if cam else "unknown"
                                venue_name = "Uploaded Video"
                                if cam and cam.venue_id:
                                    venue = await session.get(Venue, cam.venue_id)
                                    if venue:
                                        venue_name = venue.name
                                
                                await notification_service.push_notification(
                                    domain="incident",
                                    type=inc["type"],
                                    priority=inc.get("risk_level", "CRITICAL").upper(),
                                    description=f"[AUTONOMOUS SOS] {inc['message']}",
                                    venue_id=venue_id,
                                    venue_name=venue_name,
                                    metadata={"camera_id": str(camera_id), "snapshot_path": snapshot_path, "injected": True}
                                )
                                
                                await notification_service.notify_realtime_event(
                                    session=session,
                                    domain="incident",
                                    type=inc["type"],
                                    priority=inc.get("risk_level", "CRITICAL").upper(),
                                    description=f"[AUTONOMOUS SOS] {inc['message']}",
                                    venue_id=venue_id,
                                    venue_name=venue_name,
                                    camera_id=str(camera_id),
                                    metadata={
                                        "camera_id": str(camera_id), 
                                        "snapshot_path": snapshot_path, 
                                        "injected": True,
                                        "camera_location": getattr(cam, "location", "") or venue_name,
                                        "insight": "AI Engine detected kinetic signatures indicating potential violence or distress.",
                                        "recommended_action": "DISPATCH security team immediately to the location."
                                    }
                                )
                                
                    # Update global state for UI parameters dynamically
                    active_subj = result.count if hasattr(result, 'count') else 0
                    GLOBAL_STATE.update(
                        domain="kinetic",
                        venue_id=venue_id_str,
                        payload={
                            "venue_id": venue_id_str,
                            "camera_id": str(camera_id),
                            "active_subjects": active_subj,
                            "anomalies_detected": len(anomalies),
                            "latest_anomalies": anomalies,
                            "last_updated": datetime.utcnow().isoformat()
                        }
                    )
                    
                    _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    
                    # Store globally so stream yields it regardless of worker presence
                    _standalone_kinetic_frames[str(camera_id)] = jpeg.tobytes()
                        
                    await asyncio.sleep(0.033)
                    
            except Exception as e:
                logger.error(f"Process Video Task Crashed! {e}", exc_info=True)
                # Show error on video feed!
                err_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(err_frame, f"VIDEO CRASHED: {str(e)[:40]}", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                _, err_jpeg = cv2.imencode(".jpg", err_frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
                _standalone_kinetic_frames[str(camera_id)] = err_jpeg.tobytes()
                # Wait so the user can actually read the error frame before clearing it
                await asyncio.sleep(5)
            finally:
                try:
                    if 'cap' in locals() and cap is not None:
                        cap.release()
                except: pass
                try:
                    if 'temp_path' in locals() and os.path.exists(temp_path):
                        os.remove(temp_path)
                except: pass
                
                _standalone_kinetic_tasks.pop(str(camera_id), None)
                _standalone_kinetic_frames[str(camera_id)] = None
        
        task = asyncio.create_task(process_video())
        _standalone_kinetic_tasks[str(camera_id)] = task
        return {"message": "Kinetic media processing started in background.", "camera_id": camera_id}

    # Process Single Image
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return JSONResponse(status_code=400, content={"message": "Invalid image"})

    from app.vision.detector import get_detector
    from app.vision.kinetic_detector import KineticDetector
    detector = get_detector()
    result = detector.detect_pose(frame, return_boxes=True)
    
    anomalies = []
    if hasattr(result, 'keypoints') and result.keypoints:
        kinetic_engine = KineticDetector()
        anomalies = kinetic_engine.detect_anomalies(result.bounding_boxes, result.keypoints)
    
    for inc in anomalies:
        push_kinetic_event(str(camera_id), inc)

    # Trigger notifications
    async with db_manager.session() as session:
        from app.models.camera import Camera
        from app.models.venue import Venue
        cam = await session.get(Camera, camera_id)
        venue_id = str(cam.venue_id) if cam else "unknown"
        venue_name = "Unknown Venue"
        if cam and cam.venue_id:
            venue = await session.get(Venue, cam.venue_id)
            if venue:
                venue_name = venue.name

        for inc in anomalies:
            from app.services.notification_service import notification_service
            
            snapshot_path = None
            try:
                from app.services.evidence_snapshot_service import EvidenceSnapshotService, SNAPSHOT_DIR
                svc = EvidenceSnapshotService()
                filename = f"cam{str(camera_id)[:8]}_{int(datetime.now().timestamp())}.jpg"
                full_path = os.path.join(SNAPSHOT_DIR, filename)
                stamped = svc._stamp_frame(frame.copy(), inc.get("risk_level", "CRITICAL").lower(), venue_name, datetime.now(timezone.utc))
                success = await asyncio.to_thread(svc._save_snapshot, stamped, full_path)
                if success:
                    snapshot_path = full_path
            except Exception:
                pass
            
            await notification_service.push_notification(
                domain="incident",
                type=inc["type"],
                priority=inc.get("risk_level", "CRITICAL").upper(),
                description=inc["message"],
                venue_id=venue_id,
                venue_name=venue_name,
                metadata={"camera_id": str(camera_id), "injected": True, "snapshot_path": snapshot_path}
            )
            await notification_service.notify_realtime_event(
                session=session,
                domain="incident",
                type=inc["type"],
                priority=inc.get("risk_level", "CRITICAL").upper(),
                description=inc["message"],
                venue_id=venue_id,
                venue_name=venue_name,
                camera_id=str(camera_id),
                metadata={
                    "camera_id": str(camera_id), 
                    "injected": True, 
                    "snapshot_path": snapshot_path,
                    "camera_location": getattr(cam, "location", "") or venue_name,
                    "insight": "AI Engine detected kinetic signatures indicating potential violence or distress.",
                    "recommended_action": "DISPATCH security team immediately to the location."
                }
            )
            
        GLOBAL_STATE.update(
            domain="kinetic",
            venue_id=venue_id,
            payload={
                "venue_id": venue_id,
                "camera_id": str(camera_id),
                "active_subjects": result.count if hasattr(result, 'count') else 0,
                "anomalies_detected": len(anomalies),
                "latest_anomalies": anomalies,
                "last_updated": datetime.utcnow().isoformat()
            }
        )

    from app.vision.kinetic_worker import draw_pose_overlay
    annotated = draw_pose_overlay(frame.copy(), result, anomalies)
    _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    
    _standalone_kinetic_frames[str(camera_id)] = jpeg.tobytes()
    
    # Auto-clear after 15 seconds ONLY if there is a live feed (worker check)
    async def clear_cache():
        await asyncio.sleep(15)
        # Only clear if we have a real worker giving live frames, otherwise keep it for viewing
        w = get_worker(camera_id)
        if w and getattr(w, "_current_raw_frame", None) is not None:
            _standalone_kinetic_frames[str(camera_id)] = None
            
    asyncio.create_task(clear_cache())

    return {"message": f"Processed. Found {len(anomalies)} anomalies.", "anomalies": anomalies}

@router.post("/clear-media/{camera_id}")
async def clear_kinetic_media(camera_id: UUID):
    """
    Clears the injected standalone media frame so the stream goes back to the live feed.
    """
    cleared = False
    if str(camera_id) in _standalone_kinetic_frames:
        _standalone_kinetic_frames[str(camera_id)] = None
        cleared = True
    
    if str(camera_id) in _standalone_kinetic_tasks:
        _standalone_kinetic_tasks[str(camera_id)].cancel()
        del _standalone_kinetic_tasks[str(camera_id)]
        cleared = True
        
    if cleared:
        return {"message": "Media cleared. Resuming live feed."}
    return {"message": "No media found to clear."}

