import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import db_manager
from app.models.base import Base
# ensure models are imported
import app.models

async def create_table():
    await db_manager.initialize()
    async with db_manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Created emergency_profiles table.")
    await db_manager.close()

if __name__ == "__main__":
    asyncio.run(create_table())
