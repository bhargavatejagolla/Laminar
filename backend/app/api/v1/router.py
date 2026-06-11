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
from app.api.v1.endpoints.parking import router as parking_router
from app.api.v1.endpoints.telemetry import router as telemetry_router
from app.api.v1.endpoints.traffic import router as traffic_router
from app.api.v1.endpoints.incident import router as incident_router
from app.api.v1.endpoints.kinetic import router as kinetic_router
from app.api.v1.endpoints.notifications import router as notifications_router
from app.api.v1.endpoints.greenwave import router as greenwave_router
from app.api.v1.endpoints.guardian import router as guardian_router
from app.api.v1.endpoints.amber import router as amber_router
from app.api.v1.endpoints.spatial import router as spatial_router
from app.api.v1.endpoints.sos import router as sos_router
from app.api.v1.endpoints.resonance import router as resonance_router

# ── New Advanced AI Feature Routers ──────────────────────────────────────────
from app.api.v1.endpoints.websocket import router as ws_router
from app.api.v1.endpoints.anomaly import router as anomaly_router
from app.api.v1.endpoints.sla import router as sla_router
from app.api.v1.endpoints.behavior import router as behavior_router
from app.api.v1.endpoints.synthetic import router as synthetic_router
from app.api.v1.endpoints.search import router as search_router
from app.api.v1.endpoints.actions import router as actions_router
from app.api.v1.endpoints.journeys import router as journeys_router
from app.api.v1.endpoints.edge_sync import router as edge_sync_router

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
router.include_router(zone_intelligence_router)  # Internal /intelligence prefix: covers /summary, /camera/{id}
router.include_router(parking_router, prefix="/parking", tags=["Smart Parking"])
router.include_router(telemetry_router, prefix="/telemetry", tags=["Telemetry State"])
router.include_router(traffic_router, prefix="/traffic", tags=["Smart Traffic Control"])
router.include_router(incident_router, prefix="/incident", tags=["Emergency Incident Awareness"])
router.include_router(kinetic_router, prefix="/kinetic", tags=["Zero-Shot Kinetic Intelligence"])
router.include_router(greenwave_router, prefix="/greenwave", tags=["AI Green Wave Activation"])
router.include_router(guardian_router, prefix="/guardian", tags=["Guardian AI"])
router.include_router(amber_router, prefix="/amber", tags=["Amber AI"])
router.include_router(spatial_router, prefix="/spatial", tags=["Spatial AI"])
router.include_router(sos_router, prefix="/sos", tags=["Public SOS Report"])
router.include_router(notifications_router, prefix="/notifications", tags=["Global Mesh Notifications"])
router.include_router(resonance_router, prefix="/resonance", tags=["Resonance AI"])

# ── New Advanced AI Feature Routes ───────────────────────────────────────────
router.include_router(ws_router, tags=["WebSocket"])
router.include_router(anomaly_router, tags=["Anomaly Detection"])
router.include_router(sla_router, tags=["SLA Monitoring"])
router.include_router(behavior_router, tags=["Behavior Detection"])
router.include_router(synthetic_router, tags=["Synthetic Data"])
router.include_router(search_router, prefix="/search", tags=["Semantic VQA Search"])
router.include_router(actions_router, prefix="/actions", tags=["Automated Actions"])
router.include_router(journeys_router, prefix="/journeys", tags=["Cross-Camera ReID"])
router.include_router(edge_sync_router, prefix="/edge", tags=["Edge-Federated Learning"])

from app.api.v1.endpoints.tickets import router as tickets_router
router.include_router(tickets_router, prefix="/tickets", tags=["Support Tickets"])

from app.api.v1.endpoints.liquid import router as liquid_router
router.include_router(liquid_router, prefix="/liquid", tags=["Liquid Threat"])

from app.api.v1.endpoints.emergency import router as emergency_router
router.include_router(emergency_router, prefix="/emergency", tags=["Emergency Beacon"])
