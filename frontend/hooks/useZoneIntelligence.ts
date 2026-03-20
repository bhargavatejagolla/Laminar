import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

// These interface fields match the JSON keys from the backend's ZoneIntelligenceSnapshot.to_dict()
export interface ZoneIntelligenceDensity {
  current: number;         // current_density → serialized as "current"
  smoothed: number;        // smoothed_density → serialized as "smoothed"
  rate_per_min: number;    // rate_of_change_per_min → serialized as "rate_per_min"
  projected_2min: number;
  projected_5min: number;
  trend: "increasing" | "decreasing" | "stable" | "volatile";
  surge_intensity: "low" | "medium" | "high" | "critical";
}

export interface ZoneIntelligenceDwell {
  avg_seconds: number;     // avg_dwell_seconds → serialized as "avg_seconds"
  max_seconds: number;     // max_dwell_seconds → serialized as "max_seconds"
  long_dwell_count: number;
  group_dwell_detected: boolean;
  group_dwell_zones: string[];
  zone_status: "normal" | "gathering" | "stagnant";
  stagnation_score: number;
  distribution: { short: number; medium: number; long: number };
}

export interface ZoneIntelligenceFlow {
  dominant_direction: string;
  distribution: Record<string, number>;
  stationary_ratio: number;
  flow_intensity: "still" | "trickle" | "flowing" | "rushing";
  avg_speed_px_per_frame: number;
}

export interface ZoneIntelligencePrediction {
  density_5m: number;      // pred_density_5m → serialized as "density_5m"
  density_10m: number;     // pred_density_10m → serialized as "density_10m"
  time_to_critical_min: number | null;
  trend: string;           // predicted_trend → serialized as "trend"
  confidence: number;
}

export interface ZoneIntelligenceResult {
  overall_risk_level: "low" | "medium" | "high" | "critical";
  summary: string;
  alert_triggered: boolean;
  alert_type: string | null;
  alert_reason: string | null;
  recommended_action: string | null;
  contributing_factors: string[];
}

export interface ZoneIntelligenceSnapshot {
  camera_id: string;
  zone_id: string;
  timestamp: string;
  density: ZoneIntelligenceDensity;
  dwell: ZoneIntelligenceDwell;
  flow: ZoneIntelligenceFlow;
  prediction: ZoneIntelligencePrediction;
  intelligence: ZoneIntelligenceResult;
}

/**
 * Represents one camera entry as returned from the /intelligence/summary endpoint.
 * Backend shape: { camera_id, camera_name, venue_name, status, snapshot: ZoneIntelligenceSnapshot | null }
 */
export interface CameraIntelligenceEntry {
  camera_id: string;
  camera_name?: string;
  venue_name?: string;
  status: "active" | "warming_up" | "offline";
  snapshot: ZoneIntelligenceSnapshot | null;
}

export interface ZoneIntelligenceSummary {
  total_cameras: number;
  active_cameras: number;
  recent_alerts: number;
  risk_breakdown: Record<"low" | "medium" | "high" | "critical", number>;
  cameras: CameraIntelligenceEntry[];
}

/**
 * Hook to stream the high-frequency zone intelligence summary containing all cameras.
 */
export function useZoneIntelligenceSummary(refetchInterval = 2000) {
  return useQuery<ZoneIntelligenceSummary>({
    queryKey: ["zone-intelligence-summary"],
    queryFn: async () => {
      const { data } = await api.get("/intelligence/summary");
      return (
        data ?? {
          total_cameras: 0,
          active_cameras: 0,
          recent_alerts: 0,
          risk_breakdown: { low: 0, medium: 0, high: 0, critical: 0 },
          cameras: [],
        }
      );
    },
    refetchInterval,
  });
}

/**
 * Hook to stream intelligence for a single specific camera.
 */
export function useZoneIntelligenceCamera(cameraId?: string, refetchInterval = 2000) {
  return useQuery<ZoneIntelligenceSnapshot>({
    queryKey: ["zone-intelligence-camera", cameraId],
    queryFn: async () => {
      const { data } = await api.get(`/intelligence/camera/${cameraId}`);
      // Backend wraps snapshot in { camera_id, status, snapshot: {...} }
      return data?.snapshot ?? data;
    },
    enabled: !!cameraId,
    refetchInterval,
  });
}
