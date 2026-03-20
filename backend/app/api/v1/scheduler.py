"""
Laminar - Scheduler API
-----------------------

PHASE A - Observability endpoint for scheduler.
Provides health monitoring and job status for the APScheduler.
"""

from typing import Dict, Any

from fastapi import APIRouter, HTTPException, status

from app.scheduler.scheduler import laminar_scheduler
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["Scheduler"])


@router.get("/health")
async def scheduler_health() -> Dict[str, Any]:
    """
    Get scheduler health status.
    
    Returns:
    - status: running/stopped
    - total_jobs: count of registered jobs
    - uptime_seconds: seconds since scheduler started
    - jobs: list of jobs with their details
    - timezone: scheduler timezone
    
    Each job includes:
    - id: unique job identifier
    - name: human-readable job name
    - next_run_time: next scheduled execution
    - trigger: job trigger configuration
    - last_run: last execution time
    - status: pending, running, completed, failed
    """
    try:
        return laminar_scheduler.get_health()
    except Exception as e:
        logger.error(f"Error retrieving scheduler health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving scheduler health"
        )


@router.get("/jobs")
async def list_jobs() -> Dict[str, Any]:
    """
    List all scheduled jobs with their current status.
    
    Returns simplified job list without full health payload.
    """
    try:
        health = laminar_scheduler.get_health()
        return {
            "total": health["total_jobs"],
            "jobs": health["jobs"],
            "scheduler_status": health["status"],
        }
    except Exception as e:
        logger.error(f"Error listing scheduler jobs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving scheduler jobs"
        )


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str) -> Dict[str, Any]:
    """
    Get status of a specific job by ID.
    
    Returns detailed information about a single job.
    """
    try:
        health = laminar_scheduler.get_health()
        for job in health["jobs"]:
            if job["id"] == job_id:
                return job

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving job {job_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving job {job_id}"
        )
