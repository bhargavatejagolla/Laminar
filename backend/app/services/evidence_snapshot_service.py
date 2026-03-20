"""
Laminar - Evidence Snapshot Service
-------------------------------------

Captures a JPEG snapshot and a 10-second MP4 clip from the live
camera stream whenever a crowd alert is created or escalated.

Design:
- NON-BLOCKING: all file I/O runs in asyncio.to_thread()
- Snapshot taken from StreamWorker._latest_annotated_frame (already
  has YOLO bounding boxes drawn on it)
- Clip uses the existing EvidenceClipService / recording mechanism
  already inside StreamWorker
- Both paths are written to CrowdAlert.extra_data JSONB to avoid
  any database schema migration
"""

import asyncio
import os
import base64
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import cv2
import numpy as np

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.database import db_manager

logger = get_logger(__name__)

# ──────────────────────────────────────────────────────
# Storage configuration
# ──────────────────────────────────────────────────────

# Determine backend root (where manage.py / main.py lives)
_BACKEND_ROOT = os.getcwd() if os.path.basename(os.getcwd()) == "backend" else os.path.dirname(os.path.abspath(__file__))
while _BACKEND_ROOT and os.path.basename(_BACKEND_ROOT) not in ("backend", "laminar"):
    _BACKEND_ROOT = os.path.dirname(_BACKEND_ROOT)

SNAPSHOT_DIR     = os.path.abspath(os.path.join(_BACKEND_ROOT, "storage", "alert_snapshots"))
CLIPS_DIR        = os.path.abspath(os.path.join(_BACKEND_ROOT, "storage", "clips"))
MAX_SNAPSHOT_WIDTH = 1280          # px — resize before save for efficiency
JPEG_QUALITY       = 88            # 0-100


class EvidenceSnapshotService:
    """
    End-to-end evidence capture:
    1. Grab the latest annotated frame from the running StreamWorker
    2. Resize + save as JPEG  →  storage/alert_snapshots/<name>.jpg
    3. Start a 10-second clip recording  →  downloads/evidence_clips/<name>.mp4
    4. Persist both paths in CrowdAlert.extra_data
    """

    def __init__(self):
        os.makedirs(SNAPSHOT_DIR, exist_ok=True)
        os.makedirs(CLIPS_DIR,    exist_ok=True)

    # ─────────────────────────────────────────────────
    # Public Interface
    # ─────────────────────────────────────────────────

    async def trigger_evidence_capture(
        self,
        camera_id: Optional[UUID],
        alert_id: UUID,
        venue_name: str = "Unknown Venue",
        risk_level: str = "unknown",
    ) -> None:
        """
        Background task entry point. Safe — never raises.
        """
        try:
            await self._capture_and_persist(
                camera_id=camera_id,
                alert_id=alert_id,
                venue_name=venue_name,
                risk_level=risk_level,
            )
        except Exception as exc:
            logger.error(
                "Evidence capture failed",
                extra={"alert_id": str(alert_id), "error": str(exc)},
                exc_info=True,
            )

    # ─────────────────────────────────────────────────
    # Internal Orchestration
    # ─────────────────────────────────────────────────

    async def _capture_and_persist(
        self,
        camera_id: Optional[UUID],
        alert_id: UUID,
        venue_name: str,
        risk_level: str,
    ) -> None:
        now = datetime.now(timezone.utc)
        ts  = now.strftime("%Y%m%d_%H%M%S")

        cam_tag    = str(camera_id)[:8] if camera_id else "no_cam"
        alert_tag  = str(alert_id)[:8]

        snapshot_path: Optional[str] = None
        clip_path:     Optional[str] = None

        # ── 1. Snapshot ──────────────────────────────
        frame = self._get_latest_frame(camera_id)

        if frame is not None:
            filename      = f"cam{cam_tag}_alert{alert_tag}_{ts}.jpg"
            full_path     = os.path.join(SNAPSHOT_DIR, filename)

            # Draw alert banner on the frame copy
            stamped = self._stamp_frame(frame.copy(), risk_level, venue_name, now)

            # Resize + save in thread (non-blocking)
            success = await asyncio.to_thread(
                self._save_snapshot, stamped, full_path
            )
            if success:
                snapshot_path = full_path
                logger.info("Snapshot saved", extra={"path": full_path})
        else:
            logger.warning(
                "No live frame available for snapshot",
                extra={"camera_id": str(camera_id)},
            )

        # ── 2. Video clip ────────────────────────────
        clip_filename = f"cam{cam_tag}_alert{alert_tag}_{ts}.mp4"
        clip_full     = os.path.join(CLIPS_DIR, clip_filename)

        clip_path = await self._start_clip_recording(
            camera_id, clip_full, duration_seconds=10
        )

        # ── 3. Persist in DB ─────────────────────────
        if snapshot_path or clip_path:
            await self._attach_to_alert(alert_id, snapshot_path, clip_path)

    # ─────────────────────────────────────────────────
    # Frame Acquisition
    # ─────────────────────────────────────────────────

    def _get_latest_frame(self, camera_id: Optional[UUID]) -> Optional[np.ndarray]:
        """
        Pull the latest annotated frame from the running StreamWorker.
        Returns None if no worker is running for this camera.
        """
        if camera_id is None:
            return None
        try:
            from app.vision.manager import vision_manager
            worker = vision_manager._workers.get(camera_id)
            if worker is None:
                return None
            frame = worker._latest_annotated_frame
            if frame is None or not isinstance(frame, np.ndarray):
                return None
            return frame.copy()  # defensive copy
        except Exception as exc:
            logger.warning("Could not retrieve frame", extra={"error": str(exc)})
            return None

    # ─────────────────────────────────────────────────
    # Snapshot Utilities
    # ─────────────────────────────────────────────────

    def _stamp_frame(
        self,
        frame: np.ndarray,
        risk_level: str,
        venue_name: str,
        ts: datetime,
    ) -> np.ndarray:
        """
        Overlay a professional alert banner onto the frame.
        Red banner for critical/high, amber for medium/low.
        """
        h, w = frame.shape[:2]

        # Color per severity
        color_map = {
            "critical": (0, 0, 220),
            "high":     (0, 80, 255),
            "medium":   (0, 160, 255),
            "low":      (0, 200, 60),
        }
        banner_color = color_map.get(risk_level.lower(), (30, 30, 30))

        # Draw semi-transparent banner at top
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (w, 54), banner_color, -1)
        cv2.addWeighted(overlay, 0.72, frame, 0.28, 0, frame)

        # Alert label
        label = f"🚨 LAMINAR ALERT  [{risk_level.upper()}]  {venue_name}"
        cv2.putText(
            frame, label,
            (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.65,
            (255, 255, 255), 2, cv2.LINE_AA,
        )

        # Timestamp
        ts_str = ts.strftime("%Y-%m-%d  %H:%M:%S  UTC")
        cv2.putText(
            frame, ts_str,
            (12, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
            (220, 220, 220), 1, cv2.LINE_AA,
        )

        return frame

    def _save_snapshot(self, frame: np.ndarray, path: str) -> bool:
        """
        Resize to ≤MAX_SNAPSHOT_WIDTH and write JPEG. Blocking — call via to_thread.
        """
        try:
            h, w = frame.shape[:2]
            if w > MAX_SNAPSHOT_WIDTH:
                scale  = MAX_SNAPSHOT_WIDTH / w
                new_w  = MAX_SNAPSHOT_WIDTH
                new_h  = int(h * scale)
                frame  = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

            ok = cv2.imwrite(path, frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            return ok
        except Exception as exc:
            logger.error("cv2.imwrite failed", extra={"path": path, "error": str(exc)})
            return False

    # ─────────────────────────────────────────────────
    # Clip Recording
    # ─────────────────────────────────────────────────

    async def _start_clip_recording(
        self,
        camera_id: Optional[UUID],
        output_path: str,
        duration_seconds: int = 10,
    ) -> Optional[str]:
        """
        Collect `duration_seconds` of raw frames from the worker, then encode
        to MP4 via EvidenceClipService. Runs in background so alert is not delayed.
        """
        if camera_id is None:
            return None

        async def _record():
            try:
                from app.vision.manager import vision_manager
                from app.services.evidence_clip_service import EvidenceClipService

                worker = vision_manager._workers.get(camera_id)
                if worker is None:
                    logger.warning("No worker for clip", extra={"camera_id": str(camera_id)})
                    return

                frames = []
                fps    = 2.0  # collection rate
                target = int(duration_seconds * fps)
                interval = 1.0 / fps

                for _ in range(target):
                    f = worker._latest_annotated_frame
                    if f is not None and isinstance(f, np.ndarray):
                        frames.append(f.copy())
                    await asyncio.sleep(interval)

                if not frames:
                    logger.warning("No frames collected for clip")
                    return

                # Write the clip in a background thread
                clip_svc = EvidenceClipService()
                await asyncio.to_thread(
                    clip_svc._write_video, output_path, frames, fps
                )
                logger.info("Clip saved", extra={"path": output_path, "frames": len(frames)})

            except Exception as exc:
                logger.error("Clip recording failed", extra={"error": str(exc)}, exc_info=True)

        asyncio.create_task(_record())
        # Return the path immediately — clip saves in background
        return output_path

    # ─────────────────────────────────────────────────
    # DB Persistence
    # ─────────────────────────────────────────────────

    async def _attach_to_alert(
        self,
        alert_id: UUID,
        snapshot_path: Optional[str],
        clip_path: Optional[str],
    ) -> None:
        """
        Update CrowdAlert.extra_data with snapshot_path and clip_path.
        Uses a fresh DB session to avoid session conflicts.
        """
        try:
            from sqlalchemy import select
            from app.models.crowd_alert import CrowdAlert

            async with db_manager.session() as session:
                result = await session.execute(
                    select(CrowdAlert).where(CrowdAlert.id == alert_id)
                )
                alert = result.scalar_one_or_none()
                if not alert:
                    logger.warning("Alert not found for evidence attach", extra={"alert_id": str(alert_id)})
                    return

                extra = dict(alert.extra_data or {})
                if snapshot_path:
                    extra["snapshot_path"] = snapshot_path
                if clip_path:
                    extra["clip_path"] = clip_path
                alert.extra_data = extra
                await session.commit()

                logger.info(
                    "Evidence paths attached to alert",
                    extra={
                        "alert_id": str(alert_id),
                        "snapshot": snapshot_path,
                        "clip": clip_path,
                    },
                )
        except Exception as exc:
            logger.error(
                "Failed to attach evidence to alert",
                extra={"alert_id": str(alert_id), "error": str(exc)},
                exc_info=True,
            )

    # ─────────────────────────────────────────────────
    # Helper: encode snapshot as base64 for email
    # ─────────────────────────────────────────────────

    @staticmethod
    def snapshot_to_base64(snapshot_path: str) -> Optional[str]:
        """
        Read a snapshot file and return base64-encoded bytes.
        Returns None if file doesn't exist.
        """
        try:
            if not os.path.isfile(snapshot_path):
                return None
            with open(snapshot_path, "rb") as fh:
                return base64.b64encode(fh.read()).decode("ascii")
        except Exception:
            return None
