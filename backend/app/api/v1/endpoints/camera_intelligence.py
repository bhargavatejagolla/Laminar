from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.database import get_db
from app.services.camera_intelligence_service import CameraIntelligenceService

router = APIRouter(prefix="/camera-intelligence", tags=["Camera Intelligence"])

service = CameraIntelligenceService()


@router.get("/metrics")
async def all_camera_metrics(
    session: AsyncSession = Depends(get_db)
):
    metrics = await service.get_all_camera_metrics(session)
    return {
        "cameras": metrics
    }


@router.get("/metrics/{venue_id}")
async def camera_metrics(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db)
):

    metrics = await service.get_camera_metrics(session, venue_id)

    return {
        "venue_id": str(venue_id),
        "cameras": metrics
    }


@router.get("/health/{venue_id}")
async def camera_health(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db)
):

    health = await service.get_camera_health(session, venue_id)

    return {
        "venue_id": str(venue_id),
        "camera_health": health
    }
