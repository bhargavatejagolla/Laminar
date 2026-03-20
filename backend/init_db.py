import asyncio
from sqlalchemy.schema import CreateTable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import db_manager
from app.models.queue_estimate import QueueEstimate

async def create_table():
    print("Creating queue_estimates table...")
    await db_manager.initialize()
    async with db_manager.engine.begin() as conn:
        # We can just let SQLAlchemy create all missing tables
        from app.models.base import BaseModel
        await conn.run_sync(BaseModel.metadata.create_all)
    print("Table created successfully.")

if __name__ == "__main__":
    asyncio.run(create_table())
