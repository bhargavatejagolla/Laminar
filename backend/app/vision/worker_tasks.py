import os
import cv2
import numpy as np
import asyncio
from sqlalchemy.future import select
import psutil

from app.core.database import async_session_factory
from app.models.analysis_job import AnalysisJob, JobStatus
from app.vision.vision_core import VisionCore
from app.vision.incident_detector import incident_detector

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
    Async logic for analyzing the video using VisionCore.
    Runs cleanly within the server's main event loop via BackgroundTasks.
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

    incidents = []
    frame_idx = 0
    bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=False)

    in_dense_mode = False
    dense_mode_frames_left = 0

    worker_vision_core = VisionCore()

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1

            # Adaptive sampling: sample every (fps / 3) frames in non-dense mode
            skip_rate = max(1, int(fps / 3))
            if not in_dense_mode and frame_idx % skip_rate != 0:
                continue

            # Yield CPU briefly to keep server responsive
            await asyncio.sleep(0.005)

            # Motion detection
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

                vision_state = await worker_vision_core.process_frame(frame, f"job_{job_id}")
                frame_hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
                frame_incidents = incident_detector.analyze_incidents(vision_state, frame_hsv)

                if frame_incidents:
                    for inc in frame_incidents:
                        inc["timestamp_seconds"] = round(frame_idx / fps, 2)
                        incidents.append(inc)

            # Update progress periodically
            if frame_idx % 60 == 0 and total_frames > 0:
                progress = min(99.0, round((frame_idx / total_frames) * 100, 1))
                async with async_session_factory() as session:
                    result = await session.execute(select(AnalysisJob).where(AnalysisJob.job_id == job_id))
                    job = result.scalar_one_or_none()
                    if job:
                        job.progress_percent = progress
                        job.frames_analyzed = frame_idx
                        await session.commit()

        cap.release()

        # Mark COMPLETED
        async with async_session_factory() as session:
            result = await session.execute(select(AnalysisJob).where(AnalysisJob.job_id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.status = JobStatus.COMPLETED
                job.progress_percent = 100.0
                job.frames_analyzed = frame_idx
                job.result_data = {"incidents": incidents, "total_frames": frame_idx}
                await session.commit()

    except Exception as exc:
        cap.release()
        await _fail_job(job_id, f"Analysis error: {str(exc)}")
    finally:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

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
