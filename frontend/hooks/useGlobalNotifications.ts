"use client";

import { useEffect, useRef } from "react";
import { useAlerts } from "./useAlerts";
import { useZoneIntelligenceSummary } from "./useZoneIntelligence";
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
  
  const prevAlertIdKey = useRef<string | null>(null);
  const prevDwellMetrics = useRef<Record<string, { dwell: number; stagnation: number }>>({});
  const isInitialized = useRef(false);

  // 1. Alert Notifications
  useEffect(() => {
    if (!alertsData) return;

    const crowdAlerts = alertsData.filter((a: Alert) => a.status !== "resolved" && (!a.extra_data || a.extra_data.type !== "camera_issue"));
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
    
    const title = isCritical ? `🚨 ${t("notifications.criticalEscalation")}` : `⚠️ ${t("notifications.alertUpdate")}`;
    
    // Detailed description with velocity if available
    let desc = t("notifications.alertActiveCount", { count: activeCount });
    if (isCritical && alert.extra_data?.velocity) {
      desc = t("notifications.surgeDescription", { 
        velocity: Math.round(alert.extra_data.velocity), 
        level: alert.risk_level?.toUpperCase() 
      });
    }

    if (isCritical) {
      toast.error(title, {
        description: desc,
        duration: Number.POSITIVE_INFINITY, // Keep critical visible
        className: "bg-red-950/90 border border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]",
        action: { label: t("notifications.viewAction"), onClick: () => window.location.href = "/alerts" }
      });
    } else {
      toast.warning(title, {
        description: desc,
        duration: 8000,
        action: { label: t("notifications.viewAction"), onClick: () => window.location.href = "/alerts" }
      });
    }
  }
}
