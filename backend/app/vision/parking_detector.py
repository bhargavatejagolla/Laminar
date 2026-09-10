"""
Laminar - Parking AI Detector
-----------------------------

Specialized YOLO detector for vehicle monitoring.
Filters for cars, trucks, buses, and motorcycles.
"""

import asyncio
import time
from typing import Tuple, List, Dict, Any, Optional
import numpy as np
import cv2
from datetime import datetime, timezone

from app.core.logging import get_logger

logger = get_logger(__name__)


class AwaitableDict(dict):
    """
    A dictionary subclass that can be awaited if called in an async context,
    or used synchronously as a standard dict.
    """
    def __await__(self):
        async def _resolve():
            return self
        return _resolve().__await__()


class ParkingIntelligence:
    """
    Vehicle-optimized intelligence for Smart Parking (v2.0)
    Consumes VisionState to map vehicles to parking zones.
    """
    def __init__(self):
        self.vehicle_classes = {"car", "truck", "bus", "motorcycle"}
        self._slot_stability = {} # zone_id -> {"current": bool, "pending": bool, "since": float}
        self.STABILITY_SECONDS = 3.0
        
        # ── Standard Parking Zones (Polygons for 640x480) ──
        # Defined as [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
        self.DEFAULT_ZONES = {
            # Top row
            "T1": [[40, 100], [130, 100], [130, 220], [30, 220]],
            "T2": [[150, 100], [240, 100], [240, 220], [140, 220]],
            "T3": [[260, 100], [350, 100], [350, 220], [260, 220]],
            "T4": [[370, 100], [460, 100], [460, 220], [370, 220]],
            "T5": [[480, 100], [570, 100], [570, 220], [480, 220]],
            # Bottom row
            "A1": [[40, 280], [150, 280], [140, 440], [20, 440]],
            "A2": [[160, 280], [270, 280], [270, 440], [150, 440]],
            "A3": [[280, 280], [390, 280], [400, 440], [280, 440]],
            "A4": [[400, 280], [510, 280], [530, 440], [410, 440]],
            "A5": [[520, 280], [620, 280], [635, 440], [540, 440]]
        }
        logger.info(f"ParkingIntelligence initialized with 3s stability buffer.")

    async def detect_vehicles(self, frame: np.ndarray, camera_id: str = "parking-cam") -> Dict[str, Any]:
        """
        Runs vehicle detection and tracking on a single frame using vision_core.
        Returns a dict containing vehicles list, all_detections, count, avg_velocity, and vision_state.
        """
        if frame is None or getattr(frame, "size", 0) == 0:
            return {"count": 0, "vehicles": [], "all_detections": [], "avg_velocity": 0.0}

        try:
            from app.vision.vision_core import vision_core
            vision_state = await vision_core.process_frame(frame, camera_id)
            vehicles = [
                t for t in vision_state.tracks
                if t.get("class_name") in self.vehicle_classes
            ]
            avg_velocity = float(np.mean([v.get("speed_px_s", 0.0) for v in vehicles])) if vehicles else 0.0
            return {
                "count": len(vehicles),
                "vehicles": vehicles,
                "all_detections": vehicles,
                "avg_velocity": avg_velocity,
                "vision_state": vision_state
            }
        except Exception as e:
            logger.error(f"Parking detect_vehicles error: {e}", exc_info=True)
            return {"count": 0, "vehicles": [], "all_detections": [], "avg_velocity": 0.0}

    def _apply_stability(self, zone_id: str, raw_occupied: bool, now: float) -> bool:
        """Applies a 3-second buffer before flipping states to prevent flickering."""
        if zone_id not in self._slot_stability:
            self._slot_stability[zone_id] = {"current": raw_occupied, "pending": raw_occupied, "since": now}
            return raw_occupied
            
        state = self._slot_stability[zone_id]
        
        # If the raw detection matches what we're already pending towards, keep waiting
        if raw_occupied == state["pending"]:
            if raw_occupied != state["current"]:
                if (now - state["since"]) >= self.STABILITY_SECONDS:
                    state["current"] = raw_occupied
        else:
            # The raw detection changed, reset the pending timer
            state["pending"] = raw_occupied
            state["since"] = now
            
        return state["current"]

    def detect_occupancy(
        self,
        input_arg: Any,
        second_arg: Any = None,
        max_slots: Optional[int] = None,
        zones: Optional[Dict] = None,
        is_video: bool = True
    ) -> AwaitableDict:
        """
        Check which zones are occupied by detected vehicles.
        Supports both:
          - (vision_state, zones=None, max_slots=None)
          - (frame, vehicles, max_slots=None)
        Applies State Stability logic on videos, or direct evaluation on static images.
        Returns an AwaitableDict so it can be used synchronously or awaited.
        """
        now = time.time()
        
        # Handle input variations
        if isinstance(input_arg, np.ndarray):
            h, w = input_arg.shape[:2]
            vehicles = second_arg if isinstance(second_arg, list) else []
            if isinstance(second_arg, dict) and zones is None:
                zones = second_arg
        elif hasattr(input_arg, 'frame_shape') and hasattr(input_arg, 'tracks'):
            h, w = input_arg.frame_shape
            vehicles = [t for t in input_arg.tracks if t.get("class_name") in self.vehicle_classes]
            if isinstance(second_arg, dict) and zones is None:
                zones = second_arg
            elif isinstance(second_arg, int) and max_slots is None:
                max_slots = second_arg
        else:
            h, w = (480, 640)
            vehicles = second_arg if isinstance(second_arg, list) else []

        slot_states = AwaitableDict()
        
        # If zones are strictly predefined, use them
        if zones is not None and len(zones) > 0:
            for zone_id, poly_coords in zones.items():
                poly = np.array(poly_coords, dtype=np.int32)
                mask = np.zeros((h, w), dtype=np.uint8)
                cv2.fillPoly(mask, [poly], 1)
                zone_area = np.sum(mask)
                
                raw_occupied = False
                max_ioa = 0.0
                
                for v in vehicles:
                    vx1, vy1, vx2, vy2 = map(int, v["bbox"])
                    v_mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.rectangle(v_mask, (vx1, vy1), (vx2, vy2), 1, -1)
                    intersection = np.logical_and(mask, v_mask)
                    if zone_area > 0:
                        ioa = np.sum(intersection) / zone_area
                        if ioa > 0.15:
                            raw_occupied = True
                            max_ioa = max(max_ioa, ioa)
                    if not raw_occupied:
                        cx, cy = (vx1 + vx2) / 2.0, (vy1 + vy2) / 2.0
                        if cv2.pointPolygonTest(poly, (cx, cy), False) >= 0:
                            raw_occupied = True
                            max_ioa = max(max_ioa, 0.5)
                
                # Apply 3-second stability logic for continuous video; static images evaluate immediately
                if is_video:
                    stable_occupied = self._apply_stability(zone_id, raw_occupied, now)
                else:
                    stable_occupied = raw_occupied
                
                slot_states[zone_id] = {
                    "occupied": stable_occupied,
                    "confidence": max_ioa,
                    "polygon": poly.tolist()
                }
            return slot_states

        # When no specific parking bays or zones are configured:
        # Do NOT invent synthetic parking slots or dynamic capacity.
        # Report honest empty slot states so callers know parking is not configured.
        return slot_states

    def _empty_result(self) -> Dict[str, Any]:
        return {"count": 0, "vehicles": [], "avg_velocity": 0.0}

    def get_current_status(self) -> Dict[str, Any]:
        """Returns raw status for all parking domains in state."""
        from app.core.global_state import GLOBAL_STATE
        return GLOBAL_STATE.get_domain_state("parking")

    async def get_current_insights(self) -> Dict[str, Any]:
        """LAMINAR intelligence layer processing raw state into tactical suggestions."""
        status = self.get_current_status()
        
        total_slots = 0
        total_occupied = 0
        
        warn_pct = 75.0
        crit_pct = 90.0
        
        try:
            from app.core.database import db_manager
            from app.models.venue import Venue as VenueModel
            from uuid import UUID
            first_venue_id = next((cid for cid in status.keys() if cid != "_cameras"), None)
            if first_venue_id:
                async with db_manager.session() as session:
                    venue_obj = await session.get(VenueModel, UUID(first_venue_id))
                    if venue_obj:
                        venue_cap = venue_obj.capacity or 100
                        warn_cnt = venue_obj.warning_threshold
                        crit_cnt = venue_obj.critical_threshold
                        warn_pct = (warn_cnt / venue_cap) * 100 if venue_cap > 0 else 75.0
                        crit_pct = (crit_cnt / venue_cap) * 100 if venue_cap > 0 else 100.0
        except Exception:
            pass
        
        # ── Aggregation Loop: Cameras Only ──
        # Gather only camera feeds to prevent double counting with venue aggregates
        telemetry_sources = []
        for cam_id, cam_data in status.get("_cameras", {}).items():
            telemetry_sources.append((f"CAM-{cam_id[:4]}", cam_data))

        zones = {}
        for source_id, data in telemetry_sources:
            slot_states = data.get("slot_states", {})
            if slot_states:
                # Actual zone-aware tracking
                for zid, s in slot_states.items():
                    total_slots += 1
                    if s.get("occupied"):
                        total_occupied += 1
                    
                    # Store for individual zone list
                    zones[zid] = {
                        "occupancy_pct": 100 if s.get("occupied") else 0,
                        "available": 0 if s.get("occupied") else 1,
                        "capacity": 1,
                        "status": "CRITICAL" if s.get("occupied") else "AVAILABLE"
                    }
            else:
                # Only use fallback if explicit total_slots capacity was specified
                cap = data.get("total_slots", data.get("capacity", 0))
                if cap > 0:
                    occ = data.get("occupied_spots", data.get("occupied", 0))
                    total_slots += cap
                    total_occupied += occ
                    
                    zones[source_id] = {
                        "occupancy_pct": round((occ/cap)*100),
                        "available": max(0, cap - occ),
                        "capacity": cap,
                        "status": "HIGH" if (occ/cap) > 0.8 else "STABLE"
                    }

        if total_slots == 0:
            return {
                "overall": {
                    "configured": False,
                    "occupancy_pct": None,
                    "occupied": None,
                    "capacity": None,
                    "total_slots": None,
                    "total_available": None,
                    "geometry_status": "PARKING GEOMETRY NOT CONFIGURED",
                },
                "suggestion": "PARKING GEOMETRY NOT CONFIGURED",
                "prediction": "No parking zones or cameras mapped in sector.",
                "zones": {},
                "alerts": []
            }

        total_available = max(0, total_slots - total_occupied)
        occupancy_pct = round((total_occupied / total_slots) * 100) if total_slots > 0 else 0

        # Dynamic Decision
        suggestion = f"PARKING STATUS: {total_occupied} spots occupied, {total_available} available."
        prediction = f"Occupancy at {occupancy_pct}% ({total_occupied}/{total_slots})"
        
        if occupancy_pct >= crit_pct:
            suggestion = f"URGENT: Facility crossed critical threshold ({total_occupied}/{total_slots} spots). Trigger lockdown."
            prediction = "Gridlock imminent."
        elif occupancy_pct >= warn_pct:
            suggestion = f"WARNING: {total_occupied} cars detected. Capacity crossed {int(warn_pct)}%."
            prediction = "Sustained influx."

        return {
            "overall": {
                "configured": True,
                "occupancy_pct": occupancy_pct,
                "occupied": total_occupied,
                "capacity": total_slots,
                "total_slots": total_slots,
                "total_available": total_available,
            },
            "suggestion": suggestion,
            "prediction": prediction,
            "zones": zones,
            "alerts": ["High demand detected in Zone A"] if occupancy_pct > 75 else []
        }

# Singleton instance
_parking_detector = None
def get_parking_detector():
    global _parking_detector
    if _parking_detector is None:
        _parking_detector = ParkingIntelligence()
    return _parking_detector

class LazyParkingDetector:
    def __getattr__(self, name):
        return getattr(get_parking_detector(), name)

parking_detector = LazyParkingDetector()
ParkingDetector = ParkingIntelligence

