"""
Laminar - Alert Contact Model
-----------------------------

Stores contact information for users who opt to receive offline SMS alerts.
"""
from uuid import UUID, uuid4
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class AlertContact(Base):
    """
    Alert contact model for SMS notifications.
    Stores phone numbers that should receive critical crowd alerts.
    """
    __tablename__ = "alert_contacts"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        index=True
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    phone_number: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True
    )

    receive_sms: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<AlertContact id={self.id} phone='{self.phone_number}' receive_sms={self.receive_sms}>"
