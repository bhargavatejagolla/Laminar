from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID
import os
from pydantic import BaseModel, Field, model_validator
from enum import Enum


# ==========================================================
# Enum Mirrors (API Safe Enums)
# ==========================================================

class AlertSeverity(str, Enum):
    info = "info"
    warning = "warning"
    error = "error"
    critical = "critical"


class AlertCategory(str, Enum):
    system = "system"
    security = "security"
    camera = "camera"
    detection = "detection"
    user = "user"
    maintenance = "maintenance"


class AlertStatus(str, Enum):
    new = "new"
    acknowledged = "acknowledged"
    resolved = "resolved"
    dismissed = "dismissed"


# ==========================================================
# Base Schema
# ==========================================================

class AlertBase(BaseModel):
    title: str = Field(..., max_length=255)
    message: str
    severity: AlertSeverity = AlertSeverity.info
    category: AlertCategory = AlertCategory.system
    venue_id: Optional[UUID] = None
    camera_id: Optional[UUID] = None
    assigned_to_id: Optional[UUID] = None
    extra_data: Optional[Dict] = None


# ==========================================================
# Create
# ==========================================================

class AlertCreate(AlertBase):
    pass


# ==========================================================
# Update
# ==========================================================

class AlertUpdate(BaseModel):
    title: Optional[str]
    message: Optional[str]
    severity: Optional[AlertSeverity]
    category: Optional[AlertCategory]
    status: Optional[AlertStatus]
    assigned_to_id: Optional[UUID]
    extra_data: Optional[Dict]


# ==========================================================
# Response
# ==========================================================

class AlertResponse(BaseModel):

    id: UUID

    venue_id: Optional[UUID] = None
    camera_id: Optional[UUID] = None

    risk_level: Optional[str] = None
    severity: Optional[int] = None
    status: str

    escalation_level: Optional[int] = None

    created_at: datetime
    last_notified_at: Optional[datetime] = None

    explanation: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None

    # Evidence fields — populated from extra_data
    snapshot_url: Optional[str] = None
    clip_url:     Optional[str] = None
    download_url: Optional[str] = None

    @model_validator(mode="after")
    def _populate_evidence_urls(self) -> "AlertResponse":
        """Build serving URLs from extra_data paths."""
        ed = self.extra_data or {}

        if self.snapshot_url is None:
            snap = ed.get("snapshot_path")
            if snap:
                self.snapshot_url = f"/api/v1/storage/snapshots/{os.path.basename(snap)}"

        if self.clip_url is None:
            clip = ed.get("clip_path")
            if clip:
                filename = os.path.basename(clip)
                self.clip_url = f"/api/v1/clips/{filename}"
                # Alert clips can be downloaded using the same camera-based endpoint if we have camera_id
                if self.camera_id:
                    self.download_url = f"/api/v1/cameras/{self.camera_id}/clips/{filename}/download"

        return self

    class Config:
        from_attributes = True

# ==========================================================
# Pagination Response
# ==========================================================

class AlertListResponse(BaseModel):
    total: int
    items: list[AlertResponse]


# ==========================================================
# Stats Response
# ==========================================================

class AlertStatsResponse(BaseModel):
    total: int
    by_status: Dict[str, int]
    by_severity: Dict[str, int]
