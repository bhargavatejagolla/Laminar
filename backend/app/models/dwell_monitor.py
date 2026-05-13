"""
Laminar - Dwell Time Monitoring Models
---------------------------------------

Tables:
- monitoring_zones      — per-camera polygon zones (queue areas, gates)
- person_dwell_times    — per-person dwell records (enter, last seen, dwell_seconds)
"""

from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime, String, Float, Integer, Boolean, JSON, ForeignKey, Text
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MonitoringZone(Base):
    """
    Defines a named polygon zone inside a camera's frame.
    Example: 'Gate A Queue', 'Darshan Corridor', 'Entrance'
    """
    __tablename__ = "monitoring_zones"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, nullable=False
    )
    camera_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), nullable=False, index=True
    )
    zone_name: Mapped[str] = mapped_column(String(120), nullable=False)

    # List of [x, y] points defining the polygon.
    # Example: [[10,10],[200,10],[200,300],[10,300]]
    polygon_coordinates: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # Alert threshold: seconds before a long-wait alert is triggered (default 10 min)
    long_wait_threshold_seconds: Mapped[int] = mapped_column(Integer, default=600, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<MonitoringZone(id={self.id}, name={self.zone_name}, camera={self.camera_id})>"


class PersonDwellTime(Base):
    """
    Records how long each tracked person remains in a monitoring zone.
    One record per person-entry into a zone.
    """
    __tablename__ = "person_dwell_times"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, nullable=False
    )
    camera_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), nullable=False, index=True
    )

    # Integer tracker ID assigned by the IoU centroid tracker (not a UUID)
    tracker_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    zone_name: Mapped[str] = mapped_column(String(120), nullable=False)

    enter_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    last_seen_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    dwell_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Whether a long-wait alert was already fired for this record
    alert_triggered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Path to snapshots at different stages
    snapshot_enter_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    snapshot_mid_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # Usually alert moment
    snapshot_exit_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Explicit exit time (often same as last_seen_time but distinct for data integrity)
    exit_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    snapshot_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # Legacy support

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return (
            f"<PersonDwellTime(tracker_id={self.tracker_id}, "
            f"zone={self.zone_name}, dwell={self.dwell_seconds:.0f}s)>"
        )
