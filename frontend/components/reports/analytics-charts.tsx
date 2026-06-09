"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, ReferenceDot
} from "recharts";
import { 
  Loader2, AlertTriangle, TrendingUp, Users, Activity, 
  Zap, ShieldAlert, Cpu, Target, BrainCircuit, Clock, Info
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 15 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } }
}

function StatCard({ label, value, sub, icon, color }: StatCardProps) {
  const { t } = useTranslation();

  return (
    <motion.div variants={itemVariants} className={`glass-card p-6 rounded-[2rem] border border-white/5 bg-[#050505]/60 backdrop-blur-2xl group cursor-default relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-[inset_0_0_40px_rgba(255,255,255,0.015)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] transition-all duration-500`}>
      <div className="absolute inset-x-0 top-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 z-10" style={{ background: `linear-gradient(90deg, transparent, var(--${color}), transparent)` }} />
      <div className="absolute -top-12 -right-12 w-32 h-32 blur-[50px] opacity-20 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none z-0" style={{ backgroundColor: `var(--${color})` }} />
      
      <div className="flex items-start gap-5 relative z-10 w-full mb-3">
        <div className={`p-4 rounded-2xl border backdrop-blur-md shadow-inner transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`} style={{ backgroundColor: `color-mix(in srgb, var(--${color}) 15%, transparent)`, borderColor: `color-mix(in srgb, var(--${color}) 30%, transparent)`, color: `var(--${color})` }}>
           {icon}
        </div>
        <div className="flex-1 pt-1">
          <p className="text-[11px] text-slate-400 uppercase tracking-[0.25em] font-black">{label}</p>
          <div className="flex items-baseline gap-2 mt-1">
             <p className="text-4xl font-black text-white font-heading tracking-tight drop-shadow-lg transition-all duration-300 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" style={{ textShadow: `0 0 20px color-mix(in srgb, var(--${color}) 40%, transparent)` }}>{value}</p>
          </div>
        </div>
      </div>
      {sub && (
        <div className="relative z-10 flex items-center justify-between w-full">
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `var(--${color})`, opacity: 0.8 }}></span>
                {sub}
            </p>
        </div>
      )}
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isForecast = data.type === "forecast";
    
    return (
      <div className="glass-panel border border-white/10 p-4 shadow-2xl backdrop-blur-2xl bg-black/80">
        <div className="flex items-center gap-2 mb-2">
          {isForecast ? <BrainCircuit className="w-4 h-4 text-cyan-400" /> : <Activity className="w-4 h-4 text-indigo-400" />}
          <span className="text-[10px] font-black text-white uppercase tracking-widest">{data.time}</span>
        </div>
        <div className="space-y-1.5 border-t border-white/5 pt-2">
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-6">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{p.name || 'Value'}:</span>
              <span className="text-xs font-black text-white italic" style={{ color: p.stroke || p.fill || '#fff' }}>
                {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
              </span>
            </div>
          ))}
          {isForecast && data.upperBound && (
            <div className="flex items-center justify-between gap-6 opacity-50">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Confidence Range:</span>
              <span className="text-[10px] font-black text-slate-400 italic">
                {data.lowerBound?.toFixed(1)} - {data.upperBound?.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export default function AnalyticsCharts({ venueId }: { venueId: string }) {
  const { t } = useTranslation();
  const [infoState, setInfoState] = useState({
    risk: false,
    transit: false,
    peaks: false,
    threat: false,
  });

  const toggleInfo = (key: keyof typeof infoState) => {
    setInfoState(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["predictionGraph", venueId],
    queryFn: async () => {
      if (!venueId) return null;
      const res = await api.get(`/prediction/graph/${venueId}`);
      return res.data;
    },
    enabled: !!venueId,
    refetchInterval: 10000,
    staleTime: 5000,
    retry: false,
  });

  if (!venueId) {
    return (
      <div className="flex flex-col items-center justify-center p-16 glass-panel border border-white/5 rounded-[2rem] mt-8 min-h-[400px]">
        <div className="relative mb-6 group">
          <div className="absolute inset-0 bg-slate-500/20 blur-xl rounded-full group-hover:animate-pulse"></div>
          <Target className="w-16 h-16 text-slate-600 relative z-10" />
        </div>
        <h3 className="text-white text-2xl font-black tracking-[0.2em] uppercase mb-4 text-center">{t("auto.MatrixTargetReq_7146") || "Matrix Target Required"}</h3>
        <p className="text-slate-500 font-mono text-sm max-w-md text-center leading-relaxed">
          {t("auto.Initializeacoor_6331") || "Initialize a coordinate node from the matrix selector to inject live telemetry into the deep learning core."}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 glass-panel border border-white/5 rounded-[2rem] mt-8 shadow-[inset_0_0_50px_rgba(255,255,255,0.01)] min-h-[400px] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
        <div className="relative mb-8">
           <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full animate-pulse"></div>
           <Cpu className="w-16 h-16 text-indigo-400 relative z-10 animate-[spin_4s_linear_infinite]" />
        </div>
        <h3 className="text-white text-xl font-black tracking-[0.3em] uppercase mb-3 animate-pulse">{t("auto.SynchronizingNe_3538") || "Synchronizing Neural Core"}</h3>
        <span className="text-indigo-400/60 font-mono tracking-[0.2em] uppercase text-xs">{t("auto.Awaitingprimary_3470") || "Awaiting primary telemetry feed..."}</span>
      </div>
    );
  }

  if (error || !data || data.status === "graph_generation_failed") {
    return (
      <div className="flex flex-col items-center justify-center p-16 glass-panel border border-rose-500/20 rounded-[2rem] mt-8 text-center shadow-[inset_0_0_50px_rgba(244,63,94,0.05)] min-h-[400px]">
        <div className="relative mb-6">
           <div className="absolute inset-0 bg-rose-500/20 blur-xl rounded-full animate-pulse"></div>
           <div className="p-5 bg-rose-950/40 rounded-2xl border border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.3)] relative z-10">
             <AlertTriangle className="w-12 h-12 text-rose-500" />
           </div>
        </div>
        <h3 className="text-white text-xl font-black tracking-[0.2em] uppercase mb-3">{t("auto.TelemetryFeedOf_1837") || "Telemetry Feed Offline"}</h3>
        <p className="text-slate-400 font-mono text-sm max-w-md opacity-80 leading-relaxed">
          {t("auto.TheMLpipelinefa_3066") || "The ML pipeline failed to resolve a continuous data stream. Confirm connected edge nodes are actively transmitting valid arrays."}
        </p>
      </div>
    );
  }

  // ── Build Data Arrays ──────────────────────────────────────────────
  const historical = data.historical ?? {};
  const forecast   = data.forecast   ?? {};
  const meta       = data.meta       ?? {};
  const peaks      = data.peaks      ?? [];

  const histData: any[] = (historical.timestamps ?? []).map((ts: string, i: number) => ({
    time:     format(new Date(ts), "HH:mm"),
    fullTime: ts,
    riskScore:   historical.risk_scores?.[i]       ?? null,
    crowdCount:  historical.crowd_counts?.[i]       ?? null,
    occupancy:   historical.occupancy_percents?.[i] ?? null,
    entries:     historical.transit_entries?.[i]    ?? 0,
    exits:       historical.transit_exits?.[i]      ?? 0,
    type: "historical",
  }));

  const fcastData: any[] = (forecast.timestamps ?? []).map((ts: string, i: number) => ({
    time:       format(new Date(ts), "HH:mm"),
    fullTime:   ts,
    predicted:  forecast.predicted_scores?.[i]    ?? null,
    upperBound: forecast.upper_band?.[i]           ?? null,
    lowerBound: forecast.lower_band?.[i]           ?? null,
    type: "forecast",
  }));

  const mergedRisk = [
    ...histData.map(d => ({ ...d, historical: d.riskScore })),
    ...fcastData.map(d => ({ ...d, predicted: d.predicted, upper: d.upperBound, lower: d.lowerBound })),
  ];

  const escalationRaw = data.escalation ?? {};
  const escalationTimestamps: string[] = escalationRaw.timestamps ?? [];
  const escalationProbabilities: number[] = escalationRaw.probabilities ?? [];
  const escalationSource: string = escalationRaw.source ?? "unknown";

  const escalationData = escalationTimestamps.map((ts: string, i: number) => ({
    time: (() => { try { return format(new Date(ts), "HH:mm"); } catch { return ts; } })(),
    probability: escalationProbabilities[i] != null ? Math.round(escalationProbabilities[i] * 100) : 0,
  })).filter((d: any) => d.probability !== null && !isNaN(d.probability));

  // Averages & Aggregates
  const currentOcc = histData.length ? Math.round(histData[histData.length-1].occupancy || 0) : 0;
  const avgRisk = histData.length ? Math.round(histData.reduce((a, b) => a + (b.riskScore || 0), 0) / histData.length) : 0;
  const peakCount = histData.length ? Math.round(Math.max(...histData.map((d: any) => d.crowdCount || 0))) : 0;
  const confidence = meta.confidence ? `${Math.round(meta.confidence * 100)}%` : "Tracking...";
  const model = meta.model_used?.toUpperCase() ?? "HYBRID";

  // Transit Specific Averages
  const avgEntries = histData.length ? (histData.reduce((a, b) => a + b.entries, 0) / histData.length).toFixed(1) : 0;
  const avgExits = histData.length ? (histData.reduce((a, b) => a + b.exits, 0) / histData.length).toFixed(1) : 0;

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={{
         hidden: { opacity: 0 },
         visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
      }}
      className="space-y-10"
      style={{
        '--cyan-400': '#22d3ee',
        '--indigo-400': '#818cf8',
        '--amber-400': '#fbbf24',
        '--emerald-400': '#34d399',
        '--rose-400': '#f43f5e',
      } as React.CSSProperties}
    >

      {/* ── Summary Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label={t("auto.AvgRiskScore_1658") || "Avg Risk Score"} value={avgRisk} sub="History" icon={<Activity className="w-6 h-6" />} color="cyan-400" />
        <StatCard label={t("auto.LiveVolume_1511") || "Live Volume"} value={peakCount} sub="Actives" icon={<Users className="w-6 h-6" />} color="indigo-400" />
        <StatCard label={t("auto.MatrixDensity_6780") || "Matrix Density"} value={`${currentOcc}%`} sub="Load" icon={<TrendingUp className="w-6 h-6" />} color="amber-400" />
        <StatCard label={t("auto.AIMatch_2253") || "AI Match"} value={confidence} sub={model} icon={<Zap className="w-6 h-6" />} color="emerald-400" />
      </div>

      {/* ── Main Forecast Chart ───────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-[2.5rem] p-8 lg:p-10 relative overflow-hidden group shadow-[inset_0_0_40px_rgba(99,102,241,0.015)]">
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
        
        <div className="flex justify-between items-start mb-10 flex-wrap gap-4 relative z-20">
           <div>
              <h3 className="text-xl font-black tracking-[0.1em] text-white uppercase drop-shadow-md flex items-center gap-3">
                 <BrainCircuit className="w-5 h-5 text-indigo-400" />
                 {t("auto.RiskTrajectoryP_437") || "Risk Trajectory Projection"}
              </h3>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-2">
                 {t("auto.SynchronizedTel_6590") || "Synchronized Telemetry"} <span className="text-slate-600">|</span> {t("auto.HorizonPredicti_5389") || "Horizon Prediction"}
              </p>
           </div>
           <button 
             onClick={() => toggleInfo('risk')} 
             className={`p-2 rounded-xl transition-all border block ${infoState.risk ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
           >
             <Info className="w-5 h-5" />
           </button>
        </div>
        
        <div className="relative">
          {/* Info Overlay */}
          <AnimatePresence>
            {infoState.risk && (
               <motion.div 
                 initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                 animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
                 exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                 className="absolute inset-0 z-30 bg-black/60 rounded-2xl p-8 flex flex-col justify-center border border-indigo-500/20"
               >
                 <h4 className="text-sm font-black text-indigo-400 uppercase tracking-widest mb-4">{t("auto.TrajectoryProje_5057") || "Trajectory Projection Insights"}</h4>
                 <p className="text-xs font-mono text-slate-300 leading-relaxed mb-6 max-w-2xl">
                   This graph visualizes the neural network's anticipated risk escalation. It bridges historical live metrics (solid line) with forecasted probabilities (dashed line) using an ARIMA-backed trajectory model over a {meta.horizon_minutes}-minute horizon.
                 </p>
                 <div className="grid grid-cols-2 gap-4 max-w-xl">
                   <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                     <div className="text-[10px] text-slate-500 uppercase font-black">{t("auto.PredictiveMaxim_8848") || "Predictive Maximum"}</div>
                     <div className="text-2xl font-black text-white">{Math.round(meta.predictive_peak || 0)}</div>
                   </div>
                   <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                     <div className="text-[10px] text-slate-500 uppercase font-black">{t("auto.AICertainty_1557") || "AI Certainty"}</div>
                     <div className="text-2xl font-black text-white">{confidence}</div>
                   </div>
                 </div>
               </motion.div>
            )}
          </AnimatePresence>

          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <AreaChart data={mergedRisk}>
                <defs>
                  <linearGradient id="gRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFcast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                
                <Area type="monotone" dataKey="historical" name="Live Risk" stroke="#818cf8" strokeWidth={3} fill="url(#gRisk)" dot={false} connectNulls activeDot={{ r: 6, fill: '#818cf8' }} />
                <Area type="monotone" dataKey="predicted" name="AI Forecast" stroke="#22d3ee" strokeWidth={3} strokeDasharray="8 4" fill="url(#gFcast)" dot={false} connectNulls />
                <Area type="monotone" dataKey="upper" name="Sigma High" stroke="none" fill="#22d3ee" fillOpacity={0.05} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* ── Transit & Peaks grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Transit Intelligence */}
        <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-[2rem] p-8 min-h-[450px] relative overflow-hidden group flex flex-col">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
          <div className="flex items-center justify-between mb-8 relative z-20">
            <div>
              <h3 className="text-base font-black text-white tracking-widest uppercase flex items-center gap-3">
                <Activity className="w-5 h-5 text-cyan-400" />
                {t("auto.TransitIntellig_5075") || "Transit Intelligence"}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t("auto.FlowDifferentia_8991") || "Flow Differential Metrics"}</p>
            </div>
            <button 
              onClick={() => toggleInfo('transit')} 
              className={`p-1.5 rounded-lg transition-all border ${infoState.transit ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>

          <div className="relative flex-1">
             <AnimatePresence>
              {infoState.transit && (
                 <motion.div 
                   initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                   animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
                   exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                   className="absolute inset-0 z-30 bg-black/70 rounded-xl p-6 flex flex-col justify-center border border-cyan-500/20"
                 >
                   <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest mb-3">{t("auto.TransitFlowDiag_7150") || "Transit Flow Diagnostics"}</h4>
                   <p className="text-[11px] font-mono text-slate-300 leading-relaxed mb-6">
                     {t("auto.Approximatesphy_3731") || "Approximates physical movement directionality utilizing crowd deltas and bounding box velocity vectors. Helps identify bottlenecks in entry and exit queues."}
                   </p>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="bg-cyan-500/10 p-3 rounded-xl border border-cyan-500/20">
                       <div className="text-[9px] text-cyan-300/70 uppercase font-black tracking-widest">{t("auto.AverageVolIn_171") || "Average Vol. In"}</div>
                       <div className="text-xl font-black text-cyan-400">{avgEntries}</div>
                     </div>
                     <div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                       <div className="text-[9px] text-rose-300/70 uppercase font-black tracking-widest">{t("auto.AverageVolOut_5332") || "Average Vol. Out"}</div>
                       <div className="text-xl font-black text-rose-400">{avgExits}</div>
                     </div>
                   </div>
                 </motion.div>
              )}
            </AnimatePresence>

            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <BarChart data={histData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                  <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold", fontFamily: "var(--font-mono)", textTransform: "uppercase", paddingTop: '10px' }} />
                  <Bar dataKey="entries" name="Inflow Vol" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="exits" name="Outflow Vol" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            {/* Display static insight averages globally at the bottom if info is not open */}
            <div className="mt-6 flex justify-between items-center px-4 py-3 bg-black/40 rounded-xl border border-white/5">
              <span className="text-[9px] text-slate-500 font-black tracking-[0.2em] uppercase">{t("auto.DeltaSummary_6299") || "Delta Summary"}</span>
              <div className="flex gap-4">
                 <span className="text-xs font-black text-cyan-400">{avgEntries} IN</span>
                 <span className="text-xs font-black text-rose-400">{avgExits} OUT</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Operational Peak Analysis */}
        <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-[2rem] p-8 min-h-[450px] relative overflow-hidden group flex flex-col">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
          <div className="flex items-center justify-between mb-8 relative z-20">
            <div>
              <h3 className="text-base font-black text-white tracking-widest uppercase flex items-center gap-3">
                <Target className="w-5 h-5 text-emerald-400" />
                {t("auto.OperationalPeak_3843") || "Operational Peaks"}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t("auto.HighFlowZoneEve_77") || "High-Flow Zone Events"}</p>
            </div>
            <button 
              onClick={() => toggleInfo('peaks')} 
              className={`p-1.5 rounded-lg transition-all border ${infoState.peaks ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
          
          <div className="relative flex-1">
             <AnimatePresence>
              {infoState.peaks && (
                 <motion.div 
                   initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                   animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
                   exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                   className="absolute inset-0 z-30 bg-black/70 rounded-xl p-6 flex flex-col justify-center border border-emerald-500/20"
                 >
                   <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-3">{t("auto.SaturationInsig_1987") || "Saturation Insights"}</h4>
                   <p className="text-[11px] font-mono text-slate-300 leading-relaxed mb-6">
                     {t("auto.Calculateslocal_5126") || "Calculates local maxima over the given timeline to pinpoint congestion events. Valuable for optimizing staffing and operation routing during high-density bursts."}
                   </p>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                       <div className="text-[9px] text-emerald-300/70 uppercase font-black tracking-widest">{t("auto.MaxLoad_8623") || "Max Load"}</div>
                       <div className="text-xl font-black text-emerald-400">{peaks.length > 0 ? Math.max(...peaks.map((p:any) => p.value)) : 'N/A'}</div>
                     </div>
                     <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
                       <div className="text-[9px] text-indigo-300/70 uppercase font-black tracking-widest">{t("auto.PeakEvents_4595") || "Peak Events"}</div>
                       <div className="text-xl font-black text-indigo-400">{peaks.length}</div>
                     </div>
                   </div>
                 </motion.div>
              )}
            </AnimatePresence>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <LineChart data={histData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold", fontFamily: "var(--font-mono)", textTransform: "uppercase", paddingTop: '20px' }} />
                  <Line 
                    type="monotone" 
                    dataKey="crowdCount" 
                    name="Detected Volume" 
                    stroke="#34d399" 
                    strokeWidth={3} 
                    dot={(props: any) => {
                      const isPeak = peaks.some((p: any) => format(new Date(p.timestamp), "HH:mm") === props.payload.time);
                      if (isPeak) return <circle cx={props.cx} cy={props.cy} r={6} fill="#34d399" stroke="#fff" strokeWidth={2} />;
                      return <circle cx={props.cx} cy={props.cy} r={0} fill="#34d399" />;
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
               {peaks.map((peak: any, idx: number) => (
                 <div key={idx} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 shadow-[inset_0_0_15px_rgba(52,211,153,0.15)]">
                   <Clock className="w-3 h-3" /> {peak.label}: <span className="text-white text-[11px]">{peak.value}</span> @ {format(new Date(peak.timestamp), "HH:mm")}
                 </div>
               ))}
               {peaks.length === 0 && (
                 <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mt-2">{t("auto.Nosignificantpe_2482") || "No significant peaks detected in current interval."}</p>
               )}
            </div>
          </div>
        </motion.div>

        {/* Escalation Probability Bars */}
        <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-[2rem] p-8 lg:p-10 min-h-[450px] relative overflow-hidden group shadow-[inset_0_0_40px_rgba(244,63,94,0.015)] xl:col-span-2 flex flex-col">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
          
          <div className="flex justify-between items-start mb-8 flex-wrap gap-4 relative z-20">
             <div>
                <h3 className="text-base font-black tracking-[0.15em] text-white uppercase drop-shadow-md flex items-center gap-3">
                   <ShieldAlert className="w-5 h-5 text-rose-500" /> {t("auto.EscalationThrea_7671") || "Escalation Threat Matrix"}
                </h3>
                <p className="text-[11px] text-rose-500/60 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-2">
                   {t("auto.IncidentProbabi_131") || "Incident Probability Spline"}
                </p>
             </div>
             <div className="flex gap-4 items-center">
                 <span className={`text-[9px] font-black tracking-widest px-4 py-2 rounded-xl border uppercase shadow-[inset_0_0_15px_rgba(255,255,255,0.05)] backdrop-blur-md flex items-center gap-2 ${
                  escalationSource === "forecast"
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                    : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                 }`}>
                   <ShieldAlert className="w-3 h-3" />
                   {escalationSource === "forecast" ? "FORECAST OVERRIDE" : "LIVE SENSOR RAW"}
                 </span>
                 <button 
                  onClick={() => toggleInfo('threat')} 
                  className={`p-1.5 rounded-lg transition-all border ${infoState.threat ? 'bg-rose-500/20 border-rose-500/50 text-rose-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                 >
                  <Info className="w-4 h-4" />
                 </button>
             </div>
          </div>
          
          <div className="relative flex-1">
             <AnimatePresence>
              {infoState.threat && (
                 <motion.div 
                   initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                   animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
                   exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                   className="absolute inset-0 z-30 bg-black/70 rounded-xl p-6 flex flex-col justify-center items-center text-center border border-rose-500/20"
                 >
                   <h4 className="text-sm font-black text-rose-400 uppercase tracking-widest mb-3">{t("auto.ThreatQuantific_449") || "Threat Quantification"}</h4>
                   <p className="text-xs font-mono text-slate-300 leading-relaxed mb-6 max-w-xl">
                     Real-time evaluation of crowd density mapped against environmental risk factors (e.g., velocity, acceleration). A probability &gt; 50% triggers escalation protocols. The matrix sources data from either raw live sensors or ML extrapolation if future risks are high.
                   </p>
                 </motion.div>
              )}
            </AnimatePresence>

            <div className="h-[280px]">
              {escalationData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <BarChart data={escalationData}>
                    <defs>
                       <linearGradient id="gRose" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.9} />
                         <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.2} />
                       </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="time" stroke="#475569" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis stroke="#475569" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      content={<CustomTooltip />}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold", fontFamily: "var(--font-mono)", textTransform: "uppercase", paddingTop: '20px' }} />
                    <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="4 4" opacity={0.4} label={{ value: "50% ESCALATION THRESHOLD", fill: "#f43f5e", fontSize: 10, fontWeight: 900, position: 'insideTopLeft', opacity: 0.8 }} />
                    <Bar dataKey="probability" name="Escalation Threat %" fill="url(#gRose)" radius={[8, 8, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm glass-panel border border-white/5 rounded-2xl mx-10 my-10 bg-black/20">
                  <div className="text-center">
                    <Zap className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">{t("auto.AwaitingTelemet_6648") || "Awaiting Telemetry Initialization..."}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

      </div>

      {/* ── Meta info bar ─────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-[2rem] px-8 py-6 flex flex-wrap items-center gap-6 lg:gap-12 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] relative overflow-hidden group shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]">
        <div className="absolute inset-y-0 left-0 w-[4px] bg-gradient-to-b from-transparent via-cyan-500/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <span className="flex items-center gap-2"><Cpu className="w-4 h-4 text-slate-600" /> Core Engine: <span className="text-cyan-400 drop-shadow-sm ml-1 px-3 py-1.5 bg-cyan-500/10 rounded-lg">{model}</span></span>
        <span>Projection Horizon: <span className="text-indigo-400 drop-shadow-sm ml-1 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">{meta.horizon_minutes ?? 30} MIN</span></span>
        <span>Array Volume: <span className="text-emerald-400 drop-shadow-sm ml-1 px-3 py-1.5">{histData.length} OBSERVED / {fcastData.length} EXTRAPOLATED</span></span>
        <span>Feed Sync Time: <span className="text-slate-300 drop-shadow-sm ml-1 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">{data.generated_at ? format(new Date(data.generated_at), "HH:mm:ss") : "–"}</span></span>
      </motion.div>

    </motion.div>
  );
}
