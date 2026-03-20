from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.database import get_db
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Reports"])

service = ReportService()


@router.get("/csv/{venue_id}")
async def export_csv(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db)
):

    csv_data = await service.export_csv(session, venue_id)

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=crowd_report_{venue_id}.csv"
        }
    )


@router.get("/daily/{venue_id}")
async def daily_summary(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db)
):

    return await service.daily_summary(session, venue_id)


@router.get("/management/{venue_id}")
async def management_report(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db)
):

    return await service.management_report(session, venue_id)


@router.get("/accuracy/{venue_id}")
async def prediction_accuracy(
    venue_id: UUID,
    session: AsyncSession = Depends(get_db)
):

    return await service.prediction_accuracy(session, venue_id)
