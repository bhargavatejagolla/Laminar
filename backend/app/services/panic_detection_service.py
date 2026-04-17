import cv2
import numpy as np
import time
from typing import Optional, Tuple, Dict, Any, List
from datetime import datetime, timezone
import uuid

from app.core.logging import get_logger

logger = get_logger(__name__)

class PanicDetectionService:
    """
    Core ML Service for detecting crowd surges and panic.
    Replaced Optical Flow with MediaPipe Pose to compute velocity logic based on authentic human keypoints!
    """
    
    def __init__(
        self,
        velocity_threshold: float = 15.0,  # Default (configurable)
        density_threshold: int = 5,        # Minimum people (configurable)
        trigger_cooldown: int = 30         # Seconds between triggers
    ):
        self.velocity_threshold = velocity_threshold
        self.density_threshold = density_threshold
        self.trigger_cooldown = trigger_cooldown
        
        # Initialize the MediaPipe Pose Estimator for full-body tracking kinetics
        from mediapipe.python.solutions import pose as mp_pose
        self.mp_pose = mp_pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            min_detection_confidence=0.5,
            model_complexity=0   # Fast processing mode!
        )
        
        # Track 33 keypoints over consecutive frames to extract vector magnitudes
        self.prev_landmarks = None
        
        self.last_trigger_time: Optional[datetime] = None
        self.avg_velocity = 0.0
        self.last_velocity = 0.0
        self.avg_variance = 0.0
        self.acceleration = 0.0

    def process_frame(
        self, 
        frame: np.ndarray, 
        current_crowd_count: int,
        camera_id: uuid.UUID,
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process a single frame to calculate motion and evaluate panic rules using precise human joint displacement.
        """
        result = {
            "avg_velocity": 0.0,
            "variance": 0.0,
            "acceleration": 0.0,
            "panic_detected": False,
            "reason": None
        }
        
        if frame is None or frame.size == 0:
            return result
            
        # Resolve dynamic thresholds
        v_thresh = config.get("velocity_threshold", self.velocity_threshold) if config else self.velocity_threshold
        d_thresh = config.get("density_threshold", self.density_threshold) if config else self.density_threshold
        c_window = config.get("trigger_cooldown", self.trigger_cooldown) if config else self.trigger_cooldown

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        try:
            pose_results = self.pose.process(rgb_frame)
        except Exception as e:
            return result
        
        valid_magnitudes = []
        
        if pose_results and pose_results.pose_landmarks:
            curr_landmarks = pose_results.pose_landmarks.landmark
            if self.prev_landmarks is not None:
                h, w = frame.shape[:2]
                
                # Iterate precisely through all 33 intrinsic joint keypoints
                for i in range(33):
                    curr = curr_landmarks[i]
                    prev = self.prev_landmarks[i]
                    
                    if curr.visibility > 0.5 and prev.visibility > 0.5:
                        dx = (curr.x - prev.x) * w
                        dy = (curr.y - prev.y) * h
                        mag = np.hypot(dx, dy)
                        
                        # Filter micromovement noise and extremely unstable edge jumps
                        if 0.5 < mag < (v_thresh * 5.0):
                            valid_magnitudes.append(mag)
                            
            self.prev_landmarks = curr_landmarks
        else:
            self.prev_landmarks = None
            
        if len(valid_magnitudes) > 0:
            # Scale from px/frame to approximate px/second (assume ~15 fps effective processing timeline)
            avg_vel = float(np.mean(valid_magnitudes)) * 15.0
            variance = float(np.var(valid_magnitudes)) * 15.0
            
            if np.isnan(variance):
                variance = 0.0
                
            self.avg_velocity = avg_vel
            self.avg_variance = variance
            self.acceleration = float(avg_vel - self.last_velocity)
            self.last_velocity = avg_vel
            
            result["avg_velocity"] = self.avg_velocity
            result["variance"] = self.avg_variance
            result["acceleration"] = self.acceleration
            
            # Evaluate Surge matrix logic based on verified keypoint velocities
            if (self.avg_velocity > v_thresh and 
                current_crowd_count >= d_thresh):
                
                now = datetime.now(timezone.utc)
                # Ensure alerts don't spam endlessly
                if (self.last_trigger_time is None or 
                   (now - self.last_trigger_time).total_seconds() >= c_window):
                    
                    result["panic_detected"] = True
                    result["reason"] = f"Unusual keypoint acceleration surge ({self.avg_velocity:.1f}px/s) tracked against a dense crowd ({current_crowd_count} instances)."
                    self.last_trigger_time = now
                    
                    logger.warning(
                        f"🚨 CROWD SURGE/PANIC DETECTED on camera {camera_id}",
                        extra={
                            "velocity": self.avg_velocity,
                            "count": current_crowd_count
                        }
                    )
                    
        return result
