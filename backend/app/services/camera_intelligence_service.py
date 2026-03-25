from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime, timedelta, timezone

from app.models.camera import Camera
from app.models.crowd_metric import CrowdMetric
from app.core.logging import get_logger

logger = get_logger(__name__)


class CameraIntelligenceService:
    """
    Provides per-camera analytics and health monitoring.
    """

    async def get_camera_metrics(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ):
        """
        Returns latest crowd metrics per camera.
        """

        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .order_by(CrowdMetric.bucket_start.desc())
        )

        result = await session.execute(stmt)

        metrics = result.scalars().all()

        camera_map = {}

        for m in metrics:

            if not m.camera_id:
                continue

            cam_key = str(m.camera_id)
            if cam_key not in camera_map:
                count = round(m.avg_count) if m.avg_count is not None else 0
                risk = m.dynamic_risk_score or 0.0
                camera_map[cam_key] = {
                    "person_count": count,           # primary field used by /cameras/{id} page
                    "latest_count": count,           # alias for backward compat
                    "latest_risk_score": risk,
                    "velocity": m.avg_velocity or 0.0,
                    "variance": m.avg_variance or 0.0,
                    "acceleration": m.avg_acceleration or 0.0,
                    "timestamp": m.bucket_start,
                }

        return camera_map

    async def get_camera_health(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ):
        """
        Detect offline cameras.
        """

        stmt = (
            select(Camera)
            .where(Camera.venue_id == venue_id)
        )

        result = await session.execute(stmt)

        cameras = result.scalars().all()

        health = []

        now = datetime.now(timezone.utc)

        for cam in cameras:

            last_frame = cam.last_frame_at

            if not last_frame:
                status = "never_started"

            elif (now - last_frame) > timedelta(minutes=2):
                status = "offline"

            else:
                status = "online"

            health.append({
                "camera_id": str(cam.id),
                "name": cam.name,
                "status": status,
                "last_frame": last_frame
            })

        return health
