from pydantic import BaseModel, Field
from typing import Optional

class EmergencyProfileCreate(BaseModel):
    full_name: str = Field(..., description="Full name of the user")
    photo_url: Optional[str] = Field(None, description="Base64 photo or URL")
    default_address: str = Field(..., description="Default residential address")
    emergency_contact_name: str = Field(..., description="Name of the emergency contact")
    emergency_contact_phone: str = Field(..., description="Phone number of the emergency contact")

class EmergencyProfileResponse(EmergencyProfileCreate):
    id: str
    
    class Config:
        from_attributes = True

class EmergencyTrigger(BaseModel):
    profile_id: str
    latitude: float
    longitude: float
