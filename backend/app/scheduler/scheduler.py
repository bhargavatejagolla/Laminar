"""
Laminar - Scheduler Core (Enhanced)
------------------------------------
Manages APScheduler lifecycle with health monitoring.
"""

from datetime import datetime
from typing import Dict, Any, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.job import Job

from app.core.logging import get_logger
from app.scheduler.jobs import (
    minute_pipeline_job,
    escalation_job,
    auto_resolve_job,
    hourly_aggregation_job,
    system_health_job,
    refresh_vector_index_job,
    refresh_vector_index_job,
    recurrent_health_notification_job,
    predictive_surge_job,
    automl_retrain_report_job,
)
from app.scheduler.registry import JobRegistry

logger = get_logger(__name__)


class LaminarScheduler:
    """
    Central scheduler for all automated tasks.

    Features:
    - Job registry with metadata
    - Health status tracking
    - Last run time monitoring
    - Graceful shutdown
    - Error isolation
    """

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._configured = False
        self._start_time: Optional[datetime] = None
        self._job_last_run: Dict[str, datetime] = {}
        self._job_status: Dict[str, str] = {}  # running, failed, completed

    def configure(self) -> None:
        """Register all scheduled jobs with metadata."""
        if self._configured:
            return

        # Register jobs with APScheduler
        self._add_job_with_tracking(
            "minute_pipeline",
            minute_pipeline_job,
            IntervalTrigger(minutes=1), # Restored to 1-minute to prevent contention
        )

        self._add_job_with_tracking(
            "escalation_check",
            escalation_job,
            IntervalTrigger(minutes=1), # Faster escalation response
        )

        self._add_job_with_tracking(
            "auto_resolve",
            auto_resolve_job,
            IntervalTrigger(minutes=2), # Safety-net fallback; live-feed handles instant resolution
        )

        self._add_job_with_tracking(
            "hourly_aggregation",
            hourly_aggregation_job,
            CronTrigger(minute=0),
        )
        self._add_job_with_tracking(
            "system_health",
            system_health_job,
            IntervalTrigger(minutes=2),
        )
        
        self._add_job_with_tracking(
            "refresh_vector_index",
            refresh_vector_index_job,
            IntervalTrigger(minutes=30),
        )

        self._add_job_with_tracking(
            "recurrent_health_notification",
            recurrent_health_notification_job,
            IntervalTrigger(minutes=5),
        )

        self._add_job_with_tracking(
            "predictive_surge",
            predictive_surge_job,
            IntervalTrigger(minutes=15), # Increased from 5 to prevent Groq 429 rate limit
        )

        self._add_job_with_tracking(
            "automl_retrain_report",
            automl_retrain_report_job,
            CronTrigger(hour=6, minute=0),  # Daily at 6 AM UTC
        )

        self._configured = True
        logger.info("Scheduler configured with %d jobs",
                    len(self.scheduler.get_jobs()))

    def _add_job_with_tracking(self, job_id: str, func, trigger) -> Job:
        """Add job with automatic tracking wrapper."""

        async def tracked_func():
            """Wrapper to track job execution."""
            start_time = datetime.utcnow()
            job_metadata = JobRegistry.get(job_id)

            try:
                logger.debug(
                    f"Starting job: {job_id}",
                    extra_fields={
                        "job_id": job_id,
                        "job_name": job_metadata.get("name"),
                    }
                )

                await func()

                self._job_last_run[job_id] = datetime.utcnow()
                self._job_status[job_id] = "completed"

                duration = (datetime.utcnow() - start_time).total_seconds()
                logger.debug(
                    f"Job completed: {job_id}",
                    extra_fields={
                        "job_id": job_id,
                        "duration_seconds": round(duration, 2),
                    }
                )

            except Exception as e:
                self._job_status[job_id] = "failed"
                logger.error(
                    f"Job failed: {job_id}",
                    extra_fields={
                        "job_id": job_id,
                        "error": str(e),
                        "job_metadata": job_metadata,
                    },
                    exc_info=True,
                )

        return self.scheduler.add_job(
            tracked_func,
            trigger,
            id=job_id,
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=60,  # Allow 60s delay
        )

    def start(self) -> None:
        """Start the scheduler."""
        if not self.scheduler.running:
            self._start_time = datetime.utcnow()
            logger.info("Starting Laminar Scheduler")
            self.scheduler.start()

    def shutdown(self) -> None:
        """Gracefully shutdown the scheduler."""
        if self.scheduler.running:
            logger.info("Shutting down Laminar Scheduler")
            self.scheduler.shutdown(wait=False)

    # ==========================================================
    # ENHANCED: Health check method for observability
    # ==========================================================

    def get_health(self) -> Dict[str, Any]:
        """
        Get health status of the scheduler.
        SAFE PHASE A VERSION - Uses only confirmed APScheduler properties.
        
        Returns:
            Dict with:
            - status: running/stopped
            - total_jobs: count of registered jobs
            - jobs: list of job details
            - timezone: scheduler timezone
            - uptime: seconds since start
        """
        jobs = self.scheduler.get_jobs()
        jobs_info = []

        for job in jobs:
            # Get job metadata safely
            job_metadata = JobRegistry.get(
                job.id) if hasattr(JobRegistry, 'get') else {}

            jobs_info.append({
                "id": job.id,
                "name": job_metadata.get("name", job.id) if job_metadata else job.id,
                "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger),
                "last_run": self._job_last_run.get(job.id).isoformat() if self._job_last_run.get(job.id) else None,
                "status": self._job_status.get(job.id, "pending"),
            })

        return {
            "status": "running" if self.scheduler.running else "stopped",
            "total_jobs": len(jobs_info),
            "uptime_seconds": (
                (datetime.utcnow() - self._start_time).total_seconds()
                if self._start_time else 0
            ),
            "jobs": jobs_info,
            "timezone": str(self.scheduler.timezone),
        }

    # Keep existing get_status method for backward compatibility
    def get_status(self) -> Dict[str, Any]:
        """Get scheduler status for health checks (legacy)."""
        jobs = self.scheduler.get_jobs()

        return {
            "scheduler": {
                "running": self.scheduler.running,
                "started_at": self._start_time.isoformat() if self._start_time else None,
                "uptime_seconds": (
                    (datetime.utcnow() - self._start_time).total_seconds()
                    if self._start_time else 0
                ),
                "job_count": len(jobs),
            },
            "jobs": [
                {
                    "id": job.id,
                    "name": JobRegistry.get(job.id).get("name", job.id),
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                    "last_run": self._job_last_run.get(job.id).isoformat() if self._job_last_run.get(job.id) else None,
                    "status": self._job_status.get(job.id, "pending"),
                    "metadata": JobRegistry.get(job.id),
                }
                for job in jobs
            ],
        }


# Singleton instance
laminar_scheduler = LaminarScheduler()
