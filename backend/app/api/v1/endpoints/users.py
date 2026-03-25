"""
Laminar - Users Endpoints
-------------------------
Handles:
- Fetching user profile
- Updating user profile
- Uploading profile pictures
"""

import os
import shutil
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import db_manager
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.alert_contact import AlertContact
from app.schemas.users import UserProfileUpdate, UserProfileResponse

router = APIRouter(prefix="/users", tags=["Users"])

# Define storage directory for profile pictures
PROFILE_PICS_DIR = "storage/profile_pictures"
os.makedirs(PROFILE_PICS_DIR, exist_ok=True)

@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(current_user: User = Depends(get_current_active_user)):
    """Fetch the current authenticated user's profile."""
    return current_user

@router.put("/profile/update", response_model=UserProfileResponse)
async def update_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """
    Update the current authenticated user's profile information.
    Syncs the receive_sms_alerts preference to the AlertContacts table.
    """
    async with db_manager.session() as session:
        # Fetch fresh user object bound to this session
        stmt = select(User).where(User.id == current_user.id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if payload.name is not None:
            user.name = payload.name
            
        if payload.phone_number is not None:
            user.phone_number = payload.phone_number
            
        if payload.receive_sms_alerts is not None:
            user.receive_sms_alerts = payload.receive_sms_alerts
            
            # Sync SMS preferences to AlertContacts table
            if user.phone_number:
                contact_stmt = select(AlertContact).where(AlertContact.user_id == user.id)
                contact_result = await session.execute(contact_stmt)
                contact = contact_result.scalar_one_or_none()
                
                if contact:
                    contact.receive_sms = payload.receive_sms_alerts
                    contact.phone_number = user.phone_number
                elif payload.receive_sms_alerts:
                    # Create new contact if they enabled alerts but didn't have one
                    new_contact = AlertContact(
                        user_id=user.id,
                        phone_number=user.phone_number,
                        receive_sms=True
                    )
                    session.add(new_contact)
        
        if payload.language_preference is not None:
            user.language_preference = payload.language_preference
            
        if payload.alert_email is not None:
            user.alert_email = payload.alert_email
            
        if payload.receive_email_alerts is not None:
            user.receive_email_alerts = payload.receive_email_alerts
            
        await session.commit()
        await session.refresh(user)
        return user

@router.post("/profile/picture", response_model=UserProfileResponse)
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    """Upload a profile picture for the current user."""
    # Basic validation
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
        
    async with db_manager.session() as session:
        # Fetch fresh user
        stmt = select(User).where(User.id == current_user.id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Save the file
        file_ext = file.filename.split(".")[-1]
        filename = f"user_{current_user.id}.{file_ext}"
        file_path = os.path.join(PROFILE_PICS_DIR, filename)
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")
            
        # Update user profile
        # Use forward slashes for web URLs regardless of OS
        user.profile_picture = f"/profile_pictures/{filename}"
        
        await session.commit()
        await session.refresh(user)
        return user
