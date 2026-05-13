"""
Laminar - Auth Schemas
----------------------
Pydantic models for authentication.
"""

from pydantic import BaseModel, EmailStr, Field
from uuid import UUID
from typing import Optional


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: str = "bearer"
    verification_required: bool = False
    email: Optional[str] = None


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    is_active: bool
    name: Optional[str] = None

    class Config:
        from_attributes = True

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    otp: str

class ResendOTPRequest(BaseModel):
    email: EmailStr

class GoogleAuthRequest(BaseModel):
    token: str

