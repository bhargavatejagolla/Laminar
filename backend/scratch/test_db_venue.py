import sys
import asyncio

backend_dir = r"c:\Users\bharg\OneDrive\Documents\ztest\laminar\backend"
sys.path.insert(0, backend_dir)

from app.core.database import db_manager
from sqlalchemy import select
from app.models.venue import Venue

async def f():
    print("Initializing DB...")
    await db_manager.initialize()
    print("Getting session...")
    async with db_manager.session() as s:
        print("Executing select(Venue)...")
        r = await s.execute(select(Venue))
        v_list = list(r.scalars().all())
        print(f"Venues found: {len(v_list)}")
        for v in v_list:
            print(f"  Venue: {v.name} ({v.id})")

if __name__ == "__main__":
    asyncio.run(f())
