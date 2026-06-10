import asyncio
import cv2
import numpy as np
import time
from typing import Optional, Any
from uuid import UUID
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.vision.detector import get_detector
from app.vision.kinetic_detector import KineticDetector
from app.core.global_state import GLOBAL_STATE
from app.core.database import db_manager
from app.services.notification_service import notification_service
from app.api.v1.endpoints.kinetic import push_kinetic_event

logger = get_logger(__name__)

# Neon colors for skeletal tracking overlay
SKELETON_COLORS = [
    (0, 255, 255),  # Yellow
    (0, 255, 0),    # Green
    (255, 0, 255)   # Magenta
]

def draw_pose_overlay(frame: np.ndarray, result, anomalies: list = None) -> np.ndarray:
    """Overlays neural neon skeletal tracking on the frame."""
    overlay = frame.copy()
    anomalies = anomalies or []
    
    if hasattr(result, 'keypoints') and result.keypoints:
        for i, (kpts, box) in enumerate(zip(result.keypoints, result.bounding_boxes)):
            color = SKELETON_COLORS[i % len(SKELETON_COLORS)]
            x1, y1, x2, y2 = [int(p) for p in box["bbox"][0]]
            
            # Check if this person is part of an anomaly
            person_anomaly = None
            for a in anomalies:
                ax1, ay1, ax2, ay2 = a["bbox"]
                # naive IoU or center distance check (using center for simplicity)
                cx, cy = (x1+x2)/2, (y1+y2)/2
                acx, acy = (ax1+ax2)/2, (ay1+ay2)/2
                if abs(cx-acx) < 50 and abs(cy-acy) < 50:
                    person_anomaly = a
                    break
            
            box_color = color
            thickness = 2
            bg_color = (0, 0, 0)
            if person_anomaly:
                risk = person_anomaly.get("risk_level", "LOW")
                if risk == "CRITICAL":
                    box_color = (0, 0, 255) # Red
                    bg_color = (0, 0, 150)
                    thickness = 3
                elif risk == "HIGH":
                    box_color = (0, 165, 255) # Orange
                    bg_color = (0, 100, 200)
                    thickness = 3
                elif risk == "MEDIUM":
                    box_color = (0, 255, 255) # Yellow
                    bg_color = (0, 150, 150)
                    thickness = 2
            # Draw Safety Bubble and Threat Levels
            threat_level = box.get("threat_level")
            is_primary = box.get("primary")
            
            if threat_level:
                if threat_level == "Red":
                    box_color = (0, 0, 255)
                    bg_color = (0, 0, 150)
                elif threat_level == "Orange":
                    box_color = (0, 128, 255)
                    bg_color = (0, 80, 150)
                elif threat_level == "Yellow":
                    box_color = (0, 255, 255)
                    bg_color = (0, 150, 150)
                elif threat_level == "Green":
                    box_color = (0, 255, 0)
                    bg_color = (0, 150, 0)
                    
            if is_primary:
                box_color = (0, 255, 0) # Green for primary subject
                bubble_radius = int(max(x2-x1, y2-y1) * 1.5)
                cx, cy = int((x1+x2)/2), int((y1+y2)/2)
                cv2.circle(overlay, (cx, cy), bubble_radius, (0, 255, 0), 2, cv2.LINE_AA)
                
                label = "PROTECTED SUBJECT"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                text_y = max(th + 5, y1 - 25)
                cv2.rectangle(overlay, (x1, text_y - th - 5), (x1 + tw + 10, text_y + 5), (0, 150, 0), -1)
                cv2.putText(overlay, label, (x1 + 5, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
            elif threat_level:
                label = f"THREAT: {threat_level.upper()}"
                bubble_radius = int(max(x2-x1, y2-y1) * 0.8)
                cx, cy = int((x1+x2)/2), int((y1+y2)/2)
                dist_str = "1.2m" # mock distance
                
                if threat_level == "Red":
                    box_color = (0, 0, 255)
                    bg_color = (0, 0, 150)
                    cv2.circle(overlay, (cx, cy), bubble_radius, (0, 0, 255), 2, cv2.LINE_AA)
                    dist_str = "0.5m"
                    label = "THREAT ACTOR"
                elif threat_level == "Orange":
                    box_color = (0, 165, 255)
                    bg_color = (0, 100, 200)
                    cv2.circle(overlay, (cx, cy), bubble_radius, (0, 165, 255), 2, cv2.LINE_AA)
                    dist_str = "0.8m"
                    label = "UNKNOWN PERSON"
                else:
                    cv2.circle(overlay, (cx, cy), bubble_radius, box_color, 1, cv2.LINE_AA)

                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                text_y = max(th + 5, y1 - 8)
                cv2.rectangle(overlay, (x1, text_y - th - 5), (x1 + tw + 10, text_y + 5), bg_color, -1)
                cv2.putText(overlay, label, (x1 + 5, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                cv2.putText(overlay, f"Dist: {dist_str}", (cx - 20, y2 + 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_color, 1, cv2.LINE_AA)
            # Draw glowing bounding box
            cv2.rectangle(overlay, (x1, y1), (x2, y2), box_color, thickness)
            
            # Add corner accents (Cyberpunk style)
            length = min(30, int((x2-x1)*0.2))
            c_thick = thickness + 2
            cv2.line(overlay, (x1, y1), (x1 + length, y1), box_color, c_thick)
            cv2.line(overlay, (x1, y1), (x1, y1 + length), box_color, c_thick)
            cv2.line(overlay, (x2, y1), (x2 - length, y1), box_color, c_thick)
            cv2.line(overlay, (x2, y1), (x2, y1 + length), box_color, c_thick)
            cv2.line(overlay, (x1, y2), (x1 + length, y2), box_color, c_thick)
            cv2.line(overlay, (x1, y2), (x1, y2 - length), box_color, c_thick)
            cv2.line(overlay, (x2, y2), (x2 - length, y2), box_color, c_thick)
            cv2.line(overlay, (x2, y2), (x2, y2 - length), box_color, c_thick)
            
            if person_anomaly:
                label = f"[{person_anomaly['type']}] CONF: {person_anomaly.get('confidence', 0)}%"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                text_y = max(th + 5, y1 - 8)
                cv2.rectangle(overlay, (x1, text_y - th - 5), (x1 + tw + 10, text_y + 5), bg_color, -1)
                cv2.putText(overlay, label, (x1 + 5, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

            if kpts:
                # Draw keypoints
                for kpt in kpts:
                    if kpt is not None:
                        kx, ky, conf = kpt
                        if conf > 0.5:
                            cv2.circle(overlay, (int(kx), int(ky)), 3, color, -1)
                
                # Draw skeleton connections
                # Typical YOLO pose mapping:
                # 0: Nose, 1: L Eye, 2: R Eye, 3: L Ear, 4: R Ear
                # 5: L Shoulder, 6: R Shoulder, 7: L Elbow, 8: R Elbow
                # 9: L Wrist, 10: R Wrist, 11: L Hip, 12: R Hip
                # 13: L Knee, 14: R Knee, 15: L Ankle, 16: R Ankle
                connections = [
                    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10), # upper body
                    (5, 11), (6, 12), (11, 12), # torso
                    (11, 13), (13, 15), (12, 14), (14, 16) # lower body
                ]
                
                for p1, p2 in connections:
                    if p1 < len(kpts) and p2 < len(kpts):
                        k1 = kpts[p1]
                        k2 = kpts[p2]
                        if k1 and k2 and k1[2] > 0.5 and k2[2] > 0.5:
                            cv2.line(overlay, (int(k1[0]), int(k1[1])), (int(k2[0]), int(k2[1])), color, 2)

    # Blend overlay
    frame = cv2.addWeighted(overlay, 0.4, frame, 0.6, 0)
    
    # Anomaly badge in corner
    cv2.putText(frame, "KINETIC INTELLIGENCE ACTIVE", (14, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1, cv2.LINE_AA)

    return frame

class KineticWorker:
    def __init__(self, camera_id: UUID, venue_id: UUID, source: Any):
        self.camera_id = camera_id
        self.venue_id = venue_id
        self.source = source
        self.detector = get_detector()
        self.kinetic_engine = KineticDetector()
        
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._cached_frame_bytes: Optional[bytes] = None
        self._last_annotated_frame: Optional[np.ndarray] = None
        self._last_result = None
        self._last_anomalies = []
        self.injected_frame: Optional[np.ndarray] = None

    async def start(self):
        if self._running: return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"KineticWorker started for {self.camera_id}")

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
                    annotated = frame.copy()
                    annotated = draw_pose_overlay(annotated, self._last_result, getattr(self, '_last_anomalies', []))
                    self._last_annotated_frame = annotated

                frame_to_encode = self._last_annotated_frame if self._last_annotated_frame is not None else frame
                try:
                    _, jpeg = cv2.imencode(".jpg", frame_to_encode, [cv2.IMWRITE_JPEG_QUALITY, 65])
                    self._cached_frame_bytes = jpeg.tobytes()
                except Exception: pass

                await asyncio.sleep(0.01)
            except Exception as e:
                logger.error(f"KineticWorker loop error: {e}")
                await asyncio.sleep(1)

    async def _detection_loop(self):
        detection_interval = 0.05 
        while self._running:
            try:
                if hasattr(self, '_current_raw_frame') and self._current_raw_frame is not None:
                    frame = self._current_raw_frame.copy()
                    
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(
                        None, lambda: self.detector.detect_pose(frame, return_boxes=True)
                    )
                    self._last_result = result
                    
                    # Process Anomalies
                    if hasattr(result, 'keypoints') and result.keypoints:
                        anomalies = self.kinetic_engine.detect_anomalies(result.bounding_boxes, result.keypoints)
                        self._last_anomalies = anomalies
                        
                        for inc in anomalies:
                            asyncio.create_task(self._process_incident(inc))
                            # Broadcast to SSE
                            push_kinetic_event(str(self.camera_id), inc)
                            
                        # Update Global State
                        GLOBAL_STATE.update(
                            domain="kinetic",
                            venue_id=str(self.venue_id),
                            payload={
                                "venue_id": str(self.venue_id),
                                "camera_id": str(self.camera_id),
                                "active_subjects": result.count,
                                "anomalies_detected": len(anomalies),
                                "latest_anomalies": anomalies,
                                "last_updated": datetime.utcnow().isoformat()
                            }
                        )

                await asyncio.sleep(detection_interval)
            except Exception as e:
                logger.error(f"Kinetic detection loop error: {e}")
                await asyncio.sleep(1)

    async def _process_incident(self, inc):
        try:
            async with db_manager.session() as session:
                from app.models.venue import Venue as VenueModel
                venue_obj = await session.get(VenueModel, self.venue_id)
                if venue_obj:
                    await notification_service.push_notification(
                        domain="security",
                        type=inc["type"],
                        priority=inc.get("risk_level", "CRITICAL").upper(),
                        description=inc["message"],
                        venue_id=str(self.venue_id),
                        venue_name=venue_obj.name,
                        metadata={"camera_id": str(self.camera_id), "kinetic_box": inc.get("bbox", [])}
                    )
        except Exception as e:
            logger.warning(f"Failed to process kinetic notification: {e}")
