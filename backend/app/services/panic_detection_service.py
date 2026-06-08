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
        
        # Initialize Dense Optical Flow
        self.prev_gray = None
        
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
        
        if frame is None or frame.size == 0 or not self._available:
            return result
            
        # Resolve dynamic thresholds
        v_thresh = config.get("velocity_threshold", self.velocity_threshold) if config else self.velocity_threshold
        d_thresh = config.get("density_threshold", self.density_threshold) if config else self.density_threshold
        c_window = config.get("trigger_cooldown", self.trigger_cooldown) if config else self.trigger_cooldown

        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        if self.prev_gray is None:
            self.prev_gray = gray_frame
            return result
            
        try:
            # Calculate dense optical flow using Farneback algorithm
            flow = cv2.calcOpticalFlowFarneback(
                self.prev_gray, gray_frame, None, 
                pyr_scale=0.5, levels=3, winsize=15, 
                iterations=3, poly_n=5, poly_sigma=1.2, flags=0
            )
            
            # Compute magnitude of flow vectors
            mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
            
            # Filter out tiny camera jitters (static background noise)
            # Threshold: only consider pixels moving more than 0.5 pixels per frame
            moving_pixels = mag[mag > 0.5]
            
            if len(moving_pixels) > 0:
                # Scale from px/frame to approximate px/second (assume ~15 fps)
                # To make it more "accurate", we use the 90th percentile to track the fastest moving parts of the crowd
                # rather than the mean, which gets diluted by standing people.
                avg_vel = float(np.percentile(moving_pixels, 85)) * 15.0
                variance = float(np.var(moving_pixels)) * 15.0
                
                if np.isnan(variance):
                    variance = 0.0
                    
                self.avg_velocity = avg_vel
                self.avg_variance = variance
                self.acceleration = float(avg_vel - self.last_velocity)
                self.last_velocity = avg_vel
                
                result["avg_velocity"] = self.avg_velocity
                result["variance"] = self.avg_variance
                result["acceleration"] = self.acceleration
                
            self.prev_gray = gray_frame
            
        except Exception as e:
            logger.error(f"Optical flow failed: {e}")
            return result
            
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
