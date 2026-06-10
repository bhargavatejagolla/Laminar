"""
Laminar - Parking Worker
------------------------

Pipeline for real-time parking monitoring.
Updates Global State and triggers alerts.
"""

import asyncio
import cv2
import numpy as np
import time
from typing import Optional, Any
from uuid import UUID
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.vision.parking_detector import ParkingDetector
from app.core.global_state import GLOBAL_STATE
from app.services.sms_alert_service import SmsAlertService
from app.core.database import db_manager
from app.models.user import User
from sqlalchemy import select, update
from app.services.notification_service import notification_service

logger = get_logger(__name__)

class ParkingWorker:
    """
    Dedicated worker for a single parking camera.
    """

    def __init__(self, camera_id: UUID, venue_id: UUID, source: Any):
        self.camera_id = camera_id
        self.venue_id = venue_id
        self.source = source
        self.detector = ParkingDetector()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._cached_frame_bytes: Optional[bytes] = None  # For MJPEG streaming
        self._heatmap: Optional[np.ndarray] = None        # Accumulated heatmap
        self._last_occupancy: int = 0
        self._last_status: str = "ok" # ok, warning, critical
        self._last_detection_time: float = 0.0
        self.injected_frame: Optional[np.ndarray] = None

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"ParkingWorker started for camera {self.camera_id}")

    async def stop(self):
        self._running = False
        if hasattr(self, '_detection_task') and self._detection_task:
            self._detection_task.cancel()
        if self._task:
            await self._task
        if hasattr(self.source, 'stop'):
            self.source.stop()
        logger.info(f"ParkingWorker stopped for camera {self.camera_id}")

    async def _run_loop(self):
        """
        High-performance frame reading loop.
        Decouples frame acquisition from expensive AI detection.
        """
        self.last_annotated_frame = None
        self._last_result = None
        self._detection_in_progress = False

        # Start detection task in the background
        self._detection_task = asyncio.create_task(self._detection_loop())

        while self._running:
            try:
                # ── Frame acquisition ──
                if self.injected_frame is not None:
                    frame = self.injected_frame.copy()
                    await asyncio.sleep(0.033) # Simulate 30 fps
                else:
                    try:
                        read_result = await asyncio.wait_for(self.source.read(), timeout=1.0)
                        if read_result is None:
                            await asyncio.sleep(0.5)
                            continue
                        ret, frame = read_result
                        if not ret or frame is None:
                            await asyncio.sleep(0.5)
                            continue
                    except asyncio.TimeoutError:
                        await asyncio.sleep(1.0)
                        continue
                
                # ── Update HUD / Overlays with LATEST result (not necessarily current frame) ──
                if self._last_result:
                    annotated = frame.copy()
                    vehicles = self._last_result.get("vehicles", [])
                    for v in vehicles:
                        car = v["bbox"]
                        pt1 = (int(car[0]), int(car[1]))
                        pt2 = (int(car[2]), int(car[3]))
                        conf = v.get("confidence", 0)
                        vtype = v.get("type", "vehicle").upper()
                        cv2.rectangle(annotated, pt1, pt2, (20, 20, 220), 2)
                        label = f"{vtype} {conf*100:.0f}%"
                        cv2.putText(annotated, label, (pt1[0], pt1[1]-5),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                    self.last_annotated_frame = annotated

                # ── Store frame for background detector ──
                self._current_raw_frame = frame.copy()

                # ── Always update cache for MJPEG stream ──
                frame_to_encode = self.last_annotated_frame if self.last_annotated_frame is not None else frame
                try:
                    _, jpeg = cv2.imencode('.jpg', frame_to_encode, [cv2.IMWRITE_JPEG_QUALITY, 65])
                    self._cached_frame_bytes = jpeg.tobytes()
                except Exception as enc_err:
                    logger.warning(f"JPEG encode error: {enc_err}")

                # Update Camera Health in DB (sampled to reduce load)
                if time.time() % 10 < 0.1:
                    try:
                        async with db_manager.session() as session:
                            from app.models.camera import Camera
                            from sqlalchemy import update as sa_update
                            stmt = (
                                sa_update(Camera)
                                .where(Camera.id == self.camera_id)
                                .values(is_online=True, last_frame_at=datetime.now(timezone.utc))
                            )
                            await session.execute(stmt)
                            await session.commit()
                    except Exception: pass

                await asyncio.sleep(0.01)

            except Exception as e:
                logger.error(f"ParkingWorker loop error: {e}")
                await asyncio.sleep(1)

    async def _detection_loop(self):
        """Dedicated background task for AI inference."""
        detection_interval = 0.05 # 2 Hz for better responsiveness
        while self._running:
            try:
                if hasattr(self, '_current_raw_frame') and self._current_raw_frame is not None:
                    frame = self._current_raw_frame.copy()
                    
                    # 1. Run vehicle detection
                    result = await self.detector.detect_vehicles(frame.copy(), str(self.camera_id))
                    self._last_result = result
                    vehicles = result.get("vehicles", [])
                    
                    # 2. Run zone occupancy detection
                    slot_states = await self.detector.detect_occupancy(frame, vehicles)
                    occupancy = sum(1 for s in slot_states.values() if s["occupied"])
                    
                    # Push events for reports and SSE stream will be handled below after DB fetch
                    
                    # ── Advanced YOLO & Zone Visualization ────────────────────
                    overlay = frame.copy()
                    
                    # Draw SHADED ZONES (The "Shaded Part")
                    for zone_id, state in slot_states.items():
                        poly = np.array(state["polygon"], dtype=np.int32)
                        color = (0, 0, 200) if state["occupied"] else (0, 200, 0) # BGR
                        cv2.fillPoly(overlay, [poly], color)
                        
                        # Add Zone Label
                        center = np.mean(poly, axis=0).astype(int)
                        cv2.putText(frame, zone_id, (center[0]-10, center[1]), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,255), 1)

                    # Draw VEHICLE BOXES
                    for v in vehicles:
                        car = v["bbox"]
                        pt1 = (int(car[0]), int(car[1]))
                        pt2 = (int(car[2]), int(car[3]))
                        conf = v.get("confidence", 0)
                        
                        # Translucent filled box for car
                        cv2.rectangle(overlay, pt1, pt2, (20, 20, 220), -1)
                        # Solid border
                        cv2.rectangle(frame, pt1, pt2, (0, 255, 255), 2)
                        
                        label = f"CAR {conf*100:.0f}%"
                        cv2.putText(frame, label, (pt1[0], pt1[1]-5),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

                    # Heatmap accumulation
                    try:
                        gray_mask = np.zeros(frame.shape[:2], dtype=np.float32)
                        for v in vehicles:
                            car = v["bbox"]
                            x1,y1,x2,y2 = map(int, car)
                            x1,y1 = max(0,x1),max(0,y1)
                            x2,y2 = min(frame.shape[1]-1,x2),min(frame.shape[0]-1,y2)
                            if x2>x1 and y2>y1:
                                gray_mask[y1:y2, x1:x2] += v.get("confidence", 0.5)
                        if self._heatmap is None or self._heatmap.shape != gray_mask.shape:
                            self._heatmap = gray_mask
                        else:
                            self._heatmap = np.clip(self._heatmap * 0.97 + gray_mask, 0, 255)
                    except Exception: pass

                    # Blend overlay (shading)
                    annotated = cv2.addWeighted(overlay, 0.3, frame, 0.7, 0)
                    self.last_annotated_frame = annotated

                    # ── Live Mesh Notifications / Global State ────────────────
                    try:
                        async with db_manager.session() as session:
                            from app.models.venue import Venue as VenueModel
                            venue_obj = await session.get(VenueModel, self.venue_id)
                            if venue_obj:
                                warn_cnt = venue_obj.warning_threshold
                                crit_cnt = venue_obj.critical_threshold
                                venue_cap = venue_obj.capacity or 100
                                warn_pct = 75.0
                                crit_pct = 100.0

                                capacity = len(slot_states) # Dynamic from zones
                                occupancy_pct = (occupancy / capacity) * 100 if capacity > 0 else 0
                                
                                # Global State Update
                                GLOBAL_STATE.update(
                                    domain="parking",
                                    venue_id=str(self.venue_id),
                                    payload={
                                        "venue_id": str(self.venue_id),
                                        "occupied_spots": occupancy,
                                        "total_slots": capacity,
                                        "available_slots": max(0, capacity - occupancy),
                                        "camera_id": str(self.camera_id),
                                        "slot_states": slot_states # Real states
                                    }
                                )

                                # Push events for reports, SSE, and Emails
                                try:
                                    # We only want to generate the screenshot IF the state is going to change.
                                    # Calculate risk level identical to push_parking_event
                                    warn_pct = (warn_cnt / capacity) * 100 if capacity > 0 else 75.0
                                    crit_pct = (crit_cnt / capacity) * 100 if capacity > 0 else 100.0
                                    calc_occ_pct = occupancy_pct
                                    risk_level = "low"
                                    if calc_occ_pct >= crit_pct: risk_level = "critical"
                                    elif calc_occ_pct >= warn_pct: risk_level = "high"
                                    elif calc_occ_pct >= warn_pct * 0.75: risk_level = "medium"
                                    
                                    from app.api.v1.endpoints.parking import _last_alert_state
                                    last_state = _last_alert_state.get(str(self.camera_id), "low")
                                    
                                    screenshot_path = None
                                    if risk_level != last_state and risk_level != "low":
                                        rel_path = f"screenshots/parking/live_{int(time.time())}.jpg"
                                        import os
                                        os.makedirs(os.path.dirname(rel_path), exist_ok=True)
                                        abs_path = os.path.abspath(rel_path)
                                        _, jpeg = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                                        with open(abs_path, "wb") as f:
                                            f.write(jpeg.tobytes())
                                        screenshot_path = abs_path
                                        
                                    from app.api.v1.endpoints.parking import push_parking_event
                                    push_parking_event(
                                        camera_id=str(self.camera_id),
                                        vehicles=vehicles,
                                        frame_shape=frame.shape,
                                        venue_id=str(self.venue_id) if hasattr(self, 'venue_id') else None,
                                        occupancy_pct=occupancy_pct,
                                        capacity=capacity,
                                        occupancy=occupancy,
                                        warn_thresh_override=warn_cnt,
                                        crit_thresh_override=crit_cnt,
                                        venue_name_override=venue_obj.name,
                                        lat_override=venue_obj.latitude,
                                        lng_override=venue_obj.longitude,
                                        screenshot_path=screenshot_path
                                    )
                                except Exception as e:
                                    logger.error(f"Failed to push parking event: {e}")
                    except Exception: pass

                # Update Camera Health in DB (Every detection cycle)
                try:
                    async with db_manager.session() as session:
                        from app.models.camera import Camera
                        stmt = (
                            update(Camera)
                            .where(Camera.id == self.camera_id)
                            .values(
                                is_online=True,
                                last_frame_at=datetime.now(timezone.utc)
                            )
                        )
                        await session.execute(stmt)
                        await session.commit()
                except Exception as herr:
                    logger.error(f"Failed to update camera health: {herr}")

                await asyncio.sleep(detection_interval)
            except Exception as e:
                logger.error(f"Detection loop error: {e}")
                await asyncio.sleep(1)

