"""
Laminar - User Model (Minimal Core Version)
-------------------------------------------

Essential user model for Laminar Phase 1-2.
Focuses on identity, roles, and alert assignments.
Easily extendable as auth requirements grow.

Current Scope:
- Identity (id, email)
- Authentication ready (password_hash)
- Role-based access (admin, manager, operator, viewer)
- Alert assignment relationship
- Basic timestamps

Future Extensions (add when needed):
- Profile fields (name, avatar, phone)
- Multi-tenant venue access
- Session management
- Two-factor auth
- Preferences
"""
from uuid import UUID, uuid4
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from datetime import datetime
from typing import Optional, List
import enum

from sqlalchemy import (
    Integer,
    String,
    DateTime,
    Boolean,
    Enum as SQLEnum,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ==========================================================
# Enums
# ==========================================================

class UserRole(enum.Enum):
    """User roles for authorization."""
    ADMIN = "admin"        # Full system access
    MANAGER = "manager"    # Can manage venues and cameras
    OPERATOR = "operator"  # Can view and acknowledge alerts
    VIEWER = "viewer"      # Read-only access


# ==========================================================
# User Model (Minimal Core)
# ==========================================================

class User(Base):
    """
    Core user model for authentication and authorization.
    
    Minimal implementation for Phase 1-2:
    - Authentication ready (email + password_hash)
    - Role-based access control
    - Alert assignments
    
    Designed for easy extension as requirements grow.
    """
    __tablename__ = "users"

    # ==========================================================
    # Primary Key
    # ==========================================================

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        index=True
    )

    # ==========================================================
    # Authentication Fields
    # ==========================================================

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False
    )

    password_hash: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )
    
    google_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        unique=True,
        index=True
    )

    # Email verification
    is_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True
    )

    verification_token: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        unique=True,
        index=True
    )

    verification_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # ==========================================================
    # Authorization
    # ==========================================================

    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole),
        nullable=False,
        default=UserRole.VIEWER,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True
    )

    # ==========================================================
    # Profile Fields
    # ==========================================================

    name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )
    
    phone_number: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True
    )
    
    profile_picture: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )
    
    receive_sms_alerts: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False
    )

    alert_email: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    receive_email_alerts: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    language_preference: Mapped[str] = mapped_column(
        String(10),
        default="en",
        server_default="en",
        nullable=False
    )

    # ==========================================================
    # Timestamps
    # ==========================================================

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # ==========================================================
    # Relationships
    # ==========================================================

    # Alerts acknowledged by this user
    # Can be added later when needed: acknowledged_alerts: Mapped[List["CrowdAlert"]] = relationship(...)

    # ==========================================================
    # Indexes for Performance
    # ==========================================================

    __table_args__ = (
        Index("ix_users_role_active", "role", "is_active"),
    )

    # ==========================================================
    # Properties & Helper Methods
    # ==========================================================

    def __repr__(self) -> str:
        """String representation."""
        return f"<User id={self.id} email='{self.email}' role={self.role.value}>"

    def record_login(self) -> None:
        """Record successful login timestamp."""
        self.last_login_at = datetime.utcnow()

    @property
    def is_admin(self) -> bool:
        """Check if user has admin role."""
        return self.role == UserRole.ADMIN

    @property
    def is_manager(self) -> bool:
        """Check if user has manager role or higher."""
        return self.role in (UserRole.ADMIN, UserRole.MANAGER)

    @property
    def is_operator(self) -> bool:
        """Check if user has operator role or higher."""
        return self.role in (UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR)


# ==========================================================
# Note: Future Extensions
# ==========================================================

"""
When you're ready to add more features, extend this model with:

1. Profile Fields:
   first_name: Mapped[Optional[str]] = mapped_column(String(100))
   last_name: Mapped[Optional[str]] = mapped_column(String(100))
   avatar_url: Mapped[Optional[str]] = mapped_column(String(500))

2. Security:
   reset_token: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
   reset_token_expires_at: Mapped[Optional[datetime]]
   login_attempts: Mapped[int] = mapped_column(Integer, default=0)

3. Multi-tenant Access:
   venue_ids: Mapped[Optional[List[int]]] = mapped_column(JSON)

4. Preferences:
   preferences: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict)

5. Soft Delete:
   deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

Add these incrementally as your auth requirements grow.
"""
