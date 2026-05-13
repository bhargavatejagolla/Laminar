import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

# Hardcoded DB URL from .env
db_url = "postgresql+asyncpg://postgres:postgres@localhost:5433/laminar"

async def run():
    engine = create_async_engine(db_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        await session.execute(text("UPDATE cameras SET is_active=true, monitoring_enabled=true WHERE id='a20f28d6-f81f-4bfe-b34e-ebee23f3888f'"))
        await session.commit()
        print("Camera activated via direct SQL")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run())
