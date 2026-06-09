import asyncio
import logging
from sqlalchemy import text
from app.core.database import db_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def migrate():
    logger.info("Initializing DB...")
    await db_manager.initialize()
    engine = db_manager._engines[list(db_manager._engines.keys())[0]]
    
    async with engine.begin() as conn:
        logger.info("Adding camera_type column to cameras table...")
        try:
            await conn.execute(text("ALTER TABLE cameras ADD COLUMN camera_type VARCHAR(50) DEFAULT 'generic';"))
            logger.info("Successfully added camera_type column.")
        except Exception as e:
            if "already exists" in str(e):
                logger.info("camera_type column already exists.")
            else:
                logger.error(f"Error adding column: {e}")
                
        try:
            logger.info("Creating index on camera_type...")
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cameras_camera_type ON cameras (camera_type);"))
            logger.info("Successfully created index.")
        except Exception as e:
            logger.error(f"Error creating index: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
