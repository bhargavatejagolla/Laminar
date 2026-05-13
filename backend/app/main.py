"""
Laminar - Main Application Entrypoint (Reload Triggered)
---------------------------------------
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import asyncio
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["HF_HUB_DISABLE_DOWNLOAD_WARNINGS"] = "1"
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"  # Globally disable MSMF to prevent hardware hangs
os.environ["TRANSFORMERS_VERBOSITY"] = "error"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["AUTOGRAPH_VERBOSITY"] = "0"

from app.vision.manager import vision_manager
from app.vision.orchestrator import ORCHESTRATOR as vision_orchestrator
from app.core.config import settings
from app.core.logging import setup_logging, RequestIdMiddleware, get_logger
from app.core.database import db_manager
from app.api.v1.router import router as api_v1_router
from app.scheduler.scheduler import laminar_scheduler  # Fixed import

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

#    Multi-Tenant Middleware (opt-in via MULTI_TENANT_ENABLED=true in .env)          
from app.core.tenant_middleware import TenantMiddleware
app.add_middleware(TenantMiddleware)

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

# Semantic Snapshots
os.makedirs("storage/semantic_snapshots", exist_ok=True)
app.mount("/api/v1/storage/semantic_snapshots",
          StaticFiles(directory="storage/semantic_snapshots"),
          name="semantic_snapshots")

# Generic Storage Mount (for Journey Snapshots, etc.)
os.makedirs("storage", exist_ok=True)
app.mount("/storage", StaticFiles(directory="storage"), name="storage")

# Dwell Monitoring Snapshots
os.makedirs("storage/dwell_snapshots", exist_ok=True)
app.mount("/api/v1/storage/dwell",
          StaticFiles(directory="storage/dwell_snapshots"),
          name="dwell_snapshots")


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
            logger.info("Vision systems will start shortly after warmup...")
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

    # Initialize AI Services (Warm-up)
    async def warm_up_ai():
        try:
            from app.vision.vector_store import vector_store
            # [v4] Load both index AND model on startup (background) so searches are instant.
            await vector_store.initialize(load_model=True)
            logger.info("AI_WARMUP: Vector Store and Embedding Model initialized.")
        except Exception as e:
            logger.error(f"Failed to warm up AI services: {e}")

    # Run warm_up_ai in background to avoid blocking the main startup loop
    asyncio.create_task(warm_up_ai())

    # NOW start vision systems since PyTorch is safely initialized
    if settings.ENABLE_VISION:
        try:
            await vision_manager.start()
            await vision_orchestrator.start()
            logger.info("Vision system and Orchestrator started")
        except Exception as e:
            logger.error(f"Failed to start vision system: {e}")

    # Advanced AI Feature Storage Directories
    os.makedirs("storage/retrain_candidates", exist_ok=True)  # AutoML retraining
    os.makedirs("storage/geofence_breach_logs", exist_ok=True)  # Geofence events
    logger.info("Advanced AI feature storage directories initialized")

    logger.info(
        "Laminar Backend is READY and listening for events",
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
        await vision_manager.stop()
        await vision_orchestrator.stop()
        logger.info("Vision system and Orchestrator stopped")
    except Exception as e:
        logger.error(f"Error stopping vision system: {e}")

    # Stop vector store thread pool
    try:
        from app.vision.vector_store import vector_store
        await vector_store.shutdown()
        logger.info("Vector Store stopped")
    except Exception as e:
        logger.error(f"Error stopping vector store: {e}")

    # Close database connections
    try:
        await db_manager.close()
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

#    Clean Exit Handler                                                         
# Prevents ugly stack traces when the server reloads or stops via Ctrl+C
if __name__ == "__main__":
    import uvicorn
    import sys
    try:
        uvicorn.run(
            "app.main:app", 
            host=settings.HOST, 
            port=settings.PORT, 
            reload=settings.DEBUG,
            log_level="info"
        )
    except (KeyboardInterrupt, asyncio.CancelledError):
        # Silence traceback on Ctrl+C or reload
        sys.exit(0)
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"GLOBAL EXCEPTION: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Laminar Internal Error: " + str(exc)},
    )
