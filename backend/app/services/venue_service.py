"""
Laminar - Venue Service Layer
------------------------------

Production-grade business logic for Venue domain.

Responsibilities:
- Enforce domain rules
- Prevent duplicates
- Validate capacity constraints
- Manage soft deletion rules
- Coordinate repository operations
- Prepare for future camera & metric linkage
- Multi-tenant support
- Activity lifecycle management

Architecture:
API Layer -> VenueService -> Repository -> Database
"""

from typing import List, Optional, Dict, Any
from uuid import UUID 
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.venue import Venue
from app.models.camera import Camera
from app.core.repository import Repository
from app.core.logging import get_logger
from app.models.crowd_metric import CrowdMetric
from sqlalchemy import select, func
logger = get_logger(__name__)


class VenueService:
    """
    Domain service for Venue operations.
    """

    def __init__(self):
        self.venue_repo = Repository[Venue](Venue)
        self.camera_repo = Repository[Camera](Camera)

    # ==========================================================
    # Create Venue
    # ==========================================================

    async def create_venue(
        self,
        session: AsyncSession,
        *,
        name: str,
        capacity: int,
        location: Optional[str] = None,
        city: Optional[str] = None,
        country: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        warning_threshold: int = 700,
        critical_threshold: int = 900,
        venue_type: Optional[str] = None,
        staffing_config: Optional[Dict[str, Any]] = None,
        model_metadata: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[UUID] = None,
        created_by: Optional[UUID] = None,
    ) -> Venue:
        """
        Create a new venue with domain validation.

        Rules:
        - Name must be unique (non-deleted venues)
        - Capacity must be > 0
        - Warning threshold must be less than critical threshold
        """

        if capacity <= 0:
            raise ValueError("Venue capacity must be greater than zero.")

        if warning_threshold >= critical_threshold:
            raise ValueError(
                "Warning threshold must be less than critical threshold."
            )

        # Check duplicate name within tenant
        filters = {"name": name}
        if tenant_id:
            filters["tenant_id"] = tenant_id

        exists = await self.venue_repo.exists(
            session,
            filters=filters,
            include_deleted=False,
        )
        if exists:
            raise ValueError(
                f"Venue with name '{name}' already exists in this tenant."
            )

        venue = Venue(
            name=name,
            capacity=capacity,
            location=location,
            city=city,
            country=country,
            latitude=latitude,
            longitude=longitude,
            warning_threshold=warning_threshold,
            critical_threshold=critical_threshold,
            warning_threshold_percent=int(warning_threshold * 100 / capacity) if capacity else 70,
            critical_threshold_percent=int(critical_threshold * 100 / capacity) if capacity else 90,
            venue_type=venue_type,
            staffing_config=staffing_config,
            model_metadata=model_metadata,
            tenant_id=tenant_id,
            created_by=created_by,
            updated_by=created_by,
        )

        created = await self.venue_repo.create(
            session,
            venue,
            commit=True,
        )

        logger.info(
            "Venue created",
            extra_fields={
                "venue_id": str(created.id),
                "name": name,
                "tenant_id": str(tenant_id) if tenant_id else None,
                "created_by": str(created_by) if created_by else None,
            }
        )

        return created

    # ==========================================================
    # Get Venue
    # ==========================================================

    async def get_venue(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> Venue:
        """
        Fetch a single venue by ID with tenant validation.
        """

        venue = await self.venue_repo.get_by_id(session, venue_id)

        if not venue:
            raise ValueError("Venue not found.")

        # Tenant isolation check
        if tenant_id and hasattr(venue, "tenant_id") and venue.tenant_id != tenant_id:
            raise ValueError("Venue not found in this tenant.")

        return venue

    async def list_venues(
        self,
        session: AsyncSession,
        *,
        tenant_id: Optional[UUID] = None,
        is_active: Optional[bool] = None,
        city: Optional[str] = None,
        country: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        include_deleted: bool = False,
    ) -> List[Venue]:
        """
        List venues with filtering and pagination.
        """

        filters = {}
        if is_active is not None:
            filters["is_active"] = is_active
        if city:
            filters["city"] = city
        if country:
            filters["country"] = country

        return await self.venue_repo.list(
            session,
            tenant_id=tenant_id,
            filters=filters,
            sort_by="created_at",
            descending=True,
            skip=skip,
            limit=limit,
            include_deleted=include_deleted,
        )

    # ==========================================================
    # Update Venue
    # ==========================================================

    async def update_venue(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        name: Optional[str] = None,
        capacity: Optional[int] = None,
        location: Optional[str] = None,
        city: Optional[str] = None,
        country: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        warning_threshold: Optional[int] = None,
        critical_threshold: Optional[int] = None,
        venue_type: Optional[str] = None,
        staffing_config: Optional[Dict[str, Any]] = None,
        model_metadata: Optional[Dict[str, Any]] = None,
        is_active: Optional[bool] = None,
        monitoring_enabled: Optional[bool] = None,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
        expected_version: Optional[int] = None,
    ) -> Venue:
        """
        Update venue with optimistic locking.

        Rules:
        - Cannot reduce capacity below current active crowd max (future hook)
        - Name uniqueness enforced within tenant
        - Thresholds must be valid if both provided
        """

        venue = await self.get_venue(session, venue_id, tenant_id=tenant_id)

        update_data = {}

        # Validate thresholds if both provided
        if warning_threshold is not None and critical_threshold is not None:
            if warning_threshold >= critical_threshold:
                raise ValueError(
                    "Warning threshold must be less than critical threshold."
                )
        elif warning_threshold is not None:
            if warning_threshold >= venue.critical_threshold:
                raise ValueError(
                    "Warning threshold must be less than critical threshold."
                )
        elif critical_threshold is not None:
            if venue.warning_threshold >= critical_threshold:
                raise ValueError(
                    "Warning threshold must be less than critical threshold."
                )

        # Name update with tenant uniqueness
        if name and name != venue.name:
            filters = {"name": name}
            if tenant_id:
                filters["tenant_id"] = tenant_id
            elif hasattr(venue, "tenant_id") and venue.tenant_id:
                filters["tenant_id"] = venue.tenant_id

            exists = await self.venue_repo.exists(
                session,
                filters=filters,
                include_deleted=False,
            )
            if exists:
                raise ValueError(
                    f"Venue with name '{name}' already exists in this tenant."
                )
            update_data["name"] = name

        # Capacity update
        if capacity is not None:
            if capacity <= 0:
                raise ValueError("Venue capacity must be greater than zero.")
            update_data["capacity"] = capacity

        # Simple field updates
        if location is not None:
            update_data["location"] = location
        if city is not None:
            update_data["city"] = city
        if country is not None:
            update_data["country"] = country
        if latitude is not None:
            update_data["latitude"] = latitude
        if longitude is not None:
            update_data["longitude"] = longitude
        if warning_threshold is not None:
            update_data["warning_threshold"] = warning_threshold
            if venue.capacity:
                update_data["warning_threshold_percent"] = int(warning_threshold * 100 / venue.capacity)
        if critical_threshold is not None:
            update_data["critical_threshold"] = critical_threshold
            if venue.capacity:
                update_data["critical_threshold_percent"] = int(critical_threshold * 100 / venue.capacity)
        if venue_type is not None:
            update_data["venue_type"] = venue_type
        if staffing_config is not None:
            update_data["staffing_config"] = staffing_config
        if model_metadata is not None:
            update_data["model_metadata"] = model_metadata
        if is_active is not None:
            update_data["is_active"] = is_active
        if monitoring_enabled is not None:
            update_data["monitoring_enabled"] = monitoring_enabled

        if updated_by:
            update_data["updated_by"] = updated_by

        updated = await self.venue_repo.update(
            session,
            venue,
            update_data,
            expected_version=expected_version,
            commit=True,
        )

        logger.info(
            "Venue updated",
            extra_fields={
                "venue_id": str(venue_id),
                "updated_fields": list(update_data.keys()),
                "updated_by": str(updated_by) if updated_by else None,
            }
        )

        return updated

    # ==========================================================
    # Venue Lifecycle Management
    # ==========================================================

    async def activate_venue(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Venue:
        """Activate a venue."""
        return await self.update_venue(
            session,
            venue_id,
            is_active=True,
            tenant_id=tenant_id,
            updated_by=updated_by,
        )

    async def deactivate_venue(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Venue:
        """Deactivate a venue."""
        return await self.update_venue(
            session,
            venue_id,
            is_active=False,
            tenant_id=tenant_id,
            updated_by=updated_by,
        )

    async def enable_monitoring(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Venue:
        """Enable monitoring for a venue."""
        return await self.update_venue(
            session,
            venue_id,
            monitoring_enabled=True,
            tenant_id=tenant_id,
            updated_by=updated_by,
        )

    async def disable_monitoring(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Venue:
        """Disable monitoring for a venue."""
        return await self.update_venue(
            session,
            venue_id,
            monitoring_enabled=False,
            tenant_id=tenant_id,
            updated_by=updated_by,
        )

    # ==========================================================
    # Delete Venue
    # ==========================================================

    async def delete_venue(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        deleted_by: Optional[UUID] = None,
    ) -> None:
        """
        Soft delete venue.

        Rules:
        - All associated cameras must also be soft-deleted
        - Historical crowd data remains intact
        """

        venue = await self.get_venue(session, venue_id, tenant_id=tenant_id)

        # Soft delete associated cameras first
        cameras = await self.camera_repo.list(
            session,
            tenant_id=tenant_id,
            filters={"venue_id": venue_id},
        )

        if cameras:
            camera_ids = [camera.id for camera in cameras]
            await self.camera_repo.bulk_soft_delete(
                session,
                camera_ids,
                deleted_by=deleted_by,
            )
            logger.info(
                "Cameras soft-deleted with venue",
                extra_fields={
                    "venue_id": str(venue_id),
                    "camera_count": len(camera_ids),
                    "deleted_by": str(deleted_by) if deleted_by else None,
                }
            )

        # Soft delete venue
        if deleted_by:
            venue.updated_by = deleted_by

        await self.venue_repo.soft_delete(
            session,
            venue,
            commit=True,
        )

        logger.info(
            "Venue soft-deleted",
            extra_fields={
                "venue_id": str(venue_id),
                "name": venue.name,
                "deleted_by": str(deleted_by) if deleted_by else None,
            }
        )

    async def bulk_delete_venues(
        self,
        session: AsyncSession,
        venue_ids: List[UUID],
        *,
        tenant_id: Optional[UUID] = None,
        deleted_by: Optional[UUID] = None,
    ) -> int:
        """
        Soft delete multiple venues and their cameras.
        Returns number of venues deleted.
        """
        count = 0
        for venue_id in venue_ids:
            try:
                await self.delete_venue(
                    session,
                    venue_id,
                    tenant_id=tenant_id,
                    deleted_by=deleted_by,
                )
                count += 1
            except ValueError as e:
                logger.warning(
                    "Skipping venue deletion",
                    extra_fields={
                        "venue_id": str(venue_id),
                        "error": str(e),
                    }
                )
                continue
        return count

    # ==========================================================
    # Analytics Helpers
    # ==========================================================

    async def get_venue_camera_count(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        only_active: bool = True,
    ) -> int:
        """
        Get active camera count for venue.
        """

        filters = {"venue_id": venue_id}
        if only_active:
            filters["is_active"] = True

        return await self.camera_repo.count(
            session,
            tenant_id=tenant_id,
            filters=filters,
        )

    async def get_venue_stats(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:

        venue = await self.get_venue(session, venue_id, tenant_id=tenant_id)

        camera_count = await self.get_venue_camera_count(
            session,
            venue_id,
            tenant_id=tenant_id,
            only_active=False
        )

        active_cameras = await self.get_venue_camera_count(
            session,
            venue_id,
            tenant_id=tenant_id,
            only_active=True
        )

        # 🔥 Fetch latest venue metric strictly within the last 5 minutes (LIVE DATA)
        from sqlalchemy import select, func
        from datetime import datetime, timedelta, timezone
        
        recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_type == "minute")
            .where(CrowdMetric.bucket_start >= recent_cutoff)
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(1)
        )

        result = await session.execute(stmt)

        latest_metric = result.scalar_one_or_none()


        # -- 1. Use scheduled venue-wide metric if available --
        # -- 2. Fallback: sum live per-camera CrowdFrame counts --
        if latest_metric:
            current_occupancy = float(latest_metric.avg_count or 0)
            current_risk = float(latest_metric.dynamic_risk_score or 0)
            capacity_usage = float(latest_metric.occupancy_percent or 0)
            risk_level = latest_metric.risk_level or "unknown"
            avg_velocity = float(latest_metric.avg_velocity or 0.0)
        else:
            current_occupancy = 0.0
            current_risk = 0.0
            capacity_usage = 0.0
            risk_level = "low"
            avg_velocity = 0.0

        if current_occupancy == 0.0:
            # 🔥 SMART CITY SYNC: Check live telemetry domains for this venue
            try:
                from app.core.global_state import GLOBAL_STATE
                check_domains = ["traffic", "parking", "people", "crowd"]
                if venue.venue_type == "parking":
                    check_domains = ["parking"]
                elif venue.venue_type == "traffic":
                    check_domains = ["traffic"]
                elif venue.venue_type in ["people", "crowd"]:
                    check_domains = ["people", "crowd"]
                
                for check_domain in check_domains:
                    v_payload = GLOBAL_STATE.get_venue_state(check_domain, venue_id)
                    if v_payload:
                        # Extract count based on domain conventions
                        if check_domain == "parking":
                            current_occupancy = v_payload.get("occupied_spots") or v_payload.get("count", 0)
                        else:
                            current_occupancy = v_payload.get("count") or v_payload.get("vehicle_count") or v_payload.get("occupied_spots", 0)
                        
                        if current_occupancy > 0:
                            avg_velocity = v_payload.get("avg_velocity") or v_payload.get("flow_speed", 0.0)
                            if venue.capacity and venue.capacity > 0:
                                capacity_usage = (current_occupancy / venue.capacity) * 100
                                # Dynamic risk classification
                                if capacity_usage >= (venue.critical_threshold / venue.capacity * 100): risk_level = "critical"
                                elif capacity_usage >= (venue.warning_threshold / venue.capacity * 100): risk_level = "high"
                                elif capacity_usage > 20: risk_level = "medium"
                                else: risk_level = "stable"
                            break # Found active data
            except Exception as e:
                logger.warning(f"Global state sync failed for venue {venue_id}: {e}")

        if current_occupancy == 0.0 and venue.venue_type in ["people", "crowd"]:
            try:
                from datetime import datetime, timedelta, timezone
                from app.models.crowd_frame import CrowdFrame
                recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
                subq = (
                    select(
                        CrowdFrame.camera_id,
                        func.max(CrowdFrame.detected_count).label("peak"),
                    )
                    .join(Camera, Camera.id == CrowdFrame.camera_id)
                    .where(Camera.venue_id == venue_id)
                    .where(Camera.is_active == True)
                    .where(CrowdFrame.captured_at >= recent_cutoff)
                    .group_by(CrowdFrame.camera_id)
                    .subquery()
                )
                total_result = await session.execute(select(func.sum(subq.c.peak)))
                live_total = total_result.scalar_one_or_none()
                if live_total:
                    current_occupancy = float(live_total)
                    if venue.capacity and venue.capacity > 0:
                        capacity_usage = (current_occupancy / venue.capacity) * 100
            except Exception as e:
                logger.warning(
                    "Live occupancy fallback failed in get_venue_stats",
                    extra_fields={"error": str(e), "venue_id": str(venue_id)},
                )

        return {
            "id": str(venue.id),
            "name": venue.name,
            "capacity": venue.capacity,
            "current_risk": current_risk,
            "risk_level": risk_level,
            "current_occupancy": current_occupancy,
            "capacity_usage": capacity_usage,
            "camera_count": camera_count,
            "active_cameras": active_cameras,
            "is_active": venue.is_active,
            "monitoring_enabled": venue.monitoring_enabled,
            "avg_velocity": avg_velocity,
            "warning_threshold": venue.warning_threshold,
            "critical_threshold": venue.critical_threshold,
            "venue_type": venue.venue_type,
            "created_at": venue.created_at.isoformat() if venue.created_at else None,
            "city": venue.city,
            "country": venue.country,
            "latitude": float(venue.latitude) if venue.latitude is not None else None,
            "longitude": float(venue.longitude) if venue.longitude is not None else None,
        }

    # ==========================================================
    # Search / Discovery
    # ==========================================================

    async def search_venues(
        self,
        session: AsyncSession,
        *,
        tenant_id: Optional[UUID] = None,
        query: Optional[str] = None,
        city: Optional[str] = None,
        country: Optional[str] = None,
        is_active: Optional[bool] = None,
        min_capacity: Optional[int] = None,
        max_capacity: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Venue]:
        """
        Search venues with advanced filters.
        For text search, this uses simple filtering - could be enhanced with full-text search.
        """
        filters = {}

        if city:
            filters["city"] = city
        if country:
            filters["country"] = country
        if is_active is not None:
            filters["is_active"] = is_active

        # For capacity range, we need custom handling
        # This would be better with SQL, but for now:
        venues = await self.venue_repo.list(
            session,
            tenant_id=tenant_id,
            filters=filters,
            skip=skip,
            limit=limit * 2,  # Get more for filtering
        )

        # Post-filter by capacity range
        if min_capacity is not None or max_capacity is not None:
            filtered = []
            for v in venues:
                if min_capacity is not None and v.capacity < min_capacity:
                    continue
                if max_capacity is not None and v.capacity > max_capacity:
                    continue
                filtered.append(v)
            venues = filtered

        # Text search in memory (temporary - should use full-text search)
        if query:
            query_lower = query.lower()
            venues = [
                v for v in venues
                if query_lower in v.name.lower() or
                (v.description and query_lower in v.description.lower()) or
                (v.city and query_lower in v.city.lower())
            ]

        return venues[:limit]

    # ==========================================================
    # Business Guard for Risk Engine
    # ==========================================================

    async def ensure_capacity_not_exceeded(
        self,
        session: AsyncSession,
        venue_id: UUID,
        current_count: int,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> bool:
        """
        Check if current crowd exceeds venue capacity.

        Used by risk engine.
        """

        venue = await self.get_venue(session, venue_id, tenant_id=tenant_id)

        if current_count > venue.capacity:
            logger.warning(
                "Venue capacity exceeded",
                extra_fields={
                    "venue_id": str(venue_id),
                    "capacity": venue.capacity,
                    "current_count": current_count,
                }
            )
            return True

        return False

    async def get_capacity_status(
        self,
        session: AsyncSession,
        venue_id: UUID,
        current_count: int,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """
        Get detailed capacity status for alerting.
        Returns: {
            "level": "normal|warning|critical|exceeded",
            "percentage": float,
            "message": str
        }
        """
        venue = await self.get_venue(session, venue_id, tenant_id=tenant_id)

        if not venue.capacity:
            return {
                "level": "unknown",
                "percentage": None,
                "message": "Venue capacity not configured"
            }

        percentage = (current_count / venue.capacity) * 100

        if current_count > venue.capacity:
            return {
                "level": "exceeded",
                "percentage": percentage,
                "message": f"Capacity exceeded by {current_count - venue.capacity} people"
            }
        if current_count >= venue.critical_threshold:
            return {
                "level": "critical",
                "percentage": percentage,
                "message": f"Critical crowd level: {current_count} persons ({percentage:.1f}%)"
            }
        elif current_count >= venue.warning_threshold:
            return {
                "level": "warning",
                "percentage": percentage,
                "message": f"Warning: {current_count} persons ({percentage:.1f}%) reached"
            }
        else:
            return {
                "level": "normal",
                "percentage": percentage,
                "message": f"Normal crowd level: {current_count} persons ({percentage:.1f}%)"
            }
