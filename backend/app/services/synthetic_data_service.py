"""
Laminar - Synthetic Data Generator
------------------------------------
Generates realistic synthetic crowd time-series data for:
  1. Testing alert pipelines for new venue configurations
  2. Demonstrating the product to new clients (cold-start problem)
  3. Validating prediction model accuracy

Uses only numpy (already installed) — no new packages required.

Patterns generated:
  - Morning ramp (8-10 AM): gradual increase
  - Lunch peak (12-2 PM): sharp spike
  - Afternoon lull (2-4 PM): dip
  - Evening surge (5-8 PM): highest traffic
  - Night drop (8 PM+): close to zero

Noise + anomalies added for realism.
"""

import random
import math
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

logger = get_logger(__name__)


class SyntheticDataService:
    """
    Generates synthetic CrowdMetric records for testing and demonstration.
    """

    def _crowd_pattern(self, hour: float, capacity: float) -> float:
        """
        Returns normalized crowd count [0, 1] based on time of day.
        Models a realistic venue attendance curve.
        """
        # Gaussian bumps for different crowd peaks
        morning_ramp = 0.15 * math.exp(-((hour - 9.0) ** 2) / (2 * 1.5 ** 2))
        lunch_peak = 0.35 * math.exp(-((hour - 13.0) ** 2) / (2 * 1.0 ** 2))
        afternoon_lull = 0.20 * math.exp(-((hour - 15.0) ** 2) / (2 * 0.8 ** 2))
        evening_surge = 0.55 * math.exp(-((hour - 18.5) ** 2) / (2 * 1.5 ** 2))
        night_crowd = 0.10 * math.exp(-((hour - 21.0) ** 2) / (2 * 1.0 ** 2))

        base = morning_ramp + lunch_peak + afternoon_lull + evening_surge + night_crowd
        return min(1.0, max(0.0, base))

    def _compute_risk_level(self, count: float, capacity: float, warning: float, critical: float) -> str:
        if count >= critical:
            return "critical"
        elif count >= warning:
            return "high"
        elif count >= warning * 0.6:
            return "medium"
        return "low"

    def _compute_risk_score(self, count: float, capacity: float) -> float:
        ratio = count / max(capacity, 1)
        return min(100.0, ratio * 120.0)

    async def generate_for_venue(
        self,
        session: AsyncSession,
        venue_id: UUID,
        hours: int = 24,
        capacity: int = 1000,
        warning_threshold: Optional[float] = None,
        critical_threshold: Optional[float] = None,
        seed: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Generate synthetic minute-bucket CrowdMetric records for a venue.

        Args:
            session: DB session
            venue_id: Target venue
            hours: How many hours of data to generate (max 168 = 1 week)
            capacity: Venue capacity
            warning_threshold: Warning person-count threshold (default: 60% capacity)
            critical_threshold: Critical person-count threshold (default: 85% capacity)
            seed: Random seed for reproducibility

        Returns:
            Summary dict with counts and sample data
        """
        from app.models.crowd_metric import CrowdMetric

        if seed is not None:
            random.seed(seed)

        hours = min(hours, 168)  # Max 1 week
        warning = warning_threshold or capacity * 0.6
        critical = critical_threshold or capacity * 0.85

        now = datetime.now(timezone.utc)
        start = now - timedelta(hours=hours)

        records = []
        prev_count = 0.0
        total_minutes = hours * 60

        for i in range(total_minutes):
            bucket_time = start + timedelta(minutes=i)
            hour_float = bucket_time.hour + bucket_time.minute / 60.0

            # Base pattern
            pattern_value = self._crowd_pattern(hour_float, capacity)
            base_count = pattern_value * capacity

            # Add noise (±10% of capacity)
            noise = random.gauss(0, capacity * 0.04)
            count = max(0.0, base_count + noise)

            # Add occasional anomaly spike (1% chance)
            if random.random() < 0.01:
                count = min(capacity * 1.1, count * 1.5)

            # Smooth transitions (exponential moving average)
            count = 0.7 * count + 0.3 * prev_count
            count = round(count, 1)
            prev_count = count

            # Compute derived fields
            growth_rate = round((count - (prev_count or count)) / max(count, 1) * 100, 2)
            risk_level = self._compute_risk_level(count, capacity, warning, critical)
            risk_score = self._compute_risk_score(count, capacity)
            occupancy_pct = round(count / capacity * 100, 2)

            metric = CrowdMetric(
                id=uuid4(),
                venue_id=venue_id,
                camera_id=None,  # Venue-level aggregate
                bucket_start=bucket_time,
                bucket_end=bucket_time + timedelta(minutes=1),
                bucket_type="minute",
                avg_count=count,
                max_count=min(count * 1.1, capacity),
                min_count=max(0, count * 0.9),
                sample_count=random.randint(8, 12),
                growth_rate_percent=growth_rate,
                dynamic_risk_score=round(risk_score, 2),
                risk_level=risk_level,
                occupancy_percent=occupancy_pct,
            )
            records.append(metric)

        # Batch insert
        session.add_all(records)
        await session.commit()

        # Summary statistics
        counts = [r.avg_count for r in records]
        risk_dist: Dict[str, int] = {}
        for r in records:
            risk_dist[r.risk_level] = risk_dist.get(r.risk_level, 0) + 1

        logger.info(
            f"SyntheticDataService: Generated {len(records)} records "
            f"for venue {venue_id} ({hours}h)"
        )

        return {
            "venue_id": str(venue_id),
            "records_created": len(records),
            "period_hours": hours,
            "start": start.isoformat(),
            "end": now.isoformat(),
            "statistics": {
                "peak_count": max(counts),
                "avg_count": round(sum(counts) / len(counts), 1),
                "risk_distribution": risk_dist,
            },
            "note": "Synthetic data — for testing only. Delete before production use.",
        }

    async def generate_preview(
        self,
        hours: int = 24,
        capacity: int = 1000,
        interval_minutes: int = 60,
    ) -> List[Dict[str, Any]]:
        """
        Generate a preview of synthetic data without writing to the database.
        Used by the frontend for demonstration.
        """
        now = datetime.now(timezone.utc)
        start = now - timedelta(hours=hours)
        preview = []

        for i in range(0, hours * 60, interval_minutes):
            bucket_time = start + timedelta(minutes=i)
            hour_float = bucket_time.hour + bucket_time.minute / 60.0
            count = self._crowd_pattern(hour_float, capacity) * capacity
            count += random.gauss(0, capacity * 0.04)
            count = max(0.0, min(capacity * 1.1, count))

            preview.append({
                "time": bucket_time.isoformat(),
                "count": round(count, 1),
                "occupancy_pct": round(count / capacity * 100, 1),
                "risk_level": self._compute_risk_level(
                    count, capacity, capacity * 0.6, capacity * 0.85
                ),
            })

        return preview
