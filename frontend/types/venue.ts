export interface Venue {
  id: string;
  name: string;
  capacity: number;
  location?: string;
  city?: string;
  country?: string;
  venue_type?: string;
  warning_threshold_percent: number;
  critical_threshold_percent: number;
  warning_threshold: number;
  critical_threshold: number;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  monitoring_enabled: boolean;
  dynamic_risk_score?: number;
  created_at: string;
  updated_at: string;
  current_occupancy?: number;
  capacity_usage?: number;
  staffing_config?: any;
}

export interface VenueStats {
  venue_id: string;
  current_occupancy: number;
  current_risk: number;
  active_cameras: number;
  camera_count: number;
  monitoring_enabled: boolean;
  avg_velocity?: number;
  last_updated: string;
}