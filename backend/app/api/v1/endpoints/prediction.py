from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.database import get_db
from app.services.prediction_service import PredictionService
from app.core.logging import get_logger

router = APIRouter(prefix="/prediction", tags=["Prediction"])

logger = get_logger(__name__)

prediction_service = PredictionService()


@router.get("/forecast/{venue_id}")
async def forecast_venue_risk(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db)
):
    """
    Generate risk forecast for a venue.
    """

    try:

        result = await prediction_service.forecast_risk(
            session,
            venue_id
        )

        return {
            "venue_id": str(venue_id),
            "generated_at": result.get("generated_at"),
            **result
        }

    except Exception as e:

        logger.error(
            "Prediction failed",
            extra={
                "venue_id": str(venue_id),
                "error": str(e)
            }
        )

        return {
            "venue_id": str(venue_id),
            "status": "prediction_error"
        }

