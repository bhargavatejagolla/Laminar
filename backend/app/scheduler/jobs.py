# Enhanced jobs.py with batching and performance tracking
"""
Laminar - Scheduler Jobs (Enhanced)
------------------------------------
Orchestrates periodic system tasks with batching and performance tracking.
"""

import asyncio
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from app.core.database import db_manager
from app.core.logging import get_logger
from app.models.camera import Camera
from app.models.venue import Venue
from app.services.metric_aggregation_service import MetricAggregationService
from app.services.risk_engine_service import RiskEngineService
from app.services.alert_engine_service import AlertEngineService
from app.services.camera_health_service import CameraHealthService
from datetime import timedelta,timezone
from app.models.crowd_alert import CrowdAlert
from app.services.ai_assistant_service import AIAssistantService

logger = get_logger(__name__)

metric_service = MetricAggregationService()
risk_engine = RiskEngineService()
alert_engine = AlertEngineService()


class BatchProcessor:
    """Helper for batch processing with controlled concurrency."""

    def __init__(self, concurrency: int = 5):
        self.semaphore = asyncio.Semaphore(concurrency)

    async def process_item(self, item_id, processor_func, **kwargs):
        """Process a single item with concurrency control."""
        async with self.semaphore:
            try:
                return await processor_func(**kwargs)
            except Exception as e:
                logger.error(
                    f"Failed to process {item_id}",
                    extra_fields={"error": str(e)},
                )
                return None


# ==========================================================
# Minute Pipeline Job (Enhanced)
# ==========================================================

async def minute_pipeline_job():
    """
    Every minute:
    - Aggregate minute metrics for active cameras
    - Evaluate risk for each metric
    - Process alert decisions
    
    Enhanced with:
    - Batch processing
    - Performance tracking
    - Detailed metrics
    
    """
    logger.warning("🔥MINUTE JOB TRIGGERED🔥")
    start_time = datetime.now(timezone.utc)
    logger.info("Starting minute pipeline job")

    from app.core.database import db_manager
    async with db_manager.session() as session:
        try:
            # Get all active cameras
            result = await session.execute(
                select(Camera).where(
                    Camera.is_active == True,
                    Camera.monitoring_enabled == True,
                    Camera.deleted_at.is_(None),
                )
            )
            cameras: List[Camera] = result.scalars().all()

            if not cameras:
                logger.info("No active cameras found")
                return

            logger.info(f"Processing {len(cameras)} cameras")

            stats = {
                "total_cameras": len(cameras),
                "processed": 0,
                "failed": 0,
                "metrics_created": 0,
                "alerts_created": 0,
            }

            # Process each camera
            for camera in cameras:
                try:
                    # Step 1: Aggregate minute metric
                    metric = await metric_service.aggregate_minute(
                        session,
                        camera_id=camera.id,
                    )
                    if not metric:
                        logger.warning(
                            "No metric generated for camera",
                            extra={"camera_id": str(camera.id)}
                        )
                        continue

                    stats["metrics_created"] += 1

                    # Step 2: Evaluate risk
                    decision = await risk_engine.evaluate_metric(
                        session,
                        metric_id=metric.id,
                    )

                    # Step 3: Process alert
                    alert = await alert_engine.process_decision(
                        session,
                        decision=decision,
                    )
                    if alert:
                        stats["alerts_created"] += 1

                    stats["processed"] += 1

                except Exception as e:

                        await session.rollback()   # 🔥 important

                        stats["failed"] += 1

                        logger.error(
                            "Minute pipeline failed for camera",
                            extra_fields={
                                "camera_id": str(camera.id),
                                "error": str(e),
                            },
                            exc_info=True,
                        )

            # Step 4: After all cameras are processed, aggregate per-venue metrics
            # This ensures Peak Time and Max Crowd analytics are available
            venue_result = await session.execute(
                select(Venue).where(Venue.deleted_at.is_(None))
            )
            venues = venue_result.scalars().all()
            
            for venue in venues:
                try:
                    await metric_service.aggregate_venue_minute(
                        session,
                        venue_id=venue.id,
                        timestamp=start_time
                    )
                except Exception as e:
                    logger.error(
                        "Venue minute aggregation failed",
                        extra={"venue_id": str(venue.id), "error": str(e)}
                    )

            duration = (datetime.now(timezone.utc) -
                        start_time).total_seconds()
            logger.info(
                "Minute pipeline completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                    "stats": stats,
                },
            )

        except Exception as e:
            logger.error(
                "Minute pipeline job failed",
                extra_fields={"error": str(e)},
                exc_info=True,
            )


# ==========================================================
# Escalation Job (Enhanced)
# ==========================================================

async def escalation_job():
    """
    Every 5 minutes:
    - Check escalation levels for active alerts
    - Log escalation statistics
    """
    start_time = datetime.now(timezone.utc)
    logger.info("Starting escalation check job")

    from app.core.database import db_manager
    async with db_manager.session() as session:
        try:
            escalation_counts = await alert_engine.check_escalations(session)

            total_escalated = sum(escalation_counts.values())

            duration = (datetime.now(timezone.utc) -
                        start_time).total_seconds()
            logger.info(
                "Escalation check completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                    "escalated_count": total_escalated,
                    "escalation_levels": escalation_counts,
                },
            )

        except Exception as e:
            logger.error(
                "Escalation job failed",
                extra_fields={"error": str(e)},
                exc_info=True,
            )


# ==========================================================
# Auto Resolve Job (Enhanced)
# ==========================================================

async def auto_resolve_job():
    """
    Every 10 minutes:
    - Auto-resolve low/medium risk old alerts
    - Log resolution statistics
    """
    start_time = datetime.now(timezone.utc)
    logger.info("Starting auto-resolve job")

    from app.core.database import db_manager
    async with db_manager.session() as session:
        try:
            resolved_count = await alert_engine.auto_resolve_low_risk(session)

            duration = (datetime.now(timezone.utc) -
                        start_time).total_seconds()
            logger.info(
                "Auto-resolve completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                    "resolved_count": resolved_count,
                },
            )

        except Exception as e:
            logger.error(
                "Auto-resolve job failed",
                extra_fields={"error": str(e)},
                exc_info=True,
            )


# ==========================================================
# Hourly Aggregation Job (Enhanced)
# ==========================================================

async def hourly_aggregation_job():
    """
    Every hour:
    - Aggregate hourly metrics for all venues
    - Track performance
    """
    start_time = datetime.now(timezone.utc)
    logger.info("Starting hourly aggregation job")

    from app.core.database import db_manager
    async with db_manager.session() as session:
        try:
            # Get all venues
            result = await session.execute(select(Venue))
            venues = result.scalars().all()

            if not venues:
                logger.info("No venues found")
                return

            logger.info(f"Processing {len(venues)} venues")

            now = datetime.now(timezone.utc).replace(
                minute=0, second=0, microsecond=0)

            stats = {
                "total_venues": len(venues),
                "processed": 0,
                "failed": 0,
                "metrics_created": 0,
            }

            for venue in venues:
                try:
                    await metric_service.aggregate_hour(
                        session,
                        venue_id=venue.id,
                        hour_start=now,
                    )
                    stats["processed"] += 1
                    stats["metrics_created"] += 1

                except Exception as e:
                    stats["failed"] += 1
                    logger.error(
                        "Hourly aggregation failed for venue",
                        extra_fields={
                            "venue_id": str(venue.id),
                            "error": str(e),
                        },
                    )

            duration = (datetime.now(timezone.utc) -
                        start_time).total_seconds()
            logger.info(
                "Hourly aggregation completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                    "stats": stats,
                },
            )

        except Exception as e:
            logger.error(
                "Hourly aggregation job failed",
                extra_fields={"error": str(e)},
                exc_info=True,
            )


# ==========================================================
# System Health Check Job
# ==========================================================

async def system_health_job():
    """
    Every 15 minutes:
    - Check system health
    - Log warnings if issues detected
    - Can be extended to send alerts
    """
    start_time = datetime.now(timezone.utc)
    logger.info("Starting system health check")

    from app.core.database import db_manager
    async with db_manager.session() as session:
        try:
            # Check for cameras with no recent frames
            health_service = CameraHealthService()
            await health_service.check_offline_cameras(session)
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)

            result = await session.execute(
                select(Camera)
                .where(
                    Camera.is_active == True,
                    Camera.monitoring_enabled == True,
                    Camera.deleted_at.is_(None),
                    Camera.last_frame_at < cutoff,
                )
            )
            stalled_cameras = result.scalars().all()

            if stalled_cameras:
                logger.warning(
                    f"Found {len(stalled_cameras)} cameras with no recent frames",
                    extra_fields={
                        "camera_ids": [str(c.id) for c in stalled_cameras],
                    }
                )

            # Check for stuck alerts
            result = await session.execute(
                select(CrowdAlert)
                .where(
                    CrowdAlert.status.in_(["new", "open", "acknowledged"]),
                    CrowdAlert.created_at < datetime.now(
                        timezone.utc) - timedelta(hours=1),
                )
            )
            stuck_alerts = result.scalars().all()

            if stuck_alerts:
                logger.warning(
                    f"Found {len(stuck_alerts)} alerts stuck for over 1 hour",
                    extra_fields={
                        "alert_ids": [str(a.id) for a in stuck_alerts],
                    }
                )

            duration = (datetime.now(timezone.utc) -
                        start_time).total_seconds()
            logger.info(
                "System health check completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                    "stalled_cameras": len(stalled_cameras),
                    "stuck_alerts": len(stuck_alerts),
                },
            )

        except Exception as e:
            logger.error(
                "System health check failed",
                extra_fields={"error": str(e)},
                exc_info=True,
            )

# ==========================================================
# RAG Vector Index Refresh Job
# ==========================================================

async def refresh_vector_index_job():
    """
    Every 30 minutes:
    - Extract text docs from venues, alerts, events, metrics
    - Recompute embeddings using SentenceTransformers
    - Save FAISS index
    """
    start_time = datetime.now(timezone.utc)
    logger.info("Starting AI Vector Index Refresh job")

    from app.core.database import db_manager
    async with db_manager.session() as session:
        try:
            ai_service = AIAssistantService()
            await ai_service.extract_and_index(session)

            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.info(
                "Vector Index Refresh completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                },
            )

        except Exception as e:
            logger.error(
                "Vector Index Refresh job failed",
                extra_fields={"error": str(e)},
                exc_info=True,
            )


# ==========================================================
# Recurrent Camera Health Notification Job
# ==========================================================

async def recurrent_health_notification_job():
    """
    Every 5 minutes:
    - Find all "new" or "open" alerts of type "camera_issue"
    - If last_notified_at is more than 5 minutes ago, re-trigger notification
    """
    start_time = datetime.now(timezone.utc)
    logger.info("Starting recurrent camera health notification job")

    from app.core.database import db_manager
    from app.services.notification_service import NotificationService
    
    notification_service = NotificationService()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

    async with db_manager.session() as session:
        try:
            # Query open camera issue alerts that haven't been notified recently
            stmt = select(CrowdAlert).where(
                CrowdAlert.status.in_(["new", "open"]),
                CrowdAlert.extra_data.contains({"type": "camera_issue"}),
                (CrowdAlert.last_notified_at == None) | (CrowdAlert.last_notified_at < cutoff)
            )
            
            result = await session.execute(stmt)
            pending_alerts = result.scalars().all()

            if not pending_alerts:
                logger.info("No pending camera health notifications to re-send")
                return

            logger.info(f"Re-sending notifications for {len(pending_alerts)} camera issues")

            for alert in pending_alerts:
                try:
                    await notification_service.notify(session, alert)
                    logger.info(f"Re-sent notification for alert {alert.id}")
                except Exception as e:
                    logger.error(f"Failed to re-send notification for alert {alert.id}: {e}")

            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.info(
                "Recurrent health notification job completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                    "notified_count": len(pending_alerts),
                },
            )

        except Exception as e:
            logger.error(
                "Recurrent health notification job failed",
                extra_fields={"error": str(e)},
                exc_info=True,
            )

