"""
Laminar - Dwell Monitor API Endpoints
---------------------------------------

Endpoints:
  GET  /dwell/stream/{camera_id}        MJPEG stream with dwell overlays
  GET  /dwell/stats/{camera_id}         Live tracking stats
  GET  /dwell/analytics/wait-times      Aggregate analytics
  GET  /dwell/records                   Historical DB records
  POST /dwell/zones                     Create a monitoring zone
  GET  /dwell/zones/{camera_id}         Get zones for a camera
  DELETE /dwell/zones/{zone_id}         Delete a zone
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func

from app.core.database import db_manager
from app.core.logging import get_logger
from app.models.dwell_monitor import MonitoringZone, PersonDwellTime
from app.services.dwell_time_service import get_dwell_service

router = APIRouter()
logger = get_logger(__name__)


# ==============================================================
# Pydantic Schemas
# ==============================================================

class ZoneCreate(BaseModel):
    camera_id: UUID
    zone_name: str
    polygon_coordinates: list        # [[x1,y1],[x2,y2],...]
    long_wait_threshold_seconds: int = 600


class ZoneResponse(BaseModel):
    id: UUID
    camera_id: UUID
    zone_name: str
    polygon_coordinates: list
    long_wait_threshold_seconds: int
    is_active: bool

    class Config:
        from_attributes = True


# ==============================================================
# MJPEG Stream Endpoint
# ==============================================================

async def _dwell_frame_generator(camera_id: UUID):
    """Async generator that yields MJPEG frames with dwell overlays.
    
    Falls back to the standard annotated vision feed when no dwell-specific
    frame is available yet (e.g. right after worker start).
    """
    from app.vision.manager import vision_manager
    import cv2
    import numpy as np

    boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"

    last_yielded = None
    while True:
        jpeg = None
        worker = vision_manager._workers.get(camera_id)

        if worker:
            # 1. Prefer dwell-annotated frame (shows wait time overlays)
            if hasattr(worker, "get_latest_dwell_frame_jpeg"):
                jpeg = worker.get_latest_dwell_frame_jpeg(quality=65)

            # 2. Fall back to the standard annotated feed (YOLO boxes)
            if not jpeg and hasattr(worker, "_latest_annotated_frame") and worker._latest_annotated_frame is not None:
                try:
                    ok, buf = cv2.imencode(".jpg", worker._latest_annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                    if ok:
                        jpeg = buf.tobytes()
                except Exception:
                    pass

        if jpeg:
            if jpeg != last_yielded:
                yield boundary + jpeg + b"\r\n"
                last_yielded = jpeg
        else:
            # Minimal placeholder — much smaller than before so the stream
            # starts quickly and the browser doesn't think the feed is dead.
            try:
                img = np.zeros((240, 320, 3), dtype="uint8")
                cv2.putText(img, "Waiting for camera...", (20, 120),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (80, 120, 180), 1)
                _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 50])
                yield boundary + buf.tobytes() + b"\r\n"
            except Exception:
                pass

        await asyncio.sleep(0.033)   # ~30 fps


@router.get("/stream/{camera_id}", tags=["Dwell Monitor"])
async def dwell_stream(
    camera_id: str,
    token: Optional[str] = Query(None, description="JWT token for MJPEG auth (img tags cannot set headers)"),
):
    """
    MJPEG live stream with dwell-time annotations.
    Accepts token as query param because browser img tags cannot send Authorization headers.
    Each person shows: ID{n} | Xs · ZoneName
    """
    # Sanitize camera_id (handle cases like 'people/UUID' or 'dwelling/UUID')
    if "/" in camera_id:
        camera_id = camera_id.split("/")[-1]

    try:
        cam_uuid = UUID(camera_id)
    except Exception:
        raise HTTPException(404, f"Invalid camera_id UUID: {camera_id}")

    return StreamingResponse(
        _dwell_frame_generator(cam_uuid),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


# ==============================================================
# Live Stats
# ==============================================================

@router.get("/stats/{camera_id}", tags=["Dwell Monitor"])
async def dwell_stats(camera_id: str):
    """
    Returns live in-memory tracking stats for a camera.
    """
    # Sanitize camera_id
    if "/" in camera_id:
        camera_id = camera_id.split("/")[-1]

    try:
        cam_uuid = UUID(camera_id)
    except Exception:
        raise HTTPException(404, f"Invalid camera_id UUID: {camera_id}")

    # First try to get the live dwell_service from the running stream worker
    from app.vision.manager import vision_manager
    worker = vision_manager._workers.get(cam_uuid)
    if worker and hasattr(worker, 'dwell_service') and worker.dwell_service:
        return worker.dwell_service.get_live_stats()

    # Fallback: create/fetch from registry (will be empty if worker not running)
    service = get_dwell_service(cam_uuid)
    return service.get_live_stats()


# ==============================================================
# Analytics
# ==============================================================

@router.get("/analytics/wait-times", tags=["Dwell Monitor"])
async def wait_time_analytics(
    camera_id: Optional[UUID] = Query(None),
    hours: int = Query(default=24, ge=1, le=168),
):
    """
    Aggregate dwell-time analytics from DB records.

    Returns:
    - avg_wait_seconds, max_wait_seconds, total_records
    - people_currently_waiting (from in-memory service)
    - top_zones: [zone_name, count, avg_wait]
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    async with db_manager.session() as session:
        query = select(PersonDwellTime).where(PersonDwellTime.created_at >= since)
        if camera_id:
            query = query.where(PersonDwellTime.camera_id == camera_id)

        result = await session.execute(query)
        records = result.scalars().all()

    if not records:
        return {
            "avg_wait_seconds": 0.0,
            "max_wait_seconds": 0.0,
            "total_records": 0,
            "people_currently_waiting": 0,
            "queue_efficiency_score": None,
            "top_zones": [],
            "period_hours": hours,
        }

    dwells = [r.dwell_seconds for r in records]
    avg_dwell = round(sum(dwells) / len(dwells), 1)
    max_dwell = round(max(dwells), 1)

    # Zone breakdown
    from collections import Counter, defaultdict
    zone_counts: Counter = Counter()
    zone_dwells: defaultdict = defaultdict(list)
    for r in records:
        zone_counts[r.zone_name] += 1
        zone_dwells[r.zone_name].append(r.dwell_seconds)

    top_zones = [
        {
            "zone_name": z,
            "count": zone_counts[z],
            "avg_wait_seconds": round(sum(zone_dwells[z]) / len(zone_dwells[z]), 1),
        }
        for z in sorted(zone_counts, key=zone_counts.get, reverse=True)[:5]
    ]

    # Live count (from in-memory)
    live_count = 0
    if camera_id:
        svc = get_dwell_service(camera_id)
        live_count = svc.get_live_stats().get("people_tracked", 0)

    # Queue efficiency: records processed / avg wait (higher = better)
    efficiency = round(len(records) / (avg_dwell + 1), 2) if avg_dwell > 0 else None

    # Fetch latest intelligence brief from alerts
    latest_insight = None
    from app.models.crowd_alert import CrowdAlert
    from app.models.crowd_metric import CrowdMetric
    async with db_manager.session() as session:
        alert_stmt = (
            select(CrowdAlert)
            .where(CrowdAlert.status.in_(["new", "open"]))
            .order_by(CrowdAlert.created_at.desc())
            .limit(1)
        )
        if camera_id:
            # Join with CrowdMetric to filter by camera_id
            alert_stmt = (
                select(CrowdAlert)
                .join(CrowdMetric, CrowdAlert.metric_id == CrowdMetric.id)
                .where(CrowdAlert.status.in_(["new", "open"]))
                .where(CrowdMetric.camera_id == camera_id)
                .order_by(CrowdAlert.created_at.desc())
                .limit(1)
            )
        
        alert_res = await session.execute(alert_stmt)
        latest_alert = alert_res.scalar_one_or_none()
        if latest_alert:
            latest_insight = {
                "brief": latest_alert.explanation,
                "severity": latest_alert.severity,
                "created_at": latest_alert.created_at.isoformat(),
                "type": latest_alert.risk_level
            }

    return {
        "avg_wait_seconds": avg_dwell,
        "max_wait_seconds": max_dwell,
        "total_records": len(records),
        "people_currently_waiting": live_count,
        "queue_efficiency_score": efficiency,
        "top_zones": top_zones,
        "period_hours": hours,
        "active_insight": latest_insight
    }


# ==============================================================
# Historical Records
# ==============================================================

@router.get("/records", tags=["Dwell Monitor"])
async def dwell_records(
    camera_id: Optional[str] = Query(None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Paginated historical dwell time records."""
    cam_uuid = None
    if camera_id:
        if "/" in camera_id:
            camera_id = camera_id.split("/")[-1]
        try:
            cam_uuid = UUID(camera_id)
        except Exception:
            raise HTTPException(404, f"Invalid camera_id UUID: {camera_id}")

    async with db_manager.session() as session:
        query = select(PersonDwellTime).order_by(
            PersonDwellTime.created_at.desc()
        ).limit(limit).offset(offset)
        if cam_uuid:
            query = query.where(PersonDwellTime.camera_id == cam_uuid)
        result = await session.execute(query)
        records = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "camera_id": str(r.camera_id),
            "tracker_id": r.tracker_id,
            "zone_name": r.zone_name,
            "enter_time": r.enter_time.isoformat() if r.enter_time else None,
            "last_seen_time": r.last_seen_time.isoformat() if r.last_seen_time else None,
            "exit_time": r.exit_time.isoformat() if r.exit_time else None,
            "dwell_seconds": round(r.dwell_seconds, 1),
            "alert_triggered": r.alert_triggered,
            "snapshot_enter_path": r.snapshot_enter_path,
            "snapshot_mid_path": r.snapshot_mid_path,
            "snapshot_exit_path": r.snapshot_exit_path,
        }
        for r in records
    ]


# ==============================================================
# Zone Management
# ==============================================================

@router.post("/zones", tags=["Dwell Monitor"], status_code=201)
async def create_zone(payload: ZoneCreate):
    """Create a monitoring zone polygon for a camera."""
    async with db_manager.session() as session:
        zone = MonitoringZone(
            camera_id=payload.camera_id,
            zone_name=payload.zone_name,
            polygon_coordinates=payload.polygon_coordinates,
            long_wait_threshold_seconds=payload.long_wait_threshold_seconds,
        )
        session.add(zone)
        await session.commit()
        await session.refresh(zone)
        return {
            "id": str(zone.id),
            "camera_id": str(zone.camera_id),
            "zone_name": zone.zone_name,
            "polygon_coordinates": zone.polygon_coordinates,
            "long_wait_threshold_seconds": zone.long_wait_threshold_seconds,
            "message": "Zone created successfully.",
        }


@router.get("/zones/{camera_id}", tags=["Dwell Monitor"])
async def get_zones(camera_id: str):
    """Get all active monitoring zones for a camera."""
    # Sanitize camera_id
    if "/" in camera_id:
        camera_id = camera_id.split("/")[-1]

    try:
        cam_uuid = UUID(camera_id)
    except Exception:
        raise HTTPException(404, f"Invalid camera_id UUID: {camera_id}")

    async with db_manager.session() as session:
        result = await session.execute(
            select(MonitoringZone).where(
                MonitoringZone.camera_id == cam_uuid,
                MonitoringZone.is_active.is_(True),
            )
        )
        zones = result.scalars().all()
        return [
            {
                "id": str(z.id),
                "zone_name": z.zone_name,
                "polygon_coordinates": z.polygon_coordinates,
                "long_wait_threshold_seconds": z.long_wait_threshold_seconds,
            }
            for z in zones
        ]


@router.delete("/zones/{zone_id}", tags=["Dwell Monitor"])
async def delete_zone(zone_id: UUID):
    """Soft-delete a monitoring zone."""
    async with db_manager.session() as session:
        result = await session.execute(
            select(MonitoringZone).where(MonitoringZone.id == zone_id)
        )
        zone = result.scalar_one_or_none()
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")
        zone.is_active = False
        await session.commit()
        return {"message": f"Zone '{zone.zone_name}' deleted."}


# ==============================================================
# Queue Intelligence — Live Metrics
# ==============================================================

@router.get("/metrics/{camera_id}", tags=["Dwell Monitor"])
async def queue_metrics(camera_id: str):
    """
    Advanced Queue Intelligence metrics for a camera.
    """
    # Sanitize camera_id
    if "/" in camera_id:
        camera_id = camera_id.split("/")[-1]

    try:
        cam_uuid = UUID(camera_id)
    except Exception:
        raise HTTPException(404, f"Invalid camera_id UUID: {camera_id}")

    from app.vision.manager import vision_manager
    worker = vision_manager._workers.get(cam_uuid)
    if worker and hasattr(worker, 'dwell_service') and worker.dwell_service:
        return worker.dwell_service.get_queue_metrics()

    # Fallback: use registry service (may be empty if no worker active)
    service = get_dwell_service(cam_uuid)
    return service.get_queue_metrics()


# ==============================================================
# Queue Intelligence — Hourly Historical Chart Data
# ==============================================================

@router.get("/history/hourly", tags=["Dwell Monitor"])
async def hourly_history(
    camera_id: Optional[str] = Query(None),
    hours: int = Query(default=24, ge=1, le=168),
):
    """
    Returns hourly-bucketed dwell time averages.
    """
    cam_uuid = None
    if camera_id:
        # Sanitize camera_id
        if "/" in camera_id:
            camera_id = camera_id.split("/")[-1]
        try:
            cam_uuid = UUID(camera_id)
        except Exception:
            raise HTTPException(404, f"Invalid camera_id UUID: {camera_id}")

    from collections import defaultdict
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    async with db_manager.session() as session:
        query = select(PersonDwellTime).where(PersonDwellTime.created_at >= since)
        if cam_uuid:
            query = query.where(PersonDwellTime.camera_id == cam_uuid)
        result = await session.execute(query)
        records = result.scalars().all()

    # Bucket by UTC hour
    buckets: dict = defaultdict(list)
    for r in records:
        ts = r.created_at
        if ts.tzinfo is None:
            from datetime import timezone as tz
            ts = ts.replace(tzinfo=tz.utc)
        hour_key = ts.strftime("%H:00")
        buckets[hour_key].append(r.dwell_seconds)

    # Build ordered list for the last `hours` hours
    now = datetime.now(timezone.utc)
    result_list = []
    for i in range(hours, 0, -1):
        dt = now - timedelta(hours=i)
        label = dt.strftime("%H:00")
        vals = buckets.get(label, [])
        result_list.append({
            "hour_label": label,
            "avg_wait_seconds": round(sum(vals) / len(vals), 1) if vals else 0.0,
            "count": len(vals),
        })

    return {
        "period_hours": hours,
        "buckets": result_list,
    }


# ==============================================================
# Queue Intelligence — Page Lifecycle Control
# ==============================================================

# Set of active camera_ids where queue page is currently open
_active_queue_sessions: set = set()


@router.post("/activate/{camera_id}", tags=["Dwell Monitor"], status_code=200)
async def activate_queue(camera_id: str):
    """
    Called by the frontend when the queue monitoring page is opened.
    """
    if "/" in camera_id:
        camera_id = camera_id.split("/")[-1]

    _active_queue_sessions.add(camera_id)
    logger.info(f"Queue Intelligence activated for camera {camera_id}")
    return {"status": "activated", "camera_id": camera_id, "active_sessions": len(_active_queue_sessions)}


@router.post("/deactivate/{camera_id}", tags=["Dwell Monitor"], status_code=200)
async def deactivate_queue(camera_id: str):
    """
    Called by the frontend when the user navigates away from the queue page.
    """
    if "/" in camera_id:
        camera_id = camera_id.split("/")[-1]

    _active_queue_sessions.discard(camera_id)
    logger.info(f"Queue Intelligence deactivated for camera {camera_id}")
    return {"status": "deactivated", "camera_id": camera_id, "active_sessions": len(_active_queue_sessions)}


@router.get("/active-sessions", tags=["Dwell Monitor"])
async def active_queue_sessions():
    """Returns which cameras currently have an active queue monitoring session."""
    return {"active_camera_ids": list(_active_queue_sessions)}


# ==============================================================
# Image Injection (MVP Demo)
# ==============================================================

@router.post("/upload", tags=["Dwell Monitor"])
async def upload_dwell_image(
    camera_id: str = Query(...),
    file: UploadFile = File(...)
):
    """
    Accept an image, inject it into the active StreamWorker for crowd analysis.
    This allows "Live" feed demonstration even without a physical camera.
    """
    import cv2
    import numpy as np
    from app.vision.manager import vision_manager

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # Sync with active worker if it exists
    worker = vision_manager._workers.get(camera_id)
    if worker:
        # StreamWorker now supports injected_frame
        worker.injected_frame = img.copy()
        return {
            "status": "success",
            "message": f"Frame injected into active worker for camera {camera_id}",
            "worker_active": True
        }

    return {
        "status": "warning",
        "message": f"No active worker found for camera {camera_id}. Frame not injected.",
        "worker_active": False
    }

