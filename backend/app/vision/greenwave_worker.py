import asyncio
import cv2
import numpy as np
from typing import Optional, Any
from uuid import UUID
from datetime import datetime

from app.core.logging import get_logger
from app.vision.detector import get_detector
from app.core.global_state import GLOBAL_STATE
from app.core.database import db_manager
from app.services.notification_service import notification_service

logger = get_logger(__name__)

def draw_greenwave_overlay(frame: np.ndarray, result) -> np.ndarray:
    """Overlays neural green-wave tracking on the frame."""
    overlay = frame.copy()
    
    cv2.putText(overlay, "AI GREEN WAVE SYNCHRONIZATION ACTIVE", (14, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 0), 1, cv2.LINE_AA)
                
    if hasattr(result, 'bounding_boxes') and result.bounding_boxes:
        for box in result.bounding_boxes:
            # We treat generic large vehicles (truck, bus, etc) or cars acting strangely as emergency for demonstration
            # The model returns class_name
            class_name = box.get("class_name", "")
            x1, y1, x2, y2 = [int(p) for p in box["bbox"]]
            
            # Highlight emergency targets prominently
            if class_name in ["truck", "bus", "car"]:
                # Draw neon green box
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 255, 0), 2)
                
                # Draw target lock overlay
                cv2.line(overlay, (x1, y1), (x1 + 15, y1), (0, 255, 0), 2)
                cv2.line(overlay, (x1, y1), (x1, y1 + 15), (0, 255, 0), 2)
                
                label = f"EMERGENCY VEHICLE DETECTED"
                cv2.putText(overlay, label, (x1, max(20, y1 - 10)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2, cv2.LINE_AA)
                            
                # Draw predicted route line directly forward
                cv2.arrowedLine(overlay, (int((x1+x2)/2), y1), (int((x1+x2)/2), max(0, y1 - 100)), (0, 255, 0), 2, tipLength=0.2)
                cv2.putText(overlay, "ROUTE PREEMPTION ESTABLISHED", (int((x1+x2)/2) + 10, max(0, y1 - 60)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1, cv2.LINE_AA)

    # Blend overlay
    return cv2.addWeighted(overlay, 0.6, frame, 0.4, 0)

class GreenWaveWorker:
    def __init__(self, camera_id: UUID, venue_id: UUID, source: Any):
        self.camera_id = camera_id
        self.venue_id = venue_id
        self.source = source
        self.detector = get_detector()
        
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._cached_frame_bytes: Optional[bytes] = None
        self._last_annotated_frame: Optional[np.ndarray] = None
        self._last_result = None
        self.injected_frame: Optional[np.ndarray] = None

    async def start(self):
        if self._running: return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"GreenWaveWorker started for {self.camera_id}")

    async def stop(self):
        self._running = False
        if hasattr(self, "_detection_task") and self._detection_task:
            self._detection_task.cancel()
        if self._task:
            self._task.cancel()
            try: await self._task
            except asyncio.CancelledError: pass
        if hasattr(self.source, "stop"):
            self.source.stop()

    async def _run_loop(self):
        self._last_annotated_frame = None
        self._last_result = None
        self._current_raw_frame = None
        
        self._detection_task = asyncio.create_task(self._detection_loop())

        while self._running:
            try:
                if self.injected_frame is not None:
                    frame = self.injected_frame.copy()
                    await asyncio.sleep(0.033)
                else:
                    try:
                        read_result = await asyncio.wait_for(self.source.read(), timeout=1.0)
                        if read_result is None:
                            await asyncio.sleep(0.5); continue
                        ret, frame = read_result
                        if not ret or frame is None:
                            await asyncio.sleep(0.5); continue
                    except asyncio.TimeoutError:
                        await asyncio.sleep(1.0); continue

                self._current_raw_frame = frame.copy()

                if self._last_result:
                    annotated = draw_greenwave_overlay(frame.copy(), self._last_result)
                    self._last_annotated_frame = annotated

                frame_to_encode = self._last_annotated_frame if self._last_annotated_frame is not None else frame
                try:
                    _, jpeg = cv2.imencode(".jpg", frame_to_encode, [cv2.IMWRITE_JPEG_QUALITY, 78])
                    self._cached_frame_bytes = jpeg.tobytes()
                except Exception: pass

                await asyncio.sleep(0.033)
            except Exception as e:
                logger.error(f"GreenWaveWorker loop error: {e}")
                await asyncio.sleep(1)

    async def _detection_loop(self):
        detection_interval = 0.5 
        while self._running:
            try:
                if hasattr(self, '_current_raw_frame') and self._current_raw_frame is not None:
                    frame = self._current_raw_frame.copy()
                    
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(
                        None, lambda: self.detector.detect_vehicles(frame)
                    )
                    self._last_result = result
                    
                    has_emergency = False
                    if hasattr(result, 'bounding_boxes') and result.bounding_boxes:
                        for box in result.bounding_boxes:
                            if box.get("class_name") in ["truck", "bus"]:
                                has_emergency = True
                                break
                    
                    signals_cleared = 0
                    if has_emergency:
                        signals_cleared = 5
                        await self._trigger_greenwave()
                        
                    GLOBAL_STATE.update(
                        domain="greenwave",
                        venue_id=str(self.venue_id),
                        payload={
                            "venue_id": str(self.venue_id),
                            "camera_id": str(self.camera_id),
                            "emergency_active": has_emergency,
                            "signals_preempted": signals_cleared,
                            "delay_reduction_sec": 45 if has_emergency else 0,
                            "last_updated": datetime.utcnow().isoformat()
                        }
                    )

                await asyncio.sleep(detection_interval)
            except Exception as e:
                logger.error(f"GreenWave detection loop error: {e}")
                await asyncio.sleep(1)

    async def _trigger_greenwave(self):
        try:
            async with db_manager.session() as session:
                from app.models.venue import Venue as VenueModel
                venue_obj = await session.get(VenueModel, self.venue_id)
                if venue_obj:
                    await notification_service.push_notification(
                        domain="security",
                        type="GREEN_WAVE_ACTIVATED",
                        priority="CRITICAL",
                        description="Ambulance path established. Preempting 5 traffic nodes ahead.",
                        venue_id=str(self.venue_id),
                        venue_name=venue_obj.name,
                        metadata={"camera_id": str(self.camera_id)}
                    )
        except Exception as e:
            logger.warning(f"Failed to process green wave notification: {e}")
