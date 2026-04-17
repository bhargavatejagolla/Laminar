"use client";

import { useEffect, useRef } from "react";
import { useAlerts } from "./useAlerts";
import { useZoneIntelligenceSummary } from "./useZoneIntelligence";
import { useAlertStream } from "@/src/hooks/useAlertStream";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "i18next";
import { Alert } from "@/types/alert";

/**
 * Single hook to manage all global notifications (Sounds + Toasts).
 * Call this once in the Dashboard Layout.
 */
export function useGlobalNotifications() {
  const { data: alertsData } = useAlerts();
  const { data: summary } = useZoneIntelligenceSummary(3000);
  const queryClient = useQueryClient();
  
  const prevAlertIdKey = useRef<string | null>(null);
  const prevDwellMetrics = useRef<Record<string, { dwell: number; stagnation: number }>>({});
  const isInitialized = useRef(false);

  // ── WebSocket Integration ────────────────────────────────────────────────
  // Bridge the live WebSocket stream to the React Query cache
  useAlertStream({
    onAlert: () => {
      // Instant invalidation on new alert
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
    onCrossCamera: () => {
      // Refresh journeys if a cross-camera event occurs
      queryClient.invalidateQueries({ queryKey: ["journeys"] });
    },
    onStatusChange: (data) => {
      // Instant refresh when any alert is auto-resolved, auto-acknowledged, or escalated
      queryClient.invalidateQueries({ queryKey: ["alerts"] });

      // Show live feedback toasts for status changes
      if (data.status === "resolved") {
        const isAuto = data.auto !== false;
        toast.success(
          isAuto
            ? "✅ AI Auto-Resolved Alert"
            : "✅ Alert Resolved",
          {
            description: isAuto
              ? (data.notes || `AI live-feed confirmed crowd levels are safe (${data.risk_level?.toUpperCase() ?? "—"} risk cleared).`)
              : `Alert manually resolved.`,
            duration: 5000,
            className:
              "bg-emerald-950/90 border border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]",
          }
        );
      } else if (data.status === "acknowledged" && data.auto) {
        toast.info("🤖 Alert Auto-Acknowledged", {
          description: "AI system acknowledged this alert while monitoring continues.",
          duration: 4000,
          className:
            "bg-blue-950/90 border border-blue-500 shadow-[0_0_16px_rgba(59,130,246,0.25)]",
        });
      }
    },
  });

  // 1. Alert Notifications
  useEffect(() => {
    if (!alertsData) return;

    const crowdAlerts = alertsData.filter((a: Alert) => (!a.extra_data || a.extra_data.type !== "camera_issue"));
    const latestAlert = crowdAlerts.length > 0 
      ? crowdAlerts.reduce((latest: Alert, current: Alert) => {
          const lTime = latest.last_notified_at ? new Date(latest.last_notified_at) : new Date(latest.created_at);
          const cTime = current.last_notified_at ? new Date(current.last_notified_at) : new Date(current.created_at);
          return cTime > lTime ? current : latest;
        }, crowdAlerts[0]) 
      : null;

    const latestKey = latestAlert ? `${latestAlert.id}-${latestAlert.last_notified_at || latestAlert.created_at}` : null;

    if (!isInitialized.current) {
      prevAlertIdKey.current = latestKey;
      isInitialized.current = true;
      return;
    }

    if (latestKey && latestKey !== prevAlertIdKey.current) {
      playAlertSound();
      showAlertToast(latestAlert!, crowdAlerts.length);
      prevAlertIdKey.current = latestKey;
    }
  }, [alertsData]);

  // 2. Dwell / Stagnation Notifications
  useEffect(() => {
    if (!summary?.cameras) return;

    let shouldTrigger = false;
    const currentDwell: Record<string, number> = {};

    summary.cameras.forEach((cam) => {
      const dwellCount = cam.snapshot?.dwell?.long_dwell_count || 0;
      const stagnation = cam.snapshot?.dwell?.stagnation_score || 0;
      currentDwell[cam.camera_id] = dwellCount;

      const prev = prevDwellMetrics.current[cam.camera_id];
      const prevCount = prev?.dwell || 0;
      const prevStagnation = prev?.stagnation || 0;

      if (dwellCount > prevCount) {
        shouldTrigger = true;
        showDwellToast(cam.camera_name || cam.camera_id, dwellCount);
      } else if (stagnation > 0.6 && prevStagnation <= 0.6) {
        shouldTrigger = true;
        showStagnationToast(cam.camera_name || cam.camera_id, stagnation);
      }
    });

    if (shouldTrigger && isInitialized.current) {
      playAlertSound();
    }

    // Update prevDwellMetrics with both values
    const newMetrics: Record<string, { dwell: number; stagnation: number }> = {};
    summary.cameras.forEach(c => {
      newMetrics[c.camera_id] = { 
        dwell: c.snapshot?.dwell?.long_dwell_count || 0,
        stagnation: c.snapshot?.dwell?.stagnation_score || 0
      };
    });
    prevDwellMetrics.current = newMetrics;
  }, [summary]);

  // --- Helpers ---

  function playAlertSound() {
    try {
      const audio = new Audio("/notfication-sound.wav");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      console.error("Sound play failed", e);
    }
  }

  function showDwellToast(camName: string, count: number) {
    const t = i18n.t.bind(i18n);
    toast.warning(`${t("notifications.dwellAlert")}: ${camName}`, {
      description: t("notifications.dwellDescription", { count }),
      duration: 5000,
      className: "bg-orange-950/90 border border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)]"
    });
  }

  function showStagnationToast(camName: string, score: number) {
    const t = i18n.t.bind(i18n);
    toast.error(`${t("notifications.stagnationAlert")}: ${camName}`, {
      description: t("notifications.stagnationDescription", { score: Math.round(score * 100) }),
      duration: 7000,
      className: "bg-rose-950/90 border border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]"
    });
  }

  function showAlertToast(alert: Alert, activeCount: number) {
    const t = i18n.t.bind(i18n);
    const isCritical = alert.risk_level === "critical" || (alert.extra_data && JSON.stringify(alert.extra_data).includes("SURGE"));
    
    // Rich insights mapping
    const velocityRaw = alert.extra_data?.velocity;
    const velocity = (velocityRaw !== undefined && velocityRaw !== null) ? Math.round(velocityRaw) + " px/s" : "0 px/s";
    const predictionLevel = alert.predicted_level
      ? alert.predicted_level.toUpperCase()
      : (alert.extra_data?.predicted_level
          ? String(alert.extra_data.predicted_level).toUpperCase()
          : alert.risk_level?.toUpperCase() || "Unknown");
    const escProb = alert.escalation_probability ?? alert.extra_data?.escalation_probability;
    const probStr = escProb ? ` (${Math.round(Number(escProb) * 100)}%)` : "";
    const prediction = `${predictionLevel}${probStr}`;
    const explanation = alert.explanation || alert.extra_data?.reason || alert.extra_data?.explanation || "AI analysis in progress…";
    const venueName = alert.extra_data?.camera_location || (alert.venue_id ? `Zone ${alert.venue_id.slice(0, 6).toUpperCase()}` : "Unknown Venue");


    const title = isCritical ? `🚨 CRITICAL ESCALATION: ${venueName}` : `⚠️ ALERT UPDATE: ${venueName}`;
    const backendRoute = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/v1$/, '') || 'http://localhost:8000';
    
    // Create rich description
    const desc = (
      <div className="flex flex-col gap-2 mt-1">
        <div className="text-[11px] leading-snug font-medium text-white/90">
          {explanation}
        </div>
        {alert.snapshot_url && (
            <div className="relative mt-2 rounded border border-white/10 overflow-hidden shadow-inner">
               <img src={`${backendRoute}${alert.snapshot_url}`} className="w-full h-auto object-cover opacity-100" alt="Visual Intelligence Evidence" />
            </div>
        )}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="bg-black/40 rounded px-2 py-1.5 border border-white/5">
            <span className="text-[8px] uppercase tracking-widest text-slate-400 block">Speed/Velocity</span>
            <span className="text-[10px] font-mono text-cyan-400 font-bold">{velocity}</span>
          </div>
          <div className="bg-black/40 rounded px-2 py-1.5 border border-white/5">
            <span className="text-[8px] uppercase tracking-widest text-slate-400 block">AI Prediction</span>
            <span className={`text-[10px] font-mono font-bold ${prediction === "CRITICAL" ? "text-rose-400" : "text-amber-400"}`}>{prediction}</span>
          </div>
        </div>
        {alert.extra_data?.recommended_action && (
          <div className="mt-1 bg-emerald-950/40 border border-emerald-500/20 px-2 py-1.5 rounded">
            <span className="text-[8px] uppercase tracking-widest text-emerald-500 block mb-0.5">Recommended Action</span>
            <span className="text-[10px] text-emerald-400">{alert.extra_data.recommended_action}</span>
          </div>
        )}
      </div>
    ) as any; // Using valid JSX for Sonner description

    if (isCritical) {
      toast.error(title, {
        description: desc,
        duration: Number.POSITIVE_INFINITY, // Keep critical visible
        className: "bg-[#2a0e14]/95 border border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.4)] backdrop-blur-xl",
        action: { label: "VIEW CAMERAS", onClick: () => window.location.href = "/alerts" }
      });
    } else {
      toast.warning(title, {
        description: desc,
        duration: 10000,
        className: "bg-[#1a1309]/95 border border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.3)] backdrop-blur-xl",
        action: { label: "VIEW DETAILS", onClick: () => window.location.href = "/alerts" }
      });
    }
  }
}
