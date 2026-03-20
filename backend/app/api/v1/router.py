"""
Laminar - API v1 Router
-----------------------

Central router aggregation for version 1 of the API.

IMPORTANT:
- This file ONLY aggregates routers.
- __init__.py must remain empty to avoid circular imports.
- Each module router is imported directly.
"""

from fastapi import APIRouter
from app.core.config import settings

# Import routers directly from their modules (NO package-level imports)
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.venues import router as venues_router
from app.api.v1.endpoints.cameras import router as cameras_router
from app.api.v1.endpoints.alerts import router as alerts_router
from app.api.v1.vision import router as vision_router
from app.api.v1.scheduler import router as scheduler_router
from app.api.v1.endpoints import occupancy
from app.api.v1.endpoints.auth import  router as auth_router
from app.api.v1.endpoints.system import router as system_router
from app.api.v1.endpoints import prediction_monitoring
from app.api.v1.endpoints.events import router as events_router
from app.api.v1.endpoints.prediction import  router as prediction_router
from app.api.v1.endpoints.prediction_graph import router as prediction_graph_router
from app.api.v1.endpoints.camera_intelligence import router as camera_intelligence_router
from app.api.v1.endpoints.reports import router as reports_router
from app.api.v1.endpoints.assistant import router as assistant_router
from app.api.v1.endpoints.users import router as users_router
from app.api.v1.endpoints.dwell_monitor import router as dwell_monitor_router
from app.api.v1.endpoints.intelligence import router as intelligence_router
from app.api.v1.endpoints.zone_intelligence import router as zone_intelligence_router
# Create main v1 router with prefix
router = APIRouter(prefix=settings.API_V1_PREFIX)


# Register all sub-routers
router.include_router(health_router)
router.include_router(venues_router)
router.include_router(cameras_router, prefix="/cameras", tags=["Cameras"])
router.include_router(vision_router, prefix="/vision", tags=["Vision"])
router.include_router(scheduler_router)
router.include_router(alerts_router)
router.include_router(occupancy.router,tags=["Occupancy"])
router.include_router(system_router)
router.include_router(auth_router)
router.include_router(
    prediction_monitoring.router,
    tags=["Prediction Monitoring"]
)
router.include_router(events_router)
router.include_router(prediction_router)
router.include_router(prediction_graph_router)
router.include_router(camera_intelligence_router)
router.include_router(reports_router)
router.include_router(assistant_router, prefix="/assistant", tags=["AI Assistant"])
router.include_router(users_router)
router.include_router(dwell_monitor_router, prefix="/dwell", tags=["Dwell Monitor"])
router.include_router(intelligence_router, prefix="/intelligence", tags=["AI Intelligence Engine"])
router.include_router(zone_intelligence_router)
