"""
Laminar - Alert Model
--------------------

Represents system alerts and notifications for venues.
Tracks security events, system issues, and user notifications.
"""

from uuid import uuid4
from datetime import datetime,timezone
from typing import Optional, List
from uuid import UUID

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    JSON,
    Index,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import enum

from app.core.database import Base


# ==========================================================
# Enums
# ==========================================================

class AlertSeverity(enum.Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertCategory(enum.Enum):
    """Alert categories for better organization."""
    SYSTEM = "system"
    SECURITY = "security"
    CAMERA = "camera"
    DETECTION = "detection"
    USER = "user"
    MAINTENANCE = "maintenance"


class AlertStatus(enum.Enum):
    """Alert lifecycle status."""
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


# ==========================================================
# Alert Model
# ==========================================================

class Alert(Base):
    """
    Alert model for system notifications and events.
    
    Features:
    - Severity levels (info, warning, error, critical)
    - Categories for filtering
    - Status tracking (new, acknowledged, resolved)
    - JSON extra_data for flexible data storage
    - Timestamps for creation and resolution
    - Venue association
    - Optional user assignment
    """
    __tablename__ = "alerts"

    # ==========================================================
    # Primary Key - Using UUID to match BaseModel pattern
    # ==========================================================

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        index=True
    )

    # ==========================================================
    # Core Fields
    # ==========================================================

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    # ==========================================================
    # Enums
    # ==========================================================

    severity: Mapped[AlertSeverity] = mapped_column(
        SQLEnum(AlertSeverity),
        nullable=False,
        default=AlertSeverity.INFO,
        index=True
    )

    category: Mapped[AlertCategory] = mapped_column(
        SQLEnum(AlertCategory),
        nullable=False,
        default=AlertCategory.SYSTEM,
        index=True
    )

    status: Mapped[AlertStatus] = mapped_column(
        SQLEnum(AlertStatus),
        nullable=False,
        default=AlertStatus.NEW,
        index=True
    )

    # ==========================================================
    # Foreign Keys - All UUID to match related models
    # ==========================================================

    venue_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("venues.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )

    camera_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("cameras.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    assigned_to_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # ==========================================================
    # Timestamps
    # ==========================================================

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # ==========================================================
    # Extra Data (renamed from 'metadata' to avoid SQLAlchemy reserved name conflict)
    # ==========================================================

    extra_data: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True
    )

    # ==========================================================
    # Relationships
    # ==========================================================

    venue: Mapped[Optional["Venue"]] = relationship(
        "Venue",
        foreign_keys=[venue_id],
        lazy="noload"
    )

    camera: Mapped[Optional["Camera"]] = relationship(
        "Camera",
        foreign_keys=[camera_id],
        lazy="noload"
    )

    assigned_to: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[assigned_to_id],
        lazy="noload"
    )

    # ==========================================================
    # Tracking Fields
    # ==========================================================

    source_ip: Mapped[Optional[str]] = mapped_column(
        String(45),
        nullable=True
    )

    user_agent: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    request_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        nullable=True
    )

    # ==========================================================
    # Counters
    # ==========================================================

    acknowledgement_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )

    notification_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )
    # ==========================================================
    # Soft Delete Support
    # ==========================================================


    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True
    )

    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # ==========================================================
    # Indexes for common queries
    # ==========================================================

    __table_args__ = (
        Index("ix_alerts_venue_status", "venue_id", "status"),
        Index("ix_alerts_severity_status", "severity", "status"),
        Index("ix_alerts_category_created", "category", "created_at"),
        Index("ix_alerts_venue_created", "venue_id", "created_at"),
    )

    def __repr__(self) -> str:
        """String representation."""
        return f"<Alert id={self.id} title='{self.title}' severity={self.severity.value}>"

    # ==========================================================
    # Helper Methods
    # ==========================================================

    def acknowledge(self, user_id: Optional[UUID] = None) -> None:
        """
        Mark alert as acknowledged.
        
        Args:
            user_id: Optional user who acknowledged the alert
        """
        self.status = AlertStatus.ACKNOWLEDGED
        self.acknowledged_at = datetime.now(datetime.UTC)
        self.acknowledgement_count += 1
        if user_id:
            self.assigned_to_id = user_id

    def resolve(self, resolution_note: Optional[str] = None) -> None:
        """
        Mark alert as resolved.
        
        Args:
            resolution_note: Optional note about resolution
        """
        self.status = AlertStatus.RESOLVED
        self.resolved_at = datetime.now(datetime.UTC)
        if resolution_note:
            if not self.extra_data:
                self.extra_data = {}
            self.extra_data["resolution_note"] = resolution_note

    def dismiss(self) -> None:
        """Dismiss the alert."""
        self.status = AlertStatus.DISMISSED

    def soft_delete(self) -> None:
        """
        Soft delete the alert without removing it from database.
        Preserves audit trail and analytics history.
        """
        self.is_deleted = True
        self.deleted_at = datetime.now(datetime.UTC)

    def increment_notification(self) -> None:
        """Increment notification counter."""
        self.notification_count += 1

    @classmethod
    def active_filter(cls):
        """
        Reusable filter to exclude soft-deleted alerts.
        """
        return cls.is_deleted == False

    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),  # Convert UUID to string for JSON
            "title": self.title,
            "message": self.message,
            "severity": self.severity.value,
            "category": self.category.value,
            "status": self.status.value,
            "venue_id": str(self.venue_id) if self.venue_id else None,
            "camera_id": str(self.camera_id) if self.camera_id else None,
            "assigned_to_id": str(self.assigned_to_id) if self.assigned_to_id else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "extra_data": self.extra_data,
            "acknowledgement_count": self.acknowledgement_count,
            "notification_count": self.notification_count,
        }


# ==========================================================
# Alert History Model (for audit trail)
# ==========================================================

class AlertHistory(Base):
    """
    Track changes to alerts over time.
    Useful for auditing and debugging.
    """
    __tablename__ = "alert_history"

    # ==========================================================
    # Primary Key - Using UUID to match BaseModel pattern
    # ==========================================================

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        index=True
    )

    # ==========================================================
    # Foreign Keys
    # ==========================================================

    alert_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("alerts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # ==========================================================
    # What changed
    # ==========================================================

    field_name: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    old_value: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    new_value: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    # ==========================================================
    # Who changed it
    # ==========================================================

    changed_by_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    changed_by: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[changed_by_id]
    )

    # ==========================================================
    # When
    # ==========================================================

    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # ==========================================================
    # Extra Data
    # ==========================================================

    extra_data: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True
    )

    # ==========================================================
    # Indexes
    # ==========================================================

    __table_args__ = (
        Index("ix_alert_history_alert_changed", "alert_id", "changed_at"),
    )


# Add missing import at the top
