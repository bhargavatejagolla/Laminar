import asyncio
from app.core.config import settings
from app.core.database import db_manager
from app.models.venue import Venue
from sqlalchemy import select

async def run():
    await db_manager.initialize()
    async with db_manager.session() as s:
        res = await s.execute(select(Venue))
        venues = res.scalars().all()
        for v in venues:
            print(f"Venue: {v.name}, Capacity: {v.capacity}")

asyncio.run(run())
