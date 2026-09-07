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
        Scan for accidents using tracking trajectories and multi-signal evidence scoring.
        """
        incidents = []
        try:
            tracks = vision_state.tracks
            
            # 1. Heuristic: Collision Detection (Multi-Signal Evidence Score)
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
                        min_area = min(area1, area2)
                        
                        # Simple Overlap Check
                        x1 = max(b1[0], b2[0])
                        y1 = max(b1[1], b2[1])
                        x2 = min(b1[2], b2[2])
                        y2 = min(b1[3], b2[3])
                        
                        evidence_score = 0.0
                        signals = {}
                        
                        if x2 > x1 and y2 > y1 and min_area > 0:
                            overlap_area = (x2 - x1) * (y2 - y1)
                            overlap_ratio = overlap_area / min_area
                            
                            if overlap_ratio > 0.10:
                                evidence_score += min(overlap_ratio * 0.5, 0.4) # Up to 0.4 from overlap
                                signals["overlap_ratio"] = overlap_ratio
                                
                                # Verify sudden deceleration for both vehicles
                                decel_1 = self._check_deceleration(t1)
                                decel_2 = self._check_deceleration(t2)
                                
                                if decel_1 > 0:
                                    evidence_score += min(decel_1 * 0.3, 0.3)
                                    signals["decel_1"] = decel_1
                                if decel_2 > 0:
                                    evidence_score += min(decel_2 * 0.3, 0.3)
                                    signals["decel_2"] = decel_2
                                    
                                if evidence_score > 0.6: # Threshold for confirmed accident
                                    incidents.append({
                                        "type": "collision",
                                        "priority": "CRITICAL",
                                        "confidence": round(evidence_score, 2),
                                        "description": f"Collision detected with confidence {evidence_score:.1%}.",
                                        "timestamp": datetime.now(timezone.utc).isoformat(),
                                        "bbox": [int(x1), int(y1), int(x2), int(y2)],
                                        "track_ids": [t1["id"], t2["id"]],
                                        "signals": signals
                                    })
                                    logger.warning(f"INCIDENT: Collision detected (score {evidence_score:.2f})")
                                    break
                    if incidents: break

            # 2. Heuristic: Severe Congestion
            if len(tracks) > 12:
                incidents.append({
                    "type": "lane_obstruction",
                    "priority": "HIGH",
                    "confidence": 0.85,
                    "description": "High vehicle density detected. Possible obstruction.",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "track_ids": [t["id"] for t in tracks],
                    "signals": {"vehicle_count": len(tracks)}
                })

            return incidents

        except Exception as e:
            logger.error(f"Incident analysis error: {e}")
            return []

    def _check_deceleration(self, track: Dict) -> float:
        """
        Check if trajectory shows sudden deceleration.
        Returns a score from 0.0 to 1.0 based on deceleration severity.
        """
        traj = track.get("trajectory", [])
        if len(traj) < 10:
            return 0.0
            
        # Get speeds across the trajectory
        speeds = []
        for i in range(1, len(traj)):
            dt = max(traj[i][2] - traj[i-1][2], 0.01)
            dist = np.sqrt((traj[i][0] - traj[i-1][0])**2 + (traj[i][1] - traj[i-1][1])**2)
            speeds.append(dist / dt)
            
        if not speeds:
            return 0.0
            
        past_max = max(speeds[:-3]) if len(speeds) > 3 else max(speeds)
        current = sum(speeds[-3:]) / 3 if len(speeds) > 3 else speeds[-1]
        
        if past_max < 15: # Was never moving fast enough to constitute a "sudden" stop
            return 0.0
            
        speed_drop = past_max - current
        if speed_drop > 20 and current < 10:
            # Normalize score
            score = min((speed_drop - 20) / 30.0, 1.0)
            return float(round(score, 2))
            
        return 0.0

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
