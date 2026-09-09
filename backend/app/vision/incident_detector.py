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
        # Temporal incident lifecycle store: key -> {incident_id, status, consecutive_frames, ...}
        self._tracked_incidents: Dict[str, Dict[str, Any]] = {}
        self._last_cleanup: float = 0.0

    def detect_incidents(self, frame_or_state: Any) -> List[Dict[str, Any]]:
        """Compatibility method for callers passing frame or VisionState."""
        if hasattr(frame_or_state, "tracks"):
            return self.analyze_incidents(frame_or_state)
        return []

    def analyze_incidents(self, vision_state: 'VisionState', frame_hsv: Optional[np.ndarray] = None) -> List[Dict[str, Any]]:
        """
        Scan for genuine accidents using temporal tracking trajectories and multi-signal evidence scoring.
        Implements strict incident lifecycle: CANDIDATE -> CONFIRMED -> ACTIVE.
        """
        now = datetime.now(timezone.utc)
        now_ts = now.timestamp()
        
        # Periodic cleanup of stale tracked incidents (> 8 seconds without observation)
        if now_ts - self._last_cleanup > 5.0:
            stale_keys = [k for k, inc in self._tracked_incidents.items() if now_ts - inc.get("last_seen_ts", 0) > 8.0]
            for k in stale_keys:
                del self._tracked_incidents[k]
            self._last_cleanup = now_ts

        active_confirmed_incidents = []
        try:
            tracks = vision_state.tracks if hasattr(vision_state, "tracks") else []
            observed_keys_in_frame = set()

            # 1. Multi-Signal Collision Assessment with Trajectory & Kinematics Analysis
            if len(tracks) >= 2:
                import math
                for i in range(len(tracks)):
                    for j in range(i + 1, len(tracks)):
                        t1 = tracks[i]
                        t2 = tracks[j]
                        
                        b1 = t1.get("bbox", [0, 0, 0, 0])
                        b2 = t2.get("bbox", [0, 0, 0, 0])
                        
                        # Calculate Areas
                        w1, h1 = max(0, b1[2] - b1[0]), max(0, b1[3] - b1[1])
                        w2, h2 = max(0, b2[2] - b2[0]), max(0, b2[3] - b2[1])
                        area1 = w1 * h1
                        area2 = w2 * h2
                        if area1 <= 0 or area2 <= 0:
                            continue
                        
                        # Calculate Centroid Distance & Proximity
                        c1x, c1y = (b1[0] + b1[2]) / 2, (b1[1] + b1[3]) / 2
                        c2x, c2y = (b2[0] + b2[2]) / 2, (b2[1] + b2[3]) / 2
                        center_dist = math.sqrt((c1x - c2x)**2 + (c1y - c2y)**2)
                        min_dim = min(max(w1, h1), max(w2, h2))
                        proximity_threshold = min_dim * 0.85

                        # Contact Geometry (IoU)
                        x1 = max(b1[0], b2[0])
                        y1 = max(b1[1], b2[1])
                        x2 = min(b1[2], b2[2])
                        y2 = min(b1[3], b2[3])
                        
                        iou = 0.0
                        if x2 > x1 and y2 > y1:
                            intersection_area = (x2 - x1) * (y2 - y1)
                            union_area = area1 + area2 - intersection_area
                            iou = intersection_area / max(1.0, union_area)
                        
                        # Collision candidates require either visible overlap (IoU >= 0.04) or extreme proximity
                        if iou < 0.04 and center_dist > proximity_threshold:
                            continue

                        s1_curr = float(t1.get("speed_px_s", 0.0))
                        s2_curr = float(t2.get("speed_px_s", 0.0))
                        
                        # Signal 1: Sudden Deceleration / Impact Stop
                        traj1 = t1.get("trajectory", [])
                        traj2 = t2.get("trajectory", [])
                        s1_prior = s1_curr
                        if len(traj1) >= 3:
                            dx = traj1[-1][0] - traj1[0][0]
                            dy = traj1[-1][1] - traj1[0][1]
                            dt_span = max(0.05, traj1[-1][2] - traj1[0][2])
                            s1_prior = math.sqrt(dx*dx + dy*dy) / dt_span
                        s2_prior = s2_curr
                        if len(traj2) >= 3:
                            dx = traj2[-1][0] - traj2[0][0]
                            dy = traj2[-1][1] - traj2[0][1]
                            dt_span = max(0.05, traj2[-1][2] - traj2[0][2])
                            s2_prior = math.sqrt(dx*dx + dy*dy) / dt_span
                            
                        drop1 = max(0.0, s1_prior - s1_curr)
                        drop2 = max(0.0, s2_prior - s2_curr)
                        max_drop = max(drop1, drop2)
                        decel_score = min(1.0, max(0.0, max_drop / 20.0)) if (s1_curr < 8.0 or s2_curr < 8.0) else 0.0

                        # Signal 2: Trajectory Anomaly & Approach Heading Angle
                        anomaly_score = 0.0
                        if len(traj1) >= 2 and len(traj2) >= 2:
                            v1x = traj1[-1][0] - traj1[-2][0]
                            v1y = traj1[-1][1] - traj1[-2][1]
                            v2x = traj2[-1][0] - traj2[-2][0]
                            v2y = traj2[-1][1] - traj2[-2][1]
                            mag1 = math.sqrt(v1x*v1x + v1y*v1y)
                            mag2 = math.sqrt(v2x*v2x + v2y*v2y)
                            if mag1 > 0.5 and mag2 > 0.5:
                                dot = (v1x*v2x + v1y*v2y) / (mag1 * mag2)
                                dot = max(-1.0, min(1.0, dot))
                                angle_deg = math.degrees(math.acos(dot))
                                if angle_deg > 25.0:
                                    anomaly_score = min(1.0, (angle_deg - 25.0) / 45.0)

                        # Signal 3: Contact Geometry (IoU or Close Proximity)
                        geom_score = min(1.0, max(0.2, iou * 3.5)) if iou >= 0.04 else max(0.0, 1.0 - (center_dist / proximity_threshold))

                        # Signal 4: Post-event stationary stall
                        stall_score = 1.0 if (s1_curr < 5.0 and s2_curr < 5.0) else 0.0

                        # Weighted Evidence Score
                        evidence_score = (
                            0.35 * decel_score +
                            0.30 * anomaly_score +
                            0.20 * geom_score +
                            0.15 * stall_score
                        )

                        # Parallel smooth flowing traffic has evidence_score < 0.35 -> Ignored
                        if evidence_score < 0.40:
                            continue

                        t1_id, t2_id = min(t1["id"], t2["id"]), max(t1["id"], t2["id"])
                        inc_key = f"col_{t1_id}_{t2_id}"
                        observed_keys_in_frame.add(inc_key)

                        # Enclosing bounding box of both vehicles
                        enc_x1 = int(min(b1[0], b2[0]))
                        enc_y1 = int(min(b1[1], b2[1]))
                        enc_x2 = int(max(b1[2], b2[2]))
                        enc_y2 = int(max(b1[3], b2[3]))

                        if inc_key in self._tracked_incidents:
                            rec = self._tracked_incidents[inc_key]
                            rec["consecutive_frames"] += 1
                            rec["last_seen_ts"] = now_ts
                            rec["confidence"] = max(rec["confidence"], round(evidence_score, 2))
                            rec["bbox"] = [enc_x1, enc_y1, enc_x2, enc_y2]
                            
                            # Promote based on consecutive observation
                            if rec["consecutive_frames"] >= 2:
                                rec["status"] = "CONFIRMED"
                                active_confirmed_incidents.append(rec)
                        else:
                            # New candidate
                            status = "CONFIRMED" if evidence_score >= 0.70 else "CANDIDATE"
                            rec = {
                                "id": f"LMNR-INC-{t1_id}-{t2_id}",
                                "type": "collision",
                                "status": status,
                                "priority": "CRITICAL" if evidence_score >= 0.65 else "HIGH",
                                "confidence": round(evidence_score, 2),
                                "description": f"Collision anomaly detected between units #{t1_id} and #{t2_id}.",
                                "timestamp": now.isoformat(),
                                "first_seen_ts": now_ts,
                                "last_seen_ts": now_ts,
                                "consecutive_frames": 1,
                                "bbox": [enc_x1, enc_y1, enc_x2, enc_y2],
                                "track_ids": [t1_id, t2_id],
                                "evidence": {
                                    "score": round(evidence_score, 2),
                                    "signals": {
                                        "sudden_deceleration": round(decel_score, 2),
                                        "trajectory_anomaly": round(anomaly_score, 2),
                                        "contact_geometry": round(geom_score, 2),
                                        "post_event_stall": round(stall_score, 2),
                                        "iou": round(iou, 2)
                                    }
                                }
                            }
                            self._tracked_incidents[inc_key] = rec
                            if status == "CONFIRMED":
                                active_confirmed_incidents.append(rec)

            # 2. Road Hazard: Stalled Vehicle in Active Corridor
            # When average roadway traffic is moving (>15 px/s) and a single vehicle remains stopped (>3 frames)
            if len(tracks) >= 3:
                speeds = [float(t.get("speed_px_s", 0)) for t in tracks if t.get("class_name") != "person"]
                avg_speed = sum(speeds) / max(1, len(speeds))
                if avg_speed > 15.0:
                    for t in tracks:
                        if t.get("class_name") == "person":
                            continue
                        tid = t.get("id", 0)
                        s = float(t.get("speed_px_s", 0))
                        stopped_cnt = int(t.get("stopped_frames", 0))
                        if s < 3.5 and stopped_cnt >= 4:
                            hazard_key = f"stall_{tid}"
                            observed_keys_in_frame.add(hazard_key)
                            b = [int(p) for p in t.get("bbox", [0, 0, 50, 50])]
                            rec = {
                                "id": f"LMNR-HAZ-{tid}",
                                "type": "stalled_vehicle",
                                "status": "CONFIRMED",
                                "priority": "HIGH",
                                "confidence": 0.88,
                                "description": f"Vehicle #{tid} ({t.get('class_name', 'car').upper()}) stalled in active travel lane.",
                                "timestamp": now.isoformat(),
                                "first_seen_ts": now_ts,
                                "last_seen_ts": now_ts,
                                "consecutive_frames": stopped_cnt,
                                "bbox": b,
                                "track_ids": [tid]
                            }
                            self._tracked_incidents[hazard_key] = rec
                            active_confirmed_incidents.append(rec)

            # 3. Severe Corridor Gridlock / Lane Obstruction
            if len(tracks) >= 15:
                moving_count = sum(1 for t in tracks if float(t.get("speed_px_s", 0)) > 8.0)
                if moving_count <= 2: # Gridlock / stalled obstruction
                    obstruction_key = "corridor_gridlock"
                    if obstruction_key in self._tracked_incidents:
                        rec = self._tracked_incidents[obstruction_key]
                        rec["last_seen_ts"] = now_ts
                        rec["consecutive_frames"] += 1
                        if rec["consecutive_frames"] >= 3:
                            rec["status"] = "CONFIRMED"
                            active_confirmed_incidents.append(rec)
                    else:
                        self._tracked_incidents[obstruction_key] = {
                            "id": f"LMNR-OBS-{int(now_ts)}",
                            "type": "lane_obstruction",
                            "status": "CONFIRMED",
                            "priority": "HIGH",
                            "confidence": 0.85,
                            "description": "Corridor standstill detected: severe vehicle blockage.",
                            "timestamp": now.isoformat(),
                            "first_seen_ts": now_ts,
                            "last_seen_ts": now_ts,
                            "consecutive_frames": 1,
                            "track_ids": [t["id"] for t in tracks[:10]],
                            "signals": {"vehicle_count": len(tracks), "stalled": len(tracks) - moving_count}
                        }
                        active_confirmed_incidents.append(self._tracked_incidents[obstruction_key])

            return active_confirmed_incidents

        except Exception as e:
            logger.error(f"Incident analysis error: {e}")
            return []

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
