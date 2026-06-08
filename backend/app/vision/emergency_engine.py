import cv2
import numpy as np
import asyncio
import time
import math
from typing import Dict, Any, List
from app.core.logging import get_logger

logger = get_logger(__name__)

# Configurable frame skip
PROCESS_EVERY_N_FRAMES = 3

# Global state to hold active session engines
ACTIVE_SESSIONS: Dict[str, 'EmergencyEngine'] = {}

class EmergencyEngine:
    def __init__(self, session_id: str, video_path: str):
        self.session_id = session_id
        self.video_path = video_path
        self._running = False
        self._task = None
        self._detection_task = None
        self._latest_frame_bytes = None
        self._current_raw_frame = None
        self._last_result = None
        self._last_boxes = None
        
        # Tracking
        from app.vision.tracker import CentroidTracker
        self.tracker = CentroidTracker(max_disappeared=15, max_distance=80)
        self.tracked_vehicles = {}  # id -> { light_score, motion_score, vehicle_class_score, route_priority_score, active_time }
        
        # Create a placeholder frame so the stream connects immediately
        placeholder = np.zeros((400, 640, 3), dtype=np.uint8)
        cv2.putText(placeholder, "INITIALIZING AI ENGINES...", (150, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2, cv2.LINE_AA)
        cv2.putText(placeholder, "Loading YOLO weights. Please wait.", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1, cv2.LINE_AA)
        _, jpeg = cv2.imencode(".jpg", placeholder, [cv2.IMWRITE_JPEG_QUALITY, 65])
        self._latest_frame_bytes = jpeg.tobytes()
        
        self.status = "NO EMERGENCY"
        self.traffic_density = "Low"
        self.vehicle_count = 0
        self.candidate_count = 0
        self.target_id = None
        self.confidence = 0
        self.avg_speed = 0
        self.congestion_index = 0
        
        # Reasoning details
        self.reasoning = {
            "light": 0,
            "motion": 0,
            "vehicle": 0,
            "priority": 0
        }
        self.eta = 0
        self.signals_cleared = 0
        self.logs = []
        
        self.corridor_nodes = {
            "A": {"eta": "8s", "cleared": False, "status": "Preparing"},
            "B": {"eta": "19s", "cleared": False, "status": "Standby"},
            "C": {"eta": "31s", "cleared": False, "status": "Standby"}
        }
        self.state_entered_at = time.time()
        
        # We will initialize YOLO on thread start
        self.detector = None

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        self._detection_task = asyncio.create_task(self._detection_loop())
        
    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
        if self._detection_task:
            self._detection_task.cancel()
            
    def _broadcast_telemetry(self):
        from app.api.v1.endpoints.greenwave import push_greenwave_event
        push_greenwave_event(self.session_id, {
            "status": self.status,
            "target_id": self.target_id,
            "confidence": self.confidence,
            "density": self.traffic_density,
            "vehicle_count": self.vehicle_count,
            "candidate_count": self.candidate_count,
            "avg_speed": self.avg_speed,
            "congestion_index": self.congestion_index,
            "reasoning": self.reasoning,
            "corridor_nodes": self.corridor_nodes,
            "logs": list(self.logs)
        })

    def _set_status(self, new_status: str):
        if self.status != new_status:
            self.status = new_status
            self.state_entered_at = time.time()

    def _add_log(self, text: str, alert: bool = False):
        self.logs.append({
            "time": time.strftime("%H:%M:%S"),
            "text": text,
            "type": "alert" if alert else "info"
        })
        # keep last 8
        if len(self.logs) > 8:
            self.logs.pop(0)
        self._broadcast_telemetry()
            
    async def _run_loop(self):
        try:
            self._add_log("Initializing Emergency Vehicle Engine...", False)
            await asyncio.sleep(0.5)
            
            # 1. Load YOLO (reusing detector)
            from app.vision.detector import get_detector
            self.detector = get_detector()
            self._add_log("YOLOv11 Online. Scanning vehicles...", False)
            
            self._set_status("SCANNING")
            
            cap = cv2.VideoCapture(self.video_path)
            if not cap.isOpened():
                self._add_log("Failed to open video source", True)
                
                error_frame = np.zeros((400, 640, 3), dtype=np.uint8)
                cv2.putText(error_frame, "ERROR: FAILED TO LOAD VIDEO", (120, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2, cv2.LINE_AA)
                _, jpeg = cv2.imencode(".jpg", error_frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                self._latest_frame_bytes = jpeg.tobytes()
                return
                
            frame_count = 0
            
            while self._running and cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                    
                frame_count += 1
                
                self._current_raw_frame = frame.copy()

                # Draw Overlay based on last processed boxes
                annotated = self._draw_overlay(frame)
                
                # Encode JPEG
                _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 65])
                self._latest_frame_bytes = jpeg.tobytes()
                
                # Push telemetry to SSE
                self._broadcast_telemetry()
                
                # simulate real time 30fps
                await asyncio.sleep(0.033)
                
            cap.release()
            
        except Exception as e:
            logger.error(f"Emergency Engine Error: {e}")
            self._add_log(f"System Error: {str(e)}", True)
            
    async def _detection_loop(self):
        while self._running:
            try:
                if self.detector and hasattr(self, '_current_raw_frame') and self._current_raw_frame is not None:
                    frame_to_process = self._current_raw_frame.copy()
                    
                    result = await asyncio.to_thread(
                        self.detector.detect_people, 
                        frame_to_process, 
                        True,  
                        500,   
                        None,  
                        [2, 3, 5, 7] 
                    )
                    await self._process_frame(frame_to_process, result)
                await asyncio.sleep(0.05)  # Run at roughly 20 fps max
            except Exception as e:
                logger.error(f"Detection loop error: {e}")
                await asyncio.sleep(0.5)
            
    async def _process_frame(self, frame: np.ndarray, result):
        if not hasattr(result, 'bounding_boxes') or not result.bounding_boxes:
            self.vehicle_count = 0
            return
            
        boxes = result.bounding_boxes
        
        # Update Centroid Tracker
        rects = []
        for box in boxes:
            x1, y1, x2, y2 = [int(p) for p in box["bbox"]]
            rects.append((x1, y1, x2, y2))
            
        tracked_objects = self.tracker.update(rects)
        
        # Update traffic intelligence (Average Speed and Congestion Index)
        self.vehicle_count = len(tracked_objects)
        
        # Calculate average speed (px/frame heuristic)
        total_speed = 0
        speed_samples = 0
        for obj_id, centroid in tracked_objects.items():
            history = self.tracker.history.get(obj_id, [])
            if len(history) > 5:
                # Calculate pixel distance over last 5 frames
                dx = history[-1][0] - history[-5][0]
                dy = history[-1][1] - history[-5][1]
                dist = (dx**2 + dy**2)**0.5
                total_speed += dist
                speed_samples += 1
                
        if speed_samples > 0:
            # Map pixel speed to rough km/h (heuristic for demo)
            # Say 10px / 5 frames = 2px/frame = approx 20km/h
            self.avg_speed = min(80, int((total_speed / speed_samples) * 2.5))
        else:
            self.avg_speed = 0
            
        # Congestion Index: based on vehicle count + inverse of speed
        self.congestion_index = min(100, int((self.vehicle_count * 2) + (50 - min(50, self.avg_speed))))
        
        if self.congestion_index > 75:
            self.traffic_density = "High"
        elif self.congestion_index > 40:
            self.traffic_density = "Medium"
        else:
            self.traffic_density = "Low"
            
        if self.status in ["CONFIRMED", "CORRIDOR ACTIVE", "MISSION COMPLETE"]:
            elapsed = time.time() - self.state_entered_at
            if self.status == "CONFIRMED" and elapsed > 2:
                self._set_status("CORRIDOR ACTIVE")
                self.corridor_nodes["A"]["status"] = "Cleared"
                self.corridor_nodes["A"]["cleared"] = True
                self.corridor_nodes["B"]["status"] = "Preparing"
                self._add_log("Node A cleared. Preempting Node B...", False)
            elif self.status == "CORRIDOR ACTIVE" and elapsed > 5:
                self.corridor_nodes["B"]["status"] = "Cleared"
                self.corridor_nodes["B"]["cleared"] = True
                self.corridor_nodes["C"]["status"] = "Preparing"
            elif self.status == "CORRIDOR ACTIVE" and elapsed > 8:
                self._set_status("MISSION COMPLETE")
                self.corridor_nodes["C"]["status"] = "Cleared"
                self.corridor_nodes["C"]["cleared"] = True
                self._add_log("Corridor traversed successfully. System resetting.", False)

            # Just maintain lock and update target box based on tracker
            return

        # Look for potential emergency vehicles among tracked vehicles
        self.candidate_count = 0
        best_candidate_score = 0
        best_candidate_id = None
        best_candidate_reasoning = None
        best_candidate_box = None
        
        for obj_id, centroid in tracked_objects.items():
            # Find the original bounding box for this centroid
            matched_box = None
            best_yolo_conf = 0
            for box in boxes:
                x1, y1, x2, y2 = [int(p) for p in box["bbox"]]
                bx, by = (x1+x2)/2, (y1+y2)/2
                if abs(bx - centroid[0]) < 20 and abs(by - centroid[1]) < 20:
                    matched_box = (x1, y1, x2, y2)
                    best_yolo_conf = box.get("confidence", 0) * 100
                    break
                    
            if not matched_box:
                continue
                
            x1, y1, x2, y2 = matched_box
            width = x2 - x1
            height = y2 - y1
            
            # Initialize tracking state
            if obj_id not in self.tracked_vehicles:
                self.tracked_vehicles[obj_id] = {
                    "light_score": 0,
                    "motion_score": 0,
                    "vehicle_class_score": 0,
                    "route_priority_score": 0,
                    "tracking_consistency": 0,
                    "frames_tracked": 0,
                    "first_seen": time.time(),
                    "confidence_history": []
                }
                
            v_state = self.tracked_vehicles[obj_id]
            v_state["frames_tracked"] += 1
            v_state["vehicle_class_score"] = best_yolo_conf
            
            # 1. Motion Score
            history = self.tracker.history.get(obj_id, [])
            if len(history) >= 5:
                # If moving fast
                dx = history[-1][0] - history[-5][0]
                dy = history[-1][1] - history[-5][1]
                dist = (dx**2 + dy**2)**0.5
                if dist > 15: # Moving fast
                    v_state["motion_score"] = min(100, int(dist * 3))
                else:
                    v_state["motion_score"] = 20
                    
            # 2. Route Priority Score
            # Is it moving through traffic consistently?
            if len(history) >= 5:
                # Calculate direction variance
                angles = []
                for i in range(1, len(history)):
                    adx = history[i][0] - history[i-1][0]
                    ady = history[i][1] - history[i-1][1]
                    angles.append(math.atan2(ady, adx))
                if len(angles) > 0:
                    variance = np.var(angles)
                    if variance < 0.2: # consistent straight movement
                        v_state["route_priority_score"] = 90
                    else:
                        v_state["route_priority_score"] = 30
            
            crop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]
            if crop.size > 0:
                hsv_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
                
                # 3. Siren Light Check (Fast Red/Blue check)
                if v_state["frames_tracked"] % 2 == 0:
                    upper_crop = hsv_crop[0:int(crop.shape[0]*0.4), :]
                    if upper_crop.size > 0:
                        red_mask1 = cv2.inRange(upper_crop, np.array([0, 120, 70]), np.array([10, 255, 255]))
                        red_mask2 = cv2.inRange(upper_crop, np.array([170, 120, 70]), np.array([180, 255, 255]))
                        blue_mask = cv2.inRange(upper_crop, np.array([100, 150, 0]), np.array([140, 255, 255]))
                        
                        if cv2.countNonZero(red_mask1 + red_mask2) > 5 or cv2.countNonZero(blue_mask) > 5:
                            v_state["light_score"] = min(90, v_state["light_score"] + 20)
                        else:
                            v_state["light_score"] = max(0, v_state["light_score"] - 5)
                            
            # Confidence Fusion
            v_state["tracking_consistency"] = min(100, len(self.tracker.history.get(obj_id, [])) * 10)
            
            final_score = (
                (0.35 * v_state["light_score"]) + 
                (0.25 * v_state["tracking_consistency"]) + 
                (0.20 * v_state["vehicle_class_score"]) + 
                (0.10 * v_state["motion_score"]) +
                (0.10 * v_state["route_priority_score"])
            )
            
            v_state["confidence_history"].append(final_score)
            if len(v_state["confidence_history"]) > 10:
                v_state["confidence_history"].pop(0)
                
            avg_score = sum(v_state["confidence_history"]) / max(1, len(v_state["confidence_history"]))
            
            if avg_score > 35:
                self.candidate_count += 1
                
            if avg_score > best_candidate_score:
                best_candidate_score = avg_score
                best_candidate_id = f"EV-00{obj_id}"
                best_candidate_box = matched_box
                best_candidate_reasoning = {
                    "light": int(v_state["light_score"]),
                    "motion": int(v_state["motion_score"]),
                    "vehicle": int(v_state["vehicle_class_score"]),
                    "priority": int(v_state["route_priority_score"])
                }
                best_candidate_tracked_time = time.time() - v_state["first_seen"]
                
        # State Machine Transitions
        if self.status in ["NO EMERGENCY", "SCANNING"]:
            if best_candidate_score > 40:
                self._set_status("CANDIDATE FOUND")
                self.target_id = best_candidate_id
                self.target_box = best_candidate_box
                self.confidence = int(best_candidate_score)
                self.reasoning = best_candidate_reasoning
                self._add_log(f"Candidate Vehicle Detected: {self.target_id}", False)
        
        elif self.status in ["CANDIDATE", "CANDIDATE FOUND"]:
            if best_candidate_score > 70:
                self._set_status("VERIFYING")
                self.target_id = best_candidate_id
                self.target_box = best_candidate_box
                self.confidence = int(best_candidate_score)
                self.reasoning = best_candidate_reasoning
                self._add_log(f"Verifying priority candidate: {self.target_id}...", False)
            elif best_candidate_score < 30:
                self._set_status("SCANNING")
                self.target_id = None
                self._add_log("Candidate lost. Reverting to scanning.", False)
            else:
                self.target_id = best_candidate_id
                self.target_box = best_candidate_box
                self.confidence = int(best_candidate_score)
                self.reasoning = best_candidate_reasoning
                
        elif self.status == "VERIFYING":
            # HARD GATES FOR CONFIRMATION
            if (best_candidate_score > 75 and 
                best_candidate_reasoning["vehicle"] > 60 and 
                best_candidate_reasoning["light"] > 60 and 
                best_candidate_tracked_time > 1.5):
                
                self._set_status("CONFIRMED")
                self.target_id = best_candidate_id
                self.target_box = best_candidate_box
                self.confidence = int(best_candidate_score)
                self.reasoning = best_candidate_reasoning
                self._add_log(f"Emergency Response Vehicle Confirmed: {self.target_id} ({self.confidence}%)", True)
                self._add_log("Activating Sequential Pre-Emption...", False)
                
                # Push Laminar Notification
                from app.services.notification_service import notification_service
                asyncio.create_task(
                    notification_service.push_notification(
                        domain="security",
                        type="GREEN_WAVE_ACTIVATED",
                        priority="CRITICAL",
                        description=f"Ambulance path established for {self.target_id}. Preempting 3 traffic nodes ahead.",
                        venue_id="greenwave-sys",
                        venue_name="Smart City Core",
                        metadata={"target_id": self.target_id}
                    )
                )
            elif best_candidate_score < 40:
                self._set_status("SCANNING")
                self.target_id = None
                self._add_log("Candidate lost. Reverting to scanning.", False)
            else:
                self.target_id = best_candidate_id
                self.target_box = best_candidate_box
                self.confidence = int(best_candidate_score)
                self.reasoning = best_candidate_reasoning
                    
    def _draw_overlay(self, frame):
        overlay = frame.copy()
        
        cv2.putText(overlay, f"LAMINAR ENGINE - STATE: {self.status} | DENSITY: {self.traffic_density}", (14, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 0), 1, cv2.LINE_AA)
                    
        if self.status in ["CONFIRMED", "CORRIDOR ACTIVE", "MISSION COMPLETE"] and hasattr(self, 'target_box') and self.target_box is not None:
            x1, y1, x2, y2 = self.target_box
            cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 0, 255), 2)
            cv2.putText(overlay, f"{self.target_id} ({self.confidence}%)", (x1, max(20, y1 - 10)), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2, cv2.LINE_AA)
                        
            # Simulated route preemption
            cv2.arrowedLine(overlay, (int((x1+x2)/2), y1), (int((x1+x2)/2), max(0, y1 - 100)), (0, 0, 255), 2, tipLength=0.2)
            
        return cv2.addWeighted(overlay, 0.7, frame, 0.3, 0)
