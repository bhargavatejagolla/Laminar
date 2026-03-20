import asyncio
from sqlalchemy import select
from app.core.database import db_manager
from app.models.crowd_alert import CrowdAlert
from app.models.crowd_metric import CrowdMetric

async def check_db():
    await db_manager.initialize()
    async with db_manager.session() as session:
        print("Checking Crowd Alerts:")
        alert_stmt = select(CrowdAlert).order_by(CrowdAlert.created_at.desc()).limit(5)
        alerts = (await session.execute(alert_stmt)).scalars().all()
        for a in alerts:
            print(f"Alert: id={a.id}, risk_level={a.risk_level}, status={a.status}, created={a.created_at}")
            
        print("\nChecking Crowd Metrics:")
        metric_stmt = select(CrowdMetric).order_by(CrowdMetric.bucket_start.desc()).limit(5)
        metrics = (await session.execute(metric_stmt)).scalars().all()
        for m in metrics:
            print(f"Metric: time={m.bucket_start}, count={m.avg_count}, capacity={m.venue.capacity if m.venue else 'None'}, occupancy={m.occupancy_percent}, risk={m.dynamic_risk_score}, level={m.risk_level}")
    await db_manager.close()

if __name__ == "__main__":
    asyncio.run(check_db())
