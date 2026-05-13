import asyncio
from app.core.database import db_manager
from app.models.venue import Venue
from sqlalchemy import select

async def check_venue():
    async with db_manager.session() as session:
        stmt = select(Venue).where(Venue.name == 'champak')
        result = await session.execute(stmt)
        venue = result.scalar_one_or_none()
        if venue:
            print(f"ID: {venue.id}")
            print(f"Name: {venue.name}")
            print(f"Type: {venue.venue_type}")
            print(f"Capacity: {venue.capacity}")
            print(f"Warn: {venue.warning_threshold}")
            print(f"Crit: {venue.critical_threshold}")
        else:
            print("Venue 'champak' not found.")

if __name__ == "__main__":
    asyncio.run(check_venue())
