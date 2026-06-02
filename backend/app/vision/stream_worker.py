"""
Laminar - Vision Stream Worker
-------------------------------

Connects: CameraSource -> YOLODetector -> FrameIngestionService -> DetectionStorage

Features:
- One worker per camera (async isolation)
- CPU/GPU auto utilization
- Frame processing time tracking
- Backpressure protection
- Auto-restart on failure
- Graceful shutdown
- FPS tracking with smoothing
- Quality metrics
- Heartbeat monitoring
- Retry logic for ingestion
- Batch detection storage
- **Production-efficient frame saving (only on state change or periodic snapshot)**
"""

import asyncio
import time
import threading
import concurrent.futures
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID
from collections import deque

import numpy as np
import cv2
from typing import Tuple

from app.core.database import db_manager
from app.core.logging import get_logger
from app.services.frame_ingestion_service import FrameIngestionService
from app.services.detection_service import DetectionService
from app.vision.detector import detector as shared_detector  # Fixed import path
from app.vision.sources import CameraSource
from app.models.detection import Detection
from app.services.evidence_clip_service import EvidenceClipService
from app.services.crowd_density_service import CrowdDensityService
from app.services.panic_detection_service import PanicDetectionService
from app.services.camera_health_service import CameraHealthService
from app.services.dwell_time_service import get_dwell_service
from app.services.intelligence.zone_orchestrator import get_zone_orchestrator

logger = get_logger(__name__)
_shared_pose_estimator = None
_pose_lock = threading.Lock()


class StreamWorker:
    """
    One StreamWorker per camera.
    
    Handles:
    - Frame capture loop
    - YOLO inference
    - Frame ingestion
    - Detection storage
    - Health monitoring
    - Auto-recovery
    """

    def __init__(
        self,
        camera_id: UUID,
        source: CameraSource,
        target_fps: Optional[float] = None,
        skip_factor: int = 1,
        max_processing_time_ms: float = 500,
        heartbeat_interval: int = 30,
        batch_size: int = 1,          #   ZERO-LAG: Flush every single detection immediately
        enable_detection: bool = True,
        static_diff_threshold: float = 0.4,   #   SUPER SENSITIVE: Minimum movement triggers fresh YOLO
        health_check_interval: int = 15,       #   Health check every 15 frames for faster connectivity alerts
    ):
        """
        Initialize stream worker.
        
        Args:
            camera_id: Database camera ID
            source: CameraSource instance
            target_fps: Target processing FPS
            skip_factor: Process 1 of every N frames
            max_processing_time_ms: Alert threshold
            heartbeat_interval: Heartbeat log interval
            batch_size: Number of frames to batch before saving detections
            enable_detection: Whether to run YOLO detection
        """
        self.camera_id = camera_id
        self._camera_name: str = ""  # Resolved from DB on first heartbeat
        self.source = source
        self.target_fps = target_fps
        self.skip_factor = skip_factor
        self.max_processing_time_ms = max_processing_time_ms
        self.heartbeat_interval = heartbeat_interval
        self.batch_size = batch_size
        self.enable_detection = enable_detection
        self.static_diff_threshold = static_diff_threshold
        self.health_check_interval = health_check_interval

        # Services
        self.ingestion_service = FrameIngestionService()
        self.detection_service = DetectionService()

        # ==========================================================
        # Detector Initialization (Production Safe)
        # ==========================================================
        self.detector = None
        if self.enable_detection:
            try:
                self.detector = shared_detector
                logger.info(
                    "YOLO detector initialized",
                    extra={
                        "camera_id": str(self.camera_id),
                        "device": getattr(self.detector, 'device', 'unknown'),
                    }
                )
            except Exception as e:
                logger.error(
                    "Failed to initialize YOLODetector",
                    extra={
                        "camera_id": str(self.camera_id),
                        "error": str(e),
                    },
                )
                self.detector = None

        # Detection batching
        self._frame_count = 0
        self._batch_detections: List[Detection] = []
        self._batch_frame_count = 0

        # ==========================================================
        # Live Frame Cache (for MJPEG streaming endpoint)
        # ==========================================================
        self._latest_annotated_frame: Optional[np.ndarray] = None
        self._latest_heatmap_frame: Optional[np.ndarray] = None
        self.density_service = CrowdDensityService()
        self.panic_detector = PanicDetectionService()
        self.health_service = CameraHealthService()
        self._panic_frame_counter = 0

        # Mediapipe integration for accurate Sitting/Standing
        # PERFORMANCE: Initialization moved to processing loop to avoid blocking main thread
        self._pose_available = True  # We assume it's available until it fails
        self._pose_failed = False

        # Dwell time tracking (separate frame, non-breaking)
        self.dwell_service = get_dwell_service(camera_id)
        self._latest_dwell_frame: Optional[np.ndarray] = None
        self._dwell_zones: list = []   # cached zones for overlay; refreshed async
        self._dwell_zone_refresh_counter: int = 0

        #    Intelligence Layer                                                 
        # One orchestrator per camera   coordinates surge/dwell/flow engines.
        self._intelligence = get_zone_orchestrator(str(camera_id))
        self._latest_intelligence = None   # ZoneIntelligenceSnapshot, for API
        # Lazily fetched venue metadata (avoid per-frame DB hit)
        self._intel_venue_id: Optional[str]   = None
        self._intel_venue_name: Optional[str] = None
        self._intel_venue_fetched: bool        = False
        self._intel_capacity: Optional[int] = None
        self._intel_warning_threshold: Optional[int] = None
        self._intel_critical_threshold: Optional[int] = None
        
        # --- Analytics Tracker ---
        from app.vision.tracker import CentroidTracker
        self.tracker = CentroidTracker(max_disappeared=20, max_distance=80) # Boosted for occlusion
        self.entry_count = 0
        self.exit_count = 0
        self.line_crossed = set()
        self.act_standing = 0.0
        self.act_normal = 0.0
        self.act_walking = 0.0

        # State
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._start_time: Optional[datetime] = None
        self._last_frame_time: Optional[datetime] = None

        # ==========================================================
        # Production Efficiency State Tracking
        # ==========================================================
        self.clip_service = EvidenceClipService()
        self._is_recording = False
        self._recording_clip_id = None
        self._recording_file_path = None
        self._recording_frames = []
        self._recording_start_time = None
        self._recording_duration = 10
        self._recording_lock = asyncio.Lock()

        self._last_saved_count: Optional[int] = None
        self._last_state_save_time: Optional[datetime] = None
        self._state_snapshot_interval: int = 30  # seconds

        # Semantic Vault Snapshots (full-frame JPEG every 30 s for semantic search)
        self._last_semantic_snapshot_time: Optional[float] = None
        self._semantic_snapshot_interval: int = 30  # seconds (user requested 30s instead of 15s)

        # Metrics
        self._frames_processed = 0
        self._frames_skipped = 0
        self._failed_frames = 0
        self._processing_times: deque = deque(maxlen=100)
        self._avg_brightness: float = 0.0
        self._std_brightness: float = 0.0
        self._last_error: Optional[str] = None
        self._last_error_time: Optional[datetime] = None

        #   Per-camera state for frame-diff skip and health rate-limiting
        self._prev_gray_frame: Optional[np.ndarray] = None   # Downsampled grayscale of last processed frame
        self._health_check_counter: int = 0                  # Counts frames since last health analysis
        self._last_detection_result: Tuple[int, float] = (0, 0.0)  # Reused when scene is static

        # Health tracking explicitly initialized to satisfy Pyre2
        self._unhealthy_since: Optional[float] = None
        self._last_health_status: Optional[str] = None
        self._last_source_restart: Optional[float] = None

        # Frame-diff counters (also reset in start())
        self._frame_count_for_forced: int = 0
        self._metrics_broadcast_counter: int = 0

        #    JPEG cache: encode once per processing cycle, serve instantly   
        self._cached_frame_bytes: Optional[bytes] = None
        self._cached_jpeg_quality: int = 80

        # ReID throttle: only run embedding extraction every N frames
        self._reid_frame_counter: int = 0
        self._reid_throttle_frames: int = 15  # ~0.5s at 30fps

        # Posture temporal smoothing: prevents label flicker between frames
        # Maps object_id -> deque of recent posture labels
        self._posture_history: Dict[int, deque] = {}

        # Manual frame injection (demo/testing)
        self.injected_frame: Optional[np.ndarray] = None

    # ==========================================================
    # Lifecycle
    # ==========================================================

    async def start(self) -> None:
        """Start worker and heartbeat tasks."""
        if self._running:
            return

        logger.info(
            "Starting stream worker",
            extra={
                "camera_id": str(self.camera_id),
                "source_type": self.source.get_type(),
                "target_fps": self.target_fps,
                "skip_factor": self.skip_factor,
                "batch_size": self.batch_size,
                "detection_enabled": self.enable_detection and self.detector is not None,
                "snapshot_interval": self._state_snapshot_interval,
            },
        )

        # Start camera source
        self.source.start()

        # Reset state
        self._running = True
        self._start_time = datetime.now(timezone.utc)
        self._frames_processed = 0
        self._frames_skipped = 0
        self._failed_frames = 0
        self._processing_times.clear()
        self._batch_detections = []
        self._batch_frame_count = 0
        self._frame_count_for_forced = 0

        # Start loops
        self._last_saved_count = None
        self._last_state_save_time = None

        # Create tasks
        self._task = asyncio.create_task(self._run())
        self._heartbeat_task = asyncio.create_task(self._heartbeat())

        #   INSTANT-READY: Force an immediate tick to register the orchestrator
        # and provide initial zeroed state (prevents "warming_up" or "empty" dashboard).
        # We use a task here because metadata fetch might take a moment.
        async def initial_tick():
            # Wait a tiny bit to let metadata fetch happen if it started in _run
            await asyncio.sleep(0.5)
            self._intelligence.tick(
                zone_id           = "camera",
                count             = 0,
                active_tracks     = [],
                venue_id          = self._intel_venue_id,
                venue_name        = self._intel_venue_name,
                metric_id         = None,
                capacity          = self._intel_capacity,
                warning_threshold = self._intel_warning_threshold,
                critical_threshold= self._intel_critical_threshold,
            )
        asyncio.create_task(initial_tick())

    async def stop(self) -> None:
        """Stop worker gracefully and save any pending detections."""
        if not self._running:
            return

        logger.info(
            "Stopping stream worker",
            extra={
                "camera_id": str(self.camera_id),
                "frames_processed": self._frames_processed,
                "effective_fps": self._calculate_fps(),
                "pending_detections": len(self._batch_detections),
            },
        )

        self._running = False

        # Save any pending detections before stopping
        if self._batch_detections:
            await self._save_detection_batch()

        # Cancel tasks
        task = self._task
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        heartbeat = self._heartbeat_task
        if heartbeat is not None:
            heartbeat.cancel()
            try:
                await heartbeat
            except asyncio.CancelledError:
                pass

        # Stop camera source
        self.source.stop()

    # ==========================================================
    # Main Loop
    # ==========================================================

    async def _run(self) -> None:
        """Main high-performance readout loop."""
        logger.warning(f"STREAM_WORKER_READOUT_START: Camera {self.camera_id}")
        
        self._current_raw_frame = None
        self._detection_task = asyncio.create_task(self._detection_loop())

        while self._running:
            try:
                loop_start = time.time()

                # 1. Source Health Management
                if not self.source.is_healthy():
                    if self._unhealthy_since is None:
                        self._unhealthy_since = time.time()

                    if self._last_health_status != "offline":
                        self._last_health_status = "offline"
                        async def set_offline():
                            from app.core.database import db_manager
                            from app.models.camera import Camera
                            async with db_manager.session() as s:
                                from sqlalchemy import select
                                cam_res = await s.execute(select(Camera).where(Camera.id == self.camera_id))
                                cam = cam_res.scalar_one_or_none()
                                if cam: await self.health_service.update_camera_health(s, cam, "offline")
                        asyncio.create_task(set_offline())
                    
                    unhealthy_duration = time.time() - self._unhealthy_since
                    backoff = min(10.0, 2.0 * (1.5 ** (unhealthy_duration / 5.0)))
                    
                    if unhealthy_duration > 30.0:
                        if self._last_source_restart is None or (time.time() - self._last_source_restart) > 60.0:
                            self._last_source_restart = time.time()
                            try:
                                self._unhealthy_since = None
                                loop = asyncio.get_event_loop()
                                await loop.run_in_executor(None, self.source.stop)
                                await loop.run_in_executor(None, self.source.start)
                            except Exception: pass

                    await asyncio.sleep(backoff)
                    continue

                # 2. Frame Acquisition
                if self.injected_frame is not None:
                    frame = self.injected_frame.copy()
                    ret = True
                    await asyncio.sleep(0.01)
                else:
                    try:
                        read_result = await asyncio.wait_for(self.source.read(), timeout=1.0)
                        if read_result is None:
                            await asyncio.sleep(0.1)
                            continue
                        ret, frame = read_result
                    except asyncio.TimeoutError:
                        await asyncio.sleep(0.5)
                        continue

                if not ret or frame is None:
                    await asyncio.sleep(0.05)
                    continue

                # 3. Store for Detection Loop
                self._current_raw_frame = frame.copy()

                # 4. Critical Logic: Recording (must stay in readout loop for fidelity)
                if self._is_recording:
                    self._recording_frames.append(frame.copy())
                    now = datetime.now(timezone.utc)
                    if self._recording_start_time and (now - self._recording_start_time).total_seconds() >= self._recording_duration:
                        asyncio.create_task(self._finish_recording())

                # 5. Always update MJPEG cache
                frame_to_encode = self._latest_annotated_frame if self._latest_annotated_frame is not None else frame
                try:
                    _, buf = cv2.imencode('.jpg', frame_to_encode, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    self._cached_frame_bytes = buf.tobytes()
                except Exception: pass

                # Enforce readout FPS
                elapsed = time.time() - loop_start
                target_interval = 1.0 / (self.target_fps or 15)
                if elapsed < target_interval:
                    await asyncio.sleep(target_interval - elapsed)
                else:
                    await asyncio.sleep(0.005)

            except Exception as e:
                logger.error(f"Stream readout loop error: {e}")
                await asyncio.sleep(1)

    async def _detection_loop(self):
        """Dedicated background task for AI inference (YOLO, Pose, ReID)."""
        logger.warning(f"STREAM_WORKER_DETECTION_START: Camera {self.camera_id}")
        while self._running:
            try:
                if self._current_raw_frame is not None:
                    # Run the heavy processing pipeline
                    await self._process_frame(self._current_raw_frame.copy())
                
                # Dynamic interval based on processing load
                await asyncio.sleep(0.1) 
            except Exception as e:
                logger.error(f"Detection loop error: {e}")
                await asyncio.sleep(1)

    def _get_pose_estimator(self):
        """Lazy loader for shared Mediapipe Pose estimator (Thread Safe)."""
        global _shared_pose_estimator
        if self._pose_failed:
            return None
            
        if _shared_pose_estimator is None:
            with _pose_lock:
                if _shared_pose_estimator is None:
                    try:
                        logger.info("Initializing shared Mediapipe Pose estimator (Lazy Load @ Thread Pool)")
                        try:
                            from mediapipe.solutions import pose as mp_pose
                        except ImportError:
                            from mediapipe.python.solutions import pose as mp_pose
                            
                        _shared_pose_estimator = mp_pose.Pose(
                            static_image_mode=False,
                            model_complexity=1,
                            min_detection_confidence=0.55,
                            min_tracking_confidence=0.5
                        )
                        self._pose_available = True
                    except Exception as e:
                        logger.error(f"Failed to lazy-load Mediapipe Pose: {e}")
                        self._pose_failed = True
                        self._pose_available = False
                        return None
        return _shared_pose_estimator

    async def _process_frame(self, frame: np.ndarray) -> None:
        """
        Process a single frame: detect -> ingest -> store detections.
        
        Args:
            frame: BGR/RGB frame from camera
        """
        frame_start = time.time()
        now = datetime.now(timezone.utc)

        try:
            # Update quality metrics
            self._update_quality_metrics(frame)

            # ==========================================================
            # Health check (rate-limited   only every N frames)
            # ==========================================================
            self._health_check_counter += 1
            if self._health_check_counter >= self.health_check_interval or (not self._camera_name and self._health_check_counter == 1):
                if self._health_check_counter >= self.health_check_interval:
                    self._health_check_counter = 0
                
                health_issue = self.health_service.analyze_frame(str(self.camera_id), frame)
                if not hasattr(self, "_last_health_status") or self._last_health_status != health_issue or not self._camera_name:
                    self._last_health_status = health_issue

                    async def update_health_and_meta(status: str):
                        from app.core.database import db_manager
                        from app.models.camera import Camera
                        from sqlalchemy import select
                        async with db_manager.session() as health_session:
                            cam_res = await health_session.execute(select(Camera).where(Camera.id == self.camera_id))
                            cam = cam_res.scalar_one_or_none()
                            if cam:
                                if not self._camera_name and cam.name:
                                    self._camera_name = cam.name  # Cache for ReID insights
                                    logger.info(f"Resolved camera name: {self._camera_name}", extra={"camera_id": str(self.camera_id)})
                                if not hasattr(self, "_intel_venue_id") and cam.venue_id:
                                    self._intel_venue_id = str(cam.venue_id)
                                
                                # Force online status and update timestamp
                                cam.is_online = True
                                cam.last_frame_at = datetime.now(timezone.utc)
                                await self.health_service.update_camera_health(health_session, cam, status)

                    asyncio.create_task(update_health_and_meta(health_issue))

            # Manual Clip Recording Logic
            if self._is_recording:
                self._recording_frames.append(frame.copy())
                # Check if 10s elapsed
                if self._recording_start_time and (now - self._recording_start_time).total_seconds() >= self._recording_duration:
                    await self._finish_recording()

            # ==========================================================
            # Step 1: YOLO Detection
            # ==========================================================
            detected_count = 0
            avg_confidence = 0.0
            annotated_frame = frame.copy()
            heatmap_frame = np.zeros_like(frame)

            # ==========================================================
            # Step 1: Frame-diff static-scene skip (biggest CPU saver)
            # ==========================================================
            # Downscale to 80x80 grayscale   fast, cheap, good diff signal
            small = cv2.resize(frame, (80, 80), interpolation=cv2.INTER_NEAREST)
            gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            scene_changed = True
            self._frame_count_for_forced += 1
            is_forced = self._frame_count_for_forced >= 3  #   LIVE PERSISTENCE: Force YOLO every 3 frames (~0.1s)

            boxes: list = []
            detect_time: float = 0.0

            if self._prev_gray_frame is not None and not is_forced:
                diff = float(np.mean(np.abs(gray.astype(np.int16) - self._prev_gray_frame.astype(np.int16))))
                if diff < self.static_diff_threshold:
                    # Scene is static   reuse last YOLO result, skip inference entirely
                    scene_changed = False
                    detected_count, avg_confidence = self._last_detection_result
                    # detect_time stays 0.0 (no inference ran)

            if is_forced:
                self._frame_count_for_forced = 0

            self._prev_gray_frame = gray

            if self.detector and scene_changed:
                try:
                    #   ✅ Low light intensity & object hiding enhancement (CLAHE)
                    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
                    l_channel, a_channel, b_channel = cv2.split(lab)
                    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                    cl = clahe.apply(l_channel)
                    enhanced_frame = cv2.cvtColor(cv2.merge((cl, a_channel, b_channel)), cv2.COLOR_LAB2BGR)

                    #   PERFORMANCE FIX: Run YOLO in thread executor so the async event loop
                    # is NEVER blocked by 100-250ms CPU inference.
                    loop = asyncio.get_event_loop()
                    detection_result = await loop.run_in_executor(
                        None,
                        lambda: self.detector.detect_people(enhanced_frame, return_boxes=True, max_boxes=500)
                    )

                    if hasattr(detection_result, 'count'):
                        detected_count = detection_result.count
                        avg_confidence = detection_result.avg_confidence
                        boxes = detection_result.bounding_boxes
                        detect_time = detection_result.inference_time_ms
                    else:
                        detected_count, avg_confidence = detection_result
                        boxes = []
                        detect_time = 0.0

                    # Cache result for reuse on static frames
                    self._last_detection_result = (detected_count, avg_confidence)
                
                except RuntimeError as e:
                    if "not initialized" in str(e):
                        logger.warning(
                            "YOLO detector not yet initialized, skipping detection for this frame",
                            extra={"camera_id": str(self.camera_id)}
                        )
                    else:
                        logger.error(f"Detector runtime error: {e}")
                    detected_count, avg_confidence = 0, 0.0
                    boxes = []
                    detect_time = 0.0
                except Exception as e:
                    logger.error(f"Unexpected detector error: {e}")
                    detected_count, avg_confidence = 0, 0.0
                    boxes = []
                    detect_time = 0.0

            elif not self.detector:
                detected_count = 0
                avg_confidence = 0.0
                boxes = []
                detect_time = 0.0

            # --- Annotation ---
            scaled_boxes = []
            orig_h, orig_w = frame.shape[:2]
            
            # --- Tracker and Analytics ---
            rects = []
            orig_h, orig_w = frame.shape[:2]
            
            # Format boxes for the tracker
            for obj in boxes:
                box = obj.get("bbox")
                if box and len(box) == 4:
                    x1, y1, x2, y2 = map(int, box)
                    x1 = max(0, min(orig_w - 1, x1))
                    y1 = max(0, min(orig_h - 1, y1))
                    x2 = max(0, min(orig_w - 1, x2))
                    y2 = max(0, min(orig_h - 1, y2))
                    if (x2 - x1) < 4 or (y2 - y1) < 4: continue
                    rects.append((x1, y1, x2, y2))
            
            # Update Tracker
            objects = self.tracker.update(rects)
            
            #    Purge evicted objects from line_crossed                           
            # When an object leaves the tracker it may re-enter through a different
            # gate. Keeping its ID in line_crossed prevents the re-entry from being
            # counted, causing systematic UNDER-counts.
            disappeared_ids = set(self.tracker.disappeared.keys())
            max_disappeared = getattr(self.tracker, 'max_disappeared', 5)
            stale_ids = {oid for oid in disappeared_ids if self.tracker.disappeared.get(oid, 0) >= max_disappeared}
            self.line_crossed -= stale_ids

            # Map centroids to bounding boxes to compute kinetics/aspect ratios
            centroid_to_box = {
                (int((x1 + x2) / 2.0), int((y1 + y2) / 2.0)): (x1, y1, x2, y2)
                for (x1, y1, x2, y2) in rects
            }
            
            # Mid-line threshold (Lowered to 75% to avoid faces)
            mid_y = int(orig_h * 0.75)
            
            # Compute analytical statuses
            sitting_count = 0
            standing_count = 0
            normal_count = 0
            walking_count = 0
            
            # Per-box posture lookup: maps (x1,y1,x2,y2) -> (label, bgr_color)
            box_posture_map: dict = {}
            
            import math

            #    Resolution-normalized speed thresholds                       
            # Normalize by frame diagonal so thresholds work at any resolution
            # (e.g. 1080p vs 480p camera would otherwise need different values)
            frame_diag = math.hypot(orig_w, orig_h) or 1.0
            # Slow  < 1.2% diagonal/s  -> sitting or standing
            # Medium 1.2 3.5%          -> normal walking pace
            # Fast  > 3.5%             -> brisk walk / running
            SLOW_THRESH   = frame_diag * 0.012   # px/s
            FAST_THRESH   = frame_diag * 0.035   # px/s

            # Sort people by box area (largest/closest first) so they get priority for high-accuracy slots
            # This ensures that in crowded scenes, the most prominent people are tracked best.
            def get_box_area(oid_centroid):
                bbox = centroid_to_box.get(oid_centroid[1])
                return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) if bbox else 0

            sorted_items = sorted(objects.items(), key=get_box_area, reverse=True)

            for object_id, centroid in sorted_items:
                cx, cy = centroid
                history = self.tracker.history.get(object_id, [])
                
                #    Entry/Exit crossing                                        
                if len(history) >= 2:
                    y_prev = history[-2][1]
                    if y_prev < mid_y and cy >= mid_y:
                        if object_id not in self.line_crossed:
                            self.entry_count += 1
                            self.line_crossed.add(object_id)
                    elif y_prev > mid_y and cy <= mid_y:
                        if object_id not in self.line_crossed:
                            self.exit_count += 1
                            self.line_crossed.add(object_id)
                    # We do NOT discard the object here. It is handled by tracker eviction.
                
                #    Smooth speed over last N frames                           
                if len(history) >= 5:
                    # Use full history window for stable speed estimate
                    dx = centroid[0] - history[0][0]
                    dy = centroid[1] - history[0][1]
                    dist = math.hypot(dx, dy)
                    speed_per_frame = dist / len(history)
                elif len(history) >= 2:
                    dx = centroid[0] - history[0][0]
                    dy = centroid[1] - history[0][1]
                    dist = math.hypot(dx, dy)
                    speed_per_frame = dist / len(history)
                else:
                    speed_per_frame = 0.0

                current_fps = self.target_fps if self.target_fps and self.target_fps > 0 else 15.0
                true_speed_px_s = speed_per_frame * current_fps

                #    Posture detection                                          
                is_sitting = False
                bbox = centroid_to_box.get((cx, cy))
                w = h = 0
                if bbox:
                    x1, y1, x2, y2 = bbox
                    w = x2 - x1
                    h = y2 - y1

                # Use SLOW_THRESH to decide whether to run MediaPipe
                if true_speed_px_s < SLOW_THRESH and self._pose_available:
                    pose_slots_used = sitting_count + standing_count
                    if bbox and w > 15 and h > 30 and pose_slots_used < 8:
                        try:
                            #   PERFORMANCE: MediaPipe is CPU-heavy. Run in thread executor.
                            crop = frame[y1:y2, x1:x2]
                            if crop.size > 0:
                                crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                                
                                loop = asyncio.get_event_loop()
                                def process_pose(img):
                                    estimator = self._get_pose_estimator()
                                    if not estimator:
                                        return None
                                    with _pose_lock:
                                        return estimator.process(img)
                                
                                results = await loop.run_in_executor(None, process_pose, crop_rgb)
                                
                                if results.pose_landmarks:
                                    lm = results.pose_landmarks.landmark
                                    
                                    # Choice of side based on visibility
                                    left_vis  = min(lm[23].visibility, lm[25].visibility, lm[27].visibility)
                                    right_vis = min(lm[24].visibility, lm[26].visibility, lm[28].visibility)
                                    
                                    knee_angle = None
                                    hip_y, knee_y, ankle_y = 0.0, 0.0, 0.0
                                    
                                    if right_vis > 0.45 and right_vis >= left_vis:
                                        a = np.array([lm[24].x, lm[24].y])
                                        b = np.array([lm[26].x, lm[26].y])
                                        c = np.array([lm[28].x, lm[28].y])
                                        hip_y, knee_y, ankle_y = lm[24].y, lm[26].y, lm[28].y
                                        rad = np.arctan2(c[1]-b[1], c[0]-b[0]) - np.arctan2(a[1]-b[1], a[0]-b[0])
                                        ang = abs(rad * 180.0 / np.pi)
                                        knee_angle = 360 - ang if ang > 180 else ang
                                    elif left_vis > 0.45:
                                        a = np.array([lm[23].x, lm[23].y])
                                        b = np.array([lm[25].x, lm[25].y])
                                        c = np.array([lm[27].x, lm[27].y])
                                        hip_y, knee_y, ankle_y = lm[23].y, lm[25].y, lm[27].y
                                        rad = np.arctan2(c[1]-b[1], c[0]-b[0]) - np.arctan2(a[1]-b[1], a[0]-b[0])
                                        ang = abs(rad * 180.0 / np.pi)
                                        knee_angle = 360 - ang if ang > 180 else ang

                                    if knee_angle is not None:
                                        # Total leg height in image coords
                                        leg_h = abs(ankle_y - hip_y) or 0.01
                                        # In sitting, hip and knee are vertically closer
                                        hip_knee_dist = abs(knee_y - hip_y)
                                        hip_knee_ratio = hip_knee_dist / leg_h
                                        
                                        if knee_angle < 115:
                                            is_sitting = True
                                        elif knee_angle < 155 and hip_knee_ratio < 0.35:
                                            is_sitting = True
                        except Exception as e:
                            logger.debug(f"MediaPipe offload failed: {e}")
                            pass

                # Fallback to aspect ratio if slow and not yet determined
                if true_speed_px_s < SLOW_THRESH and not is_sitting:
                    if h > 0 and (w / float(h)) > 1.25:
                        is_sitting = True

                #    Posture Mapping                                            
                if true_speed_px_s < SLOW_THRESH:
                    raw_label = "Sitting" if is_sitting else "Standing"
                elif true_speed_px_s < FAST_THRESH:
                    raw_label = "Normal"
                else:
                    raw_label = "Walking"

                hist_dq = self._posture_history.setdefault(object_id, deque(maxlen=5))
                hist_dq.append(raw_label)
                # Majority vote, tie -> keep current raw_label
                from collections import Counter
                vote_label = Counter(hist_dq).most_common(1)[0][0]

                #    Assign counts & colors                                     
                status = vote_label
                if vote_label == "Sitting":
                    sitting_count += 1
                    color = (0, 255, 255)    # Yellow-Cyan
                elif vote_label == "Standing":
                    standing_count += 1
                    color = (255, 100, 0)    # Blue-Orange
                elif vote_label == "Normal":
                    normal_count += 1
                    color = (0, 220, 80)     # Green
                else:  # Walking
                    walking_count += 1
                    color = (0, 165, 255)    # Orange

                # Centroid dot
                cv2.circle(annotated_frame, (cx, cy), 4, color, -1)
                
                # Store for bounding-box annotation pass
                if bbox:
                    box_posture_map[bbox] = (status, color)

            # Prune posture history for objects no longer tracked (memory hygiene)
            live_ids = set(objects.keys())
            for old_id in list(self._posture_history.keys()):
                if old_id not in live_ids:
                    del self._posture_history[old_id]



            # Compute tracker-based average velocity (px/frame -> px/s)

            # Used as fallback if mediapipe pose detection returns 0 (e.g. only 1 person)
            tracker_speeds = []
            for _oid, _cent in objects.items():
                _hist = self.tracker.history.get(_oid, [])
                if len(_hist) >= 3:
                    _dx = _cent[0] - _hist[0][0]
                    _dy = _cent[1] - _hist[0][1]
                    _spf = math.hypot(_dx, _dy) / len(_hist)
                    tracker_speeds.append(_spf)
            tracker_avg_velocity = float(np.mean(tracker_speeds)) * 15.0 if tracker_speeds else 0.0
            
            total_active = sitting_count + standing_count + normal_count + walking_count
            if total_active > 0:
                self.act_sitting = round((sitting_count / total_active) * 100, 2)
                self.act_standing = round((standing_count / total_active) * 100, 2)
                self.act_normal = round((normal_count / total_active) * 100, 2)
                self.act_walking = round((walking_count / total_active) * 100, 2)
            else:
                self.act_sitting = self.act_standing = self.act_normal = self.act_walking = 0.0
                
            # Draw HUD Analytics panel on Video Frame
            cv2.rectangle(annotated_frame, (orig_w - 255, 10), (orig_w - 5, 150), (0, 0, 0), -1)
            cv2.rectangle(annotated_frame, (orig_w - 255, 10), (orig_w - 5, 150), (40, 40, 40), 1)
            cv2.putText(annotated_frame, f"Walking : {self.act_walking:.1f}%", (orig_w - 248, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 1)
            cv2.putText(annotated_frame, f"Normal  : {self.act_normal:.1f}%",  (orig_w - 248, 68), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 80),  1)
            cv2.putText(annotated_frame, f"Standing: {self.act_standing:.1f}%", (orig_w - 248, 96), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 100, 0), 1)
            cv2.putText(annotated_frame, f"Sitting : {self.act_sitting:.1f}%",  (orig_w - 248, 124), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)
            cv2.putText(annotated_frame, f"Count: {detected_count}",            (orig_w - 248, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (160, 160, 160), 1)
            
            # Draw Entry/Exit HUD
            cv2.putText(annotated_frame, f"Entry: {self.entry_count}  Exit: {self.exit_count}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

            # Draw standard boxes with per-person posture colour and label
            for obj in boxes:
                box = obj.get("bbox")
                conf = obj.get("confidence", 0.0)
                if box and len(box) == 4:
                    x1, y1, x2, y2 = map(int, box)
                    x1 = max(0, min(orig_w - 1, x1))
                    y1 = max(0, min(orig_h - 1, y1))
                    x2 = max(0, min(orig_w - 1, x2))
                    y2 = max(0, min(orig_h - 1, y2))
                    bw = x2 - x1
                    bh = y2 - y1
                    if bw < 4 or bh < 4: continue
                    
                    # Lookup posture status for this specific box
                    posture_key = (x1, y1, x2, y2)
                    posture_label, box_color = box_posture_map.get(posture_key, ("Person", (0, 220, 60)))
                    
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), box_color, 1)
                    corner_len = max(12, min(bw, bh) // 5)
                    thickness = 2
                    cv2.line(annotated_frame, (x1, y1), (x1 + corner_len, y1), box_color, thickness)
                    cv2.line(annotated_frame, (x1, y1), (x1, y1 + corner_len), box_color, thickness)
                    cv2.line(annotated_frame, (x2, y1), (x2 - corner_len, y1), box_color, thickness)
                    cv2.line(annotated_frame, (x2, y1), (x2, y1 + corner_len), box_color, thickness)
                    cv2.line(annotated_frame, (x1, y2), (x1 + corner_len, y2), box_color, thickness)
                    cv2.line(annotated_frame, (x1, y2), (x1, y2 - corner_len), box_color, thickness)
                    cv2.line(annotated_frame, (x2, y2), (x2 - corner_len, y2), box_color, thickness)
                    cv2.line(annotated_frame, (x2, y2), (x2, y2 - corner_len), box_color, thickness)

                    label = f"{posture_label} {conf:.2f}"
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale = max(0.32, min(0.52, bw / 200))
                    (tw, th), _ = cv2.getTextSize(label, font, font_scale, 1)
                    label_y = y1 - 6 if y1 > th + 8 else y2 + th + 6
                    cv2.rectangle(annotated_frame, (x1, label_y - th - 3), (x1 + tw + 6, label_y + 3), (0, 0, 0), -1)
                    cv2.putText(annotated_frame, label, (x1 + 3, label_y), font, font_scale, box_color, 1, cv2.LINE_AA)

                    #      [LIVE INTELLIGENCE] ReID & Journey Tracking                   
                    #   PERF: Throttle to every _reid_throttle_frames frames to avoid per-frame GPU/CPU overhead
                    global_id = None
                    self._reid_frame_counter += 1
                    if self._reid_frame_counter >= self._reid_throttle_frames:
                        self._reid_frame_counter = 0
                        from app.services.reid_service import reid_service
                        from app.services.face_recognition_service import face_service
                        from app.vision.amber_vector_store import amber_vector_store
                        from app.services.journey_manager_service import journey_manager
                        
                        try:
                            # 1. Body Embedding (ReID)
                            body_emb = reid_service.extract_embedding(frame, [x1, y1, x2, y2])
                            
                            # 2. Face Embedding (InsightFace)
                            face_emb = face_service.extract_face_embedding(frame, [x1, y1, x2, y2])
                            
                            # 3. Store in FAISS
                            meta = {
                                "camera_id": str(self.camera_id),
                                "zone_name": self._camera_name or f"Camera {self.camera_id}",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "bbox": [x1, y1, x2, y2],
                                "type": "body"
                            }
                            if body_emb is not None and not np.all(body_emb == 0):
                                amber_vector_store.add_embedding(body_emb, meta)
                                
                            if face_emb is not None:
                                face_meta = meta.copy()
                                face_meta["type"] = "face"
                                amber_vector_store.add_embedding(face_emb, face_meta)
                                
                            embedding = body_emb  # Keep body_emb for existing journey tracking logic  
                            global_id, insight_msg = await journey_manager.process_detection(
                                str(self.camera_id), embedding, self._camera_name, frame_crop=frame
                            )
                            
                            if insight_msg:
                                #      Broadcast Live Cross-Camera Notification   
                                from app.api.v1.endpoints.websocket import ws_manager
                                asyncio.create_task(ws_manager.broadcast({
                                    "type": "journey_cross_camera",
                                    "data": {
                                        "global_id": global_id,
                                        "insight": insight_msg,
                                        "camera_id": str(self.camera_id),
                                        "camera_name": self._camera_name
                                    }
                                }))
                                # Also dispatch as a UI alert
                                asyncio.create_task(ws_manager.broadcast({
                                    "type": "alert",
                                    "data": {
                                        "id": f"trk-{global_id[:8]}-{int(now.timestamp())}",
                                        "type": "cross_camera_tracking",
                                        "risk_level": "medium",
                                        "severity": 40,
                                        "explanation": insight_msg,
                                        "created_at": now.isoformat(),
                                        "extra_data": {
                                            "risk_color": "violet",
                                            "camera_id": str(self.camera_id),
                                            "camera_name": self._camera_name,
                                            "target_id": global_id
                                        }
                                    }
                                }))
                        except Exception as e:
                            global_id = None
                            logger.error(f"ReID/Journey logic failed for cam {self.camera_id}: {e}")

                    scaled_boxes.append({
                        "id": obj.get("id", 0),
                        "global_id": global_id,
                        "confidence": conf,
                        "bbox": [float(x1), float(y1), float(x2), float(y2)]
                    })

            # Heatmap
            heatmap_frame = self.density_service.generate_heatmap(frame.shape, scaled_boxes)

            # Cache the latest frames for MJPEG streaming
            self._latest_annotated_frame = annotated_frame
            self._latest_heatmap_frame = heatmap_frame

            # ----------------------------------------------------------
            # DWELL TIME OVERLAY (new separate frame   non-breaking)
            # ----------------------------------------------------------
            # Refresh zone list every 150 frames (~5s at 30fps)
            if self._dwell_zone_refresh_counter <= 0:
                self._dwell_zone_refresh_counter = 150
                if hasattr(self, '_refresh_dwell_zones'):
                    asyncio.ensure_future(self._refresh_dwell_zones())
            self._dwell_zone_refresh_counter -= 1

            # --- Dwell Time Tracking Pass (Overlay and Intelligence) ---
            dwell_overlays = self.dwell_service.update(
                boxes=scaled_boxes,
                zones=self._dwell_zones,
                frame=frame,  # Pass frame so service can capture person snapshots
            )

            
            # --- SNAPSHOT CAPTURE: Waiting People ---
            for track in dwell_overlays:
                if track.get("needs_snapshot"):
                    # Trigger async snapshot capture
                    bbox = track.get("bbox")
                    track_id = track.get("track_id")
                    if bbox and track_id:
                        asyncio.create_task(self._capture_track_snapshot(track_id, bbox, frame))

            # Draw dwell overlay
            dwell_frame = annotated_frame.copy()
            for trk in dwell_overlays:
                bbox = trk["bbox"]
                if len(bbox) == 4:
                    x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                    secs = trk["dwell_seconds"]
                    mins = int(secs // 60)
                    label = f"ID{trk['track_id']} | {mins}m{int(secs%60)}s" if mins > 0 else f"ID{trk['track_id']} | {int(secs)}s"
                    if trk.get('zone'):
                        label += f"   {trk['zone'][:8]}"

                    # Orange bracket for dwell view
                    color = (0, 140, 255)
                    cv2.rectangle(dwell_frame, (x1, y1), (x2, y2), color, 2)
                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                    label_y = y1 - 6 if y1 > th + 8 else y2 + th + 6
                    cv2.rectangle(dwell_frame, (x1, label_y - th - 3), (x1 + tw + 6, label_y + 3), (0, 0, 0), -1)
                    cv2.putText(dwell_frame, label, (x1 + 3, label_y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 255), 1, cv2.LINE_AA)
            self._latest_dwell_frame = dwell_frame

            #    Intelligence Layer tick                                     
            # Synchronous   cheap pure-Python math, no I/O.
            try:
                self._latest_intelligence = self._intelligence.tick(
                    zone_id            = "camera",
                    count              = detected_count,
                    active_tracks      = dwell_overlays,
                    venue_id           = self._intel_venue_id,
                    venue_name         = self._intel_venue_name,
                    metric_id          = None,   # orchestrator generates its own UUID
                    capacity           = self._intel_capacity,
                    warning_threshold  = self._intel_warning_threshold,
                    critical_threshold = self._intel_critical_threshold,
                    model_metadata     = getattr(self, '_intel_model_metadata', None),
                )
                # Lazily prefetch venue metadata once per worker lifetime
                if not self._intel_venue_fetched:
                    if hasattr(self, '_fetch_intel_venue_meta'):
                        asyncio.ensure_future(self._fetch_intel_venue_meta())
                    self._intel_venue_fetched = True
            except Exception:
                pass  # intelligence layer is non-critical

            self._frames_processed += 1
            self._last_frame_time = now

            # ==========================================================
            # Step 4: Movement & Panic Detection ML Analysis
            # ==========================================================
            cur_velocity = 0.0
            cur_variance = 0.0
            cur_acceleration = 0.0
            panic_result = {}

            try:
                # Run every frame to maintain accurate velocity tracking
                config_for_panic = getattr(self, '_intel_model_metadata', None)
                panic_result = self.panic_detector.process_frame(
                    frame=frame,
                    current_crowd_count=detected_count,
                    camera_id=self.camera_id,
                    config=config_for_panic
                )
                
                # Extract movement metrics for ingestion
                cur_velocity = panic_result.get("avg_velocity", 0.0)
                # Fallback: use centroid-tracker speed when mediapipe finds no pose
                if cur_velocity < 0.5 and tracker_avg_velocity > 0.5:
                    cur_velocity = tracker_avg_velocity
                cur_variance = panic_result.get("variance", 0.0)
                cur_acceleration = panic_result.get("acceleration", 0.0)
            except Exception as e:
                logger.error(f"Movement analysis failed for camera {self.camera_id}: {e}")

            #      [LIVE BROADCAST] Push kinetics to WebSocket                   
            self._metrics_broadcast_counter += 1
            if self._metrics_broadcast_counter % 5 == 0: # Every ~5 frames for smoothness
                try:
                    # Calculate live risk_score from latest intelligence snapshot
                    live_risk_score = 10
                    live_risk_level = "low"
                    if getattr(self, '_latest_intelligence', None) and self._latest_intelligence:
                        live_risk_level = self._latest_intelligence.overall_risk_level
                        risk_map = {"low": 10, "medium": 40, "high": 75, "critical": 95}
                        live_risk_score = risk_map.get(live_risk_level, 10)

                    from app.api.v1.endpoints.websocket import ws_manager
                    asyncio.create_task(ws_manager.broadcast({
                        "type": "live_metrics",
                        "data": {
                            "camera_id": str(self.camera_id),
                            "venue_id": getattr(self, "_intel_venue_id", ""),
                            "velocity": round(float(cur_velocity), 2),
                            "variance": round(float(cur_variance), 3),
                            "acceleration": round(float(cur_acceleration), 2),
                            "count": detected_count,
                            "entries": self.entry_count,
                            "exits": self.exit_count,
                            "risk_score": live_risk_score,
                            "risk_level": live_risk_level,
                            "activity": {
                                "sitting": getattr(self, 'act_sitting', 0.0),
                                "standing": getattr(self, 'act_standing', 0.0),
                                "normal": getattr(self, 'act_normal', 0.0),
                                "walking": getattr(self, 'act_walking', 0.0)
                            },
                            "timestamp": now.isoformat()
                        }
                    }))
                except Exception as eval_err:
                    pass # Non-critical

            # ==========================================================
            # Step 5: PRODUCTION EFFICIENT SAVE LOGIC
            # ==========================================================
            should_save = False

            # Condition 1: First time
            if self._last_saved_count is None:
                should_save = True
            # Condition 2: Count changed
            elif detected_count != self._last_saved_count:
                should_save = True
            # Condition 3: Periodic snapshot
            elif self._last_state_save_time and (
                (now - self._last_state_save_time).total_seconds() >= self._state_snapshot_interval
            ):
                should_save = True

            if should_save:
                # ==========================================================
                # Step 6: Ingest frame count with movement metrics
                # ==========================================================
                from app.core.database import db_manager
                async with db_manager.session() as session:
                    await self._ingest_with_retry(
                        session=session,
                        camera_id=self.camera_id,
                        detected_count=detected_count,
                        confidence_avg=avg_confidence,
                        captured_at=now,
                        processing_time_ms=detect_time,
                        model_name="yolo11s" if self.detector else None,
                        velocity=cur_velocity,
                        variance=cur_variance,
                        acceleration=cur_acceleration,
                    )

                # Update state after successful save
                self._last_saved_count = detected_count
                self._last_state_save_time = now

            # ----------------------------------------------------------
            # SEMANTIC VAULT SNAPSHOT  (non-blocking, every 60 s)
            # Saves a full-resolution JPEG of the current frame so the
            # semantic search engine has rich historical frames to index.
            # ----------------------------------------------------------
            _now_ts = time.time()
            if (
                self._last_semantic_snapshot_time is None
                or (_now_ts - self._last_semantic_snapshot_time) >= self._semantic_snapshot_interval
            ):
                self._last_semantic_snapshot_time = _now_ts
                _snapshot_frame = frame.copy()
                _cam_id_str = str(self.camera_id)
                _ts_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                asyncio.get_event_loop().run_in_executor(
                    None,
                    self._write_semantic_snapshot,
                    _snapshot_frame,
                    _cam_id_str,
                    _ts_str,
                )

            # If panic triggered, dispatch critical alarm
            if panic_result.get("panic_detected"):
                import uuid
                from app.services.alert_engine_service import AlertEngineService
                from app.core.database import db_manager
                
                async def dispatch_panic_alarm():
                    async with db_manager.session() as alert_session:
                        from app.models.camera import Camera
                        from sqlalchemy import select
                        cam_res = await alert_session.execute(select(Camera).where(Camera.id == self.camera_id))
                        cam = cam_res.scalar_one_or_none()
                        
                        if cam:
                            decision = {
                                "venue_id": str(cam.venue_id),
                                "venue_name": cam.location_label or str(cam.venue_id),
                                "metric_id": str(uuid.uuid4()),
                                "metric_time": now.isoformat(),
                                "previous_level": "medium",
                                "current_level": "critical",
                                "transition": "escalated",
                                "trend": "rapidly_increasing",
                                "severity": 95,
                                "should_alert": True,
                                "reason": panic_result.get("reason", "  CROWD SURGE / PANIC DETECTED"),
                                "recommended_action": "HIGH RISK: Increase monitoring, prepare crowd control staff, and ensure exits are clear.",
                                "predicted_level": "CRITICAL",
                                "risk_score": 100.0,
                                "occupancy_percent": 100.0,
                                "early_warning_triggered": False,
                                "velocity": cur_velocity,
                                "direction_variance": cur_variance,
                                "acceleration": cur_acceleration,
                            }
                            alert_engine = AlertEngineService()
                            await alert_engine.process_decision(alert_session, decision=decision)
                
                asyncio.create_task(dispatch_panic_alarm())

            # Alert if processing too slow (moved to a higher threshold for unblocked 60FPS handling)
            total_time = (time.time() - frame_start) * 1000
            if total_time > (self.max_processing_time_ms * 4):
                logger.debug(
                    "Frame processing took longer than expected",
                    extra={
                        "camera_id": str(self.camera_id),
                        "processing_time_ms": round(total_time, 2),
                        "baseline_ms": self.max_processing_time_ms,
                    },
                )

        except Exception as e:
            self._failed_frames += 1
            self._last_error = str(e)
            self._last_error_time = datetime.now(timezone.utc)
            logger.error(
                "Frame processing failed",
                extra={
                    "camera_id": str(self.camera_id),
                    "error": str(e),
                },
                exc_info=True,
            )

    # ------------------------------------------------------------------
    # Semantic Vault Helper (runs in thread-pool executor – no async I/O)
    # ------------------------------------------------------------------
    def _write_semantic_snapshot(self, frame: np.ndarray, camera_id_str: str, ts_str: str) -> None:
        """Write a full-resolution JPEG to the semantic snapshot vault.

        Designed to run in a thread-pool executor so it never blocks the
        asyncio event loop.  One file is written per camera per 60 s.
        """
        import os
        try:
            snap_dir = os.path.join(os.getcwd(), "storage", "semantic_snapshots")
            os.makedirs(snap_dir, exist_ok=True)
            filename = f"{camera_id_str}_{ts_str}.jpg"
            save_path = os.path.join(snap_dir, filename)
            ok = cv2.imwrite(save_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            if ok:
                logger.info(
                    "Semantic snapshot saved",
                    extra={"camera_id": camera_id_str, "path": save_path},
                )
            else:
                logger.warning(
                    "Semantic snapshot write failed (cv2.imwrite returned False)",
                    extra={"camera_id": camera_id_str, "path": save_path},
                )
        except Exception as e:
            logger.error(f"Semantic snapshot error for camera {camera_id_str}: {e}")

    async def _capture_track_snapshot(self, track_id: int, bbox: List[int], frame: np.ndarray) -> None:
        """Captures a cropped snapshot of a specific tracked person."""
        try:
            import os
            import cv2
            import uuid

            # Ensure snapshot directory exists
            snapshot_dir = os.path.join("storage", "snapshots")
            if not os.path.exists(snapshot_dir):
                os.makedirs(snapshot_dir, exist_ok=True)

            # 1. Crop the person
            x1, y1, x2, y2 = map(int, bbox)
            h, w = frame.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            
            if (x2 - x1) < 10 or (y2 - y1) < 10:
                return

            crop = frame[y1:y2, x1:x2]
            
            # 2. Save the file
            filename = f"track_{self.camera_id}_{track_id}_{uuid.uuid4().hex[:8]}.jpg"
            save_path = os.path.join("storage", "snapshots", filename)
            abs_path = os.path.join(os.getcwd(), save_path)
            
            ok = cv2.imwrite(abs_path, crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
            
            if ok:
                # 3. Update the track in the service
                track = self.dwell_service._tracks.get(track_id)
                if track:
                    track.snapshot_captured = True
                    track.snapshot_path = save_path
                logger.info(f"Captured snapshot for track {track_id}: {save_path}")
        except Exception as e:
            logger.error(f"Failed to capture snapshot for track {track_id}: {e}")

    async def _fetch_intel_venue_meta(self) -> None:
        try:
            from app.core.database import db_manager
            from app.models.camera import Camera
            from app.models.venue import Venue
            from sqlalchemy import select
            async with db_manager.session() as s:
                cam_res = await s.execute(
                    select(Camera, Venue)
                    .join(Venue, Camera.venue_id == Venue.id)
                    .where(Camera.id == self.camera_id)
                )
                row = cam_res.first()
                if row:
                    cam, venue = row
                    self._intel_venue_id = str(venue.id)
                    self._intel_venue_name = venue.name
                    self._intel_capacity = venue.capacity
                    self._intel_warning_threshold = venue.warning_threshold
                    self._intel_critical_threshold = venue.critical_threshold
        except Exception as e:
            logger.error(f"Failed to fetch intel venue meta: {e}")

    def _get_save_reason(self, now: datetime, detected_count: int) -> str:
        """
        Determine why we are saving this frame state.
        """
        if self._last_saved_count is None:
            return "initial_state"

        if detected_count != self._last_saved_count:
            return "count_changed"

        if self._last_state_save_time and (
            (now - self._last_state_save_time).total_seconds()
            >= self._state_snapshot_interval
        ):
            return "periodic_snapshot"

        return "unknown"

    async def _save_detection_batch(self) -> None:
        """Save accumulated detections to database."""
        if not self._batch_detections:
            return

        count = len(self._batch_detections)

        try:
            async with db_manager.session() as session:
                saved = await self.detection_service.bulk_create_detections(
                    session, self._batch_detections
                )
                await session.commit()

                logger.info(
                    "Saved detection batch",
                    extra={
                        "camera_id": str(self.camera_id),
                        "detections": count,
                        "saved": saved,
                    }
                )

        except Exception as e:
            logger.error(
                "Failed to save detection batch",
                extra={
                    "camera_id": str(self.camera_id),
                    "detections": count,
                    "error": str(e),
                }
            )

        finally:
            self._batch_detections = []
            self._batch_frame_count = 0

    async def _fetch_intel_venue_meta(self) -> None:
        """Fetch venue capacity limits for dynamic intelligence thresholds."""
        try:
            from app.core.database import db_manager
            from app.models.camera import Camera
            from app.models.venue import Venue
            from sqlalchemy import select
            async with db_manager.session() as session:
                query = select(Camera, Venue).outerjoin(Venue, Camera.venue_id == Venue.id).where(Camera.id == self.camera_id)
                res = await session.execute(query)
                row = res.first()
                if row and row.Venue:
                    self._intel_venue_id = str(row.Venue.id)
                    self._intel_venue_name = row.Venue.name
                    self._intel_capacity = row.Venue.capacity
                    # Use absolute count thresholds (not percentages)
                    self._intel_warning_threshold = row.Venue.warning_threshold
                    self._intel_critical_threshold = row.Venue.critical_threshold
                    self._intel_model_metadata = row.Venue.model_metadata or {}
        except Exception as e:
            logger.error(f"Failed to fetch intel venue meta: {e}")

    async def _ingest_with_retry(
        self,
        session,
        max_retries: int = 3,
        **kwargs,
    ) -> None:
        """
        Ingest frame with exponential backoff retry.
        
        Args:
            session: Database session
            max_retries: Maximum retry attempts
            **kwargs: Frame ingestion parameters
        """
        for attempt in range(max_retries):
            try:
                await self.ingestion_service.ingest_frame(
                    session=session,
                    **kwargs
                )
                await session.commit()  # Commit after successful ingestion
                return
            except ValueError as e:
                # Validation errors (rate-limit, duplicate, inactive camera) are
                # not transient   retrying immediately will always fail.
                # Silently drop the frame and let the next cycle proceed normally.
                logger.debug(
                    "Frame skipped (validation)",
                    extra={
                        "camera_id": str(self.camera_id),
                        "reason": str(e),
                    },
                )
                await session.rollback()
                return
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(
                        "Frame ingestion failed after retries",
                        extra={
                            "camera_id": str(self.camera_id),
                            "error": str(e),
                            "attempts": max_retries,
                        },
                    )
                    raise

                wait_time = 0.5 * (2 ** attempt)  # Exponential backoff
                logger.warning(
                    "Frame ingestion failed, retrying",
                    extra={
                        "camera_id": str(self.camera_id),
                        "attempt": attempt + 1,
                        "wait_time": wait_time,
                        "error": str(e),
                    },
                )
                await asyncio.sleep(wait_time)
                await session.rollback()  # Rollback failed transaction

    def _update_quality_metrics(self, frame: np.ndarray) -> None:
        """Update frame quality metrics."""
        if frame is None or frame.size == 0:
            return

        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            self._avg_brightness = float(np.mean(gray))
            self._std_brightness = float(np.std(gray))
        except:
            pass  # Non-critical, continue

    # ==========================================================
    # Heartbeat
    # ==========================================================

    async def _heartbeat(self) -> None:
        """Periodic heartbeat for health monitoring and dwell DB flush."""
        try:
            while self._running:
                await asyncio.sleep(self.heartbeat_interval)

                if self._running:  # Check again after sleep
                    logger.info(
                        "Worker heartbeat",
                        extra={
                            "camera_id": str(self.camera_id),
                            "fps": self._calculate_fps(),
                            "frames_processed": self._frames_processed,
                            "avg_processing_ms": self._avg_processing_time(),
                            "source_healthy": self.source.is_healthy(),
                            "pending_detections": len(self._batch_detections),
                            "detection_enabled": self.detector is not None,
                            "last_saved_count": self._last_saved_count,
                            "last_save_ago": (
                                (datetime.now(timezone.utc) -
                                 self._last_state_save_time).total_seconds()
                                if self._last_state_save_time else None
                            ),
                        },
                    )

                    # Flush evicted dwell tracks to PostgreSQL and update Heartbeat
                    try:
                        from app.core.database import db_manager
                        from sqlalchemy import update
                        from app.models.camera import Camera
                        
                        async with db_manager.session() as session:
                            # 1. Dwell track flush
                            try:
                                if hasattr(self.dwell_service, '_evicted') and self.dwell_service._evicted:
                                    flushed = await self.dwell_service.flush_evicted_to_db(session)
                                    if flushed:
                                        logger.info(
                                            "Flushed dwell records to DB",
                                            extra={"camera_id": str(self.camera_id), "count": flushed},
                                        )
                            except Exception as e:
                                logger.warning(f"Dwell time DB flush failed: {str(e)}")
                            
                            # 2. Heartbeat update to prevent OFFLINE false positives
                            try:
                                await session.execute(
                                    update(Camera)
                                    .where(Camera.id == self.camera_id)
                                    .values(last_heartbeat_at=datetime.now(timezone.utc), is_online=True)
                                )
                                await session.commit()
                            except Exception as e:
                                logger.error(f"Heartbeat camera DB update failed: {str(e)}")
                                
                    except Exception as e:
                        logger.warning(
                            "Heartbeat overall loop failed entirely",
                            extra={"camera_id": str(self.camera_id), "error": str(e)},
                        )
        except (asyncio.CancelledError, KeyboardInterrupt):
            pass

    # ==========================================================
    # Health & Metrics
    # ==========================================================

    def _calculate_fps(self) -> float:
        """Calculate effective FPS over uptime."""
        if not self._start_time:
            return 0.0
        uptime = (datetime.now(timezone.utc) -
                  self._start_time).total_seconds()
        if uptime <= 0 or self._frames_processed == 0:
            return 0.0
        return round(self._frames_processed / uptime, 2)

    def _avg_processing_time(self) -> float:
        """Average processing time over last N frames."""
        if not self._processing_times:
            return 0.0
        return round(sum(self._processing_times) / len(self._processing_times), 2)

    def _p95_processing_time(self) -> float:
        """95th percentile processing time."""
        if not self._processing_times:
            return 0.0
        sorted_times = sorted(self._processing_times)
        idx = int(len(sorted_times) * 0.95)
        return round(sorted_times[idx], 2)

    def is_running(self) -> bool:
        """Check if worker is running."""
        return self._running and self._task is not None and not self._task.done()

    def get_latest_frame(self) -> Optional[np.ndarray]:
        """Get the latest annotated frame for MJPEG streaming."""
        return self._latest_annotated_frame

    def get_latest_frame_jpeg(self, quality: int = 70) -> Optional[bytes]:
        """Get the latest frame as JPEG bytes for MJPEG streaming.
        
        Returns pre-cached bytes encoded during frame processing   O(1), no encode overhead.
        Falls back to on-demand encode if cache is empty.
        """
        # Fast path: return pre-encoded cache (updated every processing cycle)
        cached = getattr(self, '_cached_jpeg_bytes', None)
        if cached is not None:
            return cached

        # Fallback: encode on demand (first frame before cache is ready)
        frame = self._latest_annotated_frame
        if frame is None:
            return None
        try:
            ret, buffer = cv2.imencode(
                '.jpg', frame,
                [cv2.IMWRITE_JPEG_QUALITY, getattr(self, '_cached_jpeg_quality', quality)]
            )
            if ret:
                return buffer.tobytes()
        except Exception:
            pass
        return None

    def get_latest_dwell_frame_jpeg(self, quality: int = 70) -> Optional[bytes]:
        """Get the dwell-time annotated frame as JPEG bytes (separate stream)."""
        frame = self._latest_dwell_frame
        if frame is None:
            return None
        try:
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
            if ret:
                return buffer.tobytes()
        except Exception:
            pass
        return None

    async def _refresh_dwell_zones(self) -> None:
        """Async background refresh of monitoring zones from DB."""
        try:
            from app.core.database import db_manager
            from app.models.dwell_monitor import MonitoringZone
            from sqlalchemy import select
            async with db_manager.session() as session:
                result = await session.execute(
                    select(MonitoringZone).where(
                        MonitoringZone.camera_id == self.camera_id,
                        MonitoringZone.is_active.is_(True),
                    )
                )
                zones = result.scalars().all()
                self._dwell_zones = [
                    {
                        "zone_name": z.zone_name,
                        "polygon_coordinates": z.polygon_coordinates,
                        "long_wait_threshold_seconds": z.long_wait_threshold_seconds,
                    }
                    for z in zones
                ]
        except Exception:
            pass  # Non-critical   zones will remain as-is until next refresh

    def get_latest_heatmap_jpeg(self, quality: int = 70) -> Optional[bytes]:
        """Get the latest heatmap frame as JPEG bytes."""
        frame = self._latest_heatmap_frame
        if frame is None:
            return None
        try:
            ret, buffer = cv2.imencode(
                '.jpg', frame,
                [cv2.IMWRITE_JPEG_QUALITY, quality]
            )
            if ret:
                return buffer.tobytes()
        except Exception:
            pass
        return None

    def get_latest_annotated_frame_jpeg(self, quality: int = 70) -> Optional[bytes]:
        """Get the latest standard annotated frame as JPEG bytes."""
        frame = getattr(self, "_latest_annotated_frame", None)
        if frame is None:
            return None
        try:
            ret, buffer = cv2.imencode(
                '.jpg', frame,
                [cv2.IMWRITE_JPEG_QUALITY, quality]
            )
            if ret:
                return buffer.tobytes()
        except Exception:
            pass
        return None

    async def get_status(self) -> Dict[str, Any]:
        """Get comprehensive worker status."""
        source_status = self.source.get_status() if hasattr(self.source, 'get_status') else {}

        return {
            "camera_id": str(self.camera_id),
            "running": self._running,
            "healthy": self.is_running() and source_status.get("healthy", False),
            "uptime_seconds": round((datetime.now(timezone.utc) - self._start_time).total_seconds(), 1) if self._start_time else 0,
            "frames": {
                "processed": self._frames_processed,
                "skipped": self._frames_skipped,
                "failed": self._failed_frames,
                "total": self._frames_processed + self._frames_skipped + self._failed_frames,
            },
            "performance": {
                "effective_fps": self._calculate_fps(),
                "avg_processing_ms": self._avg_processing_time(),
                "p95_processing_ms": self._p95_processing_time(),
                "target_fps": self.target_fps,
                "skip_factor": self.skip_factor,
            },
            "quality": {
                "avg_brightness": round(self._avg_brightness, 1),
                "std_brightness": round(self._std_brightness, 1),
            },
            "detections": {
                "pending": len(self._batch_detections),
                "batch_size": self.batch_size,
                "last_saved_count": self._last_saved_count,
                "last_saved_at": self._last_state_save_time.isoformat() if self._last_state_save_time else None,
                "snapshot_interval": self._state_snapshot_interval,
            },
            "detector": {
                "loaded": self.detector is not None,
                "device": getattr(self.detector, 'device', None) if self.detector else None,
            },
            "last_frame_time": self._last_frame_time.isoformat() if self._last_frame_time else None,
            "last_error": self._last_error,
            "last_error_time": self._last_error_time.isoformat() if self._last_error_time else None,
            "source": source_status,
        }

    async def wait_for_frame(self, timeout: float = 10.0) -> bool:
        """
        Wait for next frame to be processed.
        
        Args:
            timeout: Maximum wait time in seconds
        
        Returns:
            True if frame received, False if timeout
        """
        start_frames = self._frames_processed
        start_time = time.time()

        while self._running and time.time() - start_time < timeout:
            if self._frames_processed > start_frames:
                return True
            await asyncio.sleep(0.1)

        return False

    async def start_recording(self, clip_id: UUID, file_path: str, duration: int = 10) -> bool:
        """Start buffering frames for an evidence clip."""
        async with self._recording_lock:
            if self._is_recording:
                return False
            logger.info(f"Starting manual clip recording for {duration} seconds. Clip ID: {clip_id}")
            self._is_recording = True
            self._recording_clip_id = clip_id
            self._recording_file_path = file_path
            self._recording_frames = []
            self._recording_start_time = datetime.now(timezone.utc)
            self._recording_duration = duration
            return True

    async def _finish_recording(self) -> None:
        """Finish buffering and dispatch the save task asynchronously."""
        async with self._recording_lock:
            if not self._is_recording:
                return
            
            logger.info(f"Finished buffering clip. Dispatching save task for {len(self._recording_frames)} frames.")
            self._is_recording = False
            frames_to_save = list(self._recording_frames)
            
            # Fire and forget the IO-bound encoding workload
            # Use effective FPS or fallback to target_fps or 15
            fps = self._calculate_fps()
            if fps < 1:
                fps = self.target_fps if self.target_fps else 15.0
                
            asyncio.create_task(
                self.clip_service.save_frames_to_disk(
                    self._recording_clip_id,
                    self._recording_file_path,
                    frames_to_save,
                    fps,
                )
            )
            
            # Reset
            self._recording_clip_id = None
            self._recording_file_path = None
            self._recording_frames = []
            self._recording_start_time = None
