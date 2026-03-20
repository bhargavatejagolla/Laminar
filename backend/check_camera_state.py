import asyncio
from dotenv import load_dotenv
load_dotenv()
from app.core.database import async_session_factory
from app.models.camera import Camera
from sqlalchemy import select

async def main():
    try:
        session = await async_session_factory()
        async with session:
            result = await session.execute(select(Camera))
            cameras = result.scalars().all()
            if not cameras:
                print("No cameras found.")
            for c in cameras:
                print(f"[{c.id}] {c.name}: active={c.is_active}, monitoring_enabled={c.monitoring_enabled}, stream_url={c.stream_url}, stream_type={c.stream_type}, deleted_at={c.deleted_at}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
