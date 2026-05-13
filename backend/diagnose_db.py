
import asyncio
import json
from app.core.database import db_manager

async def diagnose():
    await db_manager.initialize()
    health = await db_manager.health_check()
    print(json.dumps(health, indent=2))

if __name__ == "__main__":
    asyncio.run(diagnose())
