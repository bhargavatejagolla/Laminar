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
from app.core.dependencies import get_current_active_user, require_role
from app.models.user import User, UserRole
from app.models.venue import Venue
from app.models.alert_contact import AlertContact
from app.schemas.users import UserProfileUpdate, UserProfileResponse, UserAdminResponse, UserRoleUpdate, UserVenueUpdate
from sqlalchemy.orm import selectinload
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])

# Define storage directory for profile pictures
PROFILE_PICS_DIR = "storage/profile_pictures"
os.makedirs(PROFILE_PICS_DIR, exist_ok=True)

@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(current_user: User = Depends(get_current_active_user)):
    """Fetch the current authenticated user's profile."""
    try:
        # Use a fresh session to ensure the user object is not detached and attributes are accessible
        async with db_manager.session() as session:
            stmt = select(User).where(User.id == current_user.id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            
            if not user:
                # Fallback to dependency user if DB re-fetch fails
                user = current_user

            # Defensive Role extraction
            user_role = "user"
            try:
                if hasattr(user.role, "value"):
                    user_role = user.role.value
                else:
                    user_role = str(user.role)
            except Exception:
                pass

            return UserProfileResponse(
                id=user.id,
                email=user.email,
                role=user_role,
                is_active=user.is_active,
                name=getattr(user, "name", None),
                phone_number=getattr(user, "phone_number", None),
                profile_picture=getattr(user, "profile_picture", None),
                receive_sms_alerts=getattr(user, "receive_sms_alerts", False),
                alert_email=getattr(user, "alert_email", None),
                receive_email_alerts=getattr(user, "receive_email_alerts", False),
                language_preference=getattr(user, "language_preference", "en"),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"CRITICAL PROFILE FETCH ERROR for user {getattr(current_user, 'id', 'unknown')}")
        raise HTTPException(status_code=500, detail=f"Internal Profile Engine Error: {str(e)}")

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


# ==========================================================
# SUPER ADMIN CONTROL ENDPOINTS
# ==========================================================

@router.get("/admin/all", response_model=list[UserAdminResponse])
async def get_all_users(
    user: User = Depends(require_role(UserRole.SUPER_ADMIN))
):
    """Fetch all users and their mapped venues."""
    async with db_manager.session() as session:
        stmt = select(User).options(selectinload(User.venues)).order_by(User.email.asc())
        result = await session.execute(stmt)
        users = result.scalars().all()
        
        output = []
        for u in users:
            admin_data = UserAdminResponse.model_validate(u)
            admin_data.venues_mapped = [v.id for v in getattr(u, 'venues', [])]
            output.append(admin_data)
        return output

@router.put("/{target_user_id}/role", response_model=UserAdminResponse)
async def update_user_role(
    target_user_id: UUID,
    payload: UserRoleUpdate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN))
):
    """Alter a user's permission boundary (e.g. USER, ADMIN, SUPER_ADMIN)."""
    async with db_manager.session() as session:
        target_user = await session.get(User, target_user_id, options=[selectinload(User.venues)])
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        target_user.role = UserRole(payload.role)
        await session.commit()
        await session.refresh(target_user)
        
        resp = UserAdminResponse.model_validate(target_user)
        resp.venues_mapped = [v.id for v in getattr(target_user, 'venues', [])]
        return resp

@router.put("/{target_user_id}/venues", response_model=UserAdminResponse)
async def map_user_venues(
    target_user_id: UUID,
    payload: UserVenueUpdate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN))
):
    """
    Bind specific Locations (Venues) to a User profile dictating Zero-Trust boundaries.
    Both SUPER_ADMIN and ADMIN are allowed (Admin can assign base users).
    """
    async with db_manager.session() as session:
        target_user = await session.get(User, target_user_id, options=[selectinload(User.venues)])
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
            
        if not user.is_super_admin and target_user.role == UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Cannot alter mapping of global admins")
            
        # Fetch the physical Venue boundaries
        if len(payload.venue_ids) == 0:
            assigned_venues = []
        else:
            stmt = select(Venue).where(Venue.id.in_(payload.venue_ids))
            result = await session.execute(stmt)
            assigned_venues = result.scalars().all()
            
        # Optional validation: if caller is Admin, ensure they actually own the venues they are assigning.
        if not user.is_super_admin:
            allowed_venues = [v.id for v in user.venues]
            for v in assigned_venues:
                if v.id not in allowed_venues:
                    raise HTTPException(status_code=403, detail="Cannot assign locales outside of your jurisdiction")

        target_user.venues = list(assigned_venues)
        
        await session.commit()
        await session.refresh(target_user)
        
        resp = UserAdminResponse.model_validate(target_user)
        resp.venues_mapped = [v.id for v in target_user.venues]
        return resp

@router.delete("/{target_user_id}", response_model=UserAdminResponse)
async def deactivate_user(
    target_user_id: UUID,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN))
):
    """Deactivate a user account (soft-delete)."""
    async with db_manager.session() as session:
        target_user = await session.get(User, target_user_id, options=[selectinload(User.venues)])
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if target_user.id == user.id:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

        target_user.is_active = False
        await session.commit()
        await session.refresh(target_user)
        
        resp = UserAdminResponse.model_validate(target_user)
        resp.venues_mapped = [v.id for v in getattr(target_user, 'venues', [])]
        return resp

