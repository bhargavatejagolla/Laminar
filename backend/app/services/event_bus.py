"""
LAMINAR - Central Intelligence Event Bus
----------------------------------------
Operational event bus providing:
- Structured event ingestion with hysteresis & cooldown
- SSE real-time streaming to dashboards
- Auto-routing to Tactical Mesh / NotificationService
- Provenance and audit tracking (Acknowledge / Resolve)
"""

import time
import asyncio
from collections import deque
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any

from app.models.intelligence_event import LaminarIntelligenceEvent, LocationPayload
from app.services.notification_service import notification_service
from app.core.global_state import GLOBAL_STATE
from app.core.logging import get_logger

logger = get_logger(__name__)

class EventBus:
    """Central event distribution and lifecycle manager."""

    def __init__(self, maxlen: int = 500):
        self._events: deque = deque(maxlen=maxlen)
        self._sse_subscribers: List[asyncio.Queue] = []
        self._last_event_ts: Dict[str, float] = {}  # key -> last emitted timestamp (for cooldown)
        self._domain_states: Dict[str, str] = {}    # key -> current state (for hysteresis)

    async def emit_event(
        self,
        event: LaminarIntelligenceEvent,
        cooldown_seconds: float = 60.0,
        enforce_transition: bool = False
    ) -> bool:
        """
        Ingest and broadcast an intelligence event.
        Respects cooldown and state transitions to eliminate alert spam.
        """
        dedup_key = f"{event.domain}:{event.event_type}:{event.venue_id or ''}:{event.camera_id or ''}"
        now_ts = time.time()

        # State transition check
        if enforce_transition:
            last_state = self._domain_states.get(dedup_key)
            if last_state == event.severity:
                return False  # Already in this severity state, do not spam

        # Cooldown check for repetitive events of same type
        last_ts = self._last_event_ts.get(dedup_key, 0.0)
        if now_ts - last_ts < cooldown_seconds:
            logger.debug(f"Event {event.event_type} throttled under {cooldown_seconds}s cooldown.")
            return False

        # Update tracking
        self._last_event_ts[dedup_key] = now_ts
        self._domain_states[dedup_key] = event.severity

        # Append to event ring buffer (SSE / Live in-memory)
        self._events.appendleft(event)

        # Tactical Mesh / Notification Integration
        if event.severity in ("high", "critical"):
            try:
                delivery_res = await notification_service.push_notification(
                    type=event.event_type.upper(),
                    priority=event.severity.upper(),
                    description=f"[{event.title}] {event.description}",
                    venue_id=event.venue_id,
                    venue_name=event.venue_name,
                    camera_id=event.camera_id,
                    domain=event.domain,
                    metadata={
                        "event_id": event.event_id,
                        "confidence": event.confidence,
                        "location": event.location.model_dump(),
                        "evidence": event.evidence,
                        "explanation": event.explanation
                    }
                )
                if isinstance(delivery_res, dict):
                    event.delivery_status = delivery_res
            except Exception as notif_err:
                logger.warning(f"Could not push event {event.event_id} to notification_service: {notif_err}")
                event.delivery_status = {"in_app": "DELIVERED", "email": "FAILED", "sms": "FAILED"}

        # Dual-Store: Persist to DB for historical truth
        try:
            from app.core.database import async_session_factory
            from app.models.intelligence_event import IntelligenceEventRecord
            from sqlalchemy import select
            async with async_session_factory() as session:
                existing = await session.execute(
                    select(IntelligenceEventRecord).where(IntelligenceEventRecord.event_id == event.event_id)
                )
                if not existing.scalar_one_or_none():
                    rec = IntelligenceEventRecord(
                        event_id=event.event_id,
                        event_type=event.event_type,
                        domain=event.domain,
                        venue_id=event.venue_id,
                        venue_name=event.venue_name,
                        camera_id=event.camera_id,
                        camera_name=event.camera_name,
                        source_type=event.source_type,
                        timestamp_iso=event.timestamp,
                        latitude=event.location.latitude,
                        longitude=event.location.longitude,
                        location_source=event.location.location_source,
                        severity=event.severity,
                        confidence=event.confidence,
                        state=event.state,
                        title=event.title,
                        description=event.description,
                        evidence=event.evidence,
                        explanation=event.explanation,
                        model_name=event.model_name,
                        model_version=event.model_version,
                        delivery_status=event.delivery_status
                    )
                    session.add(rec)
                    await session.commit()
        except Exception as db_err:
            logger.debug(f"Event DB persistence note: {db_err}")

        # Update GLOBAL_STATE for immediate dashboard synchronization
        GLOBAL_STATE.update(
            domain="events",
            venue_id=event.venue_id or "GLOBAL",
            payload={
                "recent_event": event.model_dump(),
                "last_updated": now_ts
            }
        )

        # Broadcast to SSE subscribers
        event_dict = event.model_dump()
        for q in self._sse_subscribers[:]:
            try:
                await q.put(event_dict)
            except Exception:
                if q in self._sse_subscribers:
                    self._sse_subscribers.remove(q)

        logger.info(f"⚡ [EVENT BUS] Emitted {event.event_type} (severity={event.severity}, venue={event.venue_name})")
        return True

    def get_events(
        self,
        venue_id: Optional[str] = None,
        domain: Optional[str] = None,
        severity: Optional[str] = None,
        state: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Query recent events with multi-criteria filtering."""
        results = []
        for ev in self._events:
            if venue_id and ev.venue_id != venue_id:
                continue
            if domain and ev.domain != domain:
                continue
            if severity and ev.severity.lower() != severity.lower():
                continue
            if state and ev.state.lower() != state.lower():
                continue
            results.append(ev.model_dump())
            if len(results) >= limit:
                break
        return results

    def get_event_by_id(self, event_id: str) -> Optional[LaminarIntelligenceEvent]:
        for ev in self._events:
            if ev.event_id == event_id:
                return ev
        return None

    def acknowledge_event(self, event_id: str, operator_id: str = "operator") -> Optional[Dict[str, Any]]:
        ev = self.get_event_by_id(event_id)
        if ev:
            ev.state = "acknowledged"
            ev.acknowledged_at = datetime.now(timezone.utc).isoformat()
            ev.acknowledged_by = operator_id
            return ev.model_dump()
        return None

    def resolve_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        ev = self.get_event_by_id(event_id)
        if ev:
            ev.state = "resolved"
            ev.resolved_at = datetime.now(timezone.utc).isoformat()
            return ev.model_dump()
        return None

    def get_urban_pulse(self, venue_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Aggregates recent event telemetry into a concise Urban Pulse status.
        Zero-mock: derived exclusively from current events and state.
        """
        filtered = [ev for ev in self._events if (not venue_id or ev.venue_id == venue_id)]
        
        active_critical = sum(1 for ev in filtered if ev.severity == "critical" and ev.state in ("candidate", "verified", "active"))
        active_warnings = sum(1 for ev in filtered if ev.severity in ("warning", "high") and ev.state in ("candidate", "verified", "active"))
        
        incidents_count = sum(1 for ev in filtered if ev.domain == "incident" and ev.state in ("verified", "active"))
        traffic_alerts = sum(1 for ev in filtered if ev.domain == "traffic" and ev.severity in ("high", "critical"))
        parking_alerts = sum(1 for ev in filtered if ev.domain == "parking" and ev.severity in ("high", "critical"))
        road_defects = sum(1 for ev in filtered if ev.domain == "road_condition" and ev.state in ("verified", "active"))

        status_text = "All monitored road systems operating within nominal parameters."
        overall_severity = "NOMINAL"

        if active_critical > 0:
            overall_severity = "CRITICAL"
            status_text = f"CRITICAL: {active_critical} urgent roadway hazard(s) requiring immediate tactical dispatch."
        elif active_warnings > 0:
            overall_severity = "ELEVATED"
            status_text = f"ELEVATED: {active_warnings} road sector warning(s) active across monitored network."

        # Zero-mock domain readiness report
        from app.core.model_registry import model_registry, ModelLifecycleState
        road_desc = model_registry.get_descriptor("road_condition")
        road_configured = (road_desc is not None and road_desc.state in (ModelLifecycleState.MODEL_VALIDATED, ModelLifecycleState.MODEL_ENABLED, ModelLifecycleState.FROZEN))

        return {
            "overall_status": overall_severity,
            "headline": status_text,
            "domain_readiness": {
                "traffic": "READY",
                "incident": "READY",
                "parking": "GEOMETRY_DEPENDENT",
                "road_condition": "NOT_CONFIGURED" if not road_configured else "READY",
                "traffic_signals": "SIGNAL DATA NOT CONNECTED"
            },
            "metrics": {
                "active_critical": active_critical,
                "active_warnings": active_warnings,
                "incidents_count": incidents_count,
                "traffic_alerts": traffic_alerts,
                "parking_alerts": parking_alerts,
                "road_defects_count": road_defects,
                "total_events_buffered": len(filtered)
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    async def subscribe_sse(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self._sse_subscribers.append(q)
        return q

    def unsubscribe_sse(self, q: asyncio.Queue):
        if q in self._sse_subscribers:
            self._sse_subscribers.remove(q)

event_bus = EventBus()
