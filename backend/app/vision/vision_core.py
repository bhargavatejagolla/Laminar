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
# COCO class IDs for tracking (Road, Transit & Pedestrian)
TRACKING_CLASSES = {
    0: "person",
    1: "bicycle",
    2: "car", 
    3: "motorcycle", 
    5: "bus", 
    6: "train",
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


def _box_iou(b1: List[float], b2: List[float]) -> float:
    xa, ya = max(b1[0], b2[0]), max(b1[1], b2[1])
    xb, yb = min(b1[2], b2[2]), min(b1[3], b2[3])
    inter = max(0.0, xb - xa) * max(0.0, yb - ya)
    a1 = max(1.0, (b1[2] - b1[0]) * (b1[3] - b1[1]))
    a2 = max(1.0, (b2[2] - b2[0]) * (b2[3] - b2[1]))
    return inter / (a1 + a2 - inter)


class VehicleTracker:
    """
    High-continuity IoU + centroid multi-object tracker.
    Assigns persistent IDs to vehicles/transit units across frames and computes smooth velocity.
    """
    def __init__(self, max_lost: int = 45, max_dist: float = 140.0, calibration=None):
        self.next_id = 1
        self.tracks: Dict[int, Dict] = {}  # id -> {cx, cy, bbox, last_seen, frames_lost, speed_px_s, speed_kmh, class_name, trajectory, stopped_frames}
        self.max_lost = max_lost
        self.max_dist = max_dist
        self.calibration = calibration

    def update(self, detections: List[Dict], dt: float = 0.05) -> List[Dict]:
        """
        Match detections to existing tracks using IoU first, then centroid distance.
        Returns augmented detections with persistent track_id + smoothed velocity.
        """
        dt = max(0.02, float(dt))
        used_track_ids = set()
        unmatched_dets = []
        result = []

        # Pass 1: Match by strong spatial overlap (IoU >= 0.25)
        for det in detections:
            bbox = det["bbox"]
            best_id = None
            best_iou = 0.25

            for tid, track in self.tracks.items():
                if tid in used_track_ids:
                    continue
                # Same class family check
                if track.get("class_name") != det["class_name"] and (track.get("class_name") == "person" or det["class_name"] == "person"):
                    continue
                iou = _box_iou(bbox, track.get("bbox", [0, 0, 0, 0]))
                if iou > best_iou:
                    best_iou = iou
                    best_id = tid

            if best_id is not None:
                used_track_ids.add(best_id)
                self._augment_and_save(best_id, det, dt, result)
            else:
                unmatched_dets.append(det)

        # Pass 2: Match remaining by centroid distance
        for det in unmatched_dets:
            cx, cy = det["cx"], det["cy"]
            best_id, best_dist = None, self.max_dist

            for tid, track in self.tracks.items():
                if tid in used_track_ids:
                    continue
                if track.get("class_name") != det["class_name"] and (track.get("class_name") == "person" or det["class_name"] == "person"):
                    continue

                dist = np.sqrt((cx - track["cx"])**2 + (cy - track["cy"])**2)
                if dist < best_dist:
                    best_dist = dist
                    best_id = tid

            if best_id is not None:
                used_track_ids.add(best_id)
                self._augment_and_save(best_id, det, dt, result)
            else:
                # New track initialization
                new_id = self.next_id
                self.next_id += 1
                self.tracks[new_id] = {
                    "cx": cx, "cy": cy, "bbox": det["bbox"], "frames_lost": 0,
                    "speed_px_s": 0.0, "speed_kmh": 0.0, "class_name": det["class_name"],
                    "last_seen": time.time(),
                    "trajectory": [(cx, cy, time.time())],
                    "stopped_frames": 0,
                    "vx": 0.0, "vy": 0.0
                }
                used_track_ids.add(new_id)
                det["track_id"] = new_id
                det["id"] = new_id
                det["speed_px_s"] = 0.0
                det["speed_kmh"] = 0.0
                det["trajectory"] = [(cx, cy, time.time())]
                det["wait_time_s"] = 0.0
                det["vx"] = 0.0
                det["vy"] = 0.0
                result.append(det)

        # Age lost tracks
        for tid in list(self.tracks.keys()):
            if tid not in used_track_ids:
                self.tracks[tid]["frames_lost"] += 1
                if self.tracks[tid]["frames_lost"] > self.max_lost:
                    del self.tracks[tid]

        return result

    def _augment_and_save(self, tid: int, det: Dict, dt: float, result: List[Dict]):
        old = self.tracks[tid]
        cx, cy = det["cx"], det["cy"]
        dist = np.sqrt((cx - old["cx"])**2 + (cy - old["cy"])**2)
        raw_speed = float(dist / dt)
        vx = float((cx - old["cx"]) / dt)
        vy = float((cy - old["cy"]) / dt)

        # Smoothed velocity
        speed_px_s = float(round(0.70 * old.get("speed_px_s", raw_speed) + 0.30 * raw_speed, 1))

        # Calibrated real-world speed
        speed_kmh = 0.0
        if self.calibration:
            speed_kmh = self.calibration.calculate_speed_kmh(
                (old["cx"], old["cy"]), (cx, cy), dt
            )
        else:
            # Standard perspective estimation fallback
            speed_kmh = round(min(160.0, speed_px_s * 0.55), 1)

        # Stopped state accumulation
        stopped = old.get("stopped_frames", 0)
        if speed_px_s < 4.0:
            stopped += 1
        else:
            stopped = max(0, stopped - 2)

        traj = old.get("trajectory", [])
        traj.append((cx, cy, time.time()))
        if len(traj) > 30:
            traj.pop(0)

        self.tracks[tid].update({
            "cx": float(cx), "cy": float(cy),
            "bbox": det["bbox"],
            "frames_lost": 0,
            "speed_px_s": speed_px_s,
            "speed_kmh": round(speed_kmh, 1),
            "class_name": det["class_name"],
            "last_seen": time.time(),
            "trajectory": traj,
            "stopped_frames": stopped,
            "vx": vx, "vy": vy
        })

        det["track_id"] = tid
        det["id"] = tid
        det["speed_px_s"] = speed_px_s
        det["speed_kmh"] = round(speed_kmh, 1)
        det["trajectory"] = traj
        det["wait_time_s"] = round(stopped * dt, 1)
        det["stopped_frames"] = stopped
        det["vx"] = vx
        det["vy"] = vy
        result.append(det)


class VisionCore:
    """
    Singleton AI Perception Engine.
    Powered by Ultralytics YOLO11 Nano (SOTA 2025).
    Maintains continuous multi-object trackers per camera.
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
        logger.info(f"VisionCore initialized with YOLO11 ({model_name}), conf={conf}.")

    async def _ensure_model(self):
        if self.model is not None:
            return
        async with self._load_lock:
            if self.model is None:
                import os
                logger.info(f"LAZY LOAD: Initializing VisionCore YOLO11 ({self.model_name})...")
                from ultralytics import YOLO
                loop = asyncio.get_event_loop()
                
                # Check candidate weight paths
                target_weights = self.model_name
                candidates = [
                    target_weights,
                    os.path.join("backend", target_weights),
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), target_weights),
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backend", target_weights),
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "yolo11n.pt"),
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "yolov8n.pt"),
                    "yolov8n.pt"
                ]
                for c in candidates:
                    if os.path.exists(c):
                        target_weights = c
                        break

                self.model = await loop.run_in_executor(None, YOLO, target_weights)
                self.model.to(self.device)
                logger.info(f"LAZY LOAD: VisionCore loaded successfully from {target_weights}.")

    async def process_frame(self, frame: np.ndarray, camera_id: str, dt: Optional[float] = None) -> VisionState:
        """
        Run YOLO11 and Tracking once.
        Returns a VisionState object containing tracked entities.
        If dt is provided (e.g. from recorded video with known fps), it uses that precise delta.
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
                    classes=[0, 1, 2, 3, 5, 6, 7], # person, bicycle, car, motorcycle, bus, train, truck
                    imgsz=640,
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

                    # Genuine transit/vehicle and pedestrian classes
                    if cls_id in TRACKING_CLASSES:
                        candidates.append({
                            "bbox": [float(x1), float(y1), float(x2), float(y2)],
                            "class_name": TRACKING_CLASSES[cls_id],
                            "confidence": float(round(conf, 3)),
                        })

                # Deduplicate overlapping boxes with IoU NMS
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
                    if not any(_cand_iou(cand["bbox"], d["bbox"]) > 0.50 for d in deduped if d["class_name"] == cand["class_name"]):
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

            # Temporal tracking delta
            now = time.time()
            if dt is None:
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
                    "wait_time_s": float(d.get("wait_time_s", 0.0)),
                    "cx": float(round(d["cx"], 1)),
                    "cy": float(round(d["cy"], 1)),
                    "vx": float(d.get("vx", 0.0)),
                    "vy": float(d.get("vy", 0.0)),
                    "stopped_frames": int(d.get("stopped_frames", 0)),
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
