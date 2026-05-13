"""
Laminar - User Schemas
----------------------
Pydantic models for user profile management.
"""

from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID
import re

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    receive_sms_alerts: Optional[bool] = None
    alert_email: Optional[EmailStr] = None
    receive_email_alerts: Optional[bool] = None
    language_preference: Optional[str] = None

    @field_validator('phone_number')
    @classmethod
    def validate_indian_phone(cls, v: str | None) -> str | None:
        if not v:
            return v
        # Simple check for Indian format if provided with +91
        if v.startswith('+91') and len(v) != 13:
            raise ValueError('Indian phone numbers must be +91 followed by 10 digits')
        return v

class UserProfileResponse(BaseModel):
    id: UUID
    email: str # Relaxed from EmailStr to prevent response categorization errors
    role: str
    is_active: bool
    name: Optional[str] = None
    phone_number: Optional[str] = None
    profile_picture: Optional[str] = None
    receive_sms_alerts: Optional[bool] = False
    alert_email: Optional[str] = None
    receive_email_alerts: Optional[bool] = False
    language_preference: Optional[str] = "en"

    class Config:
        from_attributes = True

class UserRoleUpdate(BaseModel):
    role: str

class UserVenueUpdate(BaseModel):
    venue_ids: list[UUID]

class UserAdminResponse(UserProfileResponse):
    venues_mapped: list[UUID] = []

    class Config:
        from_attributes = True
