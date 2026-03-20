from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


# =========================
# Request Schemas
# =========================

class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


# =========================
# Response Schema
# =========================

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime]

    class Config:
        from_attributes = True
