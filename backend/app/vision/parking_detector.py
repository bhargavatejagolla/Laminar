"""
Laminar - Parking AI Detector
-----------------------------

Specialized YOLO detector for vehicle monitoring.
Filters for cars, trucks, buses, and motorcycles.
"""

import asyncio
from typing import Tuple, List, Dict, Any, Optional
import numpy as np
import cv2
from datetime import datetime, timezone

from app.core.logging import get_logger

logger = get_logger(__name__)


class ParkingDetector:
    """
    Vehicle-optimized detector for Smart Parking.
    Uses COCO classes: 2 (car), 3 (motorcycle), 5 (bus), 7 (truck).
    """
    _model_cache = {}
    _load_lock = asyncio.Lock()

    def __init__(self, model_name: str = "yolov8x.pt", conf: float = 0.15, iou: float = 0.45):
        self.model_name = model_name
        self.conf = conf
        self.iou = iou
        self.device = "cpu"
        self.model = None
        # COCO vehicle class IDs: 2=car, 3=motorcycle, 5=bus, 7=truck
        self.vehicle_class_ids = [2, 3, 5, 7]
        self.vehicle_classes = self.vehicle_class_ids  # Only detect vehicles (no chairs, suitcases, etc.)
        self.vehicle_display_classes = {"car", "truck", "bus", "motorcycle"}
        self._prev_centroids = {}
        self._last_frame_time = {}
        
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
        logger.info(f"ParkingDetector instance created with {len(self.DEFAULT_ZONES)} default zones.")

    async def detect_occupancy(self, frame: np.ndarray, vehicles: List[Dict], zones: Optional[Dict] = None, max_slots: Optional[int] = None) -> Dict[str, Any]:
        """
        Check which zones are occupied by detected vehicles.
        Uses IoA (Intersection over Area) to map vehicles to bays.
        """
        h, w = frame.shape[:2]
        is_default = False

        if zones is None:
            if max_slots and max_slots > 0 and max_slots <= 10:
                zones = {}
                w_per_slot = w / max_slots
                pad = w_per_slot * 0.1
                y1 = int(h * 0.35)
                y2 = int(h * 0.85)
                for i in range(max_slots):
                    x1 = int(i * w_per_slot + pad)
                    x2 = int((i + 1) * w_per_slot - pad)
                    zones[f"T{i+1}"] = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
            else:
                zones = self.DEFAULT_ZONES
                is_default = True
            
        slot_states = {}
        
        for zone_id, poly_coords in zones.items():
            # Dynamically scale polygons if resolution deviates from expected 640x480 baseline
            poly = np.array(poly_coords, dtype=np.float32)
            if is_default:
                poly[:, 0] *= (w / 640.0)
                poly[:, 1] *= (h / 480.0)
            poly = poly.astype(np.int32)
            
            # Create mask for this zone to calculate its area
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.fillPoly(mask, [poly], 1)
            zone_area = np.sum(mask)
            
            is_occupied = False
            max_ioa = 0.0
            
            for v in vehicles:
                bbox = v["bbox"] # [x1, y1, x2, y2]
                vx1, vy1, vx2, vy2 = map(int, bbox)
                
                # ── Method 1: IoA (Intersection over Zone Area) ──
                # Lowered to 0.15 for top-down views where bboxes are small
                v_mask = np.zeros((h, w), dtype=np.uint8)
                cv2.rectangle(v_mask, (vx1, vy1), (vx2, vy2), 1, -1)
                
                intersection = np.logical_and(mask, v_mask)
                intersection_area = np.sum(intersection)
                
                if zone_area > 0:
                    ioa = intersection_area / zone_area
                    if ioa > 0.15:  # 15% overlap threshold (was 40% — too strict for top-down)
                        is_occupied = True
                        max_ioa = max(max_ioa, ioa)
                
                # ── Method 2: Centroid-in-Polygon fallback ──
                # If vehicle center point is inside the zone polygon, mark occupied
                if not is_occupied:
                    cx = (vx1 + vx2) / 2.0
                    cy = (vy1 + vy2) / 2.0
                    if cv2.pointPolygonTest(poly, (cx, cy), False) >= 0:
                        is_occupied = True
                        max_ioa = max(max_ioa, 0.5)  # Synthetic confidence for centroid hit
            
            slot_states[zone_id] = {
                "occupied": is_occupied,
                "confidence": max_ioa,
                "polygon": poly.tolist()
            }
            
        return slot_states

    async def _ensure_model(self):
        """Ensures the YOLO model is loaded into the class-level cache."""
        if self.model is not None:
            return
        
        async with ParkingDetector._load_lock:
            if self.model_name not in ParkingDetector._model_cache:
                logger.info(f"LAZY LOAD: Initializing YOLO model {self.model_name}...")
                # Run the blocking YOLO load in an executor
                from ultralytics import YOLO
                loop = asyncio.get_event_loop()
                model = await loop.run_in_executor(None, YOLO, self.model_name)
                ParkingDetector._model_cache[self.model_name] = model
                logger.info(f"LAZY LOAD: {self.model_name} loaded successfully.")
            
            self.model = ParkingDetector._model_cache[self.model_name]
            self.model.to(self.device)

    async def detect_vehicles(self, frame: np.ndarray, camera_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Detect vehicles and return count + metadata.
        """
        await self._ensure_model()
        import time
        if frame is None or frame.size == 0:
            return {"count": 0, "vehicles": [], "avg_velocity": 0.0}

        try:
            # Run blocking inference in executor
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None, 
                lambda: self.model.predict(
                    source=frame,
                    conf=self.conf,
                    iou=self.iou,
                    classes=self.vehicle_classes,
                    device=self.device,
                    imgsz=1024,
                    verbose=False
                )
            )
            
            result = results[0]
            boxes = result.boxes
            
            all_detections = []
            current_centroids = []
            if boxes is not None:
                for box in boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    xyxy = box.xyxy[0].cpu().numpy().tolist()
                    cw_box = box.xywh[0].cpu().numpy().tolist()
                    current_centroids.append((cw_box[0], cw_box[1]))
                    cls_name = self.model.names[cls_id]
                    all_detections.append({
                        "type": cls_name,
                        "confidence": conf,
                        "bbox": xyxy,
                        "is_vehicle": cls_name in self.vehicle_display_classes
                    })
            
            # Since we now restrict YOLO to vehicle_class_ids, all_detections are already vehicles.
            # vehicles = display list (same), all_detections = zone math list
            vehicles = [d for d in all_detections if d["is_vehicle"]]

            # Velocity Estimation (Pixel shift per second)
            avg_velocity = 0.0
            if camera_id and camera_id in self._prev_centroids and self._prev_centroids[camera_id]:
                prev = self._prev_centroids[camera_id]
                prev_time = self._last_frame_time.get(camera_id, time.time() - 0.5)
                dt = time.time() - prev_time
                
                if dt > 0:
                    shifts = []
                    for cx, cy in current_centroids:
                        dists = [np.sqrt((cx-px)**2 + (cy-py)**2) for px, py in prev]
                        if dists and min(dists) < 100:
                            shifts.append(min(dists))
                    
                    if shifts:
                        avg_velocity = (sum(shifts) / len(shifts)) / dt
            
            # Update state
            if camera_id:
                self._prev_centroids[camera_id] = current_centroids
                self._last_frame_time[camera_id] = time.time()
            
            return {
                "count": len(all_detections),
                "vehicles": vehicles,          # Vehicle-only (for display log)
                "all_detections": all_detections,  # All hits (for zone occupancy math)
                "avg_velocity": round(avg_velocity, 2),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        except Exception as e:
            logger.error(f"Parking detection error: {e}")
            return {"count": 0, "vehicles": [], "avg_velocity": 0.0}

    async def process_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Draws vehicle detections on the frame for visual feedback in Smart Parking.
        Used by the live feed API.
        """
        res = await self.detect_vehicles(frame)
        vehicles = res.get("vehicles", [])
        
        for vehicle in vehicles:
            box = vehicle["bbox"]
            conf = vehicle["confidence"]
            v_type = vehicle["type"]
            
            # Draw box
            p1 = (int(box[0]), int(box[1]))
            p2 = (int(box[2]), int(box[3]))
            cv2.rectangle(frame, p1, p2, (0, 255, 0), 2)
            
            # Label
            label = f"{v_type} {conf:.2f}"
            cv2.putText(frame, label, (p1[0], p1[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            
        return frame

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
        
        # ── Aggregation Loop: Venues and Cameras ──
        # Gather all contributing data sources (venues and per-camera feeds)
        telemetry_sources = []
        for key, val in status.items():
            if key == "_cameras":
                for cam_id, cam_data in val.items():
                    telemetry_sources.append((f"CAM-{cam_id[:4]}", cam_data))
            elif isinstance(val, dict):
                telemetry_sources.append((key, val))

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
                # Fallback for cameras/venues without defined zones (counting-based)
                occ = data.get("occupied_spots", data.get("occupied", 0))
                cap = data.get("total_slots", data.get("capacity", 10))
                total_slots += cap
                total_occupied += occ
                
                # Zone name fallback using source ID
                zones[source_id] = {
                    "occupancy_pct": round((occ/cap)*100) if cap > 0 else 0,
                    "available": max(0, cap - occ),
                    "capacity": cap,
                    "status": "HIGH" if (occ/cap) > 0.8 else "STABLE"
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
        _parking_detector = ParkingDetector()
    return _parking_detector

class LazyParkingDetector:
    def __getattr__(self, name):
        return getattr(get_parking_detector(), name)

parking_detector = LazyParkingDetector()

