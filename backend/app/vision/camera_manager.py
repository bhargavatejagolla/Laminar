"""
Laminar - Camera Manager Utility
-------------------------------

Bridges the gap between Database Camera models and active Vision StreamWorkers.
Provides access to camera metadata and live stream processing objects.
"""

import asyncio
from typing import List, Optional, Union
from uuid import UUID
from sqlalchemy import select

from app.core.database import db_manager
from app.models.camera import Camera
from app.vision.manager import vision_manager
from app.vision.orchestrator import ORCHESTRATOR
from app.core.logging import get_logger

logger = get_logger(__name__)

class CameraManager:
    """
    Utility class for fetching cameras and their associated stream workers.
    """

    @staticmethod
    async def list_cameras() -> List[Camera]:
        """
        Fetch all active, non-deleted cameras from the database.
        
        Returns:
            List[Camera]: List of SQLAlchemy Camera model instances.
        """
        async with db_manager.session() as session:
            try:
                result = await session.execute(
                    select(Camera).where(Camera.deleted_at.is_(None))
                )
                return list(result.scalars().all())
            except Exception as e:
                logger.error(f"CameraManager: Failed to list cameras: {e}")
                return []

    @staticmethod
    def get_camera(camera_id: Union[str, UUID]) -> Optional[any]:
        """
        Retrieve the active StreamWorker or specialized worker for a giving camera ID.
        
        This is a synchronous call used by workers and endpoints to access live frame buffers.
        
        Args:
            camera_id: ID of the camera to retrieve.
            
        Returns:
            StreamWorker or specialized worker instance if active, else None.
        """
        if isinstance(camera_id, str):
            try:
                camera_id = UUID(camera_id)
            except ValueError:
                return None

        # Check main vision manager (Crowd intelligence)
        worker = vision_manager._workers.get(camera_id)
        if worker:
            return worker
            
        # Check specialized orchestrator (Smart City: Parking, Traffic, etc.)
        worker = ORCHESTRATOR._workers.get(camera_id)
        if worker:
            return worker
            
        return None

    @staticmethod
    async def get_camera_model(camera_id: Union[str, UUID]) -> Optional[Camera]:
        """
        Fetch a single Camera database model.
        """
        if isinstance(camera_id, str):
            try:
                camera_id = UUID(camera_id)
            except ValueError:
                return None

        async with db_manager.session() as session:
            return await session.get(Camera, camera_id)
