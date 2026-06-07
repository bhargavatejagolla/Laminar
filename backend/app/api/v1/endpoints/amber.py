from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import time
import random
import logging
from datetime import datetime, timezone, timedelta

from app.vision.camera_manager import CameraManager
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.dwell_monitor import PersonDwellTime

router = APIRouter()
logger = logging.getLogger(__name__)

class AmberTrajectoryPoint(BaseModel):
    camera_id: str
    camera_name: str
    timestamp: float
    confidence: float
    status: str # 'past', 'live'
    action: str
    zone_name: Optional[str] = None
    snapshot_path: Optional[str] = None

class AmberResponse(BaseModel):
    subject_id: str
    status: str
    total_cameras_scanned: int
    trajectory: List[AmberTrajectoryPoint]

@router.post("/upload", response_model=AmberResponse)
async def activate_amber_alert(
    file: UploadFile = File(...),
    venue_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Activates the Zero-Latency AMBER Protocol.
    Parses the incoming image, generates a neural embedding, and scans all cameras within the venue.
    """
    logger.info(f"AMBER PROTOCOL ACTIVATED for venue {venue_id}")
    
    start_time = time.time()
    all_cameras = await CameraManager.list_cameras()
    
    venue_cameras = []
    if venue_id:
        venue_cameras = [c for c in all_cameras if str(c.venue_id) == str(venue_id)]
    
    if not venue_cameras:
        venue_cameras = [c for c in all_cameras if c.is_active]
        
    if not venue_cameras:
        raise HTTPException(status_code=400, detail="CRITICAL: No active camera streams available in sector to parse.")

    # Convert venue camera IDs to strings for DB query
    camera_ids = [str(c.id) for c in venue_cameras]

    # Look for recent tracking records using FAISS AI Vector Search
    from app.vision.amber_vector_store import amber_vector_store
    from app.services.face_recognition_service import face_service
    from app.services.reid_service import reid_service
    import numpy as np
    import cv2
    
    # Read the uploaded image to generate query embeddings
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    query_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    trajectory = []
    
    if query_frame is not None:
        # 1. Try to extract a face embedding
        face_emb = face_service.extract_face_embedding(query_frame)
        
        # 2. Extract a body ReID embedding (assuming full image is the person)
        h, w = query_frame.shape[:2]
        body_emb = reid_service.extract_embedding(query_frame, [0, 0, w, h])
        
        results = []
        
        # Search FAISS with Face if available, otherwise Body
        if face_emb is not None:
            logger.info("Face detected in AMBER query. Performing Face Vector Search.")
            face_results = amber_vector_store.search(face_emb, top_k=10, threshold=0.55)
            # Filter to only 'face' type matches
            results = [r for r in face_results if r["meta"].get("type") == "face"]
            
        if not results and body_emb is not None and not np.all(body_emb == 0):
            logger.info("Performing Body ReID Vector Search.")
            # ResNet body embeddings have a very high baseline similarity, so we need a much stricter threshold
            body_results = amber_vector_store.search(body_emb, top_k=10, threshold=0.85)
            # Filter to only 'body' type matches
            results = [r for r in body_results if r["meta"].get("type") == "body"]
            
        # Filter by venue cameras
        venue_results = [r for r in results if str(r["meta"].get("camera_id")) in camera_ids]
        
        # Take the top 4 chronological results for the trajectory
        venue_results.sort(key=lambda x: x["meta"].get("timestamp", ""))
        path_records = venue_results[-4:]
        
        for i, match in enumerate(path_records):
            is_live = (i == len(path_records) - 1)
            meta = match["meta"]
            
            cam_name = "Unknown Camera"
            for c in venue_cameras:
                if str(c.id) == str(meta.get("camera_id")):
                    cam_name = c.name
                    break
                    
            event_time = datetime.fromisoformat(meta.get("timestamp")).timestamp() if meta.get("timestamp") else time.time()
            
            trajectory.append(
                AmberTrajectoryPoint(
                    camera_id=str(meta.get("camera_id")),
                    camera_name=cam_name,
                    timestamp=event_time,
                    confidence=round(match["score"], 2),
                    status="live" if is_live else "past",
                    action=f"Target tracked dynamically in {meta.get('zone_name')}" if is_live else f"Historical trace matched in {meta.get('zone_name')}",
                    zone_name=meta.get("zone_name"),
                    snapshot_path=None # We'd ideally save the crop, but for now we omit it
                )
            )

    response_status = "LOCK_ACQUIRED" if trajectory else "NOT_FOUND"

    # Trigger Real-Time Notification if we found a match
    if trajectory:
        try:
            from app.services.notification_service import NotificationService
            notifier = NotificationService()
            
            # The last point is the "Live" location
            last_loc = trajectory[-1]
            venue_name_str = "Venue"
            if venue_id:
                for c in all_cameras:
                    if str(c.venue_id) == str(venue_id):
                        venue_name_str = "Selected Venue"
                        break
            
            # Generate a Tracking URL
            tracking_id = f"AMBER-{random.randint(1000, 9999)}"
            tracking_url = f"{settings.FRONTEND_URL}/amber-rescue?track_id={tracking_id}"
            
            meta = {
                "insight": "High-confidence neural signature match found across camera network.",
                "camera_location": last_loc.zone_name or last_loc.camera_name,
                "domain": "AMBER_PROTOCOL",
                "type": "target_locked",
                "tracking_id": tracking_id,
                "tracking_url": tracking_url
            }
            
            # Trigger WebSocket Alert
            try:
                from app.api.v1.endpoints.websocket import ws_manager
                asyncio.create_task(
                    ws_manager.broadcast(
                        message={
                            "type": "target_locked",
                            "data": meta
                        }
                    )
                )
            except Exception as e:
                logger.warning(f"WebSocket broadcast failed for AMBER: {e}")
            
            # Await the notification to prevent DB session closed error
            await notifier.notify_realtime_event(
                session=db,
                domain="AMBER_PROTOCOL",
                type="target_locked",
                priority="CRITICAL",
                description=f"AMBER TARGET LOCKED: Missing person located in {last_loc.zone_name or last_loc.camera_name}. Neural Signature Match Confidence: {int(last_loc.confidence*100)}%.",
                venue_id=venue_id if venue_id else "00000000-0000-0000-0000-000000000000",
                venue_name=venue_name_str,
                camera_id=last_loc.camera_id,
                metadata=meta,
            )
            logger.info("Dispatched CRITICAL AMBER Notification to Police/Security contacts.")
        except Exception as e:
            logger.error(f"Failed to dispatch AMBER notification: {e}")

    return AmberResponse(
        subject_id=f"SUBJ-{random.randint(1000, 9999)}-AMBER",
        status=response_status,
        total_cameras_scanned=len(all_cameras),
        trajectory=trajectory
    )
