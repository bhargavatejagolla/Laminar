"""
Laminar - Traffic AI Detector (v2 - Startup Grade)
----------------------------------------------------

Specialized YOLO detector for traffic flow and congestion monitoring.
Returns per-vehicle data, grid-based density matrix, and congestion risk score.
"""

import asyncio
import time
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import cv2
from datetime import datetime, timezone

from app.core.logging import get_logger

logger = get_logger(__name__)

# COCO class IDs for vehicles
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

# Density matrix grid dimensions
GRID_ROWS = 6
GRID_COLS = 8


from app.vision.vision_core import VisionState

def build_density_matrix(detections: List[Dict], frame_shape: Tuple[int, int],
                          rows: int = GRID_ROWS, cols: int = GRID_COLS) -> List[List[int]]:
    """
    Divides the frame into a rows×cols grid and counts vehicles per cell.
    Returns a 2D list [[count, ...], ...].
    """
    h, w = frame_shape[:2]
    cell_h = h / rows
    cell_w = w / cols
    matrix = [[0] * cols for _ in range(rows)]

    for det in detections:
        cx, cy = det.get("cx", 0), det.get("cy", 0)
        r = min(int(cy / cell_h), rows - 1)
        c = min(int(cx / cell_w), cols - 1)
        matrix[r][c] += 1

    return matrix


class TrafficIntelligence:
    """
    Traffic Intelligence Engine (v2.0)
    Consumes VisionState (shared tracking data) instead of running YOLO.
    Computes density, congestion risk, and flow statistics.
    """
    def __init__(self):
        self._last_analytics: Dict[str, Dict] = {}
        logger.info("TrafficIntelligence engine initialized.")

    async def detect_traffic(self, frame: np.ndarray, camera_id: str = "upload-demo") -> Dict[str, Any]:
        """
        Canonical adapter: processes frame through VisionCore and analyzes traffic.
        Returns unified traffic flow analytics and tracked vehicle detections.
        """
        from app.vision.vision_core import vision_core
        vision_state = await vision_core.process_frame(frame, camera_id)
        result = self.analyze_traffic(vision_state)
        result["vehicles"] = vision_state.tracks
        return result

    def analyze_traffic(self, vision_state: 'VisionState') -> Dict[str, Any]:
        """
        Analyze the tracking data to generate traffic flow metrics.
        Returns a dict compatible with FlowMetrics and legacy structures.
        """
        try:
            h, w = vision_state.frame_shape
            count = len(vision_state.tracks)

            # Density / congestion logic
            density, signal, congestion_level = "Low", "Green", 0.15
            if count > 25:
                density, signal, congestion_level = "Critical", "Red", 0.95
            elif count > 15:
                density, signal, congestion_level = "High", "Yellow", 0.75
            elif count > 5:
                density, signal, congestion_level = "Medium", "Green", 0.40

            # Average speed (now in km/h)
            speeds = [t.get("speed_kmh", 0) for t in vision_state.tracks if t.get("speed_kmh", 0) > 0]
            avg_speed_kmh = round(sum(speeds) / max(1, len(speeds)), 2)

            # Average speed (legacy px/s)
            speeds_px = [t.get("speed_px_s", 0) for t in vision_state.tracks]
            avg_velocity = round(sum(speeds_px) / max(1, len(speeds_px)), 2)

            # Wait time estimate
            velocity_factor = max(0.1, avg_velocity / 100.0)
            wait_time = round(min((count / 5.0) * (1.0 / velocity_factor), 25.0), 1) if count > 0 else 0.0

            # Congestion risk score (0–100)
            risk_score = round(congestion_level * 100 + max(0, wait_time - 5) * 0.5)
            risk_score = min(risk_score, 100)

            # Density matrix
            density_matrix = build_density_matrix(vision_state.tracks, vision_state.frame_shape)

            analytics = {
                "count": int(count),
                "vehicle_count": int(count),
                "density": str(density),
                "density_status": str(density),
                "congestion_level": float(congestion_level),
                "risk_score": int(risk_score),
                "signal_suggestion": str(signal),
                "avg_velocity": float(avg_velocity),
                "avg_speed_kmh": float(avg_speed_kmh),
                "wait_time_estimate": float(wait_time),
                "vehicles": vision_state.tracks,
                "density_matrix": density_matrix,
                "frame_shape": [int(h), int(w)],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            self._last_analytics[vision_state.camera_id] = analytics
            return analytics

        except Exception as e:
            logger.error(f"Traffic analysis error: {e}", exc_info=True)
            return self._empty_result()

    def _empty_result(self) -> Dict[str, Any]:
        return {
            "count": 0, "vehicle_count": 0, "density": "Low", "density_status": "Low", 
            "congestion_level": 0.0, "risk_score": 0,
            "signal_suggestion": "Green", "avg_velocity": 0.0, "avg_speed_kmh": 0.0, "wait_time_estimate": 0.0,
            "vehicles": [], "density_matrix": [[0]*GRID_COLS for _ in range(GRID_ROWS)],
            "frame_shape": [480, 640],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    def get_density_matrix(self, camera_id: Optional[str] = None) -> List[List[int]]:
        """Returns the latest density matrix for a camera."""
        if camera_id and camera_id in self._last_analytics:
            return self._last_analytics[camera_id].get("density_matrix", [])
        # Aggregate all cameras
        all_analytics = list(self._last_analytics.values())
        if not all_analytics:
            return [[0]*GRID_COLS for _ in range(GRID_ROWS)]
        # Sum matrices
        rows, cols = GRID_ROWS, GRID_COLS
        combined = [[0]*cols for _ in range(rows)]
        for a in all_analytics:
            mat = a.get("density_matrix", [])
            for r in range(min(rows, len(mat))):
                for c in range(min(cols, len(mat[r]))):
                    combined[r][c] += mat[r][c]
        return combined

    def get_current_insights(self) -> Dict[str, Any]:
        """Tactical intelligence for Traffic Dashboard."""
        from app.core.global_state import GLOBAL_STATE
        status = GLOBAL_STATE.get_domain_state("traffic")
        total_vehicles = sum(v.get("count", 0) for v in status.values())
        congested_zones = sum(1 for v in status.values() if v.get("density") in ["High", "Critical"])
        avg_risk = round(sum(v.get("risk_score", 0) for v in status.values()) / max(1, len(status))) if status else 0

        if total_vehicles == 0:
            avg_speed = 0.0
            density_status = "Low"
            flow_state = "free_flow"
            avg_risk = 0
            suggestion = "Corridor is clear. No active vehicle congestion detected."
        else:
            avg_speed = round(sum(v.get("avg_velocity", 20.0) for v in status.values()) / max(1, len(status)), 1)
            density_status = "High" if congested_zones > 0 else "Medium"
            flow_state = "congested" if congested_zones > 0 else "free_flow"
            if congested_zones > 0:
                suggestion = f"High congestion in {congested_zones} zones. Consider adding +15s to critical green phases."
            elif avg_risk > 50:
                suggestion = "Elevated corridor risk. Monitor traffic flow closely."
            else:
                suggestion = f"Traffic flowing steadily. Total of {total_vehicles} vehicles currently tracked."

        return {
            "overall": {
                "total_vehicles": int(total_vehicles),
                "congested_zones": int(congested_zones),
                "status": str("HEAVY" if congested_zones > 0 else "FLUID"),
                "risk_score": int(avg_risk),
            },
            "metrics": {
                "density": round(min(1.0, total_vehicles / 30.0), 2),
                "avg_speed": avg_speed,
                "vehicle_count": int(total_vehicles),
                "wait_time_min": round(max(0.5, total_vehicles * 0.7), 1)
            },
            "flow_state": flow_state,
            "signals": status,
            "suggestion": str(suggestion)
        }


_traffic_detector = None
def get_traffic_detector():
    global _traffic_detector
    if _traffic_detector is None:
        _traffic_detector = TrafficIntelligence()
    return _traffic_detector

class LazyTrafficDetector:
    def __getattr__(self, name):
        return getattr(get_traffic_detector(), name)

traffic_detector = LazyTrafficDetector()
