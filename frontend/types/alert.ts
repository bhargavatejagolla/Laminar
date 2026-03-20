export interface Alert {
  id: string;
  venue_id: string;
  metric_id?: string;
  risk_level: "low" | "medium" | "high" | "critical";
  severity: number;
  status: "new" | "acknowledged" | "resolved";
  escalation_level: string;
  extra_data?: any;
  last_notified_at?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  explanation?: string;
}
