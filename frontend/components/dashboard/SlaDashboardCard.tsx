"use client";

import React from "react";
import { Clock, ShieldAlert, CheckCircle2, AlertTriangle, Activity } from "lucide-react";
import { useSlaMetrics } from "@/hooks/useSlaMetrics";
import { useTranslation } from "react-i18next";

export function SlaDashboardCard() {
  const { data: metrics, isLoading } = useSlaMetrics();
  const { t } = useTranslation();

  // Handle loading state gracefully by retaining layout
  const avgResponseTime = isLoading 
    ? "..." 
    : (metrics?.platform_mtta_seconds ? (metrics.platform_mtta_seconds / 60).toFixed(1) : "0.0");
  const complianceRate = isLoading 
    ? "..." 
    : (metrics?.platform_sla_compliance_pct?.toFixed(1) ?? "100.0");
  const breachesCount = isLoading 
    ? "..." 
    : (metrics?.total_alerts ?? 0);

  return (
    <div className="p-6 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-3xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none transition-transform group-hover:scale-110 duration-700">
        <Clock className="w-48 h-48 text-emerald-500" />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-500" />
            {t("dashboard.slaAndResponse") || "SLA & Response"}
          </h3>
          <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5`}>
            {isLoading && <Activity className="w-3 h-3 animate-spin" />}
            {complianceRate}% {t("dashboard.compliant") || "Compliant"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{t("auto.AvgAcknowledgme_4712") || "Avg Acknowledgment"}</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-slate-200">{avgResponseTime}</span>
              <span className="text-xs font-bold text-slate-500 mb-1">{t("auto.mins_6667") || "mins"}</span>
            </div>
            <p className="text-xs text-emerald-500 font-medium mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {t("auto.Targetlt5mins_2041") || "Target: &lt;5 mins"}
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{t("dashboard.platformAlerts7d") || "Platform Alerts (7d)"}</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-slate-200">{breachesCount}</span>
              <span className="text-xs font-bold text-slate-500 mb-1">{t("dashboard.total") || "total"}</span>
            </div>
            <p className="text-xs text-amber-500 font-medium mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {t("dashboard.monitorClosely") || "Monitor closely"}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t("dashboard.globalPolicy") || "Global Policy: Critical alerts under 5m"}</p>
          <button className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-wider flex flex-row items-center">
            {t("dashboard.viewReport") || "View Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
