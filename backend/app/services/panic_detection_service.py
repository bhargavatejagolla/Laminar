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
    Core ML Service for detecting crowd surges and panic via Optical Flow.
    Uses Lucas-Kanade to track movement vectors across consecutive frames.
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
        
        # State tracking per instance (one per camera)
        self.prev_gray: Optional[np.ndarray] = None
        self.prev_pts: Optional[np.ndarray] = None
        
        # Lucas-Kanade parameters
        self.lk_params = dict(
            winSize=(15, 15),
            maxLevel=2,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03)
        )
        
        # ShiTomasi corner detection parameters
        self.feature_params = dict(
            maxCorners=200,
            qualityLevel=0.3,
            minDistance=7,
            blockSize=7
        )
        
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
        Process a single frame to calculate motion and evaluate panic rules.
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

        # Convert to grayscale
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Initialization / Reset if lost tracking
        if self.prev_gray is None or self.prev_pts is None or len(self.prev_pts) < 10:
            self.prev_gray = gray
            self.prev_pts = cv2.goodFeaturesToTrack(gray, mask=None, **self.feature_params)
            return result
            
        # Calculate Optical Flow
        next_pts, status, err = cv2.calcOpticalFlowPyrLK(
            self.prev_gray, gray, self.prev_pts, None, **self.lk_params
        )
        
        # Ensure we have valid points
        if next_pts is not None and status is not None:
            # Select good points
            good_new = next_pts[status == 1]
            good_old = self.prev_pts[status == 1]
            
            if len(good_new) > 0:
                # Calculate movement vectors
                movements = good_new - good_old
                # Calculate magnitude (velocity)
                magnitudes = np.sqrt(np.sum(movements**2, axis=1))
                
                # Filter out pure noise and extreme anomalies (Relative to threshold)
                valid_magnitudes = magnitudes[(magnitudes > 0.5) & (magnitudes < (v_thresh * 5))]
                
                if len(valid_magnitudes) > 0:
                    self.avg_velocity = float(np.mean(valid_magnitudes))
                    self.avg_variance = float(np.var(valid_magnitudes))
                    if np.isnan(self.avg_variance):
                        self.avg_variance = 0.0
                        
                    self.acceleration = float(self.avg_velocity - self.last_velocity)
                    self.last_velocity = self.avg_velocity
                    
                    result["avg_velocity"] = self.avg_velocity
                    result["variance"] = self.avg_variance
                    result["acceleration"] = self.acceleration
                    
                    # Evaluate Panic Logic
                    if (self.avg_velocity > v_thresh and 
                        current_crowd_count >= d_thresh):
                        
                        now = datetime.now(timezone.utc)
                        # Check cooldown
                        if (self.last_trigger_time is None or 
                           (now - self.last_trigger_time).total_seconds() >= c_window):
                            
                            result["panic_detected"] = True
                            result["reason"] = f"Sudden velocity spike ({self.avg_velocity:.1f}px/s) in dense crowd ({current_crowd_count} people)."
                            self.last_trigger_time = now
                            
                            logger.warning(
                                f"🚨 CROWD SURGE/PANIC DETECTED on camera {camera_id}",
                                extra={
                                    "velocity": self.avg_velocity,
                                    "count": current_crowd_count
                                }
                            )
                        
            # Update previous frame and points for next cycle
            self.prev_gray = gray.copy()
            if len(good_new) < 50:
                self.prev_pts = cv2.goodFeaturesToTrack(gray, mask=None, **self.feature_params)
            else:
                self.prev_pts = good_new.reshape(-1, 1, 2)
        else:
            self.prev_pts = None
            
        return result
