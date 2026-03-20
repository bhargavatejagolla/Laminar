import asyncio
import os
import sys

# Add the current directory to sys.path so we can import app
sys.path.append(os.getcwd())

from app.core.database import db_manager, init_database
from app.models.camera import Camera
from sqlalchemy import select

async def check():
    await init_database()
    async with db_manager.session() as s:
        res = await s.execute(select(Camera))
        cameras = res.scalars().all()
        if not cameras:
            print("No cameras found in DB")
            return
        for c in cameras:
            print(f"ID: {c.id}")
            print(f"Name: {c.name}")
            print(f"URL: {c.stream_url}")
            print(f"Type: {c.stream_type}")
            print(f"Active: {c.is_active}")
            print(f"Online: {c.is_online}")
            print("-" * 20)

if __name__ == "__main__":
    asyncio.run(check())
