import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import async_session_factory, init_database
from app.models.dwell_monitor import PersonDwellTime
from app.models.camera import Camera

async def seed():
    await init_database()
    
    session_instance = await async_session_factory()
    async with session_instance as session:
        from sqlalchemy import select
        cameras = (await session.execute(select(Camera).limit(2))).scalars().all()
        
        if not cameras:
            print("No cameras found. Please add a camera to the system first.")
            return

        c1 = cameras[0]
        c2 = cameras[1] if len(cameras) > 1 else cameras[0]

        now = datetime.now(timezone.utc)
        
        amber_tracker_id = 999999

        records = [
            PersonDwellTime(
                camera_id=c1.id,
                tracker_id=amber_tracker_id,
                zone_name="Main Entrance Gate A",
                enter_time=now - timedelta(minutes=15),
                last_seen_time=now - timedelta(minutes=13),
                dwell_seconds=120,
                snapshot_enter_path="https://images.unsplash.com/photo-1544928147-79a2dbc1f389?w=300&h=300&fit=crop",
                snapshot_mid_path="https://images.unsplash.com/photo-1544928147-79a2dbc1f389?w=300&h=300&fit=crop",
            ),
            PersonDwellTime(
                camera_id=c1.id,
                tracker_id=amber_tracker_id,
                zone_name="Food Court Corridor",
                enter_time=now - timedelta(minutes=8),
                last_seen_time=now - timedelta(minutes=5),
                dwell_seconds=180,
                snapshot_enter_path="https://images.unsplash.com/photo-1544928147-79a2dbc1f389?w=300&h=300&fit=crop",
                snapshot_mid_path="https://images.unsplash.com/photo-1544928147-79a2dbc1f389?w=300&h=300&fit=crop",
            ),
            PersonDwellTime(
                camera_id=c2.id,
                tracker_id=amber_tracker_id,
                zone_name="East Exit Staging Area",
                enter_time=now - timedelta(minutes=2),
                last_seen_time=now,
                dwell_seconds=120,
                snapshot_enter_path="https://images.unsplash.com/photo-1544928147-79a2dbc1f389?w=300&h=300&fit=crop",
                snapshot_mid_path="https://images.unsplash.com/photo-1544928147-79a2dbc1f389?w=300&h=300&fit=crop",
            )
        ]
        
        for r in records:
            session.add(r)
            
        await session.commit()
        print("AMBER Test Data Seeded Successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
