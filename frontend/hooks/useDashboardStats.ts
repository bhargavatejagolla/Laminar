"use client";

import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/services/dashboard.service";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
    refetchInterval: 10000,
  });
}
