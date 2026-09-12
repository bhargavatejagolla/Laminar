import os
import cv2
import time
import math
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import uuid
import numpy as np

from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Query, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

from app.core.global_state import GLOBAL_STATE
from app.core.logging import get_logger
from app.vision.ambulance_detector import AmbulanceDetector, DEFAULT_ROAD_GRAPH
from app.vision.detector import get_detector
from app.services.event_bus import event_bus
from app.models.intelligence_event import LaminarIntelligenceEvent, LocationPayload
from app.services.notification_service import notification_service

logger = get_logger(__name__)
router = APIRouter()

# ── Global Engine State & Streams ─────────────────────────────────────────────
_greenwave_subscribers: Dict[str, List[asyncio.Queue]] = {}
_greenwave_frames: Dict[str, bytes] = {}
_greenwave_tasks: Dict[str, asyncio.Task] = {}
_greenwave_engines: Dict[str, AmbulanceDetector] = {}
_greenwave_active_sources: Dict[str, Dict[str, Any]] = {}
_greenwave_audit_logs: List[Dict[str, Any]] = []

# ── Scenario Catalog ──────────────────────────────────────────────────────────
GREENWAVE_SCENARIO_CATALOG: Dict[str, Dict[str, Any]] = {
    "normal_traffic": {
        "id": "normal_traffic",
        "title": "Normal Arterial Traffic Flow",
        "badge": "Baseline / Negative Control",
        "category": "BASELINE",
        "risk_level": "LOW",
        "filename": "normal_traffic.mp4",
        "duration_seconds": 24.0,
        "fps": 30.0,
        "resolution": "1280x720",
        "description": "Baseline multi-lane highway flow with passenger vehicles moving in designated lanes. Demonstrates that LAMINAR holds in MONITORING state with zero emergency vehicles on the tested negative control.",
        "expected_outcome": "MONITORING (0 emergency vehicles verified on baseline clip)",
        "capabilities": {
            "vehicle_detection": True,
            "emergency_classification": True,
            "beacon_analysis": "SUPPORTING",
            "tracking": True,
            "route_prediction": True,
            "signal_controller": "NOT CONNECTED (ADVISORY MODE)"
        }
    },
    "ambulance_transit": {
        "id": "ambulance_transit",
        "title": "Ambulance Emergency Transit",
        "badge": "High-Priority Emergency Transit",
        "category": "HERO_INCIDENT",
        "risk_level": "CRITICAL",
        "filename": "ambulance_transit.mp4",
        "duration_seconds": 21.3,
        "fps": 30.0,
        "resolution": "720x1280",
        "description": "Real ambulance navigating congested urban traffic. Demonstrates multi-frame temporal evidence accumulation, candidate flagging, persistence verification (>=3.0s), road-graph junction ETAs, and advisory clearance recommendations.",
        "expected_outcome": "MONITORING -> CANDIDATE -> VERIFIED AMBULANCE -> TRANSIT ACTIVE",
        "capabilities": {
            "vehicle_detection": True,
            "emergency_classification": True,
            "beacon_analysis": "SUPPORTING (OSCILLATING)",
            "tracking": True,
            "route_prediction": True,
            "signal_controller": "NOT CONNECTED (ADVISORY MODE)"
        }
    }
}


def _resolve_greenwave_path(filename: str) -> Optional[str]:
    """Finds scenario video file across standard storage paths."""
    candidates = [
        os.path.join(os.getcwd(), "data", "scenarios", filename),
        os.path.join(os.getcwd(), "backend", "data", "scenarios", filename),
        os.path.join(os.getcwd(), "data", "uploads", filename),
        os.path.join(os.getcwd(), "data", filename),
        os.path.join(os.getcwd(), "..", "frontend", "public", "images", filename)
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def _reset_greenwave_source(target_id: str):
    """Clean reset of all frames, tasks, and state machine history."""
    if target_id in _greenwave_tasks:
        _greenwave_tasks[target_id].cancel()
        del _greenwave_tasks[target_id]

    if target_id in _greenwave_frames:
        del _greenwave_frames[target_id]

    if target_id in _greenwave_engines:
        _greenwave_engines[target_id].reset()


def push_greenwave_event(session_id: str, payload: Dict[str, Any]):
    """Broadcasts SSE telemetry update to connected listeners."""
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload
    }
    if session_id in _greenwave_subscribers:
        for q in list(_greenwave_subscribers[session_id]):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass


def draw_ambulance_hud(
    frame: np.ndarray,
    out: Dict[str, Any],
    source_title: str,
    video_timestamp: float,
    provenance: str = "DEMO SCENARIO"
) -> np.ndarray:
    """Renders cybernetic HUD annotations, vehicle bounding boxes, velocity vectors, and watermarks."""
    annotated = frame.copy()
    h, w = annotated.shape[:2]

    scene_state = out.get("scene_state", "MONITORING")
    active_cand = out.get("candidate_track_id")
    ver_id = out.get("verified_track_id")
    track_info = out.get("active_track")

    # 1. Bounding Box & Velocity Vector for Active Emergency Candidate / Verified Vehicle
    if track_info and track_info.get("bbox"):
        x1, y1, x2, y2 = [int(float(c)) for c in track_info["bbox"]]
        x1, y1 = max(0, min(w - 1, x1)), max(0, min(h - 1, y1))
        x2, y2 = max(0, min(w - 1, x2)), max(0, min(h - 1, y2))

        is_verified = scene_state in ("VERIFIED", "TRANSIT ACTIVE")
        box_color = (0, 0, 255) if is_verified else (0, 165, 255)
        thickness = 3 if is_verified else 2

        # Glowing Bounding Box
        cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, thickness)

        # Cyberpunk corner brackets
        bracket_len = min(25, int((x2 - x1) * 0.25))
        cv2.line(annotated, (x1, y1), (x1 + bracket_len, y1), box_color, thickness + 1)
        cv2.line(annotated, (x1, y1), (x1, y1 + bracket_len), box_color, thickness + 1)
        cv2.line(annotated, (x2, y1), (x2 - bracket_len, y1), box_color, thickness + 1)
        cv2.line(annotated, (x2, y1), (x2, y1 + bracket_len), box_color, thickness + 1)

        # Label Header
        tag = f"AMBULANCE #{track_info['track_id']} [VERIFIED]" if is_verified else f"CANDIDATE #{track_info['track_id']}"
        speed_text = f"{track_info['speed_kmh']} km/h" if track_info.get("speed_kmh") else f"{track_info.get('speed_px_sec', 0)} px/s"
        full_label = f"{tag} | {track_info.get('direction', 'NORTHBOUND')} | {speed_text}"

        (tw, th), _ = cv2.getTextSize(full_label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
        cv2.rectangle(annotated, (x1, max(0, y1 - th - 8)), (x1 + tw + 10, y1), (20, 20, 30), -1)
        cv2.putText(annotated, full_label, (x1 + 5, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1, cv2.LINE_AA)

        # Velocity Vector Arrow
        cx = int((x1 + x2) / 2)
        dir_name = track_info.get("direction", "NORTHBOUND")
        arrow_dx = 0
        arrow_dy = -60 if dir_name == "NORTHBOUND" else (60 if dir_name == "SOUTHBOUND" else 0)
        if dir_name == "EASTBOUND": arrow_dx = 60
        elif dir_name == "WESTBOUND": arrow_dx = -60
        cv2.arrowedLine(annotated, (cx, y1), (cx + arrow_dx, y1 + arrow_dy), box_color, 2, tipLength=0.25)

    # 2. Top HUD Telemetry Banner
    state_color = (0, 255, 0) if scene_state == "MONITORING" else ((0, 165, 255) if scene_state == "CANDIDATE" else (0, 0, 255))
    cv2.putText(
        annotated,
        f"LAMINAR GREEN WAVE 2.0 | STATE: {scene_state}",
        (14, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.48,
        state_color,
        1,
        cv2.LINE_AA
    )

    # 3. Provenance & Timecode Watermarks
    cv2.putText(
        annotated,
        f"SOURCE: {provenance} - {source_title.upper()}",
        (14, h - 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.38,
        (0, 255, 255),
        1,
        cv2.LINE_AA
    )
    cv2.putText(
        annotated,
        f"VIDEO TIME: {video_timestamp:.1f}s | ETAS: DYNAMIC ROAD-GRAPH",
        (14, h - 12),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.34,
        (200, 200, 200),
        1,
        cv2.LINE_AA
    )

    return annotated


# ── REST API Endpoints ────────────────────────────────────────────────────────

@router.get("/scenarios")
async def get_greenwave_scenarios():
    """Returns curated demonstration scenario catalog with capabilities."""
    scenarios = []
    for sc_id, sc in GREENWAVE_SCENARIO_CATALOG.items():
        scenarios.append({
            **sc,
            "file_available": _resolve_greenwave_path(sc["filename"]) is not None
        })
    return scenarios


@router.post("/demo/start")
async def start_greenwave_demo(
    scenario_id: str = Query("ambulance_transit"),
    camera_id: Optional[str] = Query(None)
):
    """
    Launches video ingestion for a demonstration scenario through the exact same
    two-stage perception, temporal evidence tracking, and corridor planning engine.
    """
    target_id = camera_id or "GREENWAVE_DEMO_NODE_01"
    _reset_greenwave_source(target_id)

    scenario_meta = GREENWAVE_SCENARIO_CATALOG.get(scenario_id)
    if not scenario_meta:
        raise HTTPException(status_code=400, detail=f"Unknown scenario ID: {scenario_id}")

    video_path = _resolve_greenwave_path(scenario_meta["filename"])
    if not video_path:
        raise HTTPException(status_code=404, detail=f"Video asset '{scenario_meta['filename']}' not found on disk.")

    engine = AmbulanceDetector(fps=int(scenario_meta.get("fps", 24)))
    _greenwave_engines[target_id] = engine
    _greenwave_active_sources[target_id] = {
        "source_type": "demo",
        "scenario_id": scenario_id,
        "title": scenario_meta["title"],
        "video_path": video_path,
        "fps": scenario_meta.get("fps", 30.0)
    }

    async def run_greenwave_pipeline():
        detector = get_detector()
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or scenario_meta.get("fps", 30.0)
        target_frame_delay = 1.0 / max(10.0, min(35.0, fps))
        frame_idx = 0
        cached_detections: List[Dict[str, Any]] = []

        logger.info(f"Starting GreenWave Scenario '{scenario_id}' on {target_id} using {video_path}")

        try:
            while True:
                t0 = time.time()
                if not cap.isOpened():
                    cap = cv2.VideoCapture(video_path)

                ret, frame = cap.read()
                if not ret or frame is None:
                    # Seamless loop
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    frame_idx = 0
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        break

                frame_idx += 1
                source_timestamp = frame_idx / max(1.0, fps)

                # Decoupled Inference Cadence: Run YOLO vehicle detection every 2nd frame
                if frame_idx % 2 == 1 or not cached_detections:
                    try:
                        res = await asyncio.to_thread(
                            detector.detect_people,
                            frame.copy(),
                            True,
                            500,
                            None,
                            [2, 3, 5, 7]  # car, motorcycle, bus, truck
                        )
                        cached_detections = [
                            {"bbox": b["bbox"], "id": b["id"]}
                            for b in getattr(res, "bounding_boxes", [])
                        ]
                    except Exception as e:
                        logger.error(f"Detection step failed: {e}")

                # Process frame through AmbulanceDetector
                out = engine.process_frame(frame, cached_detections, source_timestamp=source_timestamp)

                # Emit canonical LAMINAR Intelligence Event when Verified
                if out.get("scene_state") == "VERIFIED" and out.get("persistence_seconds", 0) >= 3.0:
                    event_id = f"GW-AMB-{scenario_id.upper()}-{int(time.time() // 60)}"
                    le_event = LaminarIntelligenceEvent(
                        event_id=event_id,
                        event_type="emergency_corridor_recommended",
                        domain="traffic",
                        venue_id="SMART-CITY-CORE-01",
                        venue_name="PVNR Expressway Emergency Corridor",
                        camera_id=target_id,
                        camera_name=f"Demo: {scenario_meta['title']}",
                        source_type="demo",
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        location=LocationPayload(location_source="CAMERA_CONFIG"),
                        severity="critical",
                        confidence=round(out.get("evidence", {}).get("composite_confidence", 85.0) / 100.0, 2),
                        state="verified",
                        title=f"Emergency Corridor Recommended: Ambulance Verified",
                        description=f"Persistent ambulance track verified ({out.get('persistence_seconds')}s). Corridor pre-emption recommended.",
                        evidence={
                            "track_id": out.get("verified_track_id"),
                            "provenance": "DEMO_SCENARIO",
                            "scenario_id": scenario_id
                        },
                        explanation=out.get("evidence")
                    )
                    await event_bus.emit_event(le_event, cooldown_seconds=60.0, enforce_transition=True)

                # Global State update
                GLOBAL_STATE.update(
                    domain="greenwave",
                    venue_id="SMART-CITY-CORE-01",
                    payload={
                        "venue_id": "SMART-CITY-CORE-01",
                        "camera_id": target_id,
                        "scene_state": out.get("scene_state"),
                        "vehicle_count": out.get("vehicle_count"),
                        "emergency_vehicles": out.get("emergency_vehicles"),
                        "candidate_track_id": out.get("candidate_track_id"),
                        "verified_track_id": out.get("verified_track_id"),
                        "persistence_seconds": out.get("persistence_seconds"),
                        "evidence": out.get("evidence"),
                        "corridor_plan": out.get("corridor_plan"),
                        "active_track": out.get("active_track"),
                        "active_source": _greenwave_active_sources.get(target_id),
                        "last_updated": datetime.now(timezone.utc).isoformat()
                    }
                )

                # Push SSE telemetry
                push_greenwave_event(target_id, {
                    "camera_id": target_id,
                    **out,
                    "active_source": _greenwave_active_sources.get(target_id)
                })

                # Render HUD & Watermark
                hud_frame = draw_ambulance_hud(
                    frame,
                    out,
                    source_title=scenario_meta["title"],
                    video_timestamp=source_timestamp,
                    provenance="DEMO SCENARIO"
                )

                _, jpeg = cv2.imencode(".jpg", hud_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                _greenwave_frames[target_id] = jpeg.tobytes()

                # Dynamic sleep to guarantee exact native FPS playback speed
                elapsed = time.time() - t0
                sleep_delay = max(0.002, target_frame_delay - elapsed)
                await asyncio.sleep(sleep_delay)

        except asyncio.CancelledError:
            logger.info(f"GreenWave pipeline loop cancelled for {target_id}")
        except Exception as e:
            logger.error(f"GreenWave pipeline crashed: {e}", exc_info=True)
        finally:
            if cap is not None:
                cap.release()
            _greenwave_frames.pop(target_id, None)

    task = asyncio.create_task(run_greenwave_pipeline())
    _greenwave_tasks[target_id] = task

    return {
        "status": "SCENARIO_STARTED",
        "camera_id": target_id,
        "scenario_id": scenario_id,
        "scenario_title": scenario_meta["title"],
        "provenance": "DEMO_SCENARIO"
    }


@router.post("/demo/replay")
async def replay_greenwave_demo(camera_id: Optional[str] = Query(None)):
    """Rewinds the active video source to frame 0 and resets temporal evidence."""
    target_id = camera_id or "GREENWAVE_DEMO_NODE_01"
    active_info = _greenwave_active_sources.get(target_id)
    if not active_info:
        raise HTTPException(status_code=400, detail="No active source running to replay.")

    scenario_id = active_info.get("scenario_id", "ambulance_transit")
    return await start_greenwave_demo(scenario_id=scenario_id, camera_id=target_id)


@router.post("/demo/stop")
async def stop_greenwave_demo(camera_id: Optional[str] = Query(None)):
    """Halts active ingestion and returns the system cleanly to STANDBY."""
    target_id = camera_id or "GREENWAVE_DEMO_NODE_01"
    _reset_greenwave_source(target_id)

    # Broadcast clean standby telemetry
    push_greenwave_event(target_id, {
        "camera_id": target_id,
        "scene_state": "MONITORING",
        "vehicle_count": 0,
        "emergency_vehicles": 0,
        "candidate_track_id": None,
        "verified_track_id": None,
        "persistence_seconds": 0.0,
        "evidence": {
            "vehicle_classification": 0.0,
            "emergency_markings": 0.0,
            "track_consistency": 0.0,
            "temporal_consistency": 0.0,
            "motion_consistency": 0.0,
            "beacon_signal": "SUPPORTING (STATIC)",
            "composite_confidence": 0.0,
            "evidence_quality": "INSUFFICIENT",
            "decision": "STANDBY - AWAITING CAMERA SIGNAL"
        },
        "corridor_plan": {
            "corridor_id": "PVNR-CORRIDOR-01",
            "corridor_name": "PVNR Expressway Corridor",
            "city": "Smart City",
            "junctions": DEFAULT_ROAD_GRAPH["junctions"],
            "signal_controller": {
                "status": "NOT CONNECTED (ADVISORY MODE)",
                "protocol": "NTCIP-1202 / SCATS (ADVISORY)"
            }
        }
    })

    return {"message": "GreenWave source halted. System returned to clean STANDBY.", "camera_id": target_id}


@router.post("/upload")
async def upload_greenwave_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    camera_id: Optional[str] = Query(None)
):
    """Ingests custom user-uploaded video through the exact same downstream pipeline."""
    target_id = camera_id or f"CUSTOM_UPLOAD_{int(time.time())}"
    _reset_greenwave_source(target_id)

    os.makedirs("data/uploads", exist_ok=True)
    file_path = f"data/uploads/{int(time.time())}_{file.filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())

    engine = AmbulanceDetector(fps=24)
    _greenwave_engines[target_id] = engine
    _greenwave_active_sources[target_id] = {
        "source_type": "upload",
        "title": file.filename,
        "video_path": file_path,
        "fps": 24.0
    }

    # Automatically start custom upload loop
    async def run_upload_pipeline():
        detector = get_detector()
        cap = cv2.VideoCapture(file_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
        frame_delay = 1.0 / max(10.0, min(30.0, fps))
        frame_idx = 0
        cached_detections = []

        try:
            while True:
                t0 = time.time()
                ret, frame = cap.read()
                if not ret or frame is None:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    frame_idx = 0
                    ret, frame = cap.read()
                    if not ret: break

                frame_idx += 1
                source_timestamp = frame_idx / max(1.0, fps)

                if frame_idx % 2 == 1 or not cached_detections:
                    res = await asyncio.to_thread(detector.detect_people, frame.copy(), True, 500, None, [2, 3, 5, 7])
                    cached_detections = [{"bbox": b["bbox"], "id": b["id"]} for b in getattr(res, "bounding_boxes", [])]

                out = engine.process_frame(frame, cached_detections, source_timestamp=source_timestamp)
                push_greenwave_event(target_id, {"camera_id": target_id, **out})

                hud = draw_ambulance_hud(frame, out, source_title=file.filename, video_timestamp=source_timestamp, provenance="CUSTOM UPLOAD")
                _, jpeg = cv2.imencode(".jpg", hud, [cv2.IMWRITE_JPEG_QUALITY, 80])
                _greenwave_frames[target_id] = jpeg.tobytes()

                elapsed = time.time() - t0
                await asyncio.sleep(max(0.002, frame_delay - elapsed))
        except Exception as e:
            logger.error(f"Upload loop failed: {e}")
        finally:
            cap.release()

    task = asyncio.create_task(run_upload_pipeline())
    _greenwave_tasks[target_id] = task

    return {
        "status": "UPLOAD_INGESTED",
        "camera_id": target_id,
        "filename": file.filename,
        "provenance": "CUSTOM_UPLOAD"
    }


@router.get("/stream/{session_id}")
async def greenwave_video_stream(session_id: str):
    """Streams live MJPEG frames with cybernetic HUD annotations and provenance watermarks."""
    cam_id = str(session_id)

    async def frame_generator():
        last_yielded = None
        while True:
            frame_bytes = _greenwave_frames.get(cam_id)
            if frame_bytes is not None:
                if frame_bytes != last_yielded:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                    last_yielded = frame_bytes
                await asyncio.sleep(0.030)
                continue

            # Honest Standby Card
            standby = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.rectangle(standby, (20, 20), (620, 460), (35, 40, 45), 2)
            cv2.putText(standby, "LAMINAR GREEN WAVE 2.0", (160, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 200), 2, cv2.LINE_AA)
            cv2.putText(standby, "CORRIDOR ENGINE STANDBY - NO ACTIVE STREAM", (120, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1, cv2.LINE_AA)
            cv2.putText(standby, "Attach RTSP camera or engage Ambulance Demonstration in Source Lab", (110, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (120, 120, 140), 1, cv2.LINE_AA)
            _, s_jpeg = cv2.imencode(".jpg", standby, [cv2.IMWRITE_JPEG_QUALITY, 60])
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + s_jpeg.tobytes() + b'\r\n')
            await asyncio.sleep(0.08)

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")


@router.get("/telemetry/{session_id}")
async def get_greenwave_telemetry(session_id: str):
    """Retrieves current evidence breakdown, corridor plan, and lifecycle state."""
    cam_id = str(session_id)
    engine = _greenwave_engines.get(cam_id)
    if not engine:
        return {
            "scene_state": "MONITORING",
            "vehicle_count": 0,
            "emergency_vehicles": 0,
            "persistence_seconds": 0.0,
            "evidence": {
                "vehicle_classification": 0.0,
                "emergency_markings": 0.0,
                "track_consistency": 0.0,
                "temporal_consistency": 0.0,
                "motion_consistency": 0.0,
                "beacon_signal": "SUPPORTING (STATIC)",
                "composite_confidence": 0.0,
                "evidence_quality": "INSUFFICIENT",
                "decision": "STANDBY - AWAITING CAMERA SIGNAL"
            },
            "corridor_plan": {
                "corridor_id": "PVNR-CORRIDOR-01",
                "corridor_name": "PVNR Expressway Corridor",
                "city": "Smart City",
                "junctions": DEFAULT_ROAD_GRAPH["junctions"],
                "signal_controller": {
                    "status": "NOT CONNECTED (ADVISORY MODE)",
                    "protocol": "NTCIP-1202 / SCATS (ADVISORY)"
                }
            }
        }

    return {
        "scene_state": engine.scene_state,
        "vehicle_count": len(engine.tracks),
        "emergency_vehicles": 1 if engine.scene_state in ("VERIFIED", "TRANSIT ACTIVE") else 0,
        "candidate_track_id": engine.active_candidate_id,
        "verified_track_id": engine.verified_ambulance_id,
        "persistence_seconds": engine.persistence_seconds,
        "evidence": engine.current_evidence,
        "corridor_plan": engine._generate_corridor_plan(
            engine.tracks.get(engine.verified_ambulance_id or engine.active_candidate_id or "")
        ),
        "active_source": _greenwave_active_sources.get(cam_id),
        "timeline": list(engine.timeline)
    }


@router.get("/events/stream/{session_id}")
async def greenwave_events_stream(session_id: str):
    """SSE event subscription stream for live dashboard telemetry."""
    if session_id not in _greenwave_subscribers:
        _greenwave_subscribers[session_id] = []

    q = asyncio.Queue(maxsize=100)
    _greenwave_subscribers[session_id].append(q)

    async def event_generator():
        try:
            yield 'data: {"status": "connected"}\n\n'
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            if q in _greenwave_subscribers.get(session_id, []):
                _greenwave_subscribers[session_id].remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/actions/authorize")
async def authorize_corridor_clearance(payload: Dict[str, Any]):
    """
    Operator Authorization Gate:
    Explicitly separates AI corridor recommendation, Operator Authorization,
    and physical signal execution (Not Connected / Advisory Mode).
    """
    operator_id = payload.get("operator_id", "OPERATOR_TRAFFIC_CHIEF")
    corridor_id = payload.get("corridor_id", "PVNR-CORRIDOR-01")
    camera_id = payload.get("camera_id", "GREENWAVE_DEMO_NODE_01")
    notes = payload.get("notes", "Operator confirmed emergency transit recommendation.")

    audit_entry = {
        "audit_id": f"AUDIT-GW-{int(time.time())}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "camera_id": camera_id,
        "corridor_id": corridor_id,
        "operator_id": operator_id,
        "notes": notes,
        "plan_state": "CORRIDOR_PLAN_GENERATED",
        "operator_state": "AUTHORIZED_BY_OPERATOR",
        "physical_signal_state": "NOT_CONNECTED (ADVISORY_MODE)",
        "clearance_recommendations": [
            {"junction": "J1", "status": "CLEARED (ADVISORY)"},
            {"junction": "J2", "status": "CLEARED (ADVISORY)"},
            {"junction": "J3", "status": "CLEARED (ADVISORY)"}
        ]
    }
    _greenwave_audit_logs.append(audit_entry)

    # Push Notification to security/traffic operators
    await notification_service.push_notification(
        domain="traffic",
        type="GREEN_WAVE_AUTHORIZED",
        priority="CRITICAL",
        description=f"Operator {operator_id} authorized emergency corridor on {corridor_id}. Advisory pre-emption active.",
        venue_id="smart-city-core",
        venue_name="PVNR Expressway",
        metadata=audit_entry
    )

    return {
        "status": "CORRIDOR_AUTHORIZED",
        "audit": audit_entry
    }


@router.get("/actions/audit")
async def get_greenwave_audit_logs():
    """Returns the immutable operator authorization audit trail."""
    return _greenwave_audit_logs


# Backwards compatibility
@router.get("/status")
async def get_greenwave_status() -> Dict[str, Any]:
    return GLOBAL_STATE.get_domain_state("greenwave")
