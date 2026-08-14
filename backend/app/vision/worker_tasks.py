import os
import cv2
import numpy as np
import asyncio
from ultralytics import YOLO
from sqlalchemy.future import select
from collections import deque, defaultdict
from app.core.database import db_manager, DatabaseRole
from app.models.analysis_job import AnalysisJob, JobStatus
import math

# Load YOLO once per worker process
MODEL_PATH = os.path.join(os.getcwd(), "yolo11n.pt")
yolo_model = YOLO(MODEL_PATH)

def calculate_speed(pt1, pt2, fps=30.0):
    """Estimate speed from pixel distance. Needs calibration in real env."""
    dist = math.hypot(pt2[0]-pt1[0], pt2[1]-pt1[1])
    return dist * fps

def process_upload_job(job_id: str, file_path: str, job_timeout: int = 3600):
    """
    RQ worker entrypoint.
    Since RQ workers don't inherently run asyncio event loops in jobs cleanly,
    we run the async processing within this sync wrapper.
    """
    asyncio.run(async_process_upload_job(job_id, file_path))

async def async_process_upload_job(job_id: str, file_path: str):
    """
    Async logic for analyzing the video with adaptive multi-stage sampling.
    """
    await db_manager.initialize()
    engine = db_manager._engines[DatabaseRole.WRITER]
    
    # 1. Update job to PROCESSING
    async with engine.begin() as conn:
        await conn.execute(
            AnalysisJob.__table__.update().where(AnalysisJob.job_id == job_id).values(status=JobStatus.PROCESSING)
        )
        
    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        await _fail_job(job_id, engine, "Failed to open video file")
        return
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Trackers for advanced temporal logic
    # ByteTrack/SORT lightweight emulation via centroids
    trajectories = defaultdict(lambda: deque(maxlen=30))
    event_scores = defaultdict(float) # id -> score
    incidents = []
    
    # For fire temporal logic
    fire_candidates = deque(maxlen=15)
    
    frame_idx = 0
    bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=False)
    
    in_dense_mode = False
    dense_mode_frames_left = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_idx += 1
        
        # --- ADAPTIVE SAMPLING LOGIC ---
        # If not in dense mode, skip frames to do a low-cost scan (e.g., 3 FPS)
        if not in_dense_mode and frame_idx % int(fps / 3) != 0:
            continue
            
        # Low-cost motion scan
        fg_mask = bg_subtractor.apply(frame)
        motion_ratio = np.sum(fg_mask > 0) / (fg_mask.shape[0] * fg_mask.shape[1])
        
        # If significant motion or we are already in dense mode, run YOLO
        if motion_ratio > 0.05 or in_dense_mode:
            # We trigger dense mode for the next 2 seconds (e.g. 60 frames)
            if not in_dense_mode:
                in_dense_mode = True
                dense_mode_frames_left = int(fps * 2)
            else:
                dense_mode_frames_left -= 1
                if dense_mode_frames_left <= 0:
                    in_dense_mode = False
            
            # Run YOLO
            results = yolo_model.track(frame, persist=True, verbose=False, classes=[0, 1, 2, 3, 5, 7]) # person, bicycle, car, motorcycle, bus, truck
            
            if len(results) > 0 and results[0].boxes is not None:
                boxes = results[0].boxes
                
                # Check for Fire/Smoke candidate
                # (Simulated check: in real-world we use a custom trained YOLO class for fire)
                # Here we use heuristic to trigger candidate -> temporal confirm
                hsv = cv2.cvtColor(frame, cv2.cvtColor(frame, cv2.COLOR_BGR2HSV))
                lower_fire = np.array([15, 150, 150])
                upper_fire = np.array([35, 255, 255])
                fire_mask = cv2.inRange(hsv, lower_fire, upper_fire)
                fire_pixels = cv2.countNonZero(fire_mask)
                
                if fire_pixels > 500:
                    fire_candidates.append(1)
                else:
                    fire_candidates.append(0)
                    
                if sum(fire_candidates) > 10:
                    # Temporal confirmation: Fire persisted for > 10 frames in dense mode
                    incidents.append({"type": "FIRE", "timestamp": frame_idx / fps, "confidence": 0.92})
                    fire_candidates.clear()
                
                if boxes.id is not None:
                    ids = boxes.id.cpu().numpy()
                    xyxys = boxes.xyxy.cpu().numpy()
                    
                    current_centroids = {}
                    
                    for track_id, box in zip(ids, xyxys):
                        cx = (box[0] + box[2]) / 2
                        cy = (box[1] + box[3]) / 2
                        current_centroids[track_id] = (cx, cy)
                        trajectories[track_id].append((cx, cy))
                        
                        # Temporal Accident Logic (Indian Roads context)
                        # 1. Sudden Deceleration
                        if len(trajectories[track_id]) >= 10:
                            p1 = trajectories[track_id][-10]
                            p2 = trajectories[track_id][-5]
                            p3 = trajectories[track_id][-1]
                            
                            speed_before = calculate_speed(p1, p2, fps)
                            speed_after = calculate_speed(p2, p3, fps)
                            
                            if speed_before > 20 and speed_after < 5:
                                event_scores[track_id] += 30 # Deceleration penalty
                                
                            # 2. Vehicle interaction (close proximity)
                            for other_id, other_pos in current_centroids.items():
                                if other_id != track_id:
                                    dist = calculate_speed((cx, cy), other_pos, fps=1) # raw distance
                                    if dist < 50: # very close (Indian traffic is dense, so 50px)
                                        event_scores[track_id] += 10
                                        
                            # 3. Post-event stationary
                            if event_scores[track_id] > 40 and speed_after < 2:
                                event_scores[track_id] += 20
                                
                            if event_scores[track_id] > 80: # ACCIDENT CONFIRMED
                                incidents.append({
                                    "type": "ACCIDENT",
                                    "timestamp": frame_idx / fps,
                                    "confidence": min(0.99, event_scores[track_id] / 100.0),
                                    "track_id": int(track_id)
                                })
                                event_scores[track_id] = 0 # reset
                                
        # Update progress occasionally
        if frame_idx % 60 == 0:
            progress = (frame_idx / total_frames) * 100 if total_frames > 0 else 0
            async with engine.begin() as conn:
                await conn.execute(
                    AnalysisJob.__table__.update().where(AnalysisJob.job_id == job_id).values(progress_percent=progress, frames_analyzed=frame_idx)
                )

    cap.release()
    
    # Finalize
    async with engine.begin() as conn:
        await conn.execute(
            AnalysisJob.__table__.update().where(AnalysisJob.job_id == job_id).values(
                status=JobStatus.COMPLETED,
                progress_percent=100.0,
                result_data={"incidents": incidents}
            )
        )
        
    # TODO: Trigger Event Publisher (WebSocket) here
    
    # Cleanup file to save disk space
    if os.path.exists(file_path):
        os.remove(file_path)

async def _fail_job(job_id: str, engine, message: str):
    async with engine.begin() as conn:
        await conn.execute(
            AnalysisJob.__table__.update().where(AnalysisJob.job_id == job_id).values(
                status=JobStatus.FAILED,
                error_message=message
            )
        )
