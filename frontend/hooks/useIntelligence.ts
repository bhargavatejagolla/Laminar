/**
 * useIntelligence - Hook for Laminar AI Intelligence Engine
 * 
 * Fetches structured operational intelligence reports from the backend.
 * Supports per-venue analysis and system-wide intelligence overview.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export interface IntelligenceReport {
  venue_id?: string;
  situation_analysis: string;
  observed_trends: string;
  risk_assessment: string;
  predicted_outcome: string;
  recommended_actions: string[];
  cross_camera_insights?: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: "high" | "moderate" | "low";
  generated_by: string;
  timestamp: string;
}

export interface SystemIntelligence {
  system_status: "nominal" | "alert" | "elevated" | "critical";
  total_venues: number;
  total_crowd_estimate: number;
  active_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  alert_summary: string;
  monitored_venues: string[];
  intelligence_engine: {
    status: string;
    model: string;
    llm_online: boolean;
  };
  timestamp: string;
}

/**
 * Get a full operational intelligence report for a specific venue.
 * Powered by Llama 3.2 with rule-based fallback.
 */
export function useVenueIntelligence(venueId?: string) {
  return useQuery<IntelligenceReport>({
    queryKey: ["intelligence", "venue", venueId],
    queryFn: async () => {
      const { data } = await api.get(`/intelligence/venue/${venueId}`);
      return data;
    },
    enabled: !!venueId,
    refetchInterval: 30_000, // Refresh every 30 seconds for live intelligence
    retry: 1,
  });
}

/**
 * Get system-wide intelligence overview across all venues.
 */
export function useSystemIntelligence() {
  return useQuery<SystemIntelligence>({
    queryKey: ["intelligence", "system"],
    queryFn: async () => {
      const { data } = await api.get("/intelligence/system");
      return data;
    },
    refetchInterval: 15_000, // Refresh every 15 seconds
    retry: 1,
  });
}
