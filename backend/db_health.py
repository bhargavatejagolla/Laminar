
import asyncio
from app.core.database import db_manager

async def main():
    await db_manager.initialize()
    health = await db_manager.health_check()
    from pprint import pprint
    pprint(health)
    
if __name__ == "__main__":
    asyncio.run(main())
