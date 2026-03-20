"""
Laminar - Detection Repository
-------------------------------

Handles database operations for Detection model.
No business logic here. No commits - service layer controls transactions.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.detection import Detection


class DetectionRepository:
    """Data access layer for Detection."""

    async def create(
        self,
        db: AsyncSession,
        detection: Detection,
    ) -> Detection:
        """Create a single detection. No commit - service controls transaction."""
        db.add(detection)
        await db.flush()  # Flush to get ID, but don't commit
        await db.refresh(detection)
        return detection

    async def bulk_create(
        self,
        db: AsyncSession,
        detections: List[Detection],
    ) -> None:
        """Create multiple detections in one batch. No commit."""
        if not detections:
            return
        db.add_all(detections)
        await db.flush()  # Flush to DB but don't commit

    async def get_by_camera(
        self,
        db: AsyncSession,
        camera_id: UUID,
        since: Optional[datetime] = None,
        limit: int = 1000,
    ) -> List[Detection]:
        """Get detections for a camera, optionally filtered by time."""
        query = select(Detection).where(Detection.camera_id == camera_id)

        if since:
            query = query.where(Detection.detected_at >= since)

        query = query.order_by(Detection.detected_at.desc()).limit(limit)

        result = await db.execute(query)
        return result.scalars().all()

    async def get_by_label(
        self,
        db: AsyncSession,
        label: str,
        since: Optional[datetime] = None,
        limit: int = 1000,
    ) -> List[Detection]:
        """Get detections by label, optionally filtered by time."""
        query = select(Detection).where(Detection.label == label)

        if since:
            query = query.where(Detection.detected_at >= since)

        query = query.order_by(Detection.detected_at.desc()).limit(limit)

        result = await db.execute(query)
        return result.scalars().all()

    async def get_recent_by_camera(
        self,
        db: AsyncSession,
        camera_id: UUID,
        minutes: int = 5,
    ) -> List[Detection]:
        """Get detections from last N minutes for a camera."""
        since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        return await self.get_by_camera(db, camera_id, since=since)

    async def count_by_camera(
        self,
        db: AsyncSession,
        camera_id: UUID,
        since: Optional[datetime] = None,
    ) -> int:
        """Count detections for a camera."""
        query = select(func.count()).select_from(Detection).where(
            Detection.camera_id == camera_id
        )

        if since:
            query = query.where(Detection.detected_at >= since)

        result = await db.execute(query)
        count = result.scalar_one()
        return count or 0
