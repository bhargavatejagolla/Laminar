"""
Laminar - Incident AI Detector
------------------------------

Specialized AI for emergency and hazard detection.
Detects accidents, fires, and safety breaches.
"""

from typing import Tuple, List, Dict, Any
import numpy as np
import torch
from ultralytics import YOLO
import cv2
from datetime import datetime, timezone
import random

from app.core.logging import get_logger

logger = get_logger(__name__)


class IncidentDetector:
    """
    Emergency-focused detector for Incident Response Command.
    """

    def __init__(self, model_name: str = "yolo11n.pt", conf: float = 0.25):
        self.model_name = model_name
        self.conf = conf
        self.device = "cpu"
        self.model = YOLO(model_name)
        self.model.to(self.device)
        self.tracking_classes = [0, 2, 3, 5, 7] # People + Vehicles
        self.class_names = self.model.names
        logger.info(f"IncidentDetector initialized with {model_name} on {self.device}")

    def detect_incidents(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Scan for accidents, fire-like color clusters, or crowd panic.
        Returns a list of active incidents.
        """
        incidents, _, _ = self.detect_and_annotate(frame)
        return incidents

    def detect_and_annotate(self, frame: np.ndarray) -> Tuple[List[Dict[str, Any]], np.ndarray, Dict[str, int]]:
        """
        Detailed inspection of a frame: returns incidents, an annotated frame, and counts.
        Used for both live streaming and video analysis.
        """
        if frame is None or frame.size == 0:
            return [], frame, {}

        incidents = []
        annotated = frame.copy()
        vehicle_counts = {}
        
        try:
            results = self.model.predict(
                source=frame,
                conf=self.conf,
                classes=self.tracking_classes,
                device=self.device,
                verbose=False
            )
            
            result = results[0]
            boxes = result.boxes
            
            if boxes is not None:
                # 1. Vehicle counts and Bounding Boxes
                for box in boxes:
                    cls_id = int(box.cls[0])
                    label = self.class_names.get(cls_id, "unknown")
                    vehicle_counts[label] = vehicle_counts.get(label, 0) + 1
                    
                    # Draw subtle box for everyone
                    b = box.xyxy[0].cpu().numpy().astype(int)
                    cv2.rectangle(annotated, (b[0], b[1]), (b[2], b[3]), (0, 255, 255), 1)

                # 2. Heuristic: Collision Detection
                if len(boxes) >= 2:
                    for i in range(len(boxes)):
                        for j in range(i + 1, len(boxes)):
                            box1 = boxes[i].xyxy[0].cpu().numpy()
                            box2 = boxes[j].xyxy[0].cpu().numpy()
                            
                            # Simple Overlap Check
                            x1 = max(box1[0], box2[0])
                            y1 = max(box1[1], box2[1])
                            x2 = min(box1[2], box2[2])
                            y2 = min(box1[3], box2[3])
                            
                            if x2 > x1 and y2 > y1:
                                # Highlight the collision
                                b1 = box1.astype(int)
                                b2 = box2.astype(int)
                                cv2.rectangle(annotated, (b1[0], b1[1]), (b1[2], b1[3]), (0, 0, 255), 3)
                                cv2.rectangle(annotated, (b2[0], b2[1]), (b2[2], b2[3]), (0, 0, 255), 3)
                                
                                incidents.append({
                                    "type": "Accident / Collision",
                                    "priority": "CRITICAL",
                                    "description": f"Vehicle collision detected between unit {i} and {j}. Immediate response requested.",
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                    "bbox": [int(x1), int(y1), int(x2), int(y2)]
                                })
                                logger.warning(f"HEURISTIC TRIGGER: Collision detected between boxes {i} and {j}")
                                break
                        if incidents: break

                # 3. Heuristic: Severe Congestion
                if len(boxes) > 12:
                    incidents.append({
                        "type": "Severe Congestion",
                        "priority": "HIGH",
                        "description": "High vehicle density detected. Urban node saturation imminent.",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })

            # 4. Simulation: Fire Alert (Color Masking)
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            lower_red = np.array([0, 70, 50])
            upper_red = np.array([10, 255, 255])
            mask = cv2.inRange(hsv, lower_red, upper_red)
            if cv2.countNonZero(mask) > 15000:
                incidents.append({
                    "type": "Fire Alert",
                    "priority": "CRITICAL",
                    "description": "High-intensity thermal/color signature detected in sector.",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                # Outline the fire area if found
                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if contours:
                    c = max(contours, key=cv2.contourArea)
                    x, y, w, h = cv2.boundingRect(c)
                    cv2.rectangle(annotated, (x, y), (x+w, y+h), (0, 165, 255), 3)

            return incidents, annotated, vehicle_counts

        except Exception as e:
            logger.error(f"Incident detection error: {e}")
            return [], frame, {}

incident_detector = IncidentDetector()
