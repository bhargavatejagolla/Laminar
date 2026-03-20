"""
Laminar - Surge Intelligence Engine
-------------------------------------

Transforms raw crowd counts into predictive density signals.

Features:
- Rolling window time-series per (camera, zone)
- EMA-smoothed rate-of-change (per minute)
- Short-term density projection (2 and 5 minutes ahead)
- Trend classification: increasing / decreasing / stable / volatile
- Surge intensity: low / medium / high / critical
- Noise suppression via EMA + spike clamp

No AI/ML. Pure time-series math.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Configuration constants
# ─────────────────────────────────────────────────────────────────────────────

_WINDOW_SIZE        = 60    # number of samples to keep per zone (rolling)
_EMA_ALPHA          = 0.30  # smoothing factor (0=very smooth, 1=raw)
_RATE_LOOKBACK      = 10    # samples back for rate-of-change calculation
_STABLE_THRESHOLD   = 0.5   # |rate| < this → classified as stable (people/min)
_VOLATILE_THRESHOLD = 5.0   # rate variance > this → volatile

# Rate-based surge escalation (people/min) 
# Thresholds will be derived dynamically relative to venue size.
# Fallback rates if warning_threshold is missing:
_FALLBACK_RATE_CRITICAL = 30.0
_FALLBACK_RATE_HIGH     = 15.0
_FALLBACK_RATE_MEDIUM   = 5.0


# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class _Sample:
    """A single density observation."""
    count: int
    ts: float   # Unix timestamp (time.time())


@dataclass
class SurgeSignal:
    """
    Structured output from SurgeIntelligenceEngine for one (camera, zone).
    """
    current_density: int          = 0
    smoothed_density: float       = 0.0
    rate_of_change_per_min: float = 0.0   # positive = growing
    projected_2min: float         = 0.0
    projected_5min: float         = 0.0
    trend: str                    = "stable"   # increasing | decreasing | stable | volatile
    surge_intensity: str          = "low"      # low | medium | high | critical
    sample_count: int             = 0
    is_warming_up: bool           = True       # True until we have enough samples


# ─────────────────────────────────────────────────────────────────────────────
# Per-zone state
# ─────────────────────────────────────────────────────────────────────────────

class _ZoneState:
    """Maintains rolling window + EMA tracker for a single zone."""

    def __init__(self) -> None:
        self._window: Deque[_Sample] = deque(maxlen=_WINDOW_SIZE)
        self._ema: float             = 0.0
        self._initialized: bool      = False

    # ── Push a new count observation ──────────────────────────────────────────

    def push(self, count: int, ts: Optional[float] = None) -> None:
        t = ts or time.time()
        sample = _Sample(count=count, ts=t)
        self._window.append(sample)

        # Update EMA
        if not self._initialized:
            self._ema = float(count)
            self._initialized = True
        else:
            self._ema = _EMA_ALPHA * count + (1.0 - _EMA_ALPHA) * self._ema

    # ── Compute current signal ───────────────────────────────────────────────

    def compute(
        self,
        capacity: Optional[int] = None,
        warning_threshold: Optional[int] = None,
        critical_threshold: Optional[int] = None
    ) -> SurgeSignal:
        n = len(self._window)
        if n == 0:
            return SurgeSignal()

        current = self._window[-1].count
        sig = SurgeSignal(
            current_density = current,
            smoothed_density = round(self._ema, 2),
            sample_count     = n,
            is_warming_up    = n < max(4, _RATE_LOOKBACK // 2),
        )

        # ── Rate of change ──────────────────────────────────────────────────
        if n >= 2:
            lookback = min(_RATE_LOOKBACK, n - 1)
            old = self._window[-1 - lookback]
            elapsed_s = self._window[-1].ts - old.ts
            if elapsed_s > 0.1:
                delta = self._ema - old.count
                sig.rate_of_change_per_min = round((delta / elapsed_s) * 60.0, 2)

        # ── Projection ──────────────────────────────────────────────────────
        r = sig.rate_of_change_per_min
        sig.projected_2min = round(max(0, self._ema + r * 2), 1)
        sig.projected_5min = round(max(0, self._ema + r * 5), 1)

        # ── Trend classification ─────────────────────────────────────────────
        # Stability and Volatility are relative to venue scale.
        # Stable: rate < 1% of warning per min
        # Volatile: variance > 10% of warning per min
        warn_ref = warning_threshold if warning_threshold else 50.0
        stable_t = warn_ref * 0.01
        volatile_t = warn_ref * 0.10

        if n >= 4:
            # Compute rate variance over the window to detect volatility
            half = n // 2
            rates = []
            for i in range(1, min(half, 10)):
                dt = self._window[-i].ts - self._window[-i - 1].ts
                if dt > 0.05:
                    rates.append(
                        (self._window[-i].count - self._window[-i - 1].count) / dt * 60
                    )
            if rates:
                import statistics
                variance = statistics.variance(rates) if len(rates) > 1 else 0.0
                if variance > volatile_t ** 2:
                    sig.trend = "volatile"
                elif r > stable_t:
                    sig.trend = "increasing"
                elif r < -stable_t:
                    sig.trend = "decreasing"
                else:
                    sig.trend = "stable"
            else:
                sig.trend = "stable"
        else:
            sig.trend = "stable"

        # ── Dynamic Intensity Thresholds ───────────────────────────────
        local_density_thresholds = [("critical", 50), ("high", 30), ("medium", 15), ("low", 0)]
        local_rate_thresholds = [("critical", _FALLBACK_RATE_CRITICAL), ("high", _FALLBACK_RATE_HIGH), ("medium", _FALLBACK_RATE_MEDIUM), ("low", 0)]

        if critical_threshold is not None:
            warn_val = warning_threshold if warning_threshold is not None else int(critical_threshold * 0.7)
            medium_val = max(1, int(warn_val * 0.7))
            
            local_density_thresholds = [
                ("critical", critical_threshold),
                ("high",     warn_val),
                ("medium",   medium_val),
                ("low",       0),
            ]

            # Scale rate thresholds relative to warning level:
            # Critical rate = 50% of warning threshold per minute
            # High rate = 25% of warning threshold per minute
            # Medium rate = 10% of warning threshold per minute
            local_rate_thresholds = [
                ("critical", warn_val * 0.5),
                ("high",     warn_val * 0.25),
                ("medium",   warn_val * 0.1),
                ("low",       0),
            ]

        # Base on current density count
        density_intensity = "low"
        for level, threshold in local_density_thresholds:
            if current >= threshold:
                density_intensity = level
                break

        # Base on rate of change
        rate_intensity = "low"
        for level, threshold in local_rate_thresholds:
            if abs(r) >= threshold:
                rate_intensity = level
                break

        _order = ["low", "medium", "high", "critical"]
        sig.surge_intensity = _order[
            max(_order.index(density_intensity), _order.index(rate_intensity))
        ]

        return sig


# ─────────────────────────────────────────────────────────────────────────────
# Main engine — registry of per-(camera, zone) states
# ─────────────────────────────────────────────────────────────────────────────

class SurgeIntelligenceEngine:
    """
    Singleton-per-camera surge analytics engine.

    Thread-safe: all state is in plain Python dicts/deques.
    Designed to be called from the async stream_worker loop
    (cheap enough to call synchronously; no I/O).
    """

    def __init__(self, camera_id: str) -> None:
        self.camera_id = camera_id
        self._zones: Dict[str, _ZoneState] = {}

    def _get_zone(self, zone_id: str) -> _ZoneState:
        if zone_id not in self._zones:
            self._zones[zone_id] = _ZoneState()
        return self._zones[zone_id]

    def update(
        self, 
        zone_id: str, 
        count: int, 
        ts: Optional[float] = None,
        capacity: Optional[int] = None,
        warning_threshold: Optional[int] = None,
        critical_threshold: Optional[int] = None
    ) -> SurgeSignal:
        """
        Push a new density observation and return the current surge signal.

        Args:
            zone_id:            Zone or camera-level identifier. Use "camera" for no-zone mode.
            count:              Number of detected people.
            ts:                 Unix timestamp (defaults to now).
            capacity:           Venue total capacity (absolute count).
            warning_threshold:  Absolute person count at which warning fires.
            critical_threshold: Absolute person count at which critical fires.
        """
        state = self._get_zone(zone_id)
        state.push(count, ts)
        sig = state.compute(capacity=capacity, warning_threshold=warning_threshold, critical_threshold=critical_threshold)
        return sig

    def get_signal(self, zone_id: str) -> SurgeSignal:
        """Return last computed signal without pushing a new sample."""
        if zone_id not in self._zones:
            return SurgeSignal()
        return self._zones[zone_id].compute()

    def all_signals(self) -> Dict[str, SurgeSignal]:
        """Return signals for every tracked zone."""
        return {zid: state.compute() for zid, state in self._zones.items()}

    def reset_zone(self, zone_id: str) -> None:
        """Clear history for a zone (e.g. after camera restart)."""
        self._zones.pop(zone_id, None)


# ─────────────────────────────────────────────────────────────────────────────
# Registry — one engine per camera
# ─────────────────────────────────────────────────────────────────────────────

_registry: Dict[str, SurgeIntelligenceEngine] = {}


def get_surge_engine(camera_id: str) -> SurgeIntelligenceEngine:
    """Get or create the SurgeIntelligenceEngine for a camera."""
    if camera_id not in _registry:
        _registry[camera_id] = SurgeIntelligenceEngine(camera_id)
    return _registry[camera_id]
