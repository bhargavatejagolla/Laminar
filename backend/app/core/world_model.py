"""
LAMINAR - World Model
---------------------

The World Model acts as the digital twin of the road network.
Instead of treating each camera detection as an isolated metric, the World Model
places detections onto a geographic topology (nodes, edges, zones).

This allows LAMINAR to understand causal relationships, such as an accident at
Node A causing a traffic queue that propagates upstream to Node B.
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.global_state import GLOBAL_STATE

@dataclass
class RoadSegment:
    id: str
    name: str
    upstream_nodes: List[str]
    downstream_nodes: List[str]
    capacity: int  # Max vehicles before critical congestion
    length_m: float # Length in meters

@dataclass
class ParkingZone:
    id: str
    name: str
    capacity: int
    connected_segments: List[str]

class LaminarWorldModel:
    """
    Maintains the topological reality of the city.
    """
    def __init__(self):
        # Hardcoded realistic hackathon topology
        self.segments: Dict[str, RoadSegment] = {
            "seg_eastbound_01": RoadSegment(
                id="seg_eastbound_01", name="Eastbound Corridor (J03 to J04)",
                upstream_nodes=[], downstream_nodes=["seg_eastbound_02"],
                capacity=50, length_m=400.0
            ),
            "seg_eastbound_02": RoadSegment(
                id="seg_eastbound_02", name="Eastbound Corridor (J04 to J05)",
                upstream_nodes=["seg_eastbound_01"], downstream_nodes=[],
                capacity=50, length_m=450.0
            ),
            "seg_north_01": RoadSegment(
                id="seg_north_01", name="North Avenue Alternative",
                upstream_nodes=["seg_eastbound_01"], downstream_nodes=[],
                capacity=80, length_m=600.0
            )
        }
        
        self.parking_zones: Dict[str, ParkingZone] = {
            "zone_b": ParkingZone(id="zone_b", name="Parking Zone B", capacity=200, connected_segments=["seg_eastbound_02"]),
            "zone_c": ParkingZone(id="zone_c", name="Parking Zone C", capacity=350, connected_segments=["seg_north_01"])
        }

        # Mapping logical cameras to segments
        self.camera_map = {
            "cam_j04": "seg_eastbound_01",
            "cam_j05": "seg_eastbound_02",
            "upload-demo": "seg_eastbound_01", # Assume uploaded videos represent J04
            "upload_demo": "seg_eastbound_01"
        }

    def get_current_reality(self) -> Dict[str, Any]:
        """
        Aggregates raw GLOBAL_STATE into a topological reality view.
        """
        traffic_data = GLOBAL_STATE.get_domain_state("traffic")
        incident_data = GLOBAL_STATE.get_domain_state("incident")
        parking_data = GLOBAL_STATE.get_domain_state("parking")

        reality = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "segments": {},
            "zones": {},
            "active_incidents": []
        }

        # 1. Map incidents to segments
        for cam_id, i_data in incident_data.get("_cameras", {}).items():
            if i_data.get("active", False):
                seg_id = self.camera_map.get(cam_id, "seg_eastbound_01")
                reality["active_incidents"].append({
                    "id": f"INC-{cam_id}",
                    "type": i_data.get("type", "Accident"),
                    "segment": seg_id,
                    "confidence": i_data.get("confidence", 90),
                    "impact_severity": i_data.get("severity", "HIGH")
                })

        # 2. Map traffic flow to segments
        for seg_id, seg in self.segments.items():
            reality["segments"][seg_id] = {
                "name": seg.name,
                "vehicles": 0,
                "speed_px_s": 100.0,
                "status": "CLEAR",
                "queue_length_m": 0.0,
                "incidents": [inc for inc in reality["active_incidents"] if inc["segment"] == seg_id]
            }

        for cam_id, t_data in traffic_data.items():
            if cam_id == "_cameras": continue
            seg_id = self.camera_map.get(cam_id, "seg_eastbound_01")
            
            if seg_id in reality["segments"]:
                reality["segments"][seg_id]["vehicles"] += t_data.get("count", 0)
                # Weighted speed average could be complex, just take min speed as bottleneck
                current_speed = reality["segments"][seg_id]["speed_px_s"]
                new_speed = t_data.get("avg_velocity", 100.0)
                reality["segments"][seg_id]["speed_px_s"] = min(current_speed, new_speed)

        # Calculate logical queue length
        for seg_id, s_data in reality["segments"].items():
            v_count = s_data["vehicles"]
            seg_cap = self.segments[seg_id].capacity
            
            if v_count > seg_cap * 0.8 or s_data["incidents"]:
                s_data["status"] = "CONGESTED"
                # Roughly 6 meters per queued vehicle
                s_data["queue_length_m"] = min(v_count * 6.0, self.segments[seg_id].length_m)
            elif v_count > seg_cap * 0.5:
                s_data["status"] = "HEAVY"

        # 3. Map parking
        for zone_id, zone in self.parking_zones.items():
            p_data = parking_data.get(zone_id, {})
            occ = p_data.get("occupancy", 0)
            reality["zones"][zone_id] = {
                "name": zone.name,
                "occupancy": occ,
                "capacity": zone.capacity,
                "fill_rate": occ / zone.capacity if zone.capacity > 0 else 0
            }

        return reality

# Global World Model Singleton
WORLD_MODEL = LaminarWorldModel()
