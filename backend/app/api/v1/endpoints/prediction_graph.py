from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from sqlalchemy import select
from datetime import datetime, timedelta, timezone

from app.core.database import get_db
from app.models.crowd_metric import CrowdMetric
from app.services.prediction_service import PredictionService
from app.core.logging import get_logger

router = APIRouter(prefix="/prediction", tags=["Prediction"])

logger = get_logger(__name__)

prediction_service = PredictionService()


@router.get("/graph/{venue_id}")
async def prediction_graph(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db)
):
    """
    Returns historical + forecast data for graph visualization.
    Always returns escalation_probs even when forecast engine needs more data.
    """
    try:
        # -----------------------------------------
        # 1. Fetch historical metrics (last 2h for more data)
        # -----------------------------------------
        since = datetime.now(timezone.utc) - timedelta(minutes=120)

        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_type == "minute")
            .where(CrowdMetric.bucket_start >= since)
            .order_by(CrowdMetric.bucket_start.asc())
        )

        result = await session.execute(stmt)
        metrics = list(result.scalars().all())

        historical_scores = []
        historical_timestamps = []
        historical_crowd_counts = []
        historical_occupancy_percents = []

        for m in metrics:
            if m.dynamic_risk_score is not None and m.dynamic_risk_score >= 0:
                historical_scores.append(round(m.dynamic_risk_score, 2))
                historical_timestamps.append(m.bucket_start.isoformat())
                historical_crowd_counts.append(round(m.avg_count or 0, 1))
                historical_occupancy_percents.append(round(m.occupancy_percent or 0, 1))

        # -----------------------------------------
        # 2. Run prediction engine
        # -----------------------------------------
        prediction = await prediction_service.forecast_risk(session, venue_id)

        forecast_curve = prediction.get("forecast_curve", [])
        upper_band = prediction.get("forecast_upper_band", [])
        lower_band = prediction.get("forecast_lower_band", [])
        forecast_escalation_probs = []

        # Build escalation probs from forecast if available
        if forecast_curve:
            base_esc = prediction.get("escalation_probability", 0)
            forecast_escalation_probs = [
                round(base_esc * max(1 - 0.03 * i, 0), 3)
                for i in range(len(forecast_curve))
            ]

        # -----------------------------------------
        # 3. Generate future timestamps
        # -----------------------------------------
        forecast_timestamps = []
        last_time = metrics[-1].bucket_start if metrics else datetime.now(timezone.utc)
        for i in range(1, len(forecast_curve) + 1):
            forecast_timestamps.append((last_time + timedelta(minutes=i)).isoformat())

        # -----------------------------------------
        # 4. ALWAYS build an escalation series
        #    - Use forecast escalation if forecast exists
        #    - Otherwise derive from historical risk scores (normalized to 0-1 prob)
        # -----------------------------------------
        if forecast_escalation_probs:
            escalation_timestamps = forecast_timestamps
            escalation_probabilities = forecast_escalation_probs
            escalation_source = "forecast"
        elif historical_scores:
            max_score = max(historical_scores) if historical_scores else 100
            escalation_timestamps = historical_timestamps
            escalation_probabilities = [
                round(min(s / max(max_score, 1), 1.0), 3)
                for s in historical_scores
            ]
            escalation_source = "historical_derived"
        else:
            # No data at all - return placeholder points so chart renders
            now = datetime.now(timezone.utc)
            escalation_timestamps = [
                (now - timedelta(minutes=i)).isoformat() for i in range(5, 0, -1)
            ]
            escalation_probabilities = [0.0, 0.0, 0.0, 0.0, 0.0]
            escalation_source = "placeholder"

        now_iso = datetime.now(timezone.utc).isoformat()

        return {
            "venue_id": str(venue_id),
            "generated_at": now_iso,

            "historical": {
                "timestamps": historical_timestamps,
                "risk_scores": historical_scores,
                "crowd_counts": historical_crowd_counts,
                "occupancy_percents": historical_occupancy_percents,
            },

            "forecast": {
                "timestamps": forecast_timestamps,
                "predicted_scores": forecast_curve,
                "upper_band": upper_band,
                "lower_band": lower_band,
                "escalation_probs": forecast_escalation_probs,
            },

            # Dedicated escalation series — ALWAYS populated for chart rendering
            "escalation": {
                "timestamps": escalation_timestamps,
                "probabilities": escalation_probabilities,
                "source": escalation_source,
            },

            "meta": {
                "model_used": prediction.get("model_used"),
                "confidence": prediction.get("confidence"),
                "horizon_minutes": prediction.get("horizon_minutes", 30),
                "predictive_peak": max(forecast_curve) if forecast_curve else None,
                "generated_at": now_iso,
                "has_forecast": len(forecast_curve) > 0,
                "historical_count": len(historical_scores),
            },

            "weather_context": prediction.get("weather_context"),
            "holiday_context": prediction.get("holiday_context"),
            "event_type": prediction.get("event_type"),
        }

    except Exception as e:
        logger.error(
            "Prediction graph generation failed",
            extra={"venue_id": str(venue_id), "error": str(e)}
        )
        return {
            "venue_id": str(venue_id),
            "status": "graph_generation_failed",
            "error": str(e)
        }
