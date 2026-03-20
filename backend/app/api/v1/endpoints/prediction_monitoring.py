from fastapi import APIRouter
from app.services.prediction_service import PredictionService

router = APIRouter()


@router.get("/prediction/health")
async def prediction_health():

    service = PredictionService()
    monitor = service._monitor

    return monitor.get_health_summary()
