import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.core.global_state import GLOBAL_STATE
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()

# Global subscribers for Kinetic SSE
_kinetic_subscribers: List[asyncio.Queue] = []

def push_kinetic_event(camera_id: str, payload: Dict[str, Any]):
    """Called by KineticWorker to broadcast live pose analytics."""
    event = {
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload
    }
    for q in list(_kinetic_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass

@router.get("/status")
async def get_kinetic_status() -> Dict[str, Any]:
    """Returns the live state of all kinetic cameras."""
    return GLOBAL_STATE.get_domain_state("kinetic")

@router.get("/events/stream")
async def kinetic_events_stream():
    """SSE stream for real-time kinetic anomalies and pose counts."""
    q = asyncio.Queue(maxsize=100)
    _kinetic_subscribers.append(q)

    async def event_generator():
        try:
            yield 'data: {"status": "connected"}\n\n'
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            if q in _kinetic_subscribers:
                _kinetic_subscribers.remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/stream/{camera_id}")
async def kinetic_video_stream(camera_id: UUID):
    """
    MJPEG stream providing the neon-skeleton overlay.
    Routes to the active KineticWorker for this camera.
    """
    from app.vision.orchestrator import ORCHESTRATOR
    worker = ORCHESTRATOR._workers.get(camera_id)
    
    if not worker or not hasattr(worker, "_cached_frame_bytes"):
        # Fallback if worker hasn't started or is wrong type
        return StreamingResponse(iter([]), media_type="multipart/x-mixed-replace; boundary=frame")

    async def frame_generator():
        while True:
            if worker._cached_frame_bytes:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + worker._cached_frame_bytes + b'\r\n')
            await asyncio.sleep(0.05)

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")
