
import asyncio
from sqlalchemy import text
from app.core.database import get_engine

async def migrate():
    print("Initializing database engine...")
    engine = await get_engine()
    async with engine.begin() as conn:
        print("Adding warning_threshold and critical_threshold columns to venues table...")
        try:
            # Check if columns exist first or just try to add
            await conn.execute(text("ALTER TABLE venues ADD COLUMN warning_threshold INTEGER DEFAULT 700;"))
            await conn.execute(text("ALTER TABLE venues ADD COLUMN critical_threshold INTEGER DEFAULT 900;"))
            print("Columns added successfully.")
        except Exception as e:
            print(f"Migration detail: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
