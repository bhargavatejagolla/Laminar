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


class VehicleTracker:
    """
    Lightweight centroid-based multi-object tracker.
    Assigns persistent IDs to vehicles across frames.
    """
    def __init__(self, max_lost: int = 10, max_dist: float = 80.0):
        self.next_id = 1
        self.tracks: Dict[int, Dict] = {}  # id -> {cx, cy, last_seen, frames_lost, speed_px_s, class_name}
        self.max_lost = max_lost
        self.max_dist = max_dist

    def update(self, detections: List[Dict], dt: float) -> List[Dict]:
        """
        Match detections to existing tracks. Returns augmented detections with track_id + speed.
        detections: list of {cx, cy, bbox, class_name, confidence}
        """
        used_track_ids = set()
        result = []

        for det in detections:
            cx, cy = det["cx"], det["cy"]
            best_id, best_dist = None, self.max_dist

            for tid, track in self.tracks.items():
                if tid in used_track_ids:
                    continue
                dist = np.sqrt((cx - track["cx"])**2 + (cy - track["cy"])**2)
                if dist < best_dist:
                    best_dist = dist
                    best_id = tid

            if best_id is not None:
                # Compute speed from displacement
                old = self.tracks[best_id]
                speed_val = float(best_dist / max(dt, 0.05))
                self.tracks[best_id].update({
                    "cx": float(cx), "cy": float(cy),
                    "frames_lost": 0,
                    "speed_px_s": round(speed_val, 1),
                    "class_name": det["class_name"],
                    "last_seen": time.time()
                })
                used_track_ids.add(best_id)
                det["track_id"] = best_id
                det["speed_px_s"] = round(speed_val, 1)
                det["wait_time_s"] = float(round(max(0.0, 30.0 - speed_val * 0.3), 1))  # heuristic
            else:
                # New track
                new_id = self.next_id
                self.next_id += 1
                self.tracks[new_id] = {
                    "cx": cx, "cy": cy, "frames_lost": 0,
                    "speed_px_s": 0.0, "class_name": det["class_name"],
                    "last_seen": time.time()
                }
                det["track_id"] = new_id
                det["speed_px_s"] = 0.0
                det["wait_time_s"] = 30.0

            result.append(det)

        # Age lost tracks
        for tid in list(self.tracks.keys()):
            if tid not in used_track_ids:
                self.tracks[tid]["frames_lost"] += 1
                if self.tracks[tid]["frames_lost"] > self.max_lost:
                    del self.tracks[tid]

        return result


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


class TrafficDetector:
    """
    Traffic-optimized YOLO detector with per-vehicle tracking and density matrix.
    """
    _model_cache = {}
    _load_lock = asyncio.Lock()

    def __init__(self, model_name: str = "yolo11m.pt", conf: float = 0.25):
        self.model_name = model_name
        self.conf = conf
        self.device = "cpu"
        self.model = None
        self._trackers: Dict[str, VehicleTracker] = {}   # camera_id -> tracker
        self._last_frame_time: Dict[str, float] = {}
        # In-memory last analytics per camera for API queries
        self._last_analytics: Dict[str, Dict] = {}
        logger.info(f"TrafficDetector v2 created. Model {model_name} will load lazily.")

    async def _ensure_model(self):
        if self.model is not None:
            return
        async with TrafficDetector._load_lock:
            if self.model_name not in TrafficDetector._model_cache:
                logger.info(f"LAZY LOAD: Initializing Traffic YOLO {self.model_name}...")
                from ultralytics import YOLO
                loop = asyncio.get_event_loop()
                model = await loop.run_in_executor(None, YOLO, self.model_name)
                TrafficDetector._model_cache[self.model_name] = model
                logger.info(f"LAZY LOAD: {self.model_name} loaded successfully.")
            self.model = TrafficDetector._model_cache[self.model_name]
            self.model.to(self.device)

    async def detect_traffic(self, frame: np.ndarray,
                              camera_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Detect vehicles with bounding boxes, per-vehicle speed, wait time.
        Returns density matrix and congestion risk score.
        """
        await self._ensure_model()
        if frame is None or frame.size == 0:
            return self._empty_result()

        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None,
                lambda: self.model.predict(
                    source=frame,
                    conf=self.conf,
                    classes=list(VEHICLE_CLASSES.keys()),
                    device=self.device,
                    verbose=False
                )
            )

            result = results[0]
            boxes = result.boxes

            # Build raw detection list
            raw_dets = []
            h, w = frame.shape[:2]
            if boxes is not None:
                for box in boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    xyxy = box.xyxy[0].cpu().numpy().tolist()
                    x1, y1, x2, y2 = xyxy
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2
                    raw_dets.append({
                        "cx": float(cx), "cy": float(cy),
                        "bbox": [float(x1), float(y1), float(x2), float(y2)],
                        "class_name": VEHICLE_CLASSES.get(cls_id, "vehicle"),
                        "confidence": float(round(conf, 3)),
                    })

            # Per-vehicle tracking
            dt = 0.5
            if camera_id:
                now = time.time()
                dt = now - self._last_frame_time.get(camera_id, now - 0.5)
                self._last_frame_time[camera_id] = now
                if camera_id not in self._trackers:
                    self._trackers[camera_id] = VehicleTracker()
                raw_dets = self._trackers[camera_id].update(raw_dets, dt)

            count = len(raw_dets)

            # Density / congestion logic
            density, signal, congestion_level = "Low", "Green", 0.15
            if count > 25:
                density, signal, congestion_level = "Critical", "Red", 0.95
            elif count > 15:
                density, signal, congestion_level = "High", "Yellow", 0.75
            elif count > 5:
                density, signal, congestion_level = "Medium", "Green", 0.40

            # Average speed
            speeds = [d.get("speed_px_s", 0) for d in raw_dets]
            avg_velocity = round(sum(speeds) / max(1, len(speeds)), 2)

            # Wait time estimate
            velocity_factor = max(0.1, avg_velocity / 100.0)
            wait_time = round(min((count / 5.0) * (1.0 / velocity_factor), 25.0), 1) if count > 0 else 0.0

            # Congestion risk score (0–100)
            risk_score = round(congestion_level * 100 + max(0, wait_time - 5) * 0.5)
            risk_score = min(risk_score, 100)

            # Density matrix
            density_matrix = build_density_matrix(raw_dets, frame.shape)

            # Per-vehicle serializable list
            vehicles = []
            for d in raw_dets:
                vehicles.append({
                    "id": int(d.get("id") or d.get("track_id", 0)),
                    "class_name": str(d.get("class_name", "vehicle")),
                    "confidence": float(d.get("confidence", 0.0)),
                    "bbox": [float(round(v, 1)) for v in d["bbox"]],
                    "speed_px_s": float(d.get("speed_px_s", 0.0)),
                    "wait_time_s": float(d.get("wait_time_s", 0.0)),
                    "cx": float(round(d["cx"], 1)),
                    "cy": float(round(d["cy"], 1)),
                })

            analytics = {
                "count": int(count),
                "density": str(density),
                "congestion_level": float(congestion_level),
                "risk_score": int(risk_score),
                "signal_suggestion": str(signal),
                "avg_velocity": float(avg_velocity),
                "wait_time_estimate": float(wait_time),
                "vehicles": vehicles,
                "density_matrix": density_matrix,
                "frame_shape": [int(h), int(w)],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            if camera_id:
                self._last_analytics[camera_id] = analytics

            return analytics

        except Exception as e:
            logger.error(f"Traffic detection error: {e}", exc_info=True)
            return self._empty_result()

    def _empty_result(self) -> Dict[str, Any]:
        return {
            "count": 0, "density": "Low", "congestion_level": 0.0, "risk_score": 0,
            "signal_suggestion": "Green", "avg_velocity": 0.0, "wait_time_estimate": 0.0,
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
        avg_risk = 0
        if status:
            avg_risk = round(sum(v.get("risk_score", 0) for v in status.values()) / len(status))

        if congested_zones > 0:
            suggestion = f"High congestion in {congested_zones} zones. Consider adding +15s to critical green phases."
        elif avg_risk > 50:
            suggestion = "Elevated corridor risk. Monitor traffic flow closely."
        elif total_vehicles > 0:
            suggestion = f"Traffic flowing steadily. Total of {total_vehicles} vehicles currently tracked."
        else:
            suggestion = "No vehicles currently detected. Maintain standard dynamic pattern."

        return {
            "overall": {
                "total_vehicles": int(total_vehicles),
                "congested_zones": int(congested_zones),
                "status": str("HEAVY" if congested_zones > 0 else "FLUID"),
                "risk_score": int(avg_risk),
            },
            "signals": status,
            "suggestion": str(suggestion)
        }


_traffic_detector = None
def get_traffic_detector():
    global _traffic_detector
    if _traffic_detector is None:
        _traffic_detector = TrafficDetector()
    return _traffic_detector

class LazyTrafficDetector:
    def __getattr__(self, name):
        return getattr(get_traffic_detector(), name)

traffic_detector = LazyTrafficDetector()
