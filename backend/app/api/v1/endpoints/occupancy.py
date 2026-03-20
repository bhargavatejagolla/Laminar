"""
Laminar - Occupancy Endpoint
----------------------------
Production-safe occupancy analytics endpoint.
Uses correct project patterns with error handling.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import db_manager
from app.services.occupancy_service import OccupancyService
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/venues", tags=["Occupancy"])
service = OccupancyService()


@router.get("/{venue_id}/occupancy")
async def get_venue_occupancy(venue_id: UUID):
    """
    Returns real-time occupancy analytics for a venue.
    
    Analytics include:
    - current_count: Latest total people count across all cameras
    - avg_last_5_min: Average count over last 5 minutes
    - peak_today: Maximum count today
    - status: empty, normal, spike, drop, fluctuating, or no_cameras
    
    Uses timezone-aware timestamps for accurate calculations.
    """
    try:
        async with db_manager.session() as session:
            result = await service.get_venue_occupancy(
                session=session,
                venue_id=venue_id,
            )
            return result

    except ValueError as e:
        logger.warning(
            "Invalid request for venue occupancy",
            extra={"venue_id": str(venue_id), "error": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(
            "Failed to calculate occupancy",
            extra={"venue_id": str(venue_id), "error": str(e)},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to calculate occupancy",
        )
