"use client";

import { useMemo, useState, useEffect } from "react";
import { BrainCircuit, Clock, Activity, Users, ShieldAlert, Cpu } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useTranslation } from "react-i18next";

export default function AIOperationsDashboard() {
  const { t } = useTranslation();

  const { data: stats, isLoading } = useDashboardStats();
  const insightData = stats?.ai_insights;

  return (
    <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-5 mb-8 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] -z-10 translate-x-1/2 -translate-y-1/2"></div>
      
      <div className="flex items-center gap-3 mb-6 border-b border-slate-800/50 pb-4">
        <div className="p-2.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
          <BrainCircuit className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">{t("auto.AIOperationsCen_8180") || "AI Operations Center"}</h2>
          <p className="text-xs text-slate-400 font-mono">{t("auto.RealtimeSceneUn_566") || "Real-time Scene Understanding & Analytics"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Insight 1 */}
        <div className="bg-[#020617]/50 border border-slate-800/80 rounded-lg p-4 flex flex-col justify-between group hover:border-cyan-500/30 transition-colors">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">{t("auto.PeakPrediction_2848") || "Peak Prediction"}</span>
          </div>
          <p className="text-xl font-mono text-cyan-400 font-bold group-hover:scale-105 transition-transform origin-left">
            {insightData ? insightData.peak_time : "Processing..."}
          </p>
          <p className="text-[10px] text-slate-500 mt-2">{t("auto.Highestpredicte_3677") || "Highest predicted capacity traffic"}</p>
        </div>

        {/* Insight 2 */}
        <div className="bg-[#020617]/50 border border-slate-800/80 rounded-lg p-4 flex flex-col justify-between group hover:border-violet-500/30 transition-colors">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Users className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">{t("auto.HotspotZone_9090") || "Hotspot Zone"}</span>
          </div>
          <p className="text-xl font-bold text-violet-400 group-hover:scale-105 transition-transform origin-left">
            {insightData ? insightData.most_crowded : "Analyzing..."}
          </p>
          <p className="text-[10px] text-slate-500 mt-2">{t("auto.Highestdensityc_2853") || "Highest density concentration"}</p>
        </div>

        {/* Insight 3 */}
        <div className="bg-[#020617]/50 border border-slate-800/80 rounded-lg p-4 flex flex-col justify-between group hover:border-emerald-500/30 transition-colors">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Activity className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">{t("auto.DwellTime_5897") || "Dwell Time"}</span>
          </div>
          <p className="text-xl font-mono text-emerald-400 font-bold group-hover:scale-105 transition-transform origin-left">
            {insightData ? insightData.avg_dwell : "Tracking..."}
          </p>
          <p className="text-[10px] text-slate-500 mt-2">{t("auto.Averagetimespen_3686") || "Average time spent in zones"}</p>
        </div>

        {/* Insight 4 */}
        <div className="bg-[#020617]/50 border border-slate-800/80 rounded-lg p-4 flex flex-col justify-between group hover:border-rose-500/30 transition-colors">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <ShieldAlert className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">{t("auto.SafetyContext_1068") || "Safety Context"}</span>
          </div>
          <p className={`text-lg font-bold group-hover:scale-105 transition-transform origin-left ${insightData?.safety_index === "Elevated Risk" ? 'text-rose-400' : 'text-emerald-400'}`}>
            {insightData ? insightData.safety_index : "Scanning..."}
          </p>
          <p className="text-[10px] text-slate-500 mt-2">{t("auto.Realtimeinciden_3855") || "Real-time incident evaluation"}</p>
        </div>
      </div>
      
      <div className="mt-5 border-t border-slate-800/50 pt-3 flex items-center justify-between">
         <span className="text-[10px] text-slate-500 font-mono tracking-widest flex items-center gap-1.5 uppercase">
           <Cpu className="w-3 h-3" /> Enhanced Scene Understanding Active · YOLOv8 + DeepSeek 6.7B
         </span>
      </div>
    </div>
  );
}
