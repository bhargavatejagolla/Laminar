"""
Laminar - Camera Source Abstraction Layer
------------------------------------------

Unified camera input layer supporting:
- Laptop webcam
- USB camera
- RTSP WiFi cameras
- CCTV RTSP/DVR streams
- Video files

Features:
- Auto-reconnect (RTSP with exponential backoff)
- Frame timeout protection
- Resolution control
- FPS limiting
- Frame quality checks
- Graceful shutdown
- Health monitoring
- Buffer management
"""

from abc import ABC, abstractmethod
from typing import Optional, Tuple, Dict, Any
from datetime import datetime, timedelta
from urllib.parse import urlparse
import threading
import time
import asyncio
import cv2
import numpy as np
from datetime import datetime,timezone

from app.core.logging import get_logger

import os
# Force low-latency ffmpeg settings for OpenCV
# timeout=5000000 µs = 5 s connect/read timeout — bad RTSP URLs fail in ~5s, not 30s
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp"
    "|probesize;32"
    "|analyzeduration;0"
    "|fflags;nobuffer"
    "|flags;low_delay"
    "|timeout;5000000"
    "|stimeout;5000000"
)

logger = get_logger(__name__)


# ==========================================================
# Base Abstract Camera Source
# ==========================================================

class CameraSource(ABC):
    """
    Abstract base class for all camera sources.
    
    Provides unified interface for:
    - Opening/closing capture
    - Reading frames with timeout
    - Auto-reconnection
    - Health monitoring
    - FPS control
    """

    def __init__(
        self,
        source: str | int,
        width: int = 640,
        height: int = 480,
        target_fps: Optional[float] = None,
        reconnect_interval: int = 5,
        timeout_seconds: int = 30,
        max_failures: int = 5,
        buffer_flush: bool = True,
        startup_grace_seconds: int = 30,
    ):
        """
        Initialize camera source.
        
        Args:
            source: Camera identifier (device index, URL, file path)
            width: Desired frame width
            height: Desired frame height
            target_fps: Limit processing to this FPS (None = unlimited)
            reconnect_interval: Seconds between reconnect attempts
            timeout_seconds: Seconds without frame to mark unhealthy
            max_failures: Consecutive failures before restart
            buffer_flush: Flush buffer on restart
        """
        self.source = source
        self.width = width
        self.height = height
        self.target_fps = target_fps
        self.reconnect_interval = reconnect_interval
        self.timeout_seconds = timeout_seconds
        self.max_failures = max_failures
        self.buffer_flush = buffer_flush
        self.startup_grace_seconds = startup_grace_seconds

        # Frame interval for FPS limiting
        self._frame_interval = 1.0 / target_fps if target_fps else 0
        self._last_read_time = 0

        # State tracking
        self._capture: Optional[cv2.VideoCapture] = None
        self._running = False
        self._last_frame_time: Optional[datetime] = None
        self._frame_failures = 0
        self._total_frames = 0
        self._dropped_frames = 0
        self._lock = threading.Lock()
        self._start_time: Optional[datetime] = None

    # ----------------------------------------------------------
    # Lifecycle
    # ----------------------------------------------------------

    def start(self) -> None:
        """Start video capture."""
        with self._lock:
            if self._running:
                return

            logger.info(
                "Starting camera source",
                extra_fields={
                    "source": str(self.source),
                    "type": self.get_type(),
                    "resolution": f"{self.width}x{self.height}",
                },
            )

            # Create capture
            self._capture = self._create_capture()
            self._configure_capture()

            # Reset state
            self._running = True
            self._last_frame_time = datetime.now(timezone.utc)
            self._frame_failures = 0
            self._start_time = datetime.now(timezone.utc)
            self._total_frames = 0
            self._dropped_frames = 0

            # Flush buffer if requested
            if self.buffer_flush:
                self._flush_buffer()

    def _create_capture(self) -> cv2.VideoCapture:
        """Create capture instance (override for RTSP)."""
        return cv2.VideoCapture(self.source)

    def _flush_buffer(self, frames: int = 10) -> None:
        """Clear stale frames from buffer."""
        if not self._capture:
            return

        for i in range(frames):
            self._capture.grab()
        logger.debug(f"Flushed {frames} frames from buffer")

    def stop(self) -> None:
        """Stop video capture and release resources."""
        with self._lock:
            if not self._running or not self._capture:
                return

            logger.info(
                "Stopping camera source",
                extra_fields={
                    "source": str(self.source),
                    "total_frames": self._total_frames,
                    "uptime_seconds": self._get_uptime(),
                },
            )

            self._capture.release()
            self._running = False
            self._capture = None

    async def restart(self) -> None:
        """Restart camera capture with exponential backoff."""
        with self._lock:
            logger.warning(
                "Restarting camera source",
                extra_fields={
                    "source": str(self.source),
                    "failures": self._frame_failures,
                },
            )

            self.stop()

            # Exponential backoff
            wait_time = min(self.reconnect_interval * (2 **
                            (self._frame_failures - self.max_failures)), 60)
            
        await asyncio.sleep(wait_time)
        self.start()

    # ----------------------------------------------------------
    # Frame Reading
    # ----------------------------------------------------------

    async def read(self) -> Optional[Tuple[bool, np.ndarray]]:
        """
        Read a single frame with FPS limiting and quality checks.
        
        Returns:
            (success, frame) or None if source not running
        """
        if not self._running or not self._capture:
            return None

        # FPS limiting
        if self.target_fps:
            elapsed = time.time() - self._last_read_time
            if elapsed < self._frame_interval:
                await asyncio.sleep(self._frame_interval - elapsed)

        # Read frame without blocking the async event loop
        try:
            loop = asyncio.get_event_loop()
            ret, frame = await loop.run_in_executor(None, self._capture.read)
        except Exception as e:
            logger.error(f"Error reading frame in executor: {e}")
            await self._handle_read_failure()
            return None
        
        self._last_read_time = time.time()

        if not ret or frame is None:
            await self._handle_read_failure()
            return None

        # Frame quality check
        if not self._is_frame_usable(frame):
            self._dropped_frames += 1
            logger.debug("Dropped unusable frame")
            return None

        # Success
        self._frame_failures = 0
        self._last_frame_time = datetime.now(timezone.utc)
        self._total_frames += 1

        # Resize if needed
        if frame.shape[1] != self.width or frame.shape[0] != self.height:
            frame = cv2.resize(frame, (self.width, self.height))

        return True, frame

    async def _handle_read_failure(self) -> None:
        """Handle frame read failure with auto-restart."""
        self._frame_failures += 1

        logger.warning(
            "Failed to read frame",
            extra_fields={
                "source": str(self.source),
                "failures": self._frame_failures,
                "max_failures": self.max_failures,
            },
        )

        if self._frame_failures >= self.max_failures:
            await self.restart()

    def _is_frame_usable(self, frame: np.ndarray) -> bool:
        """
        Check if frame is worth processing.
        Only rejects genuinely unusable frames (null, all-black, all-white).
        """
        if frame is None or frame.size == 0:
            return False

        # Check mean brightness — reject only truly broken frames
        mean_brightness = np.mean(frame)
        if mean_brightness < 2:   # Almost completely black (broken capture)
            return False
        if mean_brightness > 253:  # Blown-out / saturated
            return False

        # ✅ REMOVED low-variance check: it incorrectly rejected valid empty-room frames.
        # A static scene (no people) has low std but is a perfectly valid frame to process.

        return True

    # ----------------------------------------------------------
    # Configuration
    # ----------------------------------------------------------

    def _configure_capture(self) -> None:
        """Apply camera settings."""
        if not self._capture:
            return

        # Set resolution
        self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)

        # Optional: Reduce buffer size for lower latency
        self._capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    async def set_resolution(self, width: int, height: int) -> None:
        """Change resolution (applies on next start)."""
        self.width = width
        self.height = height
        if self._running:
            await self.restart()

    def set_fps_limit(self, fps: Optional[float]) -> None:
        """Change FPS limit."""
        self.target_fps = fps
        self._frame_interval = 1.0 / fps if fps else 0

    # ----------------------------------------------------------
    # Health Monitoring
    # ----------------------------------------------------------

    def _get_uptime(self) -> float:
        """Get uptime in seconds."""
        if not self._start_time:
            return 0
        return (datetime.now(timezone.utc) - self._start_time).total_seconds()

    def is_healthy(self) -> bool:
        """Check if camera is healthy."""
        if not self._running:
            return False

        # ✅ FIX: Startup grace period — newly started sources have no frames yet.
        # Give them startup_grace_seconds before requiring frames.
        if not self._last_frame_time or self._total_frames == 0:
            if self._start_time is not None:
                uptime = (datetime.now(timezone.utc) - self._start_time).total_seconds()
                if uptime < self.startup_grace_seconds:
                    return True  # Still in startup window, not yet unhealthy
            return False  # Exceeded grace period with no frames

        # Timeout check — frames were received before but stopped arriving
        elapsed = (datetime.now(timezone.utc) -
                   self._last_frame_time).total_seconds()
        if elapsed > self.timeout_seconds:
            logger.warning(
                "Camera timeout detected",
                extra_fields={
                    "source": str(self.source),
                    "elapsed_seconds": round(elapsed, 1),
                },
            )
            return False

        return True

    def get_status(self) -> Dict[str, Any]:
        """Return comprehensive health info."""
        return {
            "source": str(self.source),
            "type": self.get_type(),
            "running": self._running,
            "healthy": self.is_healthy(),
            "resolution": f"{self.width}x{self.height}",
            "target_fps": self.target_fps,
            "last_frame_time": (
                self._last_frame_time.isoformat() if self._last_frame_time else None
            ),
            "frame_failures": self._frame_failures,
            "total_frames": self._total_frames,
            "dropped_frames": self._dropped_frames,
            "uptime_seconds": round(self._get_uptime(), 1),
            "effective_fps": self._calculate_effective_fps(),
        }

    def _calculate_effective_fps(self) -> float:
        """Calculate actual FPS achieved."""
        uptime = self._get_uptime()
        if uptime < 1 or self._total_frames < 10:
            return 0.0
        return round(self._total_frames / uptime, 2)

    def get_camera_info(self) -> Dict[str, Any]:
        """Detect camera capabilities."""
        if not self._capture:
            return {}

        info = {
            "backend": self._capture.getBackendName(),
            "fps": self._capture.get(cv2.CAP_PROP_FPS),
            "codec": int(self._capture.get(cv2.CAP_PROP_FOURCC)),
            "brightness": self._capture.get(cv2.CAP_PROP_BRIGHTNESS),
            "contrast": self._capture.get(cv2.CAP_PROP_CONTRAST),
            "saturation": self._capture.get(cv2.CAP_PROP_SATURATION),
            "hue": self._capture.get(cv2.CAP_PROP_HUE),
            "gain": self._capture.get(cv2.CAP_PROP_GAIN),
            "exposure": self._capture.get(cv2.CAP_PROP_EXPOSURE),
        }

        # Convert codec to readable string
        if info["codec"]:
            codec_bytes = int(info["codec"]).to_bytes(4, 'little')
            info["codec_str"] = codec_bytes.decode('utf-8', errors='ignore')

        return info

    # ----------------------------------------------------------
    # Abstract Methods
    # ----------------------------------------------------------

    @abstractmethod
    def get_type(self) -> str:
        """Return camera type name."""
        pass


# ==========================================================
# Webcam / USB Camera
# ==========================================================

class WebcamSource(CameraSource):
    """
    Local webcam or USB camera.

    Examples:
        source=0  # First webcam
        source=1  # Second USB camera

    Windows note: Uses DirectShow (CAP_DSHOW) instead of MSMF to avoid
    -1072873821 / OnReadSample errors under heavy CPU load (e.g. YOLO).
    """

    def __init__(self, device_index: int = 0, **kwargs):
        """
        Initialize webcam.

        Args:
            device_index: Camera device number (0, 1, 2...)
            **kwargs: Base class arguments
        """
        # Increase timeout so a single slow YOLO frame doesn't trigger a restart
        kwargs.setdefault("timeout_seconds", 60)
        kwargs.setdefault("startup_grace_seconds", 45)
        super().__init__(device_index, **kwargs)

    def _create_capture(self) -> cv2.VideoCapture:
        """Use DirectShow on Windows to avoid MSMF instability."""
        import platform
        if platform.system() == "Windows":
            cap = cv2.VideoCapture(self.source, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(self.source)
        return cap

    def get_type(self) -> str:
        return "webcam"


# ==========================================================
# RTSP Camera (WiFi / CCTV / DVR)
# ==========================================================

class RTSPSource(CameraSource):
    """
    RTSP-based IP camera with authentication support.
    
    Examples:
        rtsp://192.168.1.10:554/stream
        rtsp://username:password@192.168.1.10:554/stream
    """

    def __init__(
        self,
        url: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize RTSP camera.
        
        Args:
            url: RTSP URL (with or without auth)
            username: Optional username for authentication
            password: Optional password for authentication
            **kwargs: Base class arguments
        """
        # Inject auth into URL if provided
        if username and password:
            parsed = urlparse(url)
            auth_url = f"{parsed.scheme}://{username}:{password}@{parsed.netloc}{parsed.path}"
            if parsed.query:
                auth_url += f"?{parsed.query}"
            url = auth_url

        super().__init__(url, **kwargs)
        self._current_frame = None
        self._frame_ready = False
        self._buffer_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread = None

    def get_type(self) -> str:
        return "rtsp"

    def _create_capture(self) -> cv2.VideoCapture:
        """Use FFMPEG backend with optimized parameters."""
        cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            cap.release()
            raise ConnectionError(f"Cannot open RTSP stream: {self._mask_url(str(self.source))}")
        return cap

    def start(self) -> None:
        """Override with RTSP-specific optimizations."""
        with self._lock:
            if self._running:
                return

            logger.info(
                "Starting RTSP camera (Threaded)",
                extra_fields={
                    "url": self._mask_url(str(self.source)),
                    "resolution": f"{self.width}x{self.height}",
                },
            )

            # _create_capture already raises ConnectionError if stream isn't reachable
            self._capture = self._create_capture()

            # RTSP-specific optimizations
            self._capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimal buffer
            if hasattr(cv2, 'CAP_PROP_RTSP_TRANSPORT'):
                self._capture.set(cv2.CAP_PROP_RTSP_TRANSPORT, 0)  # TCP

            self._configure_capture()
            self._running = True
            self._last_frame_time = None  # No frames received yet — use startup grace period
            self._total_frames = 0
            self._frame_failures = 0
            self._start_time = datetime.now(timezone.utc)

            # Start background thread for continuous read
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._update_loop, daemon=True)
            self._thread.start()
            # ✅ FIX: Do NOT call _flush_buffer() here — the background thread is already
            # reading from the same capture object, causing lock contention.

    def _update_loop(self):
        """Continuously grab frames to clear FFMPEG buffer and eliminate lag."""
        while not self._stop_event.is_set():
            with self._lock:
                cap = self._capture
                running = self._running
                
            if not running or cap is None:
                time.sleep(0.05)
                continue
                
            try:
                ret, frame = cap.read()
            except Exception as e:
                logger.error(f"RTSP threading read error: {e}")
                ret, frame = False, None
                
            if not ret or frame is None:
                self._frame_failures += 1
                logger.warning(
                    "RTSP thread failed to read frame",
                    extra_fields={
                        "source": str(self.source),
                        "failures": self._frame_failures,
                    }
                )
                # Exponential backoff for thread loop to prevent CPU spin during disconnect
                backoff = min(1.0, 0.05 * (2 ** self._frame_failures))
                time.sleep(backoff)
                continue
                
            self._frame_failures = 0
            with self._buffer_lock:
                self._current_frame = frame
                self._frame_ready = True
                self._last_frame_time = datetime.now(timezone.utc)
                self._total_frames += 1

            # Let cv2.read() naturally block on the network socket. 
            # Adding artificial sleep here causes FFMPEG buffers to fill and latency to skyrocket.

    def stop(self) -> None:
        """Stop background thread properly."""
        self._stop_event.set()
        if self._thread and threading.current_thread() != self._thread:
            self._thread.join(timeout=1.0)
            self._thread = None
        super().stop()
        
    async def read(self) -> Optional[Tuple[bool, np.ndarray]]:
        """Retrieve highest-freshness frame from thread buffer."""
        if not self._running:
            return None

        # FPS limiting
        if self.target_fps:
            elapsed = time.time() - self._last_read_time
            if elapsed < self._frame_interval:
                await asyncio.sleep(self._frame_interval - elapsed)

        self._last_read_time = time.time()
        
        frame = None
        with self._buffer_lock:
            if self._frame_ready and self._current_frame is not None:
                frame = self._current_frame.copy()
                self._frame_ready = False
                
        if frame is None:
            return None

        # Frame quality check
        if not self._is_frame_usable(frame):
            self._dropped_frames += 1
            logger.debug("Dropped unusable frame")
            return None

        # Success!
        self._last_frame_time = datetime.now(timezone.utc)
        self._total_frames += 1

        # Resize if needed
        if frame.shape[1] != self.width or frame.shape[0] != self.height:
            frame = cv2.resize(frame, (self.width, self.height))

        return True, frame

    def _mask_url(self, url: str) -> str:
        """Mask password in URL for logging."""
        if '@' in url:
            # Hide password
            parts = url.split('@')
            auth_part = parts[0].split('://')[1]
            if ':' in auth_part:
                return f"{parts[0].split('://')[0]}://***:***@{parts[1]}"
        return url




# ==========================================================
# Video File Source
# ==========================================================

class VideoFileSource(CameraSource):
    """
    Video file playback with loop option.
    
    Examples:
        source="video.mp4"
        source="/path/to/video.avi"
    """

    def __init__(
        self,
        file_path: str,
        loop: bool = True,
        **kwargs
    ):
        """
        Initialize video file source.
        
        Args:
            file_path: Path to video file
            loop: Restart video when finished
            **kwargs: Base class arguments
        """
        super().__init__(file_path, **kwargs)
        self.loop = loop

    async def read(self):
        """Read with loop support."""
        result = await super().read()

        # Handle end of video
        if result is None and self.loop:
            logger.info("Restarting video file (loop enabled)")
            await self.restart()
            return await super().read()

        return result

    def get_type(self) -> str:
        return "video_file"


# ==========================================================
# Factory Function
# ==========================================================

def create_camera_source(
    source_type: str,
    source_identifier: str | int,
    **kwargs
) -> CameraSource:
    """
    Factory function to create appropriate camera source.
    
    Args:
        source_type: "webcam", "rtsp", "cctv", "video"
        source_identifier: Device index, URL, or file path
        **kwargs: Additional arguments
    
    Returns:
        Configured CameraSource instance
    
    Raises:
        ValueError: If source_type is unknown
    """
    source_type = source_type.lower()

    if source_type not in ("rtsp", "cctv"):
        kwargs.pop("username", None)
        kwargs.pop("password", None)

    if source_type == "device":
        return WebcamSource(
            int(source_identifier) if isinstance(source_identifier, str)
            else source_identifier,
            **kwargs
        )

    elif source_type in ("rtsp", "cctv"):
        return RTSPSource(str(source_identifier), **kwargs)

    elif source_type == "video":
        return VideoFileSource(str(source_identifier), **kwargs)

    else:
        raise ValueError(f"Unknown camera source type: {source_type}")
