"""
LAMINAR - Unified Intelligence Event Model & ORM Persistence
-------------------------------------------------------------
Canonical event data structure produced by all domain intelligence engines
(Traffic, Parking, Incident, Road Condition, System Health).
Enforces zero-mock, location provenance, delivery tracking, and dual-store persistence.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from sqlalchemy import String, Float, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel as SQLAlchemyBaseModel


# ── Pydantic DTOs for Ingestion, Serialization, and SSE Transport ───────────

class LocationPayload(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_source: str = "UNKNOWN"  # VENUE_CONFIG | CAMERA_CONFIG | CAMERA_CALIBRATED | LIVE_GPS | VIDEO_METADATA | UNKNOWN
    accuracy_m: Optional[float] = None


class LaminarIntelligenceEvent(BaseModel):
    model_config = {"protected_namespaces": ()}

    event_id: str
    event_type: str  # e.g., "traffic_density_high", "parking_capacity_critical", "collision_verified", "road_defect_verified", "camera_offline"
    domain: str      # "traffic" | "parking" | "incident" | "road_condition" | "system"
    venue_id: Optional[str] = None
    venue_name: Optional[str] = None
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    source_type: str = "live"  # "live" | "upload"
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    location: LocationPayload = Field(default_factory=LocationPayload)
    severity: str = "info"     # "info" | "warning" | "high" | "critical"
    confidence: float = 1.0
    state: str = "active"      # "candidate" | "verified" | "active" | "acknowledged" | "resolved"
    title: str
    description: str
    evidence: Dict[str, Any] = Field(default_factory=dict)
    explanation: Dict[str, Any] = Field(default_factory=dict)
    model_name: Optional[str] = None
    model_version: Optional[str] = None
    delivery_status: Dict[str, str] = Field(default_factory=dict)
    acknowledged_at: Optional[str] = None
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[str] = None


# ── SQLAlchemy ORM Model for Historical Database Truth ───────────────────────

class IntelligenceEventRecord(SQLAlchemyBaseModel):
    """
    Persistent operational record of all intelligence events.
    Serves as the historical source of truth for PDF reports, audit trails, and dashboard reloads.
    """
    __tablename__ = "intelligence_events"

    event_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    domain: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    venue_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    venue_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    camera_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    camera_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_type: Mapped[str] = mapped_column(String(50), default="live", nullable=False)
    timestamp_iso: Mapped[str] = mapped_column(String(50), nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_source: Mapped[str] = mapped_column(String(50), default="UNKNOWN", nullable=False)
    severity: Mapped[str] = mapped_column(String(50), default="info", index=True, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    state: Mapped[str] = mapped_column(String(50), default="active", index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    explanation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    delivery_status: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    acknowledged_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    resolved_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    def to_event_dto(self) -> LaminarIntelligenceEvent:
        """Convert database record back to unified Pydantic event DTO."""
        return LaminarIntelligenceEvent(
            event_id=self.event_id,
            event_type=self.event_type,
            domain=self.domain,
            venue_id=self.venue_id,
            venue_name=self.venue_name,
            camera_id=self.camera_id,
            camera_name=self.camera_name,
            source_type=self.source_type,
            timestamp=self.timestamp_iso,
            location=LocationPayload(
                latitude=self.latitude,
                longitude=self.longitude,
                location_source=self.location_source
            ),
            severity=self.severity,
            confidence=self.confidence,
            state=self.state,
            title=self.title,
            description=self.description,
            evidence=self.evidence or {},
            explanation=self.explanation or {},
            model_name=self.model_name,
            model_version=self.model_version,
            delivery_status=self.delivery_status or {},
            acknowledged_at=self.acknowledged_at,
            acknowledged_by=self.acknowledged_by,
            resolved_at=self.resolved_at
        )
