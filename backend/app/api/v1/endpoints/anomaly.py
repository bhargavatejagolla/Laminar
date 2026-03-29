"""
Laminar - Anomaly Detection API Endpoints
------------------------------------------
"""
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import db_manager
from app.core.dependencies import get_current_active_user
from app.services.anomaly_service import AnomalyService

router = APIRouter(prefix="/anomaly", tags=["Anomaly Detection"])
_service = AnomalyService()


@router.get("/{venue_id}")
async def get_anomaly_summary(
    venue_id: UUID,
    minutes: int = 60,
    user=Depends(get_current_active_user),
):
    """Get anomaly detection summary for a venue."""
    async with db_manager.session() as session:
        return await _service.get_venue_anomaly_summary(session, venue_id, minutes=minutes)


@router.post("/{venue_id}/retrain")
async def force_retrain_anomaly_model(
    venue_id: UUID,
    user=Depends(get_current_active_user),
):
    """Force retraining of the anomaly detection model for a venue."""
    async with db_manager.session() as session:
        success = await _service.force_retrain(session, venue_id)
        return {"success": success, "venue_id": str(venue_id), "message": "Model retrained" if success else "Insufficient data — need 50+ samples"}
