"""
Laminar - Occupancy Service
---------------------------

Provides real-time occupancy analytics per venue.
Production-safe queries with proper timezone handling.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, List
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.camera import Camera
from app.models.crowd_frame import CrowdFrame
from app.core.logging import get_logger

logger = get_logger(__name__)


class OccupancyService:
    """Service for venue occupancy analytics."""

    async def get_venue_occupancy(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Dict:
        """
        Returns real-time occupancy analytics for a venue.
        
        Args:
            session: Database session
            venue_id: UUID of the venue
            
        Returns:
            Dict with:
            - current_count: Latest total count across all cameras
            - avg_last_5_min: Average count over last 5 minutes
            - peak_today: Maximum count today
            - status: empty, normal, fluctuating, or no_cameras
        """
        try:
            now = datetime.now(timezone.utc)

            # ------------------------------------------------------
            # 1️⃣ Get cameras for venue
            # ------------------------------------------------------
            camera_stmt = select(Camera.id).where(Camera.venue_id == venue_id)
            camera_result = await session.execute(camera_stmt)
            camera_ids = [row[0] for row in camera_result.fetchall()]

            if not camera_ids:
                logger.info(f"No cameras found for venue {venue_id}")
                return {
                    "current_count": 0,
                    "avg_last_5_min": 0,
                    "peak_today": 0,
                    "status": "no_cameras",
                }

            # ------------------------------------------------------
            # 2️⃣ Current count (latest frame per camera)
            # ------------------------------------------------------
            # Subquery to get latest timestamp per camera
            subquery = (
                select(
                    CrowdFrame.camera_id,
                    func.max(CrowdFrame.captured_at).label("max_time")
                )
                .where(CrowdFrame.camera_id.in_(camera_ids))
                .group_by(CrowdFrame.camera_id)
                .subquery()
            )

            # Join to get the detected_count for each camera's latest frame
            latest_stmt = (
                select(func.sum(CrowdFrame.detected_count))
                .join(
                    subquery,
                    (CrowdFrame.camera_id == subquery.c.camera_id) &
                    (CrowdFrame.captured_at == subquery.c.max_time)
                )
            )

            latest_result = await session.execute(latest_stmt)
            current_count = latest_result.scalar() or 0

            # ------------------------------------------------------
            # 3️⃣ Average last 5 minutes
            # ------------------------------------------------------
            five_min_ago = now - timedelta(minutes=5)

            avg_stmt = (
                select(func.avg(CrowdFrame.detected_count))
                .where(
                    CrowdFrame.camera_id.in_(camera_ids),
                    CrowdFrame.captured_at >= five_min_ago
                )
            )

            avg_result = await session.execute(avg_stmt)
            avg_last_5_min = round(float(avg_result.scalar() or 0), 2)

            # ------------------------------------------------------
            # 4️⃣ Peak today
            # ------------------------------------------------------
            start_of_day = now.replace(
                hour=0, minute=0, second=0, microsecond=0)

            peak_stmt = (
                select(func.max(CrowdFrame.detected_count))
                .where(
                    CrowdFrame.camera_id.in_(camera_ids),
                    CrowdFrame.captured_at >= start_of_day
                )
            )

            peak_result = await session.execute(peak_stmt)
            peak_today = peak_result.scalar() or 0

            # ------------------------------------------------------
            # 5️⃣ Status logic
            # ------------------------------------------------------
            if current_count == 0:
                status = "empty"
            elif avg_last_5_min > 0 and current_count > avg_last_5_min * 2:
                status = "spike"
            elif avg_last_5_min > 0 and current_count < avg_last_5_min * 0.5:
                status = "drop"
            elif avg_last_5_min > current_count * 1.5:
                status = "fluctuating"
            else:
                status = "normal"

            logger.info(
                "Venue occupancy calculated",
                extra={
                    "venue_id": str(venue_id),
                    "current_count": current_count,
                    "status": status,
                }
            )

            return {
                "current_count": current_count,
                "avg_last_5_min": avg_last_5_min,
                "peak_today": peak_today,
                "status": status,
            }

        except Exception as e:
            logger.error(
                "Failed to calculate venue occupancy",
                extra={
                    "venue_id": str(venue_id),
                    "error": str(e),
                },
                exc_info=True,
            )
            raise
