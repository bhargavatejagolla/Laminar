"""
Laminar - Zone Intelligence Orchestrator
------------------------------------------

Unified coordinator that ties together all three intelligence engines
(Surge, Dwell, Flow) into a single structured snapshot per camera/zone.

Responsibilities:
- Call surge_engine, dwell_engine, flow_engine per frame
- Produce ZoneIntelligenceSnapshot (single source of truth)
- Generate a human-readable intelligence_summary string
- Trigger AlertEngineService when thresholds are crossed
- Per-camera alert cooldown to avoid spam

Integration:
    Called from StreamWorker._process_frame() after dwell update.
    Runs synchronously (cheap, no I/O). Alert dispatch is async fire-and-forget.

No AI/ML. Pure rule-based signal aggregation.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.logging import get_logger
from app.services.intelligence.surge_engine import SurgeSignal, get_surge_engine
from app.services.intelligence.dwell_engine import DwellSignal, get_dwell_engine
from app.services.intelligence.flow_engine  import FlowSignal,  get_flow_engine

# Phase 2 imports
from app.services.intelligence.prediction_engine import PredictionSignal, PredictionEngine
from app.services.intelligence.fusion_engine import FusionSignal, MultiSignalFusionEngine
from app.services.intelligence.temporal_stability import TemporalStabilityEngine
from app.services.intelligence.venue_coordinator import venue_coordinator

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Alert trigger thresholds
# ─────────────────────────────────────────────────────────────────────────────

_ALERT_COOLDOWN_SECS = 60      # minimum seconds between alerts per camera


# ─────────────────────────────────────────────────────────────────────────────
# Unified snapshot
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ZoneIntelligenceSnapshot:
    """
    Complete intelligence picture for one camera/zone at one point in time.

    This is the single source of truth for:
    - Dashboard (API response)
    - Alert engine (decision dict)
    - Future AI enhancement layer
    """

    # Identity
    camera_id: str         = ""
    zone_id: str           = "camera"
    timestamp: str         = ""    # ISO 8601

    # ── Surge / Density ──────────────────────────────────────────────────────
    current_density: int          = 0
    smoothed_density: float       = 0.0
    rate_of_change_per_min: float = 0.0
    projected_2min: float         = 0.0
    projected_5min: float         = 0.0
    trend: str                    = "stable"   # increasing | decreasing | stable | volatile
    surge_intensity: str          = "low"      # low | medium | high | critical
    
    # ── Prediction (Phase 2) ─────────────────────────────────────────────────
    pred_density_5m: int          = 0
    pred_density_10m: int         = 0
    time_to_critical_min: Optional[int] = None
    predicted_trend: str          = "stable"
    prediction_confidence: float  = 0.0

    # ── Dwell ────────────────────────────────────────────────────────────────
    avg_dwell_seconds: float      = 0.0
    max_dwell_seconds: float      = 0.0
    long_dwell_count: int         = 0
    group_dwell_detected: bool    = False
    group_dwell_zones: List[str]  = field(default_factory=list)
    zone_status: str              = "normal"   # normal | gathering | stagnant
    stagnation_score: float       = 0.0
    dwell_distribution: Dict[str, int] = field(default_factory=dict)  # short/medium/long

    # ── Flow ─────────────────────────────────────────────────────────────────
    dominant_direction: str               = "unknown"
    directional_distribution: Dict[str, float] = field(default_factory=dict)
    stationary_ratio: float               = 0.0
    flow_intensity: str                   = "still"   # still | trickle | flowing | rushing
    avg_speed_px_per_frame: float         = 0.0

    overall_risk_level: str       = "low"      # low | medium | high | critical
    intelligence_summary: str     = ""         # Human-readable sentence
    alert_triggered: bool         = False
    alert_type: Optional[str]     = None       # Phase 2 smart alert
    alert_reason: Optional[str]   = None
    recommended_action: Optional[str] = None   # Phase 2 smart action
    contributing_factors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "camera_id": self.camera_id,
            "zone_id": self.zone_id,
            "timestamp": self.timestamp,
            "density": {
                "current": self.current_density,
                "smoothed": self.smoothed_density,
                "rate_per_min": self.rate_of_change_per_min,
                "projected_2min": self.projected_2min,
                "projected_5min": self.projected_5min,
                "trend": self.trend,
                "surge_intensity": self.surge_intensity,
            },
            "dwell": {
                "avg_seconds": self.avg_dwell_seconds,
                "max_seconds": self.max_dwell_seconds,
                "long_dwell_count": self.long_dwell_count,
                "group_dwell_detected": self.group_dwell_detected,
                "group_dwell_zones": self.group_dwell_zones,
                "zone_status": self.zone_status,
                "stagnation_score": self.stagnation_score,
                "distribution": self.dwell_distribution,
            },
            "flow": {
                "dominant_direction": self.dominant_direction,
                "distribution": self.directional_distribution,
                "stationary_ratio": self.stationary_ratio,
                "flow_intensity": self.flow_intensity,
                "avg_speed_px_per_frame": self.avg_speed_px_per_frame,
            },
            "prediction": {
                "density_5m": self.pred_density_5m,
                "density_10m": self.pred_density_10m,
                "time_to_critical_min": self.time_to_critical_min,
                "trend": self.predicted_trend,
                "confidence": self.prediction_confidence,
            },
            "intelligence": {
                "overall_risk_level": self.overall_risk_level,
                "summary": self.intelligence_summary,
                "alert_triggered": self.alert_triggered,
                "alert_type": self.alert_type,
                "alert_reason": self.alert_reason,
                "recommended_action": self.recommended_action,
                "contributing_factors": self.contributing_factors,
            },
        }


# ─────────────────────────────────────────────────────────────────────────────
# Orchestrator
# ─────────────────────────────────────────────────────────────────────────────

class ZoneIntelligenceOrchestrator:
    """
    Per-camera orchestrator that coordinates all intelligence engines.

    One instance per camera, created via get_zone_orchestrator().
    """

    def __init__(self, camera_id: str) -> None:
        self.camera_id   = camera_id
        self._surge      = get_surge_engine(camera_id)
        self._dwell_eng  = get_dwell_engine(camera_id)
        self._flow       = get_flow_engine(camera_id)
        
        # Phase 2 Engines
        self._pred_eng   = PredictionEngine()
        self._fuse_eng   = MultiSignalFusionEngine()
        self._stability  = TemporalStabilityEngine(camera_id, sustain_seconds=5.0)

        # Latest snapshot for API queries
        self._latest: Optional[ZoneIntelligenceSnapshot] = None

        # Alert state
        self._last_alert_time: float = 0.0       # Unix timestamp
        self._last_alert_type: Optional[str]    = None

        # Persistence throttling
        self._last_db_save_time: float = 0.0

    # ── Main tick ─────────────────────────────────────────────────────────────

    def tick(
        self,
        *,
        zone_id: str             = "camera",
        count: int               = 0,
        active_tracks: List[Dict[str, Any]],
        venue_id: Optional[str]  = None,
        venue_name: Optional[str] = None,
        metric_id: Optional[str] = None,
        capacity: Optional[int] = None,
        warning_threshold: Optional[int] = None,
        critical_threshold: Optional[int] = None,
    ) -> ZoneIntelligenceSnapshot:
        """
        Run one intelligence cycle and return a unified snapshot.

        Call this per-frame from StreamWorker (synchronous — no I/O).
        Alert dispatch is async fire-and-forget via asyncio.ensure_future().

        Args:
            zone_id:            Zone identifier (default = "camera" for whole-camera mode)
            count:              Current person count from YOLO
            active_tracks:      Active tracks from DwellTimeService.update()
            venue_id:           For alert routing (optional, alerts skipped if None)
            venue_name:         Human-readable venue name for alert message
            metric_id:          UUID string for alert decision
            capacity:           Venue capacity (absolute person count)
            warning_threshold:  Absolute person count at which warning fires
            critical_threshold: Absolute person count at which critical fires
        """
        now_ts = time.time()

        # Build a consolidated venue config for engines
        venue_cfg = {
            "warning_threshold": warning_threshold,
            "critical_threshold": critical_threshold,
            "capacity": capacity,
        }

        # ── Step 1: Surge ────────────────────────────────────────────────────
        surge: SurgeSignal = self._surge.update(
            zone_id,
            count,
            capacity=capacity,
            warning_threshold=warning_threshold,
            critical_threshold=critical_threshold
        )

        # ── Step 2: Dwell ────────────────────────────────────────────────────
        dwell: DwellSignal = self._dwell_eng.analyze_tracks(
            active_tracks, 
            target_zone=None,
            config=venue_cfg
        )

        # ── Step 3: Flow ─────────────────────────────────────────────────────
        flow: FlowSignal = self._flow.update(active_tracks, config=venue_cfg)

        # ── Step 4: Prediction (Phase 2) ─────────────────────────────────────
        pred: PredictionSignal = self._pred_eng.predict(surge, dwell, flow, venue_config=venue_cfg)

        # ── Step 5: Fusion (Phase 2) ─────────────────────────────────────────
        raw_fusion: FusionSignal = self._fuse_eng.fuse(surge, dwell, flow, pred, venue_config=venue_cfg)
        stable_fusion: FusionSignal = self._stability.stabilize(zone_id, raw_fusion)

        # ── Step 6: Build snapshot ───────────────────────────────────────────
        snap = ZoneIntelligenceSnapshot(
            camera_id             = self.camera_id,
            zone_id               = zone_id,
            timestamp             = datetime.now(timezone.utc).isoformat(),
            # Surge
            current_density       = surge.current_density,
            smoothed_density      = surge.smoothed_density,
            rate_of_change_per_min = surge.rate_of_change_per_min,
            projected_2min        = surge.projected_2min,
            projected_5min        = surge.projected_5min,
            trend                 = surge.trend,
            surge_intensity       = surge.surge_intensity,
            # Dwell
            avg_dwell_seconds     = dwell.avg_dwell_seconds,
            max_dwell_seconds     = dwell.max_dwell_seconds,
            long_dwell_count      = dwell.long_dwell_count,
            group_dwell_detected  = dwell.group_dwell_detected,
            group_dwell_zones     = dwell.group_dwell_zones,
            zone_status           = dwell.zone_status,
            stagnation_score      = dwell.stagnation_score,
            dwell_distribution    = {
                "short":  dwell.short_dwell_count,
                "medium": dwell.medium_dwell_count,
                "long":   dwell.long_dwell_count,
            },
            # Flow
            dominant_direction    = flow.dominant_direction,
            directional_distribution = flow.directional_distribution,
            stationary_ratio      = flow.stationary_ratio,
            flow_intensity        = flow.flow_intensity,
            avg_speed_px_per_frame = flow.avg_speed_px_per_frame,
            # Prediction
            pred_density_5m       = pred.predicted_density_5m,
            pred_density_10m      = pred.predicted_density_10m,
            time_to_critical_min  = pred.time_to_critical_min,
            predicted_trend       = pred.predicted_trend,
            prediction_confidence = pred.confidence,
            # Intelligence (Fused)
            overall_risk_level    = stable_fusion.risk_level,
            alert_type            = stable_fusion.alert_type,
            alert_reason          = stable_fusion.reason,
            recommended_action    = stable_fusion.recommended_action,
            contributing_factors  = stable_fusion.contributing_factors,
        )

        # ── Step 7: Intelligence summary ─────────────────────────────────────
        snap.intelligence_summary = self._build_summary(snap, zone_id)

        # ── Step 8: Venue Coordinator ────────────────────────────────────────
        if venue_id:
            venue_coordinator.publish_snapshot(venue_id, self.camera_id, snap.to_dict())
            # Periodic corridor-level evaluation
            corridor_intel = venue_coordinator.correlate_venue(venue_id, venue_config=venue_cfg)
            if corridor_intel.get("multi_camera_escalation"):
                logger.warning("Corridor-level risk escalation detected!", extra=corridor_intel)

        # ── Step 9: Alert dispatch ───────────────────────────────────────────
        if snap.alert_type and venue_id:
            cooldown_ok = (now_ts - self._last_alert_time) >= _ALERT_COOLDOWN_SECS
            if cooldown_ok or snap.alert_type != self._last_alert_type:
                snap.alert_triggered = True
                self._last_alert_time   = now_ts
                self._last_alert_type   = snap.alert_type
                asyncio.ensure_future(
                    self._dispatch_alert(snap, venue_id, venue_name or "Unknown Venue",
                                         metric_id or "")
                )

        self._latest = snap

        # ── Step 10: Persist snapshot to DB (Throttled: 5s) ────────────────────
        if venue_id and (now_ts - self._last_db_save_time >= 5.0):
            self._last_db_save_time = now_ts
            asyncio.ensure_future(self._save_snapshot_to_db(snap))

        return snap

    # ── Natural language summary ───────────────────────────────────────────────

    @staticmethod
    def _build_summary(snap: ZoneIntelligenceSnapshot, zone_id: str) -> str:
        """
        Construct a single human-readable intelligence sentence.

        e.g. "Zone A density is increasing rapidly, projected critical in 3 min,
               crowd forming, flow slowing toward Gate 2."
        """
        parts: List[str] = []

        zone_label = zone_id if zone_id != "camera" else "this camera zone"

        # ── Density/trend ─────────────────────────────────────────────────────
        density_phrase = {
            "increasing": "density is increasing",
            "decreasing": "density is decreasing",
            "stable":     "density is stable",
            "volatile":   "density is fluctuating",
        }.get(snap.trend, "density status unknown")

        surge_qualifier = {
            "critical": " rapidly",
            "high":     " significantly",
            "medium":   " moderately",
            "low":      "",
        }.get(snap.surge_intensity, "")

        parts.append(f"{zone_label.capitalize()} {density_phrase}{surge_qualifier}"
                     f" ({snap.current_density} people)")

        # ── Projection ────────────────────────────────────────────────────────
        if snap.rate_of_change_per_min > 1.0 and snap.projected_5min > snap.current_density:
            parts.append(
                f"projected to reach {int(snap.projected_5min)} in 5 min"
            )

        # ── Dwell/behavior ────────────────────────────────────────────────────
        if snap.zone_status == "stagnant":
            parts.append("crowd appears stagnant — possible blockage")
        elif snap.zone_status == "gathering":
            parts.append("crowd gathering detected")
        if snap.group_dwell_detected:
            zones_str = ", ".join(snap.group_dwell_zones[:2])
            parts.append(f"group dwell in {zones_str}")

        # ── Flow ──────────────────────────────────────────────────────────────
        flow_phrase = {
            "still":    "crowd is largely stationary",
            "trickle":  "movement is light",
            "flowing":  "crowd is moving normally",
            "rushing":  "crowd is moving rapidly — possible panic",
        }.get(snap.flow_intensity, "")
        if flow_phrase:
            parts.append(flow_phrase)

        if snap.dominant_direction not in ("unknown", "none"):
            parts.append(f"primary flow toward {snap.dominant_direction}")

        return "; ".join(parts) + "." if parts else "No significant intelligence signals."

    # ── Alert dispatch (async) ────────────────────────────────────────────────

    async def _dispatch_alert(
        self,
        snap: ZoneIntelligenceSnapshot,
        venue_id: str,
        venue_name: str,
        metric_id: str,
    ) -> None:
        """Fire an alert via AlertEngineService — never raises, always safe."""
        try:
            import uuid as _uuid
            from app.core.database import db_manager
            from app.services.alert_engine_service import AlertEngineService

            decision = {
                "venue_id": venue_id,
                "venue_name": venue_name,
                "metric_id": metric_id or str(_uuid.uuid4()),
                "metric_time": snap.timestamp,
                "previous_level": "medium",
                "current_level": snap.overall_risk_level,
                "transition": "escalated",
                "trend": snap.trend,
                "severity": None, # Will be calculated dynamically by AlertEngineService
                "should_alert": True,
                "recommended_action": snap.recommended_action or snap.intelligence_summary,
                "reason": snap.alert_reason or snap.intelligence_summary,
                "alert_type": snap.alert_type,
                "risk_score": None, # Managed dynamically
                "occupancy_percent": None,
                "early_warning_triggered": snap.overall_risk_level == "critical",
                "velocity": snap.avg_speed_px_per_frame,
                "direction_variance": 1.0 - snap.stationary_ratio,
                "acceleration": snap.rate_of_change_per_min,
                # Intelligence metadata stored in extra_data via alert engine
                "camera_id": snap.camera_id,
                "camera_location": snap.zone_id,
            }

            async with db_manager.session() as session:
                engine = AlertEngineService()
                await engine.process_decision(session, decision=decision)

            logger.info(
                "Intelligence alert dispatched",
                extra={
                    "camera_id": snap.camera_id,
                    "zone_id": snap.zone_id,
                    "risk_level": snap.overall_risk_level,
                    "reason": snap.alert_reason,
                },
            )
        except Exception as exc:
            logger.warning(
                "Intelligence alert dispatch failed (non-critical)",
                extra={"camera_id": self.camera_id, "error": str(exc)},
            )

    async def _save_snapshot_to_db(self, snap: ZoneIntelligenceSnapshot) -> None:
        """Persist the latest snapshot to the Camera model for API fallback."""
        try:
            from sqlalchemy import update
            from app.core.database import db_manager
            from app.models.camera import Camera
            from uuid import UUID

            async with db_manager.session() as session:
                stmt = (
                    update(Camera)
                    .where(Camera.id == UUID(self.camera_id))
                    .values(last_snapshot=snap.to_dict())
                )
                await session.execute(stmt)
                await session.commit()
        except Exception as exc:
            logger.warning(
                "Failed to persist intelligence snapshot to DB",
                extra={"camera_id": self.camera_id, "error": str(exc)},
            )

    # ── API helper ────────────────────────────────────────────────────────────

    def get_latest(self) -> Optional[ZoneIntelligenceSnapshot]:
        return self._latest


# ─────────────────────────────────────────────────────────────────────────────
# Registry — one orchestrator per camera
# ─────────────────────────────────────────────────────────────────────────────

_registry: Dict[str, ZoneIntelligenceOrchestrator] = {}


def get_zone_orchestrator(camera_id: str) -> ZoneIntelligenceOrchestrator:
    """Get or create ZoneIntelligenceOrchestrator for a camera."""
    if camera_id not in _registry:
        _registry[camera_id] = ZoneIntelligenceOrchestrator(camera_id)
    return _registry[camera_id]


def get_all_orchestrators() -> Dict[str, ZoneIntelligenceOrchestrator]:
    """Return all registered orchestrators (for summary API)."""
    return dict(_registry)
