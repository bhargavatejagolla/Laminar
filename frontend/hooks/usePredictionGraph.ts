import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export interface PredictionGraphData {
  venue_id: string;
  generated_at: string;
  historical: {
    timestamps: string[];
    risk_scores: number[];
    crowd_counts: number[];
    occupancy_percents: number[];
  };
  forecast: {
    timestamps: string[];
    predicted_scores: number[];
    upper_band: number[];
    lower_band: number[];
    escalation_probs: number[];
  };
  escalation: {
    timestamps: string[];
    probabilities: number[];
    source: string;
  };
  meta: {
    model_used: string;
    confidence: number;
    horizon_minutes: number;
    predictive_peak: number;
    generated_at: string;
    has_forecast: boolean;
    historical_count: number;
  };
}

export function usePredictionGraph(venueId: string) {
  return useQuery<PredictionGraphData>({
    queryKey: ["prediction-graph", venueId],
    queryFn: async () => {
      const response = await api.get(`/prediction/graph/${venueId}`);
      return response.data;
    },
    enabled: !!venueId,
    refetchInterval: 60000, // Refresh every 60 seconds
    retry: 2,
  });
}