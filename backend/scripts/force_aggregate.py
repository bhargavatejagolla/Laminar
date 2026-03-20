import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

# Add the backend directory to system path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import db_manager
from sqlalchemy import select
from app.models.venue import Venue
from app.models.camera import Camera
from app.services.metric_aggregation_service import MetricAggregationService

async def main():
    print("Starting manual backfill...")
    await db_manager.initialize()
    metric_service = MetricAggregationService()
    
    async with db_manager.session() as session:
        # Get all cameras
        result = await session.execute(select(Camera))
        cameras = result.scalars().all()
        
        print(f"Found {len(cameras)} cameras. Backfilling minutes...")
        for camera in cameras:
            try:
                # Backfill last 24 hours of minutes
                count = await metric_service.aggregate_missing_minutes(
                    session, camera_id=camera.id, hours=24
                )
                print(f"Camera {camera.id}: Backfilled {count} minute metrics")
            except Exception as e:
                print(f"Camera {camera.id}: Error backfilling minutes - {e}")

        # Get all venues
        result = await session.execute(select(Venue))
        venues = result.scalars().all()
        
        print(f"\nFound {len(venues)} venues. Generating hour metrics for the last 24 hours...")
        
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        
        for venue in venues:
            # Generate hour metrics for the last 24 hours
            for i in range(24):
                hour_start = now - timedelta(hours=i)
                try:
                    res = await metric_service.aggregate_hour(
                        session, venue_id=venue.id, hour_start=hour_start
                    )
                    if res:
                        print(f"Venue {venue.id}: Generated hour metric for {hour_start}")
                except Exception as e:
                    print(f"Venue {venue.id}: Error generating hour metric - {e}")
                    
        print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
