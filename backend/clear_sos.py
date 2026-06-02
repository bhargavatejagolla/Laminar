import asyncio
from app.core.database import db_manager
from app.models.sos_report import SOSReport
from sqlalchemy import delete

async def clear_reports():
    async with db_manager.session() as db:
        await db.execute(delete(SOSReport))
        await db.commit()
        print("Cleared all SOS reports")

if __name__ == "__main__":
    asyncio.run(clear_reports())
