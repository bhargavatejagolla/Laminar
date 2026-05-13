"""
Laminar - Vision Orchestrator
-----------------------------

Orchestrates domain-specific AI processing for Smart City features.
Routes cameras to specialized detectors (Parking, Traffic, Incident).
Updates the Global State Store for real-time telemetry.
"""

import asyncio
from typing import Dict, Optional, Any, List
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy import select

from app.core.logging import get_logger
from app.core.database import db_manager
from app.models.camera import Camera
from app.models.venue import Venue, VenueDomain
from app.core.global_state import GLOBAL_STATE
from app.vision.stream_worker import StreamWorker
from app.vision.sources import create_camera_source
from app.vision.registry import camera_registry

logger = get_logger(__name__)


class VisionOrchestrator:
    """
    Manager for specialized Smart City AI pipelines.
    Runs separately from the main Crowd VisionManager to ensure zero interference.
    """

    def __init__(self, sync_interval: int = 5):
        self.sync_interval = sync_interval
        self._workers: Dict[UUID, Any] = {}
        self._running = False
        self._sync_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        if self._running:
            return
        
        logger.info("Starting VisionOrchestrator (Smart City Engine)")
        self._running = True
        self._sync_task = asyncio.create_task(self._sync_loop())

    async def stop(self) -> None:
        self._running = False
        if self._sync_task:
            self._sync_task.cancel()
            try:
                await self._sync_task
            except asyncio.CancelledError:
                pass
        
        # Stop all specialized workers
        for worker in self._workers.values():
            await worker.stop()
        self._workers.clear()
        logger.info("VisionOrchestrator stopped")

    async def _sync_loop(self) -> None:
        while self._running:
            try:
                await self._sync_cameras()
                await asyncio.sleep(self.sync_interval)
            except Exception as e:
                logger.error(f"Orchestrator sync error: {e}", exc_info=True)
                await asyncio.sleep(5)

    async def _sync_cameras(self) -> None:
        async with db_manager.session() as session:
            from sqlalchemy.orm import selectinload
            # Fetch cameras NOT in 'people' venues, eagerly load venue for domain check
            result = await session.execute(
                select(Camera)
                .options(selectinload(Camera.venue))
                .join(Venue).where(
                    Camera.is_active == True,
                    Camera.monitoring_enabled == True,
                    Camera.deleted_at.is_(None),
                    Venue.venue_type != VenueDomain.PEOPLE,
                    Venue.venue_type.isnot(None)
                )
            )
            cameras = result.scalars().all()
            
            # Map running workers
            active_ids = {c.id for c in cameras}
            running_ids = set(self._workers.keys())

            # Start new workers
            for camera in cameras:
                if camera.id not in running_ids:
                    await self._start_specialized_worker(camera)
            
            # Stop removed workers
            for cid in running_ids - active_ids:
                await self._stop_worker(cid)

    async def _start_specialized_worker(self, camera: Camera) -> None:
        try:
            # 0. Register camera globally to prevent contention
            if not camera_registry.register(camera.id):
                logger.warning(f"Aborting start for specialized camera {camera.id}: Already registered globally")
                return

            # Determine which detector to use based on venue_type
            venue_type = camera.venue.venue_type
            
            # Create source
            source = create_camera_source(
                source_type=camera.stream_type or "rtsp",
                source_identifier=camera.stream_url,
                width=camera.resolution_width or 640,
                height=camera.resolution_height or 480,
                target_fps=camera.fps or 5
            )
            
            # Start source
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, source.start)
            
            if venue_type == VenueDomain.PARKING:
                from app.vision.parking_worker import ParkingWorker
                worker = ParkingWorker(camera_id=camera.id, venue_id=camera.venue_id, source=source)
            elif venue_type == VenueDomain.TRAFFIC:
                from app.vision.traffic_worker import TrafficWorker
                worker = TrafficWorker(camera_id=camera.id, venue_id=camera.venue_id, source=source)
            elif venue_type == VenueDomain.INCIDENT:
                from app.vision.incident_worker import IncidentWorker
                worker = IncidentWorker(camera_id=camera.id, venue_id=camera.venue_id, source=source)
            else:
                logger.error(f"Unknown venue domain '{venue_type}' for camera {camera.id}")
                return

            await worker.start()
            self._workers[camera.id] = worker
            logger.info(f"Started {venue_type} worker for camera {camera.id}")

        except Exception as e:
            # Unregister on failure
            camera_registry.unregister(camera.id)
            logger.error(f"Failed to start specialized worker: {e}", exc_info=True)

    async def _stop_worker(self, camera_id: UUID) -> None:
        worker = self._workers.pop(camera_id, None)
        if worker:
            await worker.stop()
            camera_registry.unregister(camera_id)
            logger.info(f"Stopped specialized worker for camera {camera_id}")

# Instance
ORCHESTRATOR = VisionOrchestrator()
