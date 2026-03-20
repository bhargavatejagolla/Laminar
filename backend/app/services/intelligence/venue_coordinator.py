"""
Laminar Phase 2 - Venue Intelligence Coordinator
---------------------------------------------

Groups real-time pipeline snapshots from independent camera StreamWorkers 
by their physical venue.

This enables evaluating the actual situation of a physical space, not just 
an isolated camera angle, solving the "two cameras pointing at the same place" 
correlation problem.
"""

from typing import Dict, Any, List, Optional
import time

from app.core.logging import get_logger

logger = get_logger(__name__)


class VenueIntelligenceCoordinator:
    """
    Singleton system that sits above the Camera/Zone Orchestrators.
    """

    def __init__(self):
        # venue_id -> {
        #    camera_id: { "snapshot": dict, "timestamp": float }
        # }
        self._venues: Dict[str, Dict[str, Any]] = {}

    def publish_snapshot(self, venue_id: str, camera_id: str, snapshot: Dict[str, Any]) -> None:
        """Receive a snapshot directly from a StreamWorker."""
        if not venue_id:
            return

        if venue_id not in self._venues:
            self._venues[venue_id] = {}

        self._venues[venue_id][camera_id] = {
            "snapshot": snapshot,
            "timestamp": time.time(),
        }

    def correlate_venue(self, venue_id: str, venue_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Evaluate physical-level risk by combining multiple active camera feeds.
        """
        if venue_id not in self._venues:
            return {}

        now = time.time()
        active_cameras = []
        total_density = 0
        max_risk = "low"
        alert_types = set()
        
        # Risk ordering for comparison
        risk_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        sustain_window = venue_config.get("correlation_window_secs", 30.0) if venue_config else 30.0

        # Gather active signals 
        for cam_id, data in list(self._venues[venue_id].items()):
            if now - data["timestamp"] > sustain_window:
                # Prune dead/disconnected cameras
                del self._venues[venue_id][cam_id]
                continue
                
            snap = data["snapshot"]
            active_cameras.append(cam_id)
            
            density = snap.get("density", {}).get("current", 0)
            total_density += density
            
            # Map risk level safely
            sn_risk = snap.get("intelligence", {}).get("overall_risk_level", "low").lower()
            if risk_order.get(sn_risk, 0) > risk_order.get(max_risk, 0):
                max_risk = sn_risk

            # Collect smart alerts
            ext = snap.get("intelligence", {})
            al_type = ext.get("alert_type")
            if al_type:
                alert_types.add(al_type)

        return {
            "venue_id": venue_id,
            "active_cameras_count": len(active_cameras),
            "total_venue_density": total_density,
            "highest_risk_level": max_risk,
            "active_alert_types": list(alert_types),
            "multi_camera_escalation": len(alert_types) > 1 and max_risk == "critical",
        }

# Global singleton
venue_coordinator = VenueIntelligenceCoordinator()
