"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine
} from "recharts";
import { Loader2, AlertTriangle, TrendingUp, Users, Activity, Zap, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

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
  // mapping colors for tailwind arbitrary values won't work perfectly dynamically without safelist,
  // so we use inline styles for the heavy glowing effects
  return (
    <motion.div variants={itemVariants} className={`glass-card p-5 group cursor-default relative overflow-hidden flex flex-col justify-between min-h-[120px]`}>
      <div className="absolute inset-x-0 top-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" style={{ background: `linear-gradient(90deg, transparent, var(--${color}), transparent)` }} />
      <div className="absolute -top-10 -right-10 w-24 h-24 blur-[40px] opacity-10 group-hover:opacity-30 transition-opacity duration-700 pointer-events-none z-0" style={{ backgroundColor: `var(--${color})` }} />
      
      <div className="flex items-center gap-4 relative z-10 w-full mb-2">
        <div className={`p-3 rounded-xl border backdrop-blur-md shadow-inner transition-transform group-hover:scale-105`} style={{ backgroundColor: `color-mix(in srgb, var(--${color}) 15%, transparent)`, borderColor: `color-mix(in srgb, var(--${color}) 30%, transparent)`, color: `var(--${color})` }}>
           {icon}
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">{label}</p>
          <div className="flex items-baseline gap-2 mt-0.5">
             <p className="text-3xl font-black text-white font-heading tracking-tight drop-shadow-md transition-colors" style={{ textShadow: `0 0 15px color-mix(in srgb, var(--${color}) 30%, transparent)` }}>{value}</p>
          </div>
        </div>
      </div>
      {sub && <p className="text-[10px] text-slate-400 mt-2 font-black uppercase tracking-widest relative z-10 bg-black/50 w-fit px-2 py-1 rounded inline-block border border-white/5">{sub}</p>}
    </motion.div>
  );
}

const CustomTooltipStyle = {
  contentStyle: { backgroundColor: "rgba(5,5,5,0.85)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "11px", backdropFilter: "blur(12px)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", textTransform: "uppercase" as const, fontWeight: "bold" },
  itemStyle: { fontSize: "12px", fontWeight: 900, fontFamily: "var(--font-heading)" },
};

export default function AnalyticsCharts({ venueId }: { venueId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["predictionGraph", venueId],
    queryFn: async () => {
      if (!venueId) return null;
      const res = await api.get(`/prediction/graph/${venueId}`);
      return res.data;
    },
    enabled: !!venueId,
    refetchInterval: 60000,
    staleTime: 55000,
    retry: false,
  });

  if (!venueId) {
    return (
      <div className="flex flex-col items-center justify-center p-16 glass-panel border border-white/5 rounded-3xl mt-8">
        <ShieldAlert className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-white text-xl font-black tracking-[0.2em] uppercase mb-2">Matrix Target Required</h3>
        <p className="text-slate-500 font-mono text-sm max-w-sm text-center">Please initialize a coordinate node to inject telemetry into the prediction interface.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 glass-panel border border-white/5 rounded-3xl mt-8 shadow-[inset_0_0_30px_rgba(255,255,255,0.02)]">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin drop-shadow-[0_0_15px_rgba(99,102,241,0.5)] mb-4" />
        <span className="text-indigo-400 font-black tracking-[0.2em] uppercase animate-pulse text-sm">Synchronizing Intelligence...</span>
      </div>
    );
  }

  if (error || !data || data.status === "graph_generation_failed") {
    return (
      <div className="flex flex-col items-center justify-center p-16 glass-panel border border-rose-500/20 rounded-3xl mt-8 text-center shadow-[inset_0_0_30px_rgba(244,63,94,0.05)]">
        <div className="p-4 bg-rose-950/40 rounded-2xl border border-rose-500/30 mb-4 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
          <AlertTriangle className="w-10 h-10 text-rose-500" />
        </div>
        <h3 className="text-white text-xl font-black tracking-[0.2em] uppercase mb-2">Insufficient Telemetry</h3>
        <p className="text-slate-400 font-mono text-sm max-w-md">
          Detection pipelines failed to return statistical volume array. Ensure connected cameras are transmitting valid frames to the core.
        </p>
      </div>
    );
  }

  // ── Build unified timeline ──────────────────────────────────────────────
  const historical = data.historical ?? {};
  const forecast   = data.forecast   ?? {};
  const meta       = data.meta       ?? {};

  const histData: any[] = (historical.timestamps ?? []).map((ts: string, i: number) => ({
    time:     format(new Date(ts), "HH:mm"),
    fullTime: ts,
    riskScore:   historical.risk_scores?.[i]       ?? null,
    crowdCount:  historical.crowd_counts?.[i]       ?? null,
    occupancy:   historical.occupancy_percents?.[i] ?? null,
    type: "historical",
  }));

  const fcastData: any[] = (forecast.timestamps ?? []).map((ts: string, i: number) => ({
    time:       format(new Date(ts), "HH:mm"),
    fullTime:   ts,
    predicted:  forecast.predicted_scores?.[i]    ?? null,
    upperBound: forecast.upper_band?.[i]           ?? null,
    lowerBound: forecast.lower_band?.[i]           ?? null,
    escalation: forecast.escalation_probs?.[i]     ?? null,
    type: "forecast",
  }));

  const mergedRisk = [
    ...histData.map(d => ({ time: d.time, historical: d.riskScore, predicted: null, upper: null, lower: null })),
    ...fcastData.map(d => ({ time: d.time, historical: null, predicted: d.predicted, upper: d.upperBound, lower: d.lowerBound })),
  ];

  const escalationRaw = data.escalation ?? {};
  const escalationTimestamps: string[] = escalationRaw.timestamps ?? [];
  const escalationProbabilities: number[] = escalationRaw.probabilities ?? [];
  const escalationSource: string = escalationRaw.source ?? "unknown";

  const escalationData = escalationTimestamps.map((ts: string, i: number) => ({
    time: (() => { try { return format(new Date(ts), "HH:mm"); } catch { return ts; } })(),
    probability: escalationProbabilities[i] != null ? Math.round(escalationProbabilities[i] * 100) : 0,
  })).filter(d => d.probability !== null);

  const lastHist = histData[histData.length - 1];
  const avgRisk  = histData.length ? Math.round(histData.reduce((a, d) => a + (d.riskScore ?? 0), 0) / histData.length) : 0;
  const peakCount = histData.length ? Math.max(...histData.map(d => d.crowdCount ?? 0)) : 0;
  const currentOcc = lastHist?.occupancy != null ? Math.round(lastHist.occupancy) : null;
  const predictedPeak = fcastData.length ? Math.max(...fcastData.map(d => d.predicted ?? 0)) : 0;
  const confidence = meta.confidence ? `${Math.round(meta.confidence * 100)}%` : "N/A";
  const model = meta.model_used?.toUpperCase() ?? "HYBRID";

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={{
         hidden: { opacity: 0 },
         visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
      }}
      className="space-y-8"
      style={{
        '--cyan-400': '#22d3ee',
        '--indigo-400': '#818cf8',
        '--amber-400': '#fbbf24',
        '--emerald-400': '#34d399',
      } as React.CSSProperties}
    >

      {/* ── Summary Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <StatCard label="Avg Risk Score" value={avgRisk} sub="Historical Session" icon={<Activity className="w-5 h-5" />} color="cyan-400" />
        <StatCard label="Peak Detection" value={peakCount} sub="Subjects Scanned" icon={<Users className="w-5 h-5" />} color="indigo-400" />
        <StatCard label="Matrix Occupancy" value={currentOcc !== null ? `${currentOcc}%` : "N/A"} sub="Of Total Capacity" icon={<TrendingUp className="w-5 h-5" />} color="amber-400" />
        <StatCard label="Core Engine" value={model} sub={`Certainty: ${confidence}`} icon={<Zap className="w-5 h-5" />} color="emerald-400" />
      </div>

      {/* ── Charts grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">

        {/* 1. Risk Score: Historical + Forecast */}
        <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-3xl p-6 lg:p-8 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.02] to-transparent pointer-events-none"></div>
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="flex justify-between items-start mb-6 relative z-10">
             <div>
                <h3 className="text-sm font-black tracking-[0.1em] text-white uppercase drop-shadow-md">Trajectory Projection</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Observed vs Extrapolated</p>
             </div>
             <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 shadow-[inset_0_0_10px_rgba(99,102,241,0.1)]">
               {model} [{confidence}]
             </span>
          </div>
          
          <div className="h-[280px] relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mergedRisk} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gHist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFcast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} domain={[0, 100]} dx={-10} />
                <Tooltip {...CustomTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: "10px", fontWeight: "bold", fontFamily: "var(--font-mono)", textTransform: "uppercase", color: "#94a3b8" }} />
                <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 4" opacity={0.5} label={{ value: "ELEVATED", fill: "#f59e0b", fontSize: 9, fontWeight: 900, position: 'insideTopLeft' }} />
                <ReferenceLine y={90} stroke="#f43f5e" strokeDasharray="4 4" opacity={0.5} label={{ value: "CRITICAL", fill: "#f43f5e", fontSize: 9, fontWeight: 900, position: 'insideTopLeft' }} />
                <Area type="monotone" dataKey="historical" name="Observed" stroke="#22d3ee" strokeWidth={3} fillOpacity={1} fill="url(#gHist)" dot={false} connectNulls activeDot={{ r: 6, fill: '#22d3ee', stroke: '#000', strokeWidth: 2 }} />
                <Area type="monotone" dataKey="predicted" name="AI Extrapolation" stroke="#818cf8" strokeWidth={3} strokeDasharray="6 6" fillOpacity={1} fill="url(#gFcast)" dot={false} connectNulls />
                <Area type="monotone" dataKey="upper" name="Upper Var" stroke="#818cf8" strokeWidth={1} strokeDasharray="2 4" fillOpacity={0} dot={false} connectNulls opacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 2. Crowd Count (people detected) */}
        <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-3xl p-6 lg:p-8 relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="flex justify-between items-start mb-6">
             <div>
                <h3 className="text-sm font-black tracking-[0.1em] text-white uppercase drop-shadow-md">Active Subjects</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Live Volume Detection</p>
             </div>
          </div>
          
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={histData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} dx={-10} />
                <Tooltip {...CustomTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: "10px", fontWeight: "bold", fontFamily: "var(--font-mono)", textTransform: "uppercase" }} />
                <Area type="monotone" dataKey="crowdCount" name="Identified Subjects" stroke="#34d399" strokeWidth={3} fillOpacity={1} fill="url(#gCount)" dot={false} activeDot={{ r: 6, fill: '#34d399', stroke: '#000', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 3. Occupancy % */}
        <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-3xl p-6 lg:p-8 relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="flex justify-between items-start mb-6">
             <div>
                <h3 className="text-sm font-black tracking-[0.1em] text-white uppercase drop-shadow-md">Matrix Density</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Percentage of Absolute Capacity</p>
             </div>
          </div>
          
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={histData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} domain={[0, 100]} unit="%" dx={-10} />
                <Tooltip {...CustomTooltipStyle} formatter={(v: any) => [`${v?.toFixed?.(1) ?? v}%`, "Density"]} />
                <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 4" opacity={0.5} />
                <ReferenceLine y={90} stroke="#f43f5e" strokeDasharray="4 4" opacity={0.5} />
                <Line type="monotone" dataKey="occupancy" name="Physical Density %" stroke="#fbbf24" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#fbbf24', stroke: '#000', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 4. Escalation Probability Bars - always rendered */}
        <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-3xl p-6 lg:p-8 relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/40 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="flex justify-between items-start mb-6">
             <div>
                <h3 className="text-sm font-black tracking-[0.1em] text-white uppercase drop-shadow-md">Escalation Threat</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Incident Probability Variance</p>
             </div>
             <span className={`text-[10px] font-black tracking-widest px-3 py-1.5 rounded-lg border uppercase shadow-[inset_0_0_10px_rgba(255,255,255,0.05)] ${
              escalationSource === "forecast"
                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
             }`}>
               {escalationSource === "forecast" ? "FORECAST MATRIX" : "DERIVED MATRIX"}
             </span>
          </div>
          
          <div className="h-[280px]">
            {escalationData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={escalationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} domain={[0, 100]} unit="%" dx={-10} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    {...CustomTooltipStyle}
                    formatter={(v: any) => [`${v}%`, "Threat Lvl"]}
                  />
                  <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="4 4" opacity={0.6} label={{ value: "50% THRESHOLD", fill: "#f43f5e", fontSize: 9, fontWeight: 900, position: 'insideTopLeft' }} />
                  <Bar dataKey="probability" name="Escalation Threat" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                <div className="text-center">
                  <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-mono text-xs uppercase tracking-widest">Awaiting Telemetry Initialization...</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

      </div>

      {/* ── Meta info bar ─────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="glass-panel border border-white/5 rounded-2xl px-6 py-4 flex flex-wrap items-center gap-6 lg:gap-10 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] relative overflow-hidden group">
        <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <span>Core Engine: <span className="text-cyan-400 drop-shadow-sm ml-1">{model}</span></span>
        <span>Projection Horizon: <span className="text-indigo-400 drop-shadow-sm ml-1">{meta.horizon_minutes ?? 30} MIN</span></span>
        <span>Array Volume: <span className="text-emerald-400 drop-shadow-sm ml-1">{histData.length} OBSERVED / {fcastData.length} EXTRAPOLATED</span></span>
        <span>Sys Time: <span className="text-slate-300 drop-shadow-sm ml-1 bg-white/5 px-2 py-1 rounded border border-white/10">{data.generated_at ? format(new Date(data.generated_at), "HH:mm:ss") : "–"}</span></span>
        {meta.predictive_peak && (
          <span className="ml-auto px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 shadow-[inset_0_0_10px_rgba(251,191,36,0.1)] text-amber-500">
            Absolute Predictive Maximum: <span className="text-amber-400 ml-1 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]">{Math.round(meta.predictive_peak)}</span>
          </span>
        )}
      </motion.div>

    </motion.div>
  );
}
