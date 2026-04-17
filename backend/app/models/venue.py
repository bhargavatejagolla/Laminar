"""
Laminar - Venue Domain Model
-----------------------------

Represents a physical location being monitored.

Design Goals:
- Multi-camera support
- AI-ready (risk scoring, predictions)
- Geo-enabled
- Multi-tenant compatible
- Operational lifecycle management
- Future analytics & forecasting support
- Non-static: supports state transitions

This is a core root entity in the Laminar domain.
"""

from typing import Optional, List, Dict, Any
from uuid import UUID
from decimal import Decimal
from datetime import datetime

from sqlalchemy import (
    String,
    Integer,
    Boolean,
    Text,
    Float,
    Numeric,
    JSON,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Venue(BaseModel):
    """
    Venue represents a monitored physical location.

    Examples:
        - Stadium
        - Railway station
        - Public event ground
        - Airport terminal
        - City square
    """

    __tablename__ = "venues"

    # ==========================================================
    # Core Identity
    # ==========================================================

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )

    code: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        unique=True,
        index=True,
    )

    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    
    tenant_id: Mapped[Optional[UUID]] = mapped_column(
        nullable=True,
        index=True,
    )
    
    # ==========================================================
    # Capacity & Risk
    # ==========================================================

    capacity: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    warning_threshold: Mapped[int] = mapped_column(
        Integer,
        default=700,
        nullable=False,
    )

    critical_threshold: Mapped[int] = mapped_column(
        Integer,
        default=900,
        nullable=False,
    )

    warning_threshold_percent: Mapped[int] = mapped_column(
        Integer,
        default=70,  # Legacy
        nullable=False,
    )

    critical_threshold_percent: Mapped[int] = mapped_column(
        Integer,
        default=90,  # Legacy
        nullable=False,
    )

    dynamic_risk_score: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        index=True,
    )
    
    venue_type: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )
    
    staffing_config: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
    )

    # ==========================================================
    # Geo Location
    # ==========================================================

    latitude: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 7),
        nullable=True,
    )

    longitude: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 7),
        nullable=True,
    )

    address: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )
    location: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    city: Mapped[Optional[str]] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    country: Mapped[Optional[str]] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    # ==========================================================
    # Operational State
    # ==========================================================

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True,
    )

    is_under_maintenance: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    monitoring_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # ==========================================================
    # AI / Analytics Metadata
    # ==========================================================

    prediction_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    anomaly_detection_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    model_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
    )

    last_prediction_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
    )

    # ==========================================================
    # Relationships
    # ==========================================================

    cameras: Mapped[List["Camera"]] = relationship(
        "Camera",
        back_populates="venue",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    alerts: Mapped[List["CrowdAlert"]] = relationship(
        "CrowdAlert",
        back_populates="venue",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    users: Mapped[List["User"]] = relationship(
        "User",
        secondary="user_venue_access",
        back_populates="venues",
        lazy="selectin"
    )

    # ==========================================================
    # Business Logic Methods
    # ==========================================================

    def capacity_warning_limit(self) -> Optional[int]:
        """Calculate warning count threshold."""
        return self.warning_threshold

    def capacity_critical_limit(self) -> Optional[int]:
        """Calculate critical count threshold."""
        return self.critical_threshold

    def is_over_capacity(self, current_count: int) -> bool:
        """Check if current count exceeds capacity."""
        if not self.capacity:
            return False
        return current_count > self.capacity

    def is_warning_level(self, current_count: int) -> bool:
        """Check if warning threshold reached."""
        limit = self.capacity_warning_limit()
        if limit is None:
            return False
        return current_count >= limit

    def is_critical_level(self, current_count: int) -> bool:
        """Check if critical threshold reached."""
        limit = self.capacity_critical_limit()
        if limit is None:
            return False
        return current_count >= limit

    def activate(self):
        """Activate the venue."""
        self.is_active = True

    def deactivate(self):
        """Deactivate the venue."""
        self.is_active = False

    def enable_monitoring(self):
        """Enable monitoring for this venue."""
        self.monitoring_enabled = True

    def disable_monitoring(self):
        """Disable monitoring for this venue."""
        self.monitoring_enabled = False

    # ==========================================================
    # Validation Override
    # ==========================================================

    def validate(self) -> List[str]:
        """Validate venue business rules."""
        errors = []

        if self.capacity is not None and self.capacity <= 0:
            errors.append("Capacity must be greater than zero.")

        if not (0 < self.warning_threshold_percent <= 100):
            errors.append("Warning threshold must be between 1 and 100.")

        if not (0 < self.critical_threshold_percent <= 100):
            errors.append("Critical threshold must be between 1 and 100.")

        if (
            self.warning_threshold_percent
            >= self.critical_threshold_percent
        ):
            errors.append(
                "Warning threshold must be less than critical threshold."
            )

        return errors


# ==========================================================
# Index Optimization
# ==========================================================

Index("ix_venue_active_city", Venue.is_active, Venue.city)
Index("ix_venue_risk_score", Venue.dynamic_risk_score)
