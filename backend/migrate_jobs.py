import asyncio
from app.core.database import db_manager, Base
from app.models.analysis_job import AnalysisJob

from app.core.database import db_manager, DatabaseRole

async def main():
    await db_manager.initialize()
    engine = db_manager._engines[DatabaseRole.WRITER]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Migrated AnalysisJob table successfully.")

if __name__ == "__main__":
    asyncio.run(main())
