"""
Safe migration: add any missing columns to the users table.
Run this once from the backend/ directory:
  python migrate_users.py
"""
import asyncio
from dotenv import dotenv_values
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Read settings from .env in the current dir
env = dotenv_values(".env")

DB_URL = (
    f"postgresql+asyncpg://{env.get('POSTGRES_USER', 'postgres')}:"
    f"{env.get('POSTGRES_PASSWORD', '')}@"
    f"{env.get('POSTGRES_SERVER', 'localhost')}:"
    f"{env.get('POSTGRES_PORT', '5432')}/"
    f"{env.get('POSTGRES_DB', 'laminar')}"
)

MIGRATIONS = [
    # Add each column safely — does nothing if column already exists
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(500)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_sms_alerts BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_email VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_email_alerts BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10) NOT NULL DEFAULT 'en'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE",
]

async def run():
    engine = create_async_engine(DB_URL, echo=True)
    async with engine.begin() as conn:
        for stmt in MIGRATIONS:
            print(f"Running: {stmt}")
            await conn.execute(text(stmt))
    await engine.dispose()
    print("\n✅ Migration complete — all columns are now present.")

asyncio.run(run())
