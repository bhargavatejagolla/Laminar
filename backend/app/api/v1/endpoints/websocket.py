"""
Laminar - WebSocket Live Alert Streaming
-----------------------------------------
Provides a persistent WebSocket connection so the frontend receives
real-time alert/metric push events instead of polling.

Architecture:
  - ConnectionManager: tracks all active WS connections per venue (or global)
  - /ws/alerts          → subscribes to ALL alerts across all venues
  - /ws/alerts/{venue_id} → subscribes to a specific venue only

Usage (frontend):
  const ws = new WebSocket("ws://localhost:8000/api/v1/ws/alerts");
  ws.onmessage = (event) => { const data = JSON.parse(event.data); ... }
"""

import json
import asyncio
from typing import Dict, Set, Optional
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.logging import get_logger

router = APIRouter(prefix="/ws", tags=["WebSocket"])
logger = get_logger(__name__)


# ─── Connection Manager ────────────────────────────────────────────────────────

class ConnectionManager:
    """
    Manages all active WebSocket connections.
    Supports both global (all-venue) and per-venue subscriptions.
    Thread-safe via asyncio; no external dependencies.
    """

    def __init__(self):
        # Global subscribers (receive all events)
        self._global: Set[WebSocket] = set()
        # Per-venue subscribers: venue_id (str) → set of WebSocket
        self._venue: Dict[str, Set[WebSocket]] = {}

    # ── Connection lifecycle ──────────────────────────────────────────────────

    async def connect_global(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._global.add(websocket)
        logger.debug(f"WS client connected (global). Total global: {len(self._global)}")

    async def connect_venue(self, websocket: WebSocket, venue_id: str) -> None:
        await websocket.accept()
        self._venue.setdefault(venue_id, set()).add(websocket)
        logger.debug(f"WS client connected to venue {venue_id}. Total: {len(self._venue[venue_id])}")

    def disconnect(self, websocket: WebSocket, venue_id: Optional[str] = None) -> None:
        self._global.discard(websocket)
        if venue_id and venue_id in self._venue:
            self._venue[venue_id].discard(websocket)
            if not self._venue[venue_id]:
                del self._venue[venue_id]

    # ── Broadcast ─────────────────────────────────────────────────────────────

    async def broadcast(self, message: dict, venue_id: Optional[str] = None) -> None:
        """
        Send message to:
          - All global subscribers
          - Venue-specific subscribers if venue_id provided
        Dead connections are auto-removed.
        """
        payload = json.dumps(message)
        dead: Set[WebSocket] = set()

        # Send to global subscribers
        for ws in list(self._global):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)

        # Send to venue-specific subscribers
        if venue_id and venue_id in self._venue:
            for ws in list(self._venue[venue_id]):
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.add(ws)

        # Clean up dead connections
        for ws in dead:
            self.disconnect(ws, venue_id)
            logger.debug("Removed dead WS connection")

    def stats(self) -> dict:
        venue_counts = {vid: len(conns) for vid, conns in self._venue.items()}
        return {
            "global_connections": len(self._global),
            "venue_connections": venue_counts,
            "total": len(self._global) + sum(venue_counts.values()),
        }


# ─── Singleton ──────────────────────────────────────────────────────────────
ws_manager = ConnectionManager()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.websocket("/alerts")
async def ws_global_alerts(websocket: WebSocket):
    """
    Subscribe to ALL alert and metric events across all venues.
    Sends a heartbeat ping every 30s to keep connection alive.
    """
    await ws_manager.connect_global(websocket)
    try:
        while True:
            # ✅ STABILITY FIX: Instead of sleeping blindly, we wait for ANY 
            # text from the client (e.g. they might send their own heartbeats)
            # OR a timeout. receive_text() is crucial because it immediately
            # raises WebSocketDisconnect if the client closes the socket.
            try:
                # We don't actually care about the data, but awaiting it 
                # monitors the socket health.
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # No data for 30s? Send a ping to keep it alive
                await websocket.send_text(json.dumps({"type": "ping", "status": "alive"}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.debug("WS global client disconnected")
    except Exception as e:
        ws_manager.disconnect(websocket)
        logger.warning(f"WS global error: {e}")


@router.websocket("/alerts/{venue_id}")
async def ws_venue_alerts(websocket: WebSocket, venue_id: str):
    """
    Subscribe to events for a specific venue only.
    """
    await ws_manager.connect_venue(websocket, venue_id)
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping", "venue_id": venue_id}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, venue_id)
        logger.debug(f"WS venue {venue_id} client disconnected")
    except Exception as e:
        ws_manager.disconnect(websocket, venue_id)
        logger.warning(f"WS venue {venue_id} error: {e}")


@router.get("/stats")
async def ws_stats():
    """Return current WebSocket connection stats."""
    return ws_manager.stats()
