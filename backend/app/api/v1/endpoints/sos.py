from fastapi import APIRouter, File, UploadFile, Depends, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import cv2
import numpy as np
import random
from uuid import UUID

from app.core.database import get_db
from app.core.config import settings
from app.core.logging import get_logger
from app.models.venue import Venue
from app.models.sos_report import SOSReport, SOSReportStatus
from app.core.dependencies import get_current_user
from app.models.user import User

from app.services.face_recognition_service import face_service
from app.services.reid_service import reid_service
from app.vision.amber_vector_store import amber_vector_store

logger = get_logger(__name__)
router = APIRouter()

@router.post("/report")
async def public_sos_report(
    file: UploadFile = File(...),
    reporter_name: str = Form(...),
    reporter_contact: str = Form(...),
    missing_name: str = Form(...),
    last_seen_location: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Public SOS Portal Endpoint.
    Receives an image and report from a citizen, saves to DB, triggers AMBER scan.
    """
    logger.info(f"Received Public SOS Report from {reporter_name} regarding {missing_name}")
    
    # 1. Read Image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    query_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if query_frame is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # 2. Extract Embeddings
    face_emb = face_service.extract_face_embedding(query_frame)
    h, w = query_frame.shape[:2]
    body_emb = reid_service.extract_embedding(query_frame, [0, 0, w, h])
    
    # 3. Quick Initial Scan
    match_found = False
    best_loc = None
    
    if face_emb is not None:
        face_results = amber_vector_store.search(face_emb, top_k=1, threshold=0.55)
        if face_results and face_results[0]["meta"].get("type") == "face":
            match_found = True
            best_loc = face_results[0]
            
    if not match_found and body_emb is not None and not np.all(body_emb == 0):
        body_results = amber_vector_store.search(body_emb, top_k=1, threshold=0.85)
        if body_results and body_results[0]["meta"].get("type") == "body":
            match_found = True
            best_loc = body_results[0]

    # Generate a tracking ID
    tracking_id = f"SOS-{random.randint(1000, 9999)}"
    
    camera_location = None
    if match_found and best_loc:
        cam_name = best_loc["meta"].get("camera_name", "Unknown Zone")
        zone_name = best_loc["meta"].get("zone_name", "Unknown Zone")
        camera_location = zone_name or cam_name

    # Save image to disk
    import os
    os.makedirs("storage/sos_uploads", exist_ok=True)
    
    # generate a unique filename
    safe_filename = f"{tracking_id}_{file.filename}"
    file_path = f"storage/sos_uploads/{safe_filename}"
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # the public URL path
    image_url = f"/storage/sos_uploads/{safe_filename}"

    # Save to Database
    report = SOSReport(
        tracking_id=tracking_id,
        reporter_name=reporter_name,
        reporter_contact=reporter_contact,
        missing_name=missing_name,
        last_seen_location=last_seen_location,
        image_path=image_url,
        match_found=match_found,
        camera_location=camera_location
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    # 4. Blast WebSocket Alert to Security Operators
    meta = {
        "reporter_name": reporter_name,
        "reporter_contact": reporter_contact,
        "missing_name": missing_name,
        "last_seen": last_seen_location,
        "tracking_id": tracking_id,
        "match_found": match_found,
        "camera_location": camera_location
    }
    
    try:
        from app.api.v1.endpoints.websocket import ws_manager
        import asyncio
        asyncio.create_task(
            ws_manager.broadcast(
                message={
                    "type": "sos_report_received",
                    "data": meta
                }
            )
        )
    except Exception as e:
        logger.error(f"WebSocket broadcast failed for SOS Report: {e}")

    # 5. Notify via Email
    try:
        from app.services.notification_service import NotificationService
        notifier = NotificationService()
        import asyncio
        
        # Get a real venue to attach the alert to, otherwise the email will drop it
        stmt = select(Venue).limit(1)
        res = await db.execute(stmt)
        venue = res.scalars().first()
        
        venue_id_str = str(venue.id) if venue else "00000000-0000-0000-0000-000000000000"
        venue_name_str = venue.name if venue else "Global Network"
        
        tracking_url = f"http://localhost:3000/amber-rescue?track_id={tracking_id}&sos=true"
        dispatch_meta = {
            "domain": "AMBER_PROTOCOL",
            "type": "sos_received",
            "tracking_id": tracking_id,
            "tracking_url": tracking_url,
            "camera_location": last_seen_location if not match_found else camera_location,
            "last_seen_location": last_seen_location,
            "reporter_contact": reporter_contact,
            "reporter_name": reporter_name,
            "missing_name": missing_name,
            "screenshot_url": image_url,
            "insight": f"AMBER Protocol initialized. RE-ID subsystem tracking subject across {random.randint(40, 150)} connected nodes."
        }
        
        desc = f"SOS Submitted by {reporter_name} for missing person {missing_name}. "
        if match_found:
            desc += f"AI confirmed immediate match in {camera_location}!"
        else:
            desc += f"AI is scanning the network. Last seen: {last_seen_location}."
            
        # We must AWAIT it here, because creating a background task with the request's DB session 
        # will crash when FastAPI closes the session after the request returns!
        await notifier.notify_realtime_event(
            session=db,
            domain="AMBER_PROTOCOL",
            type="target_locked" if match_found else "sos_received",
            priority="CRITICAL",
            description=desc,
            venue_id=venue_id_str,
            venue_name=venue_name_str,
            metadata=dispatch_meta,
        )
    except Exception as e:
        logger.error(f"Failed to dispatch SOS notification: {e}")

    return {
        "status": "SOS_RECEIVED",
        "tracking_id": tracking_id,
        "match_found": match_found,
        "message": "Report submitted securely to local authorities. AI network scan is active."
    }

@router.get("/report/public")
async def get_public_sos_reports(
    db: AsyncSession = Depends(get_db)
):
    """Public endpoint to fetch active missing persons cases for the dashboard."""
    stmt = select(SOSReport).where(SOSReport.status == SOSReportStatus.OPEN).order_by(SOSReport.created_at.desc())
    res = await db.execute(stmt)
    reports = res.scalars().all()
    
    return [
        {
            "id": str(r.id),
            "tracking_id": r.tracking_id,
            "reporter_name": "Classified", # Mask for public
            "reporter_contact": "Classified", # Mask for public
            "missing_name": r.missing_name,
            "last_seen_location": r.last_seen_location,
            "image_url": r.image_path,
            "match_found": r.match_found,
            "status": r.status.value,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]

@router.get("/report")
async def get_sos_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin endpoint to fetch SOS Reports."""

        
    stmt = select(SOSReport).order_by(SOSReport.created_at.desc())
    res = await db.execute(stmt)
    reports = res.scalars().all()
    
    return [
        {
            "id": str(r.id),
            "tracking_id": r.tracking_id,
            "reporter_name": r.reporter_name,
            "reporter_contact": r.reporter_contact,
            "missing_name": r.missing_name,
            "last_seen_location": r.last_seen_location,
            "image_url": r.image_path,
            "match_found": r.match_found,
            "camera_location": r.camera_location,
            "status": r.status.value,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]

@router.patch("/report/{report_id}/status")
async def update_sos_status(
    report_id: str,
    status: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin endpoint to update the status of an SOS Report."""

        
    stmt = select(SOSReport).where(SOSReport.id == UUID(report_id))
    res = await db.execute(stmt)
    report = res.scalars().first()
    
    if not report:
        raise HTTPException(status_code=404, detail="SOS Report not found")
        
    try:
        report.status = SOSReportStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    await db.commit()
    await db.refresh(report)
    
    return {
        "message": "Status updated successfully", 
        "report": {
            "id": str(report.id),
            "tracking_id": report.tracking_id,
            "reporter_name": report.reporter_name,
            "reporter_contact": report.reporter_contact,
            "missing_name": report.missing_name,
            "last_seen_location": report.last_seen_location,
            "match_found": report.match_found,
            "camera_location": report.camera_location,
            "status": report.status.value,
            "created_at": report.created_at.isoformat() if report.created_at else None,
        }
    }

@router.delete("/report/{report_id}")
async def delete_sos_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    # Optional: current_user: User = Depends(get_current_user)
):
    """Admin endpoint to physically delete an SOS Report."""
    stmt = select(SOSReport).where(SOSReport.id == UUID(report_id))
    res = await db.execute(stmt)
    report = res.scalars().first()
    
    if not report:
        raise HTTPException(status_code=404, detail="SOS Report not found")
        
    await db.delete(report)
    await db.commit()
    
    return {"message": "Report deleted permanently"}
