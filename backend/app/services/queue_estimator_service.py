from typing import Optional, Tuple
from uuid import UUID
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.queue_estimate import QueueEstimate
from app.models.crowd_metric import CrowdMetric
from app.models.camera import Camera
from app.models.venue import Venue
from app.core.logging import get_logger

logger = get_logger(__name__)

class QueueEstimatorService:
    """
    Computes and caches estimated wait times for venues based on live YOLO crowd detections.
    """
    CACHE_MINUTES = 2
    DEFAULT_SERVICE_RATE = 40.0  # fallback static rate (people per minute)

    async def get_or_create_estimate(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> QueueEstimate:
        """
        Retrieves a cached estimate if it's fresh (within 2 mins),
        otherwise computes a new one using live data and saves it.
        """
        # 1. Check for a fresh cached estimate
        stmt = (
            select(QueueEstimate)
            .where(QueueEstimate.venue_id == venue_id)
            .order_by(QueueEstimate.timestamp.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        latest_estimate = result.scalar_one_or_none()

        if latest_estimate:
            age = datetime.now(timezone.utc) - latest_estimate.timestamp
            if age.total_seconds() < (self.CACHE_MINUTES * 60):
                return latest_estimate

        # 2. Compute new estimate using live metrics
        queue_length = await self._calculate_queue_length(session, venue_id)
        service_rate = await self._calculate_service_rate(session, venue_id)
        
        # Avoid division by zero
        safe_service_rate = max(1.0, service_rate)
        
        # Calculate time: Wait time = Queue Length / Processing Rate
        wait_time_minutes = int(queue_length / safe_service_rate)
        
        # Cap wait times for realism, but allow 0 for empty queues
        if queue_length > 0:
            wait_time_minutes = max(1, wait_time_minutes)
        else:
            wait_time_minutes = 0
        if wait_time_minutes > 300:
            wait_time_minutes = 300
            
        wait_time_str = f"{wait_time_minutes} minutes"

        new_estimate = QueueEstimate(
            venue_id=venue_id,
            queue_length=queue_length,
            service_rate=round(safe_service_rate, 2),
            estimated_wait_time=wait_time_str,
            wait_time_minutes=wait_time_minutes,
        )

        session.add(new_estimate)
        await session.commit()
        await session.refresh(new_estimate)

        logger.info(
            "Computed new queue estimate",
            extra={
                "venue_id": str(venue_id),
                "queue_length": queue_length,
                "service_rate": safe_service_rate,
                "wait_mins": wait_time_minutes
            }
        )

        return new_estimate

    async def _calculate_queue_length(self, session: AsyncSession, venue_id: UUID) -> int:
        """
        Estimates the number of people in queue/entrance zones by looking at the latest
        minute-level crowd metrics for specific cameras.
        If no such zones exist, falls back to venue-level estimation.
        """
        # Find cameras matching entrance/queue zones
        camera_stmt = select(Camera.id).where(
            Camera.venue_id == venue_id,
            or_(
                Camera.zone_name.ilike("%queue%"),
                Camera.zone_name.ilike("%entrance%"),
                Camera.location_label.ilike("%entrance%"),
                Camera.location_label.ilike("%queue%"),
                Camera.location_label.ilike("%gate%"),
            )
        )
        camera_res = await session.execute(camera_stmt)
        queue_camera_ids = [row[0] for row in camera_res.fetchall()]

        total_queue_count = 0

        if queue_camera_ids:
            # Get latest count from these cameras in the last 5 minutes
            five_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
            
            for cam_id in queue_camera_ids:
                metric_stmt = (
                    select(CrowdMetric.avg_count)
                    .where(
                        CrowdMetric.camera_id == cam_id,
                        CrowdMetric.bucket_type == "minute",
                        CrowdMetric.bucket_start >= five_mins_ago
                    )
                    .order_by(CrowdMetric.bucket_start.desc())
                    .limit(1)
                )
                res = await session.execute(metric_stmt)
                count = res.scalar_one_or_none()
                if count:
                    total_queue_count += int(count)
                    
            if total_queue_count > 0:
                return total_queue_count

        # Fallback: Use the latest aggregate venue metric directly
        fallback_stmt = (
            select(CrowdMetric.avg_count)
            .where(
                CrowdMetric.venue_id == venue_id,
                CrowdMetric.bucket_type == "minute",
                CrowdMetric.camera_id.is_(None) # Overall venue metric
            )
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(1)
        )
        res = await session.execute(fallback_stmt)
        overall_count = res.scalar_one_or_none()
        
        if overall_count:
            # Estimate queue is approx 40% of overall crowd if cameras aren't properly zoned
            return int(overall_count * 0.40)
            
        return 0 # No data available

    async def _calculate_service_rate(self, session: AsyncSession, venue_id: UUID) -> float:
        """
        Calculates how fast the queue is being processed (people per minute).
        Attempts to calculate this based on historical changes and venue capacity,
        otherwise uses a realistic configured static baseline.
        """
        # Attempt to make it dynamic by checking the venue capacity constraints
        venue_stmt = select(Venue.capacity).where(Venue.id == venue_id)
        res = await session.execute(venue_stmt)
        capacity = res.scalar_one_or_none()
        
        service_rate = self.DEFAULT_SERVICE_RATE
        
        if capacity and capacity > 0:
            # Rule of thumb: Larger venues process people faster. 
            # E.g., 50,000 capacity stadium -> 400 people/min.
            # 500 capacity store -> 15 people/min.
            # Using a simple logarithmic scale for realism or direct ratio
            service_rate = max(10.0, capacity * 0.008) 
            
            # Add dynamic historical modifier: check if crowd has been growing or shrinking
            hist_stmt = (
                select(CrowdMetric.growth_rate_percent)
                .where(
                    CrowdMetric.venue_id == venue_id,
                    CrowdMetric.bucket_type == "minute",
                    CrowdMetric.growth_rate_percent.is_not(None)
                )
                .order_by(CrowdMetric.bucket_start.desc())
                .limit(1)
            )
            hist_res = await session.execute(hist_stmt)
            growth = hist_res.scalar_one_or_none()
            
            if growth:
                # If negative growth (people leaving faster), service rate might be effectively higher (clearing out)
                # If high positive growth, queue is backing up
                modifier = 1.0 - (min(max(growth / 100.0, -0.5), 0.5)) # Cap modifier between 0.5x and 1.5x
                service_rate *= modifier

        return service_rate

queue_estimator = QueueEstimatorService()
