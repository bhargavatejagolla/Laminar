import asyncio
from app.core.database import db_manager, get_engine
from sqlalchemy import text

async def check_columns():
    engine = await get_engine()
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"))
        columns = [row[0] for row in result.fetchall()]
        print(f"Users columns: {columns}")
        
        result = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'venues'"))
        columns = [row[0] for row in result.fetchall()]
        print(f"Venues columns: {columns}")

if __name__ == "__main__":
    asyncio.run(check_columns())
