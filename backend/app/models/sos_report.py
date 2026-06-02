from sqlalchemy import Column, String, Boolean, DateTime, Enum, JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from uuid import uuid4
import enum

from app.core.database import Base

class SOSReportStatus(str, enum.Enum):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"
    FALSE_ALARM = "FALSE_ALARM"

class SOSReport(Base):
    __tablename__ = "sos_reports"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    tracking_id = Column(String(50), unique=True, index=True, nullable=False)
    
    reporter_name = Column(String(255), nullable=False)
    reporter_contact = Column(String(255), nullable=False)
    missing_name = Column(String(255), nullable=False)
    last_seen_location = Column(String(500), nullable=False)
    image_path = Column(String(1000), nullable=True)
    
    match_found = Column(Boolean, default=False)
    camera_location = Column(String(500), nullable=True)
    
    status = Column(Enum(SOSReportStatus), default=SOSReportStatus.OPEN, nullable=False, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<SOSReport {self.tracking_id} - {self.status.value}>"
