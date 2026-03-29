"""
Laminar — Cross-Camera Journey / ReID Endpoint
Returns globally tracked cross-camera paths enriched with real camera names.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import db_manager
from app.services.journey_manager_service import journey_manager
from app.models.camera import Camera

router = APIRouter()


async def _get_camera_name_map(session: AsyncSession) -> dict:
    """Fetches all camera id→name mappings in one query."""
    result = await session.execute(select(Camera.id, Camera.name))
    return {str(row.id): row.name for row in result}


@router.get("/", summary="Get active cross-camera journeys")
async def get_journeys():
    """
    Returns all in-progress journeys enriched with real camera names.
    Each journey contains a path of (camera_id, camera_name, timestamp) entries.
    """
    try:
        async with db_manager.session() as session:
            cam_names = await _get_camera_name_map(session)
    except Exception:
        cam_names = {}

    raw_journeys = journey_manager.get_active_journeys_for_api()

    # Enrich paths with camera names
    for journey in raw_journeys:
        for step in journey.get("path", []):
            cam_id = step.get("camera_id", "")
            step["camera_name"] = cam_names.get(cam_id, cam_id[:8] if len(cam_id) > 8 else cam_id)

    return {"journeys": raw_journeys}
