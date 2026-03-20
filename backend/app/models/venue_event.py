from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.core.database import Base


class VenueEvent(Base):
    __tablename__ = "venue_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    venue_id = Column(UUID(as_uuid=True), ForeignKey(
        "venues.id"), nullable=False)

    event_type = Column(String, nullable=False)
    description = Column(String)

    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)

    created_at = Column(DateTime(timezone=True))

    venue = relationship("Venue")
