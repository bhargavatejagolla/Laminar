"""
Laminar - Zone Intelligence API Endpoints
-------------------------------------------

Exposes the unified zone intelligence layer to the frontend and alert consumers.

Routes:
    GET /api/v1/intelligence/camera/{camera_id}
        → Current ZoneIntelligenceSnapshot for all zones on a specific camera

    GET /api/v1/intelligence/summary
        → All cameras' latest snapshots (dashboard overview)

No DB queries. All data is from in-memory per-camera orchestrators.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logging import get_logger
from app.models.crowd_alert import CrowdAlert
from app.models.crowd_frame import CrowdFrame
from app.services.intelligence.zone_orchestrator import (
    get_zone_orchestrator,
    get_all_orchestrators,
    ZoneIntelligenceSnapshot,
)

logger = get_logger(__name__)

router = APIRouter(
    prefix="/intelligence",
    tags=["intelligence"],
)


# ─────────────────────────────────────────────────────────────────────────────
# GET /intelligence/camera/{camera_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/camera/{camera_id}",
    summary="Get zone intelligence snapshot for a camera",
    response_model=None,
)
async def get_camera_intelligence(
    camera_id: str,
    session: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Return the latest ZoneIntelligenceSnapshot for the given camera.

    Returns a structured dict with:
    - density trends and projections
    - dwell behavioral analytics
    - flow direction signals
    - overall risk level and human-readable summary
    """
    orchestrator = get_zone_orchestrator(camera_id)
    snap = orchestrator.get_latest()

    if snap is None:
        return {
            "camera_id": camera_id,
            "status": "warming_up",
            "message": "Intelligence engine is initializing — no data yet. "
                       "Ensure the camera stream is active.",
            "snapshot": None,
        }

    return {
        "camera_id": camera_id,
        "status": "active",
        "snapshot": snap.to_dict(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /intelligence/summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/summary",
    summary="Get intelligence summary for all active cameras",
    response_model=None,
)
async def get_intelligence_summary(
    session: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Return latest intelligence snapshot for every active camera.
    Merges in-memory orchestrators with DB camera list so all cameras appear,
    even if a worker hasn't been assigned yet.
    """
    from sqlalchemy import select
    from app.models.camera import Camera
    from app.models.venue import Venue

    # Fetch ALL active, non-deleted cameras from the DB
    query = (
        select(Camera.id, Camera.is_online, Camera.is_active, Camera.health_status,
               Camera.last_snapshot, Camera.venue_id,
               Camera.name.label("camera_name"), Venue.name.label("venue_name"),
               Venue.warning_threshold, Venue.critical_threshold, Venue.capacity)
        .outerjoin(Venue, Camera.venue_id == Venue.id)
        .where(Camera.is_active == True, Camera.deleted_at.is_(None))
    )
    result = await session.execute(query)
    db_cameras = {
        str(row.id): {
            "is_online": row.is_online,
            "camera_name": row.camera_name,
            "venue_name": row.venue_name,
            "health_status": row.health_status,
            "last_snapshot": row.last_snapshot,
            "venue_id": row.venue_id,
            "warning_threshold": row.warning_threshold,
            "critical_threshold": row.critical_threshold,
            "capacity": row.capacity,
        }
        for row in result.all()
    }

    # Get in-memory orchestrators (only exist for cameras with active workers)
    all_orch = get_all_orchestrators()

    cameras: List[Dict[str, Any]] = []
    alert_count = 0
    risk_breakdown: Dict[str, int] = {
        "low": 0, "medium": 0, "high": 0, "critical": 0
    }

    # Build union: all DB cameras + any orphan in-memory orchestrators
    all_camera_ids = set(db_cameras.keys()) | set(all_orch.keys())

    for camera_id in all_camera_ids:
        meta = db_cameras.get(camera_id, {})
        is_online = meta.get("is_online", False)
        camera_name = meta.get("camera_name", f"CAM-{camera_id[:6]}")
        venue_name = meta.get("venue_name", "Unknown Venue")
        health_status = meta.get("health_status", "unknown")

        orch = all_orch.get(camera_id)
        snap_obj = orch.get_latest() if orch else None
        
        # If we have an active orchestrator snapshot, it's LIVE
        if snap_obj:
            snap = snap_obj.to_dict()
            snap["is_live"] = True
        else:
            # No live orchestrator, check if we should show a cached DB snapshot
            # ONLY if it's very recent? For now, we follow "no static data" 
            # and only return 'active' if we have a live orchestrator.
            snap = None

        # Determine status
        if not is_online or health_status == "offline":
            cameras.append({
                "camera_id": camera_id,
                "camera_name": camera_name,
                "venue_name": venue_name,
                "status": "offline",
                "snapshot": None, # Force no static data for offline
            })
            continue

        if snap is None:
            cameras.append({
                "camera_id": camera_id,
                "camera_name": camera_name,
                "venue_name": venue_name,
                "status": "warming_up",
                "snapshot": None,
            })
            continue

        cameras.append({
            "camera_id": camera_id,
            "camera_name": camera_name,
            "venue_name": venue_name,
            "status": "active",
            "snapshot": snap,
        })

        if isinstance(snap, dict):
            risk_level = snap.get("intelligence", {}).get("overall_risk_level", "low")
            risk_breakdown[risk_level] = (
                risk_breakdown.get(risk_level, 0) + 1
            )
            if snap.get("intelligence", {}).get("alert_triggered"):
                alert_count += 1

    return {
        "total_cameras": len(all_camera_ids),
        "active_cameras": sum(1 for c in cameras if c["status"] == "active" or (c["status"] != "warming_up" and c.get("snapshot"))),
        "recent_alerts": alert_count,
        "risk_breakdown": risk_breakdown,
        "cameras": cameras,
    }



# ─────────────────────────────────────────────────────────────────────────────
# GET /intelligence/camera/{camera_id}/surge
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/camera/{camera_id}/surge",
    summary="Get surge signal only",
    response_model=None,
)
async def get_camera_surge(camera_id: str) -> Dict[str, Any]:
    """Return only surge/density intelligence for lightweight polling."""
    from app.services.intelligence.surge_engine import get_surge_engine
    engine = get_surge_engine(camera_id)
    signals = engine.all_signals()
    return {
        "camera_id": camera_id,
        "zones": {
            zid: {
                "current_density":          s.current_density,
                "smoothed_density":         s.smoothed_density,
                "rate_of_change_per_min":   s.rate_of_change_per_min,
                "projected_2min":           s.projected_2min,
                "projected_5min":           s.projected_5min,
                "trend":                    s.trend,
                "surge_intensity":          s.surge_intensity,
            }
            for zid, s in signals.items()
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /intelligence/camera/{camera_id}/dwell
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/camera/{camera_id}/dwell",
    summary="Get dwell behavioral signal only",
    response_model=None,
)
async def get_camera_dwell(camera_id: str) -> Dict[str, Any]:
    """Return only dwell behavior analytics for a camera."""
    from app.services.intelligence.dwell_engine import get_dwell_engine
    engine = get_dwell_engine(camera_id)
    s = engine.last_signal()
    return {
        "camera_id": camera_id,
        "avg_dwell_seconds":     s.avg_dwell_seconds,
        "max_dwell_seconds":     s.max_dwell_seconds,
        "long_dwell_count":      s.long_dwell_count,
        "group_dwell_detected":  s.group_dwell_detected,
        "group_dwell_zones":     s.group_dwell_zones,
        "zone_status":           s.zone_status,
        "stagnation_score":      s.stagnation_score,
        "distribution": {
            "short":  s.short_dwell_count,
            "medium": s.medium_dwell_count,
            "long":   s.long_dwell_count,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /intelligence/camera/{camera_id}/flow
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/camera/{camera_id}/flow",
    summary="Get flow direction signal only",
    response_model=None,
)
async def get_camera_flow(camera_id: str) -> Dict[str, Any]:
    """Return only flow direction analytics for a camera."""
    from app.services.intelligence.flow_engine import get_flow_engine
    engine = get_flow_engine(camera_id)
    s = engine.last_signal()
    return {
        "camera_id": camera_id,
        "dominant_direction":       s.dominant_direction,
        "directional_distribution": s.directional_distribution,
        "stationary_ratio":         s.stationary_ratio,
        "flow_intensity":           s.flow_intensity,
        "moving_count":             s.moving_count,
        "stationary_count":         s.stationary_count,
        "avg_speed_px_per_frame":   s.avg_speed_px_per_frame,
    }
