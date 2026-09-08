import os
import cv2
import numpy as np
import asyncio
from datetime import datetime, timezone
from sqlalchemy.future import select
import psutil

from app.core.database import async_session_factory
from app.models.analysis_job import AnalysisJob, JobStatus
from app.vision.vision_core import VisionCore
from app.vision.incident_detector import incident_detector
from app.vision.traffic_worker import draw_vehicle_overlays, draw_hud
from app.core.global_state import GLOBAL_STATE

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

async def async_process_upload_job(job_id: str, file_path: str):
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

    # Prepare VideoWriter for Annotated Output Video
    annotated_path = os.path.join(os.path.dirname(file_path), f"annotated_{job_id}.mp4")
    writer = None
    try:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(annotated_path, fourcc, fps, (width, height))
    except Exception:
        writer = None

    incidents = []
    events_log = []
    vehicle_class_counts = {"Car": 0, "Truck": 0, "Bus": 0, "Motorcycle": 0}
    density_matrix = [[0, 0, 0, 0] for _ in range(4)]

    frame_idx = 0
    sampled_counts = []
    sampled_speeds = []
    bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=False)

    in_dense_mode = False
    dense_mode_frames_left = 0

    worker_vision_core = VisionCore()

    v_count = 0
    avg_frame_speed = 0.0
    motion_ratio = 0.0
    tracked_objs = []
    frame_incidents = []

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            annotated_frame = frame.copy()

            # Sample rate for heavy processing
            skip_rate = max(1, int(fps / 3))
            is_sample_frame = (frame_idx % skip_rate == 0) or in_dense_mode

            # Motion detection
            fg_mask = bg_subtractor.apply(frame)
            motion_ratio = np.sum(fg_mask > 0) / (fg_mask.shape[0] * fg_mask.shape[1])

            if motion_ratio > 0.04 or in_dense_mode:
                if not in_dense_mode:
                    in_dense_mode = True
                    dense_mode_frames_left = int(fps * 2)
                else:
                    dense_mode_frames_left -= 1
                    if dense_mode_frames_left <= 0:
                        in_dense_mode = False

            if is_sample_frame:
                vision_state = await worker_vision_core.process_frame(frame, f"job_{job_id}")
                frame_hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
                frame_incidents = incident_detector.analyze_incidents(vision_state, frame_hsv)

                # Process tracked objects for counts & vehicle classes (exclude pedestrians)
                tracked_objs = [t for t in vision_state.tracks if t.get("class_name") != "person"] if hasattr(vision_state, "tracks") else []
                v_count = len(tracked_objs)
                sampled_counts.append(v_count)

                speeds = [obj.get("speed_px_s", 10.0) for obj in tracked_objs if "speed_px_s" in obj]
                avg_frame_speed = float(np.mean(speeds)) if speeds else float(12.0 + motion_ratio * 40.0)
                sampled_speeds.append(avg_frame_speed)

                for obj in tracked_objs:
                    cls_name = (obj.get("class_name") or "car").lower()
                    if "truck" in cls_name:
                        vehicle_class_counts["Truck"] += 1
                    elif "bus" in cls_name:
                        vehicle_class_counts["Bus"] += 1
                    elif "motor" in cls_name or "bike" in cls_name:
                        vehicle_class_counts["Motorcycle"] += 1
                    else:
                        vehicle_class_counts["Car"] += 1

                    # Update 4x4 spatial density grid
                    box = obj.get("bbox", [0, 0, 100, 100])
                    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
                    r_idx = min(3, max(0, int((cy / height) * 4)))
                    c_idx = min(3, max(0, int((cx / width) * 4)))
                    density_matrix[r_idx][c_idx] += 1

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
                            "description": inc.get("description", "Accident detected on monitored corridor."),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "confidence": inc.get("confidence", 0.9),
                            "camera_id": f"job_{job_id}",
                            "location": "Road Media Stream"
                        }
                        GLOBAL_STATE.push_event("incident", "", inc_event)

                # Draw bounding boxes & vehicle labels
                annotated_frame = draw_vehicle_overlays(annotated_frame, tracked_objs)

                # Draw incident warnings if present
                if frame_incidents:
                    for inc in frame_incidents:
                        if "bbox" in inc and len(inc["bbox"]) == 4:
                            bx1, by1, bx2, by2 = [int(p) for p in inc["bbox"]]
                            cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (0, 0, 255), 3)
                            cv2.putText(annotated_frame, f"⚠️ COLLISION ({int(inc.get('confidence', 0.9)*100)}%)", 
                                        (bx1, max(by1 - 8, 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                        
                        # Banner header
                        cv2.rectangle(annotated_frame, (0, 0), (width, 42), (0, 0, 180), -1)
                        cv2.putText(annotated_frame, f"CRITICAL INCIDENT DETECTED: {inc.get('description', 'Collision')}", 
                                    (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

                # Draw HUD
                hud_data = {
                    "count": v_count,
                    "density": "High" if v_count > 10 else "Medium" if v_count > 4 else "Low",
                    "avg_velocity": avg_frame_speed,
                    "risk_score": min(100, int(v_count * 5 + len(frame_incidents) * 40))
                }
                annotated_frame = draw_hud(annotated_frame, hud_data)

                # Add to periodic events log
                if frame_idx % int(fps * 2) == 0:
                    ts_str = f"{int(frame_idx / fps // 60)}:{int(frame_idx / fps % 60):02d}"
                    risk_lvl = "CRITICAL" if v_count > 15 else "HIGH" if v_count > 10 else "MEDIUM" if v_count > 5 else "LOW"
                    events_log.append({
                        "time": ts_str,
                        "vehicles": v_count,
                        "speed": f"{avg_frame_speed:.2f}px/s",
                        "risk": risk_lvl
                    })

            # Write frame to video output
            if writer is not None:
                try:
                    writer.write(annotated_frame)
                except Exception:
                    pass

            # Update progress & progressive result_data periodically so UI reflects live stats while video plays
            if (frame_idx % 25 == 0 or frame_idx == 10) and total_frames > 0:
                progress = min(99.0, round((frame_idx / total_frames) * 100, 1))
                curr_avg_v = float(np.mean(sampled_counts)) if sampled_counts else float(v_count)
                curr_peak_v = int(np.max(sampled_counts)) if sampled_counts else v_count
                curr_avg_spd = float(np.mean(sampled_speeds)) if sampled_speeds else float(avg_frame_speed)
                
                curr_breakdown = {k: v for k, v in vehicle_class_counts.items() if v > 0}
                if not curr_breakdown and v_count > 0:
                    curr_breakdown = {"Car": v_count}

                intermediate_result = {
                    "summary": {
                        "avg_vehicle_count": round(curr_avg_v, 1),
                        "peak_count": curr_peak_v,
                        "avg_speed_px_s": round(curr_avg_spd, 1),
                        "avg_wait_min": max(0.5, round(curr_avg_v * 0.8, 1)),
                        "peak_density": "HIGH" if curr_peak_v > 12 else "MEDIUM" if curr_peak_v > 6 else "LOW",
                        "duration_seconds": round(frame_idx / fps, 1)
                    },
                    "vehicle_breakdown": curr_breakdown,
                    "density_matrix": density_matrix,
                    "events": events_log[-8:],
                    "incidents": incidents
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
                        "wait_time_estimate": round(curr_avg_v * 0.8, 1),
                        "risk_score": min(100, int(v_count * 5 + len(incidents) * 35)),
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
            writer.release()

        # Compute summary metrics
        avg_v_count = float(np.mean(sampled_counts)) if sampled_counts else 0.0
        peak_v_count = int(np.max(sampled_counts)) if sampled_counts else 0
        avg_speed_val = float(np.mean(sampled_speeds)) if sampled_speeds else 0.0
        avg_wait_val = max(0.5, round((avg_v_count * 0.8), 1))
        peak_density = "HIGH" if peak_v_count > 12 else "MEDIUM" if peak_v_count > 6 else "LOW"

        # Real vehicle classification counts without artificial multipliers
        filtered_breakdown = {k: v for k, v in vehicle_class_counts.items() if v > 0}

        result_payload = {
            "summary": {
                "avg_vehicle_count": round(avg_v_count, 1),
                "peak_count": peak_v_count,
                "avg_speed_px_s": round(avg_speed_val, 1),
                "avg_wait_min": avg_wait_val,
                "peak_density": peak_density,
                "duration_seconds": round(total_frames / fps, 1)
            },
            "vehicle_breakdown": filtered_breakdown,
            "density_matrix": density_matrix,
            "events": events_log,
            "incidents": incidents
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

    except Exception as exc:
        cap.release()
        if writer is not None:
            writer.release()
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
