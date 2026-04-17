"""
Laminar - Vision Manager
------------------------

Orchestrates multiple StreamWorkers with database synchronization.

Responsibilities:
- Sync cameras from database
- Start workers for active cameras
- Stop workers for disabled cameras
- Monitor worker health with auto-restart
- Rate-limit restarts to prevent thrashing
- Provide aggregated system status
- Support demo mode for testing
- Graceful shutdown
- Universal camera source support (webcam, USB, IP, CCTV, video files)

Architecture:
Database Cameras
    ↓
VisionManager
    ↓
Multiple StreamWorkers
    ↓
Full AI Pipeline
"""

import asyncio
import cv2
from typing import Dict, Optional, Any, List, Union
from uuid import UUID
from datetime import datetime, timedelta, timezone
from collections import defaultdict

from sqlalchemy import select

import app.core.database as database
from app.core.logging import get_logger
from app.core.database import db_manager
from app.models.camera import Camera
from app.vision.stream_worker import StreamWorker
from app.vision.detector import detector
from app.vision.sources import create_camera_source, CameraSource

logger = get_logger(__name__)


# ==========================================================
# Universal Camera Opener
# ==========================================================

def open_camera(source: Union[str, int], target_fps: int = 5) -> Optional[cv2.VideoCapture]:
    """
    Universal camera opener that works with any source type.
    
    Supports:
    - Laptop webcam (0, 1, etc.)
    - USB cameras (1, 2, etc.)
    - IP cameras (rtsp://, http://)
    - CCTV streams (rtsp://)
    - Video files (mp4, avi, etc.)
    - Network streams (any valid URL)
    
    Args:
        source: Camera index (int) or URL/path (str)
        target_fps: Target FPS for the stream
        
    Returns:
        OpenCV VideoCapture object or None if failed
    """
    try:
        # Handle numeric camera indices (webcam, USB cameras)
        if isinstance(source, str) and source.isdigit():
            source = int(source)

        # Create capture object
        import sys
        
        # Handle Network Streams specially (RTSP, HTTP)
        if isinstance(source, str) and (source.startswith("rtsp://") or source.startswith("http://") or source.startswith("https://") or source.startswith("rtmp://")):
            # Explicitly force FFMPEG for network streams to avoid MSMF/DirectShow parsing issues
            cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        # Handle numeric camera indices (webcam, USB cameras)
        elif isinstance(source, int) and sys.platform == "win32":
            # Use CAP_DSHOW on Windows to avoid MSMF errors with multiple webcams
            cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(source)

        # Test if opened successfully
        if not cap.isOpened():
            logger.error(f"Failed to open camera source: {source}")
            return None

        # Performance optimizations
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency
        
        # NOTE: Only forcefully set FPS for local devices, for RTSP/FFMPEG modifying FPS can break the stream decoder
        if isinstance(source, int):
            cap.set(cv2.CAP_PROP_FPS, target_fps)

        # Optional: Set resolution if supported
        # cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        # cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        logger.info(
            "Successfully opened camera source",
            extra={
                "source": str(source),
                "target_fps": target_fps
            }
        )
        return cap

    except Exception as e:
        logger.error(
            "Failed to open camera source",
            extra={
                "source": str(source),
                "error": str(e)
            },
            exc_info=True
        )
        return None


class VisionManager:
    """
    Central orchestrator for all camera stream workers.

    Features:
    - Automatic DB synchronization
    - Worker health monitoring with auto-restart
    - Rate-limited restarts to prevent thrashing
    - Universal camera source support
    - Demo mode for testing
    - Comprehensive health API
    - Graceful shutdown
    """

    def __init__(
        self,
        sync_interval: int = 10,
        health_check_interval: int = 15,
        max_restarts_per_hour: int = 5,
        max_fps: int = 240,  # Unlocked max FPS for high-performance streams
    ):
        """
        Initialize vision manager.

        Args:
            sync_interval: Seconds between DB camera sync
            health_check_interval: Seconds between health checks
            max_restarts_per_hour: Max worker restarts per hour
            max_fps: Maximum FPS for any camera (CPU protection)
        """
        self.sync_interval = sync_interval
        self.health_check_interval = health_check_interval
        self.max_restarts_per_hour = max_restarts_per_hour
        self.max_fps = max_fps

        # State
        self._workers: Dict[UUID, StreamWorker] = {}
        self._running = False
        self._sync_task: Optional[asyncio.Task] = None
        self._health_task: Optional[asyncio.Task] = None
        self._start_time: Optional[datetime] = None
        self._demo_mode = False

        # Restart tracking
        self._restart_attempts: Dict[UUID, List[datetime]] = defaultdict(list)

        # Track worker configurations for change detection
        self._worker_configs: Dict[UUID, Dict[str, Any]] = {}

        # Track last sync time for health endpoint
        self._last_sync_time: Optional[str] = None

        # Per-camera backoff: Dict[UUID, datetime] tracking when a camera last failed to connect
        # This prevents the sync loop from constantly retrying bad RTSP URLs and blocking
        self._failed_cameras: Dict[UUID, datetime] = {}
        self._backoff_duration = timedelta(seconds=60)

    # ==========================================================
    # Lifecycle
    # ==========================================================

    async def start(self) -> None:
        """Start manager and background tasks."""
        if self._running:
            return

        logger.info("Starting VisionManager")
        self._running = True
        self._start_time = datetime.now(timezone.utc)

        # Start periodic tasks
        self._sync_task = asyncio.create_task(self._sync_loop())
        self._health_task = asyncio.create_task(self._health_loop())

    async def stop(self) -> None:
        """Stop all workers and background tasks gracefully."""
        if not self._running:
            return

        logger.info(
            "Stopping VisionManager",
            extra={"active_workers": len(self._workers)}
        )

        self._running = False

        # Cancel background tasks
        tasks = []
        if self._sync_task:
            tasks.append(self._sync_task)
        if self._health_task:
            tasks.append(self._health_task)

        for task in tasks:
            task.cancel()

        await asyncio.gather(*tasks, return_exceptions=True)

        # Stop all workers
        if self._workers:
            logger.info(f"Stopping {len(self._workers)} workers")
            await asyncio.gather(
                *[worker.stop() for worker in self._workers.values()],
                return_exceptions=True
            )
            self._workers.clear()

        logger.info("VisionManager stopped")

    # ==========================================================
    # Database Sync Loop
    # ==========================================================

    async def _sync_loop(self) -> None:
        """Periodically sync cameras from database."""
        while self._running:
            try:
                if not self._demo_mode:  # Skip sync in demo mode
                    await self._sync_cameras()
                    # Record last successful sync for health endpoint
                    self._last_sync_time = datetime.now(
                        timezone.utc).isoformat()
                await asyncio.sleep(self.sync_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(
                    "VisionManager sync error",
                    extra={"error": str(e)},
                    exc_info=True,
                )
                await asyncio.sleep(5)

    async def _sync_cameras(self) -> None:
        """Sync DB camera state with active workers."""

        try:
            # Use db_manager to correctly obtain session
            from app.core.database import db_manager
            
            async with db_manager.session() as session:
                # Get active cameras from DB
                result = await session.execute(
                    select(Camera).where(
                        Camera.is_active == True,
                        Camera.monitoring_enabled == True,
                        Camera.deleted_at.is_(None),
                    )
                )
                cameras = result.scalars().all()
                
                # Filter out cameras in backoff period
                now = datetime.now(timezone.utc)
                valid_cameras = []
                for cam in cameras:
                    if cam.id in self._failed_cameras:
                        if now - self._failed_cameras[cam.id] < self._backoff_duration:
                            logger.debug(f"SYNC: Skipping camera {cam.id} (in backoff)")
                            continue
                        else:
                            # Backoff expired
                            del self._failed_cameras[cam.id]
                    valid_cameras.append(cam)
                
                logger.debug(f"SYNC: Found {len(valid_cameras)} active cameras (filtered {len(cameras) - len(valid_cameras)} in backoff)")
                cameras = valid_cameras
        except Exception as e:
            logger.error(f"Failed to sync cameras from database: {e}", exc_info=True)
            return

        active_camera_ids = {camera.id for camera in cameras}
        running_camera_ids = set(self._workers.keys())

        # Start new or update changed cameras
        for camera in cameras:
            config = self._camera_to_config(camera)
            
            if camera.id not in running_camera_ids:
                logger.info(f"Starting worker for new camera {camera.id}")
                await self._start_worker(camera)
                self._worker_configs[camera.id] = config
            else:
                # Check for config changes
                old_config = self._worker_configs.get(camera.id)
                if old_config and self._config_changed(old_config, config):
                    logger.info(f"Config changed for camera {camera.id}, restarting worker")
                    await self._stop_worker(camera.id)
                    await self._start_worker(camera)
                    self._worker_configs[camera.id] = config

        # Stop removed/disabled cameras
        for camera_id in running_camera_ids - active_camera_ids:
            await self._stop_worker(camera_id)
            if camera_id in self._worker_configs:
                del self._worker_configs[camera_id]

    def _config_changed(self, old: Dict[str, Any], new: Dict[str, Any]) -> bool:
        """Deep compare of two configurations."""
        relevant_keys = ["source", "target_fps", "width", "height", "username", "password", "stream_type"]
        for key in relevant_keys:
            if old.get(key) != new.get(key):
                logger.debug(f"Config change detected for key '{key}': {old.get(key)} -> {new.get(key)}")
                return True
        return False

    # ==========================================================
    # Worker Control with Universal Camera Support
    # ==========================================================

    def _camera_to_config(self, camera: Camera) -> Dict[str, Any]:
        """Convert camera model to source configuration."""

        # Determine source identifier based on stream_type
        if camera.stream_type in ["device", "usb", "webcam"]:
            # Convert to int for device indices with safety
            try:
                source_identifier = int(camera.stream_url or 0)
            except ValueError:
                logger.warning(
                    f"Invalid device index for camera {camera.id}, using default 0",
                    extra={"camera_id": str(camera.id),
                           "stream_url": camera.stream_url}
                )
                source_identifier = 0

        elif camera.stream_type in ["rtsp", "http", "https", "rtmp"]:
            if not camera.stream_url:
                raise ValueError("Stream URL required for network streams")
            source_identifier = camera.stream_url

        elif camera.stream_type == "file":
            if not camera.stream_url:
                raise ValueError("File path required for file stream")
            source_identifier = camera.stream_url

        elif camera.stream_type == "cctv":
            # CCTV typically uses RTSP
            if not camera.stream_url:
                raise ValueError("Stream URL required for CCTV")
            source_identifier = camera.stream_url

        else:
            # Default to treating as direct source (works with universal opener)
            try:
                source_identifier = int(camera.stream_url) if camera.stream_url and camera.stream_url.isdigit(
                ) else (camera.stream_url or 0)
            except (ValueError, TypeError):
                source_identifier = 0

        # Use specific camera FPS or default to high performance 120
        target_fps = camera.fps or 120
        if target_fps > self.max_fps:
            logger.info(
                f"Reducing FPS from {target_fps} to {self.max_fps} for camera {camera.id} (Hardware limits)",
                extra={"camera_id": str(camera.id)}
            )
            target_fps = self.max_fps

        return {
            "source_type": camera.stream_type,
            "source_identifier": source_identifier,
            "width": camera.resolution_width or 640,
            "height": camera.resolution_height or 480,
            "target_fps": target_fps,
            "username": camera.username,
            "password": camera.password,
        }

    def _create_capture_with_universal_opener(self, config: Dict[str, Any]) -> Optional[cv2.VideoCapture]:
        """
        Create video capture using universal opener.
        Handles authentication for network streams if needed.
        """
        source = config["source_identifier"]

        # For network streams with authentication, construct URL with credentials
        if config["source_type"] in ["rtsp", "http", "https", "rtmp", "cctv"]:
            if config.get("username") and config.get("password"):
                # Parse and inject credentials into URL
                source_str = str(source)

                # Check if URL already has credentials
                if "@" not in source_str:
                    # Insert credentials after protocol
                    if "://" in source_str:
                        protocol, rest = source_str.split("://", 1)
                        source = f"{protocol}://{config['username']}:{config['password']}@{rest}"
                    else:
                        source = f"{config['username']}:{config['password']}@{source_str}"

        # Use universal opener with target FPS
        return open_camera(source, target_fps=config["target_fps"])

    def _can_restart(self, camera_id: UUID) -> bool:
        """Check if camera hasn't exceeded restart limit."""
        now = datetime.now(timezone.utc)
        # Clean old attempts
        self._restart_attempts[camera_id] = [
            t for t in self._restart_attempts[camera_id]
            if now - t < timedelta(hours=1)
        ]
        return len(self._restart_attempts[camera_id]) < self.max_restarts_per_hour

    async def _start_worker(self, camera: Camera) -> None:
        """Create and start worker for camera using async connection."""
        try:
            # Check backoff one last time before starting
            now = datetime.now(timezone.utc)
            if camera.id in self._failed_cameras:
                if now - self._failed_cameras[camera.id] < self._backoff_duration:
                    logger.warning(f"Aborting start for camera {camera.id}: Still in backoff")
                    return

            logger.info(
                "Starting worker for camera",
                extra={
                    "camera_id": str(camera.id),
                    "source_type": camera.stream_type,
                    "source": camera.stream_url,
                    "fps": camera.fps,
                },
            )

            # Convert camera to source config
            config = self._camera_to_config(camera)
            
            # 1. Create specialized camera source from factory (sources.py)
            # This handles internal threading (RTSPSource) or local locking (WebcamSource)
            source = create_camera_source(
                source_type=config["source_type"] or "rtsp",
                source_identifier=config["source_identifier"],
                width=config["width"],
                height=config["height"],
                target_fps=config["target_fps"],
                username=config["username"],
                password=config["password"]
            )

            # 2. Start the source in a background thread to avoid blocking the async event loop
            # RTSP connection handshakes can take 5-30 seconds!
            loop = asyncio.get_event_loop()
            try:
                # sources.RTSPSource.start is where the blocking cv2.VideoCapture happens
                await loop.run_in_executor(None, source.start)
            except Exception as conn_err:
                raise ConnectionError(f"Connection failed: {conn_err}")

            # ✅ FIX: Only verify that the source object started (_running=True and capture opened).
            # Do NOT call is_healthy() here — RTSP streams need time for the background reader
            # thread to deliver the first frame. The health loop handles ongoing monitoring.
            if not source._running:
                raise ValueError(f"Camera source failed to start (not running after start())")
            # For RTSP sources check the capture is opened
            if hasattr(source, '_capture') and source._capture is not None:
                if not source._capture.isOpened():
                    raise ValueError(f"Camera source capture is not opened after start")

            # 3. Create worker
            # On CPU: skip_factor=2 halves inference load (process every 2nd frame).
            # On GPU: skip_factor=1 since inference is fast enough.
            from app.vision.detector import detector as _det
            cpu_mode = getattr(_det, 'device', 'cpu') == 'cpu'
            effective_skip = 1  # Force full real-time FPS even on CPU based on user request
            # Allow camera-level override if the model has a skip_factor attribute
            effective_skip = getattr(camera, 'skip_factor', effective_skip)

            worker = StreamWorker(
                camera_id=camera.id,
                source=source,
                target_fps=config["target_fps"],
                skip_factor=effective_skip,
                static_diff_threshold=0.4,   # ✅ SUPER SENSITIVE: Skip YOLO only when scene is truly static
                health_check_interval=10,    # Health-check every 10th frame (faster response)
            )

            await worker.start()
            self._workers[camera.id] = worker
            
            # Clear any failure history on successful start
            if camera.id in self._failed_cameras:
                del self._failed_cameras[camera.id]

            logger.info(
                "Worker started successfully",
                extra={"camera_id": str(camera.id)}
            )

        except Exception as e:
            # Record failure for backoff
            self._failed_cameras[camera.id] = datetime.now(timezone.utc)
            logger.error(
                "Failed to start worker",
                extra={
                    "camera_id": str(camera.id),
                    "source_type": camera.stream_type,
                    "source": camera.stream_url,
                    "error": str(e),
                },
                exc_info=True,
            )

    async def _stop_worker(self, camera_id: UUID) -> None:
        """Stop and remove worker."""
        worker = self._workers.get(camera_id)
        if not worker:
            return

        logger.info(
            "Stopping worker for camera",
            extra={"camera_id": str(camera_id)}
        )

        await worker.stop()
        del self._workers[camera_id]

        logger.info(
            "Worker stopped",
            extra={"camera_id": str(camera_id)}
        )

    # ==========================================================
    # Health Monitoring
    # ==========================================================

    async def _health_loop(self) -> None:
        """Monitor worker health and auto-restart if needed."""
        while self._running:
            try:
                await self._check_health()
                await asyncio.sleep(self.health_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(
                    "VisionManager health error",
                    extra={"error": str(e)},
                    exc_info=True,
                )
                await asyncio.sleep(5)

    async def _check_health(self) -> None:
        """Check workers and restart unhealthy ones."""
        for camera_id, worker in list(self._workers.items()):
            try:
                status = await worker.get_status()

                if not status.get("healthy", False):
                    # Check restart limits
                    if not self._can_restart(camera_id):
                        logger.warning(
                            "Worker unhealthy but restart limit reached",
                            extra={
                                "camera_id": str(camera_id),
                                "restart_attempts": len(self._restart_attempts[camera_id]),
                            }
                        )
                        continue

                    logger.warning(
                        "Worker unhealthy — restarting",
                        extra={
                            "camera_id": str(camera_id),
                            "status": {
                                "frames_processed": status.get("frames", {}).get("processed"),
                                "last_frame": status.get("last_frame_time"),
                                "error": status.get("last_error"),
                            },
                        },
                    )

                    # Record restart attempt
                    self._restart_attempts[camera_id].append(
                        datetime.now(timezone.utc))

                    # 🚨 PROACTIVE HEALTH SYNC: Mark offline in DB immediately
                    try:
                        from app.services.camera_health_service import CameraHealthService
                        health_service = CameraHealthService()
                        async with db_manager.session() as health_session:
                            camera = await health_session.get(Camera, camera_id)
                            if camera:
                                await health_service.update_camera_health(health_session, camera, "offline")
                                await health_session.commit()
                                logger.info(f"Camera {camera_id} proactive health sync: OFFLINE")
                    except Exception as health_err:
                        logger.warning(f"Failed to sync offline health for {camera_id}: {health_err}")

                    # Restart worker
                    await worker.stop()
                    del self._workers[camera_id]

                    # Re-fetch camera from DB and restart
                    await asyncio.sleep(2.0)  # Grace period to release hardware/sockets
                    async with db_manager.session() as session:
                        camera = await session.get(Camera, camera_id)
                        if camera and camera.is_active and camera.monitoring_enabled:
                            await self._start_worker(camera)
                
                else:
                    # Update is_online status to True if healthy
                    from app.core.database import db_manager
                    async with db_manager.session() as session:
                        camera = await session.get(Camera, camera_id)
                        if camera and (not camera.is_online or camera.health_status == "offline"):
                            from app.services.camera_health_service import CameraHealthService
                            health_service = CameraHealthService()
                            await health_service.update_camera_health(session, camera, "healthy")
                            logger.info(f"Camera {camera_id} marked online and healthy via health loop")

            except Exception as e:
                logger.debug(
                    "Health check failed for worker",
                    extra={
                        "camera_id": str(camera_id),
                        "error": str(e),
                    },
                )

    # ==========================================================
    # Demo Mode
    # ==========================================================

    async def start_demo_mode(
        self,
        demo_source: str = "webcam",
        device_index: int = 0,
        video_file: Optional[str] = None,
        rtsp_url: Optional[str] = None
    ) -> None:
        """
        Start a single demo camera without database.

        Args:
            demo_source: "webcam", "usb", "video", "rtsp", or "cctv"
            device_index: Webcam/USB device index
            video_file: Path to video file
            rtsp_url: RTSP stream URL for IP/CCTV cameras
        """
        logger.info(f"Starting demo mode with source: {demo_source}")
        self._demo_mode = True

        # Create demo camera config
        demo_id = UUID("00000000-0000-0000-0000-000000000001")

        # Determine source identifier based on demo source type
        if demo_source in ["webcam", "usb"]:
            source_identifier = device_index
            source_type = "device"
        elif demo_source == "video" and video_file:
            source_identifier = video_file
            source_type = "file"
        elif demo_source in ["rtsp", "cctv"] and rtsp_url:
            source_identifier = rtsp_url
            source_type = "rtsp"
        else:
            raise ValueError(f"Invalid demo source: {demo_source}")

        config = {
            "source_type": source_type,
            "source_identifier": source_identifier,
            "width": 640,
            "height": 480,
            "target_fps": self.max_fps,  # Use max FPS for demo mode
        }

        # Create capture using universal opener
        cap = self._create_capture_with_universal_opener(config)

        if cap is None:
            raise ValueError(
                f"Failed to open demo source: {source_identifier}")

        # Create wrapper


        class CameraSourceWrapper:

            def __init__(self, capture, config):
                self.capture = capture
                self.width = config["width"]
                self.height = config["height"]
                self.fps = config["target_fps"]
                self.source_type = config["source_type"]
                self._last_frame_time = None
                self._healthy = True

            def start(self):
                return True

            async def read(self):
                loop = asyncio.get_event_loop()
                ret, frame = await loop.run_in_executor(None, self.capture.read)

                if ret:
                    self._last_frame_time = datetime.now(timezone.utc)
                else:
                    self._healthy = False

                return ret, frame

            async def release(self):
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self.capture.release)

            def stop(self):
                if self.capture:
                    self.capture.release()

            def is_opened(self):
                return self.capture.isOpened()

            def get_type(self):
                return self.source_type

            # 🔥 REQUIRED BY STREAM WORKER
            def is_healthy(self):
                if not self.capture.isOpened():
                    return False

                if self._last_frame_time is None:
                    return True

                delta = datetime.now(timezone.utc) - self._last_frame_time
                return delta.total_seconds() < 10

            # 🔥 REQUIRED BY STREAM WORKER
            def get_status(self):
                return {
                    "healthy": self.is_healthy(),
                    "source_type": self.source_type,
                    "opened": self.capture.isOpened(),
                    "last_frame_time": self._last_frame_time.isoformat() if self._last_frame_time else None,
                }
        source_wrapper = CameraSourceWrapper(cap, config)

        # Create worker
        worker = StreamWorker(
            camera_id=demo_id,
            source=source_wrapper,
            target_fps=config["target_fps"],
            skip_factor=1,
        )

        await worker.start()
        self._workers[demo_id] = worker

        logger.info("Demo mode started successfully")

    # ==========================================================
    # Public API
    # ==========================================================

    async def get_status(self) -> Dict[str, Any]:
        """Return full system health summary."""
        workers_status = {}
        for cid, worker in self._workers.items():
            workers_status[str(cid)] = await worker.get_status()

        healthy_workers = sum(
            1 for w in workers_status.values()
            if w.get("healthy", False)
        )

        # Aggregate metrics
        total_frames = sum(
            w.get("frames", {}).get("processed", 0)
            for w in workers_status.values()
        )

        total_skipped = sum(
            w.get("frames", {}).get("skipped", 0)
            for w in workers_status.values()
        )

        total_failed = sum(
            w.get("frames", {}).get("failed", 0)
            for w in workers_status.values()
        )

        # Safely get detector status
        detector_status = {}
        try:
            if hasattr(detector, 'get_status'):
                detector_status = detector.get_status()
        except Exception as e:
            logger.error("Failed to get detector status",
                         extra={"error": str(e)})
            detector_status = {"initialized": False, "error": str(e)}

        return {
            "running": self._running,
            "demo_mode": self._demo_mode,
            "uptime_seconds": round(
                (datetime.now(timezone.utc) - self._start_time).total_seconds(), 1
            ) if self._start_time else 0,
            "cameras": {
                "total": len(self._workers),
                "healthy": healthy_workers,
                "unhealthy": len(self._workers) - healthy_workers,
            },
            "frames": {
                "processed": total_frames,
                "skipped": total_skipped,
                "failed": total_failed,
                "total": total_frames + total_skipped + total_failed,
            },
            "detector": detector_status,
            "workers": workers_status,
            "restart_limits": {
                "max_per_hour": self.max_restarts_per_hour,
                "current": {
                    str(cid): len(attempts)
                    for cid, attempts in self._restart_attempts.items()
                }
            },
            "config": {
                "max_fps": self.max_fps,
                "sync_interval": self.sync_interval,
                "health_check_interval": self.health_check_interval,
            }
        }

    async def get_health(self) -> Dict[str, Any]:
        """
        Get simplified health status for monitoring endpoints.
        Uses existing get_status() but returns a streamlined version.

        Returns:
            Dict with key health metrics
        """
        # Use existing get_status() to avoid duplication
        full_status = await self.get_status()

        # Get detector status safely
        detector_status = {}
        try:
            if hasattr(detector, 'get_status'):
                detector_status = detector.get_status()
        except Exception:
            detector_status = {"loaded": False}

        return {
            # System status
            "status": "running" if self._running else "stopped",
            "demo_mode": self._demo_mode,
            "uptime_seconds": full_status.get("uptime_seconds", 0),

            # Camera statistics
            "cameras": {
                "total": full_status.get("cameras", {}).get("total", 0),
                "healthy": full_status.get("cameras", {}).get("healthy", 0),
                "unhealthy": full_status.get("cameras", {}).get("unhealthy", 0),
            },

            # Performance metrics
            "performance": {
                "total_frames_processed": full_status.get("frames", {}).get("processed", 0),
                "total_errors": full_status.get("frames", {}).get("failed", 0),
                "fps_limit": self.max_fps,
            },

            # Component status
            "components": {
                "detector": {
                    "loaded": detector_status.get("initialized", False),
                    "device": detector_status.get("device", "unknown"),
                },
                "scheduler": {
                    "sync_enabled": not self._demo_mode,
                    "sync_interval": self.sync_interval,
                }
            },

            # Timestamps
            "timestamps": {
                "last_sync": self._last_sync_time,
                "last_health_check": datetime.now(timezone.utc).isoformat(),
                "started_at": self._start_time.isoformat() if self._start_time else None,
            },

            # Version info
            "version": "1.1.0",
        }

    async def restart_camera(self, camera_id: UUID) -> bool:
        """
        Manually restart a specific camera.

        Returns:
            True if restart initiated, False if camera not found
        """
        if camera_id not in self._workers:
            logger.warning(
                "Cannot restart camera - not found",
                extra={"camera_id": str(camera_id)}
            )
            return False

        logger.info(
            "Manual restart requested for camera",
            extra={"camera_id": str(camera_id)}
        )

        # Stop worker
        await self._stop_worker(camera_id)

        # Re-fetch camera from DB and restart
        async with db_manager.session() as session:
            camera = await session.get(Camera, camera_id)
            if camera and camera.is_active and camera.monitoring_enabled:
                await self._start_worker(camera)
                return True

        return False

    async def get_worker(self, camera_id: UUID) -> Optional[StreamWorker]:
        """Get worker by camera ID."""
        return self._workers.get(camera_id)

    def get_active_cameras(self) -> List[UUID]:
        """Get list of active camera IDs."""
        return list(self._workers.keys())

    # ==========================================================
    # Instant Lifecycle Hooks
    # ==========================================================

    async def notify_camera_created(self, camera: Camera) -> None:
        """Called by API after camera creation for instant startup."""
        if camera.id in self._workers:
            return
            
        if camera.is_active and camera.monitoring_enabled:
            logger.info(f"Instant start triggered for new camera {camera.id}")
            asyncio.create_task(self._start_worker(camera))

    async def notify_camera_deleted(self, camera_id: UUID) -> None:
        """Called by API before camera deletion for instant cleanup."""
        logger.info(f"Instant stop triggered for deleted camera {camera_id}")
        await self._stop_worker(camera_id)
        if camera_id in self._failed_cameras:
            del self._failed_cameras[camera_id]
        if camera_id in self._restart_attempts:
            del self._restart_attempts[camera_id]


# ==========================================================
# Singleton Instance
# ==========================================================

vision_manager = VisionManager()
