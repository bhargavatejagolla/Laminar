
import asyncio
from app.core.database import db_manager
from app.models.venue import Venue
from app.models.camera import Camera
from sqlalchemy import delete, select

async def cleanup():
    print("Starting database cleanup...")
    await db_manager.initialize()
    async with db_manager.session() as s:
        # 1. Identify "house" or "test" venues
        res = await s.execute(select(Venue).where(
            (Venue.name.ilike('%house%')) | (Venue.name.ilike('%test%'))
        ))
        venues = res.scalars().all()
        
        if not venues:
            print("No legacy venues found.")
        
        for v in venues:
            print(f"Deleting legacy venue: {v.name} ({v.id})")
            # Delete associated cameras first
            await s.execute(delete(Camera).where(Camera.venue_id == v.id))
            # Delete the venue
            await s.execute(delete(Venue).where(Venue.id == v.id))
            
        await s.commit()
        print("Cleanup complete.")
    
    await db_manager.close()

if __name__ == "__main__":
    asyncio.run(cleanup())
