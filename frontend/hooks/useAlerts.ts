import { useQuery } from "@tanstack/react-query"
import { getAlerts } from "@/services/alert.service"
import { Alert } from "@/types/alert"

/**
 * Hook to fetch and filter alerts.
 * Notification side-effects (sounds, toasts) are handled globally by useGlobalNotifications.
 */
export function useAlerts() {
  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    refetchInterval: 5000,
  });

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