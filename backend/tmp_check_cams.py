import asyncio
from app.core.database import db_manager
from app.models.camera import Camera
from sqlalchemy import select

async def main():
    try:
        await db_manager.initialize()
        async with db_manager.session() as s:
            res = await s.execute(select(Camera))
            cams = res.scalars().all()
            print(f"Cameras count: {len(cams)}")
            for c in cams:
                print(f" - {c.id} | {c.name} | active={c.is_active} | online={c.is_online}")
    except Exception as e:
        print(f"Error checking DB: {e}")

asyncio.run(main())
