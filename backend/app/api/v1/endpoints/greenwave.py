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

# Global subscribers for GreenWave SSE
_greenwave_subscribers: List[asyncio.Queue] = []

def push_greenwave_event(camera_id: str, payload: Dict[str, Any]):
    event = {
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload
    }
    for q in list(_greenwave_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass

@router.get("/status")
async def get_greenwave_status() -> Dict[str, Any]:
    return GLOBAL_STATE.get_domain_state("greenwave")

@router.get("/events/stream")
async def greenwave_events_stream():
    q = asyncio.Queue(maxsize=100)
    _greenwave_subscribers.append(q)

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
            if q in _greenwave_subscribers:
                _greenwave_subscribers.remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/stream/{camera_id}")
async def greenwave_video_stream(camera_id: UUID):
    from app.vision.orchestrator import ORCHESTRATOR
    worker = ORCHESTRATOR._workers.get(camera_id)
    
    if not worker or not hasattr(worker, "_cached_frame_bytes"):
        return StreamingResponse(iter([]), media_type="multipart/x-mixed-replace; boundary=frame")

    async def frame_generator():
        last_yielded = None
        while True:
            if worker._cached_frame_bytes and worker._cached_frame_bytes != last_yielded:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + worker._cached_frame_bytes + b'\r\n')
                last_yielded = worker._cached_frame_bytes
            await asyncio.sleep(0.033)

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")
