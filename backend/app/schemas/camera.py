"""
Laminar - Camera Schemas
------------------------

Pydantic models for camera API requests and responses.
"""

from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, timezone

from pydantic import BaseModel, Field, validator, ConfigDict


class CameraCreate(BaseModel):
    """Schema for creating a new camera."""

    venue_id: UUID = Field(...,
                           description="ID of the venue this camera belongs to")
    name: str = Field(..., min_length=1, max_length=255,
                      description="Camera name")
    stream_url: Optional[str] = Field(
        None, description="RTSP URL, device index, or file path")
    stream_type: str = Field(
        "rtsp", description="rtsp, http, device, file, or edge")
    username: Optional[str] = Field(
        None, description="Authentication username")
    password: Optional[str] = Field(
        None, description="Authentication password")
    location_description: Optional[str] = Field(
        None, max_length=500, description="Where the camera is located")
    resolution_width: Optional[int] = Field(
        None, ge=1, le=7680, description="Width in pixels")
    resolution_height: Optional[int] = Field(
        None, ge=1, le=4320, description="Height in pixels")
    fps: Optional[float] = Field(
        5.0, gt=0, le=240, description="Target frames per second")
    is_active: bool = Field(True, description="Whether camera is active")
    monitoring_enabled: bool = Field(
        True, description="Whether monitoring is enabled")
    detection_enabled: bool = Field(
        True, description="Whether AI detection is enabled")
    tracking_enabled: bool = Field(
        True, description="Whether object tracking is enabled")
    hardware_metadata: Optional[Dict[str, Any]] = Field(
        None, description="Hardware-specific metadata")

    @validator('stream_url')
    def validate_stream_url(cls, v, values):
        stream_type = values.get('stream_type')

        if stream_type in ['rtsp', 'http', 'https'] and not v:
            raise ValueError(
                f'Stream URL required for {stream_type} stream type')

        if stream_type == 'device':
            if v is None:
                return '0'
            # Ensure it is numeric
            if not str(v).isdigit():
                raise ValueError(
                    "Device stream_url must be numeric device index")
            return str(v)

        return v

    @validator('username')
    def validate_credentials(cls, v, values):
        """Validate that username and password are provided together."""
        password = values.get('password')
        if v and not password:
            raise ValueError('Password required when username is provided')
        return v

    @validator('password')
    def validate_password(cls, v, values):
        """Validate that username and password are provided together."""
        username = values.get('username')
        if v and not username:
            raise ValueError('Username required when password is provided')
        return v

    @validator('stream_type')
    def validate_stream_type(cls, v):
        valid_types = {'rtsp', 'http', 'https', 'device', 'file', 'edge'}
        if v not in valid_types:
            raise ValueError(f'Stream type must be one of: {valid_types}')
        return v


class CameraUpdate(BaseModel):
    """Schema for updating an existing camera."""
    model_config = ConfigDict(protected_namespaces=())

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    stream_url: Optional[str] = Field(None, min_length=1, max_length=1000)
    stream_type: Optional[str] = Field(None)
    username: Optional[str] = Field(None, min_length=1, max_length=255)
    password: Optional[str] = Field(None, min_length=1, max_length=255)
    location_description: Optional[str] = Field(None, max_length=500)
    resolution_width: Optional[int] = Field(None, ge=1, le=7680)
    resolution_height: Optional[int] = Field(None, ge=1, le=4320)
    fps: Optional[float] = Field(None, gt=0, le=240)
    is_active: Optional[bool] = None
    monitoring_enabled: Optional[bool] = None
    detection_enabled: Optional[bool] = None
    tracking_enabled: Optional[bool] = None
    model_version: Optional[str] = None
    hardware_metadata: Optional[Dict[str, Any]] = None


class CameraResponse(BaseModel):
    """Schema for camera response data."""
    model_config = ConfigDict(
        from_attributes=True,
        protected_namespaces=()  # Prevents warning on model_version field
    )
    id: UUID
    venue_id: UUID
    name: str
    stream_url: Optional[str]
    stream_type: str
    location_description: Optional[str]
    resolution_width: Optional[int]
    resolution_height: Optional[int]
    fps: Optional[float]
    is_active: bool
    is_online: bool
    monitoring_enabled: bool
    detection_enabled: bool
    tracking_enabled: bool
    model_version: Optional[str]
    last_heartbeat_at: Optional[datetime]
    last_frame_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    hardware_metadata: Optional[Dict[str, Any]]


class CameraListResponse(BaseModel):
    """Schema for listing cameras with basic info."""

    id: UUID
    name: str
    venue_id: UUID
    is_active: bool
    is_online: bool
    stream_type: str
    last_heartbeat_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class CameraHealthResponse(BaseModel):
    """Schema for camera health status."""

    id: UUID
    name: str
    is_online: bool
    is_active: bool
    monitoring_enabled: bool
    last_heartbeat_at: Optional[datetime]
    last_frame_at: Optional[datetime]
    fps_configured: Optional[float]
    health_status: str  # healthy, degraded, offline, inactive, unknown
    message: str

    model_config = ConfigDict(from_attributes=True)


class CameraAIConfig(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    detection_enabled: bool = True
    tracking_enabled: bool = True
    model_version: Optional[str] = None
    model_config_extra: Optional[Dict[str, Any]] = Field(None, alias="model_config")


class CameraBulkDelete(BaseModel):
    camera_ids: List[UUID]


class HeartbeatRequest(BaseModel):
    """Heartbeat from camera agent."""
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    status: str = Field(default="online")
    fps_current: Optional[float] = Field(None, gt=0, le=240)
    connection_latency_ms: Optional[int] = Field(None, ge=0, le=10000)
    metrics: Optional[Dict[str, Any]] = None

    @validator("status")
    def validate_status(cls, v):
        valid = {"online", "offline", "degraded", "maintenance"}
        if v not in valid:
            raise ValueError(f"Status must be one of: {valid}")
        return v


class CameraStatsResponse(BaseModel):
    id: UUID
    name: str
    total_frames: int
    frames_last_hour: int
    frames_last_day: int
    avg_detections_per_frame: Optional[float]
    uptime_percentage: Optional[float]
    last_heartbeat_at: Optional[datetime]
    last_frame_at: Optional[datetime]
    health_status: str

    model_config = ConfigDict(from_attributes=True)
