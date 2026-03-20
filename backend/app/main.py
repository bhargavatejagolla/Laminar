"""
Laminar - Main Application Entry Point
---------------------------------------
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from app.vision.manager import vision_manager
from app.core.config import settings
from app.core.logging import setup_logging, RequestIdMiddleware, get_logger
from app.core.database import db_manager
from app.api.v1.router import router as api_v1_router
from app.scheduler.scheduler import laminar_scheduler  # Fixed import
from app.api.v1.router import router as api_v1_router

# ----------------------------------------------------------
# Initialize Logging First
# ----------------------------------------------------------

setup_logging()
logger = get_logger(__name__)

# ----------------------------------------------------------
# Create FastAPI App
# ----------------------------------------------------------

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url=settings.DOCS_URL,
    redoc_url=settings.REDOC_URL,
    openapi_url=settings.OPENAPI_URL,
)

# ----------------------------------------------------------
# Middleware
# ----------------------------------------------------------

app.add_middleware(RequestIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------
# Include API Routers
# ----------------------------------------------------------

app.include_router(api_v1_router)

# Mount local storage folder for video clips
os.makedirs("storage/clips", exist_ok=True)
app.mount("/api/v1/clips", StaticFiles(directory="storage/clips"), name="clips")

# Alert Evidence: snapshots + 10-second clips
os.makedirs("storage/alert_snapshots", exist_ok=True)
app.mount("/api/v1/storage/snapshots",
          StaticFiles(directory="storage/alert_snapshots"),
          name="alert_snapshots")

# Profile Pictures
os.makedirs("storage/profile_pictures", exist_ok=True)
app.mount("/profile_pictures",
          StaticFiles(directory="storage/profile_pictures"),
          name="profile_pictures")

_downloads_clips = os.path.abspath(os.path.join("..", "downloads", "evidence_clips"))
os.makedirs(_downloads_clips, exist_ok=True)
app.mount("/api/v1/storage/clips",
          StaticFiles(directory=_downloads_clips),
          name="evidence_clips")

# ----------------------------------------------------------
# Startup / Shutdown Events
# ----------------------------------------------------------


@app.on_event("startup")
async def startup_event():
    """Initialize database, scheduler, and vision system on startup."""
    # Initialize database
    await db_manager.initialize()
    logger.info("Database initialized")

    # Configure and start scheduler
    try:
        laminar_scheduler.configure()
        laminar_scheduler.start()
        logger.info("Scheduler configured and started")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

    # Start vision system if enabled
    if settings.ENABLE_VISION:
        try:
            await vision_manager.start() ############################################################################################################################################
            logger.info("Vision system started")
        except Exception as e:
            logger.error(f"Failed to start vision system: {e}")

    # Start SMS Gateway Probe
    if getattr(settings, "SMS_GATEWAY_ENABLED", False):
        try:
            from app.services.sms_alert_service import SmsAlertService
            sms_health = await SmsAlertService(
                gateway_url=getattr(settings, "SMS_GATEWAY_URL", ""),
                timeout=getattr(settings, "SMS_GATEWAY_TIMEOUT", 8)
            ).health_check()
            if sms_health["reachable"]:
                logger.info(f"SMS Gateway reachable at {sms_health['gateway_url']}")
            else:
                logger.warning(f"SMS Gateway unreachable: {sms_health.get('error')}. Will fallback to SIMULATION.")
        except Exception as e:
            logger.warning(f"SMS Gateway probe failed: {e}")

    logger.info(
        "Application started",
        extra={
            "environment": settings.ENVIRONMENT,
            "debug": settings.DEBUG,
        },
    )


@app.on_event("shutdown")
async def shutdown_event():
    """Gracefully shutdown all systems."""
    # Shutdown scheduler
    try:
        laminar_scheduler.shutdown()
        logger.info("Scheduler shut down")
    except Exception as e:
        logger.error(f"Error shutting down scheduler: {e}")

    # Stop vision system
    try:
        await vision_manager.stop()###################################################################################################################################################
        logger.info("Vision system stopped")
    except Exception as e:
        logger.error(f"Error stopping vision system: {e}")

    # Close database connections
    try:
        #await db_manager.close()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Error closing database: {e}")

    logger.info("Application shutdown")


# ----------------------------------------------------------
# Root Endpoint
# ----------------------------------------------------------

@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "docs": settings.DOCS_URL,
        "redoc": settings.REDOC_URL,
        "health": f"{settings.API_V1_PREFIX}/health",
        "scheduler": f"{settings.API_V1_PREFIX}/scheduler/status",
        "vision": f"{settings.API_V1_PREFIX}/vision/health" if settings.ENABLE_VISION else "disabled",
    }
