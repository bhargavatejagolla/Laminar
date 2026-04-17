"use client";

/**
 * Laminar - useAlertStream Hook
 * --------------------------------
 * React hook that provides real-time alert events via WebSocket.
 * Falls back to polling if WebSocket connection fails.
 *
 * Key stability goals:
 * - Do not recreate the WebSocket just because callback props change
 * - Ensure only one reconnect timer + one socket exists at any time
 * - Close the socket on unmount and stop all timers/polling
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface StreamAlert {
  id: string;
  type: string;
  venue_id?: string;
  risk_level?: string;
  severity?: number;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface StreamMetric {
  venue_id?: string;
  camera_id?: string;
  risk_level?: string;
  person_count?: number;
  velocity?: number;
  variance?: number;
  latest_risk_score?: number;
  [key: string]: unknown;
}

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "polling";

interface UseAlertStreamOptions {
  venueId?: string;
  maxAlerts?: number;
  onAlert?: (alert: StreamAlert) => void;
  onCrossCamera?: (data: any) => void;
  onMetricUpdate?: (metric: StreamMetric) => void;
  onStatusChange?: (data: { id: string; status: string; risk_level: string; auto: boolean; notes?: string }) => void;
  enabled?: boolean;
}

const BASE_WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
    : "ws://localhost:8000");

function normalizeWsOrigin(raw: string): string {
  // Accept env values like ws(s)://host OR ws(s)://host/api/v1/ws
  return raw
    .replace(/\/api\/v1\/ws\/?$/, "")
    .replace(/\/api\/v1\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "");
}
const MAX_RECONNECT_DELAY_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;

export function useAlertStream({
  venueId,
  maxAlerts = 50,
  onAlert,
  onCrossCamera,
  onMetricUpdate,
  onStatusChange,
  enabled = true,
}: UseAlertStreamOptions = {}) {
  const [alerts, setAlerts] = useState<StreamAlert[]>([]);
  const [latestMetric, setLatestMetric] = useState<StreamMetric | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingCleanupRef = useRef<null | (() => void)>(null);

  const seenIds = useRef<Set<string>>(new Set());
  const reconnectDelay = useRef(1000);
  const unmounted = useRef(false);

  // Keep these stable; changing callbacks should not trigger WS reconnect.
  const onAlertRef = useRef<UseAlertStreamOptions["onAlert"]>(onAlert);
  const onCrossCameraRef = useRef<UseAlertStreamOptions["onCrossCamera"]>(onCrossCamera);
  const onMetricUpdateRef = useRef<UseAlertStreamOptions["onMetricUpdate"]>(onMetricUpdate);
  const onStatusChangeRef = useRef<UseAlertStreamOptions["onStatusChange"]>(onStatusChange);
  const maxAlertsRef = useRef<number>(maxAlerts);

  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    onCrossCameraRef.current = onCrossCamera;
  }, [onCrossCamera]);

  useEffect(() => {
    onMetricUpdateRef.current = onMetricUpdate;
  }, [onMetricUpdate]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    maxAlertsRef.current = maxAlerts;
  }, [maxAlerts]);

  const addAlert = useCallback((alert: StreamAlert) => {
    const id = alert.id || `${alert.type}_${Date.now()}`;
    if (seenIds.current.has(id)) return;
    seenIds.current.add(id);

    // prevent unbounded memory
    if (seenIds.current.size > 500) {
      const first = seenIds.current.values().next().value;
      if (first) seenIds.current.delete(first);
    }

    setAlerts((prev) => [alert, ...prev].slice(0, maxAlertsRef.current));
    onAlertRef.current?.(alert);
  }, []);

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setTimeout(() => {
      wsRef.current?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  }, []);

  const startPollingFallback = useCallback(() => {
    const interval = setInterval(async () => {
      if (unmounted.current) {
        clearInterval(interval);
        return;
      }
      try {
        const { getAlerts } = await import("@/services/alert.service");
        const data = await getAlerts();
        const items: StreamAlert[] = Array.isArray(data)
          ? data
          : (data.items || data.alerts || []);
        items.forEach(addAlert);
      } catch {
        // silent
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [addAlert]);

  const cleanupTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || unmounted.current) return;

    // One socket at a time.
    cleanupTimers();
    try {
      wsRef.current?.close();
    } catch {
      // ignore
    }

    const wsPath = venueId ? `/api/v1/ws/alerts/${venueId}` : "/api/v1/ws/alerts";
    const url = `${normalizeWsOrigin(BASE_WS_URL)}${wsPath}`;

    setConnectionState("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setConnectionState("failed");
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) {
        try { ws.close(); } catch {}
        return;
      }

      setConnectionState("connected");
      setConnected(true);
      reconnectDelay.current = 1000;

      // stop polling if it was enabled
      pollingCleanupRef.current?.();
      pollingCleanupRef.current = null;

      resetHeartbeat();
    };

    ws.onmessage = (event) => {
      resetHeartbeat();
      try {
        const data = JSON.parse(event.data);
        if (data?.type === "ping") return;

        if (data?.type === "alert" && data.data) {
          addAlert(data.data);
        } else if (data?.type === "journey_cross_camera" && data.data) {
          onCrossCameraRef.current?.(data.data);
        } else if ((data?.type === "live_metrics" || data?.type === "metric_update") && data.data) {
          // Live metric update — update surge monitor in real-time
          setLatestMetric(data.data);
          onMetricUpdateRef.current?.(data.data);
        } else if ((data?.type === "alert_status_change" || data?.type === "alert_escalated") && data.data) {
          // Alert status changed (resolved/acknowledged/escalated) — notify consumers
          onStatusChangeRef.current?.(data.data);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;

      setConnected(false);
      setConnectionState("reconnecting");

      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }

      reconnectTimerRef.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY_MS);

        // If we reached max backoff, switch to polling once.
        if (reconnectDelay.current >= MAX_RECONNECT_DELAY_MS && !pollingCleanupRef.current) {
          setConnectionState("polling");
          pollingCleanupRef.current = startPollingFallback();
          return;
        }

        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      try { ws.close(); } catch {}
    };
  }, [enabled, venueId, addAlert, resetHeartbeat, cleanupTimers, startPollingFallback]);

  useEffect(() => {
    unmounted.current = false;

    if (!enabled) {
      setConnected(false);
      setConnectionState("failed");
      return;
    }

    connect();

    return () => {
      unmounted.current = true;

      cleanupTimers();

      pollingCleanupRef.current?.();
      pollingCleanupRef.current = null;

      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [connect, enabled, cleanupTimers]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    seenIds.current.clear();
  }, []);

  return {
    alerts,
    latestMetric,
    connected,
    connectionState,
    clearAlerts,
  };
}

