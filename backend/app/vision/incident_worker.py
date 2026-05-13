"""
Laminar - Incident Worker
-------------------------

Pipeline for real-time hazard detection and emergency alerting.
Updates Global State and triggers high-priority SMS alerts.
"""

import asyncio
import cv2
import numpy as np
import time
from typing import Optional, Any, Dict, List
from uuid import UUID
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.vision.incident_detector import incident_detector
from app.core.global_state import GLOBAL_STATE
from sqlalchemy import select, update
from app.services.notification_service import notification_service
from app.services.email_alert_service import email_alert_service

logger = get_logger(__name__)

class IncidentWorker:
    """
    Dedicated worker for a single incident monitoring camera.
    """

    def __init__(self, camera_id: UUID, venue_id: UUID, source: Any):
        self.camera_id = camera_id
        self.venue_id = venue_id
        self.source = source
        self.detector = incident_detector
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._cached_frame_bytes: Optional[bytes] = None
        self._last_detection_time: float = 0.0
        self.injected_frame: Optional[np.ndarray] = None

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"IncidentWorker started for camera {self.camera_id}")

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
        logger.info(f"IncidentWorker stopped for camera {self.camera_id}")

    async def _run_loop(self):
        """
        High-performance frame reading loop.
        Decouples frame acquisition from expensive AI detection.
        """
        self._last_annotated_frame = None
        self._current_raw_frame = None

        # Start detection task in background
        self._detection_task = asyncio.create_task(self._detection_loop())

        while self._running:
            try:
                # ── Frame acquisition ──
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

                # ── Store for detector ──
                self._current_raw_frame = frame.copy()

                # ── Always update MJPEG cache ──
                frame_to_encode = self._last_annotated_frame if self._last_annotated_frame is not None else frame
                try:
                    _, jpeg = cv2.imencode(".jpg", frame_to_encode, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    self._cached_frame_bytes = jpeg.tobytes()
                except Exception: pass

                # Periodic health sync
                if time.time() % 10 < 0.1:
                    try:
                        async with db_manager.session() as session:
                            from sqlalchemy import update as sa_update
                            from app.models.camera import Camera
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
                logger.error(f"IncidentWorker loop error: {e}")
                await asyncio.sleep(1)

    async def _detection_loop(self):
        """Dedicated background task for AI inference (Incidents)."""
        detection_interval = 0.5  # 2 Hz
        while self._running:
            try:
                if hasattr(self, '_current_raw_frame') and self._current_raw_frame is not None:
                    # Run expensive detection
                    loop = asyncio.get_event_loop()
                    incidents, annotated, vehicle_counts = await loop.run_in_executor(
                        None, self.detector.detect_and_annotate, self._current_raw_frame.copy()
                    )
                    
                    self._last_annotated_frame = annotated

                    if incidents:
                        # Update Global State
                        GLOBAL_STATE.update(
                            domain="incident",
                            venue_id=str(self.camera_id),
                            payload={
                                "venue_id": str(self.venue_id),
                                "active_incidents": incidents,
                                "vehicle_counts": vehicle_counts,
                                "last_updated": datetime.now(timezone.utc).isoformat()
                            }
                        )

                        # ── Push to Tactical Event Bus for Centralized Reporting ──
                        for inc in incidents:
                            GLOBAL_STATE.push_event("incident", str(self.camera_id), {
                                **inc,
                                "venue_id": str(self.venue_id),
                                "vehicle_types": vehicle_counts,
                                "_source": "LIVE_FEED"
                            })
                        
                        # Trigger REAL Alerts for Critical Incidents (Backgrounded)
                        critical = [i for i in incidents if i["priority"] == "CRITICAL"]
                        if critical:
                            asyncio.create_task(self._send_emergency_alerts(critical[0], vehicle_counts))

                await asyncio.sleep(detection_interval)
            except Exception as e:
                logger.error(f"Incident detection loop error: {e}")
                await asyncio.sleep(1)

    async def _send_emergency_alerts(self, incident: Dict[str, Any], vehicle_counts: Optional[Dict[str, int]] = None):
        """Dispatch high-priority notifications to all emergency contacts."""
        try:
            # Fetch Venue Metadata for rich notifications
            async with db_manager.session() as session:
                from app.models.venue import Venue as VenueModel
                from app.models.user import User
                venue = await session.get(VenueModel, self.venue_id)
                lat = float(venue.latitude or 0.0) if venue else 0.0
                lon = float(venue.longitude or 0.0) if venue else 0.0
                v_name = venue.name if venue else "Unknown Area"

                # 1. SMS Alert
                try:
                    from app.services.sms_alert_service import SmsAlertService
                    sms = SmsAlertService()
                    stmt = select(User.phone_number).where(User.receive_sms_alerts == True, User.phone_number.isnot(None))
                    res = await session.execute(stmt)
                    contacts = [row[0] for row in res.all()]
                    
                    if contacts:
                        msg = (
                            f"🚨 [URGENT: {v_name}]\n"
                            f"TYPE: {incident.get('type', 'Unknown Activity')}\n"
                            f"LOC: {lat}, {lon}\n"
                            f"AI INSIGHT: {incident.get('description', 'Possible hazard detected via neural feed.')}"
                        )
                        await sms.notify_recipients(contacts, msg)
                except Exception as sms_err:
                    logger.error(f"Sms dispatch error: {sms_err}")
                
                # 2. Email Alert
                try:
                    total_veh = sum(vehicle_counts.values()) if vehicle_counts else 0
                    email_alert_service.send_accident_alert(
                        incident=incident, venue_name=v_name, latitude=lat, longitude=lon,
                        vehicle_count=total_veh, vehicle_types=vehicle_counts
                    )
                except Exception as email_err:
                    logger.error(f"Email dispatch error: {email_err}")
                    
                # 3. Global Mesh Notification
                asyncio.create_task(notification_service.push_notification(
                    domain="incident", type=incident.get('type', 'Emergency'), priority="CRITICAL",
                    description=f"CRITICAL INCIDENT at {v_name}: {incident.get('description')}",
                    venue_id=str(self.venue_id),
                    metadata={
                        "incident_type": incident.get('type'), "latitude": lat, "longitude": lon,
                        "explanation": incident.get('description'), "vehicle_counts": vehicle_counts
                    }
                ))
        except Exception as e:
            logger.error(f"Emergency Alert Dispatch Failed: {e}", exc_info=True)
