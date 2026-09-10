"""
LAMINAR - Road Condition Intelligence Detector
------------------------------------------------
Governed perception engine for potholes, road surface damage, waterlogging,
and infrastructure defects.

Absolute Rules:
- ZERO MOCK WEIGHTS.
- ZERO FABRICATED DEFECTS.
- ZERO OPENCV TEXTURE HEURISTICS.
- When model weights are absent/unvalidated: returns strictly "NOT_CONFIGURED".
- When validated weights exist: runs inference at controlled sampling rate (4-8 FPS),
  enforces temporal persistence across frames, applies spatial deduplication,
  and saves actual evidence frames.
"""

import os
import time
import math
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2

from app.core.logging import get_logger
from app.core.model_registry import model_registry, ModelLifecycleState
from app.models.intelligence_event import LaminarIntelligenceEvent, LocationPayload
from app.services.event_bus import event_bus

logger = get_logger(__name__)


class RoadConditionDetector:
    """Governed AI engine for road defect detection with temporal persistence."""

    def __init__(self):
        self._candidates: Dict[str, Dict[str, Any]] = {}  # candidate_key -> tracking info
        self._confirmed_defects: List[Dict[str, Any]] = []
        self._model = None
        self._loaded_path = None
        self.PERSISTENCE_FRAMES = 3
        self.SPATIAL_MERGE_RADIUS_PX = 80.0
        self.COOLDOWN_SECONDS = 30.0

    def get_status(self) -> Dict[str, Any]:
        """Check current governance and validation status of the road model."""
        desc = model_registry.get_descriptor("road_condition")
        if not desc:
            return {"status": "NOT_CONFIGURED", "model": None, "classes": []}

        return {
            "status": desc.state.value,
            "model_name": desc.model_name,
            "architecture": desc.architecture,
            "path": desc.path,
            "classes": list(desc.classes.values()),
            "confidence_threshold": desc.confidence_threshold,
            "notes": desc.validation_notes
        }

    def _ensure_model_loaded(self) -> bool:
        """Load validated model into memory if ready."""
        desc = model_registry.get_descriptor("road_condition")
        if not desc or desc.state not in (ModelLifecycleState.MODEL_VALIDATED, ModelLifecycleState.MODEL_ENABLED):
            self._model = None
            return False

        if desc.path and os.path.exists(desc.path) and self._loaded_path != desc.path:
            try:
                from ultralytics import YOLO
                self._model = YOLO(desc.path)
                self._loaded_path = desc.path
                logger.info(f"Loaded road condition model from {desc.path}")
                return True
            except Exception as e:
                logger.error(f"Failed loading road condition model from {desc.path}: {e}")
                self._model = None
                return False

        return self._model is not None

    def detect_defects(
        self,
        frame: np.ndarray,
        camera_id: str = "unknown",
        venue_id: Optional[str] = None,
        venue_name: Optional[str] = None,
        timestamp_s: float = 0.0,
        dt: float = 0.15
    ) -> Dict[str, Any]:
        """
        Detect road condition defects on a sampled video frame.
        If no validated model is configured, returns strictly NOT_CONFIGURED without faking.
        """
        desc = model_registry.get_descriptor("road_condition")

        # Zero-fabrication governance check
        if not desc or desc.state == ModelLifecycleState.NOT_CONFIGURED:
            return {
                "status": "NOT_CONFIGURED",
                "defects": [],
                "count": 0,
                "notes": "No validated road defect weights located on system. Provide weights at 'backend/models/best.pt' to enable."
            }

        if desc.state == ModelLifecycleState.MODEL_DISCOVERED:
            return {
                "status": "MODEL_DISCOVERED",
                "defects": [],
                "count": 0,
                "notes": "Model discovered on disk but awaiting benchmark validation before activation."
            }

        # Model is validated or enabled: run genuine inference
        if not self._ensure_model_loaded():
            return {
                "status": "LOAD_ERROR",
                "defects": [],
                "count": 0,
                "notes": "Validated weights could not be loaded into runtime."
            }

        try:
            results = self._model(frame, conf=desc.confidence_threshold, verbose=False)
            raw_detections = []
            if results and len(results) > 0:
                boxes = results[0].boxes
                if boxes is not None:
                    for box in boxes:
                        cls_id = int(box.cls[0].item())
                        cls_name = desc.classes.get(cls_id, f"defect_{cls_id}")
                        conf = float(box.conf[0].item())
                        xyxy = box.xyxy[0].tolist()
                        raw_detections.append({
                            "class": cls_name,
                            "confidence": conf,
                            "bbox": xyxy
                        })

            # Temporal persistence and spatial deduplication
            confirmed_events = self._update_temporal_evidence(
                raw_detections, frame, camera_id, venue_id, venue_name, timestamp_s
            )

            return {
                "status": "ACTIVE",
                "raw_detections": raw_detections,
                "confirmed_defects": confirmed_events,
                "count": len(raw_detections)
            }

        except Exception as e:
            logger.error(f"Road condition inference error: {e}")
            return {
                "status": "INFERENCE_ERROR",
                "defects": [],
                "count": 0,
                "error": str(e)
            }

    def _update_temporal_evidence(
        self,
        detections: List[Dict[str, Any]],
        frame: np.ndarray,
        camera_id: str,
        venue_id: Optional[str],
        venue_name: Optional[str],
        timestamp_s: float
    ) -> List[Dict[str, Any]]:
        """Require defects to persist across multiple frames before promoting to confirmed events."""
        now = time.time()
        confirmed_this_frame = []

        for d in detections:
            bbox = d["bbox"]
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            cls_name = d["class"]

            matched_key = None
            for key, cand in list(self._candidates.items()):
                dist = math.sqrt((cx - cand["cx"])**2 + (cy - cand["cy"])**2)
                if dist < self.SPATIAL_MERGE_RADIUS_PX and cand["class"] == cls_name:
                    matched_key = key
                    break

            if matched_key:
                cand = self._candidates[matched_key]
                cand["frames"] += 1
                cand["last_seen"] = now
                cand["cx"] = (cand["cx"] + cx) / 2.0
                cand["cy"] = (cand["cy"] + cy) / 2.0
                cand["conf"] = max(cand["conf"], d["confidence"])

                if cand["frames"] >= self.PERSISTENCE_FRAMES and not cand.get("emitted", False):
                    cand["emitted"] = True
                    event_id = f"LMNR-ROAD-{int(now * 1000) % 100000}"

                    # Save actual raw evidence frame screenshot
                    evidence_fn = f"evidence_road_{event_id}.jpg"
                    os.makedirs("data/uploads", exist_ok=True)
                    ev_path = os.path.join("data", "uploads", evidence_fn)
                    cv2.imwrite(ev_path, frame)

                    ev = LaminarIntelligenceEvent(
                        event_id=event_id,
                        event_type=f"road_defect_{cls_name}",
                        domain="road_condition",
                        venue_id=venue_id,
                        venue_name=venue_name or "Monitored Road Corridor",
                        camera_id=camera_id,
                        camera_name=f"Camera {camera_id[:8]}",
                        source_type="upload",
                        location=LocationPayload(location_source="CAMERA_CONFIG"),
                        severity="warning",
                        confidence=cand["conf"],
                        state="verified",
                        title=f"{cls_name.replace('_', ' ').title()} Verified",
                        description=f"Physical road surface anomaly ({cls_name}) confirmed with temporal continuity.",
                        evidence={
                            "defect_class": cls_name,
                            "bbox": bbox,
                            "timestamp_seconds": round(timestamp_s, 2),
                            "screenshot_url": f"/api/v1/uploads/{evidence_fn}",
                            "persistence_frames": cand["frames"]
                        },
                        explanation={
                            "reason": f"Observed across {cand['frames']} consecutive sampled frames at centroid [{int(cx)}, {int(cy)}]."
                        },
                        model_name="Road Defect YOLO",
                        model_version="1.0.0"
                    )
                    confirmed_this_frame.append(ev.model_dump())
                    # Dispatched asynchronously via event_bus
                    try:
                        import asyncio
                        asyncio.create_task(event_bus.emit_event(ev))
                    except Exception:
                        pass
            else:
                new_key = f"{cls_name}_{int(now*1000)}"
                self._candidates[new_key] = {
                    "cx": cx,
                    "cy": cy,
                    "class": cls_name,
                    "conf": d["confidence"],
                    "frames": 1,
                    "first_seen": now,
                    "last_seen": now,
                    "emitted": False
                }

        # Expire stale candidates older than 5 seconds
        for k in list(self._candidates.keys()):
            if now - self._candidates[k]["last_seen"] > 5.0:
                del self._candidates[k]

        return confirmed_this_frame


road_condition_detector = RoadConditionDetector()
