from dataclasses import dataclass
from typing import List
from datetime import datetime
from uuid import UUID


@dataclass
class BoundingBox:
    """
    Represents a detected bounding box.
    Coordinates are in pixel space.
    """
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float
    class_id: int
    class_name: str


@dataclass
class DetectionResult:
    """
    Structured result returned by detector.
    """
    camera_id: UUID
    timestamp: datetime
    frame_width: int
    frame_height: int
    detections: List[BoundingBox]

    @property
    def object_count(self) -> int:
        return len(self.detections)

    def has_detections(self) -> bool:
        return self.object_count > 0
