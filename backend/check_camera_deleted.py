import asyncio
from app.core.database import db_manager
from app.models.camera import Camera
from sqlalchemy import select

async def main():
    await db_manager.initialize()
    async with db_manager.session() as session:
        result = await session.execute(select(Camera))
        cameras = result.scalars().all()
        for i, c in enumerate(cameras):
            print(f"[{i}] id={c.id} name={c.name} is_active={c.is_active} monitoring_enabled={c.monitoring_enabled} is_deleted={c.is_deleted}")

if __name__ == "__main__":
    asyncio.run(main())
