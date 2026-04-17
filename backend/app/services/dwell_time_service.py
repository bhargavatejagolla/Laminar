"""
Laminar - Dwell Time (Person Waiting Time) Service
-----------------------------------------------------

Implements:
1. Lightweight IoU-based centroid tracker (no extra pip install, CPU only)
2. Per-camera dwell time tracking with zone containment
3. In-memory state, periodically flushed to PostgreSQL
4. Long-wait alert triggering via alert engine
"""

import asyncio
import math
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any
from uuid import UUID


# ==============================================================
# Point-in-Polygon (Ray Casting Algorithm)
# ==============================================================

def _point_in_polygon(px: float, py: float, polygon: List[List[float]]) -> bool:
    """
    Ray-casting algorithm to determine if point (px, py) is inside polygon.
    polygon: list of [x, y] pairs.
    """
    if not polygon or len(polygon) < 3:
        return False
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


# ==============================================================
# IoU Centroid Tracker
# ==============================================================

def _iou(boxA: List[float], boxB: List[float]) -> float:
    """Compute Intersection over Union of two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter = max(0, xB - xA) * max(0, yB - yA)
    if inter == 0:
        return 0.0

    areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    union = areaA + areaB - inter
    return inter / (union + 1e-9)


class _Track:
    """Represents a single tracked person."""
    _next_id = 1

    def __init__(self, box: List[float]):
        self.track_id: int = _Track._next_id
        _Track._next_id += 1
        self.box = box
        self.missed_frames: int = 0
        self.enter_time: datetime = datetime.now(timezone.utc)
        self.last_seen: datetime = datetime.now(timezone.utc)
        self.current_zone: Optional[str] = None
        self.zone_enter_time: Optional[datetime] = None
        self.alert_triggered: bool = False

    @property
    def center(self) -> Tuple[float, float]:
        return ((self.box[0] + self.box[2]) / 2, (self.box[1] + self.box[3]) / 2)

    @property
    def dwell_seconds(self) -> float:
        return (datetime.now(timezone.utc) - self.enter_time).total_seconds()


class DwellTimeService:
    """
    One DwellTimeService instance per camera.

    Call update() every frame with the list of scaled bounding boxes from YOLO.
    """

    # Dead track eviction after this many missed frames
    MAX_MISSED_FRAMES = 8
    # Min IoU to match a new box to an existing track
    IOU_THRESHOLD = 0.25

    def __init__(self, camera_id: UUID):
        self.camera_id = camera_id
        self._tracks: Dict[int, _Track] = {}        # track_id → _Track
        self._evicted: List[Dict] = []              # completed records pending DB flush
        self._zones: List[Dict] = []                # cached zones for this camera

    # ------------------------------------------------------------------
    # Main update — called every frame from stream_worker
    # ------------------------------------------------------------------

    def update(
        self,
        boxes: List[Dict],              # scaled_boxes from stream_worker
        zones: Optional[List[Dict]] = None,  # list of MonitoringZone dicts
    ) -> List[Dict]:
        """
        Update tracker with new detections.

        Args:
            boxes: [{"bbox": [x1,y1,x2,y2], "confidence": 0.9, ...}]
            zones: [{"zone_name": "...", "polygon_coordinates": [[x,y],...], "long_wait_threshold_seconds": 600}]

        Returns:
            list of active track dicts for overlay drawing
        """
        if zones is not None:
            self._zones = zones

        new_boxes = [obj["bbox"] for obj in boxes if obj.get("bbox") and len(obj["bbox"]) == 4]
        now = datetime.now(timezone.utc)

        # Step 1: Match new boxes to existing tracks via IoU
        matched_track_ids = set()
        matched_box_indices = set()

        track_list = list(self._tracks.values())

        for t in track_list:
            best_iou = 0.0
            best_idx = -1
            for i, nb in enumerate(new_boxes):
                if i in matched_box_indices:
                    continue
                score = _iou(t.box, nb)
                if score > best_iou:
                    best_iou = score
                    best_idx = i

            if best_iou >= self.IOU_THRESHOLD and best_idx >= 0:
                # Update existing track
                t.box = new_boxes[best_idx]
                t.missed_frames = 0
                t.last_seen = now
                matched_track_ids.add(t.track_id)
                matched_box_indices.add(best_idx)
            else:
                t.missed_frames += 1

        # Step 2: Create new tracks for unmatched boxes
        for i, nb in enumerate(new_boxes):
            if i not in matched_box_indices:
                new_track = _Track(nb)
                self._tracks[new_track.track_id] = new_track

        # Step 3: Update zone membership and evict dead tracks
        to_evict = []
        for track_id, t in self._tracks.items():
            # Evict if missed too many frames OR if not seen for > 10 seconds (e.g. camera offline)
            time_since_last_seen = (now - t.last_seen).total_seconds()
            if t.missed_frames > self.MAX_MISSED_FRAMES or time_since_last_seen > 10.0:
                to_evict.append(track_id)
                continue

            # Zone containment check
            cx, cy = t.center
            matched_zone = None
            matched_threshold = 600
            for z in self._zones:
                poly = z.get("polygon_coordinates", [])
                if _point_in_polygon(cx, cy, poly):
                    matched_zone = z.get("zone_name")
                    matched_threshold = z.get("long_wait_threshold_seconds", 600)
                    break

            if matched_zone:
                if t.current_zone != matched_zone:
                    t.current_zone = matched_zone
                    t.zone_enter_time = now
                    t.alert_triggered = False
            else:
                t.current_zone = None
                t.zone_enter_time = None

            # Long wait alert check
            if t.current_zone and t.zone_enter_time:
                zone_dwell = (now - t.zone_enter_time).total_seconds()
                if zone_dwell > matched_threshold and not t.alert_triggered:
                    t.alert_triggered = True
                    asyncio.ensure_future(self._fire_long_wait_alert(t, zone_dwell))

        for tid in to_evict:
            t = self._tracks.pop(tid)
            if t.dwell_seconds > 2:   # Only record if stayed > 2s
                self._evicted.append(self._track_to_record(t))

        # Step 4: Return active tracks for overlay
        return [
            {
                "track_id": t.track_id,
                "bbox": t.box,
                "dwell_seconds": t.dwell_seconds,
                "zone": t.current_zone,
            }
            for t in self._tracks.values()
            if t.missed_frames == 0
        ]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _track_to_record(self, t: _Track) -> Dict:
        return {
            "camera_id": self.camera_id,
            "tracker_id": t.track_id,
            "zone_name": t.current_zone or "unknown",
            "enter_time": t.enter_time,
            "last_seen_time": t.last_seen,
            "dwell_seconds": t.dwell_seconds,
            "alert_triggered": t.alert_triggered,
        }

    def get_live_stats(self) -> Dict[str, Any]:
        """Return snapshot of current tracking state for the API."""
        active = [t for t in self._tracks.values() if t.missed_frames == 0]
        if not active:
            return {
                "people_tracked": 0,
                "avg_dwell_seconds": 0.0,
                "max_dwell_seconds": 0.0,
                "tracks": [],
            }

        dwells = [t.dwell_seconds for t in active]
        return {
            "people_tracked": len(active),
            "avg_dwell_seconds": round(sum(dwells) / len(dwells), 1),
            "max_dwell_seconds": round(max(dwells), 1),
            "tracks": [
                {
                    "track_id": t.track_id,
                    "dwell_seconds": round(t.dwell_seconds, 1),
                    "zone": t.current_zone or "—",
                    "bbox": t.box,
                    "enter_time": t.enter_time.isoformat() if t.enter_time else None,
                    "last_seen_time": t.last_seen.isoformat() if t.last_seen else None,
                }
                for t in sorted(active, key=lambda x: x.dwell_seconds, reverse=True)
            ],
        }

    def get_queue_metrics(self) -> Dict[str, Any]:
        """
        Compute advanced queue metrics:
        - throughput_per_minute: people who exited zone in the last 60 seconds
        - queue_health_score: 0-100 (higher = healthier queue)
        - congestion_status: GOOD / SLOW / CRITICAL
        - current_people_waiting: active in-zone tracks
        - avg_zone_wait_seconds: avg dwell for people currently in a zone
        """
        now = datetime.now(timezone.utc)
        active = [t for t in self._tracks.values() if t.missed_frames == 0]
        in_zone = [t for t in active if t.current_zone is not None]

        # Throughput: count evicted records from the last 60 seconds
        cutoff = now.timestamp() - 60
        throughput = sum(
            1 for r in self._evicted
            if isinstance(r.get("last_seen_time"), datetime)
            and r["last_seen_time"].timestamp() >= cutoff
        )

        # Avg zone wait for currently in-zone people
        zone_dwells = []
        for t in in_zone:
            if t.zone_enter_time:
                zone_dwells.append((now - t.zone_enter_time).total_seconds())

        avg_zone_wait = round(sum(zone_dwells) / len(zone_dwells), 1) if zone_dwells else 0.0
        max_zone_wait = round(max(zone_dwells), 1) if zone_dwells else 0.0

        # Queue health score: throughput / (avg_wait_minutes + 1) * 10, capped at 100
        # Higher throughput + lower wait = higher score
        avg_wait_minutes = avg_zone_wait / 60.0
        if avg_wait_minutes > 0 or throughput > 0:
            raw_score = (throughput + 1) / (avg_wait_minutes + 1) * 10
            health_score = min(100, round(raw_score, 1))
        else:
            health_score = 50.0  # neutral when no data

        # Congestion status logic
        if avg_zone_wait == 0 and len(in_zone) == 0:
            congestion_status = "IDLE"
        elif health_score >= 60:
            congestion_status = "GOOD"
        elif health_score >= 30:
            congestion_status = "SLOW"
        else:
            congestion_status = "CRITICAL"

        return {
            "people_tracked": len(active),
            "current_people_waiting": len(in_zone),
            "avg_zone_wait_seconds": avg_zone_wait,
            "max_zone_wait_seconds": max_zone_wait,
            "throughput_per_minute": throughput,
            "queue_health_score": health_score,
            "congestion_status": congestion_status,
        }


    async def flush_evicted_to_db(self, session) -> int:
        """
        Persist evicted track records to person_dwell_times table.
        Returns count of flushed records.
        """
        if not self._evicted:
            return 0

        from app.models.dwell_monitor import PersonDwellTime
        records = self._evicted[:]
        self._evicted.clear()

        count = 0
        try:
            for rec in records:
                obj = PersonDwellTime(
                    camera_id=rec["camera_id"],
                    tracker_id=rec["tracker_id"],
                    zone_name=rec["zone_name"],
                    enter_time=rec["enter_time"],
                    last_seen_time=rec["last_seen_time"],
                    dwell_seconds=rec["dwell_seconds"],
                    alert_triggered=rec["alert_triggered"],
                )
                session.add(obj)
                count += 1
            await session.commit()
        except Exception as e:
            await session.rollback()
            # Put records back for next flush
            self._evicted.extend(records)
            raise e

        return count

    async def _fire_long_wait_alert(self, track: _Track, dwell_seconds: float) -> None:
        """Fire a long-wait alert via the alert engine."""
        try:
            from app.core.database import db_manager
            from app.services.alert_engine_service import AlertEngineService
            import uuid

            async with db_manager.session() as session:
                from app.models.camera import Camera
                from sqlalchemy import select
                cam_res = await session.execute(
                    select(Camera).where(Camera.id == self.camera_id)
                )
                cam = cam_res.scalar_one_or_none()
                if not cam:
                    return

                minutes = int(dwell_seconds // 60)
                seconds = int(dwell_seconds % 60)
                wait_str = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"

                decision = {
                    "venue_id": str(cam.venue_id),
                    "venue_name": cam.location_label or str(cam.venue_id),
                    "camera_id": str(self.camera_id),
                    "camera_location": cam.get_display_location(),
                    "alert_type": "dwell_time",
                    "metric_id": str(uuid.uuid4()),
                    "metric_time": datetime.now(timezone.utc).isoformat(),
                    "previous_level": "medium",
                    "current_level": "high",
                    "transition": "escalated",
                    "trend": "stable",
                    "severity": 65,
                    "should_alert": True,
                    "recommended_action": (
                        f"Person #{track.track_id} has been waiting {wait_str} "
                        f"in zone '{track.current_zone}'. "
                        "Check for queue stall or congestion."
                    ),
                    "risk_score": 65.0,
                    "occupancy_percent": None,
                    "early_warning_triggered": False,
                }
                engine = AlertEngineService()
                await engine.process_decision(session, decision=decision)
        except Exception:
            pass  # Non-critical — alert is best effort


# ==============================================================
# Registry: one DwellTimeService per camera
# ==============================================================

_service_registry: Dict[str, DwellTimeService] = {}


def get_dwell_service(camera_id: UUID) -> DwellTimeService:
    """Get or create the DwellTimeService singleton for a camera."""
    key = str(camera_id)
    if key not in _service_registry:
        _service_registry[key] = DwellTimeService(camera_id)
    return _service_registry[key]
