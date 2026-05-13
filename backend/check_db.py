
import asyncio
from uuid import UUID
from sqlalchemy import select
from app.core.database import db_manager
from app.models.venue import Venue
from app.models.camera import Camera

async def check_assignments():
    await db_manager.initialize()
    async with db_manager.session() as session:
        # Check all venues and their cameras
        stmt = select(Venue)
        res = await session.execute(stmt)
        venues = res.scalars().all()
        
        print("=== VENUES ===")
        for v in venues:
            print(f"Venue: {v.name} ({v.id}) | Domain: {v.venue_type} | Capacity: {v.capacity}")
            
            # Find cameras for this venue
            c_stmt = select(Camera).where(Camera.venue_id == v.id)
            c_res = await session.execute(c_stmt)
            cameras = c_res.scalars().all()
            for c in cameras:
                print(f"  -> Camera: {c.name} ({c.id}) | Status: {'ONLINE' if c.is_online else 'OFFLINE'} | Active: {c.is_active}")

if __name__ == "__main__":
    asyncio.run(check_assignments())
