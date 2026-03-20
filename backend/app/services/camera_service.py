"""
Laminar - Camera Service Layer
------------------------------

Production-grade business logic for Camera domain.

Responsibilities:
- Validate camera creation rules
- Enforce venue relationship
- Ensure name uniqueness per venue
- Manage AI configuration
- Record heartbeats
- Compute health status
- Provide camera statistics
- Handle soft deletion safely
- Multi-tenant isolation
"""

from datetime import datetime,timezone
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, timedelta
import re

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.camera import Camera
from app.models.venue import Venue
from app.models.crowd_frame import CrowdFrame
from app.core.repository import Repository
from app.core.logging import get_logger


logger = get_logger(__name__)


# Health thresholds
OFFLINE_THRESHOLD_MINUTES = 5
DEGRADED_THRESHOLD_MINUTES = 2


class CameraService:
    """
    Domain service for Camera operations.
    """

    def __init__(self):
        self.camera_repo = Repository[Camera](Camera)
        self.venue_repo = Repository[Venue](Venue)

    # ==========================================================
    # Validation Helpers
    # ==========================================================

    def _validate_stream_url(self, stream_url: str, stream_type: str) -> None:
        """Validate stream URL format based on type."""
        if stream_type == "rtsp" and not stream_url.startswith("rtsp://"):
            raise ValueError("RTSP stream must start with rtsp://")
        elif stream_type in ["http", "https"] and not re.match(r"^https?://", stream_url):
            raise ValueError("HTTP stream must start with http:// or https://")
        elif stream_type == "file" and not stream_url.startswith(("/", "file://")):
            raise ValueError(
                "File stream must be an absolute path or file:// URL")
        elif stream_type == "edge":
            # Edge devices can have custom formats
            pass

    def _validate_credentials(self, username: Optional[str], password: Optional[str]) -> None:
        """Validate that both username and password are provided together."""
        if bool(username) != bool(password):
            raise ValueError(
                "Both username and password must be provided together.")

    def _validate_resolution(self, width: Optional[int], height: Optional[int]) -> None:
        """Validate resolution dimensions."""
        if width is not None and height is not None:
            if width <= 0 or height <= 0:
                raise ValueError("Resolution dimensions must be positive.")
        elif width is not None or height is not None:
            raise ValueError(
                "Both resolution width and height must be provided together.")

    # ==========================================================
    # Create Camera
    # ==========================================================

    async def create_camera(
        self,
        session: AsyncSession,
        *,
        venue_id: UUID,
        name: str,
        stream_url: str,
        stream_type: str = "rtsp",
        username: Optional[str] = None,
        password: Optional[str] = None,
        location_description: Optional[str] = None,
        resolution_width: Optional[int] = None,
        resolution_height: Optional[int] = None,
        fps: Optional[float] = None,
        is_active: bool = True,
        tenant_id: Optional[UUID] = None,
        created_by: Optional[UUID] = None,
    ) -> Camera:
        """
        Create a new camera with full validation.

        Rules:
        - Venue must exist and belong to tenant
        - Camera name must be unique within venue
        - Stream URL must match stream type format
        - Username and password must be provided together
        - Resolution dimensions must be provided together
        """
        # Validate venue exists
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            raise ValueError("Venue not found.")

        # Tenant isolation check
        if tenant_id and hasattr(venue, "tenant_id") and venue.tenant_id != tenant_id:
            raise ValueError("Venue not found in this tenant.")

        # Name uniqueness within venue
        exists = await self.camera_repo.exists(
            session,
            filters={"venue_id": venue_id, "name": name},
        )
        if exists:
            raise ValueError(
                f"Camera with name '{name}' already exists in this venue.")

        # Stream URL validation
        self._validate_stream_url(stream_url, stream_type)

        # Credential validation
        self._validate_credentials(username, password)

        # Resolution validation
        self._validate_resolution(resolution_width, resolution_height)

        # FPS validation
        if fps is not None and fps <= 0:
            raise ValueError("FPS must be positive.")

        camera = Camera(
            venue_id=venue_id,
            name=name,
            stream_url=stream_url,
            stream_type=stream_type,
            username=username,
            password=password,
            location_description=location_description,
            resolution_width=resolution_width,
            resolution_height=resolution_height,
            fps=fps,
            is_active=is_active,
            monitoring_enabled=True,
            detection_enabled=True,
            tracking_enabled=True,
            health_status="unknown",
            is_online=False,
            tenant_id=tenant_id,
            created_by=created_by,
            updated_by=created_by,
        )

        created = await self.camera_repo.create(session, camera, commit=True)

        logger.info(
            "Camera created",
            extra_fields={
                "camera_id": str(created.id),
                "venue_id": str(venue_id),
                "stream_type": stream_type,
                "created_by": str(created_by) if created_by else None,
            },
        )

        return created

    # ==========================================================
    # Get / List
    # ==========================================================

    async def get_camera(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> Camera:
        """
        Get camera by ID with tenant isolation.
        """
        camera = await self.camera_repo.get_by_id(session, camera_id)
        if not camera:
            raise ValueError("Camera not found.")

        # Tenant isolation check
        if tenant_id and hasattr(camera, "tenant_id") and camera.tenant_id != tenant_id:
            raise ValueError("Camera not found in this tenant.")

        return camera

    async def list_cameras(
        self,
        session: AsyncSession,
        *,
        venue_id: Optional[UUID] = None,
        filters: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Camera]:
        """
        List cameras with optional filters.
        """
        final_filters = filters or {}

        if venue_id:
            final_filters["venue_id"] = venue_id

        return await self.camera_repo.list(
            session,
            tenant_id=tenant_id,
            filters=final_filters,
            skip=skip,
            limit=limit,
        )

    async def get_venue_camera_summary(
        self,
        session: AsyncSession,
        venue_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """
        Get summary of cameras for a venue.
        Useful for dashboard overview.
        """
        cameras = await self.list_cameras(
            session,
            venue_id=venue_id,
            tenant_id=tenant_id,
        )

        total = len(cameras)
        online = sum(1 for c in cameras if c.is_online)
        active = sum(1 for c in cameras if c.is_active)
        monitoring = sum(1 for c in cameras if c.monitoring_enabled)
        detection = sum(1 for c in cameras if c.detection_enabled)

        return {
            "venue_id": str(venue_id),
            "total_cameras": total,
            "online_cameras": online,
            "active_cameras": active,
            "monitoring_enabled": monitoring,
            "detection_enabled": detection,
            "health_distribution": {
                "healthy": sum(1 for c in cameras if c.health_status == "healthy"),
                "degraded": sum(1 for c in cameras if c.health_status == "degraded"),
                "offline": sum(1 for c in cameras if c.health_status == "offline"),
                "unknown": sum(1 for c in cameras if c.health_status == "unknown"),
            },
            "stream_types": {
                "rtsp": sum(1 for c in cameras if c.stream_type == "rtsp"),
                "http": sum(1 for c in cameras if c.stream_type in ["http", "https"]),
                "file": sum(1 for c in cameras if c.stream_type == "file"),
                "edge": sum(1 for c in cameras if c.stream_type == "edge"),
            }
        }

    # ==========================================================
    # Update Camera
    # ==========================================================

    async def update_camera(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
        expected_version: Optional[int] = None,
        **fields,
    ) -> Camera:
        """
        Update camera with optimistic locking.

        Validates:
        - Name uniqueness if name is being updated
        - Stream URL format if stream_url is being updated
        - Credential consistency if username/password are being updated
        - Resolution consistency if resolution is being updated
        """
        camera = await self.get_camera(session, camera_id, tenant_id=tenant_id)

        update_data = {}

        # Validate name uniqueness if being updated
        if "name" in fields and fields["name"] and fields["name"] != camera.name:
            exists = await self.camera_repo.exists(
                session,
                filters={"venue_id": camera.venue_id, "name": fields["name"]},
            )
            if exists:
                raise ValueError(
                    f"Camera with name '{fields['name']}' already exists.")
            update_data["name"] = fields["name"]

        # Validate stream URL if being updated
        if "stream_url" in fields and fields["stream_url"]:
            stream_type = fields.get("stream_type", camera.stream_type)
            self._validate_stream_url(fields["stream_url"], stream_type)
            update_data["stream_url"] = fields["stream_url"]

        # Validate stream type
        if "stream_type" in fields and fields["stream_type"]:
            valid_types = {"rtsp", "http", "https", "file", "edge"}
            if fields["stream_type"] not in valid_types:
                raise ValueError(f"stream_type must be one of: {valid_types}")
            update_data["stream_type"] = fields["stream_type"]

        # Validate credentials
        username = fields.get("username", camera.username)
        password = fields.get("password", camera.password)
        if username != camera.username or password != camera.password:
            self._validate_credentials(username, password)
            update_data["username"] = username
            update_data["password"] = password

        # Validate resolution
        width = fields.get("resolution_width", camera.resolution_width)
        height = fields.get("resolution_height", camera.resolution_height)
        if width != camera.resolution_width or height != camera.resolution_height:
            self._validate_resolution(width, height)
            update_data["resolution_width"] = width
            update_data["resolution_height"] = height

        # Validate FPS
        if "fps" in fields and fields["fps"] is not None:
            if fields["fps"] <= 0:
                raise ValueError("FPS must be positive.")
            update_data["fps"] = fields["fps"]

        # Simple boolean fields
        for field in ["is_active", "monitoring_enabled", "detection_enabled", "tracking_enabled"]:
            if field in fields and fields[field] is not None:
                update_data[field] = fields[field]

        # AI model fields
        if "model_version" in fields:
            update_data["model_version"] = fields["model_version"]
        if "model_config" in fields:
            update_data["model_config"] = fields["model_config"]

        if updated_by:
            update_data["updated_by"] = updated_by

        if not update_data:
            return camera

        updated = await self.camera_repo.update(
            session,
            camera,
            update_data,
            expected_version=expected_version,
            commit=True,
        )

        logger.info(
            "Camera updated",
            extra_fields={
                "camera_id": str(camera_id),
                "updated_fields": list(update_data.keys()),
                "updated_by": str(updated_by) if updated_by else None,
            },
        )

        return updated

    # ==========================================================
    # AI Configuration
    # ==========================================================

    async def configure_ai(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        detection_enabled: bool,
        tracking_enabled: bool,
        model_version: Optional[str],
        model_config: Optional[Dict[str, Any]],
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Camera:
        """
        Configure AI settings for camera.
        """
        return await self.update_camera(
            session,
            camera_id,
            tenant_id=tenant_id,
            detection_enabled=detection_enabled,
            tracking_enabled=tracking_enabled,
            model_version=model_version,
            model_config=model_config,
            updated_by=updated_by,
        )

    # ==========================================================
    # Heartbeat and Frame Recording
    # ==========================================================

    async def record_heartbeat(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        timestamp: datetime,
        status: str,
        fps_current: Optional[float],
        connection_latency_ms: Optional[int],
        metrics: Optional[Dict[str, Any]],
        tenant_id: Optional[UUID] = None,
    ) -> None:
        """
        Record heartbeat from camera agent.
        Updates online status and health metrics.
        """
        camera = await self.get_camera(session, camera_id, tenant_id=tenant_id)

        update_data = {
            "last_heartbeat_at": timestamp,
            "is_online": status == "online",
            "health_status": self._calculate_health(timestamp),
        }

        if fps_current is not None:
            if fps_current <= 0:
                raise ValueError("fps_current must be positive.")
            update_data["fps_current"] = fps_current

        if connection_latency_ms is not None:
            if connection_latency_ms < 0:
                raise ValueError("connection_latency_ms cannot be negative.")
            update_data["connection_latency_ms"] = connection_latency_ms

        if metrics is not None:
            update_data["health_metadata"] = metrics

        await self.camera_repo.update(
            session,
            camera,
            update_data,
            commit=True,
        )

        logger.debug(
            "Camera heartbeat recorded",
            extra_fields={
                "camera_id": str(camera_id),
                "status": status,
                "health_status": update_data["health_status"],
            },
        )

    async def record_frame(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> None:
        """
        Record that a frame was captured by camera.
        Updates last_frame_at timestamp.
        """
        camera = await self.get_camera(session, camera_id, tenant_id=tenant_id)

        await self.camera_repo.update(
            session,
            camera,
            {"last_frame_at": datetime.now(timezone.utc)},
            commit=True,
        )

    # ==========================================================
    # Health Calculation
    # ==========================================================

    def _calculate_health(self, last_heartbeat: datetime) -> str:
        """Calculate health status based on last heartbeat."""
        now = datetime.now(timezone.utc)
        delta = now - last_heartbeat

        if delta > timedelta(minutes=OFFLINE_THRESHOLD_MINUTES):
            return "offline"
        elif delta > timedelta(minutes=DEGRADED_THRESHOLD_MINUTES):
            return "degraded"
        return "healthy"

    async def get_camera_health(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """
        Get comprehensive camera health status.
        """
        camera = await self.get_camera(session, camera_id, tenant_id=tenant_id)

        # Calculate health if last heartbeat exists
        if camera.last_heartbeat_at:
            health = self._calculate_health(camera.last_heartbeat_at)
        else:
            health = "unknown"

        # Determine message
        if health == "healthy":
            message = "Camera is operating normally"
        elif health == "degraded":
            message = f"Camera heartbeat delayed (last: {camera.last_heartbeat_at})"
        elif health == "offline":
            message = "Camera is offline - no recent heartbeat"
        else:
            message = "Camera health unknown - no heartbeat received"

        return {
            "id": camera.id,
            "name": camera.name,
            "health_status": health,

            # REQUIRED BY SCHEMA
            "is_active": camera.is_active,
            "monitoring_enabled": camera.monitoring_enabled,

            "is_online": camera.is_online,
            "last_heartbeat_at": camera.last_heartbeat_at.isoformat() if camera.last_heartbeat_at else None,
            "last_frame_at": camera.last_frame_at.isoformat() if camera.last_frame_at else None,
            "fps_current": getattr(camera, "fps_current", None),
            "fps_configured": camera.fps,
            "connection_latency_ms": getattr(camera, "connection_latency_ms", None),
            "message": message,
        }

    # ==========================================================
    # Statistics
    # ==========================================================

    async def get_camera_stats(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        tenant_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """
        Get camera statistics including frame counts.
        """
        camera = await self.get_camera(session, camera_id, tenant_id=tenant_id)

        # Build frame count query
        stmt = select(func.count()).where(CrowdFrame.camera_id == camera_id)

        if from_date:
            stmt = stmt.where(CrowdFrame.captured_at >= from_date)
        if to_date:
            stmt = stmt.where(CrowdFrame.captured_at <= to_date)

        result = await session.execute(stmt)
        total_frames = result.scalar_one()

        # Calculate uptime if heartbeat exists
        uptime_percentage = None
        if camera.last_heartbeat_at and camera.created_at:
            total_time = (datetime.now(timezone.utc) -
                          camera.created_at).total_seconds()
            if total_time > 0:
                # This is simplified - real uptime would track online periods
                uptime_percentage = 100.0  # Placeholder

        return {
            "id": camera.id,
            "name": camera.name,
            "total_frames": total_frames,
            "frames_last_hour": 0,  # TODO: Implement time-based counts
            "frames_last_day": 0,
            "avg_detections_per_frame": None,  # TODO: Calculate from frames
            "uptime_percentage": uptime_percentage,
            "last_heartbeat_at": camera.last_heartbeat_at.isoformat() if camera.last_heartbeat_at else None,
            "last_frame_at": camera.last_frame_at.isoformat() if camera.last_frame_at else None,
            "health_status": camera.health_status,
            "created_at": camera.created_at.isoformat() if camera.created_at else None,
        }

    # ==========================================================
    # Activation Lifecycle
    # ==========================================================

    async def activate_camera(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Camera:
        """Activate a camera."""
        return await self.update_camera(
            session,
            camera_id,
            is_active=True,
            tenant_id=tenant_id,
            updated_by=updated_by,
        )

    async def deactivate_camera(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Camera:
        """Deactivate a camera."""
        return await self.update_camera(
            session,
            camera_id,
            is_active=False,
            tenant_id=tenant_id,
            updated_by=updated_by,
        )

    async def enable_monitoring(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Camera:
        """Enable monitoring for camera."""
        return await self.update_camera(
            session,
            camera_id,
            monitoring_enabled=True,
            tenant_id=tenant_id,
            updated_by=updated_by,
        )

    async def disable_monitoring(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        updated_by: Optional[UUID] = None,
    ) -> Camera:
        """Disable monitoring for camera."""
        return await self.update_camera(
            session,
            camera_id,
            monitoring_enabled=False,
            tenant_id=tenant_id,
            updated_by=updated_by,
        )

    # ==========================================================
    # Delete Operations
    # ==========================================================

    async def delete_camera(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
        deleted_by: Optional[UUID] = None,
    ) -> None:
        """
        Soft delete a camera.

        - Camera marked as deleted
        - Historical frame data preserved
        """
        camera = await self.get_camera(session, camera_id, tenant_id=tenant_id)

        if deleted_by:
            camera.updated_by = deleted_by

        await self.camera_repo.soft_delete(session, camera, commit=True)

        logger.info(
            "Camera soft-deleted",
            extra_fields={
                "camera_id": str(camera_id),
                "deleted_by": str(deleted_by) if deleted_by else None,
            },
        )

    async def bulk_delete_cameras(
        self,
        session: AsyncSession,
        camera_ids: List[UUID],
        *,
        tenant_id: Optional[UUID] = None,
        deleted_by: Optional[UUID] = None,
    ) -> int:
        """
        Soft delete multiple cameras.
        Continues on error, returns count of successfully deleted.
        """
        count = 0
        for camera_id in camera_ids:
            try:
                await self.delete_camera(
                    session,
                    camera_id,
                    tenant_id=tenant_id,
                    deleted_by=deleted_by,
                )
                count += 1
            except ValueError:
                logger.warning(
                    "Skipping camera deletion - not found",
                    extra_fields={"camera_id": str(camera_id)},
                )
                continue

        return count
