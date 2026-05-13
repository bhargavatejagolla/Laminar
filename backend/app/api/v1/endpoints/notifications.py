"""
Laminar - Unified Notification API
----------------------------------
SSE stream and REST endpoints for the global emergency mesh.
"""

import json
import asyncio
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.services.notification_service import notification_service

router = APIRouter()

@router.get("/stream")
async def notification_stream():
    """
    Unified SSE stream for all urban hazards (Accidents, Parking, Traffic).
    """
    q = await notification_service.get_sse_subscriber()
    
    async def event_generator():
        try:
            # Welcome packet
            yield "data: {\"status\": \"mesh_connected\"}\n\n"
            
            while True:
                try:
                    notification = await asyncio.wait_for(q.get(), timeout=25.0)
                    
                    # Custom serialization to handle UUID, Decimal, and datetime
                    def json_serializable(obj):
                        from uuid import UUID
                        from decimal import Decimal
                        from datetime import datetime
                        if isinstance(obj, (datetime, UUID, Decimal)):
                            return str(obj)
                        raise TypeError(f"Type {type(obj)} not serializable")

                    data = json.dumps(notification, default=json_serializable)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                except Exception as e:
                    import logging
                    logging.getLogger("uvicorn.error").error(f"SSE Serialization Error: {e}")
                    # Don't break the stream, just skip this message
                    continue
        finally:
            notification_service.remove_sse_subscriber(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/recent")
async def get_recent_notifications(limit: int = 20):
    """
    REST fallback to get recent notification history.
    """
    return notification_service.get_recent(limit)
