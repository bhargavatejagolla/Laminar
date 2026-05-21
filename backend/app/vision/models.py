"""
Laminar - Model Manager
-----------------------

Provides access to shard AI models across the vision pipeline.
Avoids redundant model loading across different specialized workers.
"""

import logging
from typing import Any, Optional
from app.vision.detector import detector

logger = logging.getLogger(__name__)

class ModelManager:
    """
    Central hub for AI model retrieval.
    """

    @staticmethod
    def get_model(model_id: str) -> Any:
        """
        Returns a pre-loaded YOLO or Pose model instance.
        
        Args:
            model_id: Filename or identifier of the model (e.g., 'yolov8n-pose.pt').
            
        Returns:
            YOLO model instance.
        """
        # If pose model is requested, return the one from the shared detector
        if "pose" in model_id:
            if hasattr(detector, "pose_model"):
                return detector.pose_model
            else:
                logger.warning("ModelManager: detector.pose_model not initialized, falling back to main model")
                return detector.model
        
        # Default to the primary crowd/object detection model
        return detector.model
