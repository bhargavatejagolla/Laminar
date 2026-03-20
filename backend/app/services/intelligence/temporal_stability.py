"""
Laminar Phase 2 - Temporal Stability Engine
---------------------------------------------

Buffers predictions and smart alerts across multiple frames to 
ensure stability and prevent flickering in the live pipeline.

Maintains short rolling windows per camera zone. A signal must be 
present consistently (e.g., for N seconds/frames) before it is 
emitted as stable.
"""

from typing import Dict, Any, Optional
import time

from app.core.logging import get_logger
from app.services.intelligence.fusion_engine import FusionSignal

logger = get_logger(__name__)


class TemporalStabilityEngine:
    """
    Ensures that an alert condition is sustained before dispatching.
    Prevents noise and flickering.
    """

    def __init__(self, camera_id: str, sustain_seconds: float = 30.0):
        self.camera_id = camera_id
        self.sustain_seconds = sustain_seconds
        
        # Tracking the current pending alert condition per zone
        # zone_id -> {"alert_type": "...", "started_at": timestamp, "signal": FusionSignal}
        self._pending_conditions: Dict[str, Dict[str, Any]] = {}

    def stabilize(
        self, 
        zone_id: str, 
        current_signal: FusionSignal
    ) -> FusionSignal:
        """
        Takes raw fusion signal and returns the stable, delayed version.
        If a new high/critical state is detected, it returns baseline until 
        the sustain_seconds window has elapsed.
        """
        now = time.time()
        
        # If no alert condition, immediately clear pending buffer and return
        if current_signal.alert_type is None and current_signal.risk_level in ("low", "medium"):
            self._pending_conditions.pop(zone_id, None)
            return current_signal

        # If there is a risk, check if we are already tracking this EXACT alert_type
        # (or exact risk level if no custom type)
        cond_key = current_signal.alert_type or current_signal.risk_level
        
        pending = self._pending_conditions.get(zone_id)
        
        if pending and pending["cond_key"] == cond_key:
            # We are currently tracking this exact condition
            elapsed = now - pending["started_at"]
            if elapsed >= self.sustain_seconds:
                # Target time reached! The signal is stable.
                # Update the stored signal with latest live data
                pending["signal"] = current_signal
                return current_signal
            else:
                # Still stabilizing. We return a suppressed/downgraded version
                # so the dashboard doesn't flicker until we are confident.
                # (We don't return None, we return a basic 'medium' baseline)
                return FusionSignal(risk_level="medium")
        else:
            # The condition just changed (either from healthy or from a different alert state)
            # Start tracking the new condition
            self._pending_conditions[zone_id] = {
                "cond_key": cond_key,
                "started_at": now,
                "signal": current_signal,
            }
            # Suppress immediately
            return FusionSignal(risk_level="medium")

    def get_stable_signal(self, zone_id: str) -> Optional[FusionSignal]:
        pending = self._pending_conditions.get(zone_id)
        if pending:
            return pending["signal"]
        return None
        
