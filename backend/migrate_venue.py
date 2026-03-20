import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def main():
    try:
        url = str(settings.DATABASE_URL)
        print(f"Connecting to async database: {url}")
        engine = create_async_engine(url)
        
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_type VARCHAR(100);"))
            await conn.execute(text("ALTER TABLE venues ADD COLUMN IF NOT EXISTS staffing_config JSON;"))
            
        print("Successfully appended `venue_type` and `staffing_config` to `venues` table.")
    except Exception as e:
        print(f"Failed to migrate database: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
