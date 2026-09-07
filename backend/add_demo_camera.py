import asyncio
import uuid
from app.core.database import async_session_factory
from app.models.venue import Venue, VenueDomain
from app.models.camera import Camera

async def main():
    async with async_session_factory() as session:
        # Check if we already have a traffic venue
        from sqlalchemy import select
        result = await session.execute(select(Venue).where(Venue.venue_type == VenueDomain.TRAFFIC))
        venue = result.scalar_one_or_none()
        
        if not venue:
            print("Creating Demo Traffic Venue...")
            venue = Venue(
                id=uuid.uuid4(),
                name="Downtown Intersection Alpha",
                venue_type=VenueDomain.TRAFFIC,
                status="active"
            )
            session.add(venue)
            await session.commit()
            
        # Check if we have cameras for this venue
        result = await session.execute(select(Camera).where(Camera.venue_id == venue.id))
        camera = result.scalar_one_or_none()
        
        if not camera:
            print("Creating Demo Traffic Camera...")
            camera = Camera(
                id=uuid.uuid4(),
                venue_id=venue.id,
                name="Northbound Traffic Cam 1",
                stream_type="file",
                stream_url="demo_traffic.mp4",
                camera_type="traffic",
                is_active=True,
                is_online=True,
                health_status="healthy"
            )
            session.add(camera)
            await session.commit()
            print("Successfully added demo data!")
        else:
            print("Demo data already exists.")

if __name__ == "__main__":
    asyncio.run(main())
