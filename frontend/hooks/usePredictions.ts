import { useQuery } from "@tanstack/react-query"
import { api } from "@/services/api"

export interface PredictionData {
  venue_id: string;
  generated_at?: string;
  predicted_level: string | null;
  predicted_risk_score: number | null;
  confidence: number;
  escalation_probability: number;
  horizon_minutes: number;
  forecast_curve: number[];
  forecast_upper_band: number[];
  forecast_lower_band: number[];
  model_used: string | null;
  forecast_explanation: string;
  incident_explanation: any;
  retraining_recommended: boolean;
  status?: string;
}

export function usePredictions(venueId: string) {
  return useQuery<PredictionData>({
    queryKey: ["predictions", venueId],
    queryFn: async () => {
      const response = await api.get(`/prediction/forecast/${venueId}`)
      return response.data
    },
    enabled: !!venueId,
    refetchInterval: 30000, // Refresh predictions every 30 seconds
  })
}
