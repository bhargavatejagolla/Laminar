import asyncio
import os
from app.core.database import db_manager
from app.models.crowd_alert import CrowdAlert
from sqlalchemy import select

async def check_alerts():
    await db_manager.initialize()
    async with db_manager.session() as session:
        result = await session.execute(select(CrowdAlert).order_by(CrowdAlert.created_at.desc()).limit(10))
        alerts = result.scalars().all()
        print("ALERT_SUMMARY_START")
        for a in alerts:
            print(f"ID: {a.id}")
            print(f"Cam: {a.camera_id}")
            print(f"Risk: {a.risk_level}")
            print(f"Brief: {a.executive_brief[:50]}...")
            print("-" * 20)
        print("ALERT_SUMMARY_END")

if __name__ == "__main__":
    asyncio.run(check_alerts())
