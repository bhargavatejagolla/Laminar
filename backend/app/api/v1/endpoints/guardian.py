from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from app.vision.orchestrator import VisionOrchestrator
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/stream/{camera_id}", summary="Get MJPEG Guardian Video Stream")
async def guardian_video_stream(camera_id: str):
    worker = VisionOrchestrator.get_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Guardian worker not initialized or camera not active")
        
    return StreamingResponse(
        worker.get_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/events/{camera_id}", summary="Get SSE events for Guardian Route tracking")
async def guardian_event_stream(camera_id: str):
    worker = VisionOrchestrator.get_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Guardian worker not initialized or camera not active")

    return StreamingResponse(
        worker.get_events(),
        media_type="text/event-stream"
    )
