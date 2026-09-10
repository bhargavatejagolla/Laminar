import os
import time
import cv2
import numpy as np
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.future import select
import psutil

from app.core.database import async_session_factory
from app.models.analysis_job import AnalysisJob, JobStatus
from app.vision.vision_core import VisionCore
from app.vision.incident_detector import incident_detector, IncidentIntelligence
from app.vision.traffic_worker import draw_vehicle_overlays, draw_hud
from app.vision.road_condition_detector import road_condition_detector
from app.vision.intersection_analyzer import intersection_analyzer
from app.core.global_state import GLOBAL_STATE
from app.core.logging import get_logger
from app.services.notification_service import notification_service
from app.services.event_bus import event_bus
from app.models.intelligence_event import LaminarIntelligenceEvent, LocationPayload

logger = get_logger(__name__)

def process_upload_job(job_id: str, file_path: str, job_timeout: int = 3600):
    """
    RQ worker entrypoint (if using external RQ worker process).
    """
    try:
        p = psutil.Process(os.getpid())
        if hasattr(psutil, "BELOW_NORMAL_PRIORITY_CLASS"):
            p.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
        else:
            p.nice(10)
    except Exception:
        pass

    asyncio.run(async_process_upload_job(job_id, file_path))

async def async_process_upload_job(job_id: str, file_path: str, venue_id: Optional[str] = None):
    """
    Async logic for analyzing uploaded video using VisionCore.
    Generates annotated video with bounding boxes, speeds, and incident highlights,
    and broadcasts detected accidents to the live Incident Feed.
    """
    # 1. Mark job as PROCESSING
    async with async_session_factory() as session:
        result = await session.execute(select(AnalysisJob).where(AnalysisJob.job_id == job_id))
        job = result.scalar_one_or_none()
        if job:
            job.status = JobStatus.PROCESSING
            await session.commit()

    if not os.path.exists(file_path):
        await _fail_job(job_id, "Video file not found on disk")
        return

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        await _fail_job(job_id, "Failed to open video file (unsupported codec or corrupt file)")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720

    # Prepare VideoWriter for Native H.264 HTML5 Output Video
    annotated_path = os.path.join(os.path.dirname(file_path), f"annotated_{job_id}.mp4")
    writer = None
    use_imageio = False
    try:
        import imageio
        writer = imageio.get_writer(
            annotated_path,
            fps=fps,
            codec='libx264',
            pixelformat='yuv420p',
            ffmpeg_params=['-movflags', '+faststart']
        )
        use_imageio = True
        logger.info(f"Initialized imageio H.264 video writer for job {job_id}")
    except Exception as e:
        logger.warning(f"imageio libx264 writer unavailable ({e}), falling back to OpenCV VideoWriter")
        try:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(annotated_path, fourcc, fps, (width, height))
            use_imageio = False
        except Exception:
            writer = None

    incidents = []
    events_log = []
    notified_incident_ids = set()
    density_alert_sent = False
    vehicle_observation_counts = {
        "Car": 0, "Truck": 0, "Bus": 0, "Motorcycle": 0, "Bicycle": 0, "Train": 0
    }
    unique_vehicles_by_id = {} # track_id -> normalized class
    spatial_density_accum = [[0, 0, 0, 0] for _ in range(4)]
    current_density_grid = [[0, 0, 0, 0] for _ in range(4)]
    sample_count = 0

    frame_idx = 0
    sampled_counts = []
    sampled_speeds = []
    sampled_waits = []

    worker_vision_core = VisionCore()
    worker_incident_detector = IncidentIntelligence()

    road_defects = []
    latest_road_condition = road_condition_detector.get_status()
    latest_intersection_summary = {
        "status": "NOT_CONFIGURED",
        "signal_state": "SIGNAL DATA NOT CONNECTED",
        "metrics": {
            "approach_vehicles": 0,
            "queue_length_vehicles": 0,
            "stopped_vehicles": 0,
            "conflict_zone_occupancy": 0,
            "blockage_detected": False
        },
        "notes": "No intersection geometry or signal integration configured for this video stream."
    }

    v_count = 0
    avg_frame_speed = 0.0
    tracked_objs = []
    last_tracked_objs = []
    frame_incidents = []

    # Fast sampling: run YOLO at ~6 FPS, interpolate in between for 30 FPS smooth rendering
    skip_rate = max(1, int(fps / 6))
    dt_step = skip_rate / fps
    proc_start_time = time.time()

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            annotated_frame = frame.copy()
            sub_step = (frame_idx - 1) % skip_rate
            is_sample_frame = (sub_step == 0)

            if is_sample_frame:
                sample_count += 1
                vision_state = await worker_vision_core.process_frame(
                    frame, f"job_{job_id}", dt=dt_step
                )
                frame_hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
                frame_incidents = worker_incident_detector.analyze_incidents(vision_state, frame_hsv)

                # Process tracked objects for counts & vehicle classes (exclude pedestrians from vehicle count)
                tracked_objs = [t for t in vision_state.tracks if t.get("class_name") != "person"] if hasattr(vision_state, "tracks") else []
                last_tracked_objs = tracked_objs
                v_count = len(tracked_objs)
                sampled_counts.append(v_count)

                speeds = [float(obj.get("speed_px_s", 0.0)) for obj in tracked_objs if obj.get("speed_px_s", 0) > 0]
                avg_frame_speed = float(np.mean(speeds)) if speeds else 0.0
                sampled_speeds.append(avg_frame_speed)

                stopped_delays = [t.get("wait_time_s", 0.0) for t in tracked_objs if t.get("stopped_frames", 0) > 3]
                curr_wait_min = round(float(np.mean(stopped_delays)) / 60.0, 1) if stopped_delays else 0.0
                sampled_waits.append(curr_wait_min)

                # Reset current spatial grid for this sample frame
                current_density_grid = [[0, 0, 0, 0] for _ in range(4)]

                for obj in tracked_objs:
                    cls_lower = (obj.get("class_name") or "car").lower()
                    if "truck" in cls_lower:
                        norm_class = "Truck"
                    elif "bus" in cls_lower:
                        norm_class = "Bus"
                    elif "train" in cls_lower:
                        norm_class = "Train"
                    elif "motor" in cls_lower:
                        norm_class = "Motorcycle"
                    elif "bike" in cls_lower or "bicycle" in cls_lower:
                        norm_class = "Bicycle"
                    else:
                        norm_class = "Car"

                    vehicle_observation_counts[norm_class] = vehicle_observation_counts.get(norm_class, 0) + 1

                    # Record unique vehicle track ID
                    tid = obj.get("id") or obj.get("track_id")
                    if tid is not None:
                        unique_vehicles_by_id[str(tid)] = norm_class

                    # Update 4x4 spatial density grid
                    box = obj.get("bbox", [0, 0, 100, 100])
                    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
                    r_idx = min(3, max(0, int((cy / height) * 4)))
                    c_idx = min(3, max(0, int((cx / width) * 4)))
                    current_density_grid[r_idx][c_idx] += 1
                    spatial_density_accum[r_idx][c_idx] += 1

                # Incident recording & Live Event Push (with persistent lifecycle ID)
                if frame_incidents:
                    for inc in frame_incidents:
                        inc["timestamp_seconds"] = round(frame_idx / fps, 2)
                        existing_idx = next((i for i, x in enumerate(incidents) if x.get("id") == inc.get("id")), -1)
                        if existing_idx >= 0:
                            incidents[existing_idx] = inc
                        else:
                            incidents.append(inc)

                        inc_id = inc.get("id") or f"LMNR-INC-{job_id[:8]}"
                        inc_event = {
                            "id": inc_id,
                            "type": inc.get("type", "collision"),
                            "priority": inc.get("priority", "CRITICAL"),
                            "title": "Incident Confirmed on Video Stream",
                            "description": inc.get("description", "Roadway hazard detected."),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "confidence": inc.get("confidence", 0.9),
                            "camera_id": f"job_{job_id}",
                            "location": "Road Media Stream"
                        }
                        GLOBAL_STATE.push_event("incident", "", inc_event)

                        # Debounced Notification & Event Dispatch via LAMINAR Unified Event Bus
                        if inc_id not in notified_incident_ids and inc.get("status") == "CONFIRMED":
                            notified_incident_ids.add(inc_id)

                            v_lat, v_lon = None, None
                            v_name = "Road Media Stream"
                            target_venue_id = venue_id or job_id
                            if venue_id:
                                try:
                                    from app.models.venue import Venue as VenueModel
                                    from uuid import UUID
                                    v_uuid = None
                                    try:
                                        v_uuid = UUID(str(venue_id))
                                    except Exception:
                                        pass
                                    if v_uuid:
                                        async with async_session_factory() as session:
                                            v_obj = await session.get(VenueModel, v_uuid)
                                        if v_obj:
                                            v_name = v_obj.name
                                            v_lat = float(v_obj.latitude) if v_obj.latitude else None
                                            v_lon = float(v_obj.longitude) if v_obj.longitude else None
                                except Exception as v_err:
                                    logger.warning(f"Could not resolve venue {venue_id}: {v_err}")

                            # Capture annotated collision snapshot
                            inc_snap_path = None
                            inc_snap_url = None
                            try:
                                snap_frame = draw_vehicle_overlays(frame.copy(), tracked_objs)
                                if "bbox" in inc and len(inc["bbox"]) == 4:
                                    bx1, by1, bx2, by2 = [int(p) for p in inc["bbox"]]
                                    cv2.rectangle(snap_frame, (bx1, by1), (bx2, by2), (0, 0, 255), 3)
                                    cv2.putText(snap_frame, f"CRITICAL COLLISION ({int(inc.get('confidence', 0.85)*100)}%)",
                                                (bx1, max(by1 - 8, 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)
                                cv2.rectangle(snap_frame, (0, 0), (width, 36), (0, 0, 180), -1)
                                cv2.putText(snap_frame, f"LAMINAR COLLISION VERIFIED: {v_name} @ {round(frame_idx/fps, 2)}s",
                                            (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2)
                                
                                os.makedirs("data/uploads", exist_ok=True)
                                os.makedirs("screenshots/incidents", exist_ok=True)
                                fname = f"incident_{inc_id}_{int(time.time()*1000)}.jpg"
                                inc_snap_path = os.path.abspath(os.path.join("data", "uploads", fname))
                                cv2.imwrite(inc_snap_path, snap_frame)
                                inc_snap_url = f"/api/v1/uploads/{fname}"
                                cv2.imwrite(os.path.abspath(os.path.join("screenshots", "incidents", fname)), snap_frame)
                            except Exception as snap_err:
                                logger.warning(f"Could not save collision snapshot: {snap_err}")

                            ev = LaminarIntelligenceEvent(
                                event_id=inc_id,
                                event_type="collision_verified",
                                domain="incident",
                                venue_id=target_venue_id,
                                venue_name=v_name,
                                camera_id=f"job_{job_id}",
                                camera_name=f"Video Analysis Job {job_id[:8]}",
                                source_type="upload",
                                location=LocationPayload(
                                    latitude=v_lat,
                                    longitude=v_lon,
                                    location_source="VENUE_CONFIG" if v_lat else "VIDEO_METADATA"
                                ),
                                severity=inc.get("priority", "CRITICAL").lower(),
                                confidence=float(inc.get("confidence", 0.85)),
                                state="verified",
                                title="Collision Anomaly Verified",
                                description=inc.get("description", "Roadway collision detected on video."),
                                evidence={
                                    "track_ids": inc.get("track_ids", []),
                                    "timestamp_seconds": inc.get("timestamp_seconds", 0),
                                    "bbox": inc.get("bbox", []),
                                    "signals": inc.get("evidence", {}).get("signals", {}),
                                    "post_impact": inc.get("evidence", {}).get("post_impact", {}),
                                    "screenshot_path": inc_snap_path,
                                    "screenshot_url": inc_snap_url
                                },
                                frame_url=inc_snap_url,
                                explanation={
                                    "reason": "Severe physical impact signature verified with post-impact evidence continuity.",
                                    "confidence": inc.get("confidence", 0.85)
                                }
                            )
                            try:
                                await event_bus.emit_event(ev, cooldown_seconds=10.0)
                            except Exception as notif_err:
                                logger.warning(f"Could not emit event for {inc_id}: {notif_err}")

                            # Push to GLOBAL_STATE notifications feed so both PDF reports and live feeds include it
                            GLOBAL_STATE.push_event("notifications", "incident", {
                                "id": f"NOTIF-{inc_id}",
                                "domain": "incident",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "risk_level": "critical",
                                "latitude": float(v_lat or 0.0),
                                "longitude": float(v_lon or 0.0),
                                "total_vehicles": v_count,
                                "congestion_level": "High" if v_count > 6 else "Medium",
                                "velocity": float(round(float(avg_frame_speed), 2)),
                                "wait_time": float(curr_wait_min),
                                "risk_score": 95,
                                "insight": f"Collision verified between tracks #{', #'.join(str(t) for t in inc.get('track_ids', []))}",
                                "recommendation": "Dispatch Level-1 EMS and Traffic Marshals immediately.",
                                "screenshot_path": inc_snap_path,
                                "screenshot_url": inc_snap_url
                            })

                # Venue-aware threshold evaluation for traffic congestion
                warn_thresh = 6
                crit_thresh = 10
                if venue_id:
                    try:
                        v_state = GLOBAL_STATE.get_venue_state("traffic", venue_id)
                        if v_state and v_state.get("warning_threshold"):
                            warn_thresh = int(v_state["warning_threshold"])
                        if v_state and v_state.get("critical_threshold"):
                            crit_thresh = int(v_state["critical_threshold"])
                    except Exception:
                        pass

                is_dense = (v_count >= crit_thresh) or (v_count >= warn_thresh and avg_frame_speed < 30.0) or (v_count >= 10)
                if is_dense and not density_alert_sent and frame_idx >= int(fps * 2):
                    density_alert_sent = True
                    
                    dens_snap_path = None
                    dens_snap_url = None
                    try:
                        d_frame = draw_vehicle_overlays(frame.copy(), tracked_objs)
                        d_frame = draw_hud(d_frame, {"count": v_count, "density": "High", "avg_velocity": avg_frame_speed, "risk_score": 85})
                        os.makedirs("data/uploads", exist_ok=True)
                        os.makedirs("screenshots/traffic", exist_ok=True)
                        d_fn = f"congestion_{job_id[:8]}_{frame_idx}_{int(time.time()*1000)}.jpg"
                        dens_snap_path = os.path.abspath(os.path.join("data", "uploads", d_fn))
                        cv2.imwrite(dens_snap_path, d_frame)
                        dens_snap_url = f"/api/v1/uploads/{d_fn}"
                        cv2.imwrite(os.path.abspath(os.path.join("screenshots", "traffic", d_fn)), d_frame)
                    except Exception as d_err:
                        logger.warning(f"Could not save congestion snapshot: {d_err}")

                    dens_ev = LaminarIntelligenceEvent(
                        event_id=f"DENS-{job_id[:8]}-{frame_idx}",
                        event_type="traffic_density_critical",
                        domain="traffic",
                        venue_id=venue_id or job_id,
                        venue_name=v_name if 'v_name' in locals() else "Road Media Stream",
                        camera_id=f"job_{job_id}",
                        camera_name=f"Video Analysis Job {job_id[:8]}",
                        source_type="upload",
                        location=LocationPayload(
                            latitude=v_lat if 'v_lat' in locals() else None,
                            longitude=v_lon if 'v_lon' in locals() else None,
                            location_source="VENUE_CONFIG" if ('v_lat' in locals() and v_lat) else "VIDEO_METADATA"
                        ),
                        severity="critical" if v_count >= crit_thresh else "high",
                        confidence=0.95,
                        state="active",
                        title="Corridor Density Critical",
                        description=f"Corridor congestion critical: {v_count} concurrent vehicles detected at {avg_frame_speed:.1f} px/s.",
                        evidence={
                            "vehicle_count": v_count,
                            "timestamp_seconds": round(frame_idx / fps, 2),
                            "avg_velocity": avg_frame_speed,
                            "threshold": crit_thresh,
                            "screenshot_path": dens_snap_path,
                            "screenshot_url": dens_snap_url
                        },
                        frame_url=dens_snap_url,
                        explanation={"observed_count": v_count, "threshold": crit_thresh, "rule": f"Observed {v_count} vehicles >= {crit_thresh} threshold"}
                    )
                    try:
                        await event_bus.emit_event(dens_ev, cooldown_seconds=60.0)
                    except Exception as notif_err:
                        logger.warning(f"Could not emit density event: {notif_err}")

                    GLOBAL_STATE.push_event("notifications", "traffic", {
                        "id": f"NOTIF-DENS-{job_id[:8]}-{frame_idx}",
                        "domain": "traffic",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "risk_level": "critical" if v_count >= crit_thresh else "high",
                        "latitude": float(v_lat or 0.0) if 'v_lat' in locals() else 0.0,
                        "longitude": float(v_lon or 0.0) if 'v_lon' in locals() else 0.0,
                        "total_vehicles": v_count,
                        "congestion_level": "Critical" if v_count >= crit_thresh else "High",
                        "velocity": float(round(float(avg_frame_speed), 2)),
                        "wait_time": float(curr_wait_min),
                        "risk_score": 85 if v_count >= crit_thresh else 70,
                        "insight": f"High volume spike: {v_count} concurrent vehicles detected.",
                        "recommendation": "Adjust traffic signal timings or deploy marshals.",
                        "screenshot_path": dens_snap_path,
                        "screenshot_url": dens_snap_url
                    })

                # Road Condition Defect Analysis (Zero-mock: reports NOT_CONFIGURED when weights missing)
                rc_res = road_condition_detector.detect_defects(
                    frame,
                    camera_id=f"job_{job_id}",
                    venue_id=venue_id or job_id,
                    venue_name=v_name if 'v_name' in locals() else "Road Media Stream",
                    timestamp_s=round(frame_idx / fps, 2),
                    dt=dt_step
                )
                latest_road_condition = rc_res
                if rc_res.get("confirmed_defects"):
                    for cd in rc_res["confirmed_defects"]:
                        road_defects.append(cd)

                # Intersection & Cross-Road Kinematics (Zero-mock: reports NOT_CONFIGURED when geometry missing)
                inter_res = intersection_analyzer.analyze_intersection(
                    tracked_objs,
                    intersection_config=None,
                    camera_id=f"job_{job_id}"
                )
                latest_intersection_summary = inter_res

                active_draw_objs = tracked_objs
            else:
                # Interpolate positions for smooth 30 FPS bounding boxes
                active_draw_objs = []
                for obj in last_tracked_objs:
                    b = obj.get("bbox", [0, 0, 10, 10])
                    vx = obj.get("vx", 0.0) / fps
                    vy = obj.get("vy", 0.0) / fps
                    interp_box = [
                        round(b[0] + vx * sub_step, 1),
                        round(b[1] + vy * sub_step, 1),
                        round(b[2] + vx * sub_step, 1),
                        round(b[3] + vy * sub_step, 1),
                    ]
                    interp_obj = dict(obj)
                    interp_obj["bbox"] = interp_box
                    active_draw_objs.append(interp_obj)

            # Draw bounding boxes & vehicle labels on EVERY frame
            annotated_frame = draw_vehicle_overlays(annotated_frame, active_draw_objs)

            # Draw road defect overlays if detected
            if latest_road_condition.get("raw_detections"):
                for rd in latest_road_condition["raw_detections"]:
                    bx1, by1, bx2, by2 = [int(p) for p in rd.get("bbox", [0, 0, 0, 0])]
                    cname = rd.get("class", "defect").upper()
                    conf = int(rd.get("confidence", 0.8) * 100)
                    cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (0, 165, 255), 2)
                    cv2.putText(annotated_frame, f"ROAD DEFECT: {cname} ({conf}%)", 
                                (bx1, max(by1 - 6, 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 165, 255), 2)

            # Draw incident warnings if present
            if frame_incidents:
                for inc in frame_incidents:
                    if "bbox" in inc and len(inc["bbox"]) == 4:
                        bx1, by1, bx2, by2 = [int(p) for p in inc["bbox"]]
                        cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (0, 0, 255), 3)
                        cv2.putText(annotated_frame, f"⚠️ {inc.get('type', 'INCIDENT').upper()} ({int(inc.get('confidence', 0.9)*100)}%)", 
                                    (bx1, max(by1 - 8, 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                    
                    # Banner header
                    cv2.rectangle(annotated_frame, (0, 0), (width, 40), (0, 0, 180), -1)
                    cv2.putText(annotated_frame, f"CRITICAL INCIDENT: {inc.get('description', 'Hazard Detected')}", 
                                (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2)

            # Draw HUD
            hud_data = {
                "count": v_count,
                "density": "High" if v_count > 10 else "Medium" if v_count > 4 else "Low",
                "avg_velocity": avg_frame_speed,
                "risk_score": min(100, int(v_count * 4 + len(frame_incidents) * 35))
            }
            annotated_frame = draw_hud(annotated_frame, hud_data)

            # Add to periodic events log
            if frame_idx % int(fps * 2) == 0:
                ts_str = f"{int(frame_idx / fps // 60)}:{int(frame_idx / fps % 60):02d}"
                risk_lvl = "CRITICAL" if v_count > 15 else "HIGH" if v_count > 10 else "MEDIUM" if v_count > 5 else "LOW"
                events_log.append({
                    "time": ts_str,
                    "event": f"Active volume: {v_count} vehicles, {len(frame_incidents)} hazards",
                    "severity": risk_lvl
                })

            # Write annotated frame to video output
            if writer is not None:
                try:
                    if use_imageio:
                        # imageio requires RGB format
                        writer.append_data(cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB))
                    else:
                        writer.write(annotated_frame)
                except Exception as w_err:
                    logger.warning(f"Frame write error at frame {frame_idx}: {w_err}")

            # Emit live progress frequently (every ~0.5s of video)
            if frame_idx % max(8, int(fps * 0.5)) == 0 or frame_idx == total_frames - 1:
                progress = min(99.0, round((frame_idx / total_frames) * 100, 1))
                curr_avg_v = float(np.mean(sampled_counts)) if sampled_counts else float(v_count)
                curr_peak_v = int(np.max(sampled_counts)) if sampled_counts else v_count
                curr_avg_spd = float(np.mean(sampled_speeds)) if sampled_speeds else float(avg_frame_speed)
                
                # Unique vehicle counts by class
                unique_class_counts = {}
                for cls in unique_vehicles_by_id.values():
                    unique_class_counts[cls] = unique_class_counts.get(cls, 0) + 1

                curr_unique_breakdown = {k: v for k, v in unique_class_counts.items() if v > 0}
                curr_obs_breakdown = {k: v for k, v in vehicle_observation_counts.items() if v > 0}
                if not curr_unique_breakdown and v_count > 0:
                    curr_unique_breakdown = {"Car": v_count}

                # Honest spatial density grid (latest frame or averaged occupancy)
                active_matrix = [
                    [int(current_density_grid[r][c]) for c in range(4)]
                    for r in range(4)
                ]

                intermediate_result = {
                    "summary": {
                        "avg_vehicle_count": round(curr_avg_v, 1),
                        "peak_count": curr_peak_v,
                        "unique_vehicle_count": len(unique_vehicles_by_id) if unique_vehicles_by_id else curr_peak_v,
                        "avg_speed_px_s": round(curr_avg_spd, 1),
                        "avg_wait_min": curr_wait_min,
                        "peak_density": "HIGH" if curr_peak_v > 12 else "MEDIUM" if curr_peak_v > 6 else "LOW",
                        "duration_seconds": round(frame_idx / fps, 1)
                    },
                    "vehicle_breakdown": curr_unique_breakdown,
                    "vehicle_observations": curr_obs_breakdown,
                    "density_matrix": active_matrix,
                    "events": events_log[-8:],
                    "incidents": incidents,
                    "road_condition": {
                        "status": latest_road_condition.get("status", "NOT_CONFIGURED"),
                        "notes": latest_road_condition.get("notes", "No validated road defect weights located on system."),
                        "total_defects_found": len(road_defects),
                        "defects": road_defects
                    },
                    "intersection": latest_intersection_summary
                }

                # Push to global state so Road Intelligence top cards immediately reflect the uploaded video analysis
                GLOBAL_STATE.update(
                    domain="traffic",
                    venue_id=job_id,
                    payload={
                        "venue_id": job_id,
                        "camera_id": f"job_{job_id}",
                        "count": v_count,
                        "density": "High" if v_count > 10 else "Medium" if v_count > 4 else "Low",
                        "avg_velocity": curr_avg_spd,
                        "wait_time_estimate": curr_wait_min,
                        "risk_score": min(100, int(v_count * 4 + len(incidents) * 35)),
                        "source_type": "upload",
                        "last_updated": time.time(),
                    }
                )

                GLOBAL_STATE.update(
                    domain="road_condition",
                    venue_id=job_id,
                    payload={
                        "venue_id": job_id,
                        "camera_id": f"job_{job_id}",
                        "status": latest_road_condition.get("status", "NOT_CONFIGURED"),
                        "defect_count": len(road_defects),
                        "notes": latest_road_condition.get("notes", ""),
                        "source_type": "upload",
                        "last_updated": time.time(),
                    }
                )

                async with async_session_factory() as session:
                    result = await session.execute(select(AnalysisJob).where(AnalysisJob.job_id == job_id))
                    job = result.scalar_one_or_none()
                    if job:
                        job.progress_percent = progress
                        job.frames_analyzed = frame_idx
                        job.result_data = intermediate_result
                        await session.commit()

            # Yield CPU briefly
            await asyncio.sleep(0.001)

        cap.release()
        if writer is not None:
            try:
                if use_imageio:
                    writer.close()
                else:
                    writer.release()
            except Exception:
                pass

        # Compute final summary metrics
        total_proc_time = max(0.1, time.time() - proc_start_time)
        real_proc_fps = round(frame_idx / total_proc_time, 1)
        avg_v_count = float(np.mean(sampled_counts)) if sampled_counts else 0.0
        peak_v_count = int(np.max(sampled_counts)) if sampled_counts else 0
        avg_speed_val = float(np.mean(sampled_speeds)) if sampled_speeds else 0.0
        avg_wait_val = round(float(np.mean(sampled_waits)), 1) if sampled_waits else 0.0
        peak_density = "HIGH" if peak_v_count > 12 else "MEDIUM" if peak_v_count > 6 else "LOW"

        # Unique vehicle counts by class
        unique_class_counts = {}
        for cls in unique_vehicles_by_id.values():
            unique_class_counts[cls] = unique_class_counts.get(cls, 0) + 1

        final_unique_breakdown = {k: v for k, v in unique_class_counts.items() if v > 0}
        final_obs_breakdown = {k: v for k, v in vehicle_observation_counts.items() if v > 0}

        # Honest average spatial occupancy per zone
        final_avg_matrix = [
            [round(spatial_density_accum[r][c] / max(1, sample_count), 1) for c in range(4)]
            for r in range(4)
        ]

        result_payload = {
            "summary": {
                "avg_vehicle_count": round(avg_v_count, 1),
                "peak_count": peak_v_count,
                "unique_vehicle_count": len(unique_vehicles_by_id) if unique_vehicles_by_id else peak_v_count,
                "avg_speed_px_s": round(avg_speed_val, 1),
                "avg_wait_min": avg_wait_val,
                "peak_density": peak_density,
                "duration_seconds": round(total_frames / fps, 1),
                "processing_fps": real_proc_fps,
                "processing_time_s": round(total_proc_time, 1)
            },
            "vehicle_breakdown": final_unique_breakdown if final_unique_breakdown else {"Car": peak_v_count},
            "vehicle_observations": final_obs_breakdown,
            "density_matrix": final_avg_matrix,
            "events": events_log,
            "incidents": incidents,
            "road_condition": {
                "status": latest_road_condition.get("status", "NOT_CONFIGURED"),
                "notes": latest_road_condition.get("notes", "No validated road defect weights located on system."),
                "total_defects_found": len(road_defects),
                "defects": road_defects
            },
            "intersection": latest_intersection_summary
        }

        # Mark COMPLETED
        async with async_session_factory() as session:
            result = await session.execute(select(AnalysisJob).where(AnalysisJob.job_id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.status = JobStatus.COMPLETED
                job.progress_percent = 100.0
                job.frames_analyzed = frame_idx
                job.result_data = result_payload
                await session.commit()

        logger.info(f"Video analysis job {job_id} successfully completed. Output: {annotated_path}")

    except Exception as exc:
        cap.release()
        if writer is not None:
            try:
                if use_imageio:
                    writer.close()
                else:
                    writer.release()
            except Exception:
                pass
        logger.error(f"Error in async_process_upload_job for {job_id}: {exc}", exc_info=True)
        await _fail_job(job_id, f"Analysis error: {str(exc)}")

async def _fail_job(job_id: str, message: str):
    try:
        async with async_session_factory() as session:
            result = await session.execute(select(AnalysisJob).where(AnalysisJob.job_id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.status = JobStatus.FAILED
                job.error_message = message
                await session.commit()
    except Exception:
        pass
