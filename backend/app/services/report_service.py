from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List
from uuid import UUID
import csv
import io
import statistics

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crowd_metric import CrowdMetric
from app.models.crowd_alert import CrowdAlert
from app.models.camera import Camera
from app.models.venue import Venue
from app.services.prediction_service import PredictionService
from app.core.logging import get_logger

logger = get_logger(__name__)


class ReportService:

    prediction_service = PredictionService()

    # ==========================================================
    # CSV EXPORT
    # ==========================================================

    async def export_csv(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> str:

        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .order_by(CrowdMetric.bucket_start.asc())
        )

        result = await session.execute(stmt)

        metrics = result.scalars().all()

        output = io.StringIO()

        writer = csv.writer(output)

        writer.writerow([
            "timestamp",
            "camera_id",
            "crowd_count",
            "risk_score",
            "risk_level"
        ])

        for m in metrics:
            writer.writerow([
                m.bucket_start.isoformat(),
                str(m.camera_id) if m.camera_id else None,
                m.avg_count,
                m.dynamic_risk_score,
                m.risk_level,
            ])

        return output.getvalue()

    # ==========================================================
    # DAILY SUMMARY
    # ==========================================================

    async def daily_summary(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Dict[str, Any]:

        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_start >= today_start)
        )

        result = await session.execute(stmt)

        metrics = result.scalars().all()

        if not metrics:
            return {
                "venue_id": str(venue_id),
                "message": "No data for today"
            }

        counts = [m.avg_count for m in metrics if m.avg_count is not None]
        risks = [
            m.dynamic_risk_score for m in metrics if m.dynamic_risk_score is not None]

        peak_crowd = max(counts) if counts else 0
        avg_crowd = statistics.mean(counts) if counts else 0

        peak_risk = max(risks) if risks else 0
        avg_risk = statistics.mean(risks) if risks else 0

        return {
            "venue_id": str(venue_id),
            "date": today_start.date().isoformat(),
            "total_records": len(metrics),
            "peak_crowd": peak_crowd,
            "average_crowd": round(avg_crowd, 2),
            "peak_risk_score": peak_risk,
            "average_risk_score": round(avg_risk, 2),
        }

    # ==========================================================
    # MANAGEMENT REPORT
    # ==========================================================

    async def management_report(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Dict[str, Any]:

        summary = await self.daily_summary(session, venue_id)

        # Alerts today
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        alert_stmt = (
            select(func.count(CrowdAlert.id))
            .where(CrowdAlert.venue_id == venue_id)
            .where(CrowdAlert.created_at >= today_start)
        )

        alert_result = await session.execute(alert_stmt)

        alert_count = alert_result.scalar() or 0

        # Prediction
        prediction = await self.prediction_service.forecast_risk(
            session=session,
            venue_id=venue_id
        )

        return {
            "venue_id": str(venue_id),
            "report_generated_at": datetime.now(timezone.utc).isoformat(),
            "daily_summary": summary,
            "alerts_today": alert_count,
            "prediction": {
                "predicted_level": prediction.get("predicted_level"),
                "predicted_risk_score": prediction.get("predicted_risk_score"),
                "confidence": prediction.get("confidence"),
                "model_used": prediction.get("model_used"),
                "holiday_context": prediction.get("holiday_context"),
                "weather_context": prediction.get("weather_context"),
                "event_type": prediction.get("event_type"),
            },
        }

    # ==========================================================
    # PREDICTION ACCURACY REPORT
    # ==========================================================

    async def prediction_accuracy(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Dict[str, Any]:

        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .order_by(CrowdMetric.bucket_start.desc())
            .limit(100)
        )

        result = await session.execute(stmt)

        metrics = result.scalars().all()

        actual = [
            m.dynamic_risk_score
            for m in metrics
            if m.dynamic_risk_score is not None
        ]

        if len(actual) < 5:
            return {
                "venue_id": str(venue_id),
                "message": "Not enough data for accuracy calculation"
            }

        mean = statistics.mean(actual)

        variance = statistics.stdev(actual)

        return {
            "venue_id": str(venue_id),
            "samples": len(actual),
            "average_risk": round(mean, 2),
            "risk_volatility": round(variance, 2),
        }
