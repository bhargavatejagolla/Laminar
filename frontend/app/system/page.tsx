"use client";

import { Activity, Server, Cpu, Database, Network, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useTranslation } from "react-i18next";

interface SystemHealth {
  status: string;
  uptime: string;
  components: {
    database: { status: string; latency: string };
    ml_pipeline: { status: string; queue_size: number; latency: string };
    redis_cache: { status: string; hit_rate: string };
  };
  metrics: {
    cpu_usage: number;
    memory_usage: number;
    network_rx: string;
    network_tx: string;
  }
}

export default function SystemHealthPage() {
  const { t } = useTranslation();
  // Real implementation would fetch this from /api/v1/system/health
  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ["system-health"],
    queryFn: async () => {
      try {
        const response = await api.get("/system/health");
        const data = response.data;
        
        return {
          status: data.status || "degraded",
          uptime: "Live Tracker", 
          components: {
            database: { status: data.components?.database === "connected" ? "online" : "offline", latency: "N/A" },
            ml_pipeline: { status: data.components?.vision_workers > 0 ? "online" : "offline", queue_size: 0, latency: "N/A" },
            redis_cache: { status: data.components?.scheduler_running ? "online" : "offline", hit_rate: "N/A" },
          },
          metrics: {
            cpu_usage: data.metrics?.cpu_usage || 0, 
            memory_usage: data.metrics?.memory_usage || 0,
            network_rx: data.metrics?.network_rx || "0 GB",
            network_tx: data.metrics?.network_tx || "0 GB",
          }
        };
      } catch (err) {
        return {
          status: "offline",
          uptime: "Offline",
          components: {
            database: { status: "offline", latency: "N/A" },
            ml_pipeline: { status: "offline", queue_size: 0, latency: "N/A" },
            redis_cache: { status: "offline", hit_rate: "N/A" },
          },
          metrics: { cpu_usage: 0, memory_usage: 0, network_rx: "0", network_tx: "0" }
        };
      }
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
        <Activity className="w-8 h-8 animate-spin mb-4 text-cyan-500" />
        <p>{t("system.scanning")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.15)] flex-shrink-0">
            <Server className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
             <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
               {t("system.title")}
             </h1>
             <p className="text-sm font-medium text-slate-400">
               {t("system.subtitle")}
             </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-sm font-medium text-emerald-400">
          <ShieldCheck className="w-4 h-4" /> {t("system.globalNominal")}
        </div>
      </div>

      {/* Vitals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        {/* CPU Tracker */}
        <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-5">
           <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{t("system.cpuComputeArray")}</span>
              <Cpu className="w-4 h-4 text-slate-400" />
           </div>
           <div className="flex items-end gap-2 mb-2">
             <span className="text-3xl font-bold font-mono text-white">{health?.metrics.cpu_usage}%</span>
             <span className="text-sm text-emerald-400 mb-1">{t("system.stable")}</span>
           </div>
           
           <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4">
             <div className="bg-cyan-400 h-1.5 rounded-full" style={{ width: `${health?.metrics.cpu_usage}%` }}></div>
           </div>
        </div>

        {/* Memory Tracker */}
        <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-5">
           <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{t("system.memoryAllocation")}</span>
              <Database className="w-4 h-4 text-slate-400" />
           </div>
           <div className="flex items-end gap-2 mb-2">
             <span className="text-3xl font-bold font-mono text-white">{health?.metrics.memory_usage}%</span>
             <span className="text-sm text-amber-400 mb-1">{t("system.highLoad")}</span>
           </div>
           
           <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4">
             <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${health?.metrics.memory_usage}%` }}></div>
           </div>
        </div>

        {/* Network Tracker */}
        <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-5 md:col-span-2 lg:col-span-2">
           <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{t("system.networkThroughput")}</span>
              <Network className="w-4 h-4 text-slate-400" />
           </div>
           
           <div className="grid grid-cols-2 gap-4">
              <div>
                 <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{t("system.inboundVideoRx")}</div>
                 <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                   <span className="font-mono text-xl font-bold text-white tracking-tight">{health?.metrics.network_rx}</span>
                 </div>
              </div>
              
              <div>
                 <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{t("system.outboundStreamTx")}</div>
                 <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse delay-75"></div>
                   <span className="font-mono text-xl font-bold text-white tracking-tight">{health?.metrics.network_tx}</span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Microservices Status */}
      <h2 className="text-lg font-semibold tracking-wide flex items-center gap-2 mb-4">
         <Activity className="w-5 h-5 text-cyan-500" /> {t("system.coreAIServices")}
      </h2>
      
      <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#0b1325] border-b border-slate-800 text-xs uppercase font-semibold tracking-wider text-slate-500">
            <tr>
              <th className="px-6 py-4">{t("system.serviceModule")}</th>
              <th className="px-6 py-4">{t("system.state")}</th>
              <th className="px-6 py-4">{t("system.latency")}</th>
              <th className="px-6 py-4">{t("system.queueDepth")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {/* Database Row */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="px-6 py-4">
                 <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                   <span className="font-medium text-slate-200">Postgres Cluster (Primary)</span>
                 </div>
              </td>
              <td className="px-6 py-4"><span className="text-emerald-400 font-mono">ONLINE</span></td>
              <td className="px-6 py-4 font-mono text-slate-300">{health?.components.database.latency}</td>
              <td className="px-6 py-4 font-mono text-slate-500">-</td>
            </tr>
            
            {/* ML Inference Row */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="px-6 py-4">
                 <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                   <span className="font-medium text-slate-200">YOLOv8 Processing Cores</span>
                 </div>
              </td>
              <td className="px-6 py-4"><span className="text-emerald-400 font-mono">ONLINE</span></td>
              <td className="px-6 py-4 font-mono text-slate-300">{health?.components.ml_pipeline.latency}</td>
              <td className="px-6 py-4 font-mono text-amber-400">{health?.components.ml_pipeline.queue_size} frames</td>
            </tr>

            {/* Redis Row */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="px-6 py-4">
                 <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                   <span className="font-medium text-slate-200">Redis High-Speed Cache</span>
                 </div>
              </td>
              <td className="px-6 py-4"><span className="text-emerald-400 font-mono">ONLINE</span></td>
              <td className="px-6 py-4 font-mono text-slate-300">Hit Rate: {health?.components.redis_cache.hit_rate}</td>
              <td className="px-6 py-4 font-mono text-slate-500">-</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}
