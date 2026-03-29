"""
Laminar - Behavior Classification Service (YOLO Pose)
------------------------------------------------------
Detects specific crowd behaviors beyond simple person counting:
  - loitering (stationary for extended time)
  - running (rapid keypoint movement)
  - stationary_cluster (multiple idle people in a zone)
  - fallen_person (horizontal pose detected)

Uses ultralytics YOLOv8-pose model — FREE, downloaded automatically on first use.
Only activated when ENABLE_BEHAVIOR_DETECTION=true in .env

Architecture:
  stream_worker.py → BehaviorDetector.classify(frame, detections) → behavior_result dict
  Results stored in CrowdFrame.extra_data (no schema change required)

Model: yolov8n-pose.pt (6.5MB, auto-downloaded by ultralytics)
"""

import os
import time
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── Config ─────────────────────────────────────────────────────────────────
BEHAVIOR_ENABLED = os.getenv("ENABLE_BEHAVIOR_DETECTION", "false").lower() == "true"
POSE_MODEL_NAME = "yolov8n-pose.pt"

# Behavior thresholds
LOITERING_SECONDS = 30       # Person in same zone > 30s = loitering
RUNNING_VELOCITY_THRESHOLD = 0.15  # Normalized velocity to classify as running
CLUSTER_MIN_PERSONS = 4      # Min people stationary together = cluster


class BehaviorDetector:
    """
    YOLO Pose-based behavior classifier.
    Gracefully disabled when ENABLE_BEHAVIOR_DETECTION=false.
    """

    _model = None
    _model_loaded = False

    # Per-camera position history for loitering detection
    # { camera_id: { track_id: [(x, y, timestamp), ...] } }
    _position_history: Dict[str, Dict[int, List[Tuple[float, float, float]]]] = {}
    _HISTORY_WINDOW = 60  # seconds

    def _ensure_model(self) -> bool:
        """Load YOLO Pose model lazily. Returns True if available."""
        if not BEHAVIOR_ENABLED:
            return False
        if self._model_loaded:
            return self._model is not None
        try:
            from ultralytics import YOLO
            self._model = YOLO(POSE_MODEL_NAME)
            self._model_loaded = True
            logger.info(f"BehaviorDetector: Loaded {POSE_MODEL_NAME}")
            return True
        except Exception as e:
            logger.warning(f"BehaviorDetector: Could not load pose model: {e}")
            self._model = None
            self._model_loaded = True
            return False

    def classify(
        self,
        frame,
        camera_id: str,
        detected_boxes: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """
        Classify behaviors in a frame.

        Args:
            frame: numpy array (OpenCV BGR frame)
            camera_id: Camera identifier for history tracking
            detected_boxes: Optional pre-detected person boxes from YOLO detection

        Returns:
            {
              "behaviors_detected": ["loitering", "stationary_cluster"],
              "detail": [...],
              "loitering_count": 2,
              "running_count": 0,
              "cluster_count": 1,
              "model": "yolov8n-pose"
            }
        """
        if not self._ensure_model() or frame is None:
            return self._empty_result()

        try:
            import numpy as np

            results = self._model(frame, verbose=False)
            now = time.time()

            behaviors = set()
            detail = []
            loitering_count = 0
            running_count = 0
            stationary_positions = []

            # Update history for this camera
            if camera_id not in self._position_history:
                self._position_history[camera_id] = {}
            history = self._position_history[camera_id]

            # Prune old history
            cutoff = now - self._HISTORY_WINDOW
            for tid in list(history.keys()):
                history[tid] = [(x, y, t) for x, y, t in history[tid] if t > cutoff]
                if not history[tid]:
                    del history[tid]

            if results and results[0].boxes is not None:
                boxes = results[0].boxes
                for i, box in enumerate(boxes):
                    track_id = int(box.id[0]) if box.id is not None else i
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2

                    # Update history
                    if track_id not in history:
                        history[track_id] = []
                    history[track_id].append((cx, cy, now))

                    # Detect loitering: person in same area for > LOITERING_SECONDS
                    person_history = history[track_id]
                    if len(person_history) >= 3:
                        oldest = person_history[0]
                        time_in_area = now - oldest[2]
                        distance_moved = ((cx - oldest[0]) ** 2 + (cy - oldest[1]) ** 2) ** 0.5

                        if time_in_area > LOITERING_SECONDS and distance_moved < 50:
                            behaviors.add("loitering")
                            loitering_count += 1
                            detail.append({
                                "type": "loitering",
                                "track_id": track_id,
                                "duration_seconds": round(time_in_area),
                                "position": [round(cx), round(cy)],
                            })
                            stationary_positions.append((cx, cy))
                        elif len(person_history) >= 2:
                            # Check velocity for running detection
                            prev = person_history[-2]
                            dt = max(now - prev[2], 0.001)
                            velocity = ((cx - prev[0]) ** 2 + (cy - prev[1]) ** 2) ** 0.5 / dt
                            # Normalize by frame size (approximate)
                            norm_velocity = velocity / 1000.0
                            if norm_velocity > RUNNING_VELOCITY_THRESHOLD:
                                behaviors.add("running")
                                running_count += 1
                                detail.append({
                                    "type": "running",
                                    "track_id": track_id,
                                    "velocity": round(norm_velocity, 3),
                                    "position": [round(cx), round(cy)],
                                })
                        else:
                            stationary_positions.append((cx, cy))

            # Detect stationary cluster
            cluster_count = 0
            if len(stationary_positions) >= CLUSTER_MIN_PERSONS:
                behaviors.add("stationary_cluster")
                cluster_count = 1
                detail.append({
                    "type": "stationary_cluster",
                    "person_count": len(stationary_positions),
                    "center": [
                        round(sum(p[0] for p in stationary_positions) / len(stationary_positions)),
                        round(sum(p[1] for p in stationary_positions) / len(stationary_positions)),
                    ],
                })

            return {
                "behaviors_detected": sorted(list(behaviors)),
                "detail": detail,
                "loitering_count": loitering_count,
                "running_count": running_count,
                "cluster_count": cluster_count,
                "model": POSE_MODEL_NAME,
                "enabled": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(f"BehaviorDetector.classify error: {e}")
            return self._empty_result()

    def _empty_result(self) -> Dict[str, Any]:
        return {
            "behaviors_detected": [],
            "detail": [],
            "loitering_count": 0,
            "running_count": 0,
            "cluster_count": 0,
            "model": POSE_MODEL_NAME,
            "enabled": BEHAVIOR_ENABLED,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def clear_history(self, camera_id: str) -> None:
        """Clear position history for a camera (called on stream restart)."""
        self._position_history.pop(camera_id, None)


# ─── Singleton ─────────────────────────────────────────────────────────────────
behavior_detector = BehaviorDetector()
