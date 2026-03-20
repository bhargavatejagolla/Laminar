import os
from datetime import datetime, timezone
from uuid import UUID
import cv2
import numpy as np
import asyncio
from typing import List

from app.core.database import db_manager
from app.core.logging import get_logger
from app.models.evidence_clip import EvidenceClip

logger = get_logger(__name__)

# Use the backend/storage/clips folder
CLIPS_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage", "clips"))

class EvidenceClipService:
    def __init__(self):
        # Ensure clips directory exists
        os.makedirs(CLIPS_DIR, exist_ok=True)

    async def create_clip_record(self, session, camera_id: UUID) -> EvidenceClip:
        """Create a placeholder record in DB while recording."""
        now = datetime.now(timezone.utc)
        
        # Generate a unique path
        timestamp_str = now.strftime("%Y%m%d_%H%M%S")
        filename = f"clip_{camera_id}_{timestamp_str}.mp4"
        file_path = os.path.join(CLIPS_DIR, filename)

        clip = EvidenceClip(
            camera_id=camera_id,
            file_path=file_path,
            duration_seconds=0,
            status="recording",
        )
        session.add(clip)
        await session.flush()
        return clip

    async def save_frames_to_disk(
        self,
        clip_id: UUID,
        file_path: str,
        frames: List[np.ndarray],
        fps: float,
    ) -> None:
        """Save a list of numpy frames as an MP4 clip."""
        if not frames:
            logger.error("No frames provided for clip generation.")
            await self._update_status(clip_id, "failed", duration=0)
            return

        try:
            # Run the heavy video encoding in a separate thread to not block async loops
            await asyncio.to_thread(self._write_video, file_path, frames, fps)
            
            duration = len(frames) / max(fps, 1.0)
            await self._update_status(clip_id, "completed", duration=int(duration))
            
            logger.info(f"Successfully saved {len(frames)} frames to {file_path}")
            
        except Exception as e:
            logger.error(f"Failed to save video clip: {e}")
            await self._update_status(clip_id, "failed", duration=0)

    def _write_video(self, file_path: str, frames: List[np.ndarray], fps: float):
        """Blocking function to write video using OpenCV."""
        if not frames:
            return
            
        height, width, _ = frames[0].shape
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        
        # cv2 requires integer fps in some builds, fallback if needed
        fps_out = max(1.0, float(fps))
        
        writer = cv2.VideoWriter(file_path, fourcc, fps_out, (width, height))
        for frame in frames:
            writer.write(frame)
        writer.release()

    async def _update_status(self, clip_id: UUID, status: str, duration: int):
        """Update the database status of the clip asynchronously."""
        async with db_manager.session() as session:
            from sqlalchemy import select
            stmt = select(EvidenceClip).where(EvidenceClip.id == clip_id)
            result = await session.execute(stmt)
            clip = result.scalar_one_or_none()
            
            if clip:
                clip.status = status
                clip.duration_seconds = duration
                if status == "completed":
                    clip.completed_at = datetime.now(timezone.utc)
                await session.commit()
