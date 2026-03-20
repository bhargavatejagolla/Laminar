"""
Laminar - Scheduler Package
---------------------------

Exports scheduler instance and provides API router.
"""

from fastapi import APIRouter

from app.scheduler.scheduler import laminar_scheduler
from app.core.logging import get_logger

logger = get_logger(__name__)

# Create router for scheduler endpoints
router = APIRouter(prefix="/scheduler", tags=["Scheduler"])


@router.get("/status")
async def scheduler_status():
    """Get scheduler status."""
    try:
        if hasattr(laminar_scheduler, 'get_health'):
            return laminar_scheduler.get_health()
        elif hasattr(laminar_scheduler, 'get_status'):
            return laminar_scheduler.get_status()
        else:
            return {
                "running": laminar_scheduler.scheduler.running if hasattr(laminar_scheduler, 'scheduler') else False,
                "job_count": len(laminar_scheduler.scheduler.get_jobs()) if hasattr(laminar_scheduler, 'scheduler') else 0,
            }
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        return {"error": str(e)}


# DO NOT import health here - this causes circular import
# Remove this line: from app.api.v1.endpoints import health

__all__ = ["laminar_scheduler", "router"]
