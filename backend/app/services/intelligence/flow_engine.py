"""
Laminar - Flow Direction Engine
----------------------------------

Derives movement direction and flow intensity from per-person position history.

Works purely from bounding box centroids across frames:
- Tracks each person's last N centroid positions
- Computes displacement vector → compass direction
- Aggregates to zone-level directional distribution
- Classifies flow intensity and stationarity

No optical flow, no AI. Pure centroid geometry.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, List, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Defaults (overridden by dynamic parameters)
_DEFAULT_FLOW_CONFIG = {
    "min_displacement_px": 5.0,
    "flow_still_ratio": 0.80,
    "flow_trickle_ratio": 0.50,
    "flow_rushing_ratio": 0.15,
}

# 8 compass sectors: (min_angle, max_angle, label)
# Angles in [0, 360) measured clockwise from North (up = -y direction in image)
_SECTORS = [
    ("N",  337.5, 360),
    ("N",    0,  22.5),
    ("NE",  22.5, 67.5),
    ("E",   67.5, 112.5),
    ("SE", 112.5, 157.5),
    ("S",  157.5, 202.5),
    ("SW", 202.5, 247.5),
    ("W",  247.5, 292.5),
    ("NW", 292.5, 337.5),
]


def _angle_to_sector(angle_deg: float) -> str:
    """Map a bearing angle [0, 360) to a compass sector label."""
    angle_deg = angle_deg % 360
    for label, lo, hi in _SECTORS:
        if lo <= angle_deg < hi:
            return label
    return "N"  # fallback (handles 360 == 0)


def _bearing(dx: float, dy: float) -> float:
    """
    Compute compass bearing from displacement vector (dx, dy) in image space.
    Image y increases downward, so North = up = negative dy.
    """
    # atan2 measured from East, clockwise; convert to North-up clockwise bearing
    angle_from_east = math.degrees(math.atan2(-dy, dx))  # flip y for image coords
    bearing = (90.0 - angle_from_east) % 360.0
    return bearing


# ─────────────────────────────────────────────────────────────────────────────
# Per-track centroid history
# ─────────────────────────────────────────────────────────────────────────────

class _TrackHistory:
    """Rolling centroid history for a single tracked person."""

    def __init__(self, history_len: int = 10) -> None:
        self._positions: Deque[Tuple[float, float]] = deque(maxlen=history_len)

    def push(self, cx: float, cy: float) -> None:
        self._positions.append((cx, cy))

    def displacement(self) -> Optional[Tuple[float, float]]:
        """
        Return (dx, dy) from oldest to newest position.
        None if not enough history.
        """
        if len(self._positions) < 2:
            return None
        oldest = self._positions[0]
        newest = self._positions[-1]
        return (newest[0] - oldest[0], newest[1] - oldest[1])

    def is_moving(self, min_displacement_px: float = 5.0) -> bool:
        d = self.displacement()
        if d is None:
            return False
        return math.hypot(d[0], d[1]) >= min_displacement_px


# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class FlowSignal:
    """Directional intelligence for a zone or camera."""

    total_tracks: int               = 0
    moving_count: int               = 0
    stationary_count: int           = 0
    stationary_ratio: float         = 0.0      # 0.0 → all moving, 1.0 → all still

    dominant_direction: str         = "unknown" # compass sector N/NE/E/...
    directional_distribution: Dict[str, float] = field(default_factory=dict)  # sector → %

    flow_intensity: str             = "still"   # still | trickle | flowing | rushing

    avg_speed_px_per_frame: float   = 0.0       # average displacement magnitude


# ─────────────────────────────────────────────────────────────────────────────
# Engine
# ─────────────────────────────────────────────────────────────────────────────

class FlowDirectionEngine:
    """
    Per-camera flow direction analytics.

    Call update() each frame with the list of active tracks.
    Maintains centroid history internally — stale tracks pruned automatically.
    """

    def __init__(self, camera_id: str) -> None:
        self.camera_id = camera_id
        self._histories: Dict[int, _TrackHistory] = {}   # track_id → history
        self._last_signal: Optional[FlowSignal]   = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def _prune_stale(self, active_ids: set) -> None:
        """Remove history for tracks no longer present."""
        stale = [tid for tid in self._histories if tid not in active_ids]
        for tid in stale:
            del self._histories[tid]

    def _get_history(self, track_id: int) -> _TrackHistory:
        if track_id not in self._histories:
            self._histories[track_id] = _TrackHistory()
        return self._histories[track_id]

    # ── Main update ───────────────────────────────────────────────────────────

    def update(
        self, 
        active_tracks: List[Dict[str, Any]],
        config: Optional[Dict[str, Any]] = None,
    ) -> FlowSignal:
        """
        Process active tracks for this frame and return flow signal.

        Args:
            active_tracks: Output of DwellTimeService.update()
                           Each item: {track_id, bbox, dwell_seconds, zone}
            config:        Optional override for flow thresholds.
        """
        conf = {**_DEFAULT_FLOW_CONFIG, **(config or {})}
        sig = FlowSignal()

        if not active_tracks:
            self._last_signal = sig
            return sig

        # Push current centroids
        active_ids: set = set()
        for t in active_tracks:
            tid = t.get("track_id")
            bbox = t.get("bbox", [])
            if tid is None or len(bbox) != 4:
                continue
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            active_ids.add(tid)
            self._get_history(tid).push(cx, cy)

        self._prune_stale(active_ids)

        # Classify each track
        sector_counts: Dict[str, int] = {}
        speeds: List[float] = []
        n_moving = 0
        n_stationary = 0

        for tid, hist in list(self._histories.items()):
            if tid not in active_ids:
                continue  # skip tracks we didn't see this frame

            d = hist.displacement()
            if d is None or not hist.is_moving(conf["min_displacement_px"]):
                n_stationary += 1
                continue

            n_moving += 1
            dx, dy = d
            mag = math.hypot(dx, dy)
            speeds.append(mag)

            sector = _angle_to_sector(_bearing(dx, dy))
            sector_counts[sector] = sector_counts.get(sector, 0) + 1

        total = n_moving + n_stationary
        sig.total_tracks     = total
        sig.moving_count     = n_moving
        sig.stationary_count = n_stationary
        sig.stationary_ratio = round(n_stationary / total, 3) if total > 0 else 1.0

        # ── Directional distribution ──────────────────────────────────────────
        if n_moving > 0:
            sig.directional_distribution = {
                sec: round(cnt / n_moving * 100, 1)
                for sec, cnt in sector_counts.items()
            }
            sig.dominant_direction = max(sector_counts, key=sector_counts.get)
        else:
            sig.dominant_direction = "none"

        # ── Average speed ─────────────────────────────────────────────────────
        if speeds:
            sig.avg_speed_px_per_frame = round(sum(speeds) / len(speeds), 2)

        # ── Flow intensity ────────────────────────────────────────────────────
        sr = sig.stationary_ratio
        if sr >= conf["flow_still_ratio"]:
            sig.flow_intensity = "still"
        elif sr >= conf["flow_trickle_ratio"]:
            sig.flow_intensity = "trickle"
        elif sr >= conf["flow_rushing_ratio"]:
            sig.flow_intensity = "flowing"
        else:
            sig.flow_intensity = "rushing"

        self._last_signal = sig
        return sig

    def last_signal(self) -> FlowSignal:
        return self._last_signal or FlowSignal()


# ─────────────────────────────────────────────────────────────────────────────
# Registry
# ─────────────────────────────────────────────────────────────────────────────

_registry: Dict[str, FlowDirectionEngine] = {}


def get_flow_engine(camera_id: str) -> FlowDirectionEngine:
    if camera_id not in _registry:
        _registry[camera_id] = FlowDirectionEngine(camera_id)
    return _registry[camera_id]
