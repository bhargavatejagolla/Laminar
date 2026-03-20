import asyncio
from app.core.database import db_manager
from app.models.camera import Camera
from sqlalchemy import update

async def main():
    await db_manager.initialize()
    async with db_manager.session() as session:
        await session.execute(
            update(Camera).values(is_deleted=False, deleted_at=None)
        )
        await session.commit()
        print("Updated all cameras to is_deleted=False")

if __name__ == "__main__":
    asyncio.run(main())
