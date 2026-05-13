from sqlalchemy import String, JSON, Float, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import BaseModel
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

class Journey(BaseModel):
    """
    Persistent model for cross-camera person journeys.
    Stores the traversal path and the best evidence snapshot captured.
    """
    __tablename__ = "journeys"

    global_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    
    # Store the latest ReID embedding (normalized histogram)
    latest_embedding_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    
    # Last time this person was seen by any camera
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        onupdate=func.now(),
        index=True
    )
    
    # Similarity score from the last match
    latest_similarity: Mapped[float] = mapped_column(Float, default=1.0)
    
    # Traversal path: list of {"camera_id": str, "camera_name": str, "timestamp": str, "dwell_time": int, "intent": str}
    path: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    
    # Path to the best evidence snapshot (face-focused if possible)
    canonical_image_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
