from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Tuple

class TrackedVehicle(BaseModel):
    """Represents a single vehicle tracked across frames."""
    track_id: int
    class_name: str
    confidence: float
    bbox: Tuple[float, float, float, float]  # [x1, y1, x2, y2]
    speed_kmh: Optional[float] = None
    acceleration: Optional[float] = None
    trajectory: List[Tuple[float, float]] = Field(default_factory=list) # History of centers

class FlowMetrics(BaseModel):
    """Metrics regarding the overall flow of traffic."""
    avg_speed_kmh: float = 0.0
    vehicle_count: int = 0
    congestion_level: float = 0.0 # 0.0 to 1.0
    density_status: str = "Low" # Low, Medium, High, Critical

class ParkingSlotState(BaseModel):
    """State of an individual parking slot."""
    slot_id: str
    polygon: List[Tuple[float, float]]
    is_occupied: bool
    occupied_duration_sec: float = 0.0

class ParkingState(BaseModel):
    """Aggregate state of parking in the scene."""
    total_slots: int = 0
    occupied_slots: int = 0
    available_slots: int = 0
    slots: Dict[str, ParkingSlotState] = Field(default_factory=dict)

class IncidentEvidence(BaseModel):
    """Structured evidence for an incident."""
    incident_type: str # e.g., "collision", "sudden_stop", "lane_obstruction"
    confidence_score: float # 0.0 to 1.0
    involved_track_ids: List[int]
    description: str
    timestamp: float
    location_bbox: Optional[Tuple[float, float, float, float]] = None
    signals: Dict[str, float] = Field(default_factory=dict) # e.g., {"deceleration_rate": 15.2, "iou": 0.8}

class RoadState(BaseModel):
    """The central intelligence object emitted by the unified pipeline."""
    timestamp: float
    camera_id: str
    vehicles: List[TrackedVehicle] = Field(default_factory=list)
    flow_metrics: FlowMetrics = Field(default_factory=FlowMetrics)
    parking_state: Optional[ParkingState] = None
    active_incidents: List[IncidentEvidence] = Field(default_factory=list)
