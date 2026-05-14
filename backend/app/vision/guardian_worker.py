import asyncio
import cv2
import json
import logging
from typing import Dict, Any, List
from threading import Thread

# We import the exact same dependencies as the rest of the vision pipeline
from app.vision.camera_manager import CameraManager
from app.vision.models import ModelManager
from app.vision.kinetic_detector import KineticDetector
from app.core.config import settings

logger = logging.getLogger(__name__)

class GuardianWorker:
    def __init__(self, camera_id: str, venue_id: str = None, source: str = None):
        self.camera_id = camera_id
        self.venue_id = venue_id
        self.source = source
        self.camera = CameraManager.get_camera(camera_id)
        # Use pose model for human kinetics
        self.model = ModelManager.get_model("yolov8n-pose.pt")
        # Guardian system uses the KineticDetector's advanced heuristics
        self.kinetic_detector = KineticDetector(fps=self.camera.fps if self.camera else 15)
        self.is_running = False
        self.current_frame = None
        self.event_queue = asyncio.Queue()
        
    async def start(self):
        if self.is_running:
            return
        
        self.is_running = True
        logger.info(f"GuardianWorker starting for camera {self.camera_id}")
        
        # Run processing continuously in a background thread to prevent blocking asyncio
        self.thread = Thread(target=self._process_loop)
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        self.is_running = False
        if hasattr(self, 'thread'):
            self.thread.join(timeout=1.0)
        logger.info(f"GuardianWorker stopped for camera {self.camera_id}")

    def _process_loop(self):
        if not self.camera:
            logger.error(f"Cannot start GuardianWorker: Camera {self.camera_id} not found.")
            return

        while self.is_running:
            frame = self.camera.get_latest_frame()
            if frame is None:
                continue
                
            try:
                # Downsample frame for inference speed if needed
                process_frame = cv2.resize(frame, (640, 480))
                
                # YOLOv8 Pose inference
                results = self.model(process_frame, verbose=False)[0]
                
                detected_entities = []
                keypoints_data = []
                
                if len(results.boxes) > 0:
                    for i, box in enumerate(results.boxes):
                        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                        conf = float(box.conf[0])
                        class_id = int(box.cls[0])
                        name = results.names[class_id]
                        
                        if name == "person" and conf > 0.4:
                            detected_entities.append({
                                "class": name,
                                "confidence": conf,
                                "bbox": [x1, y1, x2, y2]
                            })
                            
                            # Append keypoints if available
                            if results.keypoints is not None and len(results.keypoints.xy) > i:
                                kpts = results.keypoints.xy[i].tolist()
                                keypoints_data.append(kpts)

                # Process Kinetic Anomalies (Running, Following, Fall, SOS)
                anomalies = self.kinetic_detector.process(keypoints_data, detected_entities)
                
                # Push events if detected
                if anomalies:
                    for anomaly in anomalies:
                        try:
                            # non-blocking put using the threadsafe method
                            self.event_queue.put_nowait({
                                "camera_id": self.camera_id,
                                "type": anomaly["type"],
                                "severity": anomaly["severity"],
                                "message": anomaly["message"],
                                "timestamp": asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
                            })
                        except Exception as e:
                            pass
                
                # Overlays
                
                # Display HUD Background
                cv2.rectangle(process_frame, (0, 0), (640, 50), (10, 20, 10), -1)
                cv2.putText(process_frame, f"LAMINAR GUARDIAN ROUTE: ACTIVE", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 200, 0), 2)
                
                # Draw protective halos
                for ent in detected_entities:
                    x1, y1, x2, y2 = ent["bbox"]
                    
                    # Check if this entity is involved in an anomaly
                    is_threat = False
                    for anom in anomalies:
                        # naive check
                        if anom["bbox"] == [x1, y1, x2, y2]:
                            is_threat = True
                            
                    # Draw Cyan Protective Shield by default, Red if threat
                    color = (0, 255, 255) # Cyan/Yellow in BGR
                    if is_threat:
                        color = (0, 0, 255) # Red for danger
                        cv2.rectangle(process_frame, (x1-5, y1-5), (x2+5, y2+5), color, 4)
                        cv2.putText(process_frame, "THREAT DETECTED", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                    else:
                        cv2.rectangle(process_frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(process_frame, "SECURED", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

                
                # Draw skeleton
                if results.keypoints is not None:
                    for i, k in enumerate(keypoints_data):
                        for point in k:
                            px, py = int(point[0]), int(point[1])
                            if px != 0 and py != 0:
                                cv2.circle(process_frame, (px, py), 3, (200, 255, 0), -1)
                
                # Encode final frame safely
                ret, buffer = cv2.imencode('.jpg', process_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                if ret:
                    self.current_frame = buffer.tobytes()

            except Exception as e:
                logger.error(f"Error in GuardianWorker processing loop: {e}")
                import traceback
                traceback.print_exc()
                import time
                time.sleep(1)

    async def get_stream(self):
        while self.is_running:
            if self.current_frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + self.current_frame + b'\r\n')
            await asyncio.sleep(1 / (self.camera.fps if self.camera else 15))

    async def get_events(self):
        while self.is_running:
            try:
                # Need to use an asyncio sleep to yield context if we're not waiting on queue
                if not self.event_queue.empty():
                    event = self.event_queue.get_nowait()
                    yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0.5)
            except Exception as e:
                logger.error(f"Error generating SSE in GuardianWorker: {e}")
                await asyncio.sleep(1)
