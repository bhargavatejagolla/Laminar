"""
Laminar - Dwell Time (Person Waiting Time) Service
-----------------------------------------------------

Implements:
1. Lightweight IoU-based centroid tracker (no extra pip install, CPU only)
2. Per-camera dwell time tracking with zone containment
3. Session-based identity tracking: each "visit" is a distinct session
4. In-memory state, periodically flushed to PostgreSQL
5. Long-wait alert triggering via alert engine
6. Interval-based evidence snapshots with blur detection
"""

import asyncio
import math
import os
import time
import uuid
import cv2
import numpy as np
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any

logger = logging.getLogger(__name__)


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


def _laplacian_variance(frame: np.ndarray) -> float:
    """Compute Laplacian variance (sharpness score). Below ~50 = blurry."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


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
    """
    Represents a single tracked person.

    Session semantics:
    - global_id: persists across re-entries (set externally by ReID, else == track_id)
    - session_id: unique UUID per visit/session — resets each time the person re-enters
    - session_start_time: start of the CURRENT session (resets on re-entry)
    - enter_time: very first time this track was ever created
    - dwell_seconds: current SESSION duration only (not cumulative across sessions)
    """
    _next_id = 1

    def __init__(self, box: List[float], session_timeout: float = 300.0):
        self.track_id: int = _Track._next_id
        _Track._next_id += 1

        # Session identity
        self.global_id: Optional[str] = None   # Set by ReID service if available
        self.session_id: str = str(uuid.uuid4())
        self.session_status: str = "ACTIVE"    # ACTIVE | CLOSED

        # Timing
        now = datetime.now(timezone.utc)
        self.enter_time: datetime = now          # first ever seen
        self.session_start_time: datetime = now  # current session start
        self.last_seen: datetime = now

        # Tracking state
        self.box = box
        self.missed_frames: int = 0
        self.session_timeout: float = session_timeout

        # Zone state
        self.current_zone: Optional[str] = None
        self.zone_enter_time: Optional[datetime] = None
        self.alert_triggered: bool = False

        # Evidence snapshots
        self.snapshot_enter_captured: bool = False
        self.snapshot_mid_captured: bool = False
        self.snapshot_exit_captured: bool = False
        self.snapshot_enter_path: Optional[str] = None
        self.snapshot_mid_path: Optional[str] = None
        self.snapshot_exit_path: Optional[str] = None
        self.snapshot_path: Optional[str] = None  # Legacy / combined

        # Interval snapshots (every SNAPSHOT_INTERVAL_SECONDS while in zone)
        self.snapshot_interval_paths: List[str] = []
        self.last_interval_snapshot_time: float = 0.0
        self.SNAPSHOT_INTERVAL_SECONDS: float = 20.0

        # Buffer for exit snapshot
        self.entry_frame: Optional[Any] = None  # last good frame crop

    @property
    def center(self) -> Tuple[float, float]:
        return ((self.box[0] + self.box[2]) / 2, (self.box[1] + self.box[3]) / 2)

    @property
    def dwell_seconds(self) -> float:
        """Duration of the CURRENT session only."""
        return (datetime.now(timezone.utc) - self.session_start_time).total_seconds()

    def start_new_session(self):
        """Called when a person re-enters after a session timeout gap."""
        self.session_id = str(uuid.uuid4())
        self.session_start_time = datetime.now(timezone.utc)
        self.session_status = "ACTIVE"
        self.current_zone = None
        self.zone_enter_time = None
        self.alert_triggered = False
        self.snapshot_enter_captured = False
        self.snapshot_mid_captured = False
        self.snapshot_exit_captured = False
        self.snapshot_enter_path = None
        self.snapshot_mid_path = None
        self.snapshot_exit_path = None
        self.snapshot_interval_paths = []
        self.last_interval_snapshot_time = 0.0


class DwellTimeService:
    """
    One DwellTimeService instance per camera.

    Call update() every frame with the list of scaled bounding boxes from YOLO.

    Session semantics:
    - If a person leaves view for > SESSION_TIMEOUT_SECONDS, their session is CLOSED.
    - When they return, a NEW session starts with wait time reset to 0.
    """

    # Dead track eviction when missed this many consecutive frames (~1s at 16fps)
    MAX_MISSED_FRAMES = 15

    # Session timeout: if not seen for this long, close the session
    # When they reappear, a brand-new session begins with 0s wait time
    SESSION_TIMEOUT_SECONDS = 300.0   # 5 minutes — configurable

    # Min IoU to match a new box to an existing track
    IOU_THRESHOLD = 0.25

    # Min sharpness (Laplacian variance) to save a snapshot
    MIN_SHARPNESS = 30.0

    def __init__(self, camera_id):
        self.camera_id = camera_id
        self._tracks: Dict[int, _Track] = {}        # track_id → _Track
        self._evicted: List[Dict] = []              # completed records pending DB flush
        self._zones: List[Dict] = []                # cached zones for this camera

    # ------------------------------------------------------------------
    # Snapshot helpers
    # ------------------------------------------------------------------

    def _is_sharp_enough(self, frame: np.ndarray) -> bool:
        """Returns True if frame is sharp enough to save as evidence."""
        try:
            score = _laplacian_variance(frame)
            return score >= self.MIN_SHARPNESS
        except Exception:
            return True  # Default: allow save on error

    def save_snapshot(self, frame, track: "_Track", dwell_seconds: float,
                      label: str = "", save_full_frame: bool = True) -> Optional[str]:
        """
        Save an annotated evidence snapshot.
        
        If save_full_frame=True (default), saves the FULL camera frame with a
        bounding box drawn around the person for maximum audit quality.
        Falls back to cropped region if frame is too small.

        Returns the saved storage-relative path, or None on failure.
        """
        try:
            snap_dir = os.path.join("storage", "dwell_snapshots")
            os.makedirs(snap_dir, exist_ok=True)

            h, w = frame.shape[:2]
            x1, y1, x2, y2 = [int(v) for v in track.box]

            # Choose: full frame or crop
            if save_full_frame and w >= 400 and h >= 300:
                img = frame.copy()
                # Draw bounding box on full frame
                pad = 8
                bx1, by1 = max(0, x1 - pad), max(0, y1 - pad)
                bx2, by2 = min(w, x2 + pad), min(h, y2 + pad)
                cv2.rectangle(img, (bx1, by1), (bx2, by2), (0, 195, 255), 2)
                # Corner markers (tactical look)
                cs = 14
                cv2.line(img, (bx1, by1), (bx1 + cs, by1), (0, 230, 255), 3)
                cv2.line(img, (bx1, by1), (bx1, by1 + cs), (0, 230, 255), 3)
                cv2.line(img, (bx2, by1), (bx2 - cs, by1), (0, 230, 255), 3)
                cv2.line(img, (bx2, by1), (bx2, by1 + cs), (0, 230, 255), 3)
                cv2.line(img, (bx1, by2), (bx1 + cs, by2), (0, 230, 255), 3)
                cv2.line(img, (bx1, by2), (bx1, by2 - cs), (0, 230, 255), 3)
                cv2.line(img, (bx2, by2), (bx2 - cs, by2), (0, 230, 255), 3)
                cv2.line(img, (bx2, by2), (bx2, by2 - cs), (0, 230, 255), 3)
            else:
                # Crop fallback
                pad = 20
                x1c = max(0, x1 - pad); y1c = max(0, y1 - pad)
                x2c = min(w, x2 + pad); y2c = min(h, y2 + pad)
                img = frame[y1c:y2c, x1c:x2c].copy()
                if img.size == 0:
                    return None

            if not self._is_sharp_enough(img):
                logger.warning(f"Snapshot skipped: Frame too blurry (Score < {self.MIN_SHARPNESS})")
                return None  # Skip blurry frames

            ih, iw = img.shape[:2]

            # Semi-transparent bottom banner
            overlay = img.copy()
            banner_h = min(60, ih // 5)
            cv2.rectangle(overlay, (0, ih - banner_h), (iw, ih), (8, 12, 25), -1)
            cv2.addWeighted(overlay, 0.78, img, 0.22, 0, img)

            # Amber/cyan top-left badge
            badge_label = label or "EVIDENCE"
            font = cv2.FONT_HERSHEY_DUPLEX
            minutes = int(dwell_seconds) // 60
            seconds = int(dwell_seconds) % 60
            dwell_str = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"
            ts_str = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")

            y_base = ih - banner_h + 16
            cv2.putText(img, f"DWELL: {dwell_str}", (8, y_base), font, 0.42, (0, 210, 255), 1, cv2.LINE_AA)
            cv2.putText(img, f"[{badge_label}] SESSION: {track.session_id[:8]}", (8, y_base + 20), font, 0.35, (180, 180, 200), 1, cv2.LINE_AA)
            cv2.putText(img, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 215, 255), 2)
            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 165, 255), 2)

            # 3. Save to storage
            fname = f"dwell_{self.camera_id}_{track.track_id}_{int(time.time())}.jpg"
            fpath = os.path.join(snap_dir, fname)
            fpath_rel = os.path.join("dwell_snapshots", fname)
            
            # Ensure we use absolute path for imwrite to be safe
            abs_fpath = os.path.abspath(fpath)
            
            def _write_img():
                ok = cv2.imwrite(abs_fpath, img, [cv2.IMWRITE_JPEG_QUALITY, 90])
                if not ok:
                    logger.error(f"Failed to write snapshot to {abs_fpath}")
            
            try:
                loop = asyncio.get_running_loop()
                # Fire and forget the IO write
                loop.run_in_executor(None, _write_img)
            except RuntimeError:
                # If no running loop (e.g. testing), just run sync
                _write_img()

            # 4. Critical: LINK to JourneyManager so it shows in UI/PDF
            if track.global_id:
                try:
                    from app.services.journey_manager_service import journey_manager
                    global_track = journey_manager.active_journeys.get(track.global_id)
                    if global_track and global_track.path:
                        last_entry = global_track.path[-1] # Current session entry
                        if label == "ENTRY":
                            last_entry["snapshot_enter_path"] = fpath_rel
                        elif label == "PEAK" or label == "MID":
                            last_entry["snapshot_mid_path"] = fpath_rel
                        elif label == "EXIT":
                            last_entry["snapshot_exit_path"] = fpath_rel
                except Exception as e:
                    logger.error(f"Failed to link snapshot to journey: {e}")

            return fpath_rel
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Main update — called every frame from stream_worker
    # ------------------------------------------------------------------

    def update(
        self,
        boxes: List[Dict],
        zones: Optional[List[Dict]] = None,
        frame=None,
    ) -> List[Dict]:
        """Update tracker with new detections."""
        if not hasattr(self, "_tick_count"): self._tick_count = 0
        self._tick_count += 1
        if self._tick_count == 1:
            with open("storage/DWELL_ALIVE.txt", "w") as f:
                f.write(f"Dwell service started for cam {self.camera_id} at {datetime.now()}")
        if self._tick_count % 30 == 0:
            logger.info(f"DwellService Loop: Cam {self.camera_id} processing {len(boxes)} boxes. Frame present: {frame is not None}")
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
                t.box = new_boxes[best_idx]
                t.missed_frames = 0
                t.last_seen = now
                matched_track_ids.add(t.track_id)
                matched_box_indices.add(best_idx)
                
                # LINK TO GLOBAL ID (REID)
                source_box = boxes[best_idx]
                if "global_id" in source_box:
                    t.global_id = source_box["global_id"]
            else:
                t.missed_frames += 1

        # Step 2: Create new tracks for unmatched boxes
        for i, nb in enumerate(new_boxes):
            if i not in matched_box_indices:
                new_track = _Track(nb, session_timeout=self.SESSION_TIMEOUT_SECONDS)
                source_box = boxes[i]
                if "global_id" in source_box:
                    new_track.global_id = source_box["global_id"]
                self._tracks[new_track.track_id] = new_track

        # Step 3: Zone membership, snapshots, and eviction
        to_evict = []
        for track_id, t in list(self._tracks.items()):
            time_since_last_seen = (now - t.last_seen).total_seconds()

            # SESSION TIMEOUT: person gone > SESSION_TIMEOUT_SECONDS → close session
            if t.missed_frames > self.MAX_MISSED_FRAMES or time_since_last_seen > self.SESSION_TIMEOUT_SECONDS:
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

            # --- Evidence Snapshot Pipeline ---
            if frame is not None:
                zone_dwell = (now - t.zone_enter_time).total_seconds() if t.zone_enter_time else t.dwell_seconds

                # 1. Entry snapshot (first good frame in zone, or on track creation)
                if not t.snapshot_enter_captured:
                    path = self.save_snapshot(frame, t, 0.1, label="ENTRY")
                    if path:
                        t.snapshot_enter_path = path
                        t.snapshot_enter_captured = True

                # 2. Alert + mid snapshot
                if t.current_zone and zone_dwell > matched_threshold and not t.alert_triggered:
                    t.alert_triggered = True
                    asyncio.ensure_future(self._fire_long_wait_alert(t, zone_dwell))

                if t.alert_triggered and not t.snapshot_mid_captured:
                    path = self.save_snapshot(frame, t, zone_dwell, label="PEAK")
                    if path:
                        t.snapshot_mid_path = path
                        t.snapshot_path = path  # legacy
                        t.snapshot_mid_captured = True

                # 3. Interval snapshots (every SNAPSHOT_INTERVAL_SECONDS while in zone)
                now_ts = time.time()
                if (t.current_zone
                        and now_ts - t.last_interval_snapshot_time >= t.SNAPSHOT_INTERVAL_SECONDS
                        and len(t.snapshot_interval_paths) < 5):
                    path = self.save_snapshot(frame, t, t.dwell_seconds, label=f"MID-{len(t.snapshot_interval_paths)+1}")
                    if path:
                        t.snapshot_interval_paths.append(path)
                        t.last_interval_snapshot_time = now_ts

                # Buffer last good frame crop for exit snapshot
                h, w = frame.shape[:2]
                x1, y1, x2, y2 = [int(v) for v in t.box]
                pad = 20
                x1c, y1c = max(0, x1 - pad), max(0, y1 - pad)
                x2c, y2c = min(w, x2 + pad), min(h, y2 + pad)
                crop = frame[y1c:y2c, x1c:x2c]
                if crop.size > 0 and self._is_sharp_enough(crop):
                    t.entry_frame = crop.copy()

        # Step 4: Evict and record closed sessions
        for tid in to_evict:
            t = self._tracks.pop(tid)
            # Only record if stayed > 2s (filter noise)
            if t.dwell_seconds > 2:
                # Exit snapshot using last buffered frame
                if not t.snapshot_exit_captured and t.entry_frame is not None:
                    path = self.save_snapshot(t.entry_frame, t, t.dwell_seconds, label="EXIT")
                    if path:
                        t.snapshot_exit_path = path
                        t.snapshot_exit_captured = True

                t.session_status = "CLOSED"
                self._evicted.append(self._track_to_record(t))

        # Step 5: Return active tracks for overlay
        return [
            {
                "track_id": t.track_id,
                "session_id": t.session_id,
                "bbox": t.box,
                "dwell_seconds": t.dwell_seconds,         # Current session only
                "session_start_time": t.session_start_time.isoformat(),
                "zone": t.current_zone,
                "alert_triggered": t.alert_triggered,
            }
            for t in list(self._tracks.values())
            if t.missed_frames == 0
        ]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _track_to_record(self, t: "_Track") -> Dict:
        return {
            "camera_id": self.camera_id,
            "tracker_id": t.track_id,
            "session_id": t.session_id,
            "zone_name": t.current_zone or "unknown",
            "enter_time": t.session_start_time,       # Session start, NOT global enter
            "last_seen_time": t.last_seen,
            "dwell_seconds": t.dwell_seconds,
            "alert_triggered": t.alert_triggered,
            "snapshot_path": getattr(t, "snapshot_path", None),
            "snapshot_enter_path": getattr(t, "snapshot_enter_path", None),
            "snapshot_mid_path": getattr(t, "snapshot_mid_path", None),
            "snapshot_exit_path": getattr(t, "snapshot_exit_path", None),
            "snapshot_interval_paths": getattr(t, "snapshot_interval_paths", []),
            "session_status": t.session_status,
            "exit_time": t.last_seen,
        }

    def get_live_stats(self) -> Dict[str, Any]:
        """Return snapshot of current tracking state for the API."""
        active = [t for t in list(self._tracks.values()) if t.missed_frames == 0]
        if not active:
            return {
                "people_tracked": 0,
                "avg_dwell_seconds": 0.0,
                "max_dwell_seconds": 0.0,
                "tracks": [],
            }

        # Use session dwell_seconds (current session only)
        dwells = [t.dwell_seconds for t in active]
        return {
            "people_tracked": len(active),
            "avg_dwell_seconds": round(sum(dwells) / len(dwells), 1),
            "max_dwell_seconds": round(max(dwells), 1),
            "tracks": [
                {
                    "track_id": t.track_id,
                    "session_id": t.session_id,
                    "dwell_seconds": round(t.dwell_seconds, 1),
                    "zone": t.current_zone or "—",
                    "bbox": t.box,
                    "enter_time": t.session_start_time.isoformat(),
                    "last_seen_time": t.last_seen.isoformat(),
                }
                for t in sorted(active, key=lambda x: x.dwell_seconds, reverse=True)
            ],
        }

    def get_queue_metrics(self) -> Dict[str, Any]:
        """
        Compute advanced queue metrics using session dwell times only.
        """
        now = datetime.now(timezone.utc)
        active = [t for t in list(self._tracks.values()) if t.missed_frames == 0]
        in_zone = [t for t in active if t.current_zone is not None]

        # Throughput: people who EXITED a zone in the last 60 seconds
        cutoff = now.timestamp() - 60
        throughput = sum(
            1 for r in self._evicted
            if isinstance(r.get("last_seen_time"), datetime)
            and r["last_seen_time"].timestamp() >= cutoff
        )

        # Avg zone wait for currently in-zone people (session-based)
        zone_dwells = []
        for t in in_zone:
            if t.zone_enter_time:
                zone_dwells.append((now - t.zone_enter_time).total_seconds())

        avg_zone_wait = round(sum(zone_dwells) / len(zone_dwells), 1) if zone_dwells else 0.0
        max_zone_wait = round(max(zone_dwells), 1) if zone_dwells else 0.0

        # Queue health score
        avg_wait_minutes = avg_zone_wait / 60.0
        if avg_wait_minutes > 0 or throughput > 0:
            raw_score = (throughput + 1) / (avg_wait_minutes + 1) * 10
            health_score = min(100, round(raw_score, 1))
        else:
            health_score = 50.0

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
        """Persist evicted track records to person_dwell_times table."""
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
                    snapshot_path=rec.get("snapshot_path"),
                    snapshot_enter_path=rec.get("snapshot_enter_path"),
                    snapshot_mid_path=rec.get("snapshot_mid_path"),
                    snapshot_exit_path=rec.get("snapshot_exit_path"),
                    exit_time=rec.get("exit_time"),
                )
                session.add(obj)
                count += 1
            await session.commit()
        except Exception as e:
            await session.rollback()
            self._evicted.extend(records)
            raise e

        return count

    async def _fire_long_wait_alert(self, track: "_Track", dwell_seconds: float) -> None:
        """Fire a long-wait alert via the alert engine."""
        try:
            from app.core.database import db_manager
            from app.services.alert_engine_service import AlertEngineService
            import uuid as _uuid

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
                    "metric_id": str(_uuid.uuid4()),
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
                        "Recommend opening an additional service counter or dispatching staff."
                    ),
                    "risk_score": 65.0,
                    "occupancy_percent": None,
                    "early_warning_triggered": False,
                }
                engine = AlertEngineService()
                await engine.process_decision(session, decision=decision)
        except Exception:
            pass


# ==============================================================
# Registry: one DwellTimeService per camera
# ==============================================================

_service_registry: Dict[str, DwellTimeService] = {}


def get_dwell_service(camera_id) -> DwellTimeService:
    """Get or create the DwellTimeService singleton for a camera."""
    key = str(camera_id)
    if key not in _service_registry:
        _service_registry[key] = DwellTimeService(camera_id)
    return _service_registry[key]
