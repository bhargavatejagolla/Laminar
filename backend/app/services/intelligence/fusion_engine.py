"""
Laminar Phase 2 - Multi-Signal Fusion Engine
---------------------------------------------

Synthesizes multiple raw intelligence signals into actionable context.
Replaces basic threshold alerts with "Smart Alerts".

Rules evaluate Density + Rate + Dwell + Flow + Prediction to determine:
- Risk Type (e.g. CONGESTION_RISK, PANIC_RISK)
- Recommended Actions
- Fused Risk Level
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, Optional

from app.core.logging import get_logger
from app.services.intelligence.surge_engine import SurgeSignal
from app.services.intelligence.dwell_engine import DwellSignal
from app.services.intelligence.flow_engine import FlowSignal
from app.services.intelligence.prediction_engine import PredictionSignal

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class FusionSignal:
    risk_level: str = "low"                 # low | medium | high | critical
    alert_type: Optional[str] = None        # e.g., CONGESTION_RISK, PANIC_RISK
    reason: Optional[str] = None
    recommended_action: Optional[str] = None
    contributing_factors: list[str] = None

    def __post_init__(self):
        if self.contributing_factors is None:
            self.contributing_factors = []


# ─────────────────────────────────────────────────────────────────────────────
# Engine
# ─────────────────────────────────────────────────────────────────────────────

class MultiSignalFusionEngine:
    """
    Evaluates combinations of signals to produce structured smart alerts.
    """

    def fuse(
        self,
        surge: SurgeSignal,
        dwell: DwellSignal,
        flow: FlowSignal,
        pred: PredictionSignal,
        venue_config: Optional[Dict[str, Any]] = None,
    ) -> FusionSignal:
        
        # Evaluate rules in order of severity (highest first)
        warn_limit = (venue_config.get("warning_threshold") if venue_config else 20) or 20
        crit_limit = (venue_config.get("critical_threshold") if venue_config else 60) or 60
        
        # ── 1. PANIC RISK (Critical) ──────────────────────────────────────────
        # Very fast, rushing movement + significantly high or volatile density
        # Threshold: 25% of warning limit, but at least 3 people to avoid noise
        panic_threshold = max(3.0, warn_limit * 0.25)
        if flow.flow_intensity == "rushing" and surge.current_density >= panic_threshold:
            return FusionSignal(
                risk_level="critical",
                alert_type="PANIC_RISK",
                reason=f"Crowd rushing rapidly ({flow.avg_speed_px_per_frame} px/f) "
                       f"mostly toward {flow.dominant_direction}.",
                recommended_action="Dispatch security immediately. Open emergency exits in direction of flow.",
                contributing_factors=["rushing_flow", "elevated_density", f"direction_{flow.dominant_direction}"]
            )

        # ── 2. BLOCKAGE / CRUSH RISK (Critical) ───────────────────────────────
        # High density + completely stagnant + growing
        # Threshold: 50% of critical limit
        blockage_threshold = crit_limit * 0.5
        if surge.current_density >= blockage_threshold and dwell.zone_status == "stagnant" and pred.predicted_trend in ("rising", "explosive"):
            mins = pred.time_to_critical_min
            time_str = f"in {mins} min" if mins is not None else "imminently"
            return FusionSignal(
                risk_level="critical",
                alert_type="BLOCKAGE_RISK",
                reason=f"Severe bottleneck: {surge.current_density} people stagnant "
                       f"(avg dwell {dwell.avg_dwell_seconds}s) with continued inflow. "
                       f"Critical capacity expected {time_str}.",
                recommended_action="Stop inflow to this zone immediately. Dispatch staff to clear bottleneck.",
                contributing_factors=["high_density", "stagnant_dwell", "inflow_exceeds_outflow"]
            )

        # ── 3. PREDICTIVE CONGESTION (High) ───────────────────────────────────
        # Density is okay now, but predicted to hit critical very soon
        # Threshold: Hit critical within 5 minutes (lookahead window)
        lookahead_mins = venue_config.get("lookahead_mins", 5) if venue_config else 5
        if pred.time_to_critical_min is not None and pred.time_to_critical_min <= lookahead_mins and pred.confidence > 0.6:
            return FusionSignal(
                risk_level="high",
                alert_type="CONGESTION_RISK",
                reason=f"Rapid crowd buildup ({surge.rate_of_change_per_min:+.1f} people/min). "
                       f"Zone will reach critical density in {pred.time_to_critical_min} minutes.",
                recommended_action="Prepare to redirect crowd. Open overflow areas.",
                contributing_factors=["rapid_growth", "high_prediction_confidence"]
            )

        # ── 4. ABNORMAL GATHERING (Medium) ────────────────────────────────────
        # Group dwelling without high density
        if dwell.zone_status == "gathering" and dwell.group_dwell_detected:
            return FusionSignal(
                risk_level="medium",
                alert_type="GATHERING_DETECTED",
                reason=f"Abnormal gathering detected: {dwell.long_dwell_count} individuals loitering "
                       f"for elevated durations.",
                recommended_action="Monitor via CCTV for suspicious activity or unauthorized events.",
                contributing_factors=["group_dwell", "high_dwell_time"]
            )

        # ── BASELINE ──────────────────────────────────────────────────────────
        # No specific complex risk pattern, fallback to basic surge sizing
        return FusionSignal(
            risk_level=surge.surge_intensity,
            alert_type=None,
            reason=None,
            recommended_action=None,
            contributing_factors=[]
        )

