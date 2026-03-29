"""
Laminar - Synthetic Data API Endpoints
----------------------------------------
Admin-only endpoints for generating synthetic crowd data.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import db_manager
from app.core.dependencies import get_current_active_user
from app.models.user import UserRole
from app.services.synthetic_data_service import SyntheticDataService

router = APIRouter(prefix="/synthetic", tags=["Synthetic Data"])
_service = SyntheticDataService()


@router.post("/generate")
async def generate_synthetic_data(
    venue_id: UUID,
    hours: int = 24,
    capacity: int = 1000,
    seed: int = None,
    user=Depends(get_current_active_user),
):
    """
    🔒 Admin only — Generate synthetic crowd data for a venue.
    Used for testing and client demonstrations.

    WARNING: This writes to the database. Use only on staging/demo environments.
    """
    if user.role not in (UserRole.ADMIN,):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Synthetic data generation requires admin role",
        )
    async with db_manager.session() as session:
        return await _service.generate_for_venue(
            session, venue_id, hours=hours, capacity=capacity, seed=seed
        )


@router.get("/preview")
async def preview_synthetic_data(
    hours: int = 24,
    capacity: int = 1000,
    interval_minutes: int = 60,
    user=Depends(get_current_active_user),
):
    """Preview synthetic data pattern without writing to the database."""
    return {
        "preview": await _service.generate_preview(
            hours=hours, capacity=capacity, interval_minutes=interval_minutes
        ),
        "note": "Preview only — not written to DB. Use POST /generate to persist.",
    }
