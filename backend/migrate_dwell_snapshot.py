import asyncio
from sqlalchemy import text
from app.core.database import db_manager

async def migrate():
    await db_manager.initialize()
    async with db_manager.session() as session:
        print("Adding snapshot_path column to person_dwell_times table (Postgres)...")
        try:
            # We use ALTER TABLE to add the column if it doesn't exist
            # Note: Postgres ALTER TABLE doesn't have a native ADD COLUMN IF NOT EXISTS in old versions, 
            # but we can check if it exists or just handle the error.
            # In PostgreSQL 9.6+, we can use a block but simple ALTER TABLE is fine for now on modern PG.
            await session.execute(text("ALTER TABLE person_dwell_times ADD COLUMN IF NOT EXISTS snapshot_path VARCHAR"))
            await session.commit()
            print("Success: snapshot_path column added to person_dwell_times.")
        except Exception as e:
            print(f"Error: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(migrate())
