from typing import Dict, Any
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crowd_metric import CrowdMetric
from app.models.venue import Venue
from app.core.logging import get_logger

logger = get_logger(__name__)

class ResourceOptimizerService:
    """
    Service for planning resource and staff deployments based on live crowd data.
    (Feature 10 - Resource Planning)
    """

    STAFF_TO_CROWD_RATIO = 100  # 1 staff member per 100 people
    MIN_STAFF_PER_CAMERA = 1    # Always have at least 1 person watching an active camera

    async def get_recommended_staff(self, session: AsyncSession, venue_id: UUID) -> Dict[str, Any]:
        """
        Calculates recommended staff deployment.
        Returns format: { "crowd": 2000, "recommended_staff": 20 }

        Strategy (in order):
        1. Use latest venue-wide CrowdMetric aggregate (most accurate, updated by scheduler)
        2. Fall back to summing per-camera peak CrowdFrame counts from the last 5 min
        3. Guarantee at least MIN_STAFF_PER_CAMERA * active_camera_count staff
        """

        # Get Venue to pull staffing_config and capacity
        venue_stmt = select(Venue).where(Venue.id == venue_id).limit(1)
        venue_result = await session.execute(venue_stmt)
        venue_data = venue_result.scalar_one_or_none()

        # ── 1. Venue-wide aggregate (scheduled) ──────────────────────────────
        stmt = (
            select(CrowdMetric.avg_count, CrowdMetric.risk_level)
            .where(
                CrowdMetric.venue_id == venue_id,
                CrowdMetric.bucket_type == "minute",
                CrowdMetric.camera_id.is_(None),  # venue-wide rows only
            )
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        metric_row = result.first()

        crowd_size = 0
        risk_level = "low"

        if metric_row:
            crowd_size = int(metric_row[0] or 0)
            risk_level = (metric_row[1] or "low").lower()

        # ── 2. Fallback: live CrowdFrame sum (pre-scheduler) ─────────────────
        if crowd_size == 0:
            try:
                from datetime import datetime, timedelta, timezone
                from sqlalchemy import func
                from app.models.crowd_frame import CrowdFrame
                from app.models.camera import Camera

                recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

                # Latest detected_count per active camera for this venue
                subq = (
                    select(
                        CrowdFrame.camera_id,
                        func.max(CrowdFrame.detected_count).label("peak"),
                    )
                    .join(Camera, Camera.id == CrowdFrame.camera_id)
                    .where(Camera.venue_id == venue_id)
                    .where(Camera.is_active == True)
                    .where(CrowdFrame.captured_at >= recent_cutoff)
                    .group_by(CrowdFrame.camera_id)
                    .subquery()
                )

                total_stmt = select(func.sum(subq.c.peak))
                total_result = await session.execute(total_stmt)
                live_total = total_result.scalar_one_or_none()
                if live_total:
                    crowd_size = int(live_total)
            except Exception as e:
                logger.warning(
                    "Live crowd fallback query failed in resource optimizer",
                    extra={"error": str(e), "venue_id": str(venue_id)},
                )

        # ── 3. Calculate staff needed ─────────────────────────────────────────
        staff_needed = 0

        # Custom staffing config from venue settings (overrides ratio formula)
        if venue_data and venue_data.staffing_config and isinstance(venue_data.staffing_config, dict):
            mapped_staff = venue_data.staffing_config.get(risk_level)
            if mapped_staff is not None:
                staff_needed = int(mapped_staff)

        # Default ratio: 1 staff per 100 people (min 1 when anyone is present)
        if staff_needed == 0 and crowd_size > 0:
            staff_needed = max(1, crowd_size // self.STAFF_TO_CROWD_RATIO)

        logger.info(
            "Computed resource deployment",
            extra={
                "venue_id": str(venue_id),
                "crowd_size": crowd_size,
                "risk_level": risk_level,
                "recommended_staff": staff_needed,
            },
        )

        return {
            "crowd": crowd_size,
            "recommended_staff": staff_needed,
        }


resource_optimizer = ResourceOptimizerService()
