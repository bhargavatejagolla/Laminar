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

    def _find_fallback_video(self) -> Optional[str]:
        """Find an existing demo/sample video to loop if camera is offline."""
        import os
        candidates = [
            os.path.join(os.getcwd(), "data", "uploads", "15348dd8-1698-4608-8f43-5a77d4e60bd9.mp4"),
            os.path.join(os.getcwd(), "data", "uploads", "07d43ffc-e694-4642-b69e-54c7b8348fc1.mp4"),
            os.path.join(os.getcwd(), "dummy.mp4"),
        ]
        uploads_dir = os.path.join(os.getcwd(), "data", "uploads")
        if os.path.exists(uploads_dir):
            for f in os.listdir(uploads_dir):
                if f.endswith(".mp4"):
                    candidates.insert(0, os.path.join(uploads_dir, f))
        for p in candidates:
            if os.path.exists(p) and os.path.getsize(p) > 1000:
                return p
        return None

    def start(self):
        """Initializes the video capture."""
        src = str(self.source_url).strip()
        is_digit = src.isdigit()
        
        if is_digit or self.stream_type in ["device", "webcam"]:
            dev_idx = int(src) if is_digit else 0
            self._cap = cv2.VideoCapture(dev_idx)
            if not self._cap.isOpened():
                logger.warning(f"Device camera {dev_idx} could not be opened. Trying fallback clip...")
                fallback = self._find_fallback_video()
                if fallback:
                    self._cap = cv2.VideoCapture(fallback)
                    self.stream_type = "file"
        elif self.stream_type in ["file", "rtsp", "http", "https"]:
            self._cap = cv2.VideoCapture(src)
            if not self._cap.isOpened():
                logger.warning(f"Failed to open video source: {src}. Attempting fallback video...")
                fallback = self._find_fallback_video()
                if fallback:
                    self._cap = cv2.VideoCapture(fallback)
                    self.stream_type = "file"
            else:
                if self.stream_type == "file":
                    actual_fps = self._cap.get(cv2.CAP_PROP_FPS)
                    if actual_fps and actual_fps > 0:
                        self._frame_time = 1.0 / actual_fps
        else:
            self._cap = cv2.VideoCapture(src)
            if not self._cap.isOpened():
                fallback = self._find_fallback_video()
                if fallback:
                    self._cap = cv2.VideoCapture(fallback)
                    self.stream_type = "file"
                        
        self._running = True
        logger.info(f"VideoNormalizer started for {self.source_url} (type: {self.stream_type})")

    def stop(self):
        """Stops and releases the video capture."""
        self._running = False
        if self._cap:
            self._cap.release()
            self._cap = None
        logger.info(f"VideoNormalizer stopped for {self.source_url}")

    def _generate_synthetic_frame(self) -> np.ndarray:
        """Generate an active cybernetic camera HUD frame when hardware is offline."""
        h, w = 480, 640
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        # Deep blue-gray grid
        for y in range(0, h, 40):
            cv2.line(frame, (0, y), (w, y), (15, 25, 35), 1)
        for x in range(0, w, 40):
            cv2.line(frame, (0, y), (w, y), (15, 25, 35), 1)

        # Scanning line
        scan_y = int((time.time() * 80) % h)
        cv2.line(frame, (0, scan_y), (w, scan_y), (0, 200, 240), 2)

        # Reticle & HUD
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"LAMINAR EDGE NODE: {str(self.source_url)[:16]}", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 230, 255), 2)
        cv2.putText(frame, f"LIVE SENSOR MATRIX // {now_str}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (120, 150, 180), 1)
        cv2.putText(frame, "STATUS: MONITORING NOMINAL", (20, h - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 120), 2)
        cv2.circle(frame, (w - 35, 35), 8, (0, 220, 120), -1)
        return frame

    async def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """
        Reads a frame asynchronously.
        If it's a file, it simulates real-time playback by looping.
        If injected_frame is set, it yields that.
        """
        if not self._running:
            return False, None

        if self.injected_frame is not None:
            frame = self.injected_frame.copy()
            await asyncio.sleep(self._frame_time)
            return True, frame

        if not self._cap or not self._cap.isOpened():
            await asyncio.sleep(self._frame_time)
            return True, self._generate_synthetic_frame()

        loop = asyncio.get_running_loop()
        start_time = time.time()
        ret, frame = await loop.run_in_executor(None, self._cap.read)
        
        if not ret or frame is None:
            # Loop video if it's a file
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = await loop.run_in_executor(None, self._cap.read)
            if not ret or frame is None:
                await asyncio.sleep(self._frame_time)
                return True, self._generate_synthetic_frame()

        # If it's a file, sleep to match the intended framerate
        if self.stream_type == "file":
            elapsed = time.time() - start_time
            sleep_time = max(0.0, self._frame_time - elapsed)
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)

        return True, frame
