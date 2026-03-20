import { api } from "./api";

export interface PredictionPoint {
  timestamp: string;
  predicted_count: number;
  upper_bound?: number;
  lower_bound?: number;
}

export interface PredictionResponse {
  venue_id: string;
  predictions: PredictionPoint[];
  current_count?: number;
  risk_level?: "low" | "medium" | "high" | "critical";
  confidence?: number;
  weather_context?: any;
  holiday_context?: any;
  event_type?: string;
  forecast_explanation?: string;
}

export interface GraphDataResponse {
  timestamps: string[];
  predicted_scores: number[];
  upper_band: number[];
  lower_band: number[];
}

// Transformed data for easier consumption
export interface TransformedGraphPoint {
  timestamp: string;
  predicted: number;
  upper?: number;
  lower?: number;
}

export const predictionService = {
  async getPrediction(venueId: string): Promise<PredictionResponse> {
    try {
      console.log(`Fetching prediction for venue: ${venueId}`);
      const response: any = await api.get(`/prediction/forecast/${venueId}`);
      console.log("Raw prediction response:", response);
      
      // Handle different response structures
      if (response && typeof response === 'object') {
        // If response has predictions array directly
        if (response.predictions && Array.isArray(response.predictions)) {
          return response as PredictionResponse;
        }
        // If response is an array of predictions
        else if (Array.isArray(response)) {
          return {
            venue_id: venueId,
            predictions: response.map((item: any) => ({
              timestamp: item.timestamp || item.time || new Date().toISOString(),
              predicted_count: item.predicted_count || item.value || item.score || 0,
              upper_bound: item.upper_bound || item.upper,
              lower_bound: item.lower_bound || item.lower
            })),
            current_count: response[0]?.current_count || 0,
            confidence: response[0]?.confidence || 0,
            weather_context: response[0]?.weather_context,
            holiday_context: response[0]?.holiday_context,
            event_type: response[0]?.event_type
          };
        }
        // If response has data property
        else if (response.data) {
          return {
            venue_id: venueId,
            predictions: Array.isArray(response.data) ? response.data.map((item: any) => ({
              timestamp: item.timestamp || item.time || new Date().toISOString(),
              predicted_count: item.predicted_count || item.value || item.score || 0,
              upper_bound: item.upper_bound || item.upper,
              lower_bound: item.lower_bound || item.lower
            })) : [],
            current_count: response.current_count || 0,
            confidence: response.confidence || 0,
            weather_context: response.weather_context,
            holiday_context: response.holiday_context,
            event_type: response.event_type
          };
        }
      }
      
      // Default fallback
      return {
        venue_id: venueId,
        predictions: [],
        current_count: 0
      };
    } catch (error) {
      console.error("Error fetching prediction:", error);
      throw error;
    }
  },

  async getPredictionGraph(venueId: string): Promise<TransformedGraphPoint[]> {
    try {
      console.log(`Fetching prediction graph for venue: ${venueId}`);
      const response: any = await api.get(`/prediction/graph/${venueId}`);
      console.log("Raw graph response:", response);
      
      // Transform the data into an array of points
      const transformedData: TransformedGraphPoint[] = [];
      
      // Handle the specific structure from your backend
      if (response && typeof response === 'object') {
        // Check if it has the array structure from your error message
        if (response.timestamps && Array.isArray(response.timestamps) && 
            response.predicted_scores && Array.isArray(response.predicted_scores)) {
          
          const { timestamps, predicted_scores, upper_band, lower_band } = response;
          
          for (let i = 0; i < timestamps.length; i++) {
            transformedData.push({
              timestamp: timestamps[i],
              predicted: predicted_scores[i],
              upper: upper_band?.[i],
              lower: lower_band?.[i]
            });
          }
        }
        // If it's already an array of points
        else if (Array.isArray(response)) {
          return response.map((item: any) => ({
            timestamp: item.timestamp || item.time || new Date().toISOString(),
            predicted: item.predicted || item.predicted_count || item.value || item.score || 0,
            upper: item.upper || item.upper_bound,
            lower: item.lower || item.lower_bound
          }));
        }
        // If response has data property
        else if (response.data) {
          if (Array.isArray(response.data)) {
            return response.data.map((item: any) => ({
              timestamp: item.timestamp || item.time || new Date().toISOString(),
              predicted: item.predicted || item.predicted_count || item.value || item.score || 0,
              upper: item.upper || item.upper_bound,
              lower: item.lower || item.lower_bound
            }));
          }
        }
      }
      
      return transformedData;
    } catch (error) {
      console.error("Error fetching prediction graph:", error);
      return []; // Return empty array instead of throwing
    }
  },
};