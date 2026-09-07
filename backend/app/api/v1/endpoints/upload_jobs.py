import os
import uuid
import shutil
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from app.core.database import async_session_factory
from app.models.analysis_job import AnalysisJob, JobStatus
from pydantic import BaseModel

router = APIRouter()

UPLOAD_DIR = os.path.join(os.getcwd(), "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class JobResponse(BaseModel):
    job_id: str
    status: str
    message: str

@router.post("/analyze-video", response_model=JobResponse)
async def analyze_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload a video file for async analysis.
    This replaces the blocking /incident/analyze-video endpoint.
    """
    if not file.filename.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
        raise HTTPException(status_code=400, detail="Unsupported file format")

    job_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    safe_filename = f"{job_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Save to disk safely
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    # Create Job Record in Database
    async with async_session_factory() as session:
        job = AnalysisJob(
            job_id=job_id,
            status=JobStatus.PENDING,
            file_path=file_path,
            original_filename=file.filename,
            media_type="video"
        )
        session.add(job)
        await session.commit()

    # Enqueue job using FastAPI BackgroundTasks to avoid Redis dependency on local envs
    try:
        from app.vision.worker_tasks import async_process_upload_job
        background_tasks.add_task(async_process_upload_job, job_id=job_id, file_path=file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to queue job: {str(e)}")

    return JobResponse(
        job_id=job_id,
        status="PENDING",
        message="Video uploaded successfully and queued for analysis."
    )

@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Poll fallback for Job Status if WebSocket disconnected."""
    async with async_session_factory() as session:
        from sqlalchemy.future import select
        result = await session.execute(select(AnalysisJob).where(AnalysisJob.job_id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
            
        return {
            "job_id": job.job_id,
            "status": job.status,
            "progress_percent": job.progress_percent,
            "error_message": job.error_message,
            "result_data": job.result_data
        }
