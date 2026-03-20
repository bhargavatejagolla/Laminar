"""
Laminar - Dwell Intelligence Engine
--------------------------------------

Converts raw DwellTimeService tracking records into behavioral analytics per zone.

This engine is READ-ONLY with respect to the tracker — it never modifies
DwellTimeService state. It reads the active track list and derives higher-level signals.

Features:
- Long-dwell detection (individual + group)
- Dwell distribution (short / medium / long buckets)
- Zone behavioral status: normal / gathering / stagnant
- Stagnation detection: rising stationary count + high avg dwell

No AI/ML. Pure time-based analytics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Default thresholds (overridden by dynamic parameters)
_DEFAULT_DWELL_CONFIG = {
    "short_secs": 60,      # < 60s  → short
    "long_secs": 300,      # > 300s → long (5 min)
    "group_min": 3,        # ≥ 3 people long-dwelling in same zone = group dwell
    "gather_ratio": 0.30,  # > 30% of zone people in long-dwell → gathering
    "stagnant_avg": 240,   # avg zone dwell > 4 min → potential stagnation
    "stagnant_count": 5,   # and at least N people present
}


# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DwellSignal:
    """
    Behavioral dwell analytics for a single zone or camera-level.
    """
    total_tracked: int          = 0
    in_zone_count: int          = 0        # currently inside a zone polygon
    avg_dwell_seconds: float    = 0.0
    max_dwell_seconds: float    = 0.0

    # Distribution
    short_dwell_count: int      = 0        # < 60s
    medium_dwell_count: int     = 0        # 60s – 300s
    long_dwell_count: int       = 0        # > 300s

    # Behavioral flags
    group_dwell_detected: bool  = False    # ≥ 3 long-dwellers in same zone
    group_dwell_zones: List[str] = field(default_factory=list)

    zone_status: str            = "normal" # normal | gathering | stagnant
    stagnation_score: float     = 0.0      # 0.0–1.0 composite stagnation signal

    # Long-dwell top tracks (for overlay / alert)
    long_dwell_tracks: List[Dict[str, Any]] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Engine
# ─────────────────────────────────────────────────────────────────────────────

class DwellIntelligenceEngine:
    """
    Per-camera behavioral analytics derived from DwellTimeService active tracks.

    Call analyze_tracks() every N frames (not necessarily every frame).
    """

    def __init__(self, camera_id: str) -> None:
        self.camera_id = camera_id
        self._last_signal: Optional[DwellSignal] = None

    # ── Main analysis ─────────────────────────────────────────────────────────

    def analyze_tracks(
        self,
        active_tracks: List[Dict[str, Any]],
        target_zone: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> DwellSignal:
        """
        Derive behavioral signals from active track list.

        Args:
            active_tracks: List returned by DwellTimeService.update()
                           Each item: {track_id, bbox, dwell_seconds, zone}
            target_zone:   If set, restrict analysis to this zone.
                           If None, analyze all tracks.
            config:        Optional override for dwell thresholds.

        Returns:
            DwellSignal with all behavioral metrics populated.
        """
        conf = {**_DEFAULT_DWELL_CONFIG, **(config or {})}
        sig = DwellSignal()

        # Filter to target zone if specified
        tracks = active_tracks
        if target_zone:
            tracks = [t for t in active_tracks if t.get("zone") == target_zone]

        if not tracks:
            self._last_signal = sig
            return sig

        sig.total_tracked = len(tracks)
        in_zone = [t for t in tracks if t.get("zone")]
        sig.in_zone_count = len(in_zone)

        dwells = [float(t.get("dwell_seconds", 0)) for t in tracks]
        sig.avg_dwell_seconds = round(sum(dwells) / len(dwells), 1)
        sig.max_dwell_seconds = round(max(dwells), 1)

        # ── Distribution ─────────────────────────────────────────────────────
        short_s = conf["short_secs"]
        long_s = conf["long_secs"]
        for d in dwells:
            if d < short_s:
                sig.short_dwell_count += 1
            elif d <= long_s:
                sig.medium_dwell_count += 1
            else:
                sig.long_dwell_count += 1

        # ── Long-dwell top tracks ─────────────────────────────────────────────
        long_tracks = [
            t for t in tracks
            if float(t.get("dwell_seconds", 0)) > long_s
        ]
        sig.long_dwell_tracks = sorted(
            long_tracks,
            key=lambda t: float(t.get("dwell_seconds", 0)),
            reverse=True,
        )[:10]  # top 10

        # ── Group dwell detection ─────────────────────────────────────────────
        # Group by zone: if ≥ _GROUP_DWELL_MIN people are long-dwelling in same zone
        group_min = conf["group_min"]
        zone_long_map: Dict[str, int] = {}
        for t in long_tracks:
            z = t.get("zone") or "unknown"
            zone_long_map[z] = zone_long_map.get(z, 0) + 1

        group_zones = [z for z, cnt in zone_long_map.items() if cnt >= group_min]
        if group_zones:
            sig.group_dwell_detected = True
            sig.group_dwell_zones = group_zones

        # ── Zone status ───────────────────────────────────────────────────────
        n = len(tracks)
        long_ratio = sig.long_dwell_count / n if n > 0 else 0.0
        
        # Stagnation count is relative to venue scale: 10% of warning or at least 2
        stagnant_count_threshold = conf.get("stagnant_count", max(2, int(0.1 * n)))

        if (sig.avg_dwell_seconds > conf["stagnant_avg"]
                and sig.in_zone_count >= stagnant_count_threshold):
            sig.zone_status = "stagnant"
        elif long_ratio >= conf["gather_ratio"] or sig.group_dwell_detected:
            sig.zone_status = "gathering"
        else:
            sig.zone_status = "normal"

        # ── Stagnation score 0–1 ─────────────────────────────────────────────
        # Composite: avg_dwell / (long_secs * 2) * 0.5 + long_ratio * 0.5, capped at 1.0
        norm_dwell = conf["long_secs"] * 2
        time_factor = min(1.0, sig.avg_dwell_seconds / norm_dwell)
        sig.stagnation_score = round(time_factor * 0.5 + long_ratio * 0.5, 3)

        self._last_signal = sig
        return sig

    def last_signal(self) -> DwellSignal:
        return self._last_signal or DwellSignal()


# ─────────────────────────────────────────────────────────────────────────────
# Registry
# ─────────────────────────────────────────────────────────────────────────────

_registry: Dict[str, DwellIntelligenceEngine] = {}


def get_dwell_engine(camera_id: str) -> DwellIntelligenceEngine:
    if camera_id not in _registry:
        _registry[camera_id] = DwellIntelligenceEngine(camera_id)
    return _registry[camera_id]
