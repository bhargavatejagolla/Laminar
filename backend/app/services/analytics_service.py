from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crowd_metric import CrowdMetric
from app.core.logging import get_logger

logger = get_logger(__name__)

class AnalyticsService:
    """
    Service for computing historical crowd trends and patterns.
    (Feature 9 - Crowd Trend Analytics)
    """

    async def get_crowd_trends(self, session: AsyncSession, venue_id: UUID) -> Dict[str, Any]:
        """
        Computes hourly crowd trends and returns the daily peak.
        Returns format: { "peak_time": "08:15 AM", "max_crowd": 412 }
        """
        # Look at data from the past 24 hours
        now = datetime.now(timezone.utc)
        start_of_period = now - timedelta(days=1)

        stmt = (
            select(
                CrowdMetric.bucket_start,
                CrowdMetric.max_count
            )
            .where(
                CrowdMetric.venue_id == venue_id,
                CrowdMetric.bucket_type == "minute", # Use minute resolution for real-time peak detection
                CrowdMetric.bucket_start >= start_of_period,
                CrowdMetric.camera_id.is_(None) # Use aggregated venue metric
            )
            .order_by(CrowdMetric.max_count.desc(), CrowdMetric.bucket_start.desc())
            .limit(1)
        )
        
        result = await session.execute(stmt)
        peak_row = result.first()

        if peak_row:
            peak_time_dt, max_crowd = peak_row
            
            # Format to required standard: "08:15 AM"
            formatted_time = peak_time_dt.strftime("%I:%M %p")
            
            logger.info(
                "Computed crowd trends",
                extra={
                    "venue_id": str(venue_id),
                    "peak_time": formatted_time,
                    "max_crowd": max_crowd
                }
            )
            return {
                "peak_time": formatted_time,
                "max_crowd": max_crowd
            }

        # Fallback if no data within 24h
        return {
            "peak_time": "N/A",
            "max_crowd": 0
        }

analytics_service = AnalyticsService()
