"""
Laminar - Behavior Detection API Endpoints
-------------------------------------------
"""
from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_active_user
from app.services.behavior_detector import behavior_detector, BEHAVIOR_ENABLED

router = APIRouter(prefix="/behavior", tags=["Behavior Detection"])


@router.get("/status")
async def behavior_status(user=Depends(get_current_active_user)):
    """Get current behavior detection status."""
    return {
        "enabled": BEHAVIOR_ENABLED,
        "model": "yolov8n-pose.pt",
        "detected_behaviors": ["loitering", "running", "stationary_cluster"],
        "enable_instruction": "Set ENABLE_BEHAVIOR_DETECTION=true in backend/.env and restart",
    }
