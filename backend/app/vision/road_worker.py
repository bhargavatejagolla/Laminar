"""
Laminar - Road Intelligence Worker (Unified Engine)
---------------------------------------------------

Consolidated pipeline for real-time roads monitoring:
- Traffic Flow & Velocity (Density & Speed tracking)
- Parking Intelligence (Occupancy in zones)
- Tactical Alerts (Anomalies, collisions)

Processes each frame exactly ONCE through the YOLO neural net to eliminate lag.
"""

import asyncio
import cv2
import numpy as np
import time
from typing import Optional, Any, Dict
from uuid import UUID
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.vision.traffic_detector import traffic_detector
from app.vision.parking_detector import ParkingDetector, parking_detector
from app.vision.incident_detector import incident_detector
from app.core.global_state import GLOBAL_STATE
from app.core.database import db_manager
from sqlalchemy import update
from app.services.notification_service import notification_service

logger = get_logger(__name__)

from app.vision.vision_core import vision_core

class RoadIntelligenceWorker:
    """
    Dedicated unified worker for a single road/traffic camera (v2.0 Dual-Path Architecture).
    Handles Video Streaming separately from AI Processing.
    """

    def __init__(self, camera_id: UUID, venue_id: UUID, source: Any):
        self.camera_id = camera_id
        self.venue_id = venue_id
        self.source = source
        
        # Core intelligence engines (No YOLO models loaded in these anymore)
        self.traffic_intel = traffic_detector
        self.parking_intel = parking_detector
        self.incident_intel = incident_detector
        
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._cached_frame_bytes: Optional[bytes] = None
        
        # State tracking for annotations
        self._last_traffic_result: Optional[dict] = None
        self._last_parking_result: Optional[dict] = None
        
        self.injected_frame: Optional[np.ndarray] = None

    async def start(self):
        if self._running: return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"RoadIntelligenceWorker started for camera {self.camera_id}")

    async def stop(self):
        self._running = False
        if hasattr(self, "_detection_task") and self._detection_task:
            self._detection_task.cancel()
        if self._task:
            self._task.cancel()
        if hasattr(self.source, "stop"):
            self.source.stop()
        logger.info(f"RoadIntelligenceWorker stopped for camera {self.camera_id}")

    async def _run_loop(self):
        """
        PATH 1: STREAM
        High-performance frame reading loop. 
        Serves MJPEG stream directly, totally unaffected by AI lag.
        """
        self._detection_task = asyncio.create_task(self._detection_loop())

        while self._running:
            try:
                # 1. Frame Acquisition
                if self.injected_frame is not None:
                    frame = self.injected_frame.copy()
                    await asyncio.sleep(0.033)
                else:
                    try:
                        read_result = await asyncio.wait_for(self.source.read(), timeout=1.0)
                        if not read_result or read_result[1] is None:
                            await asyncio.sleep(0.1)
                            continue
                        ret, frame = read_result
                    except asyncio.TimeoutError:
                        await asyncio.sleep(0.5)
                        continue

                # Pass a copy to the AI buffer safely
                self._current_raw_frame = frame.copy()

                # 2. Annotation & Rendering (Optional for debugging, using LAST KNOWN state)
                annotated = frame.copy()
                
                # Render Parking Zones
                if self._last_parking_result and "slot_states" in self._last_parking_result:
                    for zone_id, state in self._last_parking_result["slot_states"].items():
                        poly = np.array(state["polygon"], dtype=np.int32)
                        color = (0, 0, 200) if state["occupied"] else (0, 200, 0)
                        cv2.fillPoly(annotated, [poly], color)
                        # Blend for shading effect
                        annotated = cv2.addWeighted(annotated, 0.7, frame, 0.3, 0)

                # Render Vehicles
                if self._last_traffic_result and "vehicles" in self._last_traffic_result:
                    for v in self._last_traffic_result["vehicles"]:
                        x1, y1, x2, y2 = [int(p) for p in v["bbox"]]
                        speed = v.get("speed_px_s", 0.0)
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 255), 2)
                        cv2.putText(annotated, f"CAR {speed:.0f}px/s", (x1, max(0, y1-5)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

                # 3. Cache for MJPEG stream immediately
                try:
                    _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 65])
                    self._cached_frame_bytes = jpeg.tobytes()
                except Exception: pass

                # 4. DB Health Ping
                if time.time() % 10 < 0.1:
                    try:
                        async with db_manager.session() as session:
                            from app.models.camera import Camera
                            from sqlalchemy import update as sa_update
                            stmt = sa_update(Camera).where(Camera.id == self.camera_id).values(is_online=True, last_frame_at=datetime.now(timezone.utc))
                            await session.execute(stmt)
                            await session.commit()
                    except Exception: pass

                await asyncio.sleep(0.01)

            except Exception as e:
                logger.error(f"RoadWorker loop error: {e}")
                await asyncio.sleep(1)

    async def _detection_loop(self):
        """
        PATH 2 & 3: PERCEPTION & INTELLIGENCE
        Runs asynchronously. Takes frames from the buffer, runs Vision Core,
        and distributes VisionState to intelligence engines.
        """
        while self._running:
            try:
                if hasattr(self, '_current_raw_frame') and self._current_raw_frame is not None:
                    frame = self._current_raw_frame.copy()

                    # ==========================================
                    # PATH 2: PERCEPTION (Vision Core)
                    # ==========================================
                    vision_state = await vision_core.process_frame(frame, str(self.camera_id))
                    
                    if not vision_state or not vision_state.tracks:
                        await asyncio.sleep(0.1)
                        continue

                    # ==========================================
                    # PATH 3: INTELLIGENCE
                    # ==========================================
                    
                    # 3A. Traffic Intelligence
                    traffic_result = self.traffic_intel.analyze_traffic(vision_state)
                    self._last_traffic_result = traffic_result

                    # 3B. Parking Intelligence
                    slot_states = self.parking_intel.detect_occupancy(vision_state)
                    occupancy = sum(1 for s in slot_states.values() if s["occupied"])
                    capacity = len(slot_states)
                    self._last_parking_result = {"slot_states": slot_states, "occupancy": occupancy, "capacity": capacity}

                    # 3C. Incident Intelligence
                    incidents = self.incident_intel.analyze_incidents(vision_state, frame_hsv=cv2.cvtColor(frame, cv2.COLOR_BGR2HSV))

                    # ==========================================
                    # GLOBAL STATE PUBLISHING
                    # ==========================================
                    venue_lat, venue_lng, venue_name = 0.0, 0.0, "Unknown Venue"
                    try:
                        async with db_manager.session() as session:
                            from app.models.venue import Venue as VenueModel
                            v_obj = await session.get(VenueModel, self.venue_id)
                            if v_obj:
                                venue_lat, venue_lng, venue_name = float(v_obj.latitude or 0.0), float(v_obj.longitude or 0.0), v_obj.name
                    except Exception: pass

                    # Publish Traffic
                    GLOBAL_STATE.update(
                        domain="traffic", venue_id=str(self.venue_id),
                        payload={
                            "venue_id": str(self.venue_id), "camera_id": str(self.camera_id),
                            "count": traffic_result["count"], "density": traffic_result["density"],
                            "avg_velocity": traffic_result.get("avg_velocity", 0.0),
                            "risk_score": traffic_result.get("risk_score", 0),
                            "last_updated": traffic_result["timestamp"],
                        }
                    )
                    try:
                        from app.api.v1.endpoints.traffic import push_traffic_event
                        push_traffic_event(str(self.camera_id), traffic_result["count"], traffic_result["density"], traffic_result.get("avg_velocity", 0.0), 0.0, traffic_result.get("risk_score", 0), str(self.venue_id))
                    except Exception: pass

                    # Publish Parking
                    GLOBAL_STATE.update(
                        domain="parking", venue_id=str(self.venue_id),
                        payload={
                            "venue_id": str(self.venue_id), "camera_id": str(self.camera_id),
                            "occupied_spots": occupancy, "total_slots": capacity,
                            "available_slots": max(0, capacity - occupancy),
                            "slot_states": slot_states
                        }
                    )
                    try:
                        from app.api.v1.endpoints.parking import push_parking_event
                        push_parking_event(
                            camera_id=str(self.camera_id), vehicles=vision_state.tracks, frame_shape=frame.shape,
                            venue_id=str(self.venue_id), occupancy_pct=(occupancy/capacity*100) if capacity > 0 else 0,
                            capacity=capacity, occupancy=occupancy
                        )
                    except Exception: pass

                    # Publish Incidents
                    if incidents:
                        for inc in incidents:
                            if inc["priority"] in ["HIGH", "CRITICAL"]:
                                asyncio.create_task(self._process_incident(inc, venue_name))

                # Rate limit AI loop independent of stream loop
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(f"Unified Detection loop error: {e}")
                await asyncio.sleep(1)

    async def _process_incident(self, inc, venue_name):
        try:
            await notification_service.push_notification(
                domain="incident", type=inc["type"], priority=inc["priority"],
                description=inc["description"], venue_id=str(self.venue_id),
                venue_name=venue_name, metadata={"camera_id": str(self.camera_id)}
            )
        except Exception: pass
