import { useQuery } from "@tanstack/react-query"
import { getAlerts } from "@/services/alert.service"
import { Alert } from "@/types/alert"

/**
 * Hook to fetch and filter alerts.
 * Alerts are primarily driven by WebSocket invalidations (via useGlobalNotifications).
 * Polling is a 30s fallback only -- should not be the primary update mechanism.
 */
export function useAlerts() {
  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    refetchInterval: 30_000,    // 30s fallback; WS pushes handle instant updates
    refetchOnWindowFocus: true, // Refresh when user tabs back
    staleTime: 5_000,           // Consider data fresh for 5s to reduce redundant fetches
  });

  return {
    ...query,
    crowdAlerts: query.data?.filter((a: Alert) => (!a.extra_data || a.extra_data.type !== "camera_issue")) || [],
    cameraAlerts: query.data?.filter((a: Alert) => a.extra_data?.type === "camera_issue") || []
  };
}

// Request browser notification permission on first use
export function requestNotificationPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }
}