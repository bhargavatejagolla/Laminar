import os
import time
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import uuid

from fastapi import APIRouter, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse

from app.core.global_state import GLOBAL_STATE
from app.core.logging import get_logger
from app.vision.emergency_engine import EmergencyEngine, ACTIVE_SESSIONS

logger = get_logger(__name__)
router = APIRouter()

_greenwave_subscribers: Dict[str, List[asyncio.Queue]] = {}

def push_greenwave_event(session_id: str, payload: Dict[str, Any]):
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload
    }
    if session_id in _greenwave_subscribers:
        for q in list(_greenwave_subscribers[session_id]):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

@router.post("/upload")
async def upload_greenwave_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    session_id = str(uuid.uuid4())
    temp_path = f"data/{session_id}.mp4"
    os.makedirs("data", exist_ok=True)
    
    with open(temp_path, "wb") as f:
        f.write(await file.read())
        
    engine = EmergencyEngine(session_id, temp_path)
    ACTIVE_SESSIONS[session_id] = engine
    
    await engine.start()
    
    return {"session_id": session_id}

@router.post("/reset/{session_id}")
async def reset_greenwave_session(session_id: str):
    if session_id in ACTIVE_SESSIONS:
        await ACTIVE_SESSIONS[session_id].stop()
        del ACTIVE_SESSIONS[session_id]
        
    try:
        os.remove(f"data/{session_id}.mp4")
    except:
        pass
        
    return {"status": "ok"}

@router.get("/events/stream/{session_id}")
async def greenwave_events_stream(session_id: str):
    if session_id not in _greenwave_subscribers:
        _greenwave_subscribers[session_id] = []
        
    q = asyncio.Queue(maxsize=100)
    _greenwave_subscribers[session_id].append(q)

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
            if q in _greenwave_subscribers.get(session_id, []):
                _greenwave_subscribers[session_id].remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/stream/{session_id}")
async def greenwave_video_stream(session_id: str):
    engine = ACTIVE_SESSIONS.get(session_id)
    
    if not engine:
        return StreamingResponse(iter([]), media_type="multipart/x-mixed-replace; boundary=frame")

    async def frame_generator():
        last_yielded = None
        while engine._running:
            if engine._latest_frame_bytes and engine._latest_frame_bytes != last_yielded:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + engine._latest_frame_bytes + b'\r\n')
                last_yielded = engine._latest_frame_bytes
            await asyncio.sleep(0.033)

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

# Backwards compatibility
@router.get("/status")
async def get_greenwave_status() -> Dict[str, Any]:
    return GLOBAL_STATE.get_domain_state("greenwave")
