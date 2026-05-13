import asyncio
from app.core.database import db_manager
from sqlalchemy import text

async def patch():
    async with db_manager.session() as session:
        # Get the first camera
        # make sure it is set to traffic and device 0
        await session.execute(text("UPDATE cameras SET stream_type='device', stream_url='0', is_active=true, monitoring_enabled=true WHERE stream_type='device' OR stream_type='VIDEO'"))
        
        # update the venue to be traffic venue 
        await session.execute(text("UPDATE venues SET venue_type='traffic'"))
        
        await session.commit()
        print("Patched database for traffic testing!")

if __name__ == "__main__":
    asyncio.run(patch())
