"""
Laminar - Crowd Metric Model
-----------------------------

Represents aggregated crowd statistics for a venue over a time window.

This is the analytics layer built on top of CrowdFrame.

Purpose:
- Power dashboards
- Support prediction models
- Enable anomaly detection
- Feed risk engine
- Avoid scanning raw frame data
"""

from sqlalchemy import Index, UniqueConstraint
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from sqlalchemy import (
    Integer,
    Float,
    String,
    JSON,
    ForeignKey,
    Index,
    CheckConstraint,
    DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from sqlalchemy import(
    Column,
    CheckConstraint,
    Index,
    UniqueConstraint,
)

class CrowdMetric(BaseModel):
    """
    Aggregated crowd statistics for a venue within a defined time bucket.

    Example:
        - Minute-level aggregation
        - Hour-level summary
    """

    __tablename__ = "crowd_metrics"


    __table_args__ = (
        # ---------------------------
        # Existing Validation Checks
        # ---------------------------
        CheckConstraint(
            "bucket_end > bucket_start",
            name="check_bucket_end_after_start"
        ),
        CheckConstraint(
            "min_count >= 0",
            name="check_min_count_non_negative"
        ),
        CheckConstraint(
            "max_count >= min_count",
            name="check_max_gte_min"
        ),
        CheckConstraint(
            "avg_count >= 0",
            name="check_avg_non_negative"
        ),
        CheckConstraint(
            "total_samples > 0",
            name="check_samples_positive"
        ),
        CheckConstraint(
            "anomaly_score IS NULL OR (anomaly_score >= 0 AND anomaly_score <= 1)",
            name="check_anomaly_score_range"
        ),

        # ---------------------------
        # NEW: Prevent duplicate metrics
        # ---------------------------
        UniqueConstraint(
            "camera_id",
            "bucket_start",
            "bucket_type",
            name="uq_metric_camera_bucket"
        ),

        # ---------------------------
        # NEW: Performance Indexes
        # ---------------------------
        Index("idx_metric_venue", "venue_id"),
        Index("idx_metric_camera", "camera_id"),
        Index("idx_metric_bucket_start", "bucket_start"),
        Index(
            "idx_metric_venue_bucket",
            "venue_id",
            "bucket_type",
            "bucket_start"
        ),
    )

    # ==========================================================
    # Relationships
    # ==========================================================

    venue_id: Mapped[UUID] = mapped_column(
        ForeignKey("venues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    venue: Mapped["Venue"] = relationship(
        "Venue",
        lazy="joined",
    )

    # ==========================================================
    # 🔥 FIXED: Added missing camera_id field
    # ==========================================================

    camera_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("cameras.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    camera: Mapped[Optional["Camera"]] = relationship(
        "Camera",
        lazy="select",
    )

    # ==========================================================
    # Time Bucket
    # ==========================================================

    bucket_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    bucket_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    bucket_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        default="minute",  # minute | hour | day
    )

    @property
    def duration_seconds(self) -> int:
        """Get bucket duration in seconds."""
        return int((self.bucket_end - self.bucket_start).total_seconds())

    # ==========================================================
    # Aggregated Statistics
    # ==========================================================

    avg_count: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    min_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    max_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
    )

    total_samples: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ==========================================================
    # 🔥 FIXED: Added avg_confidence field
    # ==========================================================

    avg_confidence: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    # ==========================================================
    # 🔥 Crowd Movement Metrics (Surge Tracking)
    # ==========================================================

    avg_velocity: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=0.0,
    )

    avg_variance: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=0.0,
    )

    avg_acceleration: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=0.0,
    )

    # ==========================================================
    # Rolling & Derived Metrics
    # ==========================================================

    rolling_avg_5: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    rolling_avg_15: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    growth_rate_percent: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    # ==========================================================
    # 🔥 FIXED: Added occupancy_percent and density_score fields
    # ==========================================================

    occupancy_percent: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    density_score: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    # ==========================================================
    # AI / Prediction Fields
    # ==========================================================

    predicted_next: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        index=True,
    )

    anomaly_score: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        index=True,
    )

    risk_level: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    # ==========================================================
    # 🔥 FIXED: Added dynamic_risk_score field
    # ==========================================================

    dynamic_risk_score: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        index=True,
    )

    model_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    model_version: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    model_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
    )

    # ==========================================================
    # Validation
    # ==========================================================

    def validate(self) -> list[str]:
        """Validate metric data before save."""
        errors = []

        # Time bucket validation
        if self.bucket_end <= self.bucket_start:
            errors.append("bucket_end must be greater than bucket_start.")

        valid_bucket_types = {"minute", "hour", "day"}
        if self.bucket_type not in valid_bucket_types:
            errors.append(f"bucket_type must be one of: {valid_bucket_types}")

        # Count validation
        if self.min_count < 0:
            errors.append("min_count cannot be negative.")

        if self.max_count < self.min_count:
            errors.append("max_count cannot be less than min_count.")

        if self.avg_count < 0:
            errors.append("avg_count cannot be negative.")

        if self.total_samples <= 0:
            errors.append("total_samples must be greater than zero.")

        # Confidence validation
        if self.avg_confidence is not None:
            if self.avg_confidence < 0 or self.avg_confidence > 1:
                errors.append("avg_confidence must be between 0 and 1.")

        # Occupancy validation
        if self.occupancy_percent is not None:
            if self.occupancy_percent < 0 or self.occupancy_percent > 100:
                errors.append("occupancy_percent must be between 0 and 100.")

        # Density score validation
        if self.density_score is not None and self.density_score < 0:
            errors.append("density_score cannot be negative.")

        # Risk score validation
        if self.dynamic_risk_score is not None:
            if self.dynamic_risk_score < 0 or self.dynamic_risk_score > 100:
                errors.append("dynamic_risk_score must be between 0 and 100.")

        # Movement metrics validation
        if self.avg_velocity is not None and self.avg_velocity < 0:
            errors.append("avg_velocity cannot be negative.")
        
        if self.avg_variance is not None and self.avg_variance < 0:
            errors.append("avg_variance cannot be negative.")

        # Growth rate validation (prevent extreme values)
        if self.growth_rate_percent is not None:
            if abs(self.growth_rate_percent) > 1000:
                errors.append(
                    "growth_rate_percent exceeds reasonable bounds (±1000%)")

        # Anomaly score validation
        if self.anomaly_score is not None:
            if self.anomaly_score < 0 or self.anomaly_score > 1:
                errors.append("anomaly_score must be between 0 and 1.")

        return errors

    # ==========================================================
    # Business Logic
    # ==========================================================

    def is_anomalous(self, threshold: float = 0.7) -> bool:
        """Check if anomaly score exceeds threshold."""
        if self.anomaly_score is None:
            return False
        return self.anomaly_score >= threshold

    def is_high_risk(self) -> bool:
        """Check if risk level is high."""
        return self.risk_level == "high"

    def is_critical_risk(self) -> bool:
        """Check if risk level is critical."""
        return self.risk_level == "critical"

    def occupancy_percentage(self, venue_capacity: Optional[int] = None) -> Optional[float]:
        """Calculate occupancy percentage if capacity available."""
        if self.occupancy_percent is not None:
            return self.occupancy_percent

        capacity = venue_capacity
        if capacity is None and self.venue:
            capacity = self.venue.capacity

        if capacity and capacity > 0:
            return (self.avg_count / capacity) * 100
        return None

    def meets_threshold(self, threshold: int) -> bool:
        """Check if max_count meets threshold."""
        return self.max_count >= threshold


# ==========================================================
# Index Optimization for Time-Series
# ==========================================================

Index(
    "ix_metric_venue_time",
    CrowdMetric.venue_id,
    CrowdMetric.bucket_start.desc(),
)

Index(
    "ix_metric_camera_time",
    CrowdMetric.camera_id,
    CrowdMetric.bucket_start.desc(),
)

Index(
    "ix_metric_bucket_type_time",
    CrowdMetric.bucket_type,
    CrowdMetric.bucket_start.desc(),
)

Index(
    "ix_metric_risk_time",
    CrowdMetric.risk_level,
    CrowdMetric.bucket_start.desc(),
)

Index(
    "ix_metric_anomaly",
    CrowdMetric.anomaly_score.desc(),
    CrowdMetric.bucket_start.desc(),
)

Index(
    "ix_metric_risk_score",
    CrowdMetric.dynamic_risk_score.desc(),
)
