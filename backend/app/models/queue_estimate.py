"""
Laminar - Queue Estimate Model
------------------------------

Stores estimated waiting times for queues at venues based on real-time crowd sizes.
"""

from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy import (
    Integer,
    Float,
    String,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class QueueEstimate(BaseModel):
    """
    Real-time estimations of waiting times in lines/queues.
    """

    __tablename__ = "queue_estimates"

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
        lazy="selectin",
    )

    # ==========================================================
    # Estimation Metrics
    # ==========================================================

    queue_length: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Total estimated number of people currently waiting in line",
    )

    service_rate: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        comment="Estimated number of people processed per minute",
    )

    estimated_wait_time: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Human readable wait time (e.g., '20 minutes')",
    )
    
    wait_time_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Integer wait time in minutes for analytic sorting",
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # ==========================================================
    # Indexes
    # ==========================================================

    __table_args__ = (
        Index("idx_queue_venue_time", "venue_id", "timestamp"),
    )

    def validate(self) -> list[str]:
        errors = []
        if self.queue_length < 0:
            errors.append("queue_length cannot be negative")
        if self.service_rate <= 0:
            errors.append("service_rate must be positive and greater than 0")
        return errors
