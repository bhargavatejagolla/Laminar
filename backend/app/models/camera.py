"""
Laminar - Camera Domain Model
------------------------------


Represents a camera device attached to a Venue.

Design Goals:
- Multi-camera per venue
- Supports RTSP / HTTP / Edge device types
- AI pipeline ready
- Health monitoring
- Failover-ready architecture
- Scalable ingestion
"""
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy import (
    String,
    Boolean,
    Integer,
    Float,
    Text,
    JSON,
    ForeignKey,
    Index,
    DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

class Camera(BaseModel):
    """
    Camera device connected to a venue.

    Examples:
        - CCTV RTSP camera
        - IP camera
        - Edge AI device
        - Temporary event camera
    """

    __tablename__ = "cameras"

    # ==========================================================
    # Relationship
    # ==========================================================

    venue_id: Mapped[UUID] = mapped_column(
        ForeignKey("venues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    tenant_id: Mapped[Optional[UUID]] = mapped_column(
        nullable=True,
        index=True,
    )

    venue: Mapped["Venue"] = relationship(
        "Venue",
        back_populates="cameras",
        lazy="joined",
    )

    # ==========================================================
    # Core Identity
    # ==========================================================

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    detections = relationship(
        "Detection",
        back_populates="camera",
        cascade="all, delete-orphan",
        lazy = "dynamic",
    )

    code: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        unique=True,
        index=True,
    )

    location_description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    # ==========================================================
    # Location Intelligence Fields
    # ==========================================================


    location_label: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )

    zone_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )

    floor_level: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    latitude: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    longitude: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )
    

    # ==========================================================
    # Stream Configuration
    # ==========================================================

    stream_url: Mapped[Optional[str]] = mapped_column(
        String(1000),
        nullable=True,
    )

    stream_type: Mapped[str] = mapped_column(
        String(50),
        default="rtsp",  # rtsp | http | file | edge
        nullable=False,
        index=True,
    )
    health_status:Mapped[str]=mapped_column(
        String(50),
        default="unknown",
        nullable=False,
        index = True,
    )

    username: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    password: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    # ==========================================================
    # Hardware / Technical Info
    # ==========================================================

    resolution_width: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    resolution_height: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    fps: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    hardware_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
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

    is_online: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
    )

    monitoring_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_frame_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_snapshot: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
    )

    # ==========================================================
    # AI Configuration
    # ==========================================================

    detection_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    tracking_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    model_version: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )

    model_config: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
    )

    # ==========================================================
    # Relationships (future entities)
    # ==========================================================

    frames: Mapped[List["CrowdFrame"]] = relationship(
        "CrowdFrame",
        back_populates="camera",
        cascade="all, delete-orphan",
        lazy="dynamic",  # Better for large datasets - returns query, not all records
    )

    # ==========================================================
    # Business Logic
    # ==========================================================

    def mark_online(self):
        """Mark camera as online and update heartbeat."""
        self.is_online = True
        self.last_heartbeat_at = datetime.now(timezone.utc)

    def mark_offline(self):
        """Mark camera as offline."""
        self.is_online = False

    def update_frame_timestamp(self):
        """Record that a frame was received."""
        self.last_frame_at = datetime.now(timezone.utc)

    def enable_monitoring(self):
        """Enable monitoring for this camera."""
        self.monitoring_enabled = True

    def disable_monitoring(self):
        """Disable monitoring for this camera."""
        self.monitoring_enabled = False

    def is_stream_configured(self) -> bool:
        """Check if stream URL is configured."""
        return bool(self.stream_url)

    def enable_detection(self):
        """Enable AI detection for this camera."""
        self.detection_enabled = True

    def disable_detection(self):
        """Disable AI detection for this camera."""
        self.detection_enabled = False

    def update_model_config(self, version: str, config: Dict[str, Any]):
        """Update AI model configuration."""
        self.model_version = version
        self.model_config = config

    def get_display_location(self) -> str:
        """
        Returns formatted human-readable location string
        for notifications and dashboards.
        Example: "Gate A - North Entrance - Floor 1"
        """
        parts = []

        if self.location_label:
            parts.append(self.location_label)

        if self.zone_name:
            parts.append(self.zone_name)

        if self.floor_level:
            parts.append(f"Floor {self.floor_level}")

        return " - ".join(parts) if parts else self.name

    # ==========================================================
    # Validation
    # ==========================================================

    def validate(self) -> List[str]:
        """Validate camera data before save."""
        errors = []

        if not self.name:
            errors.append("Camera name is required.")

        valid_stream_types = {"rtsp", "http", "https", "file", "edge", "device", "cctv", "rtmp"}
        if self.stream_type not in valid_stream_types:
            errors.append(
                f"Invalid stream type. Must be one of: {valid_stream_types}")

        if self.fps is not None and self.fps <= 0:
            errors.append("FPS must be positive.")

        if self.resolution_width is not None and self.resolution_width <= 0:
            errors.append("Resolution width must be positive.")
            

        if self.resolution_height is not None and self.resolution_height <= 0:
            errors.append("Resolution height must be positive.")

        # Latitude validation
        if self.latitude is not None:
            if self.latitude < -90 or self.latitude > 90:
                errors.append("Latitude must be between -90 and 90.")

        # Longitude validation
        if self.longitude is not None:
            if self.longitude < -180 or self.longitude > 180:
                errors.append("Longitude must be between -180 and 180.")

        # If username is provided, password should be too (and vice versa)
        if bool(self.username) != bool(self.password):
            errors.append(
                "Both username and password must be provided together.")
        valid_health_status = {"unknown", "healthy", "warning", "offline", "error"}

        # Ensure default health status before validation
        if not self.health_status:
            self.health_status = "unknown"

        valid_health_status = {"unknown", "healthy", "warning", "offline", "error"}
        if self.health_status not in valid_health_status:
            errors.append(f"health_status must be one of {valid_health_status}")


# ==========================================================
# Index Optimization
# ==========================================================

Index("ix_camera_active_online", Camera.is_active, Camera.is_online)
Index("ix_camera_venue_active", Camera.venue_id, Camera.is_active)
Index("ix_camera_heartbeat", Camera.last_heartbeat_at.desc())
Index("ix_camera_model_version", Camera.model_version)
Index("ix_camera_venue_zone", Camera.venue_id, Camera.zone_name)
Index("ix_camera_venue_location", Camera.venue_id, Camera.location_label)
Index("ix_camera_geo_coordinates", Camera.latitude, Camera.longitude)
