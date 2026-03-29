"""
Laminar - Risk Engine Service
------------------------------

Consumes CrowdMetric intelligence and determines:

- Risk state transitions
- Escalation / de-escalation events
- Alert trigger conditions
- Stability windows
- Staff action recommendations (rule-based)
- Trend analysis
- Severity scoring

This service DOES NOT send alerts.
It only returns structured decisions.

AlertEngineService will consume its output.

Architecture Position:

CrowdMetric → RiskEngineService → AlertEngineService
"""
from app.services.prediction_service import PredictionService
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, timedelta,timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.crowd_metric import CrowdMetric
from app.models.venue import Venue
from app.core.repository import Repository
from app.core.logging import get_logger


logger = get_logger(__name__)


class RiskEngineService:
    """
    Core decision engine for crowd risk evaluation.
    
    This service evaluates metrics and determines if/when alerts
    should be triggered, without actually sending them.
    """

    STABILITY_WINDOW_MINUTES = 0  # Reduced to 0 for instant alerts
    CONSECUTIVE_THRESHOLD = 0    # Trigger on first detection for maximum speed

    def __init__(self):
        self.metric_repo = Repository[CrowdMetric](CrowdMetric)
        self.venue_repo = Repository[Venue](Venue)
        self.prediction_service  = PredictionService()

    # ==========================================================
    # Private Helpers
    # ==========================================================

    def _get_time_factor(self, metric_time: datetime, venue: Optional[Venue] = None) -> float:
        """
        Get risk multiplier based on time of day.
        
        Dynamically adjusts risk based on venue-specific peak hours or standard defaults.
        """
        hour = metric_time.hour
        # Use venue-specific hours or fallback to system defaults
        peak_start = 17
        peak_end = 21
        off_peak_start = 0
        off_peak_end = 5

        metadata = getattr(venue, "model_metadata", {}) or {}
        peak_start = metadata.get("peak_hours_start", peak_start)
        peak_end = metadata.get("peak_hours_end", peak_end)
        off_peak_start = metadata.get("off_peak_start", off_peak_start)
        off_peak_end = metadata.get("off_peak_end", off_peak_end)

        if peak_start <= hour <= peak_end:
            # Scalable boost factor (could also move to metadata)
            return metadata.get("peak_multiplier", 1.3)
        elif off_peak_start <= hour <= off_peak_end:
            return metadata.get("off_peak_multiplier", 0.7)
        return 1.0

    def _analyze_trend(
        self,
        current_score: float,
        previous_score: Optional[float],
        warning_threshold: float = 100.0,
    ) -> str:
        """
        Analyze risk score trend.
        
        Thresholds are relative to the venue size (warning_threshold) 
        rather than using fixed magic numbers.
        
        Returns: rapidly_increasing, increasing, stable, decreasing, rapidly_decreasing
        """
        if previous_score is None:
            return "stable"

        change = current_score - previous_score
        
        # Thresholds scale with venue warning level (min 5 points)
        rapid_threshold = max(warning_threshold * 0.1, 10.0) 
        increasing_threshold = max(warning_threshold * 0.05, 5.0)

        if change > rapid_threshold:
            return "rapidly_increasing"
        elif change > increasing_threshold:
            return "increasing"
        elif change < -rapid_threshold:
            return "rapidly_decreasing"
        elif change < -increasing_threshold:
            return "decreasing"
        return "stable"

    def _calculate_severity(
        self,
        avg_count: float,
        warning_threshold: float,
        critical_threshold: float,
        growth_rate: Optional[float],
        time_factor: float,
    ) -> int:
        """
        Calculate severity score 1-10 dynamically.
        
        Scales severity proportionally based on count vs. thresholds,
        eliminating static level-to-score mapping.
        """
        # Determine base severity (1-10) based on thresholds
        if avg_count >= critical_threshold:
            # Critical: 8.5 to 10
            base = 8.5 + (min((avg_count - critical_threshold) / max(critical_threshold * 0.2, 1), 1.0) * 1.5)
        elif avg_count >= warning_threshold:
            # High: 5.5 to 8.4
            range_val = max(critical_threshold - warning_threshold, 1)
            base = 5.5 + ((avg_count - warning_threshold) / range_val * 2.9)
        elif avg_count >= warning_threshold * 0.5:
            # Medium: 3.0 to 5.4
            range_val = max(warning_threshold * 0.5, 1)
            base = 3.0 + ((avg_count - (warning_threshold * 0.5)) / range_val * 2.4)
        else:
            # Low: 1.0 to 2.9
            range_val = max(warning_threshold * 0.5, 1)
            base = 1.0 + (avg_count / range_val * 1.9)

        # Apply time factor (peak periods increase urgency)
        base = base * time_factor

        # Dynamic growth boost (max +2)
        if growth_rate and warning_threshold > 0:
            if growth_rate > (warning_threshold * 0.5): base += 2.0
            elif growth_rate > (warning_threshold * 0.2): base += 1.0
            elif growth_rate > (warning_threshold * 0.1): base += 0.5

        return int(max(min(round(base), 10), 1))

    async def _get_previous_metric(
        self,
        session: AsyncSession,
        venue_id: UUID,
        before_time: datetime,
    ) -> Optional[CrowdMetric]:
        """
        Get most recent metric before current one.
        """
        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start < before_time)
            .where(CrowdMetric.bucket_type == "minute")
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(1)
        )

        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_recent_metrics(
        self,
        session: AsyncSession,
        venue_id: UUID,
        since: datetime,
        limit: Optional[int] = None,
    ) -> List[CrowdMetric]:
        """
        Get recent metrics for analysis.
        """
        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= since)
            .where(CrowdMetric.bucket_type == "minute")
            .order_by(CrowdMetric.bucket_start.desc())
        )

        if limit:
            stmt = stmt.limit(limit)

        result = await session.execute(stmt)
        return list(result.scalars().all())

    def _determine_transition(
        self,
        previous_level: str,
        current_level: str,
    ) -> str:
        """
        Determine risk state transition.
        
        Returns: initial, stable, escalated, deescalated, unknown
        """
        if previous_level == "unknown":
            return "initial"

        if previous_level == current_level:
            return "stable"

        # Escalation detection
        levels = ["low", "medium", "high", "critical"]
        try:
            prev_index = levels.index(previous_level)
            curr_index = levels.index(current_level)
        except ValueError:
            return "unknown"

        if curr_index > prev_index:
            return "escalated"
        elif curr_index < prev_index:
            return "deescalated"

        return "stable"

    async def _check_consecutive_threshold(
        self,
        session: AsyncSession,
        venue_id: UUID,
        current_level: str,
        metric_time: datetime,
    ) -> bool:
        """
        Check if level has been sustained for required consecutive minutes.
        
        Prevents alerting on single spikes.
        """
        window_start = metric_time - \
            timedelta(minutes=self.CONSECUTIVE_THRESHOLD - 1)

        recent = await self._get_recent_metrics(
            session,
            venue_id,
            since=window_start,
            limit=self.CONSECUTIVE_THRESHOLD
        )

        if len(recent) < self.CONSECUTIVE_THRESHOLD:
            return False

        return all(m.risk_level == current_level for m in recent)
    def _get_venue_thresholds(self, venue: Optional[Venue]) -> Dict[str, float]:
        """Consistently resolve venue thresholds with robust dynamic fallbacks."""
        if not venue:
            return {"warning": 50.0, "critical": 80.0, "capacity": 100.0}
            
        capacity = float(venue.capacity or 100)
        warning = float(venue.warning_threshold) if venue.warning_threshold else (capacity * 0.6)
        critical = float(venue.critical_threshold) if venue.critical_threshold else (capacity * 0.85)
        
        return {
            "warning": warning,
            "critical": critical,
            "capacity": capacity
        }

    async def _should_trigger_alert(
        self,
        session: AsyncSession,
        *,
        venue_id: UUID,
        current_level: str,
        metric_time: datetime,
        occupancy_percent: float = 0.0,
        avg_count: float = 0.0,
        venue: Optional[Any] = None,
    ) -> bool:

        # ──────────────────────────────────────────────────────────────────────
        # PRIMARY GATE: Venue admin thresholds (absolute counts)
        # Alerts ONLY fire when the real observed count meets the configured
        # warning or critical person-count thresholds set by the admin.
        # ──────────────────────────────────────────────────────────────────────
        thresholds = self._get_venue_thresholds(venue)
        warn_count = thresholds["warning"]
        crit_count = thresholds["critical"]

        # ── Intelligence Gate: Allow alerts if we are approaching thresholds ──
        # or if the AI model has flagged a high/critical risk situation.
        
        if avg_count >= crit_count:
            return True
            
        near_warn = warn_count * 0.75
        near_crit = crit_count * 0.75
        
        if avg_count >= near_crit and current_level == "critical":
            return True
            
        if avg_count >= near_warn and current_level in ["high", "critical"]:
            return True

        # Instant trigger for AI-detected critical situations
        if current_level in ["critical", "high"]:
            return True

        return False

        # ──────────────────────────────────────────────────────────────────────
        # FALLBACK (no venue): Use stability window to prevent single-spike alerts
        # ──────────────────────────────────────────────────────────────────────
        if current_level in ["medium", "high", "critical"]:
            window_start = metric_time - timedelta(minutes=self.STABILITY_WINDOW_MINUTES)
            recent = await self._get_recent_metrics(session, venue_id, since=window_start)

            if not recent:
                # Only alert for high/critical without history
                return current_level in ["high", "critical"]

            high_critical_count = sum(
                1 for m in recent if m.risk_level in ["medium", "high", "critical"]
            )
            stability_ratio = high_critical_count / len(recent)

            # Critical: require sustained risk over at least 60% of the window
            if current_level == "critical" and stability_ratio >= 0.6:
                return True

            # High risk: require majority of recent readings
            if current_level == "high" and (stability_ratio >= 0.5 or high_critical_count >= 2):
                return True

            # Medium risk: require 3+ consecutive minutes
            if current_level == "medium" and high_critical_count >= 3:
                return True

        return False

    def _recommend_action(
        self,
        risk_level: str,
        occupancy_percent: Optional[float],
        growth_rate: Optional[float],
        trend: str,
        warning_threshold: float = 0.0,
    ) -> str:
        """
        Rule-based staff recommendation engine with trend awareness.
        """

        if risk_level == "critical":
            if trend in ["rapidly_increasing", "increasing"]:
                return (
                    "🚨 CRITICAL - RAPID ESCALATION: "
                    "Immediately restrict entry, consider evacuation, "
                    "and deploy all available staff to control areas."
                )
            return (
                "🚨 CRITICAL: Restrict entry, deploy additional staff, "
                "and initiate emergency crowd control protocols."
            )

        if risk_level == "high":
            if trend in ["rapidly_increasing", "increasing"]:
                return (
                    "⚠️ HIGH RISK WITH GROWTH: Situation escalating. "
                    "Alert standby staff, monitor all exits, and "
                    "prepare for potential critical escalation."
                )
            if growth_rate and growth_rate > (warning_threshold * 0.2):
                return (
                    "⚠️ HIGH RISK with rapid growth detected. "
                    "Deploy additional staff immediately and "
                    "monitor crowd density closely."
                )
            return (
                "⚠️ HIGH RISK: Increase monitoring, prepare "
                "crowd control staff, and ensure exits are clear."
            )

        if risk_level == "medium":
            if trend == "increasing":
                return (
                    "📊 MEDIUM RISK with upward trend. "
                    "Monitor closely and prepare for potential escalation."
                )
            return (
                "📊 MEDIUM RISK: Monitor situation closely. "
                "No immediate action required."
            )

        if risk_level == "low":
            return (
                "✅ LOW RISK: Normal operations. "
                "Continue standard monitoring."
            )

        return (
            "❓ Unknown risk level. "
            "Manual review recommended."
        )

    # ==========================================================
    # Public Evaluation Entry
    # ==========================================================

    async def evaluate_metric(
        self,
        session: AsyncSession,
        *,
        metric_id: UUID,
        tenant_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """
        Evaluate a newly created CrowdMetric.

        Returns structured decision output:

        {
            "venue_id": ...,
            "venue_name": ...,
            "metric_id": ...,
            "metric_time": ...,
            "previous_level": ...,
            "current_level": ...,
            "transition": ...,
            "trend": ...,
            "severity": 1-10,
            "should_alert": True/False,
            "recommended_action": ...,
            "risk_score": ...,
            "occupancy_percent": ...,
            "growth_rate": ...,
            "evaluated_at": ...
        }
        """
        # Get metric
        metric = await self.metric_repo.get_by_id(session, metric_id)
        if not metric:
            raise ValueError("Metric not found.")

        # Get venue
        venue = await self.venue_repo.get_by_id(session, metric.venue_id)
        if not venue:
            raise ValueError("Venue not found.")

        # Tenant isolation
        if tenant_id and venue.tenant_id != tenant_id:
            raise ValueError("Venue not in tenant.")

        # Get historical context
        previous_metric = await self._get_previous_metric(
            session, metric.venue_id, metric.bucket_start
        )

        # Calculate all decision factors
        previous_level = previous_metric.risk_level if previous_metric else "unknown"
        current_level = metric.risk_level or "unknown"


        # ==================================================
        # 🔮 Prediction Integration (Proactive Intelligence)
        # ==================================================
        try:
            prediction = await self.prediction_service.forecast_risk(
                session,
                metric.venue_id
            )
        except Exception as e:
            logger.error(
                "Prediction service failed",
                extra_fields={"error": str(e)}
            )
            prediction = {}

        predicted_level = prediction.get("predicted_level")
        escalation_probability = prediction.get("escalation_probability", 0)
        prediction_confidence = prediction.get("confidence", 0)

        early_warning = False

        # Early escalation trigger:
        # If currently medium/high but forecast says critical
        if (
            current_level in ["medium", "high"]
            and predicted_level == "critical"
            and escalation_probability >= 0.5
            and prediction_confidence >= 0.6
        ):
            early_warning = True

        transition = self._determine_transition(previous_level, current_level)

        thresholds = self._get_venue_thresholds(venue)

        trend = self._analyze_trend(
            metric.dynamic_risk_score or 0,
            previous_metric.dynamic_risk_score if previous_metric else None,
            warning_threshold=thresholds["warning"]
        )

        time_factor = self._get_time_factor(metric.bucket_start, venue=venue)

        severity = self._calculate_severity(
            avg_count=metric.avg_count or 0,
            warning_threshold=thresholds["warning"],
            critical_threshold=thresholds["critical"],
            growth_rate=metric.growth_rate_percent,
            time_factor=time_factor
        )

        should_alert = await self._should_trigger_alert(
            session,
            venue_id=metric.venue_id,
            current_level=current_level,
            metric_time=metric.bucket_start,
            occupancy_percent=metric.occupancy_percent or 0,
            avg_count=metric.avg_count or 0,
            venue=venue,
        )

        # 🔮 Upgrade to early alert if prediction says danger ahead
        if early_warning:
            should_alert = True

        recommended_action = self._recommend_action(
            current_level,
            metric.occupancy_percent,
            metric.growth_rate_percent,
            trend,
            warning_threshold=thresholds["warning"],
        )

        # Build decision output
        decision = {
            "venue_id": str(metric.venue_id),
            "venue_name": venue.name,
            "metric_id": str(metric.id),
            "camera_id": str(metric.camera_id), # Essential for per-camera alerts
            "metric_time": metric.bucket_start.isoformat(),
            "previous_level": previous_level,
            "current_level": current_level,
            "transition": transition,
            "trend": trend,
            "severity": severity,
            "should_alert": should_alert,
            "recommended_action": recommended_action,
            "risk_score": round(metric.dynamic_risk_score, 2) if metric.dynamic_risk_score else None,
            "occupancy_percent": round(metric.occupancy_percent, 2) if metric.occupancy_percent else None,
            "growth_rate": round(metric.growth_rate_percent, 2) if metric.growth_rate_percent else None,
            "time_factor": round(time_factor, 2),
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
            "predicted_level": predicted_level,
            "predicted_risk_score": prediction.get("predicted_risk_score"),
            "prediction_confidence": prediction_confidence,
            "escalation_probability": escalation_probability,
            "early_warning_triggered": early_warning,
            "momentum_score": prediction.get("momentum_score", 0.0),
        }

        # ── XAI: Add "Why?" explanation to every decision ────────────────────
        # Non-blocking — if XAI fails, decision still proceeds normally
        try:
            from app.services.xai_service import XAIService
            xai = XAIService()
            xai_result = xai.explain(
                risk_level=current_level,
                occupancy_percent=metric.occupancy_percent or 0.0,
                growth_rate=metric.growth_rate_percent or 0.0,
                trend=trend,
                time_factor=time_factor,
                severity=severity,
                early_warning=early_warning,
                predicted_level=predicted_level,
            )
            decision["xai_explanation"] = xai_result.get("explanation", "")
            decision["xai_factors"] = xai_result.get("factors", [])
            decision["xai_confidence"] = xai_result.get("confidence", 0.0)
        except Exception:
            decision["xai_explanation"] = ""
            decision["xai_factors"] = []

        # ── Anomaly Score: Parallel async anomaly check ───────────────────────
        # Attaches anomaly_score and is_anomaly to decision for the alert payload
        try:
            from app.services.anomaly_service import AnomalyService
            _anomaly_svc = AnomalyService()
            _anomaly_result = await _anomaly_svc.score_single(
                venue_id=metric.venue_id,
                occupancy_pct=metric.occupancy_percent or 0.0,
                growth_rate=metric.growth_rate_percent or 0.0,
                risk_score=metric.dynamic_risk_score or 0.0,
            )
            decision["anomaly_score"] = _anomaly_result.get("anomaly_score", 0.0)
            decision["is_anomaly"] = _anomaly_result.get("is_anomaly", False)
        except Exception:
            decision["anomaly_score"] = None
            decision["is_anomaly"] = False

        # Log decision
        if should_alert:
            logger.warning(
                "Risk evaluated",
                extra_fields={
                    "venue_id": str(metric.venue_id),
                    "venue_name": venue.name,
                    "previous_level": previous_level,
                    "current_level": current_level,
                    "transition": transition,
                    "severity": severity,
                    "should_alert": should_alert,
                    "xai_explanation": decision.get("xai_explanation", "")[:120],
                },
            )


        else:
            logger.info(
                "Risk evaluated",
                extra_fields={
                    "venue_id": str(metric.venue_id),
                    "venue_name": venue.name,
                    "previous_level": previous_level,
                    "current_level": current_level,
                    "transition": transition,
                    "severity": severity,
                    "should_alert": should_alert,
                },
            )

        # 🔥 REAL-TIME BROADCAST: Ensure dashboard sees metric update instantly
        try:
            from app.core.plugin_registry import plugin_registry
            import asyncio
            asyncio.create_task(plugin_registry.dispatch_metric(decision))
        except Exception:
            pass

        return decision

    # ==========================================================
    # Batch Evaluation (Backfill Support)
    # ==========================================================

    async def evaluate_recent_metrics(
        self,
        session: AsyncSession,
        *,
        venue_id: UUID,
        minutes: int = 10,
    ) -> Dict[str, Any]:
        """
        Evaluate recent metrics in bulk.
        
        Returns summary of evaluations.
        """
        since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

        recent = await self._get_recent_metrics(
            session,
            venue_id,
            since=since
        )

        results = []
        alert_count = 0
        escalated_count = 0
        deescalated_count = 0

        for metric in recent:
            try:
                decision = await self.evaluate_metric(
                    session,
                    metric_id=metric.id,
                )
                results.append(decision)

                if decision["should_alert"]:
                    alert_count += 1
                if decision["transition"] == "escalated":
                    escalated_count += 1
                elif decision["transition"] == "deescalated":
                    deescalated_count += 1

            except Exception as e:
                logger.error(
                    "Failed to evaluate metric in batch",
                    extra_fields={
                        "metric_id": str(metric.id),
                        "error": str(e),
                    }
                )

        summary = {
            "venue_id": str(venue_id),
            "evaluated_count": len(results),
            "alert_triggers": alert_count,
            "escalations": escalated_count,
            "deescalations": deescalated_count,
            "time_range": {
                "from": since.isoformat(),
                "to": datetime.now(timezone.utc).isoformat(),
            }
        }

        logger.info(
            "Batch evaluation completed",
            extra_fields=summary,
        )

        return summary

    # ==========================================================
    # Health Check
    # ==========================================================

    async def get_risk_summary(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Dict[str, Any]:
        """
        Get current risk summary for dashboard.
        """
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            raise ValueError("Venue not found.")

        # Get latest metric
        latest = await self._get_recent_metrics(
            session,
            venue_id,
            since=datetime.now(timezone.utc) - timedelta(minutes=5),
            limit=1
        )

        if not latest:
            return {
                "venue_id": str(venue_id),
                "venue_name": venue.name,
                "status": "insufficient_data",
                "message": "No recent metrics available for risk assessment.",
            }

        latest_metric = latest[0]

        # Evaluate latest
        decision = await self.evaluate_metric(
            session,
            metric_id=latest_metric.id,
        )

        # Get 24-hour trend
        day_ago = datetime.now(timezone.utc) - timedelta(days=1)
        day_metrics = await self._get_recent_metrics(
            session,
            venue_id,
            since=day_ago
        )

        risk_levels = {}
        for m in day_metrics:
            risk_levels[m.risk_level] = risk_levels.get(m.risk_level, 0) + 1

        return {
            "venue_id": str(venue_id),
            "venue_name": venue.name,
            "status": "active",
            "current_risk": decision,
            "daily_distribution": risk_levels,
            "monitoring_since": venue.created_at.isoformat() if venue.created_at else None,
        }
