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
