"""
Laminar - Frame Ingestion Service
----------------------------------

Production-grade AI ingestion pipeline.

Responsibilities:
- Accept processed AI detection results
- Validate camera state & tenant isolation
- Prevent duplicate frames (via frame_hash)
- Persist CrowdFrame records
- Update camera state (last_frame_at, online)
- Support bulk ingestion
- Trigger aggregation hooks (future-ready)
- Safe fallback handling
- FPS tracking and validation

Designed for:
- YOLO (local inference)
- Edge devices
- Ollama models
- Groq API
- Future async pipelines
"""

from typing import Optional, Dict, Any, List, Callable
from uuid import UUID
from datetime import datetime, timedelta,timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.camera import Camera
from app.models.crowd_frame import CrowdFrame
from app.core.repository import Repository
from app.core.logging import get_logger


logger = get_logger(__name__)


class FrameIngestionService:
    """
    Core ingestion service for AI processed frames.
    
    This service handles the critical path of AI data entering the system.
    It ensures data integrity, prevents duplicates, and maintains camera state.
    """

    DUPLICATE_WINDOW_SECONDS = 1  # Rate-limit window in seconds
    MAX_FPS_MULTIPLIER = 3        # Allow up to 3x configured FPS before blocking
    DEFAULT_MAX_FPS = 10          # Default safety ceiling when camera FPS not configured
    MAX_BATCH_SIZE = 1000         # Maximum frames per batch
    CONFIDENCE_THRESHOLD = 0.5    # Default confidence threshold

    def __init__(self):
        self.camera_repo = Repository[Camera](Camera)
        self.frame_repo = Repository[CrowdFrame](CrowdFrame)

    # ==========================================================
    # Private Helpers
    # ==========================================================

    def _calculate_confidence_met(
        self,
        confidence: Optional[float],
        bounding_boxes: Optional[Dict]
    ) -> bool:
        """
        Determine if detection meets confidence threshold.
        Checks both overall confidence and per-box confidences.
        """
        if confidence is not None and confidence >= self.CONFIDENCE_THRESHOLD:
            return True

        # Check bounding box confidences if available
        if bounding_boxes and "boxes" in bounding_boxes:
            box_confidences = [b.get("confidence", 0)
                               for b in bounding_boxes["boxes"]]
            if box_confidences:
                avg_confidence = sum(box_confidences) / len(box_confidences)
                return avg_confidence >= self.CONFIDENCE_THRESHOLD

        return False

    def _extract_region_counts(self, bounding_boxes: Optional[Dict]) -> Optional[Dict]:
        """
        Extract per-region counts from bounding boxes if available.
        Useful for zone-based analytics.
        """
        if not bounding_boxes or "regions" not in bounding_boxes:
            return None

        region_counts = {}
        for region, boxes in bounding_boxes["regions"].items():
            region_counts[region] = len(boxes)
        return region_counts

    def _validate_batch_size(self, frames: List[Dict]) -> None:
        """Validate batch size and log warning if too large."""
        if len(frames) > self.MAX_BATCH_SIZE:
            logger.warning(
                "Large batch detected, consider reducing batch size",
                extra_fields={
                    "batch_size": len(frames),
                    "max_recommended": self.MAX_BATCH_SIZE
                }
            )

    async def _check_duplicate_window(
        self,
        session: AsyncSession,
        camera_id: UUID,
        captured_at: datetime,
        configured_fps: Optional[float] = None,
    ) -> bool:
        """
        Check if frames are being submitted faster than physically possible.
        Returns True if rate is acceptable, False if clearly an infinite loop.

        The threshold is MAX_FPS_MULTIPLIER × configured_fps (or DEFAULT_MAX_FPS
        if the camera has no FPS setting). This allows normal burst capture while
        still blocking true infinite-loop scenarios.
        """
        # Compute the maximum allowed frames per window
        if configured_fps and configured_fps > 0:
            max_allowed = max(1, int(configured_fps * self.MAX_FPS_MULTIPLIER * self.DUPLICATE_WINDOW_SECONDS))
        else:
            max_allowed = max(1, int(self.DEFAULT_MAX_FPS * self.DUPLICATE_WINDOW_SECONDS))

        window_start = captured_at - timedelta(seconds=self.DUPLICATE_WINDOW_SECONDS)

        stmt = (
            select(func.count())
            .select_from(CrowdFrame)
            .where(CrowdFrame.camera_id == camera_id)
            .where(CrowdFrame.captured_at >= window_start)
        )

        result = await session.execute(stmt)
        frame_count = result.scalar_one() or 0

        if frame_count >= max_allowed:
            logger.warning(
                "Frame rate exceeds safety limit (possible infinite loop)",
                extra_fields={
                    "camera_id": str(camera_id),
                    "frames_in_window": frame_count,
                    "max_allowed": max_allowed,
                    "window_seconds": self.DUPLICATE_WINDOW_SECONDS,
                }
            )
            return False

        return True

    async def _update_camera_state(
        self,
        session: AsyncSession,
        camera: Camera,
        captured_at: datetime,
    ) -> None:
        """
        Update camera state based on frame ingestion.
        Tracks FPS, last frame time, and health status.
        """
        update_data = {
            "last_frame_at": captured_at,
            "is_online": True,
        }

        # Calculate current FPS
        if camera.last_frame_at and camera.fps:
            time_diff = (captured_at - camera.last_frame_at).total_seconds()
            if time_diff > 0:
                current_fps = 1.0 / time_diff
                # Smooth with existing value to avoid spikes
                smoothed_fps = (current_fps + (camera.fps or 0)) / 2
                update_data["fps_current"] = round(smoothed_fps, 2)

                # Check if exceeding configured FPS
                if current_fps > camera.fps * 1.2:  # 20% tolerance
                    logger.warning(
                        "Frame rate exceeds configured FPS",
                        extra_fields={
                            "camera_id": str(camera.id),
                            "configured_fps": camera.fps,
                            "current_fps": round(current_fps, 2),
                        }
                    )

        await self.camera_repo.update(
            session,
            camera,
            update_data,
            commit=True,
        )

    async def _trigger_aggregation(
        self,
        session: AsyncSession,
        camera_id: UUID,
        captured_at: datetime,
    ) -> None:
        """
        Trigger analytics aggregation and risk engine.

        Pipeline:
        CrowdFrame → CrowdMetric → RiskEngine → Alerts
        """

        from app.services.metric_aggregation_service import MetricAggregationService
        from app.services.risk_engine_service import RiskEngineService

        try:

            metric_service = MetricAggregationService()
            risk_engine = RiskEngineService()

            # Step 1 — aggregate frames into metrics
            await metric_service.aggregate_minute(
                session=session,
                camera_id=camera_id,
                timestamp=captured_at,
            )

            # Step 2 — compute venue risk (Handled by aggregate_minute already)

            logger.debug(
                "Aggregation + risk evaluation executed",
                extra_fields={
                    "camera_id": str(camera_id),
                    "timestamp": captured_at.isoformat()
                }
            )

        except Exception as e:

            await session.rollback()   # 🔥 CRITICAL FIX

            logger.error(
                "Aggregation pipeline failed",
                extra_fields={
                    "camera_id": str(camera_id),
                    "error": str(e)
                },
                exc_info=True
            )

    # ==========================================================
    # Public Ingestion Entry
    # ==========================================================

    async def ingest_frame(
        self,
        session: AsyncSession,
        *,
        camera_id: UUID,
        detected_count: int,
        captured_at: Optional[datetime] = None,
        bounding_boxes: Optional[Dict[str, Any]] = None,
        confidence_avg: Optional[float] = None,
        model_name: Optional[str] = None,
        model_version: Optional[str] = None,
        processing_time_ms: Optional[float] = None,
        frame_hash: Optional[str] = None,
        image_reference: Optional[str] = None,
        tenant_id: Optional[UUID] = None,
    ) -> CrowdFrame:
        """
        Ingest single processed frame result.
        
        This method is called by:
        - YOLO worker
        - Edge device
        - External AI microservice
        
        Performs comprehensive validation and updates camera state.
        """
        # 1️⃣ Validate camera
        camera = await self.camera_repo.get_by_id(session, camera_id)
        if not camera:
            raise ValueError("Camera not found.")

        # Tenant isolation
        if tenant_id and hasattr(camera, "tenant_id"):
            if camera.tenant_id != tenant_id:
                raise ValueError("Camera not found in this tenant.")

        # Camera operational state
        if not camera.is_active:
            raise ValueError("Camera is not active.")
        if not camera.monitoring_enabled:
            raise ValueError("Monitoring disabled for this camera.")
        if not camera.detection_enabled:
            raise ValueError("Detection disabled for this camera.")

        # 2️⃣ Basic input validation
        if detected_count < 0:
            raise ValueError("detected_count cannot be negative.")

        if confidence_avg is not None:
            if confidence_avg < 0 or confidence_avg > 1:
                raise ValueError("confidence_avg must be between 0 and 1.")

        if processing_time_ms is not None and processing_time_ms < 0:
            raise ValueError("processing_time_ms cannot be negative.")

        captured_at = captured_at or datetime.now(timezone.utc)

        # 3️⃣ Duplicate prevention (hash-based)
        if frame_hash:
            duplicate = await self.frame_repo.exists(
                session,
                filters={"frame_hash": frame_hash},
            )
            if duplicate:
                logger.warning(
                    "Duplicate frame skipped (hash match)",
                    extra_fields={"camera_id": str(camera_id)},
                )
                raise ValueError("Duplicate frame detected.")

        # 4️⃣ Rate limit check (only blocks genuine infinite loops, not normal FPS)
        rate_ok = await self._check_duplicate_window(
            session, camera_id, captured_at, configured_fps=camera.fps
        )
        if not rate_ok:
            raise ValueError("Frame rate too high - possible infinite loop")

        # 5️⃣ Create frame record with enhanced fields
        region_counts = self._extract_region_counts(bounding_boxes)

        frame = CrowdFrame(
            camera_id=camera_id,
            captured_at=captured_at,
            detected_count=detected_count,
            bounding_boxes=bounding_boxes,
            detection_confidence_avg=confidence_avg,
            confidence_threshold_met=self._calculate_confidence_met(
                confidence_avg, bounding_boxes
            ),
            region_detections=region_counts,
            model_name=model_name,
            model_version=model_version,
            processing_time_ms=processing_time_ms,
            frame_hash=frame_hash,
            image_reference=image_reference,
        )

        created_frame = await self.frame_repo.create(
            session,
            frame,
            commit=True,
        )

        # 6️⃣ Update camera state
        await self._update_camera_state(session, camera, captured_at)

        # NOTE: Aggregation (metric_aggregation_service) is intentionally NOT triggered here.
        # It runs on a 1-minute scheduler job (minute_pipeline) to avoid issuing a heavy
        # crowd_frames JOIN query on every single frame save (which caused 30s DB timeouts).

        logger.info(
            "Frame ingested successfully",
            extra_fields={
                "camera_id": str(camera_id),
                "detected_count": detected_count,
                "model": model_name,
                "processing_time_ms": processing_time_ms,
                "confidence_met": frame.confidence_threshold_met,
            },
        )

        return created_frame

    # ==========================================================
    # Bulk Ingestion (High FPS Support)
    # ==========================================================

    async def bulk_ingest(
        self,
        session: AsyncSession,
        *,
        camera_id: UUID,
        frames: List[Dict[str, Any]],
        tenant_id: Optional[UUID] = None,
    ) -> int:
        """
        High-performance batch ingestion.
        
        Processes multiple frames in a single transaction.
        Invalid frames are skipped with warnings.
        """
        # Validate camera once for performance
        camera = await self.camera_repo.get_by_id(session, camera_id)
        if not camera:
            raise ValueError("Camera not found.")

        if tenant_id and hasattr(camera, "tenant_id"):
            if camera.tenant_id != tenant_id:
                raise ValueError("Camera not found in this tenant.")

        # Check batch size
        self._validate_batch_size(frames)

        objects = []
        skipped = 0
        latest_capture = camera.last_frame_at or datetime.now(timezone.utc)

        for idx, f in enumerate(frames):
            try:
                # Skip invalid counts
                if f.get("detected_count", -1) < 0:
                    skipped += 1
                    continue

                captured_at = f.get("captured_at", datetime.now(timezone.utc))
                latest_capture = max(latest_capture, captured_at)

                # Optional duplicate check for bulk (can be expensive)
                frame_hash = f.get("frame_hash")
                if frame_hash:
                    # For bulk, we skip hash check for performance
                    # Could implement batch hash check if needed
                    pass

                confidence_avg = f.get("confidence_avg")
                bounding_boxes = f.get("bounding_boxes")

                objects.append(
                    CrowdFrame(
                        camera_id=camera_id,
                        captured_at=captured_at,
                        detected_count=f["detected_count"],
                        bounding_boxes=bounding_boxes,
                        detection_confidence_avg=confidence_avg,
                        confidence_threshold_met=self._calculate_confidence_met(
                            confidence_avg, bounding_boxes
                        ),
                        region_detections=self._extract_region_counts(
                            bounding_boxes),
                        model_name=f.get("model_name"),
                        model_version=f.get("model_version"),
                        processing_time_ms=f.get("processing_time_ms"),
                        frame_hash=frame_hash,
                        image_reference=f.get("image_reference"),
                    )
                )

            except (KeyError, ValueError) as e:
                skipped += 1
                logger.warning(
                    "Skipping invalid frame in bulk ingest",
                    extra_fields={
                        "camera_id": str(camera_id),
                        "frame_index": idx,
                        "error": str(e),
                    }
                )
                continue

        if not objects:
            logger.warning("No valid frames in bulk ingest",
                           extra_fields={"camera_id": str(camera_id)})
            return 0

        # Bulk insert
        await self.frame_repo.bulk_create(
            session,
            objects,
            commit=True,
        )

        # Update camera state once for the batch
        await self._update_camera_state(session, camera, latest_capture)

        logger.info(
            "Bulk ingestion completed",
            extra_fields={
                "camera_id": str(camera_id),
                "frame_count": len(objects),
                "skipped": skipped,
            },
        )

        return len(objects)

    # ==========================================================
    # Monitoring Utilities
    # ==========================================================

    async def get_recent_frame_count(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        minutes: int = 5,
    ) -> int:
        """
        Get number of frames in last N minutes.
        Used to detect stalled pipelines.
        """
        since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

        stmt = (
            select(func.count())
            .where(CrowdFrame.camera_id == camera_id)
            .where(CrowdFrame.captured_at >= since)
        )

        result = await session.execute(stmt)
        return result.scalar_one()

    async def get_camera_ingestion_stats(
        self,
        session: AsyncSession,
        camera_id: UUID,
        *,
        tenant_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """
        Get ingestion statistics for a camera.
        Useful for monitoring dashboards.
        """
        camera = await self.camera_repo.get_by_id(session, camera_id)
        if not camera:
            raise ValueError("Camera not found.")

        if tenant_id and hasattr(camera, "tenant_id") and camera.tenant_id != tenant_id:
            raise ValueError("Camera not found in this tenant.")

        # Get counts for different time windows
        now = datetime.now(timezone.utc)
        windows = {
            "last_5_min": 5,
            "last_15_min": 15,
            "last_hour": 60,
            "last_day": 1440,
        }

        stats = {
            "camera_id": str(camera_id),
            "camera_name": camera.name,
        }

        for window_name, minutes in windows.items():
            count = await self.get_recent_frame_count(
                session,
                camera_id,
                minutes=minutes
            )
            stats[window_name] = count

        # Calculate average FPS if available
        if stats["last_5_min"] > 0:
            stats["avg_fps_last_5min"] = round(
                stats["last_5_min"] / (5 * 60), 2)
        else:
            stats["avg_fps_last_5min"] = 0

        return stats

    # ==========================================================
    # Safe Fallback Wrapper
    # ==========================================================

    async def ingest_with_fallback(
        self,
        session: AsyncSession,
        *,
        fallback_writer: Optional[Callable] = None,
        **kwargs,
    ) -> Optional[CrowdFrame]:
        """
        Ingest with fallback mechanism.
        
        If database ingestion fails, attempts to write to fallback.
        Fallback writer should accept a single dictionary argument.
        """
        try:
            return await self.ingest_frame(session, **kwargs)

        except ValueError as e:
            # Validation errors should not trigger fallback
            logger.warning(
                "Frame validation failed",
                extra_fields={"error": str(e), **kwargs}
            )
            raise

        except Exception as e:
            logger.error(
                "Frame ingestion failed - activating fallback",
                extra_fields={
                    "error": str(e),
                    "camera_id": str(kwargs.get("camera_id"))
                },
            )

            if fallback_writer:
                try:
                    # Prepare minimal data for fallback
                    fallback_data = {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "error": str(e),
                        **kwargs
                    }
                    fallback_writer(fallback_data)

                    logger.info(
                        "Frame written to fallback storage",
                        extra_fields={"camera_id": str(
                            kwargs.get("camera_id"))}
                    )
                except Exception as fallback_error:
                    logger.critical(
                        "Fallback writer failed",
                        extra_fields={"error": str(fallback_error)},
                    )

            return None

    async def bulk_ingest_with_fallback(
        self,
        session: AsyncSession,
        *,
        camera_id: UUID,
        frames: List[Dict[str, Any]],
        fallback_writer: Optional[Callable] = None,
        tenant_id: Optional[UUID] = None,
    ) -> int:
        """
        Bulk ingest with fallback for critical failures.
        """
        try:
            return await self.bulk_ingest(
                session,
                camera_id=camera_id,
                frames=frames,
                tenant_id=tenant_id,
            )

        except Exception as e:
            logger.error(
                "Bulk ingestion failed - activating fallback",
                extra_fields={
                    "error": str(e),
                    "camera_id": str(camera_id),
                    "frame_count": len(frames)
                },
            )

            if fallback_writer:
                try:
                    fallback_data = {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "camera_id": str(camera_id),
                        "error": str(e),
                        "frames": frames,
                        "tenant_id": str(tenant_id) if tenant_id else None,
                    }
                    fallback_writer(fallback_data)
                except Exception as fallback_error:
                    logger.critical(
                        "Bulk fallback writer failed",
                        extra_fields={"error": str(fallback_error)},
                    )

            return 0
