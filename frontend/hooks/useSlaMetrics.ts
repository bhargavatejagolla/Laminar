"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export interface PlatformSlaMetrics {
  generated_at: string;
  period_days: number;
  venues_analyzed: number;
  total_alerts: number;
  total_acknowledged: number;
  platform_sla_compliance_pct: number | null;
  platform_mttd_seconds: number | null;
  platform_mtta_seconds: number | null;
}

export function useSlaMetrics(days: number = 7) {
  return useQuery<PlatformSlaMetrics>({
    queryKey: ["platform-sla-metrics", days],
    queryFn: async () => {
      const response = await api.get(`/sla/platform/summary?days=${days}`);
      // api.get usually returns axios response, so we want response.data
      return response.data;
    },
    refetchInterval: 60000, // Refresh every 60s
  });
}
