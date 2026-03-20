"""
Laminar - Authentication Endpoints
----------------------------------
Handles:
- User registration
- User login
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status,Depends
from sqlalchemy import select
from app.core.dependencies import get_current_active_user
from app.core.database import db_manager
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
)
from app.models.user import User, UserRole
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    GoogleAuthRequest,
)
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["Auth"])


from fastapi import BackgroundTasks
import secrets

# ==========================================================
# Register
# ==========================================================

@router.post("/register", response_model=UserResponse)
async def register_user(payload: RegisterRequest, background_tasks: BackgroundTasks):

    async with db_manager.session() as session:

        # Check if email exists
        stmt = select(User).where(User.email == payload.email)
        result = await session.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            # If the user registered via Google (no password), allow them to set a password now.
            if not existing_user.password_hash:
                existing_user.password_hash = hash_password(payload.password)
                # Keep existing verification status
                await session.commit()
                await session.refresh(existing_user)
                return existing_user
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered",
                )

        # Generate Verification Token
        token = secrets.token_urlsafe(32)
        
        # Admin list (hardcoded for now as per user request)
        ADMIN_EMAILS = ["admin@laminar.ai", "bhargavatejgolla@gmail.com"]
        assigned_role = UserRole.ADMIN if payload.email.lower() in ADMIN_EMAILS else UserRole.VIEWER

        # Create user
        user = User(
            email=payload.email,
            password_hash=hash_password(payload.password),
            is_verified=False,
            verification_token=token,
            role=assigned_role
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        # In a generic production environment, this is where we would send 
        # a real email asynchronously utilizing background_tasks
        print(f"DEBUG: Send Verification Email to {user.email} with link http://localhost:3000/verify?token={token}")

        return user


# ==========================================================
# Verify Email
# ==========================================================

@router.get("/verify-email")
async def verify_email(token: str):
    async with db_manager.session() as session:
        stmt = select(User).where(User.verification_token == token)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification token",
            )
            
        if user.is_verified:
            return {"message": "Email already verified"}
            
        user.is_verified = True
        user.verification_token = None
        await session.commit()
        
        return {"message": "Email successfully verified"}


from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# ==========================================================
# Google OAuth Auto Login / Signup
# ==========================================================

# NOTE: Since this is a sample/MVP, we don't strictly require a specific CLIENT_ID here, 
# but in a true production system, you MUST pass your specific Google App Client ID.
# For simplicity, we're skipping full audience verification for this phase to accommodate testing.

@router.post("/google", response_model=TokenResponse)
async def google_auth(payload: GoogleAuthRequest):
    """
    Authenticate with Google ID Token.
    Automatically signs up a new user if they don't exist.
    """
    async with db_manager.session() as session:
        try:
            # Verify the Google ID token
            # Use our registered CLIENT_ID as the audience if configured
            google_client_id = settings.GOOGLE_CLIENT_ID
            if google_client_id:
                idinfo = id_token.verify_oauth2_token(
                    payload.token,
                    google_requests.Request(),
                    audience=google_client_id,
                )
            else:
                # Development fallback — skips audience verification
                # WARNING: This is insecure for production. Set GOOGLE_CLIENT_ID in .env
                idinfo = id_token.verify_oauth2_token(
                    payload.token,
                    google_requests.Request(),
                )
            
            # Extract user info
            google_id = idinfo["sub"]
            email = idinfo["email"]
            is_email_verified = idinfo.get("email_verified", False)

            # Check if user exists by google_id or email
            stmt = select(User).where((User.google_id == google_id) | (User.email == email))
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()

            if not user:
                ADMIN_EMAILS = ["admin@laminar.ai", "bhargavatejgolla@gmail.com"]
                assigned_role = UserRole.ADMIN if email.lower() in ADMIN_EMAILS else UserRole.VIEWER
                # Automagically create user
                user = User(
                    email=email,
                    google_id=google_id,
                    password_hash=None, # No password for OAuth users
                    is_verified=is_email_verified,
                    role=assigned_role, 
                )
                session.add(user)
                await session.flush() # flush to get an ID before committing
                await session.refresh(user) # ensure all defaults (like is_active) are populated
            else:
                # If they exist by email but no google_id is linked yet, link it
                if not user.google_id:
                    user.google_id = google_id
                
                if not user.is_active:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="User account is disabled",
                    )
                    
            # Update last login
            user.last_login_at = datetime.now(timezone.utc)
            await session.commit()

            # Generate regular system JWT
            token = create_access_token(
                user_id=user.id,
                role=user.role.value,
            )

            return TokenResponse(access_token=token)

        except ValueError as e:
            # Invalid token
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Google authentication token: {str(e)}",
            )


# ==========================================================
# Login
# ==========================================================

@router.post("/login", response_model=TokenResponse)
async def login_user(payload: LoginRequest):

    async with db_manager.session() as session:

        stmt = select(User).where(User.email == payload.email)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        if not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account was created with Google Sign-In. Please use Google Sign-In or register a password.",
            )

        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is disabled",
            )

        # Update last login
        user.last_login_at = datetime.now(timezone.utc)
        await session.commit()

        # Create JWT
        token = create_access_token(
            user_id=user.id,
            role=user.role.value,
        )

        return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(
    user=Depends(get_current_active_user),
):
    return user
