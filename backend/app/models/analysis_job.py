from sqlalchemy import String, Integer, Float, Boolean, JSON, Enum
from sqlalchemy.orm import Mapped, mapped_column
import enum
from typing import Optional, Dict, Any

from app.models.base import BaseModel

class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class AnalysisJob(BaseModel):
    __tablename__ = "analysis_jobs"

    job_id: Mapped[str] = mapped_column(String, index=True, nullable=False, unique=True)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.PENDING, index=True)
    
    # Media Info
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=True)
    media_type: Mapped[str] = mapped_column(String, default="video")
    
    # Progress and Stats
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0)
    frames_analyzed: Mapped[int] = mapped_column(Integer, default=0)
    
    # Results
    result_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
