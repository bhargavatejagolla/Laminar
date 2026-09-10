"""
LAMINAR - Intersection & Cross-Road Intelligence Analyzer
----------------------------------------------------------
Derives cross-road analytics and queue metrics purely from existing
YOLO11 + ByteTrack track kinematics without loading auxiliary heavy models.

Features:
- Approach flow rate and direction vectors
- Stopped vehicle queue estimation (v < 5 px/s)
- Conflict zone occupancy & gridlock detection
- Zero-mock: explicitly reports "NOT_CONFIGURED" and "SIGNAL DATA NOT CONNECTED"
  when venue geometry or signal hardware is absent.
"""

import math
import time
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

from app.core.logging import get_logger

logger = get_logger(__name__)


class IntersectionAnalyzer:
    """Zero-heavy-model intersection kinematics engine."""

    def __init__(self):
        self._stopped_history: Dict[int, int] = {}  # track_id -> stopped frame count

    def analyze_intersection(
        self,
        tracks: List[Dict[str, Any]],
        intersection_config: Optional[Dict[str, Any]] = None,
        camera_id: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Analyze current tracks relative to configured intersection geometry.
        If intersection_config is None or empty: returns honest NOT_CONFIGURED.
        """
        if not intersection_config:
            return {
                "status": "NOT_CONFIGURED",
                "signal_state": "SIGNAL DATA NOT CONNECTED",
                "camera_id": camera_id,
                "timestamp": time.time(),
                "metrics": {
                    "approach_vehicles": 0,
                    "queue_length_vehicles": 0,
                    "stopped_vehicles": 0,
                    "conflict_zone_occupancy": 0,
                    "blockage_detected": False
                },
                "notes": "No intersection geometry or signal integration configured for this camera/venue."
            }

        approach_zones = intersection_config.get("approach_zones", {})
        conflict_zone = intersection_config.get("conflict_zone", None)
        stop_lines = intersection_config.get("stop_lines", [])

        # Filter vehicle tracks
        vehicle_tracks = [t for t in tracks if t.get("class_name") in {"car", "truck", "bus", "motorcycle"}]

        stopped_count = 0
        queue_count = 0
        conflict_occupancy = 0
        directional_flows = {"north": 0, "south": 0, "east": 0, "west": 0}

        for t in vehicle_tracks:
            tid = t.get("id") or t.get("track_id", 0)
            bbox = t.get("bbox", [0, 0, 0, 0])
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            spd = float(t.get("speed_px_s", 0.0))

            # Stopped track analysis
            if spd < 5.0:
                self._stopped_history[tid] = self._stopped_history.get(tid, 0) + 1
            else:
                self._stopped_history[tid] = 0

            is_stopped = self._stopped_history.get(tid, 0) >= 3
            if is_stopped:
                stopped_count += 1

            # Conflict zone check
            if conflict_zone:
                cz_poly = np.array(conflict_zone, dtype=np.int32)
                import cv2
                if cv2.pointPolygonTest(cz_poly, (cx, cy), False) >= 0:
                    conflict_occupancy += 1

            # Directional vector from trajectory
            traj = t.get("trajectory", [])
            if len(traj) >= 3:
                dx = traj[-1][0] - traj[0][0]
                dy = traj[-1][1] - traj[0][1]
                angle_deg = math.degrees(math.atan2(dy, dx))
                if -45 <= angle_deg <= 45:
                    directional_flows["east"] += 1
                elif 45 < angle_deg <= 135:
                    directional_flows["south"] += 1
                elif -135 <= angle_deg < -45:
                    directional_flows["north"] += 1
                else:
                    directional_flows["west"] += 1

        # Blockage check
        blockage = conflict_occupancy >= 4 and stopped_count >= 3

        return {
            "status": "CONFIGURED",
            "signal_state": intersection_config.get("signal_state", "SIGNAL DATA NOT CONNECTED"),
            "camera_id": camera_id,
            "timestamp": time.time(),
            "metrics": {
                "total_vehicles_in_view": len(vehicle_tracks),
                "stopped_vehicles": stopped_count,
                "conflict_zone_occupancy": conflict_occupancy,
                "blockage_detected": blockage,
                "directional_flow": directional_flows
            }
        }


intersection_analyzer = IntersectionAnalyzer()
