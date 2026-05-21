import numpy as np
from datetime import datetime
from typing import Optional, Any
from uuid import UUID

from app.services.ai.detection_result import DetectionResult, BoundingBox
from app.core.logging import get_logger

logger = get_logger(__name__)


class YOLODetector:
    """
    Production-grade YOLO detector.

    Features:
    - Auto GPU/CPU detection
    - Safe inference wrapper
    - Structured output
    - Handles empty frames
    - Designed for RTSP + webcam streams
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        confidence_threshold: float = 0.4,
        device: Optional[str] = None,
    ):
        import torch
        from ultralytics import YOLO
        self.confidence_threshold = confidence_threshold

        # Auto device selection
        if device:
            self.device = device
        else:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"

        logger.info(f"Loading YOLO model on device: {self.device}")

        try:
            self.model = YOLO(model_path)
            self.model.to(self.device)
        except Exception as e:
            logger.error("Failed to load YOLO model",
                         extra_fields={"error": str(e)})
            raise

    # ==========================================================
    # Main Detection API
    # ==========================================================

    def detect(self, frame: np.ndarray, camera_id: UUID) -> DetectionResult:
        """
        Run detection on frame.

        Returns structured DetectionResult.
        Never raises exception outward (worker safe).
        """

        if frame is None:
            logger.warning("Received empty frame for detection")
            return self._empty_result(camera_id)

        try:
            results = self.model(
                frame,
                conf=self.confidence_threshold,
                device=self.device,
                verbose=False
            )

            result = results[0]
            detections = []

            if result.boxes is not None:
                for box in result.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    confidence = float(box.conf[0])
                    class_id = int(box.cls[0])
                    class_name = self.model.names[class_id]

                    detections.append(
                        BoundingBox(
                            x1=x1,
                            y1=y1,
                            x2=x2,
                            y2=y2,
                            confidence=confidence,
                            class_id=class_id,
                            class_name=class_name,
                        )
                    )

            return DetectionResult(
                camera_id=camera_id,
                timestamp=datetime.utcnow(),
                frame_width=frame.shape[1],
                frame_height=frame.shape[0],
                detections=detections,
            )

        except Exception as e:
            logger.error(
                "Detection failed",
                extra_fields={"error": str(e)},
                exc_info=True,
            )
            return self._empty_result(camera_id)

    # ==========================================================
    # Helper
    # ==========================================================

    def _empty_result(self, camera_id: UUID) -> DetectionResult:
        return DetectionResult(
            camera_id=camera_id,
            timestamp=datetime.utcnow(),
            frame_width=0,
            frame_height=0,
            detections=[],
        )
