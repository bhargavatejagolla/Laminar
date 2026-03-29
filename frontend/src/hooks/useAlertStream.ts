"use client";

/**
 * Laminar - useAlertStream Hook
 * --------------------------------
 * React hook that provides real-time alert events via WebSocket.
 * Falls back to polling if WebSocket connection fails.
 *
 * Features:
 *   - Auto-reconnect with exponential backoff (max 30s)
 *   - Venue-specific or global subscription
 *   - Heartbeat detection (disconnects if no ping in 90s)
 *   - Falls back transparently to polling on WS failure
 *   - Deduplication of alert events by id
 *
 * Usage:
 *   const { alerts, connected, connectionState } = useAlertStream();
 *   const { alerts } = useAlertStream({ venueId: "abc-123" });
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
  enabled?: boolean;
}

const BASE_WS_URL = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== "undefined" ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}` : "ws://localhost:8000");
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const MAX_RECONNECT_DELAY_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;

export function useAlertStream({
  venueId,
  maxAlerts = 50,
  onAlert,
  onCrossCamera,
  enabled = true,
}: UseAlertStreamOptions = {}) {
  const [alerts, setAlerts] = useState<StreamAlert[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const reconnectDelay = useRef(1000);
  const unmounted = useRef(false);

  // ── Seen-ID dedup ─────────────────────────────────────────────────────────
  const addAlert = useCallback((alert: StreamAlert) => {
    const id = alert.id || `${alert.type}_${Date.now()}`;
    if (seenIds.current.has(id)) return;
    seenIds.current.add(id);
    if (seenIds.current.size > 500) {
      const [first] = seenIds.current;
      seenIds.current.delete(first);
    }

    setAlerts(prev => [alert, ...prev].slice(0, maxAlerts));
    onAlert?.(alert);
  }, [maxAlerts, onAlert]);

  // ── Reset heartbeat timer ─────────────────────────────────────────────────
  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setTimeout(() => {
      wsRef.current?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!enabled || unmounted.current) return;

    const wsPath = venueId
      ? `/api/v1/ws/alerts/${venueId}`
      : "/api/v1/ws/alerts";
    const url = `${BASE_WS_URL}${wsPath}`;

    setConnectionState("connecting");

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted.current) { ws.close(); return; }
        setConnectionState("connected");
        setConnected(true);
        reconnectDelay.current = 1000;
        resetHeartbeat();
      };

      ws.onmessage = (event) => {
        resetHeartbeat();
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ping") return; // Heartbeat — ignore

          if (data.type === "alert" && data.data) {
            addAlert(data.data);
          } else if (data.type === "journey_cross_camera" && data.data) {
            onCrossCamera?.(data.data);
          } else if (data.type === "metric_update") {
            // Optional: expose metric updates too
          }
        } catch {
          /* ignore malformed messages */
        }
      };

      ws.onclose = () => {
        if (unmounted.current) return;
        setConnected(false);
        setConnectionState("reconnecting");

        // Exponential backoff reconnect
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelay.current = Math.min(
            reconnectDelay.current * 2,
            MAX_RECONNECT_DELAY_MS
          );
          connect();
        }, reconnectDelay.current);
      };

      ws.onerror = () => {
        ws.close();
        // After too many retries, fall back to polling
        if (reconnectDelay.current >= MAX_RECONNECT_DELAY_MS) {
          setConnectionState("polling");
          startPollingFallback();
        }
      };
    } catch {
      // WebSocket not available (SSR)
      setConnectionState("failed");
    }
  }, [enabled, venueId, addAlert, resetHeartbeat]);

  // ── Polling fallback ──────────────────────────────────────────────────────
  const startPollingFallback = useCallback(() => {
    const interval = setInterval(async () => {
      if (unmounted.current) { clearInterval(interval); return; }
      try {
        const token = typeof window !== "undefined"
          ? localStorage.getItem("access_token")
          : null;
        const res = await fetch(
          `${API_BASE}/api/v1/alerts?status=open&page=1&page_size=10`,
          { headers: { Authorization: token ? `Bearer ${token}` : "" } }
        );
        if (res.ok) {
          const json = await res.json();
          const items: StreamAlert[] = json.items || json.alerts || [];
          items.forEach(addAlert);
        }
      } catch {
        /* silent */
      }
    }, 30_000); // Poll every 30s as fallback
    return () => clearInterval(interval);
  }, [addAlert]);

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      wsRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    };
  }, [connect]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    seenIds.current.clear();
  }, []);

  return {
    alerts,
    connected,
    connectionState,
    clearAlerts,
  };
}
