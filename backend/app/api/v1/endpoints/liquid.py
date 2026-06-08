import base64
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ultralytics import YOLO
import os

router = APIRouter()

# Load YOLOv11 nano model for fast inference
MODEL_PATH = os.path.join(os.path.dirname(__file__), "../../../../yolo11n.pt")
try:
    model = YOLO(MODEL_PATH)
except Exception as e:
    print(f"Failed to load YOLO model from {MODEL_PATH}: {e}")
    model = None

class FrameRequest(BaseModel):
    image_base64: str  # Data URI format
    camera_id: str

# State trackers for smoothing and rise trend
state_tracker = {
    "current_coverage": 0.0,
    "history": []
}

@router.post("/analyze")
async def analyze_frame(req: FrameRequest):
    if model is None:
        raise HTTPException(status_code=500, detail="YOLO model not loaded")

    # Parse base64
    try:
        header, encoded = req.image_base64.split(",", 1)
        data = base64.b64decode(encoded)
        np_arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid image format")

    # Run YOLOv11
    results = model(img, verbose=False)[0]
    
    detections = []
    
    for box in results.boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        class_name = model.names[cls_id]
        
        if conf < 0.3:
            continue
            
        if class_name not in ['person', 'car', 'truck', 'bus']:
            continue

        x1, y1, x2, y2 = map(float, box.xyxy[0])
        w = x2 - x1
        h = y2 - y1

        detections.append({
            "class": class_name,
            "x": x1, "y": y1, "w": w, "h": h,
            "conf": conf
        })

    # --- ADVANCED HACKATHON WATER DETECTION: HSV + MORPHOLOGY ---
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h_img, w_img = hsv.shape[:2]
    roi_top = int(h_img * 0.25)
    roi_hsv = hsv[roi_top:, :, :]
    
    # Flood water is typically gray/brown with very low saturation and medium brightness
    lower_water = np.array([0, 0, 40])
    upper_water = np.array([180, 80, 255])
    raw_mask = cv2.inRange(roi_hsv, lower_water, upper_water)
    
    # Clean up noise (cars, rain, artifacts) using morphological operations
    kernel = np.ones((5, 5), np.uint8)
    opened = cv2.morphologyEx(raw_mask, cv2.MORPH_OPEN, kernel)
    water_mask = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)
    
    total_roi_pixels = water_mask.shape[0] * water_mask.shape[1]
    water_pixels = cv2.countNonZero(water_mask)
    base_water_coverage = (water_pixels / total_roi_pixels) * 100.0 if total_roi_pixels > 0 else 0
    
    # Modest scaling to make it realistic
    cv_water_coverage = min(100.0, base_water_coverage * 1.5)
    
    # Smooth water coverage so it doesn't jump wildly
    smoothed_coverage = (state_tracker["current_coverage"] * 0.8) + (cv_water_coverage * 0.2)
    state_tracker["current_coverage"] = smoothed_coverage
    
    # Traffic Disruption Score
    vehicle_count = len([d for d in detections if d['class'] in ['car', 'truck', 'bus']])
    traffic_disruption = min(100.0, (smoothed_coverage * 0.6) + (vehicle_count * 5.0))
    
    # Road Visibility Loss
    road_visibility_loss = min(100.0, smoothed_coverage * 1.1)
    
    # Rise Trend
    state_tracker["history"].append(smoothed_coverage)
    if len(state_tracker["history"]) > 20:
        state_tracker["history"].pop(0)
        
    trend_val = 0.0
    if len(state_tracker["history"]) >= 10:
        diff = state_tracker["history"][-1] - state_tracker["history"][0]
        trend_val = min(100.0, max(0.0, diff * 5.0))
        
    # Final Severity Formula
    severity = (0.45 * smoothed_coverage) + (0.25 * traffic_disruption) + (0.20 * road_visibility_loss) + (0.10 * trend_val)
    severity = max(8.0, min(100.0, severity))  # Minimum 8 to keep UI alive

    return {
        "severity": round(severity, 1),
        "water_coverage": round(smoothed_coverage, 1),
        "traffic_disruption": round(traffic_disruption, 1),
        "road_visibility_loss": round(road_visibility_loss, 1),
        "rise_trend": round(trend_val, 1),
        "detections": detections
    }
