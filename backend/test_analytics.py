import asyncio
from sqlalchemy import select
from app.core.database import db_manager
from app.models.venue import Venue
from app.services.analytics_service import analytics_service
from app.services.resource_optimizer import resource_optimizer

async def test_analytics():
    print("Testing Analytics Services")
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

        # Insert test data
        from app.models.crowd_metric import CrowdMetric
        from datetime import datetime, timezone, timedelta
        
        now = datetime.now(timezone.utc)
        
        # Insert a live metric for Resource Planning
        live_metric = CrowdMetric(
            venue_id=venue.id,
            bucket_type="minute",
            bucket_start=now - timedelta(minutes=1),
            bucket_end=now,  # Required: must be > bucket_start
            avg_count=1250,  # Should give 12 staff
            min_count=1100,
            max_count=1300,
            total_samples=60,
            risk_level="normal"
        )
        
        # Insert a historical peak metric for Trends
        historical_peak = CrowdMetric(
            venue_id=venue.id,
            bucket_type="minute",
            bucket_start=now - timedelta(hours=3, minutes=1),  # 3 hours ago
            bucket_end=now - timedelta(hours=3),  # Required: > bucket_start
            avg_count=4000,
            min_count=3800,
            max_count=4550,  # Should be the peak
            total_samples=60,
            risk_level="critical"
        )
        
        session.add(live_metric)
        session.add(historical_peak)
        await session.commit()
        
        # Test Crowd Trends
        try:
            trends = await analytics_service.get_crowd_trends(session, venue.id)
            print("\nCrowd Trends:")
            print(f"- Peak Time: {trends.get('peak_time')}")
            print(f"- Max Crowd: {trends.get('max_crowd')}")
        except Exception as e:
            print(f"Error testing crowd trends: {e}")

        # Test Resource Planning
        try:
            plan = await resource_optimizer.get_recommended_staff(session, venue.id)
            print("\nResource Planning:")
            print(f"- Live Crowd: {plan.get('crowd')}")
            print(f"- Recommended Staff: {plan.get('recommended_staff')}")
        except Exception as e:
            print(f"Error testing resource planning: {e}")

if __name__ == "__main__":
    asyncio.run(test_analytics())
