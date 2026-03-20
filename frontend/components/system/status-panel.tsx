"use client";

import { useZoneIntelligenceSummary } from "@/hooks/useZoneIntelligence";
import { Server, Activity, AlertTriangle, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useSystemHealth } from "@/hooks/useSystemHealth";

export default function SystemStatusPanel() {
  const { data, isLoading, isError } = useZoneIntelligenceSummary();
  const { data: healthData, isLoading: healthLoading } = useSystemHealth();

  if (isLoading || isError || !data || healthLoading) {
    return (
      <div className="h-full w-full rounded-2xl bg-[#081428]/50 border border-[#0f2440] p-4 flex items-center justify-center">
        <Activity className="w-5 h-5 text-slate-600 animate-spin" />
      </div>
    );
  }

  const criticalNodes = data?.risk_breakdown?.critical ?? 0;
  const highNodes = data?.risk_breakdown?.high ?? 0;
  const sysStatus = criticalNodes > 0 ? "critical" : (highNodes > 0 ? "warning" : "nominal");

  return (
    <div className="bg-[#050f1f]/80 backdrop-blur-xl border border-blue-500/10 rounded-2xl p-4 shadow-[0_0_15px_rgba(59,130,246,0.05)] h-full flex flex-col justify-between relative overflow-hidden">
      {/* Background flare */}
      <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-1000 ${
        sysStatus === 'critical' ? 'bg-rose-500' : sysStatus === 'warning' ? 'bg-orange-500' : 'bg-emerald-500'
      }`} />

      <div className="flex items-start justify-between relative z-10 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-white font-bold tracking-widest uppercase text-xs">Node Telemetry</h2>
            <p className="text-[10px] text-slate-500 tracking-widest uppercase">System Health</p>
          </div>
        </div>
        
        <div className={`px-2 py-1 rounded bg-black/40 border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
          sysStatus === 'critical' ? 'border-rose-500/40 text-rose-400' :
          sysStatus === 'warning' ? 'border-orange-500/40 text-orange-400' :
          'border-emerald-500/40 text-emerald-400'
        }`}>
          {sysStatus === 'critical' && <AlertTriangle className="w-3 h-3" />}
          {sysStatus === 'nominal' && <ShieldCheck className="w-3 h-3" />}
          {sysStatus.toUpperCase()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 relative z-10">
        <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
           <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">Active Workers</p>
           <p className="text-lg font-mono text-white flex items-center gap-2">
             {healthData?.components?.vision_workers ?? 0} Worker{healthData?.components?.vision_workers !== 1 ? 's' : ''}
           </p>
        </div>
        <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
           <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">System Load</p>
           <p className="text-lg font-mono text-blue-400 tracking-tight">CPU {healthData?.metrics?.cpu_usage ?? 0}%</p>
        </div>
      </div>
    </div>
  );
}
