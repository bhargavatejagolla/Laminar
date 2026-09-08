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
    def __init__(self, max_lost: int = 10, max_dist: float = 120.0, calibration=None):
        self.next_id = 1
        self.tracks: Dict[int, Dict] = {}  # id -> {cx, cy, last_seen, frames_lost, speed_px_s, speed_kmh, class_name, trajectory}
        self.max_lost = max_lost
        self.max_dist = max_dist
        self.calibration = calibration

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
                # Compute speed from displacement with smoothing
                old = self.tracks[best_id]
                raw_speed = float(best_dist / max(dt, 0.05))
                speed_px_s = float(round(0.65 * old.get("speed_px_s", raw_speed) + 0.35 * raw_speed, 1))
                
                speed_kmh = 0.0
                if self.calibration:
                    speed_kmh = self.calibration.calculate_speed_kmh(
                        (old["cx"], old["cy"]), (cx, cy), max(dt, 0.05)
                    )
                
                # Update trajectory history
                traj = old.get("trajectory", [])
                traj.append((cx, cy, time.time()))
                if len(traj) > 30: # Keep last 30 points (~1.5s at 20fps)
                    traj.pop(0)

                self.tracks[best_id].update({
                    "cx": float(cx), "cy": float(cy),
                    "frames_lost": 0,
                    "speed_px_s": speed_px_s,
                    "speed_kmh": round(speed_kmh, 1),
                    "class_name": det["class_name"],
                    "last_seen": time.time(),
                    "trajectory": traj
                })
                used_track_ids.add(best_id)
                det["track_id"] = best_id
                det["speed_px_s"] = speed_px_s
                det["speed_kmh"] = round(speed_kmh, 1)
                det["trajectory"] = traj
                det["wait_time_s"] = float(round(max(0.0, 30.0 - speed_px_s * 0.3), 1))
            else:
                # New track — immediately reserve new_id so subsequent detections in this frame don't collide
                new_id = self.next_id
                self.next_id += 1
                self.tracks[new_id] = {
                    "cx": cx, "cy": cy, "frames_lost": 0,
                    "speed_px_s": 0.0, "speed_kmh": 0.0, "class_name": det["class_name"],
                    "last_seen": time.time(),
                    "trajectory": [(cx, cy, time.time())]
                }
                used_track_ids.add(new_id)
                det["track_id"] = new_id
                det["speed_px_s"] = 0.0
                det["speed_kmh"] = 0.0
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
    Loads YOLOv8 once. Maintains trackers per camera.
    """
    _instance = None
    _load_lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VisionCore, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, model_name: str = "yolov8n.pt", conf: float = 0.15):
        if self._initialized: return
        self.model_name = model_name
        self.conf = conf
        self.device = "cpu"
        self.model = None
        self._trackers: Dict[str, VehicleTracker] = {}
        self._last_frame_time: Dict[str, float] = {}
        self._initialized = True
        logger.info(f"VisionCore initialized with YOLOv8 ({model_name}).")

    async def _ensure_model(self):
        if self.model is not None:
            return
        async with self._load_lock:
            if self.model is None:
                import os
                logger.info(f"LAZY LOAD: Initializing VisionCore YOLOv8 {self.model_name}...")
                from ultralytics import YOLO
                loop = asyncio.get_event_loop()
                
                # Check model location
                target_weights = self.model_name
                if not os.path.exists(target_weights) and os.path.exists(os.path.join("backend", target_weights)):
                    target_weights = os.path.join("backend", target_weights)
                    
                self.model = await loop.run_in_executor(None, YOLO, target_weights)
                self.model.to(self.device)
                logger.info(f"LAZY LOAD: VisionCore YOLOv8 loaded successfully from {target_weights}.")

    async def process_frame(self, frame: np.ndarray, camera_id: str) -> VisionState:
        """
        Run YOLOv8 and Tracking once.
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
                    classes=[0, 2, 3, 5, 7], # Pure COCO vehicle classes (2=car, 3=motorcycle, 5=bus, 7=truck) and 0=person
                    device=self.device,
                    verbose=False
                )
            )

            result = results[0]
            boxes = result.boxes

            raw_dets = []
            if boxes is not None:
                candidates = []
                for box in boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().tolist()

                    # Genuine COCO vehicle classes: car, motorcycle, bus, truck
                    if cls_id in (2, 3, 5, 7):
                        candidates.append({
                            "bbox": [float(x1), float(y1), float(x2), float(y2)],
                            "class_name": TRACKING_CLASSES.get(cls_id, "car"),
                            "confidence": float(round(conf, 3)),
                        })
                    # Person (0) for safety/crosswalk monitoring (strictly separated from vehicle count)
                    elif cls_id == 0 and conf >= 0.25:
                        candidates.append({
                            "bbox": [float(x1), float(y1), float(x2), float(y2)],
                            "class_name": "person",
                            "confidence": float(round(conf, 3)),
                        })

                # Deduplicate overlapping vehicle boxes (IoU NMS)
                def _cand_iou(b1, b2):
                    xa, ya = max(b1[0], b2[0]), max(b1[1], b2[1])
                    xb, yb = min(b1[2], b2[2]), min(b1[3], b2[3])
                    inter = max(0.0, xb - xa) * max(0.0, yb - ya)
                    a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
                    a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
                    return inter / max(1.0, a1 + a2 - inter)

                candidates.sort(key=lambda x: x["confidence"], reverse=True)
                deduped = []
                for cand in candidates:
                    if not any(_cand_iou(cand["bbox"], d["bbox"]) > 0.45 for d in deduped if d["class_name"] != "person"):
                        deduped.append(cand)

                for d in deduped:
                    x1, y1, x2, y2 = d["bbox"]
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2
                    raw_dets.append({
                        "cx": float(cx), "cy": float(cy),
                        "bbox": d["bbox"],
                        "class_name": d["class_name"],
                        "confidence": d["confidence"],
                    })

            # Temporal tracking
            now = time.time()
            dt = now - self._last_frame_time.get(camera_id, now - 0.05)
            self._last_frame_time[camera_id] = now
            
            if camera_id not in self._trackers:
                from app.vision.calibration import CameraCalibration
                self._trackers[camera_id] = VehicleTracker(calibration=CameraCalibration())
                
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
                    "speed_kmh": float(d["speed_kmh"]),
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
