
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(str(settings.DATABASE_URL))
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        result = await session.execute(text("SELECT bucket_start, bucket_type, avg_count, dynamic_risk_score FROM crowd_metrics ORDER BY bucket_start DESC LIMIT 10"))
        for r in result.fetchall():
            print(r)

asyncio.run(main())
