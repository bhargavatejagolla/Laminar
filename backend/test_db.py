import asyncio
from app.core.database import db_manager
from app.models.sos_report import SOSReport
from sqlalchemy import select

async def test():
    async with db_manager.session() as db:
        reports = (await db.execute(select(SOSReport))).scalars().all()
        print([r.tracking_id for r in reports])

asyncio.run(test())
