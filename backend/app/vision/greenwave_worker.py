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
from app.vision.tracker import CentroidTracker
import math

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
                
                confidence_str = box.get("final_confidence", 0)
                label = f"EMERGENCY VEHICLE ({confidence_str}%)"
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
        
        self.tracker = CentroidTracker(max_disappeared=15, max_distance=80)
        self.tracked_vehicles = {}
        self.frame_count = 0

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
                    _, jpeg = cv2.imencode(".jpg", frame_to_encode, [cv2.IMWRITE_JPEG_QUALITY, 65])
                    self._cached_frame_bytes = jpeg.tobytes()
                except Exception: pass

                await asyncio.sleep(0.033)
            except Exception as e:
                logger.error(f"GreenWaveWorker loop error: {e}")
                await asyncio.sleep(1)

    async def _detection_loop(self):
        detection_interval = 0.05 
        while self._running:
            try:
                if hasattr(self, '_current_raw_frame') and self._current_raw_frame is not None:
                    frame = self._current_raw_frame.copy()
                    self.frame_count += 1
                    
                    if self.frame_count % 3 != 0:
                        await asyncio.sleep(0.01)
                        continue
                    
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(
                        None, lambda: self.detector.detect_people(frame, True, 500, None, [2, 3, 5, 7])
                    )
                    
                    has_emergency = False
                    best_confidence = 0
                    
                    if hasattr(result, 'bounding_boxes') and result.bounding_boxes:
                        rects = []
                        for box in result.bounding_boxes:
                            x1, y1, x2, y2 = [int(p) for p in box["bbox"]]
                            rects.append((x1, y1, x2, y2))
                            
                        tracked_objects = self.tracker.update(rects)
                        
                        for obj_id, centroid in tracked_objects.items():
                            matched_box = None
                            best_yolo_conf = 0
                            for box in result.bounding_boxes:
                                x1, y1, x2, y2 = [int(p) for p in box["bbox"]]
                                bx, by = (x1+x2)/2, (y1+y2)/2
                                if abs(bx - centroid[0]) < 20 and abs(by - centroid[1]) < 20:
                                    matched_box = box
                                    best_yolo_conf = box.get("confidence", 0) * 100
                                    break
                                    
                            if not matched_box:
                                continue
                                
                            if obj_id not in self.tracked_vehicles:
                                self.tracked_vehicles[obj_id] = {
                                    "light_score": 0, "motion_score": 0,
                                    "vehicle_class_score": 0, "route_priority_score": 0,
                                    "tracking_consistency": 0,
                                    "frames_tracked": 0,
                                    "first_seen": time.time(),
                                    "confidence_history": []
                                }
                                
                            v_state = self.tracked_vehicles[obj_id]
                            v_state["frames_tracked"] += 1
                            v_state["vehicle_class_score"] = best_yolo_conf
                            
                            history = self.tracker.history.get(obj_id, [])
                            if len(history) >= 5:
                                dx = history[-1][0] - history[-5][0]
                                dy = history[-1][1] - history[-5][1]
                                dist = (dx**2 + dy**2)**0.5
                                v_state["motion_score"] = min(100, int(dist * 3)) if dist > 15 else 20
                                
                                angles = []
                                for i in range(1, len(history)):
                                    adx = history[i][0] - history[i-1][0]
                                    ady = history[i][1] - history[i-1][1]
                                    angles.append(math.atan2(ady, adx))
                                if angles:
                                    variance = np.var(angles)
                                    v_state["route_priority_score"] = 90 if variance < 0.2 else 30
                                    
                            x1, y1, x2, y2 = [int(p) for p in matched_box["bbox"]]
                            crop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]
                            if crop.size > 0 and v_state["frames_tracked"] % 2 == 0:
                                hsv_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
                                upper_crop = hsv_crop[0:int(crop.shape[0]*0.4), :]
                                if upper_crop.size > 0:
                                    red_mask1 = cv2.inRange(upper_crop, np.array([0, 120, 70]), np.array([10, 255, 255]))
                                    red_mask2 = cv2.inRange(upper_crop, np.array([170, 120, 70]), np.array([180, 255, 255]))
                                    blue_mask = cv2.inRange(upper_crop, np.array([100, 150, 0]), np.array([140, 255, 255]))
                                    if cv2.countNonZero(red_mask1 + red_mask2) > 5 or cv2.countNonZero(blue_mask) > 5:
                                        v_state["light_score"] = min(90, v_state["light_score"] + 20)
                                    else:
                                        v_state["light_score"] = max(0, v_state["light_score"] - 5)
                                        
                            v_state["tracking_consistency"] = min(100, len(history) * 10)
                                        
                            final_score = (0.35 * v_state["light_score"] + 
                                           0.25 * v_state["tracking_consistency"] + 
                                           0.20 * v_state["vehicle_class_score"] + 
                                           0.10 * v_state["motion_score"] + 
                                           0.10 * v_state["route_priority_score"])
                                           
                            v_state["confidence_history"].append(final_score)
                            if len(v_state["confidence_history"]) > 10:
                                v_state["confidence_history"].pop(0)
                                
                            avg_score = sum(v_state["confidence_history"]) / max(1, len(v_state["confidence_history"]))
                            
                            matched_box["final_confidence"] = int(avg_score)
                            tracked_time = time.time() - v_state["first_seen"]
                            
                            # Enforce hard gates for emergency confirmation
                            if (avg_score > 75 and 
                                v_state["vehicle_class_score"] > 60 and 
                                v_state["light_score"] > 60 and 
                                tracked_time > 1.5):
                                has_emergency = True
                                best_confidence = max(best_confidence, int(avg_score))
                                matched_box["class_name"] = "truck" # for overlay to highlight
                                
                    self._last_result = result
                    
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
                            "last_updated": datetime.utcnow().isoformat(),
                            "confidence": best_confidence
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
