import asyncio
import os
from app.core.database import db_manager
from app.models.camera import Camera
from sqlalchemy import select

async def check_cameras():
    await db_manager.initialize()
    async with db_manager.session() as session:
        result = await session.execute(select(Camera))
        cameras = result.scalars().all()
        print("CAMERA_SUMMARY_START")
        for c in cameras:
            print(f"ID: {c.id}")
            print(f"Name: {c.name}")
            print(f"URL: {c.stream_url}")
            print(f"Health: {c.health_status}")
            print(f"Snapshot: {'Yes' if c.last_snapshot else 'No'}")
            print("-" * 20)
        print("CAMERA_SUMMARY_END")

if __name__ == "__main__":
    asyncio.run(check_cameras())
