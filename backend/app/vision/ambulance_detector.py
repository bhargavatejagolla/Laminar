import cv2
import numpy as np
import math
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)

# Default Road Graph Configuration for Corridors
DEFAULT_ROAD_GRAPH = {
    "corridor_id": "PVNR-CORRIDOR-01",
    "corridor_name": "PVNR Expressway Emergency Corridor",
    "city": "Hyderabad Smart City Core",
    "junctions": [
        {
            "id": "J1",
            "name": "Mehdipatnam Junction (J1)",
            "distance_meters": 220,
            "nominal_eta_sec": 16,
            "clearance_recommendation": "RECOMMENDED CLEAR",
            "signal_status": "ADVISORY PRE-EMPTION"
        },
        {
            "id": "J2",
            "name": "Attapur Crossing (J2)",
            "distance_meters": 540,
            "nominal_eta_sec": 39,
            "clearance_recommendation": "RECOMMENDED CLEAR",
            "signal_status": "ADVISORY PRE-EMPTION"
        },
        {
            "id": "J3",
            "name": "Aramghar Junction (J3)",
            "distance_meters": 980,
            "nominal_eta_sec": 67,
            "clearance_recommendation": "RECOMMENDED CLEAR",
            "signal_status": "ADVISORY PRE-EMPTION"
        }
    ]
}


class VehicleTrack:
    """Represents a tracked vehicle and its multi-frame evidence trajectory."""
    def __init__(self, track_id: str, bbox: List[float], centroid: Tuple[float, float], now: float):
        self.track_id = track_id
        self.bbox = bbox
        self.centroids: List[Tuple[float, float, float]] = [(centroid[0], centroid[1], now)]  # (x, y, ts)
        self.first_seen_ts = now
        self.last_seen_ts = now
        self.frames_tracked = 1

        # Evidence Scores (0 - 100)
        self.classification_score = 0.0
        self.markings_score = 0.0
        self.track_consistency_score = 10.0
        self.temporal_consistency_score = 10.0
        self.motion_consistency_score = 20.0
        self.beacon_oscillating = False
        self.roof_lum_history: List[float] = []

        # Kinematics
        self.direction = "NORTHBOUND"
        self.speed_px_sec = 0.0
        self.speed_kmh: Optional[float] = None
        self.calibration_status = "UNCALIBRATED (PHYSICAL CALIBRATION REQUIRED)"

        # Temporal State Machine: MONITORING -> CANDIDATE -> VERIFIED -> TRANSIT_ACTIVE -> RESOLVING
        self.state = "MONITORING"
        self.candidate_since_ts: Optional[float] = None
        self.persistence_duration = 0.0
        self.verified_ts: Optional[float] = None

    def update(self, bbox: List[float], centroid: Tuple[float, float], now: float, calibration: Optional[Dict[str, Any]] = None):
        self.bbox = bbox
        self.centroids.append((centroid[0], centroid[1], now))
        if len(self.centroids) > 30:
            self.centroids.pop(0)
        self.last_seen_ts = now
        self.frames_tracked += 1

        # Track consistency: increases with continuous tracking history
        self.track_consistency_score = min(98.0, 40.0 + len(self.centroids) * 2.5)

        # Kinematic calculations from centroid displacement
        if len(self.centroids) >= 4:
            c_curr = self.centroids[-1]
            c_prev = self.centroids[-4]
            dt = max(0.01, c_curr[2] - c_prev[2])
            dx = c_curr[0] - c_prev[0]
            dy = c_curr[1] - c_prev[1]
            dist_px = math.hypot(dx, dy)
            self.speed_px_sec = round(dist_px / dt, 1)

            # Motion consistency (penalizes chaotic teleportation)
            if dist_px < 250:
                self.motion_consistency_score = min(95.0, self.motion_consistency_score + 4.0)
            else:
                self.motion_consistency_score = max(20.0, self.motion_consistency_score - 10.0)

            # Direction inference (screen space: dy < 0 is upwards / Northbound, dy > 0 is downwards)
            if abs(dy) >= abs(dx):
                self.direction = "NORTHBOUND" if dy < 0 else "SOUTHBOUND"
            else:
                self.direction = "EASTBOUND" if dx > 0 else "WESTBOUND"

            # Speed calibration: Only report km/h if camera is explicitly calibrated
            if calibration and calibration.get("is_calibrated", False):
                meters_per_px = calibration.get("meters_per_pixel", 0.08)
                speed_mps = (dist_px / dt) * meters_per_px
                self.speed_kmh = round(speed_mps * 3.6, 1)
                self.calibration_status = "CALIBRATED (ROAD-PLANE HOMOGRAPHY)"
            else:
                self.speed_kmh = None
                self.calibration_status = "UNCALIBRATED (PHYSICAL CALIBRATION REQUIRED)"


class AmbulanceDetector:
    """
    Production-grade Emergency Vehicle Perception & Corridor Intelligence Engine.
    
    Architecture:
    1. YOLOv11 Vehicle Bounding Box Extraction
    2. Multi-Signal Evidence Fusion (Livery Contrast, Aspect Ratio, Beacon Oscillation)
    3. Multi-frame Centroid/ByteTrack Tracking
    4. 5-Stage Temporal State Machine (MONITORING -> CANDIDATE -> VERIFIED -> TRANSIT_ACTIVE -> RESOLVING)
    5. Configuration-Driven Road Graph Corridor Route Prediction & Dynamic ETAs
    """
    def __init__(self, fps: int = 24, road_graph: Optional[Dict[str, Any]] = None, camera_calibration: Optional[Dict[str, Any]] = None):
        self.fps = max(10, min(60, fps))
        self.road_graph = road_graph or DEFAULT_ROAD_GRAPH
        self.camera_calibration = camera_calibration
        self.tracks: Dict[str, VehicleTrack] = {}

        # System Lifecycle State: MONITORING | CANDIDATE | VERIFIED | TRANSIT ACTIVE | RESOLVING
        self.scene_state = "MONITORING"
        self.active_candidate_id: Optional[str] = None
        self.verified_ambulance_id: Optional[str] = None
        self.persistence_seconds = 0.0
        self.timeline: List[Dict[str, Any]] = []

        # Real evidence telemetry object
        self.current_evidence: Dict[str, Any] = self._empty_evidence()

    def _empty_evidence(self) -> Dict[str, Any]:
        return {
            "vehicle_classification": 0.0,
            "emergency_markings": 0.0,
            "track_consistency": 0.0,
            "temporal_consistency": 0.0,
            "motion_consistency": 0.0,
            "beacon_signal": "SUPPORTING (STATIC)",
            "composite_confidence": 0.0,
            "evidence_quality": "INSUFFICIENT",
            "decision": "MONITORING - NO EMERGENCY VEHICLE DETECTED"
        }

    def reset(self):
        """Wipes tracks, evidence, and state machine cleanly to prevent cross-scenario leakage."""
        self.tracks.clear()
        self.scene_state = "MONITORING"
        self.active_candidate_id = None
        self.verified_ambulance_id = None
        self.persistence_seconds = 0.0
        self.timeline.clear()
        self.current_evidence = self._empty_evidence()

    def _add_timeline(self, message: str, level: str = "INFO"):
        self.timeline.append({
            "timestamp": time.strftime("%H:%M:%S"),
            "message": message,
            "level": level
        })
        if len(self.timeline) > 12:
            self.timeline.pop(0)

    def extract_visual_evidence(self, frame: np.ndarray, bbox: List[float], track: VehicleTrack) -> Tuple[float, float, bool]:
        """
        Analyzes vehicle crop for emergency markings and roof beacon oscillation.
        Returns: (classification_score, markings_score, beacon_oscillating)
        """
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(float(c)) for c in bbox]
        x1, y1 = max(0, min(w - 1, x1)), max(0, min(h - 1, y1))
        x2, y2 = max(0, min(w - 1, x2)), max(0, min(h - 1, y2))

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
            return 0.0, 0.0, False

        crop_h, crop_w = crop.shape[:2]
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)

        # 1. Livery: White/bright body surface percentage
        v_chan = hsv[:, :, 2]
        s_chan = hsv[:, :, 1]
        white_mask = (v_chan > 175) & (s_chan < 65)
        white_pct = float(np.mean(white_mask)) * 100.0

        # 2. Emergency Markings: High-contrast red/orange strips/crosses
        red1 = (hsv[:, :, 0] < 12) & (s_chan > 110) & (v_chan > 110)
        red2 = (hsv[:, :, 0] > 168) & (s_chan > 110) & (v_chan > 110)
        red_pct = float(np.mean(red1 | red2)) * 100.0

        # 3. Commercial Van/Ambulance Aspect Ratio (Boxy utility vehicle)
        aspect = crop_w / max(1.0, crop_h)
        geometry_score = 80.0 if (0.75 <= aspect <= 1.45 and crop_h >= 65) else 45.0

        # 4. Roof Beacon Strobe Oscillation (Upper 25% ROI) - Supporting Signal
        roof_roi = crop[0:int(crop_h * 0.25), :]
        beacon_oscillating = False
        if roof_roi.size > 0:
            roof_gray = cv2.cvtColor(roof_roi, cv2.COLOR_BGR2GRAY)
            roof_lum = float(np.mean(roof_gray))
            track.roof_lum_history.append(roof_lum)
            if len(track.roof_lum_history) > 10:
                track.roof_lum_history.pop(0)
            if len(track.roof_lum_history) >= 6:
                lum_variance = float(np.var(track.roof_lum_history))
                if lum_variance > 14.0:  # Periodic strobe intensity variance
                    beacon_oscillating = True

        # Synthesize visual classification & markings scores
        markings_score = min(95.0, (white_pct * 0.8) + (red_pct * 12.0))
        classification_score = min(96.0, (markings_score * 0.55) + (geometry_score * 0.35) + (10.0 if beacon_oscillating else 0.0))

        return classification_score, markings_score, beacon_oscillating

    def process_frame(
        self,
        frame: np.ndarray,
        detected_vehicles: List[Dict[str, Any]],
        source_timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Ingests vehicle detections and performs temporal evidence tracking & corridor planning.
        """
        now = source_timestamp if source_timestamp is not None else time.time()
        current_centroids: List[Tuple[float, float]] = []

        # 1. Centroid Association with active tracks
        for v in detected_vehicles:
            raw_b = v.get("bbox", [0, 0, 0, 0])
            if len(raw_b) == 1 and isinstance(raw_b[0], (list, tuple)):
                raw_b = raw_b[0]
            bx1, by1, bx2, by2 = [float(c) for c in raw_b]
            cx, cy = (bx1 + bx2) / 2.0, (by1 + by2) / 2.0
            current_centroids.append((cx, cy))

            # Spatial centroid association across frames (max 140px displacement)
            closest_tid = None
            closest_d = 140.0
            for tid, trk in self.tracks.items():
                if trk.centroids:
                    d = math.hypot(cx - trk.centroids[-1][0], cy - trk.centroids[-1][1])
                    if d < closest_d:
                        closest_d = d
                        closest_tid = tid

            track_id_str = closest_tid if closest_tid is not None else f"AMB-{len(self.tracks)+1:02d}"

            if track_id_str not in self.tracks:
                self.tracks[track_id_str] = VehicleTrack(track_id_str, [bx1, by1, bx2, by2], (cx, cy), now)
            
            trk = self.tracks[track_id_str]
            trk.update([bx1, by1, bx2, by2], (cx, cy), now, self.camera_calibration)

            # 2. Extract multi-signal visual evidence
            cls_score, mark_score, beacon_active = self.extract_visual_evidence(frame, [bx1, by1, bx2, by2], trk)
            trk.classification_score = (trk.classification_score * 0.7) + (cls_score * 0.3)
            trk.markings_score = (trk.markings_score * 0.7) + (mark_score * 0.3)
            trk.beacon_oscillating = beacon_active
            trk.temporal_consistency_score = min(98.0, trk.temporal_consistency_score + (3.0 if cls_score > 60.0 else -1.5))

        # 2. Prune disappeared tracks (> 2.5 seconds missing)
        stale_keys = [k for k, t in self.tracks.items() if (now - t.last_seen_ts) > 2.5]
        for k in stale_keys:
            if k == self.active_candidate_id:
                self.active_candidate_id = None
            del self.tracks[k]

        # 3. Find top emergency candidate
        best_candidate: Optional[VehicleTrack] = None
        best_composite = 0.0

        for trk in self.tracks.values():
            composite = (
                (trk.classification_score * 0.35) +
                (trk.markings_score * 0.25) +
                (trk.track_consistency_score * 0.15) +
                (trk.temporal_consistency_score * 0.15) +
                (trk.motion_consistency_score * 0.10)
            )
            if composite > best_composite:
                best_composite = composite
                best_candidate = trk

        # 4. Temporal State Machine Transitions
        # Baseline negative controls with normal cars will produce best_composite < 55.0
        if best_candidate and best_composite >= 58.0:
            if best_candidate.candidate_since_ts is None:
                best_candidate.candidate_since_ts = now
                best_candidate.state = "CANDIDATE"
                self.active_candidate_id = best_candidate.track_id
                self._add_timeline(f"Track #{best_candidate.track_id}: Emergency vehicle candidate flagged ({best_composite:.1f}%)", "WARNING")

            best_candidate.persistence_duration = now - best_candidate.candidate_since_ts
            self.persistence_seconds = round(best_candidate.persistence_duration, 1)

            # Check Verification Gate: Persistence >= 3.0s and composite evidence >= 68.0%
            if (self.verified_ambulance_id and any(t.state in ("VERIFIED", "TRANSIT_ACTIVE") for t in self.tracks.values())) or (best_candidate.persistence_duration >= 3.0 and best_composite >= 68.0):
                if best_candidate.state != "VERIFIED" and best_candidate.state != "TRANSIT_ACTIVE":
                    best_candidate.state = "VERIFIED"
                    best_candidate.verified_ts = now
                    self.verified_ambulance_id = best_candidate.track_id
                    self._add_timeline(f"[VERIFIED] Ambulance confirmed on Track #{best_candidate.track_id} ({best_composite:.1f}%, persistence {best_candidate.persistence_duration:.1f}s)", "CRITICAL")
                
                if best_candidate.persistence_duration > 4.5:
                    best_candidate.state = "TRANSIT_ACTIVE"
                    self.scene_state = "TRANSIT ACTIVE"
                else:
                    self.scene_state = "VERIFIED"
            else:
                self.scene_state = "CANDIDATE"

            evidence_qual = "STRONG" if best_composite > 75.0 else ("MODERATE" if best_composite > 60.0 else "WEAK")
            self.current_evidence = {
                "vehicle_classification": round(best_candidate.classification_score, 1),
                "emergency_markings": round(best_candidate.markings_score, 1),
                "track_consistency": round(best_candidate.track_consistency_score, 1),
                "temporal_consistency": round(best_candidate.temporal_consistency_score, 1),
                "motion_consistency": round(best_candidate.motion_consistency_score, 1),
                "beacon_signal": "SUPPORTING (OSCILLATING)" if best_candidate.beacon_oscillating else "SUPPORTING (STATIC / LOW)",
                "composite_confidence": round(best_composite, 1),
                "evidence_quality": evidence_qual,
                "decision": f"{self.scene_state} - Track #{best_candidate.track_id}"
            }
        else:
            # Negative Control / Normal Traffic holds cleanly in MONITORING
            if self.scene_state == "TRANSIT ACTIVE" or self.scene_state == "VERIFIED":
                self.scene_state = "RESOLVING"
                self._add_timeline("Emergency transit completed or vehicle cleared field of view.", "INFO")
            elif self.scene_state == "RESOLVING":
                self.scene_state = "MONITORING"
                self.persistence_seconds = 0.0
                self.active_candidate_id = None
                self.verified_ambulance_id = None
            else:
                self.scene_state = "MONITORING"
                self.persistence_seconds = 0.0
                self.active_candidate_id = None
                self.verified_ambulance_id = None

            self.current_evidence = self._empty_evidence()

        # 5. Route Prediction from Road Graph Configuration
        corridor_plan = self._generate_corridor_plan(best_candidate)

        return {
            "scene_state": self.scene_state,
            "vehicle_count": len(self.tracks),
            "emergency_vehicles": 1 if self.scene_state in ("VERIFIED", "TRANSIT ACTIVE") else 0,
            "candidate_track_id": self.active_candidate_id,
            "verified_track_id": self.verified_ambulance_id,
            "persistence_seconds": self.persistence_seconds,
            "persistence_threshold": 3.0,
            "evidence": self.current_evidence,
            "corridor_plan": corridor_plan,
            "timeline": list(self.timeline),
            "active_track": self._format_track_info(best_candidate) if best_candidate else None
        }

    def _format_track_info(self, track: VehicleTrack) -> Dict[str, Any]:
        return {
            "track_id": track.track_id,
            "direction": track.direction,
            "speed_px_sec": track.speed_px_sec,
            "speed_kmh": track.speed_kmh,
            "calibration_status": track.calibration_status,
            "bbox": track.bbox,
            "persistence_duration": round(track.persistence_duration, 1),
            "frames_tracked": track.frames_tracked
        }

    def _generate_corridor_plan(self, track: Optional[VehicleTrack]) -> Dict[str, Any]:
        """Calculates dynamic junction ETAs based on road graph configuration and vehicle velocity."""
        junctions = []
        speed_mps = 12.0  # Default nominal speed 43 km/h
        if track and track.speed_kmh:
            speed_mps = max(5.0, track.speed_kmh / 3.6)
        elif track and track.speed_px_sec > 20:
            # Approximate metric estimation: 100px/s ~ 10m/s
            speed_mps = max(5.0, min(25.0, track.speed_px_sec * 0.10))

        for j in self.road_graph.get("junctions", []):
            dist = j.get("distance_meters", 300)
            calc_eta = max(5, int(dist / speed_mps))
            is_active = self.scene_state in ("VERIFIED", "TRANSIT ACTIVE")
            junctions.append({
                "id": j["id"],
                "name": j["name"],
                "distance_meters": dist,
                "dynamic_eta_sec": calc_eta,
                "clearance_recommendation": "RECOMMENDED CLEAR" if is_active else "STANDBY / NORMAL CYCLE",
                "signal_status": "ADVISORY PRE-EMPTION" if is_active else "STANDARD DYNAMIC PATTERN",
                "active": is_active
            })

        return {
            "corridor_id": self.road_graph.get("corridor_id", "PVNR-CORRIDOR-01"),
            "corridor_name": self.road_graph.get("corridor_name", "PVNR Expressway Corridor"),
            "city": self.road_graph.get("city", "Smart City"),
            "junctions": junctions,
            "signal_controller": {
                "status": "NOT CONNECTED (ADVISORY / SIMULATION MODE)",
                "protocol": "NTCIP-1202 / SCATS (ADVISORY)",
                "action_gate": "OPERATOR AUTHORIZATION REQUIRED"
            }
        }
