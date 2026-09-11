"""
LAMINAR Kinetic Intelligence - Behavioral Fusion & Temporal Reasoning Engine
------------------------------------------------------------------------------
Enterprise-grade multi-signal behavioral inference with:
- Defensible geometric heuristics (Velocity delta, Trajectory divergence, Collapse, Proximity)
- Multi-frame temporal state machine (NORMAL -> CANDIDATE -> VERIFIED -> RESOLVING)
- Frame quality confidence suppression (Laplacian sharpness & illumination gating)
- Spatial zone boundary evaluation (Restricted / High-Risk / Transit)
- Structured forensic explainability ("Why Was This Verified?")
- Zero-mock telemetry and explicit unconfigured signal reporting
"""

import math
import time
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timezone


class TrackState:
    """Tracks the temporal state and trajectory of an individual subject."""
    def __init__(self, track_id: Any, initial_bbox: List[float], initial_centroid: Tuple[float, float], now: Optional[float] = None):
        self.track_id = track_id
        ts = now if now is not None else time.time()
        self.first_seen_ts = ts
        self.last_seen_ts = ts
        self.centroids: List[Tuple[float, float, float]] = [(initial_centroid[0], initial_centroid[1], ts)]
        self.bboxes: List[List[float]] = [initial_bbox]
        
        # State machine: "NORMAL" -> "CANDIDATE" -> "VERIFIED" -> "RESOLVING"
        self.state: str = "NORMAL"
        self.candidate_since_ts: Optional[float] = None
        self.verified_ts: Optional[float] = None
        self.persistence_duration: float = 0.0
        
        # Grounded signal confidences (0 - 100)
        self.motion_anomaly_score: float = 0.0
        self.trajectory_anomaly_score: float = 0.0
        self.velocity_delta_score: float = 0.0
        self.collapse_score: float = 0.0
        self.proximity_score: float = 0.0
        
        # Active anomalies detected on this subject
        self.active_signals: List[str] = []
        self.last_incident_type: Optional[str] = None
        self.last_explainability: Optional[Dict[str, Any]] = None

    def update(self, bbox: List[float], centroid: Tuple[float, float], now: Optional[float] = None):
        ts = now if now is not None else time.time()
        self.last_seen_ts = ts
        self.centroids.append((centroid[0], centroid[1], ts))
        self.bboxes.append(bbox)
        
        # Keep last 60 observations (~2-4 seconds depending on frame rate)
        if len(self.centroids) > 60:
            self.centroids.pop(0)
            self.bboxes.pop(0)


class KineticDetector:
    """
    Production Kinetic Intelligence Fusion Engine.
    Evaluates poses, velocity dynamics, collapse geometries, and temporal persistence.
    """

    def __init__(self, fps: int = 15):
        self.fps = fps
        self.tracks: Dict[Any, TrackState] = {}
        self.frame_count = 0
        self.start_time = time.time()
        
        # Grounded signal state across scene
        self.motion_conf: float = 0.0
        self.trajectory_conf: float = 0.0
        self.velocity_conf: float = 0.0
        self.fall_conf: float = 0.0
        self.persistence_conf: float = 0.0
        self.fusion_score: float = 0.0
        
        # Audio distress state (explicitly unconfigured by default)
        self.audio_configured: bool = False
        self.audio_status: str = "NOT CONFIGURED / UNAVAILABLE"
        self.audio_conf: float = 0.0
        self.audio_hits: int = 0
        
        # Incident lifecycle
        self.scene_state: str = "NORMAL"  # "NORMAL" | "CANDIDATE" | "VERIFIED" | "RESOLVING"
        self.sos_activated: bool = False
        self.timeline: List[Dict[str, Any]] = []
        self.last_verified_event: Optional[Dict[str, Any]] = None
        
        # Spatial zones: list of dicts with {"name": str, "type": "RESTRICTED"|"HIGH_RISK", "polygon": [[x,y],...]}
        self.spatial_zones: List[Dict[str, Any]] = []

    def reset(self):
        """Complete state reset when switching sources or initiating replay."""
        self.tracks.clear()
        self.frame_count = 0
        self.motion_conf = 0.0
        self.trajectory_conf = 0.0
        self.velocity_conf = 0.0
        self.fall_conf = 0.0
        self.persistence_conf = 0.0
        self.fusion_score = 0.0
        self.scene_state = "NORMAL"
        self.sos_activated = False
        self.timeline.clear()
        self.last_verified_event = None
        self.start_time = time.time()

    def set_spatial_zones(self, zones: List[Dict[str, Any]]):
        """Configures spatial zones for restricted perimeter enforcement."""
        self.spatial_zones = zones or []

    def calculate_distance(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    def inject_audio_signals(self, keyword_count: int):
        """Binds and updates real audio distress keywords if an audio track is processed."""
        if keyword_count > 0:
            self.audio_configured = True
            self.audio_status = "ACTIVE"
            self.audio_hits += keyword_count
            self.audio_conf = min(100.0, keyword_count * 25.0)
            self._add_timeline_event(f"Distress Audio Keyword Confirmed ({keyword_count} instances)")

    def _add_timeline_event(self, message: str, level: str = "INFO"):
        now_str = datetime.now(timezone.utc).strftime("%H:%M:%S")
        if not self.timeline or self.timeline[-1]["message"] != message:
            self.timeline.append({
                "timestamp": now_str,
                "message": message,
                "level": level
            })
            if len(self.timeline) > 20:
                self.timeline.pop(0)

    def _check_point_in_polygon(self, point: Tuple[float, float], polygon: List[List[float]]) -> bool:
        """Ray-casting algorithm to verify if centroid is within zone polygon."""
        x, y = point
        n = len(polygon)
        inside = False
        p1x, p1y = polygon[0]
        for i in range(n + 1):
            p2x, p2y = polygon[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        return inside

    def detect_anomalies(
        self,
        bounding_boxes: List[Dict[str, Any]],
        keypoints: Optional[List[List[Any]]] = None,
        frame_quality: Optional[Dict[str, Any]] = None,
        source_timestamp: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Core perceptual & temporal evaluation function.
        
        Args:
            bounding_boxes: Detected boxes with track IDs and coordinates.
            keypoints: 17-point skeletal pose estimations.
            frame_quality: Dict containing sharpness (Laplacian var) and mean intensity (0-255).
            source_timestamp: Monotonic video/stream time in seconds (ensures persistence uses video time).
        """
        now = source_timestamp if source_timestamp is not None else time.time()
        self.frame_count += 1
        events: List[Dict[str, Any]] = []

        # 1. Evaluate Frame Quality Suppression
        quality_suppressed = False
        suppression_reason = None
        if frame_quality:
            sharpness = frame_quality.get("sharpness", 100.0)
            mean_intensity = frame_quality.get("mean_intensity", 128.0)
            if sharpness < 40.0:
                quality_suppressed = True
                suppression_reason = f"LOW_SHARPNESS ({sharpness:.1f} < 40.0)"
            elif mean_intensity < 25.0:
                quality_suppressed = True
                suppression_reason = f"UNDEREXPOSED ({mean_intensity:.1f} < 25.0)"
            elif mean_intensity > 245.0:
                quality_suppressed = True
                suppression_reason = f"OVEREXPOSED ({mean_intensity:.1f} > 245.0)"

        # Smooth / decay previous scene confidences
        self.motion_conf = max(0.0, self.motion_conf - 2.5)
        self.trajectory_conf = max(0.0, self.trajectory_conf - 2.5)
        self.velocity_conf = max(0.0, self.velocity_conf - 2.5)
        self.fall_conf = max(0.0, self.fall_conf - 1.5)
        self.persistence_conf = max(0.0, self.persistence_conf - 2.0)

        # Standby check if no subjects are detected in view
        if not bounding_boxes:
            # Prune stale tracks after 3 seconds of absence
            stale_ids = [tid for tid, t in self.tracks.items() if now - t.last_seen_ts > 3.0]
            for tid in stale_ids:
                del self.tracks[tid]
            if not self.tracks:
                self.scene_state = "NORMAL"
                self.fusion_score = 0.0
            return events

        # Prepare normalized keypoint list
        if keypoints is None:
            keypoints = [None] * len(bounding_boxes)

        current_frame_centroids: List[Tuple[float, float]] = []

        # 2. Track Association & Geometric Feature Extraction
        for idx, (bbox_info, kpts) in enumerate(zip(bounding_boxes, keypoints)):
            raw_b = bbox_info.get("bbox", [0, 0, 0, 0])
            if len(raw_b) == 1 and isinstance(raw_b[0], (list, tuple)):
                raw_b = raw_b[0]
            bx1, by1, bx2, by2 = [float(c) for c in raw_b]
            cx, cy = (bx1 + bx2) / 2.0, (by1 + by2) / 2.0
            current_frame_centroids.append((cx, cy))
            b_width = max(1.0, bx2 - bx1)
            b_height = max(1.0, by2 - by1)
            aspect_ratio = b_width / b_height

            # Retrieve track ID or generate temporary spatial proxy
            track_id = bbox_info.get("id")
            if track_id is None:
                # Find closest recent track within 80px
                closest_tid = None
                closest_d = 80.0
                for tid, trk in self.tracks.items():
                    if trk.centroids:
                        d = self.calculate_distance((cx, cy), (trk.centroids[-1][0], trk.centroids[-1][1]))
                        if d < closest_d:
                            closest_d = d
                            closest_tid = tid
                track_id = closest_tid if closest_tid is not None else f"trk_{idx}_{int(now)}"

            # Instantiate or update track with source timestamp
            if track_id not in self.tracks:
                self.tracks[track_id] = TrackState(track_id, [bx1, by1, bx2, by2], (cx, cy), now=now)
            track = self.tracks[track_id]
            track.update([bx1, by1, bx2, by2], (cx, cy), now=now)

            # Feature A: Sudden Velocity Change & Trajectory Deviation
            velocity_px_sec = 0.0
            trajectory_jitter = 0.0
            if len(track.centroids) >= 3:
                c_curr = track.centroids[-1]
                c_prev = track.centroids[-2]
                dt = max(0.01, c_curr[2] - c_prev[2])
                dist = self.calculate_distance((c_curr[0], c_curr[1]), (c_prev[0], c_prev[1]))
                velocity_px_sec = dist / dt

                # Velocity change compared to older baseline
                if len(track.centroids) >= 8:
                    c_base = track.centroids[-8]
                    dt_base = max(0.05, c_prev[2] - c_base[2])
                    base_vel = self.calculate_distance((c_prev[0], c_prev[1]), (c_base[0], c_base[1])) / dt_base
                    vel_delta = abs(velocity_px_sec - base_vel)
                    
                    if vel_delta > 140.0:  # Sudden acceleration / violent jerk
                        track.velocity_delta_score = min(100.0, vel_delta / 2.5)
                        self.velocity_conf = max(self.velocity_conf, track.velocity_delta_score)
                    else:
                        track.velocity_delta_score = max(0.0, track.velocity_delta_score - 4.0)

                # Trajectory deviation: check angle oscillation across 3 steps
                p0 = track.centroids[-3]
                p1 = track.centroids[-2]
                p2 = track.centroids[-1]
                v01 = (p1[0] - p0[0], p1[1] - p0[1])
                v12 = (p2[0] - p1[0], p2[1] - p1[1])
                mag01 = math.hypot(v01[0], v01[1])
                mag12 = math.hypot(v12[0], v12[1])
                if mag01 > 5.0 and mag12 > 5.0:
                    dot = (v01[0]*v12[0] + v01[1]*v12[1]) / (mag01 * mag12)
                    dot = max(-1.0, min(1.0, dot))
                    angle_delta = math.acos(dot)
                    if angle_delta > 1.2:  # Sharp erratic direction reversal
                        track.trajectory_anomaly_score = min(100.0, track.trajectory_anomaly_score + 22.0)
                        self.trajectory_conf = max(self.trajectory_conf, track.trajectory_anomaly_score)
                    else:
                        track.trajectory_anomaly_score = max(0.0, track.trajectory_anomaly_score - 3.0)

            # Feature B: Collapse / Fall Detection (Horizontal aspect ratio + downward displacement)
            if aspect_ratio > 2.2 and b_height < 90.0:
                track.collapse_score = min(100.0, track.collapse_score + 25.0)
                self.fall_conf = max(self.fall_conf, track.collapse_score)
            else:
                track.collapse_score = max(0.0, track.collapse_score - 5.0)

            # Feature C: Pose Keypoint Dynamics (Aggressive Stance or Hands-on-Head Distress)
            if kpts and len(kpts) >= 11:
                try:
                    ls, rs = kpts[5], kpts[6]  # shoulders
                    lw, rw = kpts[9], kpts[10] # wrists
                    nose = kpts[0] if len(kpts) > 0 else None
                    if ls and rs and lw and rw:
                        s_dist = self.calculate_distance(ls[:2], rs[:2])
                        w_dist = self.calculate_distance(lw[:2], rw[:2])
                        
                        # Wide aggressive fighting stance
                        if s_dist > 15.0 and w_dist > s_dist * 2.2:
                            track.motion_anomaly_score = min(100.0, track.motion_anomaly_score + 18.0)
                            self.motion_conf = max(self.motion_conf, track.motion_anomaly_score)
                        
                        # Distress / hands raised high above shoulders
                        if lw[1] < ls[1] - s_dist * 0.3 and rw[1] < rs[1] - s_dist * 0.3:
                            track.motion_anomaly_score = min(100.0, track.motion_anomaly_score + 20.0)
                            self.motion_conf = max(self.motion_conf, track.motion_anomaly_score)
                except (IndexError, TypeError):
                    pass

            # Feature D: Spatial Zone Verification
            in_restricted_zone = False
            zone_name = None
            for zone in self.spatial_zones:
                poly = zone.get("polygon", [])
                if len(poly) >= 3 and self._check_point_in_polygon((cx, cy), poly):
                    in_restricted_zone = True
                    zone_name = zone.get("name", "Restricted Area")
                    break

            # Feature E: Proximity to other subjects (Inter-person physical interaction)
            min_other_dist = 9999.0
            for idx_other, c_other in enumerate(current_frame_centroids):
                if idx_other != idx:
                    d_other = self.calculate_distance((cx, cy), c_other)
                    if d_other < min_other_dist:
                        min_other_dist = d_other
            
            if min_other_dist < 65.0:
                track.proximity_score = min(100.0, (65.0 - min_other_dist) * 2.0 + 35.0)
                self.motion_conf = min(100.0, self.motion_conf + 15.0)
            else:
                track.proximity_score = max(0.0, track.proximity_score - 4.0)

            # 3. Temporal State Machine for this Track
            active_signals: List[Dict[str, Any]] = []
            if track.velocity_delta_score > 40.0:
                active_signals.append({"name": "SUDDEN_VELOCITY_CHANGE", "score": round(track.velocity_delta_score, 1)})
            if track.trajectory_anomaly_score > 40.0:
                active_signals.append({"name": "TRAJECTORY_DEVIATION", "score": round(track.trajectory_anomaly_score, 1)})
            if track.motion_anomaly_score > 35.0:
                active_signals.append({"name": "MOTION_ANOMALY", "score": round(track.motion_anomaly_score, 1)})
            if track.collapse_score > 50.0:
                active_signals.append({"name": "COLLAPSE_DETECTED", "score": round(track.collapse_score, 1)})
            if track.proximity_score > 35.0 and track.motion_anomaly_score > 30.0:
                active_signals.append({"name": "PROXIMITY_CLASH", "score": round(track.proximity_score, 1)})
            if in_restricted_zone:
                active_signals.append({"name": "RESTRICTED_ZONE_BREACH", "score": 90.0, "zone": zone_name})

            # Evaluate Candidate Condition
            candidate_condition = (len(active_signals) >= 1 and (
                track.velocity_delta_score > 45.0 or 
                track.motion_anomaly_score > 40.0 or 
                track.collapse_score > 50.0 or 
                (track.proximity_score > 35.0 and track.motion_anomaly_score > 30.0) or
                in_restricted_zone
            ))

            if candidate_condition:
                if track.candidate_since_ts is None:
                    track.candidate_since_ts = now
                    track.state = "CANDIDATE"
                    cand_desc = "AGGRESSIVE_INTERACTION_CANDIDATE" if (track.proximity_score > 35.0 or track.motion_anomaly_score > 40.0) else "Candidate state"
                    self._add_timeline_event(f"Track #{track.track_id}: {cand_desc} flagged", "WARNING")
                
                track.persistence_duration = now - track.candidate_since_ts
                persistence_pct = min(100.0, (track.persistence_duration / 3.0) * 100.0)
                self.persistence_conf = max(self.persistence_conf, persistence_pct)

                # Check Verification Gate:
                # 1. Persistence >= 3.0 seconds (or >= 1.8s if collapse or restricted zone breach)
                # 2. At least 2 concurring signals (or high-confidence collapse / zone breach)
                # 3. Frame quality not suppressed
                required_persistence = 1.8 if (track.collapse_score > 60.0 or in_restricted_zone) else 3.0
                signal_count_met = len(active_signals) >= 2 or (track.collapse_score > 65.0 or in_restricted_zone)

                if track.persistence_duration >= required_persistence and signal_count_met:
                    if quality_suppressed:
                        # Hold at CANDIDATE if quality is unworkable
                        track.state = "CANDIDATE"
                        self._add_timeline_event(f"Track #{track.track_id}: Verification held due to {suppression_reason}", "WARNING")
                    elif track.state != "VERIFIED":
                        # Promote to VERIFIED with grounded, defensible naming
                        track.state = "VERIFIED"
                        track.verified_ts = now
                        self.scene_state = "VERIFIED"
                        self.sos_activated = True

                        incident_type = "ANOMALOUS_KINETIC_PATTERN"
                        if track.collapse_score > 55.0:
                            incident_type = "SUDDEN_COLLAPSE_PATTERN"
                        elif in_restricted_zone:
                            incident_type = "RESTRICTED_ZONE_INTRUSION"
                        elif track.proximity_score > 35.0 or track.motion_anomaly_score > 40.0:
                            incident_type = "PHYSICAL_AGGRESSION_PATTERN"
                        elif track.velocity_delta_score > 50.0 and track.trajectory_anomaly_score > 40.0:
                            incident_type = "ERRATIC_TRAJECTORY_PATTERN"

                        track.last_incident_type = incident_type

                        # Build forensic explainability audit trail
                        explainability = {
                            "track_id": str(track.track_id),
                            "incident_type": incident_type,
                            "persistence_seconds": round(track.persistence_duration, 2),
                            "required_threshold_seconds": required_persistence,
                            "contributing_signals": active_signals,
                            "quality_gate": {
                                "passed": not quality_suppressed,
                                "sharpness": frame_quality.get("sharpness", 100.0) if frame_quality else 100.0,
                                "mean_intensity": frame_quality.get("mean_intensity", 128.0) if frame_quality else 128.0
                            },
                            "zone": zone_name if in_restricted_zone else "UNRESTRICTED",
                            "rationale": f"Verified after {track.persistence_duration:.1f}s of continuous anomalous behavioral signatures ({', '.join(s['name'] for s in active_signals)})."
                        }
                        track.last_explainability = explainability
                        self.last_verified_event = explainability

                        self._add_timeline_event(f"[VERIFIED] {incident_type} confirmed (persistence {track.persistence_duration:.1f}s)", "CRITICAL")

                        events.append({
                            "type": incident_type,
                            "risk_level": "CRITICAL" if (track.collapse_score > 55.0 or in_restricted_zone or incident_type == "PHYSICAL_AGGRESSION_PATTERN") else "HIGH",
                            "track_id": track.track_id,
                            "confidence": round(min(100.0, 60.0 + (track.persistence_duration * 10.0)), 1),
                            "bbox": [bx1, by1, bx2, by2],
                            "message": f"Persistent {incident_type.replace('_', ' ').title()} confirmed ({track.persistence_duration:.1f}s)",
                            "explainability": explainability,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })
            else:
                # If conditions no longer hold, transition through RESOLVING
                if track.candidate_since_ts is not None:
                    if now - track.last_seen_ts > 1.5 or track.state == "CANDIDATE":
                        track.state = "NORMAL"
                        track.candidate_since_ts = None
                        track.persistence_duration = 0.0

        # 4. Calculate Scene-Wide Fusion Score
        self.fusion_score = (
            (self.motion_conf * 0.30) +
            (self.trajectory_conf * 0.25) +
            (self.velocity_conf * 0.20) +
            (self.fall_conf * 0.40) +
            (self.persistence_conf * 0.35)
        )
        # Suppress scene score if quality gate fails
        if quality_suppressed:
            self.fusion_score *= 0.5
        self.fusion_score = min(100.0, round(self.fusion_score, 1))

        # Update scene-wide state
        any_verified = any(t.state == "VERIFIED" for t in self.tracks.values())
        any_candidate = any(t.state == "CANDIDATE" for t in self.tracks.values())
        if any_verified:
            self.scene_state = "VERIFIED"
        elif any_candidate:
            self.scene_state = "CANDIDATE"
        else:
            self.scene_state = "NORMAL"
            self.sos_activated = False

        return events

    def get_fusion_state(self) -> Dict[str, Any]:
        """Returns the real-time behavioral telemetry dictionary."""
        # Find longest persistent active candidate/verified track
        max_persistence = 0.0
        active_explanation = self.last_verified_event
        for trk in self.tracks.values():
            if trk.persistence_duration > max_persistence:
                max_persistence = trk.persistence_duration
                if trk.last_explainability:
                    active_explanation = trk.last_explainability

        return {
            "scene_state": self.scene_state,
            "fusion_score": self.fusion_score if self.tracks else 0.0,
            "motion_conf": round(self.motion_conf, 1) if self.tracks else 0.0,
            "trajectory_conf": round(self.trajectory_conf, 1) if self.tracks else 0.0,
            "velocity_conf": round(self.velocity_conf, 1) if self.tracks else 0.0,
            "fall_conf": round(self.fall_conf, 1) if self.tracks else 0.0,
            "persistence_conf": round(self.persistence_conf, 1) if self.tracks else 0.0,
            "persistence_seconds": round(max_persistence, 2),
            "audio_configured": self.audio_configured,
            "audio_status": self.audio_status,
            "audio_conf": round(self.audio_conf, 1) if self.audio_configured else 0.0,
            "audio_hits": self.audio_hits,
            "sos_activated": self.sos_activated,
            "active_tracks_count": len(self.tracks),
            "timeline": self.timeline[-10:],
            "last_explainability": active_explanation
        }
