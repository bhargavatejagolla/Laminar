"use client"

import { useQuery } from "@tanstack/react-query"
import { predictionService } from "@/services/prediction.service"

export function usePrediction(venueId?: string) {
  return useQuery({
    queryKey: ["prediction", venueId],
    queryFn: async () => {
      try {
        const data = await predictionService.getPrediction(venueId as string);
        console.log("usePrediction data:", data);
        return data;
      } catch (error) {
        console.error("usePrediction error:", error);
        throw error;
      }
    },
    enabled: !!venueId,
    refetchInterval: 20000,
    staleTime: 10000,
    retry: 2,
  });
}

export function usePredictionGraph(venueId?: string) {
  return useQuery({
    queryKey: ["prediction-graph", venueId],
    queryFn: async () => {
      try {
        const data = await predictionService.getPredictionGraph(venueId as string);
        console.log("usePredictionGraph data:", data);
        return data;
      } catch (error) {
        console.error("usePredictionGraph error:", error);
        return []; // Return empty array on error
      }
    },
    enabled: !!venueId,
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });
}