from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# =====================================================
# Request Schemas
# =====================================================

class VenueCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    capacity: int = Field(..., gt=0)
    location: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    warning_threshold: int = Field(default=700, ge=1)
    critical_threshold: int = Field(default=900, ge=1)
    venue_type: Optional[str] = None
    staffing_config: Optional[Dict[str, Any]] = None
    model_metadata: Optional[Dict[str, Any]] = None
    model_config = {"protected_namespaces": ()}


class VenueUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = Field(default=None, gt=0)
    location: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    warning_threshold: Optional[int] = Field(default=None, ge=1)
    critical_threshold: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None
    monitoring_enabled: Optional[bool] = None
    expected_version: Optional[int] = None
    venue_type: Optional[str] = None
    staffing_config: Optional[Dict[str, Any]] = None
    model_metadata: Optional[Dict[str, Any]] = None
    model_config = {"protected_namespaces": ()}


class VenueBulkDeleteRequest(BaseModel):
    venue_ids: List[UUID]


class CapacityStatusRequest(BaseModel):
    current_count: int = Field(..., ge=0)


# =====================================================
# Response Schemas
# =====================================================

class VenueResponse(BaseModel):
    id: UUID
    name: str
    capacity: Optional[int]
    location: Optional[str]
    city: Optional[str]
    country: Optional[str]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    warning_threshold: int
    critical_threshold: int
    is_active: bool
    monitoring_enabled: bool
    dynamic_risk_score: Optional[float]
    venue_type: Optional[str]
    staffing_config: Optional[Dict[str, Any]]
    model_metadata: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class VenueStatsResponse(BaseModel):
    id: UUID
    name: str
    capacity: Optional[int]
    current_risk: Optional[float]
    risk_level: Optional[str] = None
    current_occupancy: float
    capacity_usage: float
    camera_count: int
    active_cameras: int
    is_active: bool
    monitoring_enabled: bool
    warning_threshold: int
    critical_threshold: int
    venue_type: Optional[str]
    created_at: datetime
    city: Optional[str]
    country: Optional[str]
    avg_velocity: float = 0.0
    avg_wait_time: float = 0.0
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class CapacityStatusResponse(BaseModel):
    level: str
    percentage: Optional[float]
    message: str
