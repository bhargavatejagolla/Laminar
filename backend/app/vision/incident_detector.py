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
        self._confirmed_sites: List[Any] = [] # [(cx, cy, timestamp, incident_id)]
        self._confirmed_tracks: set = set()
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
        
        # Periodic cleanup of stale tracked incidents (> 6 seconds without observation)
        if now_ts - self._last_cleanup > 5.0:
            stale_keys = [k for k, inc in self._tracked_incidents.items() if now_ts - inc.get("last_seen_ts", 0) > 6.0 and inc.get("status") != "CONFIRMED"]
            for k in stale_keys:
                del self._tracked_incidents[k]
            # Clean old confirmed sites (> 60s)
            self._confirmed_sites = [s for s in self._confirmed_sites if now_ts - s[2] < 60.0]
            self._last_cleanup = now_ts

        active_confirmed_incidents = []
        try:
            tracks = vision_state.tracks if hasattr(vision_state, "tracks") else []
            track_map = {t["id"]: t for t in tracks}
            frame_shape = getattr(vision_state, "frame_shape", (1080, 1920))
            fh, fw = frame_shape[0], frame_shape[1]
            observed_keys_in_frame = set()

            # 1. Evaluate Existing Candidates in Post-Impact Evidence Window
            for inc_key, rec in list(self._tracked_incidents.items()):
                if rec.get("status") == "CANDIDATE":
                    t1_id, t2_id = rec["track_ids"]
                    t1_alive = t1_id in track_map
                    t2_alive = t2_id in track_map

                    rec["post_impact_window_frames"] = rec.get("post_impact_window_frames", 0) + 1
                    rec["last_seen_ts"] = now_ts

                    # Case A: Both tracks alive and still in physical contact across 4+ consecutive frames
                    if t1_alive and t2_alive:
                        t1_obj, t2_obj = track_map[t1_id], track_map[t2_id]
                        b1, b2 = t1_obj.get("bbox", [0, 0, 0, 0]), t2_obj.get("bbox", [0, 0, 0, 0])
                        x1, y1 = max(b1[0], b2[0]), max(b1[1], b2[1])
                        x2, y2 = min(b1[2], b2[2]), min(b1[3], b2[3])
                        iou = 0.0
                        if x2 > x1 and y2 > y1:
                            iarea = (x2 - x1) * (y2 - y1)
                            w1, h1 = max(0, b1[2] - b1[0]), max(0, b1[3] - b1[1])
                            w2, h2 = max(0, b2[2] - b2[0]), max(0, b2[3] - b2[1])
                            iou = iarea / max(1.0, (w1 * h1) + (w2 * h2) - iarea)

                        if iou >= 0.15:
                            rec["consecutive_frames"] = rec.get("consecutive_frames", 1) + 1
                            if rec["consecutive_frames"] >= 4:
                                imp_pt = rec.get("impact_point", [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2])
                                if not self._is_near_existing_site(imp_pt[0], imp_pt[1], rec["track_ids"]):
                                    rec["status"] = "CONFIRMED"
                                    active_confirmed_incidents.append(rec)
                                    self._record_site(rec, now_ts)
                                continue

                    # Case B: High-impact collision where one vehicle was deformed/lost immediately after impact
                    elif (t1_alive != t2_alive) and rec.get("impact_signature_strong", False):
                        surviving = track_map[t1_id] if t1_alive else track_map[t2_id]
                        s_spd = float(surviving.get("speed_px_s", 0.0))
                        pre_spd = rec.get("surviving_pre_speed", s_spd)

                        # Check for post-impact deceleration of surviving vehicle
                        if pre_spd > 40.0 and (pre_spd - s_spd) > 35.0:
                            rec["observed_decel"] = True

                        # Verify disappearance occurred in the active roadway interior, NOT at camera edges
                        imp_pt = rec.get("impact_point", [fw / 2, fh / 2])
                        margin_x = fw * 0.08
                        margin_y = fh * 0.08
                        in_interior = (margin_x < imp_pt[0] < (fw - margin_x)) and (margin_y < imp_pt[1] < (fh - margin_y))

                        # Strict confirmation gate for vehicle loss after severe impact:
                        rel_spd = rec.get("impact_rel_speed", 0.0)
                        if in_interior and rec["post_impact_window_frames"] >= 2:
                            has_decel = rec.get("observed_decel", False)
                            if has_decel and rel_spd > 35.0:
                                if not self._is_near_existing_site(imp_pt[0], imp_pt[1], rec["track_ids"]):
                                    rec["status"] = "CONFIRMED"
                                    rec["evidence"]["post_impact"] = {
                                        "interior_track_loss": True,
                                        "surviving_deceleration": has_decel,
                                        "impact_iou": rec.get("impact_iou", 0.0),
                                        "impact_rel_speed": rel_spd
                                    }
                                    active_confirmed_incidents.append(rec)
                                    self._record_site(rec, now_ts)
                                continue

            # 2. Multi-Signal Collision Assessment with Trajectory & Kinematics Analysis
            if len(tracks) >= 2:
                import math
                for i in range(len(tracks)):
                    for j in range(i + 1, len(tracks)):
                        t1 = tracks[i]
                        t2 = tracks[j]
                        
                        # Both tracks must be established vehicles (at least 2 trajectory observations each)
                        # to prevent false alerts on 1-frame ghost/duplicate detector split boxes
                        traj1, traj2 = t1.get("trajectory", []), t2.get("trajectory", [])
                        if len(traj1) < 2 or len(traj2) < 2:
                            continue

                        b1 = t1.get("bbox", [0, 0, 0, 0])
                        b2 = t2.get("bbox", [0, 0, 0, 0])
                        
                        # Calculate Dimensions & Areas
                        w1, h1 = max(0, b1[2] - b1[0]), max(0, b1[3] - b1[1])
                        w2, h2 = max(0, b2[2] - b2[0]), max(0, b2[3] - b2[1])
                        area1 = w1 * h1
                        area2 = w2 * h2
                        if area1 <= 0 or area2 <= 0:
                            continue
                        
                        # Ignore distant horizon vehicles (perspective compression causes spurious overlaps)
                        c1y = (b1[1] + b1[3]) / 2
                        c2y = (b2[1] + b2[3]) / 2
                        if c1y < 140 or c2y < 140 or min(h1, h2) < 25:
                            continue

                        # Calculate Centroid Distance
                        c1x = (b1[0] + b1[2]) / 2
                        c2x = (b2[0] + b2[2]) / 2
                        center_dist = math.sqrt((c1x - c2x)**2 + (c1y - c2y)**2)
                        min_dim = min(max(w1, h1), max(w2, h2))

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
                        
                        if iou < 0.10 and center_dist > (min_dim * 0.40):
                            continue

                        # Prior approach history: verify they were previously separate vehicles
                        p1_start = traj1[0]
                        p2_start = traj2[0]
                        start_dist = math.sqrt((p1_start[0] - p2_start[0])**2 + (p1_start[1] - p2_start[1])**2)
                        if start_dist < 35.0 and iou > 0.60:
                            # Spawned together at same position -> Duplicate detection of same vehicle
                            continue

                        # Check if close to an already confirmed crash site or involved tracks
                        if self._is_near_existing_site((c1x + c2x) / 2, (c1y + c2y) / 2, [t1["id"], t2["id"]]):
                            continue

                        s1_curr = float(t1.get("speed_px_s", 0.0))
                        s2_curr = float(t2.get("speed_px_s", 0.0))
                        
                        # Signal 1: Sudden Deceleration / Kinematic Disruption
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

                        rel_spd = abs(s1_curr - s2_curr)
                        # Deceleration evaluates speed drop OR high relative closing speed at severe contact
                        decel_score = min(1.0, max_drop / 25.0) if (s1_curr < 15.0 or s2_curr < 15.0 or iou >= 0.50) else 0.0
                        if iou >= 0.50 and rel_spd > 50.0:
                            decel_score = max(decel_score, min(1.0, rel_spd / 80.0))

                        # Signal 2: Trajectory Kinematics & Collision Archetype Classification
                        convergence_score = 0.0
                        col_type = "collision"

                        if len(traj1) >= 2 and len(traj2) >= 2:
                            v1x = traj1[-1][0] - traj1[-2][0]
                            v1y = traj1[-1][1] - traj1[-2][1]
                            v2x = traj2[-1][0] - traj2[-2][0]
                            v2y = traj2[-1][1] - traj2[-2][1]
                            mag1 = math.sqrt(v1x*v1x + v1y*v1y)
                            mag2 = math.sqrt(v2x*v2x + v2y*v2y)

                            if mag1 > 0.8 and mag2 > 0.8:
                                dot = (v1x*v2x + v1y*v2y) / (mag1 * mag2)
                                dot = max(-1.0, min(1.0, dot))
                                angle_deg = math.degrees(math.acos(dot))

                                if angle_deg > 25.0:
                                    convergence_score = min(1.0, (angle_deg - 25.0) / 45.0)
                                    col_type = "crossing_collision"
                                elif dot >= 0.70 and center_dist > 1.0:
                                    dx = c2x - c1x
                                    dy = c2y - c1y
                                    rel_vx = v1x - v2x
                                    rel_vy = v1y - v2y
                                    closing_speed = (rel_vx * dx + rel_vy * dy) / center_dist
                                    if abs(closing_speed) > 6.0:
                                        convergence_score = min(1.0, abs(closing_speed) / 20.0)
                                        col_type = "rear_end_collision"
                            elif (mag1 > 1.5 and mag2 < 0.8) or (mag2 > 1.5 and mag1 < 0.8):
                                moving_t = 1 if mag1 > mag2 else 2
                                dx = (c2x - c1x) if moving_t == 1 else (c1x - c2x)
                                dy = (c2y - c1y) if moving_t == 1 else (c1y - c2y)
                                mvx = v1x if moving_t == 1 else v2x
                                mvy = v1y if moving_t == 1 else v2y
                                if center_dist > 1.0:
                                    approach_proj = (mvx * dx + mvy * dy) / center_dist
                                    if approach_proj > 6.0:
                                        convergence_score = min(1.0, approach_proj / 20.0)
                                        col_type = "stationary_impact"

                        # Signal 3: Contact Geometry (Substantial IoU or tight penetration)
                        geom_score = min(1.0, iou * 3.0) if iou >= 0.10 else 0.0

                        # Signal 4: Post-event stationary stall
                        if s1_curr < 6.0 and s2_curr < 6.0:
                            stall_score = 1.0
                        elif s1_curr < 6.0 or s2_curr < 6.0:
                            stall_score = 0.5
                        elif iou >= 0.70 and (drop1 > 30 or drop2 > 30):
                            stall_score = 0.7
                        else:
                            stall_score = 0.0

                        # Weighted Evidence Score
                        evidence_score = (
                            0.35 * decel_score +
                            0.30 * convergence_score +
                            0.20 * geom_score +
                            0.15 * stall_score
                        )

                        if evidence_score < 0.60:
                            continue

                        t1_id, t2_id = min(t1["id"], t2["id"]), max(t1["id"], t2["id"])
                        inc_key = f"col_{t1_id}_{t2_id}"
                        observed_keys_in_frame.add(inc_key)

                        # Enclosing bounding box of both vehicles
                        enc_x1 = int(min(b1[0], b2[0]))
                        enc_y1 = int(min(b1[1], b2[1]))
                        enc_x2 = int(max(b1[2], b2[2]))
                        enc_y2 = int(max(b1[3], b2[3]))

                        # Severe physical impact signature
                        is_severe_impact = (
                            (iou >= 0.50 and rel_spd > 40.0) or
                            (iou >= 0.75) or
                            (center_dist < 15.0 and rel_spd > 50.0 and iou >= 0.40)
                        )

                        if inc_key in self._tracked_incidents:
                            rec = self._tracked_incidents[inc_key]
                            rec["consecutive_frames"] += 1
                            rec["last_seen_ts"] = now_ts
                            rec["confidence"] = max(rec["confidence"], round(evidence_score, 2))
                            rec["bbox"] = [enc_x1, enc_y1, enc_x2, enc_y2]
                            
                            # Promote based on 4+ consecutive frames of observed collision evidence
                            if rec["consecutive_frames"] >= 4:
                                imp_pt = rec.get("impact_point", [(c1x + c2x) / 2, (c1y + c2y) / 2])
                                if not self._is_near_existing_site(imp_pt[0], imp_pt[1], [t1_id, t2_id]):
                                    rec["status"] = "CONFIRMED"
                                    active_confirmed_incidents.append(rec)
                                    self._record_site(rec, now_ts)
                        else:
                            # New candidate - must persist or pass post-impact evidence window
                            if col_type == "rear_end_collision":
                                desc = f"Rear-end impact detected between units #{t1_id} and #{t2_id}."
                            elif col_type == "stationary_impact":
                                desc = f"Stationary impact hazard detected between units #{t1_id} and #{t2_id}."
                            else:
                                desc = f"Crossing collision anomaly detected between units #{t1_id} and #{t2_id}."

                            rec = {
                                "id": f"LMNR-INC-{t1_id}-{t2_id}",
                                "type": col_type,
                                "status": "CANDIDATE",
                                "priority": "CRITICAL",
                                "confidence": round(evidence_score, 2),
                                "description": desc,
                                "timestamp": now.isoformat(),
                                "first_seen_ts": now_ts,
                                "last_seen_ts": now_ts,
                                "consecutive_frames": 1,
                                "bbox": [enc_x1, enc_y1, enc_x2, enc_y2],
                                "impact_point": [(c1x + c2x) / 2, (c1y + c2y) / 2],
                                "track_ids": [t1_id, t2_id],
                                "impact_iou": round(iou, 3),
                                "impact_rel_speed": round(rel_spd, 1),
                                "impact_signature_strong": is_severe_impact,
                                "surviving_pre_speed": max(s1_curr, s2_curr),
                                "evidence": {
                                    "score": round(evidence_score, 2),
                                    "archetype": col_type,
                                    "signals": {
                                        "sudden_deceleration": round(decel_score, 2),
                                        "convergence": round(convergence_score, 2),
                                        "contact_geometry": round(geom_score, 2),
                                        "post_event_stall": round(stall_score, 2),
                                        "iou": round(iou, 2)
                                    }
                                }
                            }
                            self._tracked_incidents[inc_key] = rec

            # 2. Road Hazard: Stalled Vehicle in Active Corridor
            # Genuinely stalled vehicle: must be in foreground/active corridor, stopped for >= 10 frames,
            # and traffic around it is flowing (> 15 px/s).
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
                        b = t.get("bbox", [0, 0, 50, 50])
                        cy = (b[1] + b[3]) / 2.0
                        bh = b[3] - b[1]

                        # Ignore horizon / distant perspective vehicles (cy < 160 or small bounding box)
                        if cy < 160 or bh < 30:
                            continue

                        # Must be stationary for >= 10 sampled frames (>= 1.6s) with prior motion history
                        traj = t.get("trajectory", [])
                        had_prior_motion = False
                        if len(traj) >= 5:
                            dx = traj[-1][0] - traj[0][0]
                            dy = traj[-1][1] - traj[0][1]
                            if math.sqrt(dx*dx + dy*dy) > 30.0:
                                had_prior_motion = True

                        if s < 3.0 and stopped_cnt >= 10 and had_prior_motion:
                            hazard_key = f"stall_{tid}"
                            observed_keys_in_frame.add(hazard_key)
                            b_int = [int(p) for p in b]
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
                                "bbox": b_int,
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

    def _is_near_existing_site(self, cx: float, cy: float, track_ids: Optional[List[int]] = None, radius: float = 350.0) -> bool:
        """Prevent duplicate collision incidents for already involved vehicles or at the same crash site."""
        if track_ids and hasattr(self, "_confirmed_tracks"):
            for tid in track_ids:
                if tid in self._confirmed_tracks:
                    return True
        import math
        for sx, sy, _, _ in self._confirmed_sites:
            if math.sqrt((cx - sx)**2 + (cy - sy)**2) < radius:
                return True
        return False

    def _record_site(self, rec: Dict[str, Any], now_ts: float):
        """Record confirmed collision site and involved tracks."""
        pt = rec.get("impact_point", [0, 0])
        self._confirmed_sites.append((pt[0], pt[1], now_ts, rec.get("id")))
        if not hasattr(self, "_confirmed_tracks"):
            self._confirmed_tracks = set()
        for tid in rec.get("track_ids", []):
            self._confirmed_tracks.add(tid)

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
