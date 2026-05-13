# app/scheduler/registry.py
"""
Laminar - Job Registry
-----------------------
Central registry for all scheduled jobs with metadata.
"""

from typing import Dict, Any
from datetime import timedelta


class JobRegistry:
    """Registry of all scheduled jobs with metadata."""

    _jobs: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def register(cls, job_id: str, **kwargs):
        """Register a job with metadata."""
        cls._jobs[job_id] = kwargs

    @classmethod
    def get_all(cls) -> Dict[str, Dict[str, Any]]:
        """Get all registered jobs."""
        return cls._jobs.copy()

    @classmethod
    def get(cls, job_id: str) -> Dict[str, Any]:
        """Get job metadata by ID."""
        return cls._jobs.get(job_id, {})


# Job definitions with metadata
JOBS = [
    {
        "id": "minute_pipeline",
        "name": "Minute Pipeline",
        "description": "Aggregate minute metrics, evaluate risk, create alerts",
        "trigger": "interval",
        "interval_seconds": 60,
        "enabled": True,
        "critical": True,
    },
    {
        "id": "escalation_check",
        "name": "Escalation Check",
        "description": "Check and escalate unresolved alerts",
        "trigger": "interval",
        "interval_seconds": 300,  # 5 minutes
        "enabled": True,
        "critical": True,
    },
    {
        "id": "auto_resolve",
        "name": "Auto-Resolve",
        "description": "Auto-resolve low/medium risk old alerts",
        "trigger": "interval",
        "interval_seconds": 600,  # 10 minutes
        "enabled": True,
        "critical": False,
    },
    {
        "id": "hourly_aggregation",
        "name": "Hourly Aggregation",
        "description": "Aggregate hourly metrics for all venues",
        "trigger": "cron",
        "cron_minute": 0,
        "enabled": True,
        "critical": False,
    },
    {
        "id": "refresh_vector_index",
        "name": "Refresh Vector Index",
        "description": "Aggregate text and update FAISS embeddings for local RAG chatbot",
        "trigger": "interval",
        "interval_seconds": 1800,  # 30 minutes
        "enabled": True,
        "critical": False,
    },
    {
        "id": "recurrent_health_notification",
        "name": "Recurrent Health Notification",
        "description": "Re-send notifications for unresolved camera health issues every 5 minutes",
        "trigger": "interval",
        "interval_seconds": 300,  # 5 minutes
        "enabled": True,
        "critical": True,
    },
    {
        "id": "predictive_surge",
        "name": "Predictive Surge Scan",
        "description": "AI-driven crowd anomaly and surge forecasting across all venues",
        "trigger": "interval",
        "interval_seconds": 300,
        "enabled": True,
        "critical": True,
    },
]

# Register all jobs
for job in JOBS:
    JobRegistry.register(job["id"], **job)
