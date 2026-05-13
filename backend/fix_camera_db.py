
import asyncio
from app.core.database import db_manager
from sqlalchemy import text

async def fix():
    await db_manager.initialize()
    async with db_manager.session() as s:
        await s.execute(text("UPDATE cameras SET stream_type = 'video' WHERE id = 'c78b207d-aa36-4fc8-9c95-c32f4245824d'"))
        await s.commit()
        print('Fixed camera c78b207d: set type to video')

if __name__ == "__main__":
    asyncio.run(fix())
