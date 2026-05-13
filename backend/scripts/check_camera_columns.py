import asyncio
from sqlalchemy import text
from app.core.database import db_manager

async def main():
    try:
        async with db_manager.session() as s:
            res = await s.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'cameras';"))
            cols = [r[0] for r in res.fetchall()]
            print("COLUMNS IN CAMERAS TABLE:", cols)
    except Exception as e:
        print("ERROR:", e)

if __name__ == '__main__':
    asyncio.run(main())
