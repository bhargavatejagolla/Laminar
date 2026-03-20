"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export interface SystemHealthData {
  status: string;
  timestamp: string;
  components: {
    database: string;
    scheduler_running: boolean;
    vision_workers: number;
  };
  metrics: {
    total_cameras: number;
    last_minute_metric: string | null;
    cpu_usage: number;
    memory_usage: number;
    network_rx: string;
    network_tx: string;
  };
}

export function useSystemHealth() {
  return useQuery<SystemHealthData>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const response = await api.get("/system/health");
      return response.data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}
