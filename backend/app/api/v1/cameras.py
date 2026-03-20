"""
Laminar - Camera API Endpoints
-------------------------------

CRUD operations for cameras with VisionManager integration.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime,timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.logging import get_logger
from app.models.camera import Camera
from app.schemas.camera import (
    CameraCreate,
    CameraUpdate,
    CameraResponse,
    CameraHealthResponse,
    CameraListResponse,
    CameraAIConfig,
    CameraBulkDelete,
    HeartbeatRequest,
    CameraStatsResponse,
)
from app.vision.manager import vision_manager
from backend.app.api.v1.endpoints import health

logger = get_logger(__name__)
router = APIRouter(tags=["Cameras"])


# ==========================================================
# Database dependency
# ==========================================================

async def get_db() -> AsyncSession:
    """Get database session."""
    async with async_session_factory() as session:
        yield session


# ==========================================================
# Create Camera
# ==========================================================

@router.post("/", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
async def create_camera(
    camera_data: CameraCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new camera.
    
    This will automatically be picked up by VisionManager
    during the next sync cycle (every 10 seconds).
    
    For laptop webcam, use:
    {
        "venue_id": "00000000-0000-0000-0000-000000000001",
        "name": "LaptopCam",
        "stream_url": "0",
        "stream_type": "device",
        "fps": 5,
        "is_active": true,
        "monitoring_enabled": true,
        "detection_enabled": true,
        "tracking_enabled": true
    }
    """
    logger.info(f"Creating new camera: {camera_data.name}")

    # Create camera instance
    db_camera = Camera(
        venue_id=camera_data.venue_id,
        name=camera_data.name,
        stream_url=camera_data.stream_url,
        stream_type=camera_data.stream_type,
        username=camera_data.username,
        password=camera_data.password,
        location_description=camera_data.location_description,
        resolution_width=camera_data.resolution_width,
        resolution_height=camera_data.resolution_height,
        fps=camera_data.fps,
        is_active=camera_data.is_active,
        monitoring_enabled=camera_data.monitoring_enabled,
        detection_enabled=camera_data.detection_enabled,
        tracking_enabled=camera_data.tracking_enabled,
        hardware_metadata=camera_data.hardware_metadata,
        is_online=False,  # Initially offline until heartbeat
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    # Validate before saving
    errors = db_camera.validate()
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"errors": errors}
        )

    # Save to database
    db.add(db_camera)
    await db.commit()
    await db.refresh(db_camera)

    logger.info(f"Camera created successfully: {db_camera.id}")

    return db_camera


# ==========================================================
# List Cameras
# ==========================================================

@router.get("/", response_model=List[CameraListResponse])
async def list_cameras(
    venue_id: Optional[UUID] = None,
    is_active: Optional[bool] = None,
    is_online: Optional[bool] = None,
    stream_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    """
    List all cameras with optional filters.
    
    - Filter by venue, active status, online status, stream type
    - Pagination with skip/limit
    """
    # Build query
    query = select(Camera)

    if venue_id:
        query = query.where(Camera.venue_id == venue_id)
    if is_active is not None:
        query = query.where(Camera.is_active == is_active)
    if is_online is not None:
        query = query.where(Camera.is_online == is_online)
    if stream_type:
        query = query.where(Camera.stream_type == stream_type)

    # Add pagination
    query = query.offset(skip).limit(limit).order_by(Camera.created_at.desc())

    # Execute
    result = await db.execute(query)
    cameras = result.scalars().all()

    return cameras


# ==========================================================
# Get Single Camera
# ==========================================================

@router.get("/{camera_id}", response_model=CameraResponse)
async def get_camera(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Get camera by ID.
    
    Returns detailed camera information including stream config.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    return camera


# ==========================================================
# Update Camera
# ==========================================================

@router.put("/{camera_id}", response_model=CameraResponse)
async def update_camera(
    camera_id: UUID,
    camera_data: CameraUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update camera configuration.
    
    Only provided fields will be updated.
    """
    # Get existing camera
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    # Update fields
    update_data = camera_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(camera, field):
            setattr(camera, field, value)

    # Update timestamp
    camera.updated_at = datetime.now(timezone.utc)

    # Validate
    errors = camera.validate()
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"errors": errors}
        )

    # Save
    await db.commit()
    await db.refresh(camera)

    logger.info(f"Camera updated: {camera_id}")

    return camera


# ==========================================================
# Delete Camera
# ==========================================================

@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a camera permanently.
    
    This will also stop any running stream workers.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    await db.delete(camera)
    await db.commit()

    logger.info(f"Camera deleted: {camera_id}")


# ==========================================================
# Camera Health
# ==========================================================

@router.get("/{camera_id}/health", response_model=CameraHealthResponse)
async def get_camera_health(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Get camera health status.
    
    Checks:
    - Database status (active, online)
    - Vision worker status
    - Last heartbeat/frame timestamps
    
    Returns health assessment with message.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    # Check VisionManager worker status
    worker = await vision_manager.get_worker(camera_id)
    worker_status = await worker.get_status() if worker else None

    # Determine health status
    if not camera.is_active:
        health_status = "inactive"
        message = "Camera is inactive (disabled)"
    elif not camera.is_online:
        health_status = "offline"
        message = "Camera is offline (no heartbeat)"
    elif worker and worker_status and worker_status.get("healthy"):
        health_status = "healthy"
        fps_current = worker_status.get(
            "performance", {}).get("effective_fps", 0)
        message = f"Camera is online and processing at {fps_current:.1f} FPS"
    elif worker and worker_status:
        health_status = "degraded"
        error = worker_status.get("last_error", "unknown error")
        message = f"Camera worker is unhealthy: {error}"
    else:
        health_status = "degraded"
        message = "Camera is online but no worker found"

    return {
        "id": camera.id,
        "name": camera.name,
        "is_online": camera.is_online,
        "is_active": camera.is_active,
        "monitoring_enabled": camera.monitoring_enabled,
        "last_heartbeat_at": camera.last_heartbeat_at,
        "last_frame_at": camera.last_frame_at,
        "fps_configured": camera.fps,
        "health_status": health_status,
        "message": message,
    }


# ==========================================================
# Camera Actions
# ==========================================================

@router.post("/{camera_id}/restart")
async def restart_camera(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually restart a camera stream.
    
    Useful when camera is stuck or not processing frames.
    VisionManager will attempt to restart the worker.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    if not camera.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Camera {camera_id} is inactive. Enable it first."
        )

    success = await vision_manager.restart_camera(camera_id)

    if success:
        return {
            "success": True,
            "message": f"Camera {camera_id} restart initiated"
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not restart camera {camera_id}"
        )


@router.post("/{camera_id}/enable")
async def enable_camera(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Enable a camera.
    
    Sets is_active=True. VisionManager will pick it up in next sync.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    if camera.is_active:
        return {"success": True, "message": f"Camera {camera_id} already enabled"}

    camera.is_active = True
    camera.monitoring_enabled = True
    camera.detection_enabled = True
    camera.updated_at = datetime.now(timezone.utc)

    await db.commit()

    logger.info(f"Camera enabled: {camera_id}")

    return {"success": True, "message": f"Camera {camera_id} enabled"}


@router.post("/{camera_id}/disable")
async def disable_camera(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Disable a camera.
    
    Sets is_active=False. VisionManager will stop the worker.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    if not camera.is_active:
        return {"success": True, "message": f"Camera {camera_id} already disabled"}

    camera.is_active = False
    camera.updated_at = datetime.now(timezone.utc)

    await db.commit()

    logger.info(f"Camera disabled: {camera_id}")

    return {"success": True, "message": f"Camera {camera_id} disabled"}
