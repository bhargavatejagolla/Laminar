"""
LAMINAR - Unified Intelligence Event Model
------------------------------------------
Canonical event data structure produced by all domain intelligence engines
(Traffic, Parking, Incident, Road Condition, System Health).
Enforces zero-mock, location provenance, and evidence tracking.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field

class LocationPayload(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_source: str = "UNKNOWN"  # VENUE_CONFIG | CAMERA_CONFIG | LIVE_GPS | VIDEO_METADATA | UNKNOWN
    accuracy_m: Optional[float] = None

class LaminarIntelligenceEvent(BaseModel):
    event_id: str
    event_type: str  # e.g., "traffic_density_high", "parking_capacity_critical", "collision_verified", "camera_offline"
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
    explanation: Dict[str, Any] = Field(default_factory=dict)  # "Why?" explainability breakdown
    acknowledged_at: Optional[str] = None
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[str] = None
