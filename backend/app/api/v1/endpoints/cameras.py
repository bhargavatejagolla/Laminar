"""
Laminar - Camera API Endpoints
-------------------------------

CRUD operations for cameras with VisionManager integration.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, Response
from fastapi.responses import FileResponse
from sqlalchemy import select, func
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
from app.core.dependencies import require_role, get_current_active_user
from app.models.user import UserRole
from app.core.database import db_manager
from app.services.camera_service import CameraService
from app.models.evidence_clip import EvidenceClip

logger = get_logger(__name__)
router = APIRouter(tags=["Cameras"])
camera_service = CameraService()

def verify_camera_access(camera: Camera, user):
    if not user.is_super_admin:
        if str(camera.venue_id) not in [str(v.id) for v in user.venues]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized for this camera's Location Matrix"
            )


# ==========================================================
# Database dependency
# ==========================================================

async def get_db() -> AsyncSession:
    """Get database session."""
    async with db_manager.session() as session:
        yield session


# ==========================================================
# Create Camera
# ==========================================================

@router.post("", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
async def create_camera(
    camera_data: CameraCreate,
    db: AsyncSession = Depends(get_db),
    # ✅ RBAC: Admin only
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
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
    
    Requires SUPER_ADMIN or ADMIN role.
    """
    if not user.is_super_admin and str(camera_data.venue_id) not in [str(v.id) for v in user.venues]:
        raise HTTPException(status_code=403, detail="Unauthorized for targeted Location Matrix")

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
        health_status="unknown",
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

    # Persist to database first — this generates the UUID id via server default
    db.add(db_camera)
    await db.commit()
    await db.refresh(db_camera)

    logger.info(f"Camera created successfully: {db_camera.id}")

    # Notify VisionManager for instant startup (no need to wait for 10s sync)
    # Must be called AFTER commit so the camera row exists in the DB
    await vision_manager.notify_camera_created(db_camera)

    return db_camera


# ==========================================================
# List Cameras
# ==========================================================

@router.get("", response_model=List[CameraListResponse])
async def list_cameras(
    venue_id: Optional[UUID] = None,
    is_active: Optional[bool] = None,
    is_online: Optional[bool] = None,
    stream_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    List all cameras with optional filters.
    
    - Filter by venue, active status, online status, stream type
    - Pagination with skip/limit
    - Any authenticated user can access
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

    if not user.is_super_admin:
        allowed_venue_ids = {v.id for v in user.venues}
        if venue_id and venue_id not in allowed_venue_ids:
            return []  # Filter explicitly
        query = query.where(Camera.venue_id.in_(list(allowed_venue_ids)))

    # Add pagination
    query = query.offset(skip).limit(limit).order_by(Camera.created_at.desc())

    # Execute
    result = await db.execute(query)
    cameras = result.scalars().all()

    return cameras


# ==========================================================
# Camera Health — ALL  (MUST be before /{camera_id} routes!)
# ==========================================================
@router.get("/health/all")
async def get_all_cameras_health(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),
):
    """
    Get health summary for ALL cameras.
    Used by the Camera Health dashboard page.
    IMPORTANT: This route must be registered before /{camera_id} so that
    FastAPI does not try to parse 'health' as a UUID.
    """
    from app.services.camera_health_service import CameraHealthService
    svc = CameraHealthService()
    return await svc.get_all_camera_health(db)


# ==========================================================
# Camera Count Summary  (MUST be before /{camera_id} routes!)
# ==========================================================

@router.get("/summary/count")
async def camera_count_summary(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),
):
    """
    Returns total cameras and active monitoring cameras.
    Used by dashboard navbar.
    """

    # Total cameras
    total_stmt = select(func.count()).select_from(Camera)
    total_result = await db.execute(total_stmt)
    total_cameras = total_result.scalar()

    # Monitoring cameras
    active_stmt = select(func.count()).where(
        Camera.is_active == True,
        Camera.monitoring_enabled == True,
        Camera.deleted_at.is_(None)
    )

    active_result = await db.execute(active_stmt)
    active_cameras = active_result.scalar()

    return {
        "total_cameras": total_cameras,
        "active_cameras": active_cameras
    }


# ==========================================================
# Get Single Camera
# ==========================================================

@router.get("/{camera_id}", response_model=CameraResponse)
async def get_camera(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    Get camera by ID.
    
    Returns detailed camera information including stream config.
    Any authenticated user can access.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )
    verify_camera_access(camera, user)

    return camera


# ==========================================================
# Update Camera
# ==========================================================

@router.put("/{camera_id}", response_model=CameraResponse)
async def update_camera(
    camera_id: UUID,
    camera_data: CameraUpdate,
    db: AsyncSession = Depends(get_db),
    # ✅ RBAC: Admin only
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Update camera configuration.
    
    Only provided fields will be updated.
    Requires ADMIN or MANAGER role.
    """
    try:
        # Auth check first
        camera = await db.get(Camera, camera_id)
        if not camera:
            raise HTTPException(status_code=404, detail="Camera not found")
        verify_camera_access(camera, user)

        # Use camera_service for consistent validation and logic
        camera = await camera_service.update_camera(
            db,
            camera_id,
            updated_by=user.id if hasattr(user, 'id') else None,
            **camera_data.dict(exclude_unset=True)
        )
        
        logger.info(f"Camera updated via service: {camera_id}")
        return camera

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error updating camera {camera_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during camera update"
        )


# ==========================================================
# Delete Camera
# ==========================================================

@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),  # ✅ RBAC: Admin only
):
    """
    Delete a camera permanently.
    
    This will also stop any running stream workers.
    Requires ADMIN role.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )
    verify_camera_access(camera, user)

    # Stop worker immediately before DB deletion
    await vision_manager.notify_camera_deleted(camera_id)

    await db.delete(camera)
    await db.commit()

    logger.info(f"Camera deleted: {camera_id}")


# (health/all endpoint moved above /{camera_id} to avoid route conflict)


# ==========================================================
# Camera Health
# ==========================================================

@router.get("/{camera_id}/health", response_model=CameraHealthResponse)
async def get_camera_health(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    Get camera health status.
    
    Checks:
    - Database status (active, online)
    - Vision worker status
    - Last heartbeat/frame timestamps
    
    Returns health assessment with message.
    Any authenticated user can access.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )
    verify_camera_access(camera, user)

    # Check VisionManager worker status (Crowd) or ORCHESTRATOR (Specialized)
    from app.vision.orchestrator import ORCHESTRATOR
    worker = await vision_manager.get_worker(camera_id)
    if not worker:
        worker = ORCHESTRATOR._workers.get(camera_id)
        
    worker_status = await worker.get_status() if (worker and hasattr(worker, 'get_status')) else None

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
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Manually restart a camera stream.
    
    Useful when camera is stuck or not processing frames.
    VisionManager will attempt to restart the worker.
    Requires ADMIN or MANAGER role.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )
    verify_camera_access(camera, user)

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
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Enable a camera.
    
    Sets is_active=True. VisionManager will pick it up in next sync.
    Requires ADMIN or MANAGER role.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )
    verify_camera_access(camera, user)

    if camera.is_active:
        return {"success": True, "message": f"Camera {camera_id} already enabled"}

    camera.is_active = True
    camera.monitoring_enabled = True
    camera.updated_at = datetime.now(timezone.utc)

    await db.commit()

    # Notify VisionManager for instant startup
    await vision_manager.notify_camera_created(camera)

    logger.info(f"Camera enabled: {camera_id}")

    return {"success": True, "message": f"Camera {camera_id} enabled"}


@router.post("/{camera_id}/disable")
async def disable_camera(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Disable a camera.
    
    Sets is_active=False. VisionManager will stop the worker.
    Requires ADMIN or MANAGER role.
    """
    camera = await db.get(Camera, camera_id)

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )
    verify_camera_access(camera, user)

    if not camera.is_active:
        return {"success": True, "message": f"Camera {camera_id} already disabled"}

    camera.is_active = False
    camera.monitoring_enabled = False
    camera.updated_at = datetime.now(timezone.utc)

    await db.commit()

    # Notify VisionManager for instant stop
    await vision_manager.notify_camera_deleted(camera_id)

    logger.info(f"Camera disabled: {camera_id}")

    return {"success": True, "message": f"Camera {camera_id} disabled"}

# ==========================================================
# Evidence Clips
# ==========================================================

@router.post("/{camera_id}/record")
async def record_clip(
    camera_id: UUID,
    duration: int = Query(10, ge=1, le=60, description="Duration in seconds (max 60)"),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Trigger a manual 10-second video clip recording.
    """
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    verify_camera_access(camera, user)
        
    worker = await vision_manager.get_worker(camera_id)
    if not worker or not worker.is_running():
        raise HTTPException(status_code=400, detail="Camera stream is not active")
        
    # Get clip service from worker to avoid Circular imports
    clip_service = worker.clip_service
    clip = await clip_service.create_clip_record(db, camera_id)
    
    started = await worker.start_recording(clip.id, clip.file_path, duration)
    if not started:
        raise HTTPException(status_code=429, detail="A recording is already in progress for this camera")
        
    return {
        "success": True, 
        "message": f"Started {duration}s recording",
        "clip_id": clip.id
    }

@router.get("/{camera_id}/clips")
async def list_camera_clips(
    camera_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),
):
    """
    Get all recorded clips for a specific camera.
    """
    query = select(EvidenceClip).where(EvidenceClip.camera_id == camera_id).order_by(EvidenceClip.created_at.desc())
    result = await db.execute(query)
    clips = result.scalars().all()
    
    return [
        {
            "id": c.id,
            "filename": c.file_path.replace(chr(92), '/').split('/')[-1],
            "duration": c.duration_seconds,
            "status": c.status,
            "created_at": c.created_at,
            "url": f"/api/v1/clips/{c.file_path.replace(chr(92), '/').split('/')[-1]}", # Stream URL
            "download_url": f"/api/v1/cameras/{camera_id}/clips/{c.file_path.replace(chr(92), '/').split('/')[-1]}/download"
        }
        for c in clips
    ]

@router.get("/{camera_id}/clips/{filename}/download")
async def download_clip(
    camera_id: UUID,
    filename: str,
    request: Request,
    token: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Download a recorded clip as an attachment.
    Accepts JWT via Authorization header OR ?token= query param (needed for browser <a download>).
    """
    from app.core.security import decode_token
    import os
    from app.services.evidence_clip_service import CLIPS_DIR

    # Resolve token: query param first, then Authorization header
    bearer = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        bearer = auth_header.split(" ", 1)[1]
    jwt_token = token or bearer
    if not jwt_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = decode_token(jwt_token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    file_path = os.path.join(CLIPS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Clip file not found")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="video/mp4",
        content_disposition_type="attachment"
    )


@router.get("/{camera_id}/density-map")
async def get_density_map(
    camera_id: UUID,
    user=Depends(get_current_active_user),
):
    """
    Get the latest generated crowd density heatmap image.
    Returns a JPEG image.
    """
    worker = await vision_manager.get_worker(camera_id)
    if not worker or not worker.is_running():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera stream is not active or warming up"
        )

    jpeg_bytes = worker.get_latest_heatmap_jpeg()
    if not jpeg_bytes:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Heatmap not yet generated. Await next detection cycle."
        )

    return Response(content=jpeg_bytes, media_type="image/jpeg", headers={
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    })