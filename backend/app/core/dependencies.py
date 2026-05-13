"""
Laminar - Auth Dependencies
---------------------------
JWT validation and role-based access control.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import db_manager
from app.core.security import decode_token
from app.models.user import User, UserRole
from app.core.logging import get_logger

logger = get_logger(__name__)


# Security scheme
bearer_scheme = HTTPBearer()


# ==========================================================
# Get Current User
# ==========================================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> User:
    """
    Fetch and validate the current user from JWT token.
    Includes auto-promotion for specific admin emails.
    """
    token = credentials.credentials

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload: missing subject",
            )

        async with db_manager.session() as session:
            try:
                user_uuid = UUID(str(user_id))
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid user ID format in token",
                )

            # Eagerly load venues to avoid lazy-loading issues in async context
            stmt = select(User).options(selectinload(User.venues)).where(User.id == user_uuid)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()

            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found in system",
                )

            # Special logic for current user development: always ensure SUPER_ADMIN for bhargavatejgolla
            if user.email == "bhargavatejgolla@gmail.com" and user.role != UserRole.SUPER_ADMIN:
                # Ensure the user object doesn't expire after commit so attributes remain accessible after session closes
                session.expire_on_commit = False
                user.role = UserRole.SUPER_ADMIN
                await session.commit()
                try:
                    await session.refresh(user)
                except Exception:
                    pass
            
            logger.debug(f"AUTH SUCCESS: User {user.id} ({user.email}) fetched and validated.")
            return user

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, # Return 401 even for unhandled JWT errs
            detail=f"Authentication error: {str(e)}",
        )


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


