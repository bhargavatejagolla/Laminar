"""
Debug script: call the stats endpoint directly to see what the in-memory service returns.
"""
import asyncio
from uuid import UUID

CAMERA_ID = UUID("44ba8d43-245f-4f88-8782-afe0edbc628a")

async def main():
    from app.core.database import db_manager
    await db_manager.initialize()
    
    from app.services.dwell_time_service import get_dwell_service
    svc = get_dwell_service(CAMERA_ID)
    stats = svc.get_live_stats()
    print("Live stats:", stats)

asyncio.run(main())
