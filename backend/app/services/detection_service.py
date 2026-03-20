"""
Laminar - Detection Service
----------------------------

Business logic layer for Detection domain.
Validates and coordinates repository operations.
Service controls transactions, repository handles data access.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.detection import Detection
from app.repositories.detection_repository import DetectionRepository
from app.core.logging import get_logger

logger = get_logger(__name__)


class DetectionService:
    """Service layer for detection operations."""

    def __init__(self):
        self.repo = DetectionRepository()

    async def create_detection(
        self,
        db: AsyncSession,
        camera_id: UUID,
        label: str,
        confidence: float,
        x_min: float,
        y_min: float,
        x_max: float,
        y_max: float,
        model_name: Optional[str] = None,
    ) -> Optional[Detection]:
        """
        Create a single detection with validation.
        Does NOT commit - caller must commit transaction.
        
        Returns:
            Detection if successful, None if validation fails
        """
        try:
            detection = Detection(
                camera_id=camera_id,
                label=label,
                confidence=confidence,
                x_min=x_min,
                y_min=y_min,
                x_max=x_max,
                y_max=y_max,
                model_name=model_name,
                detected_at=datetime.now(timezone.utc),
            )

            # Validate before saving
            errors = detection.validate()
            if errors:
                logger.warning(
                    "Detection validation failed",
                    extra={
                        "camera_id": str(camera_id),
                        "errors": errors,
                        "label": label,
                    }
                )
                return None

            return await self.repo.create(db, detection)

        except Exception as e:
            logger.error(
                "Failed to create detection",
                extra={
                    "camera_id": str(camera_id),
                    "error": str(e),
                    "label": label,
                }
            )
            return None

    async def bulk_create_detections(
        self,
        db: AsyncSession,
        detections: List[Detection],
    ) -> int:
        """
        Create multiple detections in batch.
        Does NOT commit - caller must commit transaction.
        
        Returns:
            Number of valid detections created
        """
        if not detections:
            return 0

        # Validate all detections
        valid_detections = []
        for detection in detections:
            errors = detection.validate()
            if not errors:
                valid_detections.append(detection)
            else:
                logger.warning(
                    "Skipping invalid detection in bulk create",
                    extra={
                        "camera_id": str(detection.camera_id),
                        "errors": errors,
                        "label": detection.label,
                    }
                )

        if valid_detections:
            await self.repo.bulk_create(db, valid_detections)
            logger.info(
                "Bulk created detections",
                extra={
                    "total": len(detections),
                    "valid": len(valid_detections),
                    "skipped": len(detections) - len(valid_detections),
                }
            )

        return len(valid_detections)

    async def get_camera_detections(
        self,
        db: AsyncSession,
        camera_id: UUID,
        minutes: Optional[int] = None,
        limit: int = 1000,
    ) -> List[Detection]:
        """
        Get detections for a camera.
        
        Args:
            camera_id: UUID of the camera
            minutes: If provided, get detections from last N minutes
            limit: Maximum number of detections to return
        """
        since = None
        if minutes:
            since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

        return await self.repo.get_by_camera(db, camera_id, since=since, limit=limit)

    async def get_detections_by_label(
        self,
        db: AsyncSession,
        label: str,
        minutes: Optional[int] = None,
        limit: int = 1000,
    ) -> List[Detection]:
        """
        Get detections by label across all cameras.
        
        Useful for analytics like "all people detections in last hour"
        """
        since = None
        if minutes:
            since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

        return await self.repo.get_by_label(db, label, since=since, limit=limit)

    async def get_detection_count(
        self,
        db: AsyncSession,
        camera_id: UUID,
        minutes: Optional[int] = None,
    ) -> int:
        """Get count of detections for a camera."""
        since = None
        if minutes:
            since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

        return await self.repo.count_by_camera(db, camera_id, since=since)
