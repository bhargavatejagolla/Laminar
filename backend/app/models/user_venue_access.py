from uuid import UUID
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, Column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func

from app.core.database import Base


class UserVenueAccess(Base):
    """
    Many-to-Many mapping table linking Users and Venues.
    Used to implement Role-Based Access Control allowing standard Users and location Admins
    to only view/edit entities strictly inside their configured locations.
    """
    __tablename__ = "user_venue_access"

    user_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        index=True
    )
    
    venue_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("venues.id", ondelete="CASCADE"),
        primary_key=True,
        index=True
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    def __repr__(self) -> str:
        return f"<UserVenueAccess user={self.user_id} venue={self.venue_id}>"
