"""
Laminar - Traffic Worker (v2)
------------------------------

Pipeline for real-time traffic monitoring with startup-grade AI features.
Supports live camera feeds AND injected video frames for uploaded videos.
"""

import asyncio
import cv2
import numpy as np
import time
from typing import Optional, Any, Dict
from uuid import UUID
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.vision.traffic_detector import traffic_detector, VEHICLE_CLASSES
from app.core.global_state import GLOBAL_STATE
from app.core.database import db_manager
from sqlalchemy import update
from app.services.notification_service import notification_service
from app.vision.incident_detector import incident_detector

logger = get_logger(__name__)

# Color map for vehicle classes
CLASS_COLORS: Dict[str, tuple] = {
    "car":        (0, 220, 140),   # teal-green
    "truck":      (255, 140, 0),   # orange
    "bus":        (80, 120, 255),  # blue-violet
    "motorcycle": (255, 60, 120),  # magenta
    "vehicle":    (200, 200, 200), # grey fallback
}


def draw_vehicle_overlays(frame: np.ndarray, vehicles: list) -> np.ndarray:
    """
    Draws bounding boxes, class labels, speed badges, and track IDs on the frame.
    """
    overlay = frame.copy()

    for v in vehicles:
        x1, y1, x2, y2 = [int(p) for p in v["bbox"]]
        cls = v.get("class_name", "vehicle")
        speed = v.get("speed_px_s", 0.0)
        track_id = v.get("id", 0)
        conf = v.get("confidence", 0)
        color = CLASS_COLORS.get(cls, CLASS_COLORS["vehicle"])

        # Translucent fill
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)

        # Border with cyber/AI corners
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 1)
        # Draw corner brackets
        length = max(10, int((x2 - x1) * 0.2))
        t = 3 # thickness
        # Top-left
        cv2.line(frame, (x1, y1), (x1 + length, y1), color, t)
        cv2.line(frame, (x1, y1), (x1, y1 + length), color, t)
        # Top-right
        cv2.line(frame, (x2, y1), (x2 - length, y1), color, t)
        cv2.line(frame, (x2, y1), (x2, y1 + length), color, t)
        # Bottom-left
        cv2.line(frame, (x1, y2), (x1 + length, y2), color, t)
        cv2.line(frame, (x1, y2), (x1, y2 - length), color, t)
        # Bottom-right
        cv2.line(frame, (x2, y2), (x2 - length, y2), color, t)
        cv2.line(frame, (x2, y2), (x2, y2 - length), color, t)

        # Label background
        label = f"#{track_id} {cls.upper()} {speed:.0f}px/s"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.38, 1)
        ly = max(y1 - 6, th + 4)
        cv2.rectangle(frame, (x1, ly - th - 4), (x1 + tw + 4, ly + 2), color, -1)
        cv2.putText(frame, label, (x1 + 2, ly - 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 1, cv2.LINE_AA)

    # Blend overlay
    frame = cv2.addWeighted(overlay, 0.2, frame, 0.8, 0)

    return frame


def draw_hud(frame: np.ndarray, result: dict) -> np.ndarray:
    """Adds analytics HUD overlay to top-left corner."""
    count = result.get("count", 0)
    density = result.get("density", "Low")
    velocity = result.get("avg_velocity", 0.0)
    risk = result.get("risk_score", 0)

    density_color = {
        "Low": (0, 220, 140),
        "Medium": (255, 200, 0),
        "High": (255, 100, 0),
        "Critical": (255, 50, 50),
    }.get(density, (200, 200, 200))

    # HUD panel background
    h, w = frame.shape[:2]
    cv2.rectangle(frame, (8, 8), (300, 90), (10, 12, 18), -1)
    cv2.rectangle(frame, (8, 8), (300, 90), density_color, 1)

    cv2.putText(frame, f"LAMINAR TRAFFIC NODE", (14, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, f"VEHICLES: {count}   DENSITY: {density}", (14, 46),
                cv2.FONT_HERSHEY_SIMPLEX, 0.40, density_color, 1, cv2.LINE_AA)
    cv2.putText(frame, f"AVG SPEED: {velocity:.1f} px/s   RISK: {risk}%", (14, 64),
                cv2.FONT_HERSHEY_SIMPLEX, 0.40, (180, 220, 255), 1, cv2.LINE_AA)
    ts = datetime.now().strftime("%H:%M:%S")
    cv2.putText(frame, f"LIVE  {ts}", (14, 82),
                cv2.FONT_HERSHEY_SIMPLEX, 0.34, (120, 120, 120), 1, cv2.LINE_AA)

    return frame


class TrafficWorker:
    """
    Dedicated worker for a single traffic camera.
    Supports live feeds and injected frames from uploaded videos.
    """

    def __init__(self, camera_id: UUID, venue_id: UUID, source: Any):
        self.camera_id = camera_id
        self.venue_id = venue_id
        self.source = source
        self.detector = traffic_detector
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._cached_frame_bytes: Optional[bytes] = None   # For MJPEG streaming
        self._last_annotated_frame: Optional[np.ndarray] = None
        self._last_result: Optional[dict] = None
        self._accident_counter: int = 0
        self._last_mesh_status: str = "ok" # ok, warning, critical
        self.incident_detector = incident_detector

        # Injected frame support (for uploaded video processing)
        self.injected_frame: Optional[np.ndarray] = None
        self._last_detection_time: float = 0.0

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"TrafficWorker started for camera {self.camera_id}")

    async def stop(self):
        self._running = False
        if hasattr(self, "_detection_task") and self._detection_task:
            self._detection_task.cancel()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if hasattr(self.source, "stop"):
            self.source.stop()
        logger.info(f"TrafficWorker stopped for camera {self.camera_id}")

    async def _run_loop(self):
        """
        High-performance frame reading loop.
        Decouples frame acquisition from expensive AI detection.
        """
        self._last_annotated_frame = None
        self._last_result = None
        self._current_raw_frame = None

        # Start detection loop in background
        self._detection_task = asyncio.create_task(self._detection_loop())

        while self._running:
            try:
                # ── Frame acquisition ──────────────────────────────────────
                if self.injected_frame is not None:
                    frame = self.injected_frame.copy()
                    await asyncio.sleep(0.033)
                else:
                    try:
                        read_result = await asyncio.wait_for(self.source.read(), timeout=1.0)
                        if read_result is None:
                            await asyncio.sleep(0.5)
                            continue
                        ret, frame = read_result
                        if not ret or frame is None:
                            await asyncio.sleep(0.5)
                            continue
                    except asyncio.TimeoutError:
                        await asyncio.sleep(1.0)
                        continue

                # ── Store for background detector ──
                self._current_raw_frame = frame.copy()

                # ── Annotate with LATEST available results ──
                if self._last_result:
                    annotated = frame.copy()
                    annotated = draw_vehicle_overlays(annotated, self._last_result.get("vehicles", []))
                    annotated = draw_hud(annotated, self._last_result)
                    self._last_annotated_frame = annotated

                # ── Always update MJPEG cache ──
                frame_to_encode = self._last_annotated_frame if self._last_annotated_frame is not None else frame
                try:
                    _, jpeg = cv2.imencode(".jpg", frame_to_encode, [cv2.IMWRITE_JPEG_QUALITY, 78])
                    self._cached_frame_bytes = jpeg.tobytes()
                except Exception: pass

                # Periodic health sync (avoid spamming DB)
                if time.time() % 10 < 0.1:
                    try:
                        async with db_manager.session() as session:
                            from app.models.camera import Camera
                            from sqlalchemy import update as sa_update
                            stmt = (
                                sa_update(Camera)
                                .where(Camera.id == self.camera_id)
                                .values(is_online=True, last_frame_at=datetime.now(timezone.utc))
                            )
                            await session.execute(stmt)
                            await session.commit()
                    except Exception: pass

                await asyncio.sleep(0.01)

            except Exception as e:
                logger.error(f"TrafficWorker loop error: {e}")
                await asyncio.sleep(1)

    async def _detection_loop(self):
        """Dedicated background task for AI inference (Traffic + Incidents)."""
        detection_interval = 0.5  # 2 Hz
        while self._running:
            try:
                if hasattr(self, '_current_raw_frame') and self._current_raw_frame is not None:
                    frame = self._current_raw_frame.copy()
                    # 1. Traffic Detection
                    result = await self.detector.detect_traffic(frame.copy(), str(self.camera_id))
                    self._last_result = result

                    # 2. Global State Update with Geo-Data
                    venue_lat = 0.0
                    venue_lng = 0.0
                    venue_name = "Unknown Venue"
                    try:
                        async with db_manager.session() as session:
                            from app.models.venue import Venue as VenueModel
                            v_obj = await session.get(VenueModel, self.venue_id)
                            if v_obj:
                                venue_lat = float(v_obj.latitude or 0.0)
                                venue_lng = float(v_obj.longitude or 0.0)
                                venue_name = v_obj.name
                    except Exception: pass

                    GLOBAL_STATE.update(
                        domain="traffic",
                        venue_id=str(self.venue_id),
                        payload={
                            "venue_id": str(self.venue_id),
                            "venue_name": venue_name,
                            "camera_id": str(self.camera_id),
                            "count": result["count"],
                            "vehicle_count": result["count"],
                            "avg_count": result["count"],
                            "density": result["density"],
                            "congestion_level": result["congestion_level"],
                            "risk_score": result["risk_score"],
                            "avg_velocity": result.get("avg_velocity", 0.0),
                            "latitude": venue_lat,
                            "longitude": venue_lng,
                            "last_updated": result["timestamp"],
                        }
                    )

                    # 3. SSE Event Bus
                    try:
                        from app.api.v1.endpoints.traffic import push_traffic_event
                        push_traffic_event(
                            str(self.camera_id), result["count"], result["density"],
                            result["avg_velocity"], result.get("wait_time_estimate", 0.0),
                            result.get("risk_score", 0), str(self.venue_id)
                        )
                    except Exception: pass

                    # 4. Tactical Mesh Notifications
                    try:
                        async with db_manager.session() as session:
                            from app.models.venue import Venue as VenueModel
                            venue_obj = await session.get(VenueModel, self.venue_id)
                            if venue_obj:
                                # Threshold-based Congestion
                                occ = result["count"]
                                warn_limit = venue_obj.warning_threshold or 50
                                crit_limit = venue_obj.critical_threshold or 80
                                velocity_val = result.get("avg_velocity", 0.0)
                                wait_val     = result.get("wait_time_estimate", 0.0)
                                density_val  = result.get("density", "Low")
                                risk_val     = result.get("risk_score", 0)
                                flow_lbl     = "stalled" if velocity_val < 5 else "slow" if velocity_val < 20 else "moderate" if velocity_val < 60 else "fast"

                                metric_meta = {
                                    "vehicle_count":    int(occ),
                                    "congestion_level": str(density_val),
                                    "flow_speed":       float(round(float(velocity_val), 2)),
                                    "wait_time":        float(round(float(wait_val), 1)),
                                    "risk_score":       int(risk_val),
                                    "insight":          str(f"{occ} vehicles at {velocity_val:.1f} px/s ({flow_lbl}) — {density_val} congestion, wait ~{wait_val:.1f} min."),
                                    "recommendation":   str("Deploy marshals and enable alternate routing." if occ >= crit_limit else "Monitor and extend green phase if needed."),
                                }

                                current_status = "ok"
                                if occ >= crit_limit:
                                    current_status = "critical"
                                elif occ >= warn_limit:
                                    current_status = "warning"

                                if current_status != self._last_mesh_status:
                                    if current_status == "critical":
                                        desc = (
                                            f"{occ} vehicles · {density_val} congestion · "
                                            f"{velocity_val:.1f} px/s ({flow_lbl}) · wait ~{wait_val:.1f} min"
                                        )
                                        asyncio.create_task(notification_service.push_notification(
                                            domain="traffic", type="Critical Gridlock", priority="CRITICAL",
                                            description=desc, venue_id=str(self.venue_id),
                                            venue_name=venue_obj.name, metadata=metric_meta
                                        ))
                                    elif current_status == "warning":
                                        desc = (
                                            f"{occ} vehicles · {density_val} congestion · "
                                            f"{velocity_val:.1f} px/s ({flow_lbl}) · wait ~{wait_val:.1f} min"
                                        )
                                        asyncio.create_task(notification_service.push_notification(
                                            domain="traffic", type="Congestion Spike", priority="HIGH",
                                            description=desc, venue_id=str(self.venue_id),
                                            venue_name=venue_obj.name, metadata=metric_meta
                                        ))
                                    self._last_mesh_status = current_status

                                # Overspeed Detection
                                vehicles = result.get("vehicles", [])
                                speeder = next((v for v in vehicles if v.get("speed_px_s", 0) > 150), None)
                                if speeder:
                                    spd = speeder.get("speed_px_s", 0)
                                    desc = f"Vehicle #{speeder.get('id')} at {spd:.1f} px/s — exceeds speed limit at {venue_obj.name}."
                                    asyncio.create_task(notification_service.push_notification(
                                        domain="traffic", type="Overspeed Violation", priority="MEDIUM",
                                        description=desc, venue_id=str(self.venue_id),
                                        venue_name=venue_obj.name,
                                        metadata={**metric_meta, "overspeed_px_s": float(round(float(spd), 1))}
                                    ))
                    except Exception: pass

                    # 5. Incident Detection
                    loop = asyncio.get_running_loop()
                    incidents = await loop.run_in_executor(None, self.incident_detector.detect_incidents, frame.copy())
                    
                    if incidents:
                        for inc in incidents:
                            if inc["priority"] in ["HIGH", "CRITICAL"]:
                                asyncio.create_task(self._process_incident(inc))

                await asyncio.sleep(detection_interval)
            except Exception as e:
                logger.error(f"Traffic detection loop error: {e}")
                await asyncio.sleep(1)

    async def _process_incident(self, inc):
        """Helper to send incident notifications in the background."""
        try:
            async with db_manager.session() as session:
                from app.models.venue import Venue as VenueModel
                venue_obj = await session.get(VenueModel, self.venue_id)
                if venue_obj:
                    await notification_service.push_notification(
                        domain="incident",
                        type=inc["type"],
                        priority=inc["priority"],
                        description=inc["description"],
                        venue_id=str(self.venue_id),
                        venue_name=venue_obj.name,
                        metadata={"camera_id": str(self.camera_id)}
                    )
        except Exception as e:
            logger.warning(f"Failed to process incident notification: {e}")
