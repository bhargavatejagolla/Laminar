"""
Laminar - Crowd Frame Model
----------------------------

Represents a single processed frame result from a camera.

This model stores AI output — not raw image data.

AI engines (YOLO / Edge models) write into this table.
Analytics engines read from it.
"""

from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy import (
    Integer,
    Float,
    JSON,
    String,
    Boolean,
    ForeignKey,
    Index,
    DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class CrowdFrame(BaseModel):
    """
    Stores detection results for a single frame snapshot.

    Each entry represents processed AI output from a camera.
    """

    __tablename__ = "crowd_frames"

    # ==========================================================
    # Relationship
    # ==========================================================

    camera_id: Mapped[UUID] = mapped_column(
        ForeignKey("cameras.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    camera: Mapped["Camera"] = relationship(
        "Camera",
        back_populates="frames",
        lazy="joined",
    )

    # ==========================================================
    # Frame Metadata
    # ==========================================================

    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),  # ✅ FIXED: Timezone-aware
        nullable=False,
        index=True,
    )

    frame_hash: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    image_reference: Mapped[Optional[str]] = mapped_column(
        String(1000),
        nullable=True,
    )

    # ==========================================================
    # Detection Results
    # ==========================================================

    detected_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
    )

    bounding_boxes: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
    )

    detection_confidence_avg: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    confidence_threshold_met: Mapped[Optional[bool]] = mapped_column(
        Boolean,
        nullable=True,
        index=True,
    )

    region_detections: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
    )

    # ==========================================================
    # Model Info
    # ==========================================================

    model_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    model_version: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )

    processing_time_ms: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    # ==========================================================
    # Validation
    # ==========================================================

    def validate(self) -> list[str]:
        """Validate frame data before save."""
        errors = []

        if self.detected_count < 0:
            errors.append("Detected count cannot be negative.")

        # ✅ FIXED: Use timezone-aware comparison
        if self.captured_at > datetime.now(timezone.utc):
            errors.append("captured_at cannot be in the future.")

        if self.processing_time_ms is not None and self.processing_time_ms < 0:
            errors.append("processing_time_ms cannot be negative.")

        if self.detection_confidence_avg is not None:
            if self.detection_confidence_avg < 0 or self.detection_confidence_avg > 1:
                errors.append(
                    "detection_confidence_avg must be between 0 and 1.")

        return errors

    # ==========================================================
    # Business Logic
    # ==========================================================

    def meets_confidence_threshold(self, threshold: float = 0.5) -> bool:
        """Check if detection meets confidence threshold."""
        if self.detection_confidence_avg is None:
            return False
        return self.detection_confidence_avg >= threshold


# ==========================================================
# Index Optimization
# ==========================================================

Index("ix_frame_camera_time", CrowdFrame.camera_id,
      CrowdFrame.captured_at.desc())
Index("ix_frame_model_version", CrowdFrame.model_name, CrowdFrame.model_version)
Index("ix_frame_confidence", CrowdFrame.confidence_threshold_met)
Index("ix_frame_count", CrowdFrame.detected_count.desc())
