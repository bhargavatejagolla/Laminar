"""
Laminar - SLA Monitoring Service
----------------------------------
Tracks Mean Time To Detect (MTTD) and Mean Time To Alert (MTTA)
per venue, computing SLA compliance percentages from existing DB data.

Definitions:
  MTTD: Time from a CrowdMetric risk_level change → first CrowdAlert created
  MTTA: Time from CrowdAlert created → alert acknowledged (status → "acknowledged")
  SLA compliance: % of alerts acknowledged within the configured SLA window (default 5 min)

Uses only existing CrowdMetric + CrowdAlert tables — no new schema needed.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.models.crowd_metric import CrowdMetric
from app.models.crowd_alert import CrowdAlert
from app.core.logging import get_logger

logger = get_logger(__name__)

DEFAULT_SLA_MINUTES = 5  # Alerts should be acknowledged within 5 minutes


class SLAService:
    """
    Computes SLA performance metrics for venue operations.
    """

    async def get_venue_sla(
        self,
        session: AsyncSession,
        venue_id: UUID,
        days: int = 7,
        sla_minutes: int = DEFAULT_SLA_MINUTES,
    ) -> Dict[str, Any]:
        """
        Compute full SLA report for a venue over the last N days.

        Returns:
          - MTTD (seconds): Mean time from risk escalation to first alert
          - MTTA (seconds): Mean time from alert creation to acknowledgment
          - SLA compliance (%): Alerts acknowledged within sla_minutes
          - Total alerts, escalations, acknowledgments
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # ── Fetch alerts for the venue ──────────────────────────────────────
        alert_stmt = (
            select(CrowdAlert)
            .where(CrowdAlert.venue_id == venue_id)
            .where(CrowdAlert.created_at >= since)
            .order_by(CrowdAlert.created_at.asc())
        )
        alert_result = await session.execute(alert_stmt)
        alerts = alert_result.scalars().all()

        if not alerts:
            return self._empty_report(venue_id, days, sla_minutes)

        # ── MTTA Calculation ────────────────────────────────────────────────
        mtta_seconds = []
        acknowledged_count = 0
        within_sla = 0

        for alert in alerts:
            # Find acknowledgment time from alert history or status
            if alert.status in ("acknowledged", "resolved"):
                # Use updated_at as a proxy for acknowledgment time if no separate field
                ack_time = alert.updated_at if hasattr(alert, "updated_at") else None
                if ack_time and ack_time > alert.created_at:
                    delta = (ack_time - alert.created_at).total_seconds()
                    mtta_seconds.append(delta)
                    acknowledged_count += 1
                    if delta <= sla_minutes * 60:
                        within_sla += 1

        # ── MTTD Calculation ────────────────────────────────────────────────
        # For MTTD: find risk-level escalation moments in CrowdMetric
        # Compare metric bucket_start to nearest alert created_at

        metric_stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= since)
            .where(CrowdMetric.bucket_type == "minute")
            .where(CrowdMetric.risk_level.in_(["medium", "high", "critical"]))
            .order_by(CrowdMetric.bucket_start.asc())
        )
        metric_result = await session.execute(metric_stmt)
        risk_metrics = metric_result.scalars().all()

        mttd_seconds = []
        alert_times = [a.created_at for a in alerts]

        for metric in risk_metrics:
            # Find the nearest alert that occurred after this metric
            future_alerts = [
                t for t in alert_times
                if t >= metric.bucket_start
            ]
            if future_alerts:
                nearest_alert = min(future_alerts)
                delta = (nearest_alert - metric.bucket_start).total_seconds()
                if delta <= 3600:  # Only count if within 1 hour (reasonable detection window)
                    mttd_seconds.append(delta)

        # ── Compute averages ─────────────────────────────────────────────────
        avg_mttd = (sum(mttd_seconds) / len(mttd_seconds)) if mttd_seconds else None
        avg_mtta = (sum(mtta_seconds) / len(mtta_seconds)) if mtta_seconds else None
        compliance = (within_sla / acknowledged_count * 100) if acknowledged_count > 0 else None

        # ── Severity breakdown ───────────────────────────────────────────────
        severity_dist: Dict[str, int] = {}
        for a in alerts:
            lvl = getattr(a, "risk_level", "unknown") or "unknown"
            severity_dist[lvl] = severity_dist.get(lvl, 0) + 1

        return {
            "venue_id": str(venue_id),
            "period_days": days,
            "sla_target_minutes": sla_minutes,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "metrics": {
                "total_alerts": len(alerts),
                "total_acknowledged": acknowledged_count,
                "total_escalation_events": len(risk_metrics),
                "mttd_seconds": round(avg_mttd, 1) if avg_mttd is not None else None,
                "mttd_minutes": round(avg_mttd / 60, 2) if avg_mttd is not None else None,
                "mtta_seconds": round(avg_mtta, 1) if avg_mtta is not None else None,
                "mtta_minutes": round(avg_mtta / 60, 2) if avg_mtta is not None else None,
                "sla_compliance_pct": round(compliance, 1) if compliance is not None else None,
                "within_sla_count": within_sla,
                "severity_distribution": severity_dist,
            },
            "status": self._compute_sla_status(compliance, avg_mttd, avg_mtta),
            "recommendations": self._generate_recommendations(
                compliance, avg_mttd, avg_mtta, len(alerts), acknowledged_count
            ),
        }

    def _empty_report(self, venue_id: UUID, days: int, sla_minutes: int) -> Dict[str, Any]:
        return {
            "venue_id": str(venue_id),
            "period_days": days,
            "sla_target_minutes": sla_minutes,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "metrics": {
                "total_alerts": 0,
                "total_acknowledged": 0,
                "total_escalation_events": 0,
                "mttd_seconds": None,
                "mtta_seconds": None,
                "sla_compliance_pct": None,
                "severity_distribution": {},
            },
            "status": "no_data",
            "recommendations": ["No alert data available for this period."],
        }

    def _compute_sla_status(
        self,
        compliance: Optional[float],
        mttd: Optional[float],
        mtta: Optional[float],
    ) -> str:
        if compliance is None:
            return "no_data"
        if compliance >= 95:
            return "excellent"
        elif compliance >= 80:
            return "good"
        elif compliance >= 60:
            return "acceptable"
        else:
            return "needs_improvement"

    def _generate_recommendations(
        self,
        compliance: Optional[float],
        mttd: Optional[float],
        mtta: Optional[float],
        total: int,
        acknowledged: int,
    ) -> List[str]:
        recs = []
        if compliance is not None and compliance < 80:
            recs.append(
                f"⚠️ SLA compliance at {compliance:.1f}% — "
                "increase operator response speed or adjust alert routing."
            )
        if mttd is not None and mttd > 300:
            recs.append(
                f"⚠️ Average MTTD is {mttd/60:.1f} min — "
                "consider lowering detection thresholds or increasing camera coverage."
            )
        if mtta is not None and mtta > 600:
            recs.append(
                f"⚠️ Average MTTA is {mtta/60:.1f} min — "
                "operators are slow to acknowledge. Review staffing during peak hours."
            )
        if acknowledged < total * 0.5:
            recs.append(
                f"ℹ️ Only {acknowledged}/{total} alerts acknowledged — "
                "ensure operators are reviewing alerts."
            )
        if not recs:
            recs.append("✅ SLA performance is within acceptable limits.")
        return recs

    async def get_platform_sla(
        self,
        session: AsyncSession,
        days: int = 7,
    ) -> Dict[str, Any]:
        """Get overall platform SLA across all venues."""
        from app.models.venue import Venue
        venue_stmt = select(Venue).where(Venue.is_active.is_(True))
        result = await session.execute(venue_stmt)
        venues = result.scalars().all()

        platform_stats = {
            "total_alerts": 0,
            "total_acknowledged": 0,
            "venues_analyzed": len(venues),
            "avg_compliance": [],
            "avg_mttd": [],
            "avg_mtta": [],
        }

        for v in venues:
            try:
                report = await self.get_venue_sla(session, v.id, days=days)
                m = report.get("metrics", {})
                platform_stats["total_alerts"] += m.get("total_alerts", 0)
                platform_stats["total_acknowledged"] += m.get("total_acknowledged", 0)
                if m.get("sla_compliance_pct") is not None:
                    platform_stats["avg_compliance"].append(m["sla_compliance_pct"])
                if m.get("mttd_seconds") is not None:
                    platform_stats["avg_mttd"].append(m["mttd_seconds"])
                if m.get("mtta_seconds") is not None:
                    platform_stats["avg_mtta"].append(m["mtta_seconds"])
            except Exception as e:
                logger.error(f"SLAService: Failed to compute venue {v.id}: {e}")

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "period_days": days,
            "venues_analyzed": platform_stats["venues_analyzed"],
            "total_alerts": platform_stats["total_alerts"],
            "total_acknowledged": platform_stats["total_acknowledged"],
            "platform_sla_compliance_pct": (
                round(sum(platform_stats["avg_compliance"]) / len(platform_stats["avg_compliance"]), 1)
                if platform_stats["avg_compliance"] else None
            ),
            "platform_mttd_seconds": (
                round(sum(platform_stats["avg_mttd"]) / len(platform_stats["avg_mttd"]), 1)
                if platform_stats["avg_mttd"] else None
            ),
            "platform_mtta_seconds": (
                round(sum(platform_stats["avg_mtta"]) / len(platform_stats["avg_mtta"]), 1)
                if platform_stats["avg_mtta"] else None
            ),
        }
