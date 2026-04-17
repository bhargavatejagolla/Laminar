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
        Returns latest crowd metrics per camera for a specific venue.
        Only cameras with recent metrics are included.
        """
        # Only fetch metrics from the last 1 minute to ensure live data provenance
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=1)
        stmt = (
            select(CrowdMetric)
            .where(
                CrowdMetric.venue_id == venue_id,
                CrowdMetric.bucket_start >= cutoff
            )
            .order_by(CrowdMetric.bucket_start.desc())
        )

        result = await session.execute(stmt)
        metrics = result.scalars().all()

        # Also fetch ALL cameras for this venue so offline cameras appear with zero metrics
        cam_stmt = select(Camera).where(
            Camera.venue_id == venue_id,
            Camera.is_active == True,
            Camera.deleted_at.is_(None),
        )
        cam_result = await session.execute(cam_stmt)
        all_cameras = cam_result.scalars().all()

        camera_map = {}

        # Seed every active camera with zero/base metrics so they are always visible
        for cam in all_cameras:
            cam_key = str(cam.id)
            camera_map[cam_key] = {
                "camera_id": cam_key,
                "camera_name": cam.name,
                "person_count": 0,
                "latest_count": 0,
                "latest_risk_score": 0.0,
                "velocity": 0.0,
                "variance": 0.0,
                "acceleration": 0.0,
                "timestamp": None,
                "is_online": cam.is_online,
                "health_status": cam.health_status or "unknown",
                "last_frame_at": cam.last_frame_at.isoformat() if cam.last_frame_at else None,
            }

        # Override with real metric data where available
        for m in metrics:
            if not m.camera_id:
                continue

            cam_key = str(m.camera_id)
            if cam_key not in camera_map:
                # Camera not in active list — still add it
                count = round(m.avg_count) if m.avg_count is not None else 0
                risk = m.dynamic_risk_score or 0.0
                camera_map[cam_key] = {
                    "camera_id": cam_key,
                    "camera_name": cam_key[:8],
                    "person_count": count,
                    "latest_count": count,
                    "latest_risk_score": risk,
                    "velocity": m.avg_velocity or 0.0,
                    "variance": m.avg_variance or 0.0,
                    "acceleration": m.avg_acceleration or 0.0,
                    "timestamp": m.bucket_start,
                    "is_online": True,
                    "health_status": "healthy",
                    "last_frame_at": None,
                }
            else:
                # 🚨 LIVE-DATA ENFORCEMENT: Only update if camera is actually ONLINE
                if camera_map[cam_key].get("is_online"):
                    # Only update metric fields if this entry is newer than what we have
                    existing_ts = camera_map[cam_key].get("timestamp")
                    if existing_ts is None or (m.bucket_start and m.bucket_start > existing_ts):
                        count = round(m.avg_count) if m.avg_count is not None else 0
                        risk = m.dynamic_risk_score or 0.0
                        camera_map[cam_key].update({
                            "person_count": count,
                            "latest_count": count,
                            "latest_risk_score": risk,
                            "velocity": m.avg_velocity or 0.0,
                            "variance": m.avg_variance or 0.0,
                            "acceleration": m.avg_acceleration or 0.0,
                            "timestamp": m.bucket_start,
                        })

        return camera_map

    async def get_all_camera_metrics(
        self,
        session: AsyncSession,
    ):
        """
        Returns latest crowd metrics across ALL venues/cameras.
        Used by the global Surge Monitor view.
        """
        # Fetch all active cameras
        cam_stmt = select(Camera).where(
            Camera.is_active == True,
            Camera.deleted_at.is_(None),
        )
        cam_result = await session.execute(cam_stmt)
        all_cameras = cam_result.scalars().all()

        camera_map = {}

        # Seed every active camera with base metrics
        for cam in all_cameras:
            cam_key = str(cam.id)
            camera_map[cam_key] = {
                "camera_id": cam_key,
                "camera_name": cam.name,
                "person_count": 0,
                "latest_count": 0,
                "latest_risk_score": 0.0,
                "velocity": 0.0,
                "variance": 0.0,
                "acceleration": 0.0,
                "timestamp": None,
                "is_online": cam.is_online,
                "health_status": cam.health_status or "unknown",
                "last_frame_at": cam.last_frame_at.isoformat() if cam.last_frame_at else None,
            }

        # Fetch latest metrics for all cameras (past 10 minutes)
        # STRICT LIVE CLIPPING: Only fetch metrics from the last 1 minute
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=1)
        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.bucket_start >= cutoff)
            .order_by(CrowdMetric.bucket_start.desc())
        )
        result = await session.execute(stmt)
        metrics = result.scalars().all()

        for m in metrics:
            if not m.camera_id:
                continue
            cam_key = str(m.camera_id)
            if cam_key not in camera_map:
                continue
                
            # STRICT LIVE ENFORCEMENT: Never show stale metrics for offline cameras
            if not camera_map[cam_key].get("is_online"):
                continue

            existing_ts = camera_map[cam_key].get("timestamp")
            if existing_ts is None or (m.bucket_start and m.bucket_start > existing_ts):
                count = round(m.avg_count) if m.avg_count is not None else 0
                risk = m.dynamic_risk_score or 0.0
                camera_map[cam_key].update({
                    "person_count": count,
                    "latest_count": count,
                    "latest_risk_score": risk,
                    "velocity": m.avg_velocity or 0.0,
                    "variance": m.avg_variance or 0.0,
                    "acceleration": m.avg_acceleration or 0.0,
                    "timestamp": m.bucket_start,
                })

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
