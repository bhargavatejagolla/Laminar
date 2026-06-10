import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()
url = os.getenv('DATABASE_URL')
if url:
    url = url.replace('postgresql://', 'postgresql+asyncpg://')
engine = create_async_engine(url)

async def main():
    async with engine.connect() as conn:
        res = await conn.execute(text('SELECT id, name, camera_type, venue_id FROM cameras'))
        for r in res:
            print(dict(r._mapping))

asyncio.run(main())
