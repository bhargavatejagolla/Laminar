import os
import cv2
import numpy as np
import asyncio
from sqlalchemy.future import select
from collections import deque
import psutil

from app.core.database import db_manager, DatabaseRole
from app.models.analysis_job import AnalysisJob, JobStatus
from app.vision.vision_core import VisionCore, VisionState
from app.vision.incident_detector import incident_detector

def process_upload_job(job_id: str, file_path: str, job_timeout: int = 3600):
    """
    RQ worker entrypoint.
    Lowers process priority so live streams aren't starved by heavy video uploads.
    """
    try:
        p = psutil.Process(os.getpid())
        if hasattr(psutil, "BELOW_NORMAL_PRIORITY_CLASS"):
            p.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
        else:
            p.nice(10) # Unix fallback
    except Exception:
        pass
        
    asyncio.run(async_process_upload_job(job_id, file_path))

async def async_process_upload_job(job_id: str, file_path: str):
    """
    Async logic for analyzing the video using VisionCore 2.0 dual-path architecture.
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
    
    incidents = []
    frame_idx = 0
    bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=False)
    
    in_dense_mode = False
    dense_mode_frames_left = 0
    
    # Dedicated Vision Core instance for the worker (so it doesn't conflict with global live)
    worker_vision_core = VisionCore()
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_idx += 1
        
        # --- ADAPTIVE SAMPLING LOGIC ---
        if not in_dense_mode and frame_idx % int(fps / 3) != 0:
            continue
            
        # Yield CPU to ensure live streaming isn't starved (Resource Policy)
        await asyncio.sleep(0.01)
            
        # Low-cost motion scan
        fg_mask = bg_subtractor.apply(frame)
        motion_ratio = np.sum(fg_mask > 0) / (fg_mask.shape[0] * fg_mask.shape[1])
        
        if motion_ratio > 0.05 or in_dense_mode:
            if not in_dense_mode:
                in_dense_mode = True
                dense_mode_frames_left = int(fps * 2)
            else:
                dense_mode_frames_left -= 1
                if dense_mode_frames_left <= 0:
                    in_dense_mode = False
            
            # Use VisionCore for tracking
            vision_state = await worker_vision_core.process_frame(frame, f"job_{job_id}")
            
            # Pass to Incident Intelligence
            frame_hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            frame_incidents = incident_detector.analyze_incidents(vision_state, frame_hsv)
            
            if frame_incidents:
                # Append incidents with the correct video timestamp
                for inc in frame_incidents:
                    inc["timestamp_seconds"] = round(frame_idx / fps, 2)
                    incidents.append(inc)
                                
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
