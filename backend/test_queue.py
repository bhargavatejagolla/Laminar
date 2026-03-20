import asyncio
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import db_manager
from app.models.venue import Venue
from app.services.queue_estimator_service import queue_estimator

async def test_queue_estimator():
    print("Testing Queue Estimator Service")
    
    # Initialize the database manager
    await db_manager.initialize()
    
    async with db_manager.session() as session:
        # Find a venue
        stmt = select(Venue).limit(1)
        result = await session.execute(stmt)
        venue = result.scalar_one_or_none()
        
        if not venue:
            print("No venues found in the database. Cannot test.")
            return

        print(f"Testing with venue: {venue.name} ({venue.id})")
        
        # Test the estimate
        try:
            estimate = await queue_estimator.get_or_create_estimate(session, venue.id)
            print("Queue Estimate Result:")
            print(f"- Venue ID: {estimate.venue_id}")
            print(f"- Queue Length: {estimate.queue_length}")
            print(f"- Service Rate: {estimate.service_rate} per min")
            print(f"- Wait Time: {estimate.wait_time_minutes} minutes ({estimate.estimated_wait_time})")
            print(f"- Timestamp: {estimate.timestamp}")
        except Exception as e:
            print(f"Error testing queue estimator: {e}")

if __name__ == "__main__":
    asyncio.run(test_queue_estimator())
