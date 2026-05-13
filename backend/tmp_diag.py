
import asyncio
import sys
import os

# Add current dir to path
sys.path.append(os.getcwd())

async def run_diag():
    from app.core.database import db_manager
    from app.core.config import settings
    
    print(f"Connecting to: {settings.DATABASE_URL}")
    try:
        await db_manager.initialize()
        health = await db_manager.health_check()
        print(f"Health: {health}")
        await db_manager.close()
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_diag())
