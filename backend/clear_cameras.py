import asyncio
from app.core.database import db_manager
from sqlalchemy import text

async def clear_cameras():
    async with db_manager.session() as session:
        # Delete cameras to unbrick the system
        await session.execute(text("DELETE FROM cameras"))
        await session.commit()
        print("All cameras deleted. Uvicorn can now boot safely.")

if __name__ == "__main__":
    asyncio.run(clear_cameras())
