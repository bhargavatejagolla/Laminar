"""
Laminar - Metric Aggregation Service
-------------------------------------

Transforms raw CrowdFrame data into structured CrowdMetric intelligence.

Responsibilities:
- Minute-level aggregation
- Hour-level rollups
- Rolling averages
- Occupancy calculation
- Risk score computation
- Growth rate analysis
- Anomaly detection hooks
- Forecast hooks (ML ready)
- Tenant isolation
- Strong idempotency guarantees
- Zero-only minute stabilization
"""

from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, timedelta, timezone
import statistics

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.exc import IntegrityError

from app.models.camera import Camera
from app.models.venue import Venue
from app.models.crowd_frame import CrowdFrame
from app.models.crowd_metric import CrowdMetric
from app.core.repository import Repository
from app.core.logging import get_logger


logger = get_logger(__name__)


class MetricAggregationService:
    """
    Service for aggregating raw frame data into intelligence metrics.
    
    This is the core analytics engine of Laminar, transforming
    raw detections into actionable insights.
    """
    MIN_FRAMES_PER_MINUTE = 1  # Accept even 1 frame per minute to ensure metrics are always stored
    SKIP_ZERO_ONLY_MINUTES = False  # Avoid storing pure-zero minute metrics

    def __init__(self):

        self.camera_repo = Repository[Camera](Camera)
        self.venue_repo = Repository[Venue](Venue)
        self.frame_repo = Repository[CrowdFrame](CrowdFrame)
        self.metric_repo = Repository[CrowdMetric](CrowdMetric)

    # ==========================================================
    # Private Helpers
    # ==========================================================

    async def _get_historical_stats(
        self,
        session: AsyncSession,
        venue_id: UUID,
        hours: int = 24,
    ) -> Dict[str, float]:
        """Get historical statistics for anomaly detection."""

        since = datetime.now(timezone.utc) - timedelta(hours=hours)

        stmt = (
            select(
                func.avg(CrowdMetric.avg_count),
                func.stddev(CrowdMetric.avg_count),
            )
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= since)
            .where(CrowdMetric.bucket_type == "minute")
        )

        result = await session.execute(stmt)
        row = result.one_or_none()

        # Handle empty result set safely
        if not row:
            return {
                "historical_avg": 0.0,
                "std_dev": 1.0,
            }

        avg, stddev = row

        # Convert Decimal to float safely
        avg = float(avg) if avg is not None else 0.0
        stddev = float(stddev) if stddev is not None else 1.0

        if stddev == 0:
            stddev = 1.0  # prevent division by zero

        return {
            "historical_avg": avg,
            "std_dev": stddev,
        }

    async def _calculate_rolling_average(
        self,
        session: AsyncSession,
        venue_id: UUID,
        current_time: datetime,
        window_minutes: int,
    ) -> Optional[float]:
        """Calculate rolling average over specified window."""

        window_start = current_time - timedelta(minutes=window_minutes)

        stmt = (
            select(func.avg(CrowdMetric.avg_count))
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= window_start)
            .where(CrowdMetric.bucket_type == "minute")
        )

        result = await session.execute(stmt)
        value = result.scalar_one_or_none()

        # Convert Decimal to float
        return float(value) if value is not None else None

    async def _calculate_growth_rate(
        self,
        session: AsyncSession,
        venue_id: UUID,
        current_time: datetime,
        window_minutes: int = 15,
    ) -> Optional[float]:
        """Calculate growth rate compared to previous period."""

        current_start = current_time - timedelta(minutes=window_minutes)
        previous_start = current_start - timedelta(minutes=window_minutes)

        # Current period
        stmt_current = (
            select(func.avg(CrowdMetric.avg_count))
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= current_start)
            .where(CrowdMetric.bucket_type == "minute")
        )
        current_avg_result = await session.execute(stmt_current)
        current_avg = current_avg_result.scalar_one_or_none() or 0
        # Convert to float
        current_avg = float(current_avg)

        # Previous period
        stmt_previous = (
            select(func.avg(CrowdMetric.avg_count))
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= previous_start)
            .where(CrowdMetric.bucket_start < current_start)
            .where(CrowdMetric.bucket_type == "minute")
        )
        previous_avg_result = await session.execute(stmt_previous)
        previous_avg = previous_avg_result.scalar_one_or_none() or 0
        # Convert to float
        previous_avg = float(previous_avg)

        if previous_avg == 0:
            return 0

        return ((current_avg - previous_avg) / previous_avg) * 100

    def _detect_anomaly(
        self,
        current_value: float,
        historical_avg: float,
        std_dev: float,
    ) -> float:
        """
        Detect anomalies using z-score.
        
        Returns score from 0-1 where >0.7 indicates anomaly.
        Future: Replace with ML model (Isolation Forest, etc.)
        """
        if std_dev == 0:
            return 0

        z_score = abs(current_value - historical_avg) / std_dev
        # Normalize to 0-1 (z-score of 3 is 3 sigma = 0.997)
        return min(z_score / 3, 1.0)

    def _calculate_risk(
        self,
        avg_count: float,
        growth_rate: Optional[float],
        anomaly_score: Optional[float],
        warning_threshold: Optional[int],
        critical_threshold: Optional[int],
        capacity: Optional[int],
    ) -> float:
        """
        Pure linear risk calculation using live crowd data.
        Risk score directly scales based on how close we are to critical threshold/capacity.
        """
        crit = float(critical_threshold) if critical_threshold else (float(capacity) if capacity else 100.0)
        if crit <= 0:
            crit = 100.0

        base_risk = (avg_count / crit) * 100.0

        return min(base_risk, 100.0)

    def _classify_risk_level(
        self,
        avg_count: float,
        warning_threshold: Optional[int],
        critical_threshold: Optional[int],
        capacity: Optional[int],
    ) -> str:
        """
        Classify risk level based purely on admin-configured venue thresholds.

        Bands derived from two admin settings (warning_threshold, critical_threshold):
          low     < warning * 0.5
          medium  >= warning * 0.5  and < warning
          high    >= warning        and < critical
          critical>= critical

        Fallback when thresholds not set: uses 60%/85% of capacity.
        No static/hardcoded defaults — everything scales with the venue.
        """
        cap = capacity or 0

        # Resolve admin thresholds — fall back to capacity fractions, never to magic numbers
        warn = float(warning_threshold) if warning_threshold else (cap * 0.60 if cap else None)
        crit = float(critical_threshold) if critical_threshold else (cap * 0.85 if cap else None)

        # If venue has no capacity AND no thresholds at all, we cannot classify meaningfully
        if warn is None or crit is None:
            return "unknown"

        # Guaranteed floats past this point
        warn_f: float = warn
        crit_f: float = crit
        med_start: float = warn_f * 0.5  # medium starts here

        if avg_count >= crit_f:
            return "critical"
        elif avg_count >= warn_f:
            return "high"
        elif avg_count >= med_start:
            return "medium"
        else:
            return "low"

    # ==========================================================
    # Minute Aggregation
    # ==========================================================

    async def aggregate_minute(
        self,
        session: AsyncSession,
        *,
        camera_id: UUID,
        timestamp: Optional[datetime] = None,
        tenant_id: Optional[UUID] = None,
    ) -> Optional[CrowdMetric]:
        """
        Aggregate last minute of frames into a metric.
        
        This is the primary aggregation function, called
        every minute by a scheduler or triggered by frame ingestion.
        
        Returns:
            CrowdMetric if frames exist, None if no frames found
        """
        # Validate camera
        camera = await self.camera_repo.get_by_id(session, camera_id)
        if not camera:
            raise ValueError("Camera not found.")

        if tenant_id and camera.tenant_id != tenant_id:
            raise ValueError("Camera not in tenant.")

        # Get venue for thresholds
        venue = await self.venue_repo.get_by_id(session, camera.venue_id)
        if not venue:
            raise ValueError("Venue not found for camera.")

        # Aggregate previous complete minute, not current partial minute
        timestamp = timestamp or datetime.now(timezone.utc)
        current_minute = timestamp.replace(second=0, microsecond=0)
        minute_end = current_minute
        minute_start = minute_end - timedelta(minutes=1)

        # -----------------------------------------
        # Idempotency Guard - Prevent Duplicate Metric
        # -----------------------------------------
        existing_stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.camera_id == camera_id)
            .where(CrowdMetric.bucket_start == minute_start)
            .where(CrowdMetric.bucket_type == "minute")
        )

        existing_result = await session.execute(existing_stmt)
        existing_metric = existing_result.scalar_one_or_none()

        if existing_metric:
            logger.debug(
                "Minute metric already exists - skipping aggregation",
                extra={
                    "camera_id": str(camera_id),
                    "bucket_start": minute_start.isoformat(),
                }
            )
            return existing_metric

        # Aggregate frame data for this camera
        stmt = (
            select(
                func.avg(CrowdFrame.detected_count),
                func.max(CrowdFrame.detected_count),
                func.min(CrowdFrame.detected_count),
                func.count(CrowdFrame.id),
                func.avg(CrowdFrame.detection_confidence_avg),
                func.avg(CrowdFrame.velocity),
                func.avg(CrowdFrame.variance),
                func.avg(CrowdFrame.acceleration),
            )
            .where(CrowdFrame.camera_id == camera_id)
            .where(CrowdFrame.captured_at >= minute_start)
            .where(CrowdFrame.captured_at < minute_end)
        )

        result = await session.execute(stmt)
        avg_count, max_count, min_count, frame_count, avg_confidence, avg_velocity, avg_variance, avg_acceleration = result.one()

        # Convert Decimal values immediately
        avg_count = float(avg_count) if avg_count is not None else 0.0

        # ==========================================================
        # DATA SMOOTHING (MODULE 3)
        # ==========================================================
        prev_stmt = (
            select(CrowdMetric.avg_count)
            .where(CrowdMetric.camera_id == camera_id)
            .where(CrowdMetric.bucket_type == "minute")
            .where(CrowdMetric.bucket_start < minute_start)
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(1)
        )
        prev_res = await session.execute(prev_stmt)
        prev_avg = prev_res.scalar_one_or_none()
        
        if prev_avg is not None:
            prev_avg = float(prev_avg)
            # Cap maximum upward/downward jump (relative to venue scale)
            # Threshold allows a jump of 20% of the warning level or 2.0x previous avg
            jump_ref = venue.warning_threshold if venue.warning_threshold else (venue.capacity * 0.6 if venue.capacity else 50.0)
            max_jump = max(prev_avg * 2.0, jump_ref * 0.2)
            
            if avg_count > prev_avg + max_jump:
                logger.debug(f"Capping upward spike {avg_count} to {prev_avg + max_jump}")
                avg_count = prev_avg + max_jump
            elif avg_count < prev_avg - max_jump:
                logger.debug(f"Capping downward drop {avg_count} to {prev_avg - max_jump}")
                avg_count = max(0.0, prev_avg - max_jump)

            # Apply Exponential Moving Average (EMA) with alpha=0.4
            alpha = 0.4
            avg_count = (alpha * avg_count) + ((1.0 - alpha) * prev_avg)
        # ==========================================================

        max_count = int(max_count) if max_count is not None else 0
        min_count = int(min_count) if min_count is not None else 0
        avg_confidence = float(
            avg_confidence) if avg_confidence is not None else None
        
        avg_velocity = float(avg_velocity) if avg_velocity is not None else 0.0
        avg_variance = float(avg_variance) if avg_variance is not None else 0.0
        avg_acceleration = float(avg_acceleration) if avg_acceleration is not None else 0.0

        # --------------------------------------------------
        # Zero-only minute stabilization
        # --------------------------------------------------
        if (
            self.SKIP_ZERO_ONLY_MINUTES
            and frame_count >= self.MIN_FRAMES_PER_MINUTE
            and max_count == 0
        ):
            logger.debug(
                "Skipping zero-only minute metric",
                extra={
                    "camera_id": str(camera_id),
                    "bucket_start": minute_start.isoformat(),
                    "frame_count": frame_count,
                }
            )
            return None

        # Return None instead of raising error when no frames
        if frame_count == 0 or frame_count is None:
            logger.debug(
                "No frames found for aggregation window",
                extra={
                    "camera_id": str(camera_id),
                    "minute_start": minute_start.isoformat(),
                }
            )
            return None

        # Skip heavy analytics for low-activity periods
        if frame_count < self.MIN_FRAMES_PER_MINUTE:
            logger.warning(
                "Insufficient frames for stable aggregation - skipping minute metric",
                extra={
                    "camera_id": str(camera_id),
                    "frame_count": frame_count,
                    "required_min_frames": self.MIN_FRAMES_PER_MINUTE,
                    "bucket_start": minute_start.isoformat(),
                }
            )
            return None
        else:
            # Get historical stats for anomaly detection
            historical = await self._get_historical_stats(session, venue.id)

            growth_rate = await self._calculate_growth_rate(
                session, venue.id, minute_start
            )

            rolling_avg_5 = await self._calculate_rolling_average(
                session, venue.id, minute_start, 5
            )

            rolling_avg_15 = await self._calculate_rolling_average(
                session, venue.id, minute_start, 15
            )

            anomaly_score = self._detect_anomaly(
                avg_count,
                historical["historical_avg"],
                historical["std_dev"],
            )

        # Calculate derived metrics
        occupancy_percent = (
            min((avg_count / venue.capacity) * 100, 100.0) if venue.capacity else 0
        )

        # Calculate risk score using absolute thresholds
        risk_score = self._calculate_risk(
            avg_count,
            growth_rate,
            anomaly_score,
            venue.warning_threshold,
            venue.critical_threshold,
            venue.capacity,
        )

        # Classify risk level using admin venue thresholds — fully dynamic, no hardcoded defaults
        risk_level = self._classify_risk_level(
            avg_count,
            venue.warning_threshold,
            venue.critical_threshold,
            venue.capacity,
        )

        # Create metric with all fields now available in the model
        metric = CrowdMetric(
            venue_id=camera.venue_id,
            camera_id=camera_id,
            bucket_start=minute_start,
            bucket_end=minute_end,
            bucket_type="minute",
            avg_count=round(avg_count, 2),
            max_count=max_count,
            min_count=min_count,
            total_samples=frame_count,
            avg_confidence=round(
                avg_confidence, 3) if avg_confidence is not None else None,
            rolling_avg_5=round(
                rolling_avg_5, 2) if rolling_avg_5 is not None else None,
            rolling_avg_15=round(
                rolling_avg_15, 2) if rolling_avg_15 is not None else None,
            growth_rate_percent=round(
                growth_rate, 2) if growth_rate is not None else None,
            occupancy_percent=round(occupancy_percent, 2),
            density_score=round(avg_count, 2),
            anomaly_score=round(anomaly_score, 3),
            risk_level=risk_level,
            dynamic_risk_score=round(risk_score, 2),
            avg_velocity=round(avg_velocity, 2),
            avg_variance=round(avg_variance, 2),
            avg_acceleration=round(avg_acceleration, 2),
        )

        # 🔥 Strong idempotency guard - handle duplicate inserts gracefully
        try:
            created = await self.metric_repo.create(
                session,
                metric,
                commit=True,
            )
            
            # 🔥 TRIGGER RISK EVALUATION AND ALERT CREATION
            try:
                # Import here to avoid circular imports
                from app.services.risk_engine_service import RiskEngineService
                from app.services.alert_engine_service import AlertEngineService
                
                risk_engine = RiskEngineService()
                alert_engine = AlertEngineService()
                
                # Evaluate risk
                decision = await risk_engine.evaluate_metric(
                    session,
                    metric_id=created.id,
                    tenant_id=tenant_id if tenant_id else None
                )

                logger.warning(
                    "RISK ENGINE DECISION",
                    extra={
                        "metric_id": str(created.id),
                        "decision": decision
                    }
                )
                
                # Create alert if needed
                await alert_engine.process_decision(
                    session,
                    decision=decision,
                    tenant_id=tenant_id if tenant_id else None
                )
                
                logger.debug(
                    "Risk evaluation and alert processing completed",
                    extra={
                        "metric_id": str(created.id),
                        "risk_level": risk_level,
                        "should_alert": decision.get("should_alert", False)
                    }
                )
                
            except Exception as e:
                # Log but don't fail the aggregation
                logger.error(
                    "Failed to process risk evaluation for metric",
                    extra={
                        "metric_id": str(created.id) if created else None,
                        "error": str(e)
                    }
                )

        except IntegrityError:
            await session.rollback()

            logger.warning(
                "Duplicate minute metric detected at DB level - fetching existing metric",
                extra={
                    "camera_id": str(camera_id),
                    "bucket_start": minute_start.isoformat(),
                }
            )

            # Re-fetch existing metric
            existing_result = await session.execute(existing_stmt)
            existing_metric = existing_result.scalar_one_or_none()

            if existing_metric:
                return existing_metric
            else:
                # Unexpected state - re-raise
                logger.error(
                    "IntegrityError but no existing metric found - possible corruption",
                    extra={
                        "camera_id": str(camera_id),
                        "bucket_start": minute_start.isoformat(),
                    }
                )
                raise

        logger.info(
            "Minute metric aggregated",
            extra={
                "camera_id": str(camera_id),
                "venue_id": str(venue.id),
                "avg_count": round(avg_count, 2),
                "risk_score": round(risk_score, 2),
                "risk_level": risk_level,
                "frame_count": frame_count,
            },
        )

        return created

    async def aggregate_venue_minute(
        self,
        session: AsyncSession,
        *,
        venue_id: UUID,
        timestamp: Optional[datetime] = None,
        tenant_id: Optional[UUID] = None,
    ) -> Optional[CrowdMetric]:
        """
        Aggregate all camera-level metrics for a venue into a single venue metric.
        This provides the source for venue-wide analytics and peak detection.
        """
        # Get venue
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            return None

        # Determine time window
        timestamp = timestamp or datetime.now(timezone.utc)
        minute_end = timestamp.replace(second=0, microsecond=0)
        minute_start = minute_end - timedelta(minutes=1)

        # Idempotency Guard
        existing_stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.camera_id.is_(None))
            .where(CrowdMetric.bucket_start == minute_start)
            .where(CrowdMetric.bucket_type == "minute")
        )
        existing_result = await session.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            return None

        # Aggregate camera metrics for this minute
        stmt = (
            select(
                func.sum(CrowdMetric.avg_count),
                func.max(CrowdMetric.max_count),
                func.sum(CrowdMetric.total_samples),
                func.avg(CrowdMetric.avg_confidence),
            )
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.camera_id.is_not(None))
            .where(CrowdMetric.bucket_start == minute_start)
            .where(CrowdMetric.bucket_type == "minute")
        )

        result = await session.execute(stmt)
        row = result.one()
        sum_avg, max_val, total_samples, avg_conf = row

        if sum_avg is None or total_samples == 0:
            return None

        # Convert to float/int
        sum_avg = float(sum_avg)
        max_val = int(max_val) if max_val is not None else 0
        total_samples = int(total_samples)
        avg_conf = float(avg_conf) if avg_conf is not None else 1.0

        # Calculate derived metrics for venue
        occupancy_percent = (min((sum_avg / venue.capacity) * 100, 100.0) if venue.capacity else 0)
        
        # For simplicity, venue-wide risk level is the MAX risk level found among cameras
        risk_stmt = (
            select(CrowdMetric.risk_level, CrowdMetric.dynamic_risk_score)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.camera_id.is_not(None))
            .where(CrowdMetric.bucket_start == minute_start)
            .where(CrowdMetric.bucket_type == "minute")
        )
        risk_results = await session.execute(risk_stmt)
        risk_rows = risk_results.all()
        
        venue_risk_score = 0.0
        venue_risk_level = "low"
        
        risk_priority = {"critical": 4, "high": 3, "medium": 2, "low": 1, "unknown": 0}
        max_priority = 0
        
        for level, score in risk_rows:
            venue_risk_score = max(venue_risk_score, float(score))
            priority = risk_priority.get(level, 0)
            if priority > max_priority:
                max_priority = priority
                venue_risk_level = level

        # Create the venue metric
        venue_metric = CrowdMetric(
            venue_id=venue_id,
            camera_id=None,
            bucket_start=minute_start,
            bucket_end=minute_end,
            bucket_type="minute",
            avg_count=round(sum_avg, 2),
            max_count=max_val,
            min_count=0, # not used for venue
            total_samples=total_samples,
            avg_confidence=round(avg_conf, 3),
            occupancy_percent=round(occupancy_percent, 2),
            risk_level=venue_risk_level,
            dynamic_risk_score=round(venue_risk_score, 2),
        )

        created = await self.metric_repo.create(session, venue_metric, commit=True)
        
        logger.info(
            "Venue minute metric aggregated",
            extra={
                "venue_id": str(venue_id),
                "total_count": round(sum_avg, 2),
                "risk_level": venue_risk_level
            }
        )
        return created

    # ==========================================================
    # Hour Aggregation
    # ==========================================================

    async def aggregate_hour(
        self,
        session: AsyncSession,
        *,
        venue_id: UUID,
        hour_start: Optional[datetime] = None,
        tenant_id: Optional[UUID] = None,
    ) -> Optional[CrowdMetric]:
        """
        Aggregate hour from minute metrics.
        
        Provides higher-level view for trends and reporting.
        
        Returns:
            CrowdMetric if minute metrics exist, None if no metrics found
        """
        # Validate venue
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            raise ValueError("Venue not found.")

        if tenant_id and venue.tenant_id != tenant_id:
            raise ValueError("Venue not in tenant.")

        # Define time window
        hour_start = hour_start or datetime.now(timezone.utc).replace(
            minute=0, second=0, microsecond=0
        )
        hour_end = hour_start + timedelta(hours=1)

        # Aggregate from minute metrics
        stmt = (
            select(
                func.avg(CrowdMetric.avg_count),
                func.max(CrowdMetric.max_count),
                func.min(CrowdMetric.min_count),
                func.sum(CrowdMetric.total_samples),
                func.count(CrowdMetric.id),
                func.avg(CrowdMetric.dynamic_risk_score),
            )
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= hour_start)
            .where(CrowdMetric.bucket_start < hour_end)
            .where(CrowdMetric.bucket_type == "minute")
        )

        result = await session.execute(stmt)
        avg_count, max_count, min_count, total_frames, metric_count, avg_risk = result.one()

        # Convert Decimal values immediately
        avg_count = float(avg_count) if avg_count is not None else 0.0
        max_count = int(max_count) if max_count is not None else 0
        min_count = int(min_count) if min_count is not None else 0
        total_frames = int(total_frames) if total_frames is not None else 0
        metric_count = int(metric_count) if metric_count is not None else 0
        avg_risk = float(avg_risk) if avg_risk is not None else 0.0

        if metric_count == 0:
            logger.debug(
                "No minute metrics found for hour window",
                extra={
                    "venue_id": str(venue_id),
                    "hour_start": hour_start.isoformat(),
                }
            )
            return None

        # Calculate hourly occupancy
        occupancy_percent = (
            (avg_count / venue.capacity) * 100 if venue.capacity else 0
        )

        # Classify risk level using admin venue thresholds — fully dynamic, no hardcoded defaults
        risk_level = self._classify_risk_level(
            avg_count,
            venue.warning_threshold,
            venue.critical_threshold,
            venue.capacity,
        )

        # Create hour metric
        metric = CrowdMetric(
            venue_id=venue_id,
            bucket_start=hour_start,
            bucket_end=hour_end,
            bucket_type="hour",
            avg_count=round(avg_count, 2),
            max_count=max_count,
            min_count=min_count,
            total_samples=total_frames,
            occupancy_percent=round(occupancy_percent, 2),
            dynamic_risk_score=round(
                avg_risk, 2) if avg_risk is not None else None,
            risk_level=risk_level
        )

        created = await self.metric_repo.create(
            session,
            metric,
            commit=True,
        )

        logger.info(
            "Hour metric aggregated",
            extra={
                "venue_id": str(venue_id),
                "avg_count": round(avg_count, 2),
                "risk_level": risk_level,
                "minute_metrics": metric_count,
            },
        )

        return created

    # ==========================================================
    # Batch Aggregation (Backfill)
    # ==========================================================

    async def aggregate_missing_minutes(
        self,
        session: AsyncSession,
        *,
        camera_id: UUID,
        hours: int = 24,
        tenant_id: Optional[UUID] = None,
    ) -> int:
        """
        Backfill missing minute aggregations.
        
        Useful for:
        - System recovery
        - Historical data processing
        - Testing
        """
        camera = await self.camera_repo.get_by_id(session, camera_id)
        if not camera:
            raise ValueError("Camera not found.")

        if tenant_id and camera.tenant_id != tenant_id:
            raise ValueError("Camera not in tenant.")

        # Find minutes with frames but no metrics
        end_time = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        start_time = end_time - timedelta(hours=hours)

        # Get all minutes that have frames
        stmt_frames = (
            select(
                func.date_trunc(
                    'minute', CrowdFrame.captured_at).label('minute')
            )
            .where(CrowdFrame.camera_id == camera_id)
            .where(CrowdFrame.captured_at >= start_time)
            .where(CrowdFrame.captured_at < end_time)
            .group_by('minute')
        )

        frame_minutes = await session.execute(stmt_frames)
        frame_minutes = [row[0] for row in frame_minutes]

        # Get minutes that already have metrics
        stmt_metrics = (
            select(CrowdMetric.bucket_start)
            .where(CrowdMetric.camera_id == camera_id)
            .where(CrowdMetric.bucket_start >= start_time)
            .where(CrowdMetric.bucket_start < end_time)
            .where(CrowdMetric.bucket_type == "minute")
        )

        metric_minutes = await session.execute(stmt_metrics)
        metric_minutes = {row[0] for row in metric_minutes}

        # Find missing minutes
        missing = [m for m in frame_minutes if m not in metric_minutes]

        count = 0
        for minute in missing:
            try:
                result = await self.aggregate_minute(
                    session,
                    camera_id=camera_id,
                    timestamp=minute,
                    tenant_id=tenant_id,
                )
                if result:
                    count += 1
            except Exception as e:
                logger.error(
                    "Failed to aggregate missing minute",
                    extra={
                        "camera_id": str(camera_id),
                        "minute": minute.isoformat(),
                        "error": str(e),
                    }
                )

        logger.info(
            "Missing minutes aggregated",
            extra={
                "camera_id": str(camera_id),
                "aggregated": count,
                "total_missing": len(missing),
            }
        )

        return count

    # ==========================================================
    # Day Aggregation
    # ==========================================================

    async def aggregate_day(
        self,
        session: AsyncSession,
        *,
        venue_id: UUID,
        day_start: Optional[datetime] = None,
        tenant_id: Optional[UUID] = None,
    ) -> Optional[CrowdMetric]:
        """
        Aggregate day from hour metrics.
        
        Provides daily summary for reporting and trend analysis.
        
        Returns:
            CrowdMetric if hour metrics exist, None if no metrics found
        """
        # Validate venue
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            raise ValueError("Venue not found.")

        if tenant_id and venue.tenant_id != tenant_id:
            raise ValueError("Venue not in tenant.")

        # Define time window
        day_start = day_start or datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + timedelta(days=1)

        # Aggregate from hour metrics
        stmt = (
            select(
                func.avg(CrowdMetric.avg_count),
                func.max(CrowdMetric.max_count),
                func.min(CrowdMetric.min_count),
                func.sum(CrowdMetric.total_samples),
                func.count(CrowdMetric.id),
                func.avg(CrowdMetric.dynamic_risk_score),
            )
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= day_start)
            .where(CrowdMetric.bucket_start < day_end)
            .where(CrowdMetric.bucket_type == "hour")
        )

        result = await session.execute(stmt)
        avg_count, max_count, min_count, total_frames, metric_count, avg_risk = result.one()

        # Convert Decimal values safely
        avg_count = float(avg_count) if avg_count is not None else 0.0
        max_count = int(max_count) if max_count is not None else 0
        min_count = int(min_count) if min_count is not None else 0
        total_frames = int(total_frames) if total_frames is not None else 0
        metric_count = int(metric_count) if metric_count is not None else 0
        avg_risk = float(avg_risk) if avg_risk is not None else 0.0

        if metric_count == 0:
            logger.debug(
                "No hour metrics found for day window",
                extra={
                    "venue_id": str(venue_id),
                    "day_start": day_start.isoformat(),
                }
            )
            return None

        # Create day metric
        metric = CrowdMetric(
            venue_id=venue_id,
            bucket_start=day_start,
            bucket_end=day_end,
            bucket_type="day",
            avg_count=round(avg_count, 2),
            max_count=max_count,
            min_count=min_count,
            total_samples=total_frames,
            dynamic_risk_score=round(avg_risk, 2) if avg_risk else None,
        )

        created = await self.metric_repo.create(
            session,
            metric,
            commit=True,
        )

        logger.info(
            "Day metric aggregated",
            extra={
                "venue_id": str(venue_id),
                "avg_count": round(avg_count, 2),
                "hour_metrics": metric_count,
            },
        )

        return created

    # ==========================================================
    # Forecast Hook (ML Integration Point)
    # ==========================================================

    async def trigger_forecast(
        self,
        session: AsyncSession,
        venue_id: UUID,
        horizon_minutes: int = 60,
    ) -> Dict[str, Any]:
        """
        Trigger ML forecasting for a venue.
        
        This is where ARIMA / SARIMA / LSTM / Prophet
        will integrate with the system.
        
        Args:
            venue_id: Venue to forecast
            horizon_minutes: How far ahead to forecast
        
        Returns:
            Forecast results with confidence intervals
        """
        logger.info(
            "Forecast triggered",
            extra={
                "venue_id": str(venue_id),
                "horizon_minutes": horizon_minutes,
            },
        )

        # Get recent metrics for training
        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_type == "minute")
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(1008)  # 7 days of minutes
        )

        result = await session.execute(stmt)
        historical = result.scalars().all()

        # TODO: Integrate with ML model here
        # model = ARIMA(...) or LSTM(...)
        # forecast = model.predict(horizon_minutes)

        return {
            "status": "forecast_placeholder",
            "message": "ML forecasting module will integrate here",
            "venue_id": str(venue_id),
            "horizon_minutes": horizon_minutes,
            "historical_points": len(historical),
            "forecast": [],  # Placeholder for actual forecast
            "confidence_intervals": [],  # Placeholder
        }

    # ==========================================================
    # Utility Methods
    # ==========================================================

    async def get_venue_summary(
        self,
        session: AsyncSession,
        venue_id: UUID,
        minutes: int = 60,
    ) -> Dict[str, Any]:
        """
        Get current venue summary for dashboards.
        """
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            raise ValueError("Venue not found.")

        # Get latest metric
        latest_stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_type == "minute")
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(1)
        )

        latest_result = await session.execute(latest_stmt)
        latest = latest_result.scalar_one_or_none()

        # Get average over last N minutes
        avg_stmt = (
            select(func.avg(CrowdMetric.avg_count))
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_type == "minute")
            .where(
                CrowdMetric.bucket_start >= datetime.now(
                    timezone.utc) - timedelta(minutes=minutes)
            )
        )

        avg_result = await session.execute(avg_stmt)
        avg_value = avg_result.scalar_one_or_none() or 0
        avg_last_period = float(avg_value) if avg_value is not None else 0.0

        # Get peak today
        start_of_day = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        peak_stmt = (
            select(func.max(CrowdMetric.max_count))
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= start_of_day)
            .where(CrowdMetric.bucket_type == "minute")
        )
        peak_result = await session.execute(peak_stmt)
        peak_value = peak_result.scalar_one_or_none() or 0
        peak_today = int(peak_value) if peak_value is not None else 0

        return {
            "venue_id": str(venue_id),
            "venue_name": venue.name,
            "current": {
                "avg_count": latest.avg_count if latest else 0,
                "max_count": latest.max_count if latest else 0,
                "risk_level": latest.risk_level if latest else "unknown",
                "risk_score": latest.dynamic_risk_score if latest else 0,
                "updated_at": latest.bucket_start.isoformat() if latest else None,
            },
            "trends": {
                f"avg_last_{minutes}_min": round(avg_last_period, 2),
                "growth_rate": latest.growth_rate_percent if latest else 0,
                "peak_today": peak_today,
            },
            "capacity": {
                "total": venue.capacity,
                "occupancy_percent": latest.occupancy_percent if latest else 0,
                "warning_threshold": venue.warning_threshold_percent,
                "critical_threshold": venue.critical_threshold_percent,
            },
        }

    async def get_camera_metrics(
        self,
        session: AsyncSession,
        camera_id: UUID,
        limit: int = 60,
    ) -> List[CrowdMetric]:
        """
        Get recent metrics for a specific camera.
        
        Useful for camera-level dashboards and debugging.
        """
        camera = await self.camera_repo.get_by_id(session, camera_id)
        if not camera:
            raise ValueError("Camera not found.")

        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.camera_id == camera_id)
            .where(CrowdMetric.bucket_type == "minute")
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(limit)
        )

        result = await session.execute(stmt)
        return result.scalars().all()

    async def get_venue_metrics(
        self,
        session: AsyncSession,
        venue_id: UUID,
        bucket_type: str = "minute",
        limit: int = 24,
    ) -> List[CrowdMetric]:
        """
        Get recent metrics for a venue at specified granularity.
        
        Useful for venue-level dashboards and trend analysis.
        """
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            raise ValueError("Venue not found.")

        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_type == bucket_type)
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(limit)
        )

        result = await session.execute(stmt)
        return result.scalars().all()

    async def delete_old_metrics(
        self,
        session: AsyncSession,
        days: int = 30,
    ) -> int:
        """
        Delete metrics older than specified days.
        
        Useful for data retention policies.
        
        Args:
            session: Database session
            days: Age threshold in days
            
        Returns:
            Number of metrics deleted
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        stmt = select(CrowdMetric).where(CrowdMetric.bucket_start < cutoff)
        result = await session.execute(stmt)
        metrics = result.scalars().all()

        count = 0
        for metric in metrics:
            await session.delete(metric)
            count += 1

        await session.commit()

        logger.info(
            "Deleted old metrics",
            extra={
                "deleted_count": count,
                "older_than_days": days,
            }
        )

        return count