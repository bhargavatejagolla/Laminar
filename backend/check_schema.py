
import asyncio
from app.core.database import db_manager
from sqlalchemy import text

async def check_schema():
    await db_manager.initialize()
    async with db_manager.session() as session:
        # Check crowd_alerts table
        res = await session.execute(text("SELECT * FROM crowd_alerts LIMIT 0"))
        print(f"Alert Columns: {list(res.keys())}")
        
if __name__ == "__main__":
    asyncio.run(check_schema())
