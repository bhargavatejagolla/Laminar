"""
Laminar - Vision Stream Worker
-------------------------------

Connects: CameraSource → YOLODetector → FrameIngestionService → DetectionStorage

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
        batch_size: int = 1,          # ✅ ZERO-LAG: Flush every single detection immediately
        enable_detection: bool = True,
        static_diff_threshold: float = 0.4,   # ✅ SUPER SENSITIVE: Minimum movement triggers fresh YOLO
        health_check_interval: int = 15,       # ✅ Health check every 15 frames for faster connectivity alerts
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

        # Dwell time tracking (separate frame, non-breaking)
        self.dwell_service = get_dwell_service(camera_id)
        self._latest_dwell_frame: Optional[np.ndarray] = None
        self._dwell_zones: list = []   # cached zones for overlay; refreshed async
        self._dwell_zone_refresh_counter: int = 0

        # ── Intelligence Layer ────────────────────────────────────────────────
        # One orchestrator per camera — coordinates surge/dwell/flow engines.
        self._intelligence = get_zone_orchestrator(str(camera_id))
        self._latest_intelligence = None   # ZoneIntelligenceSnapshot, for API
        # Lazily fetched venue metadata (avoid per-frame DB hit)
        self._intel_venue_id: Optional[str]   = None
        self._intel_venue_name: Optional[str] = None
        self._intel_venue_fetched: bool        = False
        self._intel_capacity: Optional[int] = None
        self._intel_warning_threshold: Optional[int] = None
        self._intel_critical_threshold: Optional[int] = None

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

        # Metrics
        self._frames_processed = 0
        self._frames_skipped = 0
        self._failed_frames = 0
        self._processing_times: deque = deque(maxlen=100)
        self._avg_brightness: float = 0.0
        self._std_brightness: float = 0.0
        self._last_error: Optional[str] = None
        self._last_error_time: Optional[datetime] = None

        # ✅ Per-camera state for frame-diff skip and health rate-limiting
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
        self._last_saved_count = None
        self._last_state_save_time = None

        # Create tasks
        self._task = asyncio.create_task(self._run())
        self._heartbeat_task = asyncio.create_task(self._heartbeat())

        # 🚀 INSTANT-READY: Force an immediate tick to register the orchestrator
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
        """Main async processing loop."""
        logger.info(
            "Stream loop started",
            extra={"camera_id": str(self.camera_id)},
        )

        frame_counter = 0

        while self._running:
            try:
                loop_start = time.time()

                # Check source health
                if not self.source.is_healthy():
                    if self._unhealthy_since is None:
                        self._unhealthy_since = time.time()

                    # --- REPORT OFFLINE TO DB ---
                    if self._last_health_status != "offline":
                        self._last_health_status = "offline"
                        async def set_offline():
                            from app.core.database import db_manager
                            from app.models.camera import Camera
                            from sqlalchemy import select
                            async with db_manager.session() as s:
                                cam_res = await s.execute(select(Camera).where(Camera.id == self.camera_id))
                                cam = cam_res.scalar_one_or_none()
                                if cam:
                                    await self.health_service.update_camera_health(s, cam, "offline")
                        asyncio.create_task(set_offline())
                    
                    unhealthy_duration = time.time() - self._unhealthy_since
                    # Exponential backoff up to 10 seconds
                    backoff = min(10.0, 2.0 * (1.5 ** (unhealthy_duration / 5.0)))

                    # If unhealthy for > 30s, try to restart the source internally
                    if unhealthy_duration > 30.0:
                        if self._last_source_restart is None or (time.time() - self._last_source_restart) > 60.0:
                            logger.error(
                                "Source unhealthy for >30s, attempting internal restart.",
                                extra={"camera_id": str(self.camera_id)}
                            )
                            self._last_source_restart = time.time()
                            try:
                                # ✅ FASTER RECOVERY: Reset health state upon restart attempt
                                self._unhealthy_since = None
                                self._last_health_status = None
                                
                                loop = asyncio.get_event_loop()
                                await loop.run_in_executor(None, self.source.stop)
                                await loop.run_in_executor(None, self.source.start)
                            except Exception as e:
                                logger.error(f"Internal source restart failed: {e}")

                    logger.warning(
                        f"Camera source unhealthy for {unhealthy_duration:.1f}s, waiting {backoff:.1f}s...",
                        extra={"camera_id": str(self.camera_id)},
                    )
                    # ── Intelligence tick with count=0 when source is unhealthy ─────
                    # This ensures the orchestrator transitions from warming_up → active
                    # (with 0 density) even while offline, so the dashboard shows
                    # the correct status instead of being stuck at warming_up forever.
                    try:
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
                    except Exception:
                        pass

                    await asyncio.sleep(backoff)
                    continue
                else:
                    self._unhealthy_since = None

                # Read frame
                result = await self.source.read()
                if result is None:
                    await asyncio.sleep(0.05)
                    continue

                success, frame = result
                if not success or frame is None:
                    self._failed_frames += 1
                    await asyncio.sleep(0.05)
                    continue

                # Frame skipping for performance
                frame_counter += 1
                if frame_counter % self.skip_factor != 0:
                    self._frames_skipped += 1
                    continue

                # Process frame
                await self._process_frame(frame)

                # Prevent tight loop CPU spike and enforce FPS
                if self.target_fps and self.target_fps > 0:
                    elapsed = time.time() - loop_start
                    target_interval = 1.0 / self.target_fps
                    if elapsed < target_interval:
                        await asyncio.sleep(target_interval - elapsed)
                else:
                    await asyncio.sleep(0)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self._last_error = str(e)
                self._last_error_time = datetime.now(timezone.utc)
                logger.error(
                    "Stream worker error",
                    extra={
                        "camera_id": str(self.camera_id),
                        "error": str(e),
                    },
                    exc_info=True,
                )
                await asyncio.sleep(1)  # Prevent rapid failure loop

        logger.info(
            "Stream loop stopped",
            extra={"camera_id": str(self.camera_id)},
        )

    async def _process_frame(self, frame: np.ndarray) -> None:
        """
        Process a single frame: detect → ingest → store detections.
        
        Args:
            frame: BGR/RGB frame from camera
        """
        frame_start = time.time()
        now = datetime.now(timezone.utc)

        try:
            # Update quality metrics
            self._update_quality_metrics(frame)

            # ==========================================================
            # Health check (rate-limited — only every N frames)
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
            # Downscale to 80x80 grayscale — fast, cheap, good diff signal
            small = cv2.resize(frame, (80, 80), interpolation=cv2.INTER_NEAREST)
            gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            scene_changed = True
            self._frame_count_for_forced += 1
            is_forced = self._frame_count_for_forced >= 3  # ✅ LIVE PERSISTENCE: Force YOLO every 3 frames (~0.1s)

            boxes: list = []
            detect_time: float = 0.0

            if self._prev_gray_frame is not None and not is_forced:
                diff = float(np.mean(np.abs(gray.astype(np.int16) - self._prev_gray_frame.astype(np.int16))))
                if diff < self.static_diff_threshold:
                    # Scene is static — reuse last YOLO result, skip inference entirely
                    scene_changed = False
                    detected_count, avg_confidence = self._last_detection_result
                    # detect_time stays 0.0 (no inference ran)

            if is_forced:
                self._frame_count_for_forced = 0

            self._prev_gray_frame = gray

            if self.detector and scene_changed:
                # ✅ PERFORMANCE FIX: Run YOLO in thread executor so the async event loop
                # is NEVER blocked by 100-250ms CPU inference. Each camera worker runs
                # independently — no cross-camera interference.
                loop = asyncio.get_event_loop()
                detection_result = await loop.run_in_executor(
                    None,
                    lambda: self.detector.detect_people(frame, return_boxes=True, max_boxes=500)
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

            elif not self.detector:
                detected_count = 0
                avg_confidence = 0.0
                boxes = []
                detect_time = 0.0

            # --- Annotation ---
            scaled_boxes = []
            orig_h, orig_w = frame.shape[:2]
            
            for obj in boxes:
                box = obj.get("bbox")
                conf = obj.get("confidence", 0.0)
                if box and len(box) == 4:
                    # ✅ ACCURACY FIX: Coordinates from detector.detect_people are ALREADY 
                    # in original frame space (un-letterboxed). Do NOT scale them again.
                    x1, y1, x2, y2 = map(int, box)

                    # Keep in bounds
                    x1 = max(0, min(orig_w - 1, x1))
                    y1 = max(0, min(orig_h - 1, y1))
                    x2 = max(0, min(orig_w - 1, x2))
                    y2 = max(0, min(orig_h - 1, y2))

                    bw = x2 - x1
                    bh = y2 - y1
                    if bw < 4 or bh < 4: continue

                    # Visuals
                    color = (0, 255, 80)
                    thickness = 2
                    corner_len = max(12, min(bw, bh) // 5)
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 200, 60), 1)
                    cv2.line(annotated_frame, (x1, y1), (x1 + corner_len, y1), color, thickness)
                    cv2.line(annotated_frame, (x1, y1), (x1, y1 + corner_len), color, thickness)
                    cv2.line(annotated_frame, (x2, y1), (x2 - corner_len, y1), color, thickness)
                    cv2.line(annotated_frame, (x2, y1), (x2, y1 + corner_len), color, thickness)
                    cv2.line(annotated_frame, (x1, y2), (x1 + corner_len, y2), color, thickness)
                    cv2.line(annotated_frame, (x1, y2), (x1, y2 - corner_len), color, thickness)
                    cv2.line(annotated_frame, (x2, y2), (x2 - corner_len, y2), color, thickness)
                    cv2.line(annotated_frame, (x2, y2), (x2, y2 - corner_len), color, thickness)

                    label = f"person {conf:.2f}"
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale = max(0.35, min(0.55, bw / 200))
                    (tw, th), _ = cv2.getTextSize(label, font, font_scale, 1)
                    label_y = y1 - 6 if y1 > th + 8 else y2 + th + 6
                    cv2.rectangle(annotated_frame, (x1, label_y - th - 3), (x1 + tw + 6, label_y + 3), (0, 0, 0), -1)
                    cv2.putText(annotated_frame, label, (x1 + 3, label_y), font, font_scale, (0, 255, 80), 1, cv2.LINE_AA)

                    # ── 🔴 [LIVE INTELLIGENCE] ReID & Journey Tracking ──────────────────
                    from app.services.reid_service import reid_service
                    from app.services.journey_manager_service import journey_manager
                    
                    try:
                        embedding = reid_service.extract_embedding(frame, [x1, y1, x2, y2])
                        global_id, insight_msg = journey_manager.process_detection(
                            str(self.camera_id), embedding, self._camera_name
                        )
                        
                        if insight_msg:
                            # ── 🔴 Broadcast Live Cross-Camera Notification ──
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
            # DWELL TIME OVERLAY (new separate frame — non-breaking)
            # ----------------------------------------------------------
            # Refresh zone list every 150 frames (~5s at 30fps)
            if self._dwell_zone_refresh_counter <= 0:
                self._dwell_zone_refresh_counter = 150
                if hasattr(self, '_refresh_dwell_zones'):
                    asyncio.ensure_future(self._refresh_dwell_zones())
            self._dwell_zone_refresh_counter -= 1

            active_tracks = self.dwell_service.update(
                boxes=scaled_boxes,
                zones=self._dwell_zones,
            )

            # Draw dwell overlay
            dwell_frame = annotated_frame.copy()
            for trk in active_tracks:
                bbox = trk["bbox"]
                if len(bbox) == 4:
                    x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                    secs = trk["dwell_seconds"]
                    mins = int(secs // 60)
                    label = f"ID{trk['track_id']} | {mins}m{int(secs%60)}s" if mins > 0 else f"ID{trk['track_id']} | {int(secs)}s"
                    if trk.get('zone'):
                        label += f" · {trk['zone'][:8]}"

                    # Orange bracket for dwell view
                    color = (0, 140, 255)
                    cv2.rectangle(dwell_frame, (x1, y1), (x2, y2), color, 2)
                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                    label_y = y1 - 6 if y1 > th + 8 else y2 + th + 6
                    cv2.rectangle(dwell_frame, (x1, label_y - th - 3), (x1 + tw + 6, label_y + 3), (0, 0, 0), -1)
                    cv2.putText(dwell_frame, label, (x1 + 3, label_y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 255), 1, cv2.LINE_AA)
            self._latest_dwell_frame = dwell_frame

            # ── Intelligence Layer tick ────────────────────────────────────
            # Synchronous — cheap pure-Python math, no I/O.
            try:
                self._latest_intelligence = self._intelligence.tick(
                    zone_id            = "camera",
                    count              = detected_count,
                    active_tracks      = active_tracks,
                    venue_id           = self._intel_venue_id,
                    venue_name         = self._intel_venue_name,
                    metric_id          = None,   # orchestrator generates its own UUID
                    capacity           = self._intel_capacity,
                    warning_threshold  = self._intel_warning_threshold,
                    critical_threshold = self._intel_critical_threshold,
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
                panic_result = self.panic_detector.process_frame(
                    frame=frame,
                    current_crowd_count=detected_count,
                    camera_id=self.camera_id
                )
                
                # Extract movement metrics for ingestion
                cur_velocity = panic_result.get("avg_velocity", 0.0)
                cur_variance = panic_result.get("variance", 0.0)
                cur_acceleration = panic_result.get("acceleration", 0.0)
            except Exception as e:
                logger.error(f"Movement analysis failed for camera {self.camera_id}: {e}")

            # ── 🔴 [LIVE BROADCAST] Push kinetics to WebSocket ──────────────────
            self._metrics_broadcast_counter += 1
            if self._metrics_broadcast_counter % 5 == 0: # Every ~5 frames for smoothness
                try:
                    from app.api.v1.endpoints.websocket import ws_manager
                    asyncio.create_task(ws_manager.broadcast({
                        "type": "live_metrics",
                        "data": {
                            "camera_id": str(self.camera_id),
                            "velocity": round(float(cur_velocity), 2),
                            "variance": round(float(cur_variance), 3),
                            "acceleration": round(float(cur_acceleration), 2),
                            "count": detected_count,
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
                                "recommended_action": panic_result.get("reason", "🚨 CROWD SURGE / PANIC DETECTED"),
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
                # not transient — retrying immediately will always fail.
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

                # Flush evicted dwell tracks to PostgreSQL
                try:
                    if self.dwell_service._evicted:
                        async with db_manager.session() as session:
                            flushed = await self.dwell_service.flush_evicted_to_db(session)
                            if flushed:
                                logger.info(
                                    "Flushed dwell records to DB",
                                    extra={"camera_id": str(self.camera_id), "count": flushed},
                                )
                except Exception as e:
                    logger.warning(
                        "Dwell flush failed",
                        extra={"camera_id": str(self.camera_id), "error": str(e)},
                    )

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
        """Get the latest frame as JPEG bytes for MJPEG streaming."""
        frame = self._latest_annotated_frame
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
            pass  # Non-critical — zones will remain as-is until next refresh

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

    def get_latest_dwell_frame_jpeg(self, quality: int = 70) -> Optional[bytes]:
        """Get the latest dwell-annotated frame as JPEG bytes."""
        frame = getattr(self, "_latest_dwell_frame", None)
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
