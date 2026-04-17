"""
Laminar - Plugin Registry
--------------------------
A lightweight plugin architecture that allows future services (custom detectors,
new alert channels, dashboard integrations) to be plugged in without touching core code.

Design:
  - PluginBase: Abstract base class all plugins must implement
  - PluginRegistry: Singleton that dispatches events to all registered plugins
  - Plugins register themselves at startup via register()
  - Two event types: on_crowd_metric and on_alert

This is a pure-Python architectural pattern — zero new packages needed.

Example Plugin:
    class SlackNotifierPlugin(PluginBase):
        name = "slack_notifier"
        async def on_alert(self, alert_data):
            await send_slack_message(alert_data["venue_name"], alert_data["risk_level"])

    plugin_registry.register(SlackNotifierPlugin())
"""

import asyncio
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Type
from datetime import datetime, timezone

from app.core.logging import get_logger

logger = get_logger(__name__)


# ─── Plugin Base Contract ──────────────────────────────────────────────────────

class PluginBase(ABC):
    """
    Abstract base class for all Laminar plugins.
    Plugins implement whichever hooks they need.
    Unimplemented hooks are no-ops by default.
    """

    name: str = "unnamed_plugin"
    version: str = "1.0.0"
    enabled: bool = True

    async def on_crowd_metric(self, metric_data: Dict[str, Any]) -> None:
        """Called after every CrowdMetric is processed."""
        pass

    async def on_alert(self, alert_data: Dict[str, Any]) -> None:
        """Called when a new CrowdAlert is created."""
        pass

    async def on_camera_health(self, health_data: Dict[str, Any]) -> None:
        """Called on camera health status changes."""
        pass

    async def on_behavior_detected(self, behavior_data: Dict[str, Any]) -> None:
        """Called when a behavior event is detected (loitering, running, etc.)."""
        pass

    async def on_startup(self) -> None:
        """Called once when the platform starts."""
        pass

    async def on_shutdown(self) -> None:
        """Called once when the platform shuts down."""
        pass

    def __repr__(self) -> str:
        return f"<Plugin: {self.name} v{self.version} enabled={self.enabled}>"


# ─── Plugin Registry ──────────────────────────────────────────────────────────

class PluginRegistry:
    """
    Central dispatcher for plugin events.
    Thread-safe (uses asyncio). Failures in one plugin don't affect others.
    """

    def __init__(self):
        self._plugins: List[PluginBase] = []
        self._startup_done = False

    def register(self, plugin: PluginBase) -> None:
        """Register a new plugin."""
        if not isinstance(plugin, PluginBase):
            raise TypeError(f"Plugin must subclass PluginBase, got {type(plugin)}")
        self._plugins.append(plugin)
        logger.info(f"PluginRegistry: Registered '{plugin.name}' v{plugin.version}")

    def unregister(self, plugin_name: str) -> bool:
        """Unregister a plugin by name."""
        before = len(self._plugins)
        self._plugins = [p for p in self._plugins if p.name != plugin_name]
        removed = len(self._plugins) < before
        if removed:
            logger.info(f"PluginRegistry: Unregistered '{plugin_name}'")
        return removed

    def list_plugins(self) -> List[Dict[str, Any]]:
        """Return info about all registered plugins."""
        return [
            {
                "name": p.name,
                "version": p.version,
                "enabled": p.enabled,
                "type": type(p).__name__,
            }
            for p in self._plugins
        ]

    async def startup(self) -> None:
        """Call on_startup() on all registered plugins."""
        if self._startup_done:
            return
        self._startup_done = True
        await self._dispatch_all("on_startup", {})

    async def shutdown(self) -> None:
        """Call on_shutdown() on all registered plugins."""
        await self._dispatch_all("on_shutdown", {})

    async def dispatch_metric(self, metric_data: Dict[str, Any]) -> None:
        """Dispatch a crowd metric event to all plugins."""
        await self._dispatch_all("on_crowd_metric", metric_data)

    async def dispatch_alert(self, alert_data: Dict[str, Any]) -> None:
        """Dispatch an alert event to all plugins."""
        await self._dispatch_all("on_alert", alert_data)

    async def dispatch_camera_health(self, health_data: Dict[str, Any]) -> None:
        """Dispatch camera health event to all plugins."""
        await self._dispatch_all("on_camera_health", health_data)

    async def dispatch_behavior(self, behavior_data: Dict[str, Any]) -> None:
        """Dispatch a behavior detection event to all plugins."""
        await self._dispatch_all("on_behavior_detected", behavior_data)

    async def dispatch(self, event_name: str, data: Dict[str, Any]) -> None:
        """Generic event dispatch. Calls on_<event_name> on all plugins that implement it."""
        await self._dispatch_all(f"on_{event_name}", data)

    async def dispatch_alert_status(self, status_data: Dict[str, Any]) -> None:
        """Dispatch an alert status change event (resolved, acknowledged) to all plugins."""
        await self._dispatch_all("on_alert_status_change", status_data)

    async def _dispatch_all(self, event_name: str, data: Dict[str, Any]) -> None:
        """
        Call event_name on all enabled plugins concurrently.
        Exceptions in individual plugins are caught and logged — never propagate.
        """
        enabled_plugins = [p for p in self._plugins if p.enabled]
        if not enabled_plugins:
            return

        async def safe_call(plugin: PluginBase) -> None:
            try:
                handler = getattr(plugin, event_name, None)
                if handler and callable(handler):
                    await handler(data)
            except Exception as e:
                logger.error(
                    f"PluginRegistry: Plugin '{plugin.name}' failed on '{event_name}': {e}"
                )

        await asyncio.gather(*[safe_call(p) for p in enabled_plugins], return_exceptions=True)


# ─── Singleton ─────────────────────────────────────────────────────────────────
plugin_registry = PluginRegistry()


# ─── Built-in Example Plugin: WebSocket Broadcaster ──────────────────────────

class WebSocketBroadcastPlugin(PluginBase):
    """
    Built-in plugin: Broadcasts alerts and metrics to all WebSocket subscribers.
    This replaces the need to manually call ws_manager in every service.
    """
    name = "websocket_broadcaster"
    version = "1.1.0"

    async def on_alert(self, alert_data: Dict[str, Any]) -> None:
        try:
            from app.api.v1.endpoints.websocket import ws_manager
            await ws_manager.broadcast(
                {
                    "type": "alert",
                    "data": alert_data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
                venue_id=alert_data.get("venue_id"),
            )
        except Exception as e:
            logger.debug(f"WebSocketBroadcastPlugin: Could not broadcast alert: {e}")

    async def on_alert_status_change(self, status_data: Dict[str, Any]) -> None:
        """Broadcast alert status changes (resolve/acknowledge) instantly via WS."""
        try:
            from app.api.v1.endpoints.websocket import ws_manager
            await ws_manager.broadcast(
                {
                    "type": "alert_status_change",
                    "data": status_data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
                venue_id=status_data.get("venue_id"),
            )
        except Exception as e:
            logger.debug(f"WebSocketBroadcastPlugin: Could not broadcast status change: {e}")

    async def on_crowd_metric(self, metric_data: Dict[str, Any]) -> None:
        """Broadcast ALL crowd metric updates to the surge monitor and live dashboards."""
        try:
            from app.api.v1.endpoints.websocket import ws_manager
            # Broadcast for ALL risk levels so surge monitor always gets live data
            await ws_manager.broadcast(
                {
                    "type": "metric_update",
                    "data": metric_data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
                venue_id=metric_data.get("venue_id"),
            )
        except Exception as e:
            logger.debug(f"WebSocketBroadcastPlugin: Could not broadcast metric: {e}")

    async def on_alert_escalated(self, escalation_data: Dict[str, Any]) -> None:
        """Broadcast escalated alerts."""
        try:
            from app.api.v1.endpoints.websocket import ws_manager
            await ws_manager.broadcast(
                {
                    "type": "alert_escalated",
                    "data": escalation_data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
                venue_id=escalation_data.get("venue_id"),
            )
        except Exception as e:
            logger.debug(f"WebSocketBroadcastPlugin: Could not broadcast escalation: {e}")


# Register the built-in WebSocket broadcaster plugin on import
plugin_registry.register(WebSocketBroadcastPlugin())
