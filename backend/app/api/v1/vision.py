"""
Laminar - Vision API Endpoints
-------------------------------

Exposes VisionManager health, control, and live MJPEG streaming endpoints.
"""

from typing import Dict, Any, Optional
from uuid import UUID
import asyncio
import base64

from fastapi import APIRouter, HTTPException, Query, status, WebSocket, WebSocketDisconnect, Body
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from app.vision.manager import vision_manager
from app.vision.orchestrator import ORCHESTRATOR
from app.core.logging import get_logger
from app.core.security import decode_token

logger = get_logger(__name__)
router = APIRouter(tags=["Vision"])


def get_worker(camera_id: UUID) -> Optional[Any]:
    """Helper to find a worker in either the standard manager or orchestrator."""
    return vision_manager._workers.get(camera_id) or ORCHESTRATOR._workers.get(camera_id)


@router.get("/health")
async def vision_health() -> Dict[str, Any]:
    """
    Get health status of the vision system.
    
    Returns:
        - System running status
        - Camera counts
        - Performance metrics
        - Component status
        - Timestamps
    """
    try:
        # Try get_health first, fall back to get_status
        if hasattr(vision_manager, 'get_health'):
            return vision_manager.get_health()
        else:
            return vision_manager.get_status()
    except Exception as e:
        logger.error(f"Error getting vision health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving vision system health"
        )


@router.get("/cameras")
async def list_cameras() -> Dict[str, Any]:
    """
    List all active cameras with basic status.
    
    Returns:
        Dict with camera counts and status
    """
    try:
        if hasattr(vision_manager, 'get_health'):
            health = vision_manager.get_health()
            return {
                "total": health["cameras"]["total"],
                "healthy": health["cameras"]["healthy"],
                "unhealthy": health["cameras"]["unhealthy"],
            }
        else:
            status_data = vision_manager.get_status()
            cameras = status_data.get("cameras", {})
            return {
                "total": cameras.get("total", 0),
                "healthy": cameras.get("healthy", 0),
                "unhealthy": cameras.get("unhealthy", 0),
            }
    except Exception as e:
        logger.error(f"Error listing cameras: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving camera list"
        )


@router.get("/detector")
async def detector_status() -> Dict[str, Any]:
    """
    Get YOLO detector status.
    
    Returns:
        Model info and device status
    """
    try:
        from app.vision.detector import detector
        if hasattr(detector, 'get_status'):
            return detector.get_status()
        return {"loaded": False, "error": "detector status not available"}
    except Exception as e:
        logger.error(f"Error getting detector status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving detector status"
        )



@router.post("/cameras/{camera_id}/restart")
async def restart_camera(camera_id: UUID) -> Dict[str, Any]:
    """
    Manually restart a specific camera.
    """
    try:
        # Check standard manager
        success = await vision_manager.restart_camera(camera_id)
        if not success:
            # Check orchestrator (specialized workers don't have restart method yet, so we just stop/start via registry trigger usually)
            # but for now we look for the worker to confirm existence
            worker = ORCHESTRATOR._workers.get(camera_id)
            if worker:
                # Specialized workers are more complex, but we can at least return 400 for now or implement generic restart logic
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Restart not implemented for specialized Smart City workers"
                )
        
        if success:
            return {
                "success": True,
                "message": f"Camera {camera_id} restart initiated"
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Camera {camera_id} not found or inactive"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restarting camera {camera_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error restarting camera"
        )


# ==========================================================
# Live MJPEG Feed — uses cached annotated frame from worker
# ==========================================================

def _verify_stream_token(token: Optional[str]) -> bool:
    """
    Verify a JWT passed as query param for MJPEG streams.
    MJPEG <img> tags cannot send Authorization headers, so we use ?token=...
    """
    if not token:
        return False
    try:
        payload = decode_token(token)
        return bool(payload.get("sub"))
    except Exception:
        return False


@router.get("/feed/{camera_id}")
async def video_feed(
    camera_id: UUID,
    token: Optional[str] = Query(default=None, description="JWT bearer token for auth")
):
    """
    Stream MJPEG video feed from a specific camera with YOLO annotations.

    Authentication: Pass JWT as ?token=<jwt> query parameter.
    The stream can be embedded in an <img> tag:
      <img src="/api/v1/vision/feed/{camera_id}?token=..." />

    The feed serves the latest annotated frame (with YOLO bounding boxes)
    at up to 15fps. No blocking — reads from the worker's frame cache.
    """
    # Auth check
    if not _verify_stream_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid token required for stream access"
        )

    # REMOVED: immediate 404 check, because we want to gracefully return offline frames
    # if the camera worker is temporarily restarting.

    async def generate_frames():
        """Yield MJPEG frames from the worker's cached annotated frame."""
        import cv2
        import numpy as np

        # Pre-generate an offline frame to reuse and save CPU
        offline_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        # Add a subtle grid/dashboard look
        for i in range(0, 640, 40):
            cv2.line(offline_frame, (i, 0), (i, 480), (20, 20, 20), 1)
        for i in range(0, 480, 40):
            cv2.line(offline_frame, (0, i), (640, i), (20, 20, 20), 1)
            
        cv2.putText(offline_frame, "CAMERA FEED OFFLINE", (140, 220), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.putText(offline_frame, "Attempting to re-establish datalink...", (170, 260), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 1)
        _, buffer = cv2.imencode('.jpg', offline_frame)
        offline_bytes = buffer.tobytes()

        consecutive_empty = 0
        try:
            while True:
                worker = get_worker(camera_id)
                # If worker is missing, or not running, yield offline frame and poll
                if not worker or not getattr(worker, "_running", False):
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n"
                        + offline_bytes
                        + b"\r\n"
                    )
                    await asyncio.sleep(1.0)
                    continue

                # Get latest annotated frame (non-blocking)
                # Both StreamWorker and ParkingWorker cache JPEG bytes in _cached_frame_bytes
                frame_bytes = getattr(worker, "_cached_frame_bytes", None)

                if frame_bytes is None:
                    consecutive_empty += 1
                    if consecutive_empty > 50: # 5 seconds of no frames (increased for slow AI on Windows)
                        yield (
                            b"--frame\r\n"
                            b"Content-Type: image/jpeg\r\n\r\n"
                            + offline_bytes
                            + b"\r\n"
                        )
                        await asyncio.sleep(1.0)
                    else:
                        await asyncio.sleep(0.1)
                    continue

                consecutive_empty = 0
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame_bytes
                    + b"\r\n"
                )

                # Up to 60fps serving rate — encoding is cached so this is cheap
                await asyncio.sleep(1 / 60.0)

        except asyncio.CancelledError:
            logger.info(f"Client disconnected from feed: camera {camera_id}")
            raise
        except Exception as e:
            logger.error(f"Error in MJPEG feed for {camera_id}: {e}")

    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@router.get("/snapshot/{camera_id}")
async def camera_snapshot(
    camera_id: UUID,
    token: Optional[str] = Query(default=None, description="JWT bearer token")
):
    """
    Get a single JPEG snapshot from a camera's latest frame.
    Useful for thumbnails and status checks.
    """
    if not _verify_stream_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid token required"
        )

    worker = get_worker(camera_id)
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    frame_bytes = getattr(worker, "_cached_frame_bytes", None)
    if frame_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"No frame available from camera {camera_id}"
        )

    return Response(
        content=frame_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "max-age=1"}
    )

class FrameUpload(BaseModel):
    data: str

@router.post("/upload/{camera_id}")
async def http_video_upload(camera_id: UUID, payload: FrameUpload):
    """
    Receive browser webcam frames via standard HTTP POST chunking.
    This safely passes through the Next.js `rewrites()` proxy over Ngrok.
    """
    worker = get_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=400, detail="Camera worker not open")
    
    # Generic frame injection support
    if hasattr(worker, "injected_frame"):
        # This is for specialized workers (ParkingWorker)
        pass
    elif not getattr(worker, "source", None) or getattr(worker.source, "get_type", lambda: "")() != "browser_webcam":
        raise HTTPException(status_code=400, detail="Camera not configured for browser upload")

    import base64
    import numpy as np
    import cv2
        
    try:
        data = payload.data
        if data.startswith("data:image/jpeg;base64,"):
            data = data.split(",")[1]
        
        # Decode JPEG
        img_bytes = base64.b64decode(data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if frame is not None:
            # Route to either specialized 'injected_frame' or source 'feed_frame'
            if hasattr(worker, "injected_frame"):
                worker.injected_frame = frame
                # Reset detection timer to trigger immediate processing
                if hasattr(worker, "_last_detection_time"):
                    worker._last_detection_time = 0 
            elif hasattr(worker, "source") and hasattr(worker.source, "feed_frame"):
                worker.source.feed_frame(frame)
                
            return {"status": "ok"}
        else:
            raise HTTPException(status_code=400, detail="Invalid frame data")
            
    except Exception as e:
        logger.error(f"Error in http upload for {camera_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
