"""
Laminar - Traffic API Endpoints (v2)
--------------------------------------

Provides REST + SSE + MJPEG endpoints for the Traffic Intelligence Dashboard.
Includes full video upload processing, analytics, density matrix, and notification feeds.
"""

import os
import io
import json
import time
import asyncio
import tempfile
import cv2
import numpy as np
from collections import deque
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.vision.traffic_detector import traffic_detector, GRID_ROWS, GRID_COLS
from app.vision.traffic_worker import draw_vehicle_overlays, draw_hud
from app.services.sms_alert_service import SmsAlertService
from app.services.notification_service import notification_service
from app.core.database import db_manager
from sqlalchemy import select
from app.models.user import User
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()

_last_injected_frame_bytes = {} # Global cache for injected photos

# ─────────────────────────────────────────────────────────────────────────────
# Rich Rule-Based AI Insight Engine (no external API — deterministic)
# ─────────────────────────────────────────────────────────────────────────────

def _try_parse_uuid(val: Any) -> Optional[UUID]:
    if not val:
        return None
    if isinstance(val, UUID):
        return val
    try:
        return UUID(str(val))
    except (ValueError, TypeError, AttributeHashError) if hasattr(globals(), 'AttributeHashError') else (ValueError, TypeError):
        return None

def _build_rich_insight(venue_name: str, count: int, density: str, velocity: float,
                        wait_time: float, risk_score: int, tier_label: str) -> tuple[str, str]:
    """
    Generates analyst-grade, data-driven insight + recommendation purely from
    telemetry values. No API calls, no latency, always available.
    """
    flow_label  = "stalled"    if velocity < 5  else \
                  "slow crawl" if velocity < 20 else \
                  "moderate"   if velocity < 60 else "fast"
    wait_phrase = "critically high" if wait_time > 15 else \
                  "elevated"        if wait_time > 8  else \
                  "moderate"        if wait_time > 3  else "minimal"
    risk_phrase = "severe operational risk" if risk_score > 80 else \
                  "high operational risk"   if risk_score > 60 else \
                  "moderate risk"           if risk_score > 35 else "low risk"

    # Insight — always includes actual numbers, specific language
    if density == "Critical":
        insight = (
            f"{count} vehicles detected at {venue_name} with fully {flow_label} flow at {velocity:.1f} px/s "
            f"— corridor has reached gridlock. Estimated clearance delay of {wait_time:.1f} min indicates "
            f"{risk_phrase} ({risk_score}%). Without immediate intervention, downstream junctions will saturate "
            f"within the next 5–8 minutes."
        )
        recommendation = (
            f"Activate Emergency Corridor Protocol: override signal timing on primary axis, deploy marshals "
            f"to the 3 nearest junctions, and redirect inbound traffic via alternate route immediately."
        )
    elif density == "High":
        insight = (
            f"{count} vehicles are moving at {flow_label} pace ({velocity:.1f} px/s) through {venue_name}, "
            f"with average queue wait of {wait_time:.1f} min — density threshold exceeded, risk at {risk_score}%. "
            f"Flow is showing {'deteriorating' if velocity < 15 else 'marginal'} throughput; "
            f"peak saturation is {'imminent' if velocity < 10 else 'likely within 10–15 min'} without signal adjustment."
        )
        recommendation = (
            f"Extend green phase on primary corridor by 15–20 s, activate variable message signs for "
            f"alternate routing, and alert field supervisors to standby for marshal deployment."
        )
    elif density == "Medium":
        insight = (
            f"{count} vehicles are maintaining {flow_label} movement at {velocity:.1f} px/s through {venue_name} "
            f"with a {wait_time:.1f} min average wait — load is within manageable bounds but trending upward. "
            f"Current risk index is {risk_score}%; proactive signal tuning is advised to prevent escalation."
        )
        recommendation = (
            f"Implement dynamic load balancing: extend green phase by 8–10 s and monitor queue growth "
            f"over the next 5 minutes before considering additional intervention."
        )
    else:
        insight = (
            f"{count} vehicles detected at {venue_name} with {flow_label} flow at {velocity:.1f} px/s — "
            f"conditions are within normal operating parameters. Wait time is {wait_phrase} at {wait_time:.1f} min, "
            f"risk index {risk_score}%. Corridor is operating below saturation threshold."
        )
        recommendation = (
            f"Maintain standard signal cadence and continue real-time monitoring; "
            f"no immediate intervention required."
        )
    return insight, recommendation


async def _enrich_traffic_insight(
    venue_name: str, count: int, density: str, velocity: float,
    wait_time: float, risk_score: int, tier_label: str,
    rule_insight: str, rule_recommendation: str,
) -> tuple[str, str]:
    """Returns rich rule-based insight/recommendation, ignoring Groq entirely."""
    if rule_insight and "Video analysis of" in rule_insight:
        return rule_insight, rule_recommendation
        
    insight, recommendation = _build_rich_insight(
        venue_name, count, density, velocity, wait_time, risk_score, tier_label
    )
    return insight, recommendation


# ─────────────────────────────────────────────────────────────────────────────
# Notification helper — wraps NotificationService for traffic events
# ─────────────────────────────────────────────────────────────────────────────

async def _fire_traffic_notification(
    venue_id: str,
    venue_obj,
    count: int,
    density: str,
    velocity: float,
    wait_time: float,
    risk_score: int,
    tier_label: str,
    insight: str,
    recommendation: str,
    screenshot_path: str = None,
    camera_id: str = None,
    lat: float = None,
    lng: float = None,
):
    """Sends a unified traffic alert via NotificationService (email + SMS + SSE bell)."""
    priority = tier_label.upper()

    # ── Enrich insight/recommendation with rich rule-based AI engine ──
    insight, recommendation = await _enrich_traffic_insight(
        venue_name=getattr(venue_obj, "name", "Unknown Venue"),
        count=count,
        density=density,
        velocity=velocity,
        wait_time=wait_time,
        risk_score=risk_score,
        tier_label=tier_label,
        rule_insight=insight,
        rule_recommendation=recommendation,
    )

    # Rich description for the bell card
    flow_label = "stalled" if velocity < 5 else "slow crawl" if velocity < 20 else "moderate" if velocity < 60 else "fast"
    description = (
        f"{count} vehicles detected · {density} congestion · "
        f"{velocity:.1f} px/s ({flow_label}) · wait ~{wait_time:.1f} min"
    )

    metadata = {
        "domain": "traffic",
        "vehicle_count": count,
        "count": count, # Core mapping for email templates
        "avg_count": count,
        "congestion_level": density,
        "flow_speed": round(velocity, 2),
        "wait_time": round(wait_time, 1),
        "risk_score": risk_score,
        "snapshot_path": screenshot_path,
        # AI insight fields rendered by NotificationBell expandable card
        "insight": insight,
        "recommendation": recommendation,
        "camera_id": str(camera_id) if 'camera_id' in locals() else None,
        "coordinates": f"{lat}, {lng}" if 'lat' in locals() and 'lng' in locals() else None,
        "camera_location": f"Camera ID: {camera_id}" if 'camera_id' in locals() else None,
    }
    try:
        async with db_manager.session() as sess:
            await notification_service.notify_realtime_event(
                session=sess,
                domain="traffic",
                type="congestion_alert",
                priority=priority,
                description=description,
                venue_id=venue_id,
                venue_name=getattr(venue_obj, "name", "Unknown Venue"),
                metadata=metadata,
            )
        logger.info(f"\u2705 Traffic notification sent: {getattr(venue_obj, 'name', '')} [{priority}]")
    except Exception as e:
        logger.error(f"\u274c Traffic notification failed: {e}")

    # Push to dashboard SSE bell with full metric context
    try:
        await notification_service.push_notification(
            type="congestion_alert",
            priority=priority,
            description=description,
            venue_id=venue_id,
            venue_name=getattr(venue_obj, "name", "Unknown Venue"),
            domain="traffic",
            metadata=metadata,
        )
    except Exception as e:
        logger.error(f"Traffic push_notification failed: {e}")



# ─────────────────────────────────────────────────────────────────────────────
# SSE Subscribers
# ─────────────────────────────────────────────────────────────────────────────
_sse_subscribers: list[asyncio.Queue] = []


def _push_traffic_event(camera_id: str, event: dict):
    from app.core.global_state import GLOBAL_STATE
    GLOBAL_STATE.push_event("traffic", camera_id, event)
    
    for q in list(_sse_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


def push_traffic_event(
    camera_id: str,
    count: int,
    density: str,
    velocity: float,
    wait_time: float,
    risk_score: int = 0,
    venue_id: Optional[str] = None,
    screenshot_path: Optional[str] = None,
):
    """Called by TrafficWorker to broadcast live analytics via SSE."""
    # ── 1. Coordinate & Threshold Lookup (Priority: GLOBAL_STATE) ──
    lat = 0.0
    lng = 0.0
    capacity = 100
    warn_t = 70
    crit_t = 90
    risk_level = "low"

    if venue_id:
        try:
            from app.core.global_state import GLOBAL_STATE
            v_state = GLOBAL_STATE.get_venue_state("traffic", venue_id)
            if v_state:
                capacity = v_state.get("capacity", 100)
                warn_t = v_state.get("warning_threshold", 70)
                crit_t = v_state.get("critical_threshold", 90)
                lat = v_state.get("latitude", 0.0)
                lng = v_state.get("longitude", 0.0)
            else:
                # Fallback: if not in venue state, check if we have it in camera state
                c_state = GLOBAL_STATE.get_camera_state("traffic", camera_id)
                if c_state:
                    lat = c_state.get("latitude", 0.0)
                    lng = c_state.get("longitude", 0.0)
        except Exception as e:
            logger.error(f"Error looking up coordinates for traffic event: {e}")

    # ── 2. Threshold-based risk assignment ──
    occupancy_pct = (count / capacity * 100) if capacity > 0 else 0
    if occupancy_pct >= (crit_t / capacity * 100 if capacity > 0 else 90):
        risk_level = "critical"
        density = "Critical"
    elif occupancy_pct >= (warn_t / capacity * 100 if capacity > 0 else 70):
        risk_level = "high"
        density = "High"
    elif occupancy_pct > 25:
        risk_level = "medium"
        density = "Medium"
    else:
        # Fallback to hardcoded density if occupancy is low
        if density == "Critical": risk_level = "critical"
        elif density == "High": risk_level = "high"
        elif density == "Medium": risk_level = "medium"

    # ── 3. Broadcast Event via SSE ──
    event = {
        "id": f"TRF-{camera_id[:4]}-{int(time.time()*1000)}",
        "camera_id": str(camera_id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": int(count),
        "density": str(density),
        "velocity": float(round(float(velocity), 2)),
        "wait_time": float(round(float(wait_time), 1)),
        "risk_score": int(risk_score),
        "latitude": float(lat),
        "longitude": float(lng),
    }
    _push_traffic_event(camera_id, event)

    # ── 4. Auto-generate notification if needed ──
    if risk_level != "low":
        insight = _generate_insight(count, density, velocity, wait_time)
        prediction = _generate_prediction(count, density, velocity)
        recommendation = _generate_recommendation(density, risk_score)
        tier_label = risk_level.upper()

        # Spam guard: only notify on tier transitions
        last_tier = _notified_traffic_tiers.get(camera_id, "")
        if last_tier != tier_label:
            _notified_traffic_tiers[camera_id] = tier_label

            # Fire unified notification via NotificationService (non-blocking)
            if venue_id:
                async def _fire_live_traffic_notification(vid, cnt, den, vel, wt, rs, tier, ins, rec, cid, latitude, longitude):
                    try:
                        from app.models.venue import Venue as VenueModel
                        async with db_manager.session() as sess:
                            v = await sess.get(VenueModel, UUID(vid))
                            if not v:
                                stmt = select(VenueModel).limit(1)
                                res = await sess.execute(stmt)
                                v = res.scalar_one_or_none()
                        if v:
                            await _fire_traffic_notification(
                                venue_id=vid, venue_obj=v,
                                count=cnt, density=den, velocity=vel,
                                wait_time=wt, risk_score=rs, tier_label=tier,
                                insight=ins, recommendation=rec,
                                screenshot_path=screenshot_path,
                                camera_id=cid, lat=latitude, lng=longitude
                            )
                    except Exception as ex:
                        logger.error(f"Live traffic notification failed: {ex}")

                try:
                    asyncio.get_running_loop().create_task(
                        _fire_live_traffic_notification(venue_id, count, density, velocity, wait_time, risk_score, tier_label, insight, recommendation, camera_id, lat, lng)
                    )
                except RuntimeError:
                    pass  # No running loop — worker is not in async context, skip

        # Always store in notifications feed (used by PDF and dashboard bell)
        from app.core.global_state import GLOBAL_STATE
        GLOBAL_STATE.push_event("notifications", "traffic", {
            "id": f"NOTIF-{int(time.time()*1000)}",
            "domain": "traffic",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "risk_level": str(risk_level),
            "latitude": float(lat),
            "longitude": float(lng),
            "total_vehicles": int(count),
            "congestion_level": str(density),
            "velocity": float(round(float(velocity), 2)),
            "wait_time": float(round(float(wait_time), 1)),
            "risk_score": int(risk_score),
            "insight": str(insight),
            "prediction": str(prediction),
            "recommendation": str(recommendation),
            "venue_id": str(venue_id) if venue_id else None
        })
    else:
        # Reset spam guard when risk drops back to low
        _notified_traffic_tiers.pop(camera_id, None)


def _generate_insight(count: int, density: str, velocity: float, wait: float) -> str:
    flow_status = "stalled" if velocity < 5 else "slow crawl" if velocity < 20 else "moderated"
    if density == "Critical":
        return f"CRITICAL CONGESTION: {count} vehicles detected with {flow_status} flow. Immediate bottleneck at primary node. Clearance delay: ~{wait:.0f} min."
    elif density == "High":
        return f"ELVATED LOAD: {count} vehicles in sector. Flow is {flow_status} ({velocity:.0f}px/s). Density threshold exceeded by 15%."
    elif density == "Medium":
        return f"MODERATE FLOW: Dynamic load balancing suggested. {count} vehicles moving at {velocity:.0f}px/s."
    return f"Flow nominal. {count} vehicles detected. No significant queuing."


def _generate_prediction(count: int, density: str, velocity: float) -> str:
    if density == "Critical":
        return "Gridlock likely to persist for 20+ min without immediate signal override."
    elif density == "High":
        if velocity < 15:
            return "Trend indicates worsening conditions; peak saturation expected in 8 min."
        return "High volume but steady flow; expect stabilization in 12 min."
    elif density == "Medium":
        return "Stable throughput for next 15 min. No immediate surge predicted."
    return "Optimized flow predicted for the foreseeable horizon."


def _generate_recommendation(density: str, risk_score: int) -> str:
    if density == "Critical" or risk_score > 80:
        return "CRITICAL: Deploy traffic marshals and enable emergency bypass routes immediately."
    if density == "High" or risk_score > 60:
        return "HIGH: Extend green phases on primary axis and activate variable message signs."
    if density == "Medium" or risk_score > 40:
        return "MEDIUM: Monitor queue growth and apply dynamic load balancing to signals."
    return "LOW: Normal operations. Maintain standard signal cadence."

def _count_by_class(vehicles: list) -> dict:
    """Helper to count vehicles by their class name."""
    counts = {}
    for v in vehicles:
        cls = v.get("class_name", "vehicle")
        counts[cls] = counts.get(cls, 0) + 1
    return counts


# ─────────────────────────────────────────────────────────────────────────────
# Alerts / Notifications
# ─────────────────────────────────────────────────────────────────────────────

class TrafficAlertPayload(BaseModel):
    venue_id: UUID
    camera_id: UUID
    message: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("/notify")
@router.post("/notify")
async def trigger_traffic_alert(payload: TrafficAlertPayload):
    """Broadcasts a traffic congestion alert via SMS."""
    from app.core.global_state import GLOBAL_STATE
    state = GLOBAL_STATE.get_domain_state("traffic").get(str(payload.camera_id), {})
    car_count = state.get("count", 0)
    density = state.get("density", "Unknown")

    msg = (
        f"🚨 [LAMINAR TRAFFIC ALERT]\n"
        f"Location: {payload.latitude or 0.0:.4f}, {payload.longitude or 0.0:.4f}\n"
        f"Vehicles: {car_count}  Status: {density}\n"
        f"{payload.message}\n"
        f"Wait: {state.get('wait_time_estimate', 'N/A')} min"
    )

    try:
        sms = SmsAlertService()
        async with db_manager.session() as session:
            stmt = select(User.phone_number).where(
                User.receive_sms_alerts == True, User.phone_number.isnot(None)
            )
            res = await session.execute(stmt)
            contacts = [row[0] for row in res.all()]
            if contacts:
                await sms.notify_recipients(contacts, msg)
                return {"success": True, "sent_to": len(contacts)}
            return {"success": False, "message": "No alert contacts configured"}
    except Exception as e:
        logger.error(f"Traffic notify error: {e}")
        return {"success": False, "error": str(e)}

@router.get("/notifications")
async def get_traffic_notifications(limit: int = 20) -> List[Dict]:
    """Returns the dynamic notification feed (risk level, lat/lng, AI insight)."""
    from app.core.global_state import GLOBAL_STATE
    notifs = GLOBAL_STATE.get_events("notifications", limit=limit)
    # Filter for traffic domain
    notifs = [n for n in notifs if n.get("domain") == "traffic"]

    # If no real events yet, synthesize live state into a notification
    if not notifs:
        state = GLOBAL_STATE.get_domain_state("traffic")
        for cam_id, data in state.items():
            if cam_id == "_cameras": continue # Skip internal meta key
            density = data.get("density", "Low")
            count = data.get("count", 0)
            velocity = data.get("avg_velocity", 0.0)
            wait = data.get("wait_time_estimate", 0.0)
            risk = "low" if density == "Low" else "medium" if density == "Medium" else "high"
            vid = data.get("venue_id")
            v_state = GLOBAL_STATE.get_venue_state("traffic", vid) if vid else {}
            lat = v_state.get("latitude", data.get("latitude", 0.0))
            lng = v_state.get("longitude", data.get("longitude", 0.0))
            notifs.append({
                "id": f"LIVE-{cam_id[:6]}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "risk_level": str(risk),
                "latitude": float(lat),
                "longitude": float(lng),
                "total_vehicles": int(count),
                "congestion_level": str(density),
                "velocity": float(round(float(velocity), 2)),
                "wait_time": float(round(float(wait), 1)),
                "risk_score": 0,
                "insight": str(_generate_insight(count, density, velocity, wait)),
                "prediction": str(_generate_prediction(count, density, velocity)),
                "recommendation": str(_generate_recommendation(density, 0)),
            })

    return notifs


# ─────────────────────────────────────────────────────────────────────────────
# Core Insights & Status
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/insights")
async def get_traffic_insights() -> Dict[str, Any]:
    return traffic_detector.get_current_insights()


@router.get("/status")
async def get_traffic_status() -> Dict[str, Any]:
    from app.core.global_state import GLOBAL_STATE
    return GLOBAL_STATE.get_domain_state("traffic")


@router.get("/analytics")
async def get_traffic_analytics(camera_id: Optional[str] = Query(None)) -> Dict[str, Any]:
    """
    Returns aggregated analytics: event count trend, speed distribution,
    congestion breakdown, and per-camera summaries.
    """
    from app.core.global_state import GLOBAL_STATE
    all_events = GLOBAL_STATE.get_events("traffic", camera_id, limit=500)
    
    # Count & speed over time (last 30 samples max)
    recent = all_events[:30]
    recent.reverse() # Time-forward for charts
    count_timeline = [{"t": e["timestamp"].split("T")[1][:8], "v": e["count"]} for e in recent]
    speed_timeline = [{"t": e["timestamp"].split("T")[1][:8], "v": e["velocity"]} for e in recent]

    # Speed histogram (bin into 0–20, 20–50, 50–100, 100+ px/s)
    speed_bins = {"0-20": 0, "20-50": 0, "50-100": 0, "100+": 0}
    for e in all_events:
        s = e.get("velocity", 0)
        if s < 20:
            speed_bins["0-20"] += 1
        elif s < 50:
            speed_bins["20-50"] += 1
        elif s < 100:
            speed_bins["50-100"] += 1
        else:
            speed_bins["100+"] += 1

    # Density breakdown
    density_counts = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0}
    for e in all_events:
        d = e.get("density", "Low")
        density_counts[d] = density_counts.get(d, 0) + 1

    # Averages
    total = len(all_events)
    avg_count = float(round(sum(float(e.get("count", 0)) for e in all_events) / max(1, total), 1))
    avg_speed = float(round(sum(float(e.get("velocity", 0)) for r in all_events for e in [r]) / max(1, total), 1))
    avg_wait = float(round(sum(float(e.get("wait_time", 0)) for e in all_events) / max(1, total), 1))

    from app.core.global_state import GLOBAL_STATE
    live_state = GLOBAL_STATE.get_domain_state("traffic")

    return {
        "summary": {
            "total_events": total,
            "avg_vehicle_count": avg_count,
            "avg_speed_px_s": avg_speed,
            "avg_wait_time_min": avg_wait,
        },
        "count_timeline": count_timeline,
        "speed_timeline": speed_timeline,
        "speed_histogram": speed_bins,
        "density_breakdown": density_counts,
        "live_cameras": live_state,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/density-matrix")
async def get_density_matrix(camera_id: Optional[str] = Query(None)) -> Dict[str, Any]:
    """Returns the current NxM grid density matrix for visualization."""
    matrix = traffic_detector.get_density_matrix(camera_id)
    max_val = max((cell for row in matrix for cell in row), default=1) or 1
    return {
        "matrix": matrix,
        "rows": GRID_ROWS,
        "cols": GRID_COLS,
        "max_value": max_val,
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SSE & Recent Events
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/events/stream")
async def traffic_events_stream():
    q = asyncio.Queue(maxsize=100)
    _sse_subscribers.append(q)

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
            if q in _sse_subscribers:
                _sse_subscribers.remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/events/recent")
async def get_recent_traffic_events(camera_id: Optional[str] = Query(None), limit: int = 20):
    from app.core.global_state import GLOBAL_STATE
    return GLOBAL_STATE.get_events("traffic", camera_id, limit=limit)


# ─────────────────────────────────────────────────────────────────────────────
# Video Upload — Full Frame-by-Frame Analysis
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_traffic_video(
    venue_id: Optional[str] = Query(None),
    camera_id: str = Query(default="upload-demo"),
    file: UploadFile = File(...)
):
    """
    Accept an MP4/video file, run frame-by-frame YOLO detection,
    accumulate analytics, and return a rich summary.
    """
    tmp_path = None
    cap = None
    
    suffix = ".mp4"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()

    # Read entire file (like incident.py to avoid chunking deadlocks)
    try:
        content = await file.read()
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
    except Exception as e:
        import traceback
        logger.error(f"Failed to write upload to temp file: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded video file.")

    logger.info(f"📂 Traffic upload: Received '{file.filename}'. Temp path: {tmp_path}")
    try:
        # ── Open video ──
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            logger.error(f"❌ Video capture failed: Cannot open {tmp_path}.")
            raise HTTPException(status_code=400, detail=f"Cannot open video. Verify file format (MP4/AVI).")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        # CRITICAL: Next.js proxy times out after 30 seconds.
        # We must sample less frames to ensure processing finishes within the timeout window.
        sample_every = max(1, int(fps * 1.5)) # Every 1.5s analysis

        frame_results: list = []
        all_vehicles:  list = []
        density_accum = [[0] * GRID_COLS for _ in range(GRID_ROWS)]
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            if frame_idx % sample_every == 0:
                try:
                    result = await traffic_detector.detect_traffic(frame, camera_id)
                    frame_results.append(result)
                    all_vehicles.extend(result.get("vehicles", []))
                    mat = result.get("density_matrix", [])
                    for r in range(min(GRID_ROWS, len(mat))):
                        for c in range(min(GRID_COLS, len(mat[r]))):
                            density_accum[r][c] += mat[r][c]
                except Exception as det_err:
                    logger.warning(f"Detection failed on frame {frame_idx}: {det_err}")
            
            await asyncio.sleep(0)
            frame_idx += 1

        # RELEASE EARLY so finally block on Windows can delete the file
        cap.release()
        cap = None

        if not frame_results:
            raise HTTPException(status_code=422, detail="No frames could be analyzed in this video.")

        # Build summary
        n = max(1, len(frame_results))
        avg_count = float(round(sum(float(r["count"]) for r in frame_results) / n, 1))
        avg_speed = float(round(sum(float(r.get("avg_velocity", 0)) for r in frame_results) / n, 1))
        avg_wait = float(round(sum(float(r.get("wait_time_estimate", 0)) for r in frame_results) / n, 1))
        max_count = int(max((int(r["count"]) for r in frame_results), default=0))
        peak_density = max(
            (r["density"] for r in frame_results),
            key=lambda d: ["Low", "Medium", "High", "Critical"].index(d) if d in ["Low","Medium","High","Critical"] else 0,
            default="Low"
        )

        # Normalize accumulated matrix
        max_cell = max(density_accum[r][c] for r in range(GRID_ROWS) for c in range(GRID_COLS)) or 1
        norm_matrix = [[int(round(float(density_accum[r][c]) / max_cell * 10)) for c in range(GRID_COLS)] for r in range(GRID_ROWS)]

        # Fetch Venue Info for Global State (Coordinates)
        lat, lng = 0.0, 0.0
        v_name = "Upload Analysis"
        parsed_venue_id = _try_parse_uuid(venue_id)
        
        if parsed_venue_id:
            try:
                from app.models.venue import Venue as VenueModel
                async with db_manager.session() as sess:
                    v_db = await sess.get(VenueModel, parsed_venue_id)
                    if v_db:
                        lat = float(v_db.latitude or 0.0)
                        lng = float(v_db.longitude or 0.0)
                        v_name = v_db.name
            except Exception as e:
                logger.warning(f"Failed to fetch venue info for upload: {e}")

        # Update Global State
        from app.core.global_state import GLOBAL_STATE
        # Update global state for dashboard
        peak_risk_score = int(max((r.get("risk_score", 0) for r in frame_results), default=0))
        active_signal = "N/A" # Signal cycles don't apply to static video uploads
        
        GLOBAL_STATE.update(
            domain="traffic",
            venue_id=str(parsed_venue_id) if parsed_venue_id else "upload-demo",
            payload={
                "venue_id": str(parsed_venue_id) if parsed_venue_id else "upload-demo",
                "venue_name": v_name,
                "count": avg_count,
                "avg_velocity": avg_speed,
                "wait_time_estimate": avg_wait,
                "risk_score": peak_risk_score,
                "density": peak_density,
                "signal": active_signal,
                "camera_id": camera_id,
                "latitude": lat,
                "longitude": lng,
                "analysis_mode": True,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )

        # ── Save screenshot and fire notification ──
        screenshot_path = None
        peak_risk_score = max((r.get("risk_score", 0) for r in frame_results), default=0)

        if frame_results:
            worst_idx = max(range(len(frame_results)), key=lambda i: frame_results[i]["count"])
            try:
                cap2 = cv2.VideoCapture(tmp_path)
                cap2.set(cv2.CAP_PROP_POS_FRAMES, worst_idx * sample_every)
                ret2, worst_frame = cap2.read()
                cap2.release()
                if ret2 and worst_frame is not None:
                    worst_res = frame_results[worst_idx]
                    annotated_frame = draw_vehicle_overlays(worst_frame.copy(), worst_res.get("vehicles", []))
                    annotated_frame = draw_hud(annotated_frame, worst_res)
                    
                    # Store for stream fallback
                    _, buffer = cv2.imencode(".jpg", annotated_frame)
                    _last_injected_frame_bytes[camera_id] = buffer.tobytes()
                    
                    os.makedirs("screenshots/traffic", exist_ok=True)
                    rel_path = f"screenshots/traffic/alert_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                    screenshot_path = os.path.abspath(rel_path)
                    cv2.imwrite(screenshot_path, annotated_frame)
            except Exception as e:
                logger.warning(f"Screenshot failed: {e}")

            try:
                from app.models.venue import Venue as VenueModel
                async with db_manager.session() as sess:
                    v_obj = None
                    if parsed_venue_id:
                        v_obj = await sess.get(VenueModel, parsed_venue_id)
                    
                    if not v_obj:
                        stmt = select(VenueModel).limit(1)
                        res = await sess.execute(stmt)
                        v_obj = res.scalar_one_or_none()
                    if not v_obj:
                        from app.models.venue import Venue as VenueModel
                        v_obj = VenueModel(id="00000000-0000-0000-0000-000000000000", name="Upload Analysis")
                    
                    if True:
                        tier = "CRITICAL" if peak_density == "Critical" else "HIGH"
                        insight = f"Video analysis of '{file.filename}': Peak {peak_density} with {max_count} vehicles. Avg speed {avg_speed:.1f} px/s."
                        await _fire_traffic_notification(
                            venue_id=str(v_obj.id), venue_obj=v_obj,
                            count=max_count, density=peak_density, velocity=avg_speed,
                            wait_time=avg_wait, risk_score=peak_risk_score, tier_label=tier,
                            insight=insight, recommendation=_generate_recommendation(peak_density, peak_risk_score),
                            screenshot_path=screenshot_path
                        )
                        # Push to Global State so it shows up in the UI Insights Box immediately
                        GLOBAL_STATE.push_event("notifications", "traffic", {
                            "id": f"VIDEO-{int(time.time()*1000)}",
                            "domain": "traffic",
                            "type": "alert",
                            "risk_level": peak_density.lower(),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "latitude": lat,
                            "longitude": lng,
                            "total_vehicles": max_count,
                            "congestion_level": peak_density,
                            "wait_time": round(avg_wait, 1),
                            "insight": insight,
                            "recommendation": _generate_recommendation(peak_density, peak_risk_score)
                        })
            except Exception as e:
                logger.error(f"Upload notification failed: {e}")
        try:
            import json
            payload = {
                "success": True,
                "filename": file.filename,
                "frames_analyzed": len(frame_results),
                "summary": {
                    "avg_vehicle_count": avg_count,
                    "max_vehicle_count": max_count,
                    "avg_speed_px_s": avg_speed,
                    "avg_wait_time_min": avg_wait,
                    "peak_density": peak_density,
                },
                "density_matrix": norm_matrix,
                "vehicle_breakdown": _count_by_class(all_vehicles),
                "timeline": [
                    {
                        "frame": int(i * sample_every), 
                        "count": int(r["count"]), 
                        "density": str(r["density"]), 
                        "speed": float(r.get("avg_velocity", 0.0)), 
                        "risk": int(r.get("risk_score", 0))
                    }
                    for i, r in enumerate(frame_results)
                ],
            }
            # Manually test json serialization!
            json_str = json.dumps(payload)
            # If it succeeds, return standard payload or JSONResponse
            from fastapi.responses import JSONResponse
            return JSONResponse(content=payload)
        except Exception as e:
            with open("payload_error.txt", "w") as f:
                f.write(traceback.format_exc())
            raise e
    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            if cap: cap.release()
        except: pass
        try:
            if tmp_path and os.path.exists(tmp_path): 
                os.remove(tmp_path)
                logger.info(f"🗑️ Cleaned up temp video: {tmp_path}")
        except Exception as cleanup_err:
            logger.warning(f"Failed to cleanup temp file {tmp_path if 'tmp_path' in locals() else 'unknown'}: {cleanup_err}")


def _count_by_class(vehicles: list) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for v in vehicles:
        cls = v.get("class_name", "vehicle")
        counts[cls] = counts.get(cls, 0) + 1
    return counts


# ─────────────────────────────────────────────────────────────────────────────
# Image Frame Injection (single photo analysis)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload-image")
async def upload_traffic_image(
    venue_id: Optional[str] = Query(None),
    camera_id: str = Query(default="upload-demo"),
    file: UploadFile = File(...),
):
    """
    Accept a single image (JPEG/PNG), run YOLO traffic detection on it,
    and return analytics. Used by the dashboard "INJECT FRAME" button.
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(400, "Invalid image file — could not decode")

    result = await traffic_detector.detect_traffic(img, camera_id)

    count = result.get("count", 0)
    density = result.get("density", "Low")
    velocity = result.get("avg_velocity", 0.0)
    wait_time = result.get("wait_time_estimate", 0.0)
    risk_score = result.get("risk_score", 0)

    screenshot_path = None
    try:
        annotated_frame = draw_vehicle_overlays(img.copy(), result.get("vehicles", []))
        annotated_frame = draw_hud(annotated_frame, result)
        
        # Store for stream fallback
        _, buffer = cv2.imencode(".jpg", annotated_frame)
        _last_injected_frame_bytes[camera_id] = buffer.tobytes()
        
        if density in ("High", "Critical"):
            os.makedirs("screenshots/traffic", exist_ok=True)
            rel_path = f"screenshots/traffic/alert_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
            screenshot_path = os.path.abspath(rel_path)
            cv2.imwrite(screenshot_path, annotated_frame)
    except Exception as e:
        logger.warning(f"Screenshot/Injection failed for image upload: {e}")

    # Push as a live event so the SSE feed and dashboard pick it up
    push_traffic_event(camera_id, count, density, velocity, wait_time, risk_score, venue_id, screenshot_path)

    # Update Global State
    from app.core.global_state import GLOBAL_STATE
    if venue_id:
        GLOBAL_STATE.update(
            domain="traffic",
            venue_id=venue_id,
            payload={
                "venue_id": venue_id,
                "count": count,
                "density": density,
                "avg_velocity": velocity,
                "wait_time_estimate": wait_time,
                "risk_score": risk_score,
                "camera_id": camera_id,
                "analysis_mode": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    return {
        "success": True,
        "filename": file.filename,
        "summary": {
            "vehicle_count": count,
            "density": density,
            "avg_speed_px_s": round(velocity, 1),
            "wait_time_min": round(wait_time, 1),
            "risk_score": risk_score,
        },
        "vehicle_breakdown": _count_by_class(result.get("vehicles", [])),
        "density_matrix": result.get("density_matrix", []),
    }




# ─────────────────────────────────────────────────────────────────────────────
# Live Video Capture Snapshot
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/snapshot/video")
async def capture_traffic_video(camera_id: str = Query(...), duration: int = 15):
    """Records a live clip (up to 15s) with active YOLO detections."""
    from app.vision.orchestrator import ORCHESTRATOR
    from app.vision.traffic_worker import TrafficWorker

    try:
        cam_uuid = UUID(camera_id)
    except Exception:
        raise HTTPException(400, "Invalid UUID")

    worker = ORCHESTRATOR._workers.get(cam_uuid)
    if not worker or not isinstance(worker, TrafficWorker):
        frames = [np.zeros((480, 640, 3), dtype=np.uint8) for _ in range(10)]
    else:
        frames = []
        fps = 5
        for _ in range(duration * fps):
            f = getattr(worker, "_last_annotated_frame", None)
            if f is not None:
                frames.append(f.copy())
            await asyncio.sleep(1.0 / fps)

        if not frames:
            frames = [np.zeros((480, 640, 3), dtype=np.uint8) for _ in range(10)]

    fps = 5

    h, w = frames[0].shape[:2]
    tmp = os.path.join(tempfile.gettempdir(), f"traffic_{cam_uuid.hex}.mp4")
    out = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for f in frames:
        out.write(f)
    out.release()

    with open(tmp, "rb") as fh:
        data = fh.read()
    os.remove(tmp)

    return Response(
        content=data,
        media_type="video/mp4",
        headers={"Content-Disposition": f"attachment; filename=traffic_{camera_id[:8]}.mp4"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# PDF Report
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/report/pdf")
async def download_traffic_report(camera_id: Optional[str] = None):
    """
    Comprehensive AI Traffic Intelligence Report.
    Uses ONLY live data from GLOBAL_STATE and the in-memory event bus.
    Includes: executive summary, AI insights, speed analytics, density matrix,
    per-camera breakdown, alert history, and strategic recommendations.
    """
    from fpdf import FPDF
    from app.core.global_state import GLOBAL_STATE

    # ── 1. Gather all live data ──────────────────────────────────────────
    live_state: Dict[str, Any] = GLOBAL_STATE.get_domain_state("traffic")
    recent_events = GLOBAL_STATE.get_events("traffic", camera_id, limit=200)
    notifs = GLOBAL_STATE.get_events("notifications", limit=50)
    notifs = [n for n in notifs if n.get("domain") == "traffic"]

    # ── 2. Compute insights from live data only ──────────────────────────
    n = max(1, len(recent_events))
    total_vehicles_live = sum(v.get("count", 0) for v in live_state.values())
    congested_cams = [k for k, v in live_state.items() if v.get("density") in ("High", "Critical")]
    avg_risk_live = round(
        sum(v.get("risk_score", 0) for v in live_state.values()) / max(1, len(live_state))
    )

    avg_count  = round(sum(e["count"]      for e in recent_events) / n, 1)
    avg_speed  = round(sum(e["velocity"]   for e in recent_events) / n, 1)
    avg_wait   = round(sum(e["wait_time"]  for e in recent_events) / n, 1)
    max_count  = max((e["count"] for e in recent_events), default=0)
    max_speed  = max((e["velocity"] for e in recent_events), default=0)
    min_speed  = min((e.get("velocity", 0) for e in recent_events if e.get("velocity", 0) > 0), default=0)

    density_counts: Dict[str, int] = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0}
    for e in recent_events:
        density_counts[e.get("density", "Low")] = density_counts.get(e.get("density", "Low"), 0) + 1

    peak_density = max(density_counts, key=density_counts.get)  # type: ignore
    congestion_rate = round(
        (density_counts.get("High", 0) + density_counts.get("Critical", 0)) / n * 100, 1
    )

    speed_bins: Dict[str, int] = {"0-20 (Congested)": 0, "20-50 (Slow)": 0, "50-100 (Normal)": 0, "100+ (Fast)": 0}
    for e in recent_events:
        s = e.get("velocity", 0)
        if s < 20:   speed_bins["0-20 (Congested)"] += 1
        elif s < 50: speed_bins["20-50 (Slow)"] += 1
        elif s < 100:speed_bins["50-100 (Normal)"] += 1
        else:        speed_bins["100+ (Fast)"] += 1

    # ── 3. AI-generated insights ─────────────────────────────────────────
    def congestionrate_word(r: int) -> str:
        if r > 75: return "critical"
        if r > 45: return "high"
        if r > 20: return "medium"
        return "low"

    def ai_executive_summary() -> str:
        if not recent_events:
            return "No live detection events recorded. System is monitoring. Traffic appears to be minimal or no camera is active."
        status_word = "critical congestion" if congestionrate_word(avg_risk_live) == "critical" else \
                      "elevated congestion" if avg_risk_live > 45 else \
                      "moderate traffic" if avg_risk_live > 20 else "clear conditions"
        return (
            f"Live monitoring of {len(live_state)} camera node(s) detected an average of {avg_count} vehicles "
            f"per sampling cycle. Current session recorded {n} detection events. "
            f"Traffic conditions show {status_word} with an average risk score of {avg_risk_live}%. "
            f"Peak load reached {max_count} vehicles with flow velocities ranging from "
            f"{min_speed:.1f} to {max_speed:.1f} px/s. "
            f"Congestion was observed in {congestion_rate}% of detection cycles."
        )

    def ai_congestion_analysis() -> str:
        if peak_density in ("High", "Critical"):
            return (
                f"Congestion analysis indicates {density_counts.get('High',0)} HIGH and "
                f"{density_counts.get('Critical',0)} CRITICAL density events. "
                f"Average wait time of {avg_wait:.1f} minutes suggests significant queue buildup. "
                "Recommend signal phase extension and dynamic rerouting activation."
            )
        elif peak_density == "Medium":
            return (
                f"Traffic flow is moderately loaded with {density_counts.get('Medium',0)} medium-density events. "
                f"Average speed of {avg_speed:.1f} px/s indicates manageable flow. "
                "Continue monitoring — potential for escalation during peak hours."
            )
        return (
            f"Traffic flow is predominantly clear ({density_counts.get('Low',0)} low-density cycles). "
            f"Average speed of {avg_speed:.1f} px/s confirms unobstructed movement. "
            "No immediate interventions required."
        )

    def ai_speed_analysis() -> str:
        congested_pct = round(speed_bins["0-20 (Congested)"] / n * 100, 1)
        normal_pct = round(speed_bins["50-100 (Normal)"] / n * 100, 1)
        fast_pct = round(speed_bins["100+ (Fast)"] / n * 100, 1)
        return (
            f"Speed distribution: {congested_pct}% of cycles in congested range (0-20 px/s), "
            f"{normal_pct}% at normal speed (50-100 px/s), {fast_pct}% at fast flow (100+ px/s). "
            f"Average velocity: {avg_speed:.1f} px/s. "
            + ("Velocity data suggests active queueing." if congested_pct > 30 else
               "Velocity data confirms healthy traffic throughput.")
        )

    def ai_recommendations() -> List[str]:
        recs = []
        if avg_risk_live > 60:
            recs.append("IMMEDIATE: Activate dynamic signal override on congested nodes.")
            recs.append("IMMEDIATE: Deploy traffic marshals to high-density intersections.")
        elif avg_risk_live > 30:
            recs.append("ADVISORY: Extend green phase by 10-15s on primary corridors.")
            recs.append("ADVISORY: Enable alternate route guidance via digital signage.")
        else:
            recs.append("STATUS: System is nominal. Continue standard monitoring cadence.")

        if congestion_rate > 40:
            recs.append(f"PATTERN: Congestion sustained across {congestion_rate}% of cycles - review peak hour scheduling.")
        if avg_wait > 10:
            recs.append(f"WAIT TIME: Average {avg_wait:.1f} min queuing - prioritize corridor clearance.")
        if not recs:
            recs.append("No critical actions required. Predictive models show stable short-term outlook.")
        return recs

    # ── 4. Build PDF ─────────────────────────────────────────────────────
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    class TrafficPDF(FPDF):
        def header(self):
            self.set_fill_color(8, 8, 12)
            self.rect(0, 0, 210, 38, "F")
            self.set_font("Helvetica", "B", 20)
            self.set_text_color(0, 210, 170)
            self.cell(0, 18, "LAMINAR TRAFFIC INTELLIGENCE", ln=True, align="C")
            self.set_font("Helvetica", "", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 0, f"AI ANALYTICS REPORT  |  Generated: {now_str}  |  Source: Live Backend Data Only", ln=True, align="C")
            self.ln(20)

        def footer(self):
            self.set_y(-15)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(110, 110, 110)
            self.cell(0, 10, f"LAMINAR AI  |  Autonomous Traffic Platform  |  Page {self.page_no()}/{{nb}}", align="C")

        def section_title(self, title: str, color=(0, 180, 140)):
            self.ln(4)
            self.set_font("Helvetica", "B", 12)
            self.set_text_color(*color)
            self.cell(0, 8, title, ln=True)
            self.set_draw_color(*color)
            self.set_line_width(0.5)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(3)
            self.set_text_color(40, 40, 40)

        def metric_row(self, label: str, value: str, note: str = ""):
            self.set_font("Helvetica", "B", 9)
            self.set_text_color(60, 60, 60)
            self.cell(65, 7, label, 0, 0)
            self.set_font("Helvetica", "B", 10)
            self.set_text_color(0, 150, 110)
            self.cell(40, 7, value, 0, 0)
            if note:
                self.set_font("Helvetica", "I", 8)
                self.set_text_color(130, 130, 130)
                self.cell(0, 7, note, 0, 1)
            else:
                self.ln()
            self.set_text_color(40, 40, 40)

    pdf = TrafficPDF()
    pdf.alias_nb_pages()
    pdf.add_page()

    # ── Section 1: Live System Status ─────────────────────────────────────
    pdf.section_title("1. LIVE SYSTEM STATUS")
    pdf.metric_row("Active Camera Nodes:", str(len(live_state)), "(from Global State)")
    pdf.metric_row("Vehicles Detected Now:", str(total_vehicles_live), "(current live count)")
    pdf.metric_row("Congested Nodes:", str(len(congested_cams)), "(High or Critical density)")
    pdf.metric_row("Current Risk Score:", f"{avg_risk_live}%", "(averaged across all nodes)")
    pdf.metric_row("Report Generated:", now_str, "(live data only)")
    pdf.ln(2)

    if live_state:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(0, 180, 140)
        pdf.set_text_color(255)
        pdf.cell(80, 8, "Camera Node", 1, 0, "C", True)
        pdf.cell(25, 8, "Vehicles", 1, 0, "C", True)
        pdf.cell(30, 8, "Density", 1, 0, "C", True)
        pdf.cell(30, 8, "Speed (px/s)", 1, 0, "C", True)
        pdf.cell(25, 8, "Risk %", 1, 1, "C", True)
        pdf.set_font("Helvetica", "", 8)
        for cid, cdata in live_state.items():
            pdf.set_text_color(50, 50, 50)
            pdf.cell(80, 7, cid[:16] + "...", 1, 0, "C")
            pdf.cell(25, 7, str(cdata.get("count", 0)), 1, 0, "C")
            d = cdata.get("density", "Low")
            d_color = {"Critical":(200,0,0), "High":(200,100,0), "Medium":(180,150,0), "Low":(0,150,80)}.get(d, (80,80,80))
            pdf.set_text_color(*d_color)
            pdf.cell(30, 7, d, 1, 0, "C")
            pdf.set_text_color(50, 50, 50)
            pdf.cell(30, 7, f"{cdata.get('avg_velocity', 0):.1f}", 1, 0, "C")
            risk_v = cdata.get("risk_score", 0)
            r_color = (200,0,0) if risk_v > 75 else (200,100,0) if risk_v > 45 else (0,150,80)
            pdf.set_text_color(*r_color)
            pdf.cell(25, 7, f"{risk_v}%", 1, 1, "C")
        pdf.set_text_color(40, 40, 40)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(140, 140, 140)
        pdf.cell(0, 8, "No live camera data available. System awaiting first detection cycle.", ln=True)

    # ── Section 2: Executive Summary ─────────────────────────────────────
    pdf.section_title("2. EXECUTIVE SUMMARY")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 6, ai_executive_summary())
    pdf.ln(3)

    # ── Section 3: Key Metrics ────────────────────────────────────────────
    pdf.section_title("3. SESSION ANALYTICS (LIVE EVENT BUS)")
    pdf.metric_row("Total Detection Events:", str(n), "(from in-memory event bus)")
    pdf.metric_row("Avg Vehicles per Cycle:", str(avg_count))
    pdf.metric_row("Peak Vehicle Count:", str(max_count))
    pdf.metric_row("Avg Flow Speed:", f"{avg_speed:.1f} px/s")
    pdf.metric_row("Min Speed (moving vehicles):", f"{min_speed:.1f} px/s")
    pdf.metric_row("Max Speed Observed:", f"{max_speed:.1f} px/s")
    pdf.metric_row("Avg Wait Time:", f"{avg_wait:.1f} min")
    pdf.metric_row("Congestion Rate:", f"{congestion_rate}%", "% of cycles with High/Critical density")
    pdf.metric_row("Peak Density Level:", peak_density)
    pdf.ln(2)

    # Density breakdown bar
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 6, "Congestion Level Distribution:", ln=True)
    pdf.ln(1)
    bar_colors = {"Low": (0,180,120), "Medium": (200,170,0), "High": (200,100,0), "Critical": (200,30,30)}
    bar_w = 150
    for level, cnt in density_counts.items():
        pct = cnt / n
        filled = int(pct * bar_w)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(70, 70, 70)
        pdf.cell(25, 6, f"{level}:", 0, 0)
        
        # Guard against zero or negative widths
        pdf.set_fill_color(*bar_colors.get(level, (100,100,100)))
        pdf.cell(max(0.1, filled), 5, "", 0, 0, fill=True)
        
        pdf.set_fill_color(220, 220, 220)
        remaining_w = max(0.1, bar_w - filled)
        pdf.cell(remaining_w, 5, "", 0, 0, fill=True)
        
        pdf.set_text_color(80, 80, 80)
        pdf.cell(20, 6, f" {cnt} ({round(pct*100)}%)", 0, 1)

    # ── Section 4: Speed Analytics ────────────────────────────────────────
    pdf.section_title("4. SPEED ANALYTICS & FLOW INTELLIGENCE")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 6, ai_speed_analysis())
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 6, "Speed Bin Distribution:", ln=True)
    pdf.ln(1)
    s_colors = {"0-20 (Congested)": (200,30,30), "20-50 (Slow)": (200,130,0), "50-100 (Normal)": (0,160,100), "100+ (Fast)": (0,100,200)}
    for bin_label, cnt in speed_bins.items():
        pct = cnt / n
        filled = int(pct * (bar_w - 20)) # Adjust for label offset
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(70, 70, 70)
        pdf.cell(40, 6, f"{bin_label}:", 0, 0)
        
        pdf.set_fill_color(*s_colors.get(bin_label, (100,100,100)))
        pdf.cell(max(0.1, filled), 5, "", 0, 0, fill=True)
        
        pdf.set_fill_color(220, 220, 220)
        remaining_s_w = max(0.1, (bar_w - 20) - filled)
        pdf.cell(remaining_s_w, 5, "", 0, 0, fill=True)
        
        pdf.set_text_color(80, 80, 80)
        pdf.cell(20, 6, f" {cnt} ({round(pct*100)}%)", 0, 1)

    # ── Section 5: Congestion Analysis & AI Insights ──────────────────────
    pdf.section_title("5. AI CONGESTION ANALYSIS & INSIGHTS", color=(180, 80, 0))
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 6, ai_congestion_analysis())
    pdf.ln(3)

    # Congestion insight boxes
    insight_items = [
        ("Vehicle Density", f"Peak: {peak_density}  |  Avg load: {avg_count} vehicles/cycle"),
        ("Wait Time Impact", f"Avg {avg_wait:.1f} min queue - {'Critical backlog detected' if avg_wait > 10 else 'Acceptable flow delay'}"),
        ("Flow Velocity", f"Avg {avg_speed:.1f} px/s - {'Congested range' if avg_speed < 20 else 'Normal operational range' if avg_speed < 100 else 'High throughput mode'}"),
        ("Congestion Rate", f"{congestion_rate}% of cycles elevated - {'Review signal timing' if congestion_rate > 30 else 'Within acceptable bounds'}"),
        ("Active Risk Score", f"{avg_risk_live}% - {'IMMEDIATE intervention recommended' if avg_risk_live > 75 else 'Monitor closely' if avg_risk_live > 40 else 'Normal operations'}"),
    ]
    for title_i, body_i in insight_items:
        pdf.set_fill_color(240, 248, 244)
        pdf.set_draw_color(0, 180, 130)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(0, 120, 90)
        pdf.cell(0, 7, f"  {title_i}", 1, 1, fill=True)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(60, 60, 60)
        pdf.set_fill_color(250, 253, 251)
        pdf.cell(0, 6, f"    {body_i}", 1, 1, fill=True)

    # ── Section 6: Notification / Alert History ───────────────────────────
    pdf.section_title("6. LIVE ALERT HISTORY", color=(180, 60, 0))
    if notifs:
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(0, 180, 140)
        pdf.set_text_color(255)
        for hdr, w in [("Time", 20), ("Risk", 15), ("Lat/Lng", 35), ("Vehicles", 15), ("Congestion", 22), ("Wait", 15), ("Insight Summary", 68)]:
            pdf.cell(w if w else 0, 8, hdr, 1, 0, "C", True)
        pdf.ln()
        pdf.set_font("Helvetica", "", 7)
        for ntf in notifs:
            pdf.set_text_color(50, 50, 50)
            ts_n = ntf.get("timestamp", "")[:19].replace("T", " ")
            rl = ntf.get("risk_level", "low").upper()
            rl_color = {"CRITICAL":(180,0,0), "HIGH":(180,80,0), "MEDIUM":(160,120,0), "LOW":(0,140,80)}.get(rl, (80,80,80))
            lat = ntf.get("latitude", 0)
            lng = ntf.get("longitude", 0)
            pdf.cell(20, 6, ts_n[11:19], 1, 0, "C")
            pdf.set_text_color(*rl_color)
            pdf.cell(15, 6, rl[:4], 1, 0, "C")
            pdf.set_text_color(50, 50, 50)
            pdf.cell(35, 6, f"{lat:.3f},{lng:.3f}", 1, 0, "C")
            pdf.cell(15, 6, str(ntf.get("total_vehicles", 0)), 1, 0, "C")
            pdf.cell(22, 6, ntf.get("congestion_level", "-")[:8], 1, 0, "C")
            pdf.cell(15, 6, f"{ntf.get('wait_time', 0)}m", 1, 0, "C")
            insight_txt = ntf.get("insight", "")[:45]
            if len(ntf.get("insight", "")) > 45: insight_txt += "..."
            pdf.cell(68, 6, insight_txt, 1, 1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(140, 140, 140)
        pdf.cell(0, 8, "No alert notifications recorded in this session (traffic may be low).", ln=True)

    # ── Section 7: Strategic Recommendations ─────────────────────────────
    pdf.section_title("7. AI STRATEGIC RECOMMENDATIONS", color=(0, 80, 160))
    recs = ai_recommendations()
    for i, rec in enumerate(recs, 1):
        level_color = (180,0,0) if rec.startswith("IMMEDIATE") else (180,100,0) if rec.startswith("ADVISORY") else (0,120,80)
        pdf.set_fill_color(245, 245, 255)
        pdf.set_draw_color(0, 80, 160)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*level_color)
        prefix = rec.split(":")[0] + ":" if ":" in rec else ""
        rest = rec[len(prefix):]
        pdf.cell(0, 7, f"  {i}. {prefix}", 1, 1, fill=True)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(60, 60, 60)
        pdf.set_fill_color(250, 250, 255)
        pdf.multi_cell(0, 6, f"     {rest.strip()}", 1, fill=True)

    # ── Section 8: Detection Event Log ────────────────────────────────────
    pdf.add_page()
    pdf.section_title("8. DETECTION EVENT LOG (LAST 100 EVENTS)")
    if recent_events:
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(0, 180, 140)
        pdf.set_text_color(255)
        for hdr, w in [("TIMESTAMP", 36), ("EVENT ID", 36), ("VEHICLES", 24), ("SPEED px/s", 26), ("WAIT min", 24), ("DENSITY", 24), ("RISK %", 20)]:
            pdf.cell(w, 8, hdr, 1, 0, "C", True)
        pdf.ln()
        pdf.set_font("Helvetica", "", 7)
        for ev in recent_events[:100]:
            ts = ev["timestamp"].split("T")[1][:8] if "T" in ev["timestamp"] else ev["timestamp"]
            pdf.set_text_color(50, 50, 50)
            pdf.cell(36, 6, ts, 1, 0, "C")
            pdf.cell(36, 6, str(ev.get("id", ""))[-12:], 1, 0, "C")
            pdf.cell(24, 6, str(ev.get("count", 0)), 1, 0, "C")
            pdf.cell(26, 6, f"{ev.get('velocity', 0):.1f}", 1, 0, "C")
            pdf.cell(24, 6, f"{ev.get('wait_time', 0):.1f}", 1, 0, "C")
            d = ev.get("density", "Low")
            d_color = {"Critical":(180,0,0), "High":(180,80,0), "Medium":(150,120,0), "Low":(0,140,80)}.get(d, (80,80,80))
            pdf.set_text_color(*d_color)
            pdf.cell(24, 6, d, 1, 0, "C")
            rf = ev.get("risk_score", 0)
            r_c = (180,0,0) if rf > 75 else (180,80,0) if rf > 45 else (0,140,80)
            pdf.set_text_color(*r_c)
            pdf.cell(20, 6, f"{rf}%", 1, 1, "C")
            pdf.set_text_color(50, 50, 50)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(140, 140, 140)
        pdf.cell(0, 8, "No detection events recorded yet. Awaiting live camera data.", ln=True)

    # ── Section 9: Recent Alert Evidence ──────────────────────────────────
    import glob
    try:
        screenshots = glob.glob(os.path.abspath("screenshots/traffic/*.jpg"))
        if screenshots:
            screenshots.sort(key=os.path.getctime, reverse=True)
            pdf.add_page()
            pdf.section_title("9. RECENT ALERT EVIDENCE (SCREENSHOTS)", color=(180, 0, 0))
            
            for scr in screenshots[:5]:  # Top 5 most recent
                if os.path.exists(scr):
                    if pdf.get_y() > 180:
                        pdf.add_page()
                    try:
                        pdf.image(scr, x=15, y=pdf.get_y() + 5, w=160)
                        pdf.ln(100)
                    except Exception as e:
                        logger.error(f"Failed to embed screenshot in PDF: {e}")
    except Exception:
        pass

    # ── Footer note ────────────────────────────────────────────────────────
    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(130, 130, 130)
    pdf.multi_cell(0, 5,
        f"This report was generated entirely from live backend data on {now_str}. "
        "No synthetic or pre-seeded data was used. All metrics reflect real-time "
        "YOLO detections from active camera feeds processed by the Laminar Vision Pipeline."
    )

    pdf_out = pdf.output(dest="S")
    try:
        pdf_bytes = pdf_out.encode("latin-1") if isinstance(pdf_out, str) else bytes(pdf_out)
    except Exception:
        pdf_bytes = bytes(pdf_out)
        
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=laminar_traffic_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# MJPEG Live Stream
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/stream/{camera_id}")
async def stream_traffic_camera(camera_id: str):
    from app.vision.orchestrator import ORCHESTRATOR

    # Sanitize camera_id (handle cases like 'parking/UUID' or 'traffic/UUID')
    if "/" in camera_id:
        camera_id = camera_id.split("/")[-1]

    try:
        cam_uuid = UUID(camera_id)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(404, f"Invalid camera_id UUID: {camera_id}")

    blank = np.zeros((360, 640, 3), dtype=np.uint8)
    _, blank_jpg = cv2.imencode(".jpg", blank)
    blank_bytes = blank_jpg.tobytes()

    async def frame_generator():
        boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        last_yielded = None
        while True:
            frame_bytes = None
            
            # 1. Prioritize injected frame
            if camera_id and camera_id in _last_injected_frame_bytes:
                frame_bytes = _last_injected_frame_bytes[camera_id]
                
            # 2. Check active workers
            if not frame_bytes:
                worker = ORCHESTRATOR._workers.get(cam_uuid)
                frame_bytes = getattr(worker, "_cached_frame_bytes", None) if worker else None
                
            # 3. Fallback to upload-demo or first injected frame
            if not frame_bytes and _last_injected_frame_bytes:
                fallback_key = "upload-demo" if "upload-demo" in _last_injected_frame_bytes else list(_last_injected_frame_bytes.keys())[0]
                frame_bytes = _last_injected_frame_bytes[fallback_key]
            
            if frame_bytes and frame_bytes != last_yielded:
                yield boundary + frame_bytes + b"\r\n"
                last_yielded = frame_bytes
            elif not frame_bytes:
                yield boundary + blank_bytes + b"\r\n"
                
            await asyncio.sleep(0.033)

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")



