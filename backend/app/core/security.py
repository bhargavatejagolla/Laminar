"""
Laminar - Security Core
-----------------------

Handles:
- Password hashing
- JWT creation
- JWT validation
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from uuid import UUID

from jose import jwt, JWTError
import bcrypt

from app.core.config import settings


# ==========================================================
# Password Hashing
# ==========================================================


def hash_password(password: str) -> str:
    """Hash plain password."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify password against hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), 
            password_hash.encode("utf-8")
        )
    except Exception:
        return False


# ==========================================================
# JWT Token Handling
# ==========================================================

ALGORITHM = "HS256"


def create_access_token(
    user_id: UUID,
    role: str,
    expires_minutes: int = 60,
) -> str:
    """
    Create signed JWT access token.
    """

    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)

    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }

    token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )

    return token


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate JWT token.
    """

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        return payload

    except JWTError:
        raise ValueError("Invalid or expired token")
