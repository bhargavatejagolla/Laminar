"""
Laminar - Venue API Endpoints
------------------------------

Production-ready REST endpoints for Venue domain.

Architecture:
API Layer -> VenueService -> Repository -> Database

Responsibilities:
- Request validation
- Response serialization
- HTTP error mapping
- Dependency injection
- No business logic here
"""

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.prediction_service import PredictionService
from app.services.risk_engine_service import RiskEngineService
from app.core.database import db_manager
from app.services.venue_service import VenueService
from app.services.camera_service import CameraService
from app.core.logging import get_logger
from app.schemas.venue import (
    VenueCreate,
    VenueUpdate,
    VenueBulkDeleteRequest,
    CapacityStatusRequest,
    VenueResponse,
    VenueStatsResponse,
    CapacityStatusResponse,
)
from app.schemas.camera import CameraCreate, CameraResponse

from app.core.dependencies import require_role, get_current_active_user, verify_venue_access
from app.models.user import UserRole
from app.models.crowd_metric import CrowdMetric
from app.services.geocoding_service import GeocodingService
from app.services.queue_estimator_service import queue_estimator
from app.services.analytics_service import analytics_service
from app.services.resource_optimizer import resource_optimizer

router = APIRouter(prefix="/venues", tags=["Venues"])
venue_service = VenueService()
camera_service = CameraService()
logger = get_logger(__name__)


# ==========================================================
# Database Dependency
# ==========================================================

async def get_db() -> AsyncSession:
    async with db_manager.session() as session:
        yield session


# ==========================================================
# Authentication Placeholders (Replace with real auth)
# ==========================================================

async def get_current_user_id() -> Optional[UUID]:
    """Get current user ID from auth context."""
    # TODO: Replace with actual JWT extraction
    return None


async def get_current_tenant_id() -> Optional[UUID]:
    """Get current tenant ID from auth context."""
    # TODO: Replace with actual tenant extraction from JWT
    return None


# ==========================================================
# Create Venue
# ==========================================================

@router.post(
    "",
    response_model=VenueResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_venue(
    request: VenueCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    # ✅ RBAC: Super Admin only for complete location creation
    user=Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """
    Create a new venue.
    
    - Name must be unique within tenant
    - Capacity must be greater than zero
    - Warning threshold must be less than critical threshold
    - Requires ADMIN or MANAGER role
    - If latitude/longitude not provided, they will be auto-filled from city/country
    """

    # ==========================================================
    # 🔥 STEP 2 — Auto-fill coordinates from city/country
    # ==========================================================
    geo_service = GeocodingService()

    # If coordinates are missing, try to get them from city/country
    if (not request.latitude or not request.longitude) and request.city and request.country:
        try:
            lat, lon = await geo_service.get_coordinates(
                city=request.city,
                country=request.country,
            )

            # Update request with geocoded coordinates
            request.latitude = lat
            request.longitude = lon

            logger.info(
                "Auto-filled venue coordinates from location",
                extra={
                    "city": request.city,
                    "country": request.country,
                    "latitude": lat,
                    "longitude": lon,
                }
            )
        except Exception as e:
            logger.warning(
                "Failed to geocode venue location",
                extra={
                    "city": request.city,
                    "country": request.country,
                    "error": str(e),
                }
            )
            # Continue without coordinates - they can be added later

    try:
        venue = await venue_service.create_venue(
            db,
            name=request.name,
            capacity=request.capacity,
            location=request.location,
            city=request.city,
            country=request.country,
            latitude=request.latitude,
            warning_threshold=request.warning_threshold,
            critical_threshold=request.critical_threshold,
            tenant_id=tenant_id,
            created_by=user_id,
        )
        return venue

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ==========================================================
# List Venues (Static route - must come before dynamic {venue_id})
# ==========================================================

@router.get(
    "",
    response_model=List[VenueResponse],
)
async def list_venues(
    is_active: Optional[bool] = None,
    city: Optional[str] = None,
    country: Optional[str] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    List venues with optional filters.
    
    - Pagination with skip/limit (max 500)
    - Filter by is_active, city, country
    - Automatically filtered by tenant
    - Any authenticated user can access
    """
    venues = await venue_service.list_venues(
        db,
        tenant_id=tenant_id,
        is_active=is_active,
        city=city,
        country=country,
        skip=skip,
        limit=limit,
    )
    if not user.is_super_admin:
        allowed_ids = {str(v.id) for v in user.venues}
        venues = [v for v in venues if str(v.id) in allowed_ids]
    return venues


# ==========================================================
# Search Venues (Static route - must come before dynamic {venue_id})
# ==========================================================

@router.get("/search", response_model=List[VenueResponse])
async def search_venues(
    query: Optional[str] = None,
    city: Optional[str] = None,
    country: Optional[str] = None,
    is_active: Optional[bool] = None,
    min_capacity: Optional[int] = None,
    max_capacity: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    Advanced venue search with multiple filters.
    
    - Text search on name, description, city
    - Capacity range filtering
    - Filter by location and activity status
    - Any authenticated user can access
    """
    venues = await venue_service.search_venues(
        db,
        tenant_id=tenant_id,
        query=query,
        city=city,
        country=country,
        is_active=is_active,
        min_capacity=min_capacity,
        max_capacity=max_capacity,
        skip=skip,
        limit=limit,
    )
    return venues


# ==========================================================
# Bulk Delete Venues (Static route - must come before dynamic {venue_id})
# ==========================================================

@router.delete("/bulk", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_venues(
    request: VenueBulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    user=Depends(require_role(UserRole.SUPER_ADMIN)),  # ✅ RBAC: Super Admin only
):
    """
    Soft delete multiple venues.
    
    - Continues on error (skips invalid IDs)
    - Returns count of deleted venues in response
    - Requires SUPER ADMIN role
    """
    count = await venue_service.bulk_delete_venues(
        db,
        request.venue_ids,
        tenant_id=tenant_id,
        deleted_by=user_id,
    )

    return {
        "message": f"Successfully deleted {count} venues",
        "deleted_count": count,
    }


# ==========================================================
# Get Single Venue (Dynamic route - must come AFTER all static routes)
# ==========================================================

@router.get(
    "/{venue_id}",
    response_model=VenueResponse,
)
async def get_venue(
    venue_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    _=Depends(verify_venue_access)
):
    """
    Get venue by ID.
    
    Returns 404 if not found or not in tenant.
    Any authenticated user can access.
    """
    try:
        venue = await venue_service.get_venue(
            db,
            venue_id,
            tenant_id=tenant_id,
        )
        return venue

    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venue not found",
        )


# ==========================================================
# Update Venue (Dynamic route)
# ==========================================================

@router.put(
    "/{venue_id}",
    response_model=VenueResponse,
)
async def update_venue(
    venue_id: UUID,
    request: VenueUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    # ✅ RBAC: Admin only bounded by Location Matrix
    _=Depends(verify_venue_access),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Update venue details.
    
    - Supports optimistic locking with expected_version
    - Name uniqueness enforced within tenant
    - Thresholds validated
    - Requires ADMIN or MANAGER role
    """
    try:
        venue = await venue_service.update_venue(
            db,
            venue_id,
            name=request.name,
            capacity=request.capacity,
            location=request.location,
            city=request.city,
            country=request.country,
            latitude=request.latitude,
            warning_threshold=request.warning_threshold,
            critical_threshold=request.critical_threshold,
            is_active=request.is_active,
            monitoring_enabled=request.monitoring_enabled,
            tenant_id=tenant_id,
            updated_by=user_id,
            expected_version=request.expected_version,
        )
        return venue

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ==========================================================
# Activate Venue (Dynamic route)
# ==========================================================

@router.patch("/{venue_id}/activate", response_model=VenueResponse)
async def activate_venue(
    venue_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    # ✅ RBAC: Admin only bounded by Location config
    _=Depends(verify_venue_access),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Activate a venue.
    
    - Requires ADMIN or MANAGER role
    """
    try:
        venue = await venue_service.activate_venue(
            db,
            venue_id,
            tenant_id=tenant_id,
            updated_by=user_id,
        )
        return venue
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ==========================================================
# Deactivate Venue (Dynamic route)
# ==========================================================

@router.patch("/{venue_id}/deactivate", response_model=VenueResponse)
async def deactivate_venue(
    venue_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    # ✅ RBAC: Admin only
    _=Depends(verify_venue_access),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Deactivate a venue.
    
    - Requires ADMIN or MANAGER role
    """
    try:
        venue = await venue_service.deactivate_venue(
            db,
            venue_id,
            tenant_id=tenant_id,
            updated_by=user_id,
        )
        return venue
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ==========================================================
# Enable Monitoring (Dynamic route)
# ==========================================================

@router.patch("/{venue_id}/monitoring/enable", response_model=VenueResponse)
async def enable_monitoring(
    venue_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    # ✅ RBAC: Admin only
    _=Depends(verify_venue_access),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Enable monitoring for a venue.
    
    - Requires ADMIN or MANAGER role
    """
    try:
        venue = await venue_service.enable_monitoring(
            db,
            venue_id,
            tenant_id=tenant_id,
            updated_by=user_id,
        )
        return venue
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ==========================================================
# Disable Monitoring (Dynamic route)
# ==========================================================

@router.patch("/{venue_id}/monitoring/disable", response_model=VenueResponse)
async def disable_monitoring(
    venue_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    # ✅ RBAC: Admin only
    _=Depends(verify_venue_access),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Disable monitoring for a venue.
    
    - Requires ADMIN or MANAGER role
    """
    try:
        venue = await venue_service.disable_monitoring(
            db,
            venue_id,
            tenant_id=tenant_id,
            updated_by=user_id,
        )
        return venue
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ==========================================================
# Delete Venue (Soft Delete) (Dynamic route)
# ==========================================================

@router.delete(
    "/{venue_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_venue(
    venue_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    user=Depends(require_role(UserRole.SUPER_ADMIN)),  # ✅ RBAC: Super Admin only
):
    """
    Soft delete a venue.
    
    - Also soft deletes all associated cameras
    - Historical data remains for analytics
    - Requires ADMIN role
    """
    try:
        await venue_service.delete_venue(
            db,
            venue_id,
            tenant_id=tenant_id,
            deleted_by=user_id,
        )
        return None

    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venue not found",
        )


# ==========================================================
# Venue Stats (Dynamic route)
# ==========================================================

@router.get(
    "/{venue_id}/stats",
    response_model=VenueStatsResponse,
)
async def get_venue_stats(
    venue_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    _=Depends(verify_venue_access),
):
    """
    Get venue statistics for dashboard.
    
    Includes:
    - Basic venue info
    - Camera counts
    - Current risk score
    - Activity status
    - Any authenticated user can access
    """
    try:
        stats = await venue_service.get_venue_stats(
            db,
            venue_id,
            tenant_id=tenant_id,
        )
        return stats

    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venue not found",
        )


# ==========================================================
# Capacity Status (Dynamic route)
# ==========================================================

@router.post(
    "/{venue_id}/capacity-status",
    response_model=CapacityStatusResponse,
)
async def get_capacity_status(
    venue_id: UUID,
    request: CapacityStatusRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    _=Depends(verify_venue_access),
):
    """
    Get capacity status for current crowd count.
    
    Returns:
    - Level: normal, warning, critical, exceeded, unknown
    - Percentage of capacity
    - Human-readable message
    - Any authenticated user can access
    """
    try:
        status_result = await venue_service.get_capacity_status(
            db,
            venue_id,
            request.current_count,
            tenant_id=tenant_id,
        )
        return status_result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# ==========================================================
# Add Camera to Venue (Nested Route)
# ==========================================================

@router.post(
    "/{venue_id}/cameras",
    response_model=CameraResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_camera_to_venue(
    venue_id: UUID,
    request: CameraCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: Optional[UUID] = Depends(get_current_tenant_id),
    user_id: Optional[UUID] = Depends(get_current_user_id),
    _=Depends(verify_venue_access),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Add a new camera to this specific venue.
    This provides a strict RESTful nested onboarding route.
    
    - Overrides request.venue_id with the path parameter
    - Camera name must be unique within this venue
    - Requires ADMIN or MANAGER role
    """
    # Force the path variable to win to ensure REST compliance
    request.venue_id = venue_id
    
    try:
        camera = await camera_service.create_camera(
            db,
            venue_id=venue_id,
            name=request.name,
            stream_url=request.stream_url,
            stream_type=request.stream_type,
            username=request.username,
            password=request.password,
            location_description=request.location_description,
            resolution_width=request.resolution_width,
            resolution_height=request.resolution_height,
            fps=request.fps,
            is_active=request.is_active,
            tenant_id=tenant_id,
            created_by=user_id,
        )
        return camera
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )




# ==========================================================
# Venue Forecast (Dynamic route)
# ==========================================================

@router.get("/{venue_id}/forecast")
async def get_venue_forecast(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    Get predictive risk forecast for a venue.

    Returns forecasted risk level, escalation probability,
    and confidence score.
    
    Any authenticated user can access.
    """

    prediction_service = PredictionService()
    risk_engine = RiskEngineService()

    # Get latest metric first
    stmt = (
        select(CrowdMetric)
        .where(CrowdMetric.venue_id == venue_id)
        .where(CrowdMetric.bucket_type == "minute")
        .order_by(CrowdMetric.bucket_start.desc())
        .limit(1)
    )

    result = await session.execute(stmt)
    latest_metric = result.scalar_one_or_none()

    if not latest_metric:
        return {
            "venue_id": str(venue_id),
            "status": "insufficient_data",
            "message": "No recent metrics available for forecasting."
        }

    try:
        prediction = await prediction_service.forecast_risk(
            session,
            venue_id
        )
    except Exception as e:
        logger.error(
            "Forecast generation failed",
            extra={"error": str(e)}
        )
        return {
            "venue_id": str(venue_id),
            "status": "prediction_error",
        }

    return {
        "venue_id": str(venue_id),
        "current_level": latest_metric.risk_level,
        "predicted_level": prediction.get("predicted_level"),
        "predicted_risk_score": prediction.get("predicted_risk_score"),
        "confidence": prediction.get("confidence"),
        "escalation_probability": prediction.get("escalation_probability"),
        "forecast_horizon_minutes": prediction.get("horizon_minutes"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ==========================================================
# Venue Queue Estimate (Dynamic route)
# ==========================================================

@router.get("/{venue_id}/queue-estimate")
async def get_queue_estimate(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    Get the estimated waiting time for queues at a venue.
    Based on real-time YOLO object detection.
    
    Returns: queue_length, service_rate, and human readable estimated_wait_time.
    """
    try:
        estimate = await queue_estimator.get_or_create_estimate(session, venue_id)
        return {
            "venue_id": str(estimate.venue_id),
            "queue_length": estimate.queue_length,
            "service_rate": estimate.service_rate,
            "estimated_wait_time": estimate.estimated_wait_time,
        }
    except Exception as e:
        logger.error(
            "Queue estimate failed",
            extra={"error": str(e), "venue_id": str(venue_id)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute queue estimate"
        )


# ==========================================================
# Crowd Trend Analytics (Dynamic route)
# ==========================================================

@router.get("/{venue_id}/analytics/trends")
async def get_crowd_trends(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    Get historical crowd trends (Feature 9).
    Returns the daily peak traffic and max crowd size.
    """
    try:
        trends = await analytics_service.get_crowd_trends(session, venue_id)
        return trends
    except Exception as e:
        logger.error(
            "Crowd trends failed",
            extra={"error": str(e), "venue_id": str(venue_id)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute crowd trends"
        )


# ==========================================================
# Resource Planning (Dynamic route)
# ==========================================================

@router.get("/{venue_id}/analytics/resource-planning")
async def get_recommended_staff(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),  # ✅ RBAC: Any authenticated user
):
    """
    Get recommended staff deployment (Feature 10).
    Based on live crowd size.
    """
    try:
        staff_plan = await resource_optimizer.get_recommended_staff(session, venue_id)
        return staff_plan
    except Exception as e:
        logger.error(
            "Resource planning failed",
            extra={"error": str(e), "venue_id": str(venue_id)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute Resource Planning"
        )
