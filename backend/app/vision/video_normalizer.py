import cv2
import asyncio
import time
from typing import Tuple, Optional
import numpy as np

from app.core.logging import get_logger

logger = get_logger(__name__)


class VideoNormalizer:
    """
    Unified video ingestion pipeline.
    Handles both live RTSP streams and static uploaded MP4 files,
    providing a consistent async read() interface.
    """

    def __init__(self, source_url: str, stream_type: str = "rtsp", target_fps: float = 30.0):
        self.source_url = source_url
        self.stream_type = stream_type.lower()
        self.target_fps = target_fps
        self._cap: Optional[cv2.VideoCapture] = None
        self._running = False
        self._frame_time = 1.0 / self.target_fps if self.target_fps > 0 else 0.033
        
        # Injected frame for HTTP-based pseudo-streaming (uploads)
        self.injected_frame: Optional[np.ndarray] = None

    def start(self):
        """Initializes the video capture."""
        if self.stream_type in ["file", "rtsp", "http", "https"]:
            self._cap = cv2.VideoCapture(self.source_url)
            if not self._cap.isOpened():
                logger.error(f"Failed to open video source: {self.source_url}")
            else:
                # Try to get actual FPS from source if it's a file
                if self.stream_type == "file":
                    actual_fps = self._cap.get(cv2.CAP_PROP_FPS)
                    if actual_fps and actual_fps > 0:
                        self._frame_time = 1.0 / actual_fps
                        
        self._running = True
        logger.info(f"VideoNormalizer started for {self.source_url} (type: {self.stream_type})")

    def stop(self):
        """Stops and releases the video capture."""
        self._running = False
        if self._cap:
            self._cap.release()
            self._cap = None
        logger.info(f"VideoNormalizer stopped for {self.source_url}")

    async def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """
        Reads a frame asynchronously.
        If it's a file, it simulates real-time playback by sleeping.
        If injected_frame is set, it yields that.
        """
        if not self._running:
            return False, None

        if self.injected_frame is not None:
            # Yield the injected frame, then clear it to wait for the next push
            # Alternatively, yield it constantly if it's a static image
            frame = self.injected_frame.copy()
            await asyncio.sleep(self._frame_time)
            return True, frame

        if not self._cap or not self._cap.isOpened():
            await asyncio.sleep(1.0)
            return False, None

        loop = asyncio.get_running_loop()
        
        # Read frame in a background thread to avoid blocking the async event loop
        start_time = time.time()
        ret, frame = await loop.run_in_executor(None, self._cap.read)
        
        if not ret:
            if self.stream_type == "file":
                # Loop video if it's a file
                self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = await loop.run_in_executor(None, self._cap.read)
                if not ret:
                    return False, None
            else:
                return False, None

        # If it's a file, sleep to match the intended framerate
        if self.stream_type == "file":
            elapsed = time.time() - start_time
            sleep_time = max(0.0, self._frame_time - elapsed)
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)

        return True, frame
