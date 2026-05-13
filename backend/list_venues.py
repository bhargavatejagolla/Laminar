import sys
import asyncio
import os

sys.path.append(os.path.abspath("."))
from app.core.database import db_manager
from sqlalchemy import select
from app.models.venue import Venue

async def main():
    await db_manager.initialize()
    async with db_manager.session() as session:
        result = await session.execute(select(Venue))
        venues = result.scalars().all()
        for v in venues:
            print(f"ID={v.id} Name={v.name} Lat={v.latitude} Lon={v.longitude} VenueType={v.venue_type}")
        print(f"Total: {len(venues)}")
    await db_manager.close()

if __name__ == "__main__":
    asyncio.run(main())
