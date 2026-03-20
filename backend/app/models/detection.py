"""
Laminar - Detection Model
--------------------------

Stores AI detection results per frame.

Each record represents one detected object from a camera stream.
Used for analytics, prediction, heatmaps, and alerts.

Relationships:
- Camera: Each detection belongs to one camera
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    DateTime,
    String,
    Float,
    ForeignKey,
    Index,
    CheckConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Detection(BaseModel):
    """
    Detection represents a single object detected in a camera frame.
    
    This is the atomic unit of computer vision in Laminar.
    All analytics, alerts, and predictions are built from these records.
    """

    __tablename__ = "detections"

    # ==========================================================
    # Foreign Keys
    # ==========================================================

    camera_id: Mapped[UUID] = mapped_column(
        ForeignKey("cameras.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ==========================================================
    # Relationships
    # ==========================================================

    camera: Mapped["Camera"] = relationship(
        "Camera",
        back_populates="detections",
        lazy="select",  # Simple, async-safe lazy loading
    )

    # ==========================================================
    # Detection Data
    # ==========================================================

    label: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )

    confidence: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    # Bounding box coordinates (normalized 0-1 for consistency)
    x_min: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    y_min: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    x_max: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    y_max: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    # ==========================================================
    # Metadata
    # ==========================================================

    # Model that generated this detection
    model_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    # Detection timestamp (from camera stream)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    # ==========================================================
    # Indexes for Common Queries
    # ==========================================================

    __table_args__ = (
        # Composite index for camera + time range queries
        Index(
            "ix_detections_camera_detected",
            "camera_id",
            "detected_at",
        ),
        # Index for label-based filtering
        Index(
            "ix_detections_label_time",
            "label",
            "detected_at",
        ),
        # Index for high-confidence detections
        Index(
            "ix_detections_confidence",
            "confidence",
        ),
    )

    # ==========================================================
    # Validation
    # ==========================================================

    def validate(self) -> list[str]:
        """Validate detection data before save."""
        errors = []

        # Confidence must be between 0 and 1
        if self.confidence < 0 or self.confidence > 1:
            errors.append("confidence must be between 0 and 1")

        # Label must be non-empty
        if not self.label or not self.label.strip():
            errors.append("label cannot be empty")

        # Bounding box validation
        if self.x_min >= self.x_max:
            errors.append("x_min must be less than x_max")
        if self.y_min >= self.y_max:
            errors.append("y_min must be less than y_max")

        # Basic bounds check (0-1 range for normalized coordinates)
        for coord, name in [(self.x_min, "x_min"), (self.x_max, "x_max"),
                            (self.y_min, "y_min"), (self.y_max, "y_max")]:
            if coord < 0 or coord > 1:
                errors.append(f"{name} must be between 0 and 1")

        # detected_at cannot be in future (using timezone-aware comparison)
        if self.detected_at > datetime.now(timezone.utc):
            errors.append("detected_at cannot be in the future")

        return errors

    # ==========================================================
    # Business Logic Helpers
    # ==========================================================

    @property
    def width(self) -> float:
        """Calculate bounding box width."""
        return self.x_max - self.x_min

    @property
    def height(self) -> float:
        """Calculate bounding box height."""
        return self.y_max - self.y_min

    @property
    def area(self) -> float:
        """Calculate bounding box area."""
        return self.width * self.height

    @property
    def center_x(self) -> float:
        """Calculate center X coordinate."""
        return (self.x_min + self.x_max) / 2

    @property
    def center_y(self) -> float:
        """Calculate center Y coordinate."""
        return (self.y_min + self.y_max) / 2

    def is_high_confidence(self, threshold: float = 0.7) -> bool:
        """Check if detection confidence is above threshold."""
        return self.confidence >= threshold

    def is_person(self) -> bool:
        """Quick check for person detection."""
        return self.label.lower() in ["person", "people", "human"]
