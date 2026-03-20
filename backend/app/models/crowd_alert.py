"""
Laminar - Crowd Alert Model
----------------------------

Represents an active or historical alert for a venue.
"""

from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy import (
    String,
    Integer,
    ForeignKey,
    Index,
    Text,
    DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from app.models.base import BaseModel


class CrowdAlert(BaseModel):
    """Alert generated from risk engine decisions."""

    __tablename__ = "crowd_alerts"

    # ==========================================================
    # Relationships
    # ==========================================================

    venue_id: Mapped[UUID] = mapped_column(
        ForeignKey("venues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    venue: Mapped["Venue"] = relationship("Venue", lazy="joined")

    metric_id: Mapped[Optional[UUID]] = mapped_column(
        index=True,
        nullable=True,
    )

    # ==========================================================
    # Alert details
    # ==========================================================

    extra_data :Mapped[Optional[dict]]=mapped_column(
        JSONB,
        nullable=True,
    )
    predicted_level: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    predicted_risk_score: Mapped[Optional[float]] = mapped_column(
        nullable=True,
    )

    escalation_probability: Mapped[Optional[float]] = mapped_column(
        nullable=True,
    )

    early_warning_triggered: Mapped[Optional[bool]] = mapped_column(
        nullable=True,
    )
    risk_level: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )

    severity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=5,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="open",
        index=True,
    )  # open, acknowledged, resolved

    escalation_level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    # ==========================================================
    # Timestamps (ALL FIXED: timezone-aware)
    # ==========================================================

    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),  # ✅ FIXED
        nullable=True,
    )

    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),  # ✅ FIXED
        nullable=True,
    )

    last_notified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),  # ✅ FIXED
        nullable=True,
    )

    # ==========================================================
    # User tracking
    # ==========================================================

    acknowledged_by: Mapped[Optional[UUID]] = mapped_column(
        nullable=True,
    )

    resolved_by: Mapped[Optional[UUID]] = mapped_column(
        nullable=True,
    )

    # ==========================================================
    # Optional notes
    # ==========================================================

    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    explanation: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # ==========================================================
    # Validation
    # ==========================================================

    def validate(self) -> list[str]:
        """Validate alert data before save."""
        errors = []

        if self.acknowledged_at and self.acknowledged_at > datetime.now(timezone.utc):
            errors.append("acknowledged_at cannot be in the future")

        if self.resolved_at and self.resolved_at > datetime.now(timezone.utc):
            errors.append("resolved_at cannot be in the future")

        if self.acknowledged_at and self.resolved_at:
            if self.acknowledged_at > self.resolved_at:
                errors.append("acknowledged_at cannot be after resolved_at")

        valid_statuses = ["open", "acknowledged", "resolved"]
        if self.status not in valid_statuses:
            errors.append(f"status must be one of: {valid_statuses}")

        return errors


# ==========================================================
# Indexes
# ==========================================================

Index("ix_alert_venue_status", CrowdAlert.venue_id, CrowdAlert.status)
Index("ix_alert_escalation", CrowdAlert.escalation_level, CrowdAlert.status)
Index("ix_alert_timeline", CrowdAlert.created_at.desc())
