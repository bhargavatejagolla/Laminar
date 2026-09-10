"""
LAMINAR - Intelligence Events API
---------------------------------
REST and SSE endpoints for querying, acknowledging, and streaming
unified operational intelligence events.
"""

import json
import asyncio
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.services.event_bus import event_bus

router = APIRouter()

@router.get("")
async def get_intelligence_events(
    venue_id: Optional[str] = Query(None, description="Filter by venue ID"),
    domain: Optional[str] = Query(None, description="Filter by domain: traffic, parking, incident, road_condition"),
    severity: Optional[str] = Query(None, description="Filter by severity: info, warning, high, critical"),
    state: Optional[str] = Query(None, description="Filter by state: candidate, verified, active, acknowledged, resolved"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of events to return")
):
    """Query recent intelligence events with provenance and explainability."""
    events = event_bus.get_events(
        venue_id=venue_id,
        domain=domain,
        severity=severity,
        state=state,
        limit=limit
    )
    return {
        "success": True,
        "count": len(events),
        "events": events
    }

@router.get("/urban-pulse")
async def get_urban_pulse(
    venue_id: Optional[str] = Query(None, description="Optional venue ID scoping")
):
    """Get high-level Urban Pulse operational health summary."""
    pulse = event_bus.get_urban_pulse(venue_id=venue_id)
    return {
        "success": True,
        "pulse": pulse
    }

@router.get("/report/pdf")
async def export_road_intelligence_pdf(
    venue_id: Optional[str] = Query(None, description="Optional venue ID scoping")
):
    """
    Export certified operational PDF audit report for road intelligence,
    incidents, and model governance.
    """
    from fastapi.responses import Response
    from app.core.database import async_session_factory
    from app.services.pdf_report_service import pdf_report_service
    from app.core.logging import get_logger
    _logger = get_logger(__name__)

    try:
        async with async_session_factory() as session:
            pdf_bytes = await pdf_report_service.generate_road_intelligence_pdf(
                session=session,
                venue_id=venue_id
            )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="LAMINAR_ROAD_AUDIT_{venue_id or "GLOBAL"}.pdf"'
            }
        )
    except Exception as e:
        _logger.error(f"Error generating road intelligence PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed generating PDF report: {str(e)}")

@router.post("/{event_id}/acknowledge")
async def acknowledge_event(
    event_id: str,
    operator: str = Query("command_operator", description="Operator identifier")
):
    """Acknowledge an active event."""
    updated = event_bus.acknowledge_event(event_id, operator)
    if not updated:
        raise HTTPException(404, detail="Event not found")
    return {
        "success": True,
        "event": updated
    }

@router.post("/{event_id}/resolve")
async def resolve_event(
    event_id: str
):
    """Resolve an event."""
    updated = event_bus.resolve_event(event_id)
    if not updated:
        raise HTTPException(404, detail="Event not found")
    return {
        "success": True,
        "event": updated
    }

@router.get("/stream")
async def stream_intelligence_events():
    """SSE live stream of newly emitted intelligence events."""
    q = await event_bus.subscribe_sse()

    async def event_generator():
        try:
            # Yield initial connection heartbeat
            yield f"data: {json.dumps({'type': 'CONNECTED', 'timestamp': asyncio.get_event_loop().time()})}\n\n"
            while True:
                ev = await q.get()
                yield f"data: {json.dumps(ev)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            event_bus.unsubscribe_sse(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
