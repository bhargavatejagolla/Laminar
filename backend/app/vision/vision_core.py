"""
LAMINAR - Vision Core 2.0
-------------------------

Central AI Perception Engine.
Handles YOLO detection and object tracking exactly ONCE per frame.
Intelligence modules (Traffic, Parking, Incident) consume the output (VisionState)
without running redundant inferences.
"""

import asyncio
import time
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from pydantic import BaseModel
from app.core.logging import get_logger

logger = get_logger(__name__)

# COCO class IDs for tracking
TRACKING_CLASSES = {
    0: "person",
    2: "car", 
    3: "motorcycle", 
    5: "bus", 
    7: "truck"
}

class VisionState(BaseModel):
    """
    The shared state emitted by Vision Core for a single frame.
    Contains all tracked objects and their temporal data.
    """
    camera_id: str
    timestamp: float
    frame_shape: Tuple[int, int]
    tracks: List[Dict[str, Any]]  # List of objects with id, bbox, speed, class, etc.


class VehicleTracker:
    """
    Lightweight centroid-based multi-object tracker.
    Assigns persistent IDs to vehicles/people across frames and computes speed.
    """
    def __init__(self, max_lost: int = 10, max_dist: float = 80.0):
        self.next_id = 1
        self.tracks: Dict[int, Dict] = {}  # id -> {cx, cy, last_seen, frames_lost, speed_px_s, class_name, trajectory}
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
                
                # Update trajectory history
                traj = old.get("trajectory", [])
                traj.append((cx, cy, time.time()))
                if len(traj) > 30: # Keep last 30 points (~1.5s at 20fps)
                    traj.pop(0)

                self.tracks[best_id].update({
                    "cx": float(cx), "cy": float(cy),
                    "frames_lost": 0,
                    "speed_px_s": round(speed_val, 1),
                    "class_name": det["class_name"],
                    "last_seen": time.time(),
                    "trajectory": traj
                })
                used_track_ids.add(best_id)
                det["track_id"] = best_id
                det["speed_px_s"] = round(speed_val, 1)
                det["trajectory"] = traj
                det["wait_time_s"] = float(round(max(0.0, 30.0 - speed_val * 0.3), 1))
            else:
                # New track
                new_id = self.next_id
                self.next_id += 1
                self.tracks[new_id] = {
                    "cx": cx, "cy": cy, "frames_lost": 0,
                    "speed_px_s": 0.0, "class_name": det["class_name"],
                    "last_seen": time.time(),
                    "trajectory": [(cx, cy, time.time())]
                }
                det["track_id"] = new_id
                det["speed_px_s"] = 0.0
                det["trajectory"] = [(cx, cy, time.time())]
                det["wait_time_s"] = 30.0

            result.append(det)

        # Age lost tracks
        for tid in list(self.tracks.keys()):
            if tid not in used_track_ids:
                self.tracks[tid]["frames_lost"] += 1
                if self.tracks[tid]["frames_lost"] > self.max_lost:
                    del self.tracks[tid]

        return result


class VisionCore:
    """
    Singleton AI Perception Engine.
    Loads YOLO once. Maintains trackers per camera.
    """
    _instance = None
    _load_lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VisionCore, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, model_name: str = "yolo11n.pt", conf: float = 0.25):
        if self._initialized: return
        self.model_name = model_name
        self.conf = conf
        self.device = "cpu"
        self.model = None
        self._trackers: Dict[str, VehicleTracker] = {}
        self._last_frame_time: Dict[str, float] = {}
        self._initialized = True
        logger.info(f"VisionCore initialized (Model {model_name} will load lazily).")

    async def _ensure_model(self):
        if self.model is not None:
            return
        async with self._load_lock:
            if self.model is None:
                logger.info(f"LAZY LOAD: Initializing VisionCore YOLO {self.model_name}...")
                from ultralytics import YOLO
                loop = asyncio.get_event_loop()
                self.model = await loop.run_in_executor(None, YOLO, self.model_name)
                self.model.to(self.device)
                logger.info(f"LAZY LOAD: VisionCore {self.model_name} loaded successfully.")

    async def process_frame(self, frame: np.ndarray, camera_id: str) -> VisionState:
        """
        Run YOLO and Tracking once.
        Returns a VisionState object containing tracked entities.
        """
        await self._ensure_model()
        h, w = frame.shape[:2]

        if frame is None or frame.size == 0:
            return VisionState(camera_id=camera_id, timestamp=time.time(), frame_shape=(h, w), tracks=[])

        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None,
                lambda: self.model.predict(
                    source=frame,
                    conf=self.conf,
                    classes=list(TRACKING_CLASSES.keys()),
                    device=self.device,
                    verbose=False
                )
            )

            result = results[0]
            boxes = result.boxes

            raw_dets = []
            if boxes is not None:
                for box in boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().tolist()
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2
                    raw_dets.append({
                        "cx": float(cx), "cy": float(cy),
                        "bbox": [float(x1), float(y1), float(x2), float(y2)],
                        "class_name": TRACKING_CLASSES.get(cls_id, "unknown"),
                        "confidence": float(round(conf, 3)),
                    })

            # Temporal tracking
            now = time.time()
            dt = now - self._last_frame_time.get(camera_id, now - 0.05)
            self._last_frame_time[camera_id] = now
            
            if camera_id not in self._trackers:
                self._trackers[camera_id] = VehicleTracker()
                
            tracked_dets = self._trackers[camera_id].update(raw_dets, dt)

            # Format final track objects
            tracks = []
            for d in tracked_dets:
                tracks.append({
                    "id": int(d["track_id"]),
                    "class_name": str(d["class_name"]),
                    "confidence": float(d["confidence"]),
                    "bbox": [float(round(v, 1)) for v in d["bbox"]],
                    "speed_px_s": float(d["speed_px_s"]),
                    "wait_time_s": float(d["wait_time_s"]),
                    "cx": float(round(d["cx"], 1)),
                    "cy": float(round(d["cy"], 1)),
                    "trajectory": d.get("trajectory", [])
                })

            return VisionState(
                camera_id=camera_id,
                timestamp=now,
                frame_shape=(h, w),
                tracks=tracks
            )

        except Exception as e:
            logger.error(f"VisionCore inference error: {e}", exc_info=True)
            return VisionState(camera_id=camera_id, timestamp=time.time(), frame_shape=(h, w), tracks=[])

vision_core = VisionCore()
