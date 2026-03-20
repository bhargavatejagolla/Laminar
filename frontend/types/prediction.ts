export interface PredictionResponse {

  venue_id: string

  predicted_level: string | null
  predicted_risk_score: number | null

  confidence: number
  escalation_probability: number

  horizon_minutes: number | null

  forecast_curve: number[]
  forecast_upper_band: number[]
  forecast_lower_band: number[]

  model_used: string | null
  forecast_explanation: string

  retraining_recommended: boolean

  holiday_context: any
  weather_context: any
  event_type: string | null
  risk_factors?: string[]
  status?: string
}