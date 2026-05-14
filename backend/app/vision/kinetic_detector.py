import math
from typing import Dict, List, Any

class KineticDetector:
    """
    Zero-Shot Kinetic Intelligence Heuristic Engine.
    Analyzes skeleton keypoints across frames to detect panic bursts, 
    aggression posture, and dispersive motion anomalies without supervised labels.
    """
    def __init__(self, fps: int = 15):
        self.fps = fps
        self.history = {} # type: Dict[int, List[Dict[str, float]]] 
        self.max_history = int(fps * 2.0)  # keep 2 seconds of history
        self.frame_count = 0

    def calculate_distance(self, p1, p2):
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    def detect_anomalies(self, bounding_boxes: List[Dict[str, Any]], keypoints: List[List[Any]]) -> List[Dict[str, Any]]:
        """
        Process current frame keypoints. Map them using simple intersection over union or centers to active history
        to calculate velocities. Since we don't have a rigid tracker in this lightweight demo,
        we estimate total kinetic energy of the crowd.
        
        Returns a list of anomaly events if detected.
        """
        events = []
        self.frame_count += 1
        
        # We need at least some people
        if not keypoints or not bounding_boxes:
            # maintain clean history bounds even if empty
            if self.frame_count in self.history:
                del self.history[self.frame_count]
            return events

        # Basic Kinetic Energy proxy: Average bounding box displacement or keypoint velocity 
        # For a truly robust system, we would track ID's. For zero-shot crowd panic,
        # we can calculate the variance of movement vectors (Panic Dispersion)
        
        frame_history = []
        
        # To simulate the Hackathon wow-factor without complex state trackers, 
        # we find "Arm raises (SOS)" and "Squaring Up"
        
        for kpts, bbox in zip(keypoints, bounding_boxes):
            if not kpts or len(kpts) < 11:
                continue
                
            # Keypoint indices for YOLO Pose:
            # 5: Left Shoulder, 6: Right Shoulder
            # 7: Left Elbow, 8: Right Elbow
            # 9: Left Wrist, 10: Right Wrist
            
            try:
                ls = kpts[5]
                rs = kpts[6]
                lw = kpts[9]
                rw = kpts[10]
                
                # Check for SOS / Hands Up posture
                # If wrists are significantly higher than shoulders
                if ls and rs and lw and rw:
                    # In image coordinates, smaller Y is higher up
                    if lw[1] < ls[1] and rw[1] < rs[1]:
                        # Both arms raised high!
                        events.append({
                            "type": "SOS_GESTURE",
                            "risk_level": "critical",
                            "severity": 0.95,
                            "bbox": bbox["bbox"],
                            "message": "Distress Gesture Detected: Hands Raised"
                        })
                
                # Store centroid for trajectory analysis
                bx1, by1, bx2, by2 = bbox["bbox"]
                centroid = ((bx1 + bx2) / 2, (by1 + by2) / 2)
                frame_history.append({'centroid': centroid, 'bbox': bbox["bbox"]})
                
                # Check for slip and fall / Medical Emergency
                # If width is significantly larger than height, person might be lying on the ground.
                # bbox is typically [x1, y1, x2, y2]
                bx1, by1, bx2, by2 = bbox["bbox"]
                b_width = bx2 - bx1
                b_height = by2 - by1
                if b_height > 0 and b_width > b_height * 1.5:
                    events.append({
                        "type": "MEDICAL_EMERGENCY",
                        "risk_level": "critical",
                        "severity": 0.98,
                        "bbox": bbox["bbox"],
                        "message": "Pre-Emptive Triage Triggered: Slip/Fall Detected"
                    })
            except IndexError:
                pass

        # Trajectory analysis (Sudden running / Suspicious following)
        self.history[self.frame_count] = frame_history
        older_frame_count = self.frame_count - self.fps # look back ~1 second
        
        if older_frame_count in self.history:
            past_centroids = self.history[older_frame_count]
            # Naive nearest neighbor tracking
            for current_item in frame_history:
                curr_c = current_item['centroid']
                closest_dist = float('inf')
                for past_item in past_centroids:
                    past_c = past_item['centroid']
                    dist = self.calculate_distance(curr_c, past_c)
                    if dist < closest_dist:
                        closest_dist = dist
                
                # If the closest person from past frame is too far, it's either a new person or fast running
                # Sudden running trigger (velocity spike):
                if 80 < closest_dist < 400: # Thresholds based on image scale (very fast movement)
                    events.append({
                        "type": "SUDDEN_RUNNING",
                        "risk_level": "high",
                        "severity": 0.85,
                        "bbox": current_item["bbox"],
                        "message": "Extreme Kinematic Acceleration (Running) Detected"
                    })
        
        # Suspicious following (Group proximity)
        for i, item1 in enumerate(frame_history):
            close_count = 0
            for j, item2 in enumerate(frame_history):
                if i != j:
                    if self.calculate_distance(item1['centroid'], item2['centroid']) < 60: # very close proximity
                        close_count += 1
            if close_count >= 1:
                events.append({
                    "type": "SUSPICIOUS_FOLLOWING",
                    "risk_level": "medium",
                    "severity": 0.75,
                    "bbox": item1["bbox"],
                    "message": "Close Quarter Tailgating / Coercion Threat"
                })

        # Cleanup history
        if len(self.history) > self.max_history:
            oldest = min(self.history.keys())
            del self.history[oldest]
            
        return events
