from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.core.database import get_db
from app.models.venue_event import VenueEvent
from app.core.repository import Repository

router = APIRouter(prefix="/events", tags=["Events"])

event_repo = Repository[VenueEvent](VenueEvent)


@router.post("")
async def create_event(
    venue_id: str,
    event_type: str,
    start_time: datetime,
    end_time: datetime,
    description: str | None = None,
    session: AsyncSession = Depends(get_db),
):

    event = VenueEvent(
        venue_id=venue_id,
        event_type=event_type,
        start_time=start_time,
        end_time=end_time,
        description=description,
    )

    created = await event_repo.create(session, event, commit=True)

    return created
