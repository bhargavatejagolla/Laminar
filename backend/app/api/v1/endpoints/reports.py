from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.services.report_service import ReportService
from app.core.logging import get_logger

router = APIRouter(prefix="/reports", tags=["Reports"])
logger = get_logger(__name__)
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


@router.get("/pdf/{venue_id}")
async def download_pdf_report(
    venue_id: UUID,
    days: int = 7,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),
):
    """
    Download AI-powered PDF intelligence report for a venue.
    Includes crowd trends, alert table, risk distribution, and AI narrative.
    """
    try:
        from app.services.pdf_report_service import PDFReportService
        pdf_service = PDFReportService()
        pdf_bytes = await pdf_service.generate_venue_pdf(session, venue_id, days=days)

        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=laminar_report_{venue_id}_{date_str}.pdf",
                "Content-Length": str(len(pdf_bytes)),
            }
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        raise HTTPException(status_code=500, detail="PDF generation failed")
