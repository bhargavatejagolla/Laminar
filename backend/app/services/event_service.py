from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.venue_event import VenueEvent
from app.core.logging import get_logger

logger = get_logger(__name__)


class EventService:

    EVENT_RISK_FACTORS = {
        "festival": 1.25,
        "concert": 1.20,
        "sports": 1.15,
        "political": 1.20,
        "religious": 1.30,
        "crowd_surge": 1.35,
    }

    async def get_active_event(
        self,
        session: AsyncSession,
        venue_id,
    ):
        now = datetime.now(timezone.utc)

        stmt = (
            select(VenueEvent)
            .where(VenueEvent.venue_id == venue_id)
            .where(VenueEvent.start_time <= now)
            .where(VenueEvent.end_time >= now)
        )

        result = await session.execute(stmt)

        return result.scalar_one_or_none()

    async def get_event_modifier(
        self,
        session: AsyncSession,
        venue_id,
    ):
        event = await self.get_active_event(session, venue_id)

        if not event:
            return 1.0, None

        factor = self.EVENT_RISK_FACTORS.get(event.event_type, 1.1)

        return factor, event.event_type
