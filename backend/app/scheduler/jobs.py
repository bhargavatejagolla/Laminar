# Enhanced jobs.py with batching and performance tracking
"""
Laminar - Scheduler Jobs (Enhanced)
------------------------------------
Orchestrates periodic system tasks with batching and performance tracking.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select
from app.core.database import db_manager
from app.core.logging import get_logger
from app.models.camera import Camera
from app.models.venue import Venue

logger = get_logger(__name__)

# ─── Lazy Service Accessors ──────────────────────────────────────────────────

_metric_service = None
_risk_engine = None
_alert_engine = None

def get_metric_service():
    global _metric_service
    if _metric_service is None:
        from app.services.metric_aggregation_service import MetricAggregationService
        _metric_service = MetricAggregationService()
    return _metric_service

def get_risk_engine():
    global _risk_engine
    if _risk_engine is None:
        from app.services.risk_engine_service import RiskEngineService
        _risk_engine = RiskEngineService()
    return _risk_engine

def get_alert_engine():
    global _alert_engine
    if _alert_engine is None:
        from app.services.alert_engine_service import AlertEngineService
        _alert_engine = AlertEngineService()
    return _alert_engine


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
async def minute_pipeline_job():
    """
    Every minute:
    - Aggregate minute metrics for active cameras (Parallelized)
    - Evaluate risk for each metric
    - Process alert decisions
    - Aggregate per-venue metrics
    """
    metric_service = get_metric_service()
    risk_engine = get_risk_engine()
    alert_engine = get_alert_engine()
    
    # ✅ PERFORMANCE FIX: Add random jitter to prevent synchronized spikes
    import random
    await asyncio.sleep(random.uniform(0, 2.0))

    start_time = datetime.now(timezone.utc)
    logger.info("Starting minute pipeline job")

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
                # Count total cameras to provide context
                total_res = await session.execute(select(Camera).where(Camera.deleted_at.is_(None)))
                total_count = len(total_res.scalars().all())
                logger.info(
                    "No active monitoring cameras found",
                    extra_fields={
                        "total_registered_cameras": total_count,
                        "reason": "is_active=False or monitoring_enabled=False"
                    }
                )

            logger.debug(f"Processing {len(cameras)} cameras in parallel")

            async def process_single_camera(camera_obj):
                camera_id_str = str(camera_obj.id)
                # Each parallel task needs its own session to avoid contention
                async with db_manager.session() as sub_session:
                    try:
                        # Step 1: Aggregate minute metric
                        metric = await metric_service.aggregate_minute(
                            sub_session,
                            camera_id=camera_obj.id,
                        )
                        if not metric:
                            return {"metric": False, "alert": False, "success": False, "reason": "no_data"}

                        # Step 2: Evaluate risk
                        decision = await risk_engine.evaluate_metric(
                            sub_session,
                            metric_id=metric.id,
                        )

                        # Step 3: AI Live-Feed Auto-Resolution or Alert Creation
                        alert_fired = False
                        if not decision.get("should_alert"):
                            from uuid import UUID as _UUID
                            _venue_id = decision.get("venue_id")
                            _camera_id = decision.get("camera_id")
                            if _venue_id:
                                await alert_engine.live_feed_auto_resolve(
                                    sub_session,
                                    venue_id=_UUID(_venue_id),
                                    camera_id=_camera_id,
                                    reason=f"Live AI feed: crowd risk dropped to '{decision.get('current_level', 'safe')}'",
                                )
                        else:
                            alert = await alert_engine.process_decision(
                                sub_session,
                                decision=decision,
                            )
                            if alert:
                                alert_fired = True

                        return {"metric": True, "alert": alert_fired, "success": True}
                    except Exception as e:
                        logger.error(f"Camera {camera_id_str} pipeline failed: {e}")
                        return {"metric": False, "alert": False, "success": False, "error": str(e)}

            # Parallel camera processing with relaxed concurrency (Prevent pool/CPU exhaustion)
            processor = BatchProcessor(concurrency=3)
            camera_tasks = [
                processor.process_item(
                    str(cam.id), 
                    process_single_camera, 
                    camera_obj=cam
                ) for cam in cameras
            ]
            cam_results = await asyncio.gather(*camera_tasks)
            # Remove any None results from failed batch processing
            cam_results = [r for r in cam_results if r is not None]

            # Compile stats
            stats = {
                "total_cameras": len(cameras),
                "processed": sum(1 for r in cam_results if r["success"]),
                "failed": sum(1 for r in cam_results if not r["success"] and r.get("reason") != "no_data"),
                "metrics_created": sum(1 for r in cam_results if r["metric"]),
                "alerts_created": sum(1 for r in cam_results if r["alert"]),
            }

            # Step 4: After cameras, aggregate per-venue metrics in parallel
            result_v = await session.execute(select(Venue).where(Venue.deleted_at.is_(None)))
            venues = result_v.scalars().all()
            
            async def process_venue_agg(v_obj):
                async with db_manager.session() as sub_session:
                    try:
                        await metric_service.aggregate_venue_minute(sub_session, venue_id=v_obj.id, timestamp=start_time)
                        return True
                    except Exception as e:
                        logger.error(f"Venue {v_obj.id} aggregation failed: {e}")
                        return False

            venue_tasks = [process_venue_agg(v) for v in venues]
            await asyncio.gather(*venue_tasks)

            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.debug(
                "Minute pipeline completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                    "stats": stats,
                },
            )

        except Exception as e:
            logger.error("Minute pipeline job failed fatal", extra_fields={"error": str(e)}, exc_info=True)


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
    logger.debug("Starting escalation check job")

    alert_engine = get_alert_engine()
    async with db_manager.session() as session:
        try:
            escalation_counts = await alert_engine.check_escalations(session)

            total_escalated = sum(escalation_counts.values())

            duration = (datetime.now(timezone.utc) -
                        start_time).total_seconds()
            logger.debug(
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
    Every 5 minutes:
    - Auto-acknowledge open alerts that haven't been manually acted on in 3 min
    - Auto-resolve stale alerts (low/medium: 10min, high: 15min, critical: 20min)
    - Log statistics
    """
    start_time = datetime.now(timezone.utc)
    logger.debug("Starting auto-resolve + auto-acknowledge job")

    alert_engine = get_alert_engine()
    async with db_manager.session() as session:
        try:
            # Step 1: Auto-acknowledge stale open alerts (removes need for manual ACK)
            # 1 minute — aggressive since live-feed auto-resolves most alerts instantly anyway
            acked_count = await alert_engine.auto_acknowledge_open(session, minutes=5)

            # Step 2: Auto-resolve all risk levels based on their policies (safety net)
            resolved_count = await alert_engine.auto_resolve_low_risk(session)

            duration = (datetime.now(timezone.utc) -
                        start_time).total_seconds()
            logger.debug(
                "Auto-lifecycle job completed",
                extra_fields={
                    "duration_seconds": round(duration, 2),
                    "auto_acknowledged": acked_count,
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

    metric_service = get_metric_service()
    async with db_manager.session() as session:
        try:
            # Get all venues
            result = await session.execute(select(Venue).where(Venue.deleted_at.is_(None)))
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
    logger.debug("Starting system health check")

    from app.services.camera_health_service import CameraHealthService
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
            from app.models.crowd_alert import CrowdAlert
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
            logger.debug(
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

    from app.services.ai_assistant_service import AIAssistantService
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
            from app.models.crowd_alert import CrowdAlert
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


# ==========================================================
# Proactive AI Predictive Surge Job (Added via Enahancement)
# ==========================================================

async def predictive_surge_job():
    """
    Every 5 minutes:
    - Analyzes statistical trends in sqlite using PredictionService
    - Generates proactive 'Predictive Surge' alerts if critical bottleneck forecasted
    """
    # ✅ PERFORMANCE FIX: Add random jitter to prevent synchronized spikes
    import random
    await asyncio.sleep(random.uniform(0, 3.0))

    start_time = datetime.now(timezone.utc)
    logger.info("Starting AI Predictive Surge scanning job")

    from app.core.database import db_manager
    from app.services.prediction_service import PredictionService
    
    prediction_service = PredictionService()

    async with db_manager.session() as session:
        try:
            # Check for active venues
            result = await session.execute(
                select(Venue).where(Venue.deleted_at.is_(None))
            )
            venues = result.scalars().all()

            if not venues:
                logger.info("No venues found for predictive scanning")
                return

            processor = BatchProcessor(concurrency=2)
            
            async def process_venue_prediction(v):
                try:
                    # We need a fresh session per task to avoid concurrent usage of the same session
                    async with db_manager.session() as sub_session:
                        # Safety: Skip predictive scanning if no cameras are online for this venue
                        from sqlalchemy import select, func
                        from app.models.camera import Camera
                        online_count = await sub_session.scalar(
                            select(func.count()).select_from(Camera).where(
                                Camera.venue_id == v.id,
                                Camera.is_active == True,
                                Camera.is_online == True
                            )
                        )
                        
                        if online_count == 0:
                            # Log more details to help debug "stuck" cameras
                            logger.info(
                                f"⏭️ Skipping predictive scan for {v.name}",
                                extra_fields={
                                    "reason": "No online cameras detected in DB",
                                    "venue_id": str(v.id)
                                }
                            )
                            return False

                        forecast = await prediction_service.forecast_risk(sub_session, v.id)
                        if not forecast:
                            return False
                            
                        predicted_level = forecast.get("predicted_level")
                        escalation_prob = forecast.get("escalation_probability", 0.0)
                        
                        if predicted_level in ["critical", "high"] and escalation_prob > 0.4:
                            logger.warning(
                                f"🔮 PREDICTIVE AI: Upcoming surge forecasted at venue {v.name}",
                                extra_fields={"predicted_level": predicted_level, "prob": escalation_prob}
                            )

                            decision = {
                                "should_alert": True,
                                "venue_id": str(v.id),
                                "venue_name": v.name,
                                "camera_id": None,
                                "metric_id": "00000000-0000-0000-0000-000000000000",
                                "current_level": predicted_level,
                                "severity": 95 if predicted_level == "critical" else 75,
                                "early_warning_triggered": True,
                                "reason": forecast.get("forecast_explanation", "AI predicted upcoming surge."),
                                "alert_type": "AI Predictive Surge Warning",
                                "recommended_action": "Proactively assign staff to gates.",
                                "predicted_level": predicted_level,
                                "predicted_risk_score": forecast.get("predicted_risk_score"),
                                "escalation_probability": escalation_prob
                            }
                            
                            alert_engine = get_alert_engine()
                            await alert_engine.process_decision(sub_session, decision=decision)
                            return True
                    return False
                except Exception as ex:
                    logger.error(f"Error in venue {v.id} predictive scan: {ex}", exc_info=True)
                    return False

            # Run in batches
            tasks = [processor.process_item(str(venue.id), process_venue_prediction, v=venue) for venue in venues]
            results = await asyncio.gather(*tasks)

            stats = {
                "scanned": len(venues),
                "predictive_alerts_fired": sum(1 for r in results if r is True),
                "failed": sum(1 for r in results if r is None)
            }

            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.info(
                "AI Predictive Surge Scan completed",
                extra_fields={"duration_seconds": round(duration, 2), "stats": stats}
            )

        except Exception as e:
            logger.error(
                "AI Predictive Surge job failed fatally",
                extra_fields={"error": str(e)},
                exc_info=True,
            )


# ==========================================================
# AutoML Retraining Report Job (New Feature)
# ==========================================================

async def automl_retrain_report_job():
    """
    Daily at 6 AM:
    - Analyze low-confidence YOLO detection frames from the past 24 hours
    - Generate a retrain_report.json in storage/retrain_candidates/
    - Log recommendation to operators
    """
    try:
        from app.services.retraining_service import retraining_service
        report = retraining_service.generate_retrain_report()
        logger.info(
            "AutoML Retrain Report generated",
            extra_fields={
                "candidates": report.get("total_candidates", 0),
                "ready": report.get("ready_for_retraining", False),
                "recommendation": report.get("recommendation", ""),
            }
        )
    except Exception as e:
        logger.error(f"AutoML retrain report job failed: {e}", exc_info=True)
