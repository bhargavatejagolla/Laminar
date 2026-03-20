"""
Laminar Phase 2 - Short-Term Prediction Engine
---------------------------------------------

Pure mathematical prediction of near-future crowd state.
Inputs: Surge (rate, trend), Flow (stationary ratio), Dwell (avg dwell).

Produces:
- predicted_density_5m
- predicted_density_10m
- time_to_critical_min (minutes until critical density)
- predicted_trend (rising / falling / stable / explosive)
- confidence (0.0 to 1.0)
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, Optional

from app.core.logging import get_logger
from app.services.intelligence.surge_engine import SurgeSignal
from app.services.intelligence.dwell_engine import DwellSignal
from app.services.intelligence.flow_engine import FlowSignal

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Default thresholds (overridden by venue config)
_DEFAULT_PREDICTION_CONFIG = {
    "critical_threshold": 50,
    "explosive_rate": 10.0,
    "rising_rate": 1.0,
}


# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PredictionSignal:
    predicted_density_5m: int = 0
    predicted_density_10m: int = 0
    time_to_critical_min: Optional[int] = None
    predicted_trend: str = "stable"  # rising | falling | stable | explosive
    confidence: float = 0.0          # 0.0 - 1.0


# ─────────────────────────────────────────────────────────────────────────────
# Engine
# ─────────────────────────────────────────────────────────────────────────────

class PredictionEngine:
    """
    Predicts near-future density and thresholds using Phase 1 signals.
    No internal state required — purely functional extrapolation.
    """

    def predict(
        self,
        surge: SurgeSignal,
        dwell: DwellSignal,
        flow: FlowSignal,
        venue_config: Optional[Dict[str, Any]] = None,
    ) -> PredictionSignal:
        sig = PredictionSignal()
        conf = {**_DEFAULT_PREDICTION_CONFIG, **(venue_config or {})}
        crit_threshold = conf.get("critical_threshold") or _DEFAULT_PREDICTION_CONFIG["critical_threshold"]
        
        # ── 1. Base Extrapolation ─────────────────────────────────────────────
        rate = surge.rate_of_change_per_min
        current = surge.smoothed_density
        
        if surge.is_warming_up:
            return sig

        # ── 2. Flow/Dwell Damping ─────────────────────────────────────────────
        effective_rate = rate
        
        # If density is already high and stationary, rate tends to naturally flatten
        if effective_rate > 0 and current > (crit_threshold * 0.8):
            if dwell.zone_status == "stagnant" or flow.stationary_ratio > 0.8:
                effective_rate *= 0.5  # Dampen expected growth

        # ── 3. Time Horizons ──────────────────────────────────────────────────
        pred_5 = max(0.0, current + (effective_rate * 5))
        pred_10 = max(0.0, current + (effective_rate * 10))
        
        sig.predicted_density_5m = int(round(pred_5))
        sig.predicted_density_10m = int(round(pred_10))

        # ── 4. Time to Critical ───────────────────────────────────────────────
        if current >= crit_threshold:
            sig.time_to_critical_min = 0
        elif effective_rate > (crit_threshold * 0.01): # At least 1% of capacity growth per min
            mins = (crit_threshold - current) / effective_rate
            if mins < 60:  # Only report if within an hour
                sig.time_to_critical_min = int(round(mins))

        # ── 5. Predicted Trend (Relative to Venue Scale) ──────────────────────
        # Explosive: > 10% of warning per minute
        # Rising: > 2% of warning per minute
        explosive_t = crit_threshold * 0.10
        rising_t = crit_threshold * 0.02
        
        if effective_rate > explosive_t:
            sig.predicted_trend = "explosive"
        elif effective_rate > rising_t:
            sig.predicted_trend = "rising"
        elif effective_rate < -rising_t:
            sig.predicted_trend = "falling"
        else:
            sig.predicted_trend = "stable"

        # ── 6. Confidence Scoring ─────────────────────────────────────────────
        # High volatility or low sample count = low confidence.
        base_conf = 0.9 if not surge.is_warming_up else 0.2
        
        if surge.trend == "volatile":
            base_conf *= 0.6  # Highly unpredictable
            
        # If flow and dwell align with trend, confidence increases
        if effective_rate > 0 and flow.flow_intensity == "rushing":
            base_conf = min(1.0, base_conf + 0.1)
            
        # Decay confidence slightly over longer horizons inherently
        sig.confidence = round(base_conf, 2)

        return sig

