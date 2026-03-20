import asyncio
from sqlalchemy import text
from app.core.database import db_manager

async def migrate():
    await db_manager.initialize()
    async with db_manager.session() as session:
        print("Adding last_snapshot column to cameras table (Postgres)...")
        try:
            await session.execute(text("ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_snapshot JSONB"))
            await session.commit()
            print("Success: last_snapshot column added.")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
