"""
Laminar - System Health Endpoint
---------------------------------

Production-grade health check with:
- Database connectivity validation
- Environment reporting
- Feature flags
- Uptime tracking
- Proper HTTP status codes
- Zero external dependencies beyond existing modules
"""

import time
import platform
from datetime import datetime, timezone
from typing import Dict, Any

from sqlalchemy import text
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import db_manager
from app.core.logging import get_logger
from app.scheduler.scheduler import laminar_scheduler

router = APIRouter()
logger = get_logger(__name__)

# Track application startup time
START_TIME = time.time()


def get_uptime() -> Dict[str, Any]:
    """Calculate application uptime in human-readable format."""
    uptime_seconds = time.time() - START_TIME

    days = int(uptime_seconds // 86400)
    hours = int((uptime_seconds % 86400) // 3600)
    minutes = int((uptime_seconds % 3600) // 60)
    seconds = round(uptime_seconds % 60, 2)

    return {
        "seconds": round(uptime_seconds, 2),
        "human_readable": f"{days}d {hours}h {minutes}m {seconds}s",
        "days": days,
        "hours": hours,
        "minutes": minutes,
    }


def build_system_info() -> Dict[str, Any]:
    """Collect safe system-level information (no sensitive data)."""
    return {
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
        "python_version": platform.python_version(),
    }


@router.get(
    "/health",
    summary="System Health Check",
    description="Returns application and infrastructure health status.",
    tags=["System"],
)
async def health_check():
    """
    Comprehensive health check endpoint.
    
    Returns:
        200 OK if system healthy
        503 Service Unavailable if database is down
    """

    logger.debug("Health check requested")

    overall_status = "healthy"
    http_status = status.HTTP_200_OK
    db_health = {}

    # Check database health
    try:
        # Test database connection with simple query
        async with db_manager.session() as session:
            # Execute simple query to verify connection
            await session.execute(text("SELECT 1"))

        db_health = {
            "healthy": True,
            "message": "Connected",
        }
    except Exception as e:
        logger.error(
            "Database health check failed",
            extra={"error": str(e)},
        )
        db_health = {
            "healthy": False,
            "message": f"Connection failed: {str(e)}",
        }
        overall_status = "unhealthy"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE

    # Get scheduler health for inclusion in main health check
    scheduler_health_status = "unknown"
    try:
        if hasattr(laminar_scheduler, 'get_health'):
            scheduler_data = laminar_scheduler.get_health()
            scheduler_health_status = scheduler_data.get("status", "unknown")
        elif hasattr(laminar_scheduler, 'get_status'):
            scheduler_data = laminar_scheduler.get_status()
            scheduler_health_status = "running" if scheduler_data.get(
                "scheduler", {}).get("running") else "stopped"
        else:
            scheduler_health_status = "running" if laminar_scheduler.scheduler.running else "stopped"
    except Exception as e:
        logger.warning(f"Could not get scheduler health: {e}")
        scheduler_health_status = "error"

    # Get vision health for inclusion in main health check
    vision_health_status = "unknown"
    try:
        from app.vision.manager import vision_manager
        vision_data = vision_manager.get_status()
        vision_health_status = "running" if vision_data.get(
            "running") else "stopped"
    except Exception as e:
        logger.warning(f"Could not get vision health: {e}")
        vision_health_status = "error"

    response_payload = {
        "status": overall_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime": get_uptime(),
        "system": build_system_info(),
        "database": db_health,
        "scheduler": {
            "status": scheduler_health_status,
        },
        "vision": {
            "status": vision_health_status,
        },
        "features": {
            "detection": getattr(settings, "ENABLE_DETECTION", True),
            "prediction": getattr(settings, "ENABLE_PREDICTION", True),
            "risk_engine": getattr(settings, "ENABLE_RISK_ENGINE", True),
            "llm_assistant": getattr(settings, "ENABLE_LLM_ASSISTANT", False),
        },
    }

    logger.info(
        "Health check completed",
        extra={
            "status": overall_status,
            "uptime_seconds": get_uptime()["seconds"],
        },
    )

    return JSONResponse(
        status_code=http_status,
        content=response_payload,
    )


@router.get("/scheduler", tags=["System"])
async def scheduler_health():
    """
    Get scheduler health status.
    
    Returns:
    - Running status
    - Job statuses
    - Last run times
    - Overall health
    """
    try:
        # Try using enhanced get_health first (from our updated scheduler.py)
        if hasattr(laminar_scheduler, 'get_health'):
            health_data = laminar_scheduler.get_health()

            # Count failed jobs
            failed_jobs = [j for j in health_data.get(
                "jobs", []) if j.get("status") == "failed"]
            is_healthy = len(failed_jobs) == 0 and health_data.get(
                "status") == "running"

            return {
                "healthy": is_healthy,
                "status": "healthy" if is_healthy else "degraded",
                "message": f"Scheduler is {health_data.get('status')} with {health_data.get('total_jobs', 0)} jobs",
                "details": {
                    "running": health_data.get("status") == "running",
                    "uptime_seconds": health_data.get("uptime_seconds", 0),
                    "job_count": health_data.get("total_jobs", 0),
                    "failed_jobs": len(failed_jobs),
                },
                "jobs": health_data.get("jobs", []),
            }

        # Fall back to legacy get_status
        elif hasattr(laminar_scheduler, 'get_status'):
            status_data = laminar_scheduler.get_status()

            # Check if critical jobs are healthy
            critical_jobs = [
                j for j in status_data.get("jobs", [])
                if j.get("metadata", {}).get("critical", False)
            ]

            failed_critical = [
                j for j in critical_jobs
                if j.get("status") == "failed"
            ]

            degraded_jobs = [
                j for j in status_data.get("jobs", [])
                if j.get("status") == "failed"
            ]

            is_healthy = len(failed_critical) == 0

            return {
                "healthy": is_healthy,
                "status": "healthy" if is_healthy else "degraded",
                "message": (
                    "Scheduler healthy" if is_healthy
                    else f"Scheduler degraded: {len(degraded_jobs)} jobs failing"
                ),
                "details": {
                    "running": status_data.get("scheduler", {}).get("running", False),
                    "uptime_seconds": status_data.get("scheduler", {}).get("uptime_seconds", 0),
                    "job_count": status_data.get("scheduler", {}).get("job_count", 0),
                    "critical_jobs": len(critical_jobs),
                    "failed_critical": len(failed_critical),
                    "degraded_jobs": len(degraded_jobs),
                },
                "jobs": status_data.get("jobs", []),
            }
        else:
            # Basic status if neither method exists
            job_count = len(laminar_scheduler.scheduler.get_jobs()) if hasattr(
                laminar_scheduler, 'scheduler') else 0
            is_running = laminar_scheduler.scheduler.running if hasattr(
                laminar_scheduler, 'scheduler') else False

            return {
                "healthy": is_running,
                "status": "running" if is_running else "stopped",
                "message": f"Scheduler is {'running' if is_running else 'stopped'} with {job_count} jobs",
                "details": {
                    "running": is_running,
                    "job_count": job_count,
                },
                "jobs": [],
            }

    except Exception as e:
        logger.error(f"Scheduler health check failed: {e}")
        return {
            "healthy": False,
            "status": "error",
            "message": f"Scheduler health check failed: {str(e)}",
            "error": str(e),
            "details": {},
            "jobs": [],
        }


@router.get("/vision", tags=["System"])
async def vision_health():
    """Get vision system health status."""
    try:
        from app.vision.manager import vision_manager

        # Try to get health data
        if hasattr(vision_manager, 'get_health'):
            return vision_manager.get_health()
        elif hasattr(vision_manager, 'get_status'):
            status_data = vision_manager.get_status()

            # Format response consistently
            return {
                "healthy": status_data.get("running", False),
                "status": "running" if status_data.get("running") else "stopped",
                "message": f"Vision system is {'running' if status_data.get('running') else 'stopped'}",
                "details": {
                    "running": status_data.get("running", False),
                    "demo_mode": status_data.get("demo_mode", False),
                    "cameras": status_data.get("cameras", {}),
                    "frames": status_data.get("frames", {}),
                },
            }
        else:
            return {
                "healthy": False,
                "status": "unknown",
                "message": "Vision manager does not have status method",
                "details": {},
            }
    except ImportError as e:
        logger.error(f"Vision module not available: {e}")
        return {
            "healthy": False,
            "status": "unavailable",
            "message": "Vision system not installed",
            "details": {},
        }
    except Exception as e:
        logger.error(f"Vision health check failed: {e}")
        return {
            "healthy": False,
            "status": "error",
            "message": f"Vision health check failed: {str(e)}",
            "error": str(e),
            "details": {},
        }


@router.get("/sms", tags=["System"])
async def sms_health():
    """
    Probe the configured SMS gateway and return its connectivity status.

    Response:
    - mode: "live" (real SMS enabled) or "simulation" (not enabled / unreachable)
    - reachable: whether the gateway responded
    - gateway_url: the configured URL
    - error: human-readable error if not reachable
    """
    from app.services.sms_alert_service import SmsAlertService
    svc = SmsAlertService(
        gateway_url=getattr(settings, "SMS_GATEWAY_URL", ""),
        timeout=getattr(settings, "SMS_GATEWAY_TIMEOUT", 8),
    )
    result = await svc.health_check()
    return {
        "healthy": result["reachable"],
        "mode": result["mode"],
        "gateway_url": result["gateway_url"],
        "reachable": result["reachable"],
        "error": result.get("error"),
        "hint": (
            "Set SMS_GATEWAY_ENABLED=true and SMS_GATEWAY_URL=http://<phone-ip>:8080/v1/sms/send in .env to enable real SMS."
            if result["mode"] == "simulation"
            else "Gateway is live and reachable."
        ),
    }


@router.get("/database", tags=["System"])
async def database_health():
    """
    Get database health status specifically.
    
    Returns detailed database connection information.
    """
    try:
        # Test database connection
        async with db_manager.session() as session:
            await session.execute(text("SELECT 1"))

        # Get pool stats if available
        pool_stats = {}
        if hasattr(db_manager, 'health_check'):
            health = await db_manager.health_check()
            pool_stats = health.get("metrics", {})

        return {
            "healthy": True,
            "status": "connected",
            "message": "Database connection successful",
            "details": {
                "pool": pool_stats,
                "url": str(settings.DATABASE_URL).split("@")[-1] if "@" in str(settings.DATABASE_URL) else "hidden",
            }
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "healthy": False,
            "status": "disconnected",
            "message": f"Database connection failed: {str(e)}",
            "error": str(e),
        }
