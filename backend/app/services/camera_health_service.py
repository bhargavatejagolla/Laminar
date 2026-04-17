"""
Laminar - Camera Health Intelligence Service
---------------------------------------------

Performs frame-level camera health analysis:
1. OFFLINE        — no recent heartbeat/frames
2. BLACK_SCREEN   — frame brightness below threshold (camera light off or night mode)
3. LENS_COVERED   — frame variance too low (lens covered by hand or tape)
4. BLURRED        — extreme lack of edges (dust on lens, severe out-of-focus)
5. ROTATED        — HoughLines detects severely skewed structural lines
6. DEGRADED       — partial issues (intermittent frames, low confidence)

Notifications are sent to the correct coordinator/role automatically:
- LOW / MEDIUM → Management emails
- HIGH         → Management + Supervisors
- CRITICAL / CAMERA_ISSUE → Management + Supervisors + Police (if configured)
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
import asyncio

import numpy as np
import cv2

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.camera import Camera
from app.models.crowd_alert import CrowdAlert
from app.core.logging import get_logger

logger = get_logger(__name__)

# ─────────────────────────────────────────────────────────
# Thresholds
# ─────────────────────────────────────────────────────────
BRIGHTNESS_THRESHOLD = 5        # mean pixel value below this → BLACK_SCREEN
VARIANCE_THRESHOLD   = 15       # frame variance below this  → LENS_COVERED
BLUR_THRESHOLD       = 50       # Laplacian variance below this → BLURRED
ROTATION_MIN_LINES   = 5        # min structural lines needed to decide rotation
CONSECUTIVE_FRAMES   = 90       # frames required to confirm issue (higher = fewer false positives)
OFFLINE_MINUTES      = 5        # minutes without heartbeat → OFFLINE

# Per-camera sliding window: camera_id → list of recent status strings
_frame_issue_buffer: dict[str, list[str]] = {}


class CameraHealthService:
    """
    Analyses incoming frames for hardware / physical issues and
    persists health_status + raises CrowdAlerts automatically.
    """

    OFFLINE_MINUTES = OFFLINE_MINUTES

    # ─────────────────────────────────────────────────────
    # Frame-level analysis (called from worker pipeline)
    # ─────────────────────────────────────────────────────

    def analyze_frame(self, camera_id: str, frame: Optional[np.ndarray]) -> str:
        """
        Analyse a single frame and return a health status string.
        Uses a rolling buffer so transient glitches don't trigger alerts.

        Returns one of: "healthy", "black_screen", "lens_covered", "rotated", "offline"
        """
        key = str(camera_id)

        if frame is None:
            issue = "offline"
        else:
            issue = self._classify_frame(frame)

        # Maintain a rolling buffer of the last N statuses
        buf = _frame_issue_buffer.setdefault(key, [])
        buf.append(issue)
        if len(buf) > CONSECUTIVE_FRAMES:
            buf.pop(0)

        # Only confirm the issue if ALL recent frames agree
        if len(buf) == CONSECUTIVE_FRAMES and all(s == issue for s in buf):
            return issue
        if issue == "healthy":
            return "healthy"
        # Not yet confirmed — return healthy to avoid false alarms
        return "healthy"

    def _classify_frame(self, frame: np.ndarray) -> str:
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness = float(np.mean(gray))
            variance   = float(np.var(gray))
            laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

            if brightness < BRIGHTNESS_THRESHOLD:
                return "black_screen"
            if variance < VARIANCE_THRESHOLD:
                return "lens_covered"
            if laplacian_var < BLUR_THRESHOLD:
                return "blurred"

            # Robust edge-based rotation detection via HoughLinesP
            edges = cv2.Canny(gray, 50, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 50, minLineLength=50, maxLineGap=10)
            
            if lines is not None and len(lines) > ROTATION_MIN_LINES:
                skewed_lines = 0
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    if x2 == x1: continue
                    angle = abs(np.degrees(np.arctan((y2 - y1) / (x2 - x1))))
                    # Check if line is severely skewed (between 15 and 75 degrees)
                    if 15 < angle < 75:
                        skewed_lines += 1
                
                # If more than 30% of strong structural lines are skewed, camera is likely rotated
                if skewed_lines / len(lines) > 0.30:
                    return "rotated"
                    
        except Exception as e:
            logger.warning(f"Frame classification error: {e}")
        return "healthy"

    # ─────────────────────────────────────────────────────
    # Persist health status to camera row
    # ─────────────────────────────────────────────────────

    async def update_camera_health(
        self,
        session: AsyncSession,
        camera: Camera,
        status: str,       # "healthy" | "offline" | "black_screen" | "lens_covered" | "rotated"
        issue_type: Optional[str] = None,
    ) -> None:
        """
        Persist camera health_status to DB and issue an alert if needed.
        Only creates a new alert when the issue type changes (avoids spam).
        """
        previous_health = camera.health_status
        camera.health_status = status
        camera.updated_at = datetime.now(timezone.utc)

        # Sync is_online property to ensure UI reflects the real-time state instantly
        if status == "offline":
            camera.is_online = False
        elif status == "healthy":
            camera.is_online = True

        # If camera went from healthy → issue, raise an alert
        if status != "healthy" and previous_health != status:
            await self._raise_camera_alert(session, camera, issue_type or status)

        await session.commit()

    # ─────────────────────────────────────────────────────
    # Alert creation
    # ─────────────────────────────────────────────────────

    async def _raise_camera_alert(
        self,
        session: AsyncSession,
        camera: Camera,
        issue_type: str,
    ) -> None:
        """
        Create a CrowdAlert for the camera issue and send notifications
        to the correct coordinators automatically.
        """
        # Don't duplicate open alerts for the same camera + issue
        existing_stmt = select(CrowdAlert).where(
            CrowdAlert.venue_id == camera.venue_id,
            CrowdAlert.status.in_(["open", "acknowledged"]),
        )
        existing_result = await session.execute(existing_stmt)
        existing_alerts = existing_result.scalars().all()

        already_exists = any(
            a.extra_data
            and a.extra_data.get("type") == "camera_issue"
            and a.extra_data.get("issue_type") == issue_type
            and a.extra_data.get("camera_id") == str(camera.id)
            for a in existing_alerts
        )

        if already_exists:
            return

        # Determine severity based on issue type
        severity_map = {
            "offline":      ("high",     80),
            "black_screen": ("medium",   55),
            "lens_covered": ("critical", 90),
            "blurred":      ("medium",   45),
            "rotated":      ("medium",   50),
        }
        risk_level, severity = severity_map.get(issue_type, ("medium", 50))

        human_labels = {
            "offline":      "Camera Disconnected / Offline",
            "black_screen": "Black Screen Detected",
            "lens_covered": "Lens Covered / Obstructed",
            "blurred":      "Lens Blurred / Dusty",
            "rotated":      "Camera Rotated / Misaligned",
        }

        alert = CrowdAlert(
            venue_id=camera.venue_id,
            risk_level=risk_level,
            severity=severity,
            status="open",
            escalation_level=0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            extra_data={
                "type":             "camera_issue",
                "issue_type":       issue_type,
                "camera_id":        str(camera.id),
                "camera_name":      camera.name,
                "camera_location":  camera.get_display_location(),
                "issue_label":      human_labels.get(issue_type, issue_type.replace("_", " ").title()),
            },
        )

        session.add(alert)
        await session.commit()
        await session.refresh(alert)

        logger.warning(
            f"Camera issue alert created: {issue_type} for camera {camera.name} "
            f"(venue {camera.venue_id})"
        )

        # Send notifications to correct coordinators
        try:
            from app.services.notification_service import NotificationService
            notifier = NotificationService()
            await notifier.notify_camera_issue(session, alert)
        except Exception as e:
            logger.error(f"Failed to send camera issue notification: {e}")

    # ─────────────────────────────────────────────────────
    # Offline check (legacy — heartbeat based)
    # ─────────────────────────────────────────────────────

    async def check_offline_cameras(self, session: AsyncSession):
        """
        Checks all active cameras for missing heartbeats.
        Marks as offline and creates alert if offline > OFFLINE_MINUTES.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=self.OFFLINE_MINUTES)

        stmt = select(Camera).where(
            Camera.last_heartbeat_at < cutoff,
            Camera.is_active == True,
            Camera.deleted_at.is_(None),
        )

        result = await session.execute(stmt)
        cameras = result.scalars().all()

        for cam in cameras:
            logger.info(f"Camera offline detected: {cam.name}")
            cam.health_status = "offline"
            cam.is_online = False
            cam.updated_at = datetime.now(timezone.utc)
            await self._raise_camera_alert(session, cam, "offline")

        if cameras:
            await session.commit()

    # ─────────────────────────────────────────────────────
    # Bulk health summary (for API)
    # ─────────────────────────────────────────────────────

    async def get_all_camera_health(self, session: AsyncSession) -> list[dict]:
        """Return health summary for every active camera, including live buffer diagnostics."""
        result = await session.execute(
            select(Camera).where(Camera.deleted_at.is_(None))
        )
        cameras = result.scalars().all()

        ISSUE_MESSAGES = {
            "healthy":      "Operating normally",
            "offline":      "Camera disconnected or unreachable",
            "black_screen": "Frame is completely black — check power / IR",
            "lens_covered": "Lens may be covered or obstructed",
            "blurred":      "Image is severely blurred or out of focus",
            "rotated":      "Camera appears to have been rotated or misaligned",
            "unknown":      "Health status not yet determined",
            "error":        "Camera returned an error",
            "warning":      "Camera showing intermittent issues",
        }

        rows = []
        for c in cameras:
            cam_key = str(c.id)
            effective_status = "offline" if not c.is_online else (c.health_status or "unknown")

            # ── Live buffer diagnostics ────────────────────────────────────────
            buf: list[str] = _frame_issue_buffer.get(cam_key, [])
            monitoring_active = len(buf) > 0  # worker has seen at least one frame

            # Count non-healthy frames in the rolling buffer
            frame_issue_count = sum(1 for s in buf if s != "healthy")

            # Confidence = fraction of buffer showing current status
            if buf and effective_status not in ("unknown", "offline"):
                issue_confidence = round(
                    sum(1 for s in buf if s == effective_status) / len(buf), 2
                )
            else:
                issue_confidence = None

            rows.append({
                "camera_id":          cam_key,
                "name":               c.name,
                "venue_id":           str(c.venue_id),
                "location":           c.get_display_location(),
                "health_status":      effective_status,
                "is_online":          c.is_online,
                "is_active":          c.is_active,
                "monitoring_active":  monitoring_active,
                "frame_issue_count":  frame_issue_count,
                "frame_buffer_size":  len(buf),
                "issue_confidence":   issue_confidence,
                "issue":              ISSUE_MESSAGES.get(effective_status, "Unknown status"),
                "last_frame_at":      c.last_frame_at.isoformat() if c.last_frame_at else None,
                "last_heartbeat_at":  c.last_heartbeat_at.isoformat() if c.last_heartbeat_at else None,
            })

        return rows

