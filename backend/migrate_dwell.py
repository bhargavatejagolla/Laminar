"""
Safe migration for dwell monitoring tables.
Run from backend/ directory: python migrate_dwell.py
"""
import asyncio
from dotenv import dotenv_values
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

env = dotenv_values(".env")

db_url = env.get("DATABASE_URL")
if db_url and env.get("ENVIRONMENT") in ("production", "staging"):
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    DB_URL = db_url
else:
    DB_URL = (
        f"postgresql+asyncpg://{env.get('POSTGRES_USER', 'postgres')}:"
        f"{env.get('POSTGRES_PASSWORD', '')}@"
        f"{env.get('POSTGRES_SERVER', 'localhost')}:"
        f"{env.get('POSTGRES_PORT', '5432')}/"
        f"{env.get('POSTGRES_DB', 'laminar')}"
    )

MIGRATIONS = [
    # Ensure both tables exist first (create_all handles this, but just in case)
    # person_dwell_times columns
    "ALTER TABLE person_dwell_times ADD COLUMN IF NOT EXISTS snapshot_enter_path TEXT",
    "ALTER TABLE person_dwell_times ADD COLUMN IF NOT EXISTS snapshot_mid_path TEXT",
    "ALTER TABLE person_dwell_times ADD COLUMN IF NOT EXISTS snapshot_exit_path TEXT",
    "ALTER TABLE person_dwell_times ADD COLUMN IF NOT EXISTS snapshot_path TEXT",
    "ALTER TABLE person_dwell_times ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE person_dwell_times ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
    "ALTER TABLE person_dwell_times ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)",
    # monitoring_zones columns
    "ALTER TABLE monitoring_zones ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
]

async def run():
    engine = create_async_engine(DB_URL, echo=True)
    async with engine.begin() as conn:
        for stmt in MIGRATIONS:
            print(f"  -> {stmt[:70]}...")
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                print(f"     [SKIP] {e}")
    await engine.dispose()
    print("\nMigration complete.")

asyncio.run(run())
