"""
Laminar - SLA Monitoring API Endpoints
---------------------------------------
"""
from uuid import UUID
from fastapi import APIRouter, Depends, Query

from app.core.database import db_manager
from app.core.dependencies import get_current_active_user
from app.services.sla_service import SLAService

router = APIRouter(prefix="/sla", tags=["SLA Monitoring"])
_service = SLAService()


@router.get("/{venue_id}")
async def get_venue_sla(
    venue_id: UUID,
    days: int = Query(default=7, ge=1, le=90),
    sla_minutes: int = Query(default=5, ge=1, le=60),
    user=Depends(get_current_active_user),
):
    """Get SLA metrics (MTTD, MTTA, compliance) for a venue."""
    async with db_manager.session() as session:
        return await _service.get_venue_sla(
            session, venue_id, days=days, sla_minutes=sla_minutes
        )


@router.get("/platform/summary")
async def get_platform_sla(
    days: int = Query(default=7, ge=1, le=90),
    user=Depends(get_current_active_user),
):
    """Get overall platform SLA summary across all venues."""
    async with db_manager.session() as session:
        return await _service.get_platform_sla(session, days=days)
