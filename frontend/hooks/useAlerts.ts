import { useQuery } from "@tanstack/react-query"
import { getAlerts } from "@/services/alert.service"
import { Alert } from "@/types/alert"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import i18n from "i18next"

export function useAlerts() {
  const previousLatestAlertId = useRef<string | null>(null);
  const previousCameraKey = useRef<string | null>(null);
  const isInitialized = useRef<boolean>(false);

  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!query.data) return;

    // Separate crowd alerts from camera health issues
    const crowdAlerts = query.data.filter((a: Alert) => a.status !== "resolved" && (!a.extra_data || a.extra_data.type !== "camera_issue"));
    const cameraAlerts = query.data.filter((a: Alert) => a.status !== "resolved" && a.extra_data?.type === "camera_issue");
    
    const currentCount = crowdAlerts.length;

    // Find the latest active alert based on last_notified_at OR created_at
    const latestAlert = crowdAlerts.length > 0 
      ? crowdAlerts.reduce((latest: Alert, current: Alert) => {
          const lTime = latest.last_notified_at ? new Date(latest.last_notified_at) : new Date(latest.created_at);
          const cTime = current.last_notified_at ? new Date(current.last_notified_at) : new Date(current.created_at);
          return cTime > lTime ? current : latest;
        }, crowdAlerts[0]) 
      : null;
      
    // Separate check for latest camera alert
    const latestCameraAlert = cameraAlerts.length > 0
      ? cameraAlerts.reduce((latest: Alert, current: Alert) => {
          const lTime = new Date(latest.created_at);
          const cTime = new Date(current.created_at);
          return cTime > lTime ? current : latest;
        }, cameraAlerts[0])
      : null;

    // Use a composite key of ID + last_notified_at to detect updates
    const latestKey = latestAlert 
      ? `${latestAlert.id}-${latestAlert.last_notified_at || latestAlert.created_at}` 
      : null;

    if (!isInitialized.current) {
      previousLatestAlertId.current = latestKey;
      isInitialized.current = true;
      return; 
    }

    // Trigger notification if there's a new or escalated alert
    if (latestKey && latestKey !== previousLatestAlertId.current) {
      const mostRecent = latestAlert;

      // Play notification sound
      try {
        const audio = new Audio("/ping.wav");
        audio.volume = 0.6;
        audio.play().catch(() => {});
      } catch {}

      // Browser push notification if permitted
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("🚨 Laminar Alert", {
          body: `New alert generated: ${mostRecent?.risk_level?.toUpperCase()} risk — ${currentCount} active`,
          icon: "/favicon.ico",
        });
      }

      const isCritical = mostRecent?.risk_level === "critical" || mostRecent?.predicted_level === "critical";
      const isHigh = mostRecent?.risk_level === "high";
      const isSurge = mostRecent?.extra_data && JSON.stringify(mostRecent.extra_data).includes("SURGE");
      
      // Determine severity and visual traits
      const isUltraCritical = isCritical || isSurge;
      const t = i18n.t.bind(i18n);
      
      const title = isSurge 
         ? `🚨 ${t("notifications.surgeIncident")}` 
         : (isUltraCritical ? `🚨 ${t("notifications.criticalEscalation")}` : `⚠️ ${t("notifications.alertUpdate")}`);

      const desc = isUltraCritical
          ? `${t("notifications.autoDispatchMsg")} (${currentCount} ${t("notifications.activeAlerts")})`
          : `${mostRecent?.risk_level?.toUpperCase()} ${t("notifications.riskDetected")} — ${currentCount} ${t("notifications.activeAlerts")} ${t("notifications.total")}`;

      const actionOpts = {
        label: t("notifications.viewAction"),
        onClick: () => { window.location.href = "/alerts"; },
      };

      if (isUltraCritical) {
        toast.error(title, {
          description: desc,
          duration: Number.POSITIVE_INFINITY, // Require manual dismissal
          className: "bg-red-950/90 border border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-pulse",
          action: actionOpts,
        });
      } else if (isHigh) {
        toast.warning(title, {
          description: desc,
          duration: 10000,
          className: "bg-orange-950/90 border-orange-500",
          action: actionOpts,
        });
      } else {
        toast.info(title, {
          description: desc,
          duration: 5000,
          action: actionOpts,
        });
      }

      previousLatestAlertId.current = latestKey;
    }

    // Handle Camera Health Notification separately
    // For now, let's just make sure camera issues don't trigger the red toast.


    previousLatestAlertId.current = latestKey;

  }, [query.data]);

  return {
    ...query,
    crowdAlerts: query.data?.filter((a: Alert) => a.status !== "resolved" && (!a.extra_data || a.extra_data.type !== "camera_issue")) || [],
    cameraAlerts: query.data?.filter((a: Alert) => a.status !== "resolved" && a.extra_data?.type === "camera_issue") || []
  };
}

// Request browser notification permission on first use
export function requestNotificationPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }
}