export interface Alert {
  id: string;
  venue_id: string;
  metric_id?: string;
  risk_level: "low" | "medium" | "high" | "critical";
  severity: number;
  status: "new" | "open" | "acknowledged" | "resolved";
  escalation_level: string;
  extra_data?: any;
  last_notified_at?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  explanation?: string;
  predicted_level?: string;
  escalation_probability?: number;
  snapshot_url?: string;
  download_url?: string;
  clip_url?: string;
}
