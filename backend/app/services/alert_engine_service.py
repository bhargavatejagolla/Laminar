"""
Laminar - Alert Engine Service
------------------------------

Consumes structured risk decisions and manages alert lifecycle.

Responsibilities:
- Create alerts from risk decisions
- Prevent duplicate active alerts
- Manage lifecycle (open → acknowledged → resolved)
- Handle escalation logic with configurable policies
- Auto-resolve low-risk alerts
- Provide dashboard queries and analytics
- Track resolution metrics (MTTR)

This service DOES NOT send notifications.
NotificationService will consume alerts separately.

Architecture:
RiskEngineService → AlertEngineService → NotificationService
"""

from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, timedelta, timezone
from app.services.notification_service import NotificationService
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.crowd_alert import CrowdAlert
from app.models.venue import Venue
from app.core.repository import Repository
from app.core.logging import get_logger


logger = get_logger(__name__)


class EscalationPolicy:
    """
    Configurable escalation rules for alerts.

    Defines time thresholds for each escalation level.
    """

    def __init__(
        self,
        first_level_minutes: int = 10,
        second_level_minutes: int = 30,
        third_level_minutes: int = 60,
    ):
        self.first_level_minutes = first_level_minutes
        self.second_level_minutes = second_level_minutes
        self.third_level_minutes = third_level_minutes

    def get_escalation_level(self, created_at: datetime) -> int:
        """Determine escalation level based on alert age."""
        age_minutes = (datetime.now(timezone.utc) -
                       created_at).total_seconds() / 60

        if age_minutes >= self.third_level_minutes:
            return 3
        elif age_minutes >= self.second_level_minutes:
            return 2
        elif age_minutes >= self.first_level_minutes:
            return 1
        return 0


class AlertEngineService:
    """
    Core service for alert lifecycle management.

    This service ensures that risk decisions are properly tracked,
    escalated, and resolved without duplication.
    """

    DUPLICATE_WINDOW_MINUTES = 5
    AUTO_RESOLVE_MINUTES = 45  # Extended to prevent flickering auto-resolves

    # ==========================================================
    # Risk Classification Mapping (Production Standard)
    # ==========================================================

    RISK_COLOR_MAP = {
        "low": "green",
        "medium": "yellow",
        "high": "orange",
        "critical": "red",
    }

    RISK_SEVERITY_SCORE = {
        "low": 10,
        "medium": 40,
        "high": 70,
        "critical": 95,
    }

    POLICE_ESCALATION_LEVELS = {"critical"}

    def __init__(self, escalation_policy: Optional[EscalationPolicy] = None):
        self.alert_repo = Repository[CrowdAlert](CrowdAlert)
        self.venue_repo = Repository[Venue](Venue)
        self.escalation_policy = escalation_policy or EscalationPolicy()
        self.notification_service = NotificationService()

    # ==========================================================
    # Risk Classification Helper (Added - Step 1.2)
    # ==========================================================

    def _classify_risk(self, risk_level: str, severity_score: Optional[int] = None) -> Dict[str, Any]:
        """
        Standardize risk classification.

        Returns:
            {
                color,
                severity_score,
                requires_police
            }
        """
        color = self.RISK_COLOR_MAP.get(risk_level, "green")
        
        # Use provided dynamic severity or fallback to legacy map
        final_severity = severity_score if severity_score is not None else self.RISK_SEVERITY_SCORE.get(risk_level, 0)
        
        requires_police = risk_level in self.POLICE_ESCALATION_LEVELS

        return {
            "color": color,
            "severity_score": final_severity,
            "requires_police": requires_police,
        }

    # ==========================================================
    # Core Alert Processing
    # ==========================================================

    async def process_decision(
        self,
        session: AsyncSession,
        *,
        decision: Dict[str, Any],
        tenant_id: Optional[UUID] = None,
    ) -> Optional[CrowdAlert]:
        """
        Consume RiskEngine decision and create/manage alert.

        Args:
            decision: Output from RiskEngineService.evaluate_metric()
            tenant_id: Optional tenant isolation

        Returns:
            Created/updated alert or None if no alert needed
        """
        # Skip if decision doesn't require alert
        if not decision.get("should_alert"):
            return None

        venue_id = UUID(decision["venue_id"])

        # Validate venue and tenant
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            raise ValueError("Venue not found.")

        if tenant_id and venue.tenant_id != tenant_id:
            raise ValueError("Venue not in tenant.")

        # Prevent duplicate active alerts for same venue
        existing = await self._get_active_alert(session, venue_id)

        # Scale RiskEngine's 1-10 score to 10-100 for legacy compatibility
        dynamic_severity = int((decision.get("severity", 5) * 10))
        is_early_warning = decision.get("early_warning_triggered") is True

        if existing:
            new_classification = self._classify_risk(
                decision["current_level"], 
                severity_score=dynamic_severity
            )
            is_escalation = new_classification["severity_score"] > existing.severity
            
            # cool down check (Module 4) - only apply cooldown to NON-ESCALATING updates
            if not is_escalation and not is_early_warning:
                if existing.last_notified_at:
                    cooldown_cutoff = datetime.now(timezone.utc) - timedelta(
                        minutes=self.DUPLICATE_WINDOW_MINUTES
                    )
                    if existing.last_notified_at > cooldown_cutoff:
                        logger.debug(
                            "Alert suppressed due to cooldown window",
                            extra={"alert_id": str(existing.id)},
                        )
                        return existing
        if existing:
            # Update existing alert with latest info if severity increased
            # 🔥 Step 1.4: Use classification for severity comparison

            if is_escalation or is_early_warning:
                # If it's an early warning, bump severity to critical mapping (95) to ensure it triggers
                new_severity = 95 if is_early_warning else new_classification["severity_score"]
                new_level = "critical" if is_early_warning else decision["current_level"]
                
                update_data = {
                    "severity": new_severity,
                    "risk_level": new_level,
                    "metric_id": UUID(decision["metric_id"]),
                    "last_notified_at": None,  # Will trigger re-notification
                    "early_warning_triggered": True if is_early_warning else existing.early_warning_triggered,
                    "explanation": decision.get("reason"),
                }
                
                # Phase 2 Smart Alerts
                if existing.extra_data is None:
                    existing.extra_data = {}
                if "alert_type" in decision:
                    existing.extra_data["alert_type"] = decision.get("alert_type")
                if "recommended_action" in decision:
                    existing.extra_data["recommended_action"] = decision.get("recommended_action")
                update_data["extra_data"] = existing.extra_data

                existing = await self.alert_repo.update(
                    session,
                    existing,
                    update_data,
                    commit=True,
                )

                logger.info(
                    "Existing alert updated with higher severity or early warning",
                    extra={
                        "alert_id": str(existing.id),
                        "venue_id": str(venue_id),
                        "new_severity": new_severity,
                        "early_warning": is_early_warning
                    },
                )
                
                # 🔥 Send notification for the escalated alert
                await self.notification_service.notify(session, existing)

                # 🔥 Re-capture evidence on escalation
                try:
                    from app.services.evidence_snapshot_service import EvidenceSnapshotService
                    _esc_cam_str = decision.get("camera_id")
                    _esc_cam_id  = UUID(_esc_cam_str) if _esc_cam_str else None
                    asyncio.create_task(
                        EvidenceSnapshotService().trigger_evidence_capture(
                            camera_id=_esc_cam_id,
                            alert_id=existing.id,
                            venue_name=decision.get("venue_name", "Unknown"),
                            risk_level=decision.get("current_level", "high"),
                        )
                    )
                except Exception:
                    pass
            else:
                logger.info(
                    "Active alert already exists — skipping duplicate",
                    extra={"venue_id": str(venue_id)},
                )

            return existing

        # 🔥 Dynamic Creation: Use scaled severity from RiskEngine
        risk_level = decision["current_level"]
        classification = self._classify_risk(risk_level, severity_score=dynamic_severity)

        extra_data = {}
        if "alert_type" in decision:
            extra_data["alert_type"] = decision.get("alert_type")
        if "recommended_action" in decision:
            extra_data["recommended_action"] = decision.get("recommended_action")
            
        is_early_warning = decision.get("early_warning_triggered") is True
        new_severity = 95 if is_early_warning else classification["severity_score"]
        
        # Determine initial escalation level
        init_level = 0
        if new_severity >= 90:
            init_level = 3
        elif new_severity >= 70:
            init_level = 2
        elif new_severity >= 40:
            init_level = 1

        # Create new alert
        alert = CrowdAlert(
            venue_id=venue_id,
            metric_id=UUID(decision["metric_id"]),
            risk_level=risk_level,
            severity=new_severity,
            status="open",
            early_warning_triggered=is_early_warning,
            escalation_level=init_level,
            explanation=decision.get("reason"),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            last_notified_at=None,
            predicted_level=decision.get("predicted_level"),
            predicted_risk_score=decision.get("predicted_risk_score"),
            escalation_probability=decision.get("escalation_probability"),
        )

        # Attach structured metadata (temporary until DB expansion)
        # Using extra_data field which exists in your model
        alert.extra_data = {
            "risk_color": classification["color"],
            "requires_police": classification["requires_police"],
            "recommended_action": decision.get("recommended_action"),
            # Keep original for reference
            "original_severity": decision.get("severity"),
            "holiday_context": decision.get("holiday_context"),
            "weather_context": decision.get("weather_context"),
            "momentum_score": decision.get("momentum_score", 0.0),
            "velocity": decision.get("velocity"),
            "direction_variance": decision.get("direction_variance"),
            "acceleration": decision.get("acceleration"),
            # ── Prediction intelligence stored in extra_data so notification ──
            # ── service can read them after DB round-trip (getattr not reliable) ──
            "predicted_level": decision.get("predicted_level"),
            "predicted_risk_score": decision.get("predicted_risk_score"),
            "escalation_probability": decision.get("escalation_probability") or 0.0,
            "event_type": decision.get("event_type"),
            "camera_id": decision.get("camera_id"),
            "camera_location": decision.get("camera_location"),
        }

        created = await self.alert_repo.create(session, alert, commit=True)
        await self.notification_service.notify(session, created)

        # 🔥 Evidence capture: snapshot + 10s clip (non-blocking background task)
        try:
            from app.services.evidence_snapshot_service import EvidenceSnapshotService
            _cam_id_str = decision.get("camera_id")
            _cam_uuid   = UUID(_cam_id_str) if _cam_id_str else None
            asyncio.create_task(
                EvidenceSnapshotService().trigger_evidence_capture(
                    camera_id=_cam_uuid,
                    alert_id=created.id,
                    venue_name=decision.get("venue_name", "Unknown"),
                    risk_level=risk_level,
                )
            )
        except Exception:
            pass  # never block alert creation

        # 🔥 Step 1.4: Trigger LLM Explanation generation in background
        from app.core.database import db_manager
        from app.services.alert_explainer_service import AlertExplainerService

        async def _trigger_llm_explanation(alert_id: UUID, current_decision: Dict[str, Any]):
            async with db_manager.session() as bg_session:
                explainer = AlertExplainerService()
                await explainer.generate_explanation(bg_session, alert_id, current_decision)

        import asyncio
        # Run asynchronously to avoid blocking the alert pipeline
        asyncio.create_task(_trigger_llm_explanation(created.id, decision))

        logger.warning(
            "🚨 NEW ALERT CREATED",
            extra={
                "alert_id": str(created.id),
                "venue_id": str(venue_id),
                "venue_name": decision.get("venue_name"),
                "risk_level": risk_level,
                "risk_color": classification["color"],
                "requires_police": classification["requires_police"],
                "severity": classification["severity_score"],
                "recommended_action": decision.get("recommended_action"),
            },
        )

        return created

    # ==========================================================
    # Lifecycle Management
    # ==========================================================

    async def acknowledge_alert(
        self,
        session: AsyncSession,
        alert_id: UUID,
        user_id: UUID,
        notes: Optional[str] = None,
    ) -> CrowdAlert:
        """
        Mark an alert as acknowledged by a user.

        Acknowledged alerts are still active but indicate someone is aware.
        """
        alert = await self.alert_repo.get_by_id(session, alert_id)
        if not alert:
            raise ValueError("Alert not found.")

        if alert.status != "open":
            logger.info(
                "Alert already acknowledged/resolved",
                extra={"alert_id": str(alert_id), "status": alert.status},
            )
            return alert

        update_data = {
            "status": "acknowledged",
            "acknowledged_at": datetime.now(timezone.utc),
            "acknowledged_by": user_id,
        }
        
        

        if notes:
            # Append to existing notes or create new
            existing_notes = alert.notes or ""
            update_data["notes"] = f"{existing_notes}\n[ACK] {notes}" if existing_notes else f"[ACK] {notes}"

        updated = await self.alert_repo.update(
            session,
            alert,
            update_data,
            commit=True,
        )
        from app.services.notification_service import NotificationService
        notifier = NotificationService()
        await notifier.notify_status_change(session, updated, "acknowledged")

        logger.info(
            "Alert acknowledged",
            extra={
                "alert_id": str(alert_id),
                "user_id": str(user_id),
            },
        )

        return updated

    async def resolve_alert(
        self,
        session: AsyncSession,
        alert_id: UUID,
        user_id: Optional[UUID] = None,
        notes: Optional[str] = None,
    ) -> CrowdAlert:
        """
        Resolve an alert (manually or automatically).

        Args:
            alert_id: ID of alert to resolve
            user_id: User resolving (None for auto-resolution)
            notes: Optional resolution notes
        """
        alert = await self.alert_repo.get_by_id(session, alert_id)
        if not alert:
            raise ValueError("Alert not found.")

        if alert.status == "resolved":
            return alert

        # Calculate resolution time
        resolution_time = datetime.now(timezone.utc) - alert.created_at
        resolution_seconds = int(resolution_time.total_seconds())

        update_data = {
            "status": "resolved",
            "resolved_at": datetime.now(timezone.utc),
            "resolved_by": user_id,
        }
        

        if notes:
            # Append to existing notes
            existing_notes = alert.notes or ""
            resolution_note = f"[RESOLVED] {notes}"
            update_data["notes"] = f"{existing_notes}\n{resolution_note}" if existing_notes else resolution_note

        # Store resolution time in extra_data for analytics
        extra_data = alert.extra_data or {}
        extra_data["resolution_seconds"] = resolution_seconds
        update_data["extra_data"] = extra_data

        updated = await self.alert_repo.update(
            session,
            alert,
            update_data,
            commit=True,
        )
        from app.services.notification_service import NotificationService

        notifier = NotificationService()
        await notifier.notify_status_change(session, updated, "resolved")

        log_level = "INFO" if user_id else "DEBUG"
        logger.log(
            log_level,
            "Alert resolved",
            extra={
                "alert_id": str(alert_id),
                "user_id": str(user_id) if user_id else "system",
                "resolution_time_seconds": resolution_seconds,
            },
        )

        return updated

    # ==========================================================
    # Escalation Logic
    # ==========================================================

    async def check_escalations(
        self,
        session: AsyncSession,
    ) -> Dict[str, int]:
        """
        Check and escalate unresolved alerts.

        Returns:
            Dictionary with counts of escalated alerts by level
        """
        now = datetime.now(timezone.utc)

        # Get all open/acknowledged alerts
        stmt = (
            select(CrowdAlert)
            .where(CrowdAlert.status.in_(["open", "acknowledged"]))
        )

        result = await session.execute(stmt)
        alerts = result.scalars().all()

        escalation_counts = {1: 0, 2: 0, 3: 0}
        escalated_alerts = []

        for alert in alerts:
            new_level = self.escalation_policy.get_escalation_level(
                alert.created_at)

            if new_level > alert.escalation_level:
                # Escalate
                alert.escalation_level = new_level
                alert.last_notified_at = now
                from app.services.notification_service import NotificationService
                notifier = NotificationService()
                await notifier.notify(session, alert)
                escalated_alerts.append(alert)

                escalation_counts[new_level] = escalation_counts.get(
                    new_level, 0) + 1

                logger.warning(
                    f"Alert escalated to level {new_level}",
                    extra={
                        "alert_id": str(alert.id),
                        "venue_id": str(alert.venue_id),
                        "escalation_level": new_level,
                        "age_minutes": (now - alert.created_at).total_seconds() / 60,
                    },
                )

        # Bulk update escalated alerts
        if escalated_alerts:
            for alert in escalated_alerts:
                await self.alert_repo.update(
                    session,
                    alert,
                    {
                        "escalation_level": alert.escalation_level,
                        "last_notified_at": alert.last_notified_at,
                    },
                    commit=False,  # Bulk commit at end
                )
            await session.commit()

        return escalation_counts

    # ==========================================================
    # Auto-Resolution
    # ==========================================================

    async def auto_resolve_low_risk(
        self,
        session: AsyncSession,
        minutes: Optional[int] = None,
    ) -> int:
        """
        Automatically resolve low/medium risk alerts after they've been open for a while.
        Prevents alert fatigue.
        """
        threshold_minutes = minutes or self.AUTO_RESOLVE_MINUTES
        cutoff = datetime.now(timezone.utc) - \
            timedelta(minutes=threshold_minutes)

        stmt = (
            select(CrowdAlert)
            .where(CrowdAlert.status.in_(["open", "acknowledged"]))
            .where(CrowdAlert.risk_level.in_(["low", "medium"]))
            .where(CrowdAlert.created_at <= cutoff)
        )

        result = await session.execute(stmt)
        alerts = result.scalars().all()

        count = 0
        for alert in alerts:
            await self.resolve_alert(
                session,
                alert.id,
                user_id=None,  # System auto-resolution
                notes=f"Auto-resolved due to low risk and age > {threshold_minutes} minutes"
            )
            count += 1

        if count > 0:
            logger.info(
                "Auto-resolved low risk alerts",
                extra={"count": count}
            )

        return count

    # ==========================================================
    # Query Helpers
    # ==========================================================

    async def _get_active_alert(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Optional[CrowdAlert]:
        """Get most recent active alert for a venue."""
        stmt = (
            select(CrowdAlert)
            .where(CrowdAlert.venue_id == venue_id)
            .where(CrowdAlert.status.in_(["open", "acknowledged"]))
            .order_by(CrowdAlert.created_at.desc())
            .limit(1)
        )

        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_active_alerts(
        self,
        session: AsyncSession,
        venue_id: Optional[UUID] = None,
        risk_level: Optional[str] = None,
    ) -> List[CrowdAlert]:
        """List all active alerts with optional filters."""
        stmt = (
            select(CrowdAlert)
            .where(CrowdAlert.status.in_(["open", "acknowledged"]))
            .order_by(CrowdAlert.severity.desc(), CrowdAlert.created_at.desc())
        )

        if venue_id:
            stmt = stmt.where(CrowdAlert.venue_id == venue_id)
        if risk_level:
            stmt = stmt.where(CrowdAlert.risk_level == risk_level)

        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def get_alert_summary(
        self,
        session: AsyncSession,
        venue_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """Get summary of alerts for dashboard."""
        stmt = select(CrowdAlert)
        if venue_id:
            stmt = stmt.where(CrowdAlert.venue_id == venue_id)

        result = await session.execute(stmt)
        alerts = result.scalars().all()

        summary = {
            "total": len(alerts),
            "by_status": {
                "open": 0,
                "acknowledged": 0,
                "resolved": 0,
            },
            "by_risk": {
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
            },
            "active_critical": 0,
            "active_high": 0,
        }

        for a in alerts:
            summary["by_status"][a.status] = summary["by_status"].get(
                a.status, 0) + 1
            summary["by_risk"][a.risk_level] = summary["by_risk"].get(
                a.risk_level, 0) + 1

            if a.status in ["open", "acknowledged"]:
                if a.risk_level == "critical":
                    summary["active_critical"] += 1
                elif a.risk_level == "high":
                    summary["active_high"] += 1

        return summary

    # ==========================================================
    # Analytics
    # ==========================================================

    async def get_alert_history(
        self,
        session: AsyncSession,
        venue_id: Optional[UUID] = None,
        days: int = 7,
    ) -> Dict[str, Any]:
        """
        Get detailed alert history for analytics.

        Includes:
        - Daily breakdown
        - Mean Time To Resolve (MTTR)
        - Distribution by risk level
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)

        stmt = select(CrowdAlert).where(CrowdAlert.created_at >= since)
        if venue_id:
            stmt = stmt.where(CrowdAlert.venue_id == venue_id)

        result = await session.execute(stmt)
        alerts = result.scalars().all()

        # Group by day
        by_day = {}
        for alert in alerts:
            day = alert.created_at.date().isoformat()
            if day not in by_day:
                by_day[day] = {"total": 0, "critical": 0,
                               "high": 0, "medium": 0, "low": 0}

            by_day[day]["total"] += 1
            by_day[day][alert.risk_level] = by_day[day].get(
                alert.risk_level, 0) + 1

        # Calculate MTTR (Mean Time to Resolve)
        resolved = [a for a in alerts if a.status ==
                    "resolved" and a.resolved_at]
        if resolved:
            total_time = sum(
                (a.resolved_at - a.created_at).total_seconds()
                for a in resolved
            )
            mttr_seconds = total_time / len(resolved)
        else:
            mttr_seconds = None

        return {
            "period": {
                "from": since.isoformat(),
                "to": datetime.now(timezone.utc).isoformat(),
                "days": days,
            },
            "total_alerts": len(alerts),
            "by_status": {
                "open": sum(1 for a in alerts if a.status == "open"),
                "acknowledged": sum(1 for a in alerts if a.status == "acknowledged"),
                "resolved": sum(1 for a in alerts if a.status == "resolved"),
            },
            "by_risk": {
                "critical": sum(1 for a in alerts if a.risk_level == "critical"),
                "high": sum(1 for a in alerts if a.risk_level == "high"),
                "medium": sum(1 for a in alerts if a.risk_level == "medium"),
                "low": sum(1 for a in alerts if a.risk_level == "low"),
            },
            "by_day": by_day,
            "mttr": {
                "seconds": mttr_seconds,
                "minutes": round(mttr_seconds / 60, 2) if mttr_seconds else None,
                "hours": round(mttr_seconds / 3600, 2) if mttr_seconds else None,
            },
            "escalation_stats": {
                "escalated_count": sum(1 for a in alerts if a.escalation_level > 0),
                "max_escalation": max((a.escalation_level for a in alerts), default=0),
            },
        }
