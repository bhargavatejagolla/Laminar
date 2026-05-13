
import asyncio
from uuid import UUID
from app.core.database import db_manager
from sqlalchemy import select
from app.models.venue import Venue
from app.services.notification_service import notification_service
import logging

# Enable debug logging for apps and services
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("verify_notifications")

async def verify():
    logger.info("--- Starting Notification Verification ---")
    async with db_manager.session() as session:
        logger.info("Database session opened.")
        # Get a venue
        result = await session.execute(select(Venue).limit(1))
        venue = result.scalar_one_or_none()
        
        if not venue:
            logger.error("No venue found in DB. Please create one first.")
            return

        venue_id = str(venue.id)
        venue_name = venue.name
        logger.info(f"Using venue: {venue_name} ({venue_id})")

        # 1. Test Parking Alert (HIGH/CRITICAL)
        logger.info("\n[Testing Parking Alert - CRITICAL]")
        await notification_service.notify_realtime_event(
            session=session,
            domain="parking",
            type="Saturation Reached",
            priority="CRITICAL",
            description=f"TEST: Parking sector at {venue_name} is at CRITICAL capacity (10/10).",
            venue_id=venue_id,
            venue_name=venue_name,
            metadata={"occupancy": 10}
        )
        logger.info("Parking alert dispatched.")

        # 2. Test Traffic Alert (MEDIUM - Overspeed)
        logger.info("\n[Testing Traffic Alert - MEDIUM]")
        await notification_service.notify_realtime_event(
            session=session,
            domain="traffic",
            type="Overspeed Violation",
            priority="MEDIUM",
            description=f"TEST: Overspeed detected at {venue_name}. Vehicle #123 traveling at 160 px/s.",
            venue_id=venue_id,
            venue_name=venue_name,
            metadata={"vehicle_id": 123, "speed": 160}
        )
        logger.info("Traffic alert dispatched.")

        # 3. Test Incident Alert (HIGH)
        logger.info("\n[Testing Incident Alert - HIGH]")
        await notification_service.notify_realtime_event(
            session=session,
            domain="incident",
            type="Vehicle Collision",
            priority="HIGH",
            description=f"TEST: Neural sweep detected a possible collision in North Sector of {venue_name}.",
            venue_id=venue_id,
            venue_name=venue_name,
            metadata={"latitude": venue.latitude, "longitude": venue.longitude}
        )
        logger.info("Incident alert dispatched.")

    logger.info("\n--- Verification Complete ---")

if __name__ == "__main__":
    asyncio.run(verify())
