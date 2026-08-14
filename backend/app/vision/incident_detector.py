"""
Laminar - Incident AI Detector
------------------------------

Specialized AI for emergency and hazard detection.
Detects accidents, fires, and safety breaches.
"""

from typing import Tuple, List, Dict, Any, Optional
import numpy as np
import cv2
from datetime import datetime, timezone
import random

from app.core.logging import get_logger

logger = get_logger(__name__)


class IncidentIntelligence:
    """
    Emergency-focused intelligence engine (v2.0)
    Consumes VisionState to detect accidents via trajectory anomalies.
    Does not run its own YOLO model.
    """

    def __init__(self):
        logger.info("IncidentIntelligence engine initialized.")

    def analyze_incidents(self, vision_state: 'VisionState', frame_hsv: Optional[np.ndarray] = None) -> List[Dict[str, Any]]:
        """
        Scan for accidents using tracking trajectories, and fire using optional HSV frame.
        """
        incidents = []
        try:
            tracks = vision_state.tracks
            
            # 1. Heuristic: Collision Detection (Overlap of bounding boxes)
            if len(tracks) >= 2:
                for i in range(len(tracks)):
                    for j in range(i + 1, len(tracks)):
                        t1 = tracks[i]
                        t2 = tracks[j]
                        
                        b1 = t1["bbox"]
                        b2 = t2["bbox"]
                        
                        # Calculate Areas
                        area1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
                        area2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
                        
                        # Simple Overlap Check
                        x1 = max(b1[0], b2[0])
                        y1 = max(b1[1], b2[1])
                        x2 = min(b1[2], b2[2])
                        y2 = min(b1[3], b2[3])
                        
                        if x2 > x1 and y2 > y1:
                            overlap_area = (x2 - x1) * (y2 - y1)
                            # Only flag as collision if overlap is > 15% of the smaller vehicle
                            if overlap_area > 0.15 * min(area1, area2):
                                # Verify sudden deceleration for at least one of them to prevent false positives in traffic jams
                                speed_drop_1 = self._check_deceleration(t1)
                                speed_drop_2 = self._check_deceleration(t2)
                                
                                if speed_drop_1 or speed_drop_2:
                                    incidents.append({
                                        "type": "Accident / Collision",
                                        "priority": "CRITICAL",
                                        "description": f"Vehicle collision detected with sudden deceleration.",
                                        "timestamp": datetime.now(timezone.utc).isoformat(),
                                        "bbox": [int(x1), int(y1), int(x2), int(y2)]
                                    })
                                    logger.warning(f"HEURISTIC TRIGGER: Collision detected between tracks {t1['id']} and {t2['id']}")
                                    break
                    if incidents: break

            # 2. Heuristic: Severe Congestion
            if len(tracks) > 12:
                incidents.append({
                    "type": "Severe Congestion",
                    "priority": "HIGH",
                    "description": "High vehicle density detected. Urban node saturation imminent.",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })

            # 3. Simulation: Fire Alert (Color Masking)
            if frame_hsv is not None:
                lower_red = np.array([0, 120, 70])
                upper_red = np.array([10, 255, 255])
                mask = cv2.inRange(frame_hsv, lower_red, upper_red)
                total_pixels = frame_hsv.shape[0] * frame_hsv.shape[1]
                if cv2.countNonZero(mask) > (total_pixels * 0.04):
                    if not any(inc["type"] == "Accident / Collision" for inc in incidents):
                        incidents.append({
                            "type": "Fire Alert",
                            "priority": "CRITICAL",
                            "description": "High-intensity thermal/color signature detected in sector.",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

            return incidents

        except Exception as e:
            logger.error(f"Incident analysis error: {e}")
            return []

    def _check_deceleration(self, track: Dict) -> bool:
        """Check if trajectory shows severe sudden deceleration"""
        traj = track.get("trajectory", [])
        if len(traj) < 10:
            return False
            
        # Get speeds across the trajectory
        # Trajectory is [(cx, cy, t), ...]
        speeds = []
        for i in range(1, len(traj)):
            dt = max(traj[i][2] - traj[i-1][2], 0.01)
            dist = np.sqrt((traj[i][0] - traj[i-1][0])**2 + (traj[i][1] - traj[i-1][1])**2)
            speeds.append(dist / dt)
            
        if not speeds:
            return False
            
        # If max past speed was > 30px/s, and current speed is < 5px/s
        past_max = max(speeds[:-3]) if len(speeds) > 3 else max(speeds)
        current = sum(speeds[-3:]) / 3 if len(speeds) > 3 else speeds[-1]
        
        return past_max > 30 and current < 5

_incident_detector = None
def get_incident_detector():
    global _incident_detector
    if _incident_detector is None:
        _incident_detector = IncidentIntelligence()
    return _incident_detector

class LazyIncidentDetector:
    def __getattr__(self, name):
        return getattr(get_incident_detector(), name)

incident_detector = LazyIncidentDetector()
