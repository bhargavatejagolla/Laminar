from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from app.models.base import Base
import uuid

class EmergencyProfile(Base):
    """
    Emergency profile for the Sentinel Emergency Beacon.
    Stores the user's registration details required for dispatching emergency help.
    """
    __tablename__ = "emergency_profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = Column(String, nullable=False)
    photo_url = Column(Text, nullable=True) # Could be base64 or a path
    default_address = Column(Text, nullable=False)
    emergency_contact_name = Column(String, nullable=False)
    emergency_contact_phone = Column(String, nullable=False)
    
    # Audit trail
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
