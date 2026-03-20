import asyncio
from app.core.database import db_manager
from app.models.camera import Camera
from sqlalchemy import update

async def main():
    await db_manager.initialize()
    async with db_manager.session() as session:
        await session.execute(
            update(Camera).values(is_active=True, monitoring_enabled=True)
        )
        await session.commit()
        print("Updated all cameras to active and monitoring_enabled=True")

if __name__ == "__main__":
    asyncio.run(main())
