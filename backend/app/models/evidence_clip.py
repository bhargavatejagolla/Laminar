"""
Laminar - Evidence Clip Model
------------------------------

Tracks video clips recorded automatically or manually from cameras.
Clips are saved to local storage/S3 and indexed here.
"""
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy import (
    String,
    Integer,
    ForeignKey,
    DateTime,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

class EvidenceClip(BaseModel):
    """
    Metadata for a saved video clip containing evidence.
    """
    __tablename__ = "evidence_clips"

    camera_id: Mapped[UUID] = mapped_column(
        ForeignKey("cameras.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    camera: Mapped["Camera"] = relationship(
        "Camera",
        lazy="joined",
    )

    # File path on disk (or S3 key)
    file_path: Mapped[str] = mapped_column(
        String(1000),
        nullable=False,
    )

    # Length of the clip in seconds
    duration_seconds: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # Status: 'recording', 'completed', 'failed'
    status: Mapped[str] = mapped_column(
        String(20),
        default="recording",
        nullable=False,
    )

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
