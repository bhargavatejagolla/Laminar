"use client"

import VenueGrid from "@/components/venues/venue-grid"
import {
  Activity, MapPin, BellRing, BarChart3, Camera, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Users, Zap, Wind, Clock,
  ShieldCheck, ShieldAlert, Eye, History
} from "lucide-react"
import DashboardStats from "@/components/dashboard/dashboard-stats"
import AlertPanel from "@/components/alerts/alert-panel"
import IntelligenceGraphs from "@/components/analytics/intelligence-graphs"
import { useTranslation } from "react-i18next"
import { motion, AnimatePresence } from "framer-motion"
import { useZoneIntelligenceSummary } from "@/hooks/useZoneIntelligence"

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
}
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } }
}

// ─────────────────────────────────────────────────────────────────
// Risk badge helper
// ─────────────────────────────────────────────────────────────────
function riskStyle(level: string) {
  switch (level) {
    case "critical": return { border: "border-rose-500/50", bg: "bg-rose-500/8", dot: "bg-rose-500", text: "text-rose-400", badge: "bg-rose-500/20 text-rose-400 border-rose-500/40" }
    case "high":     return { border: "border-orange-500/50", bg: "bg-orange-500/8", dot: "bg-orange-500", text: "text-orange-400", badge: "bg-orange-500/20 text-orange-400 border-orange-500/40" }
    case "medium":   return { border: "border-amber-500/40",  bg: "bg-amber-500/8",  dot: "bg-amber-500",  text: "text-amber-400",  badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" }
    default:         return { border: "border-emerald-500/30", bg: "bg-emerald-500/5", dot: "bg-emerald-500", text: "text-emerald-400", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" }
  }
}

function TrendIcon({ trend }: { trend?: string }) {
  if (trend === "increasing") return <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
  if (trend === "decreasing") return <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
  return <Minus className="w-3.5 h-3.5 text-slate-400" />
}

// ─────────────────────────────────────────────────────────────────
// Per-camera intelligence card
// ─────────────────────────────────────────────────────────────────
function CameraIntelCard({ cam }: { cam: any }) {
  const snap = cam.snapshot
  const risk = snap?.intelligence?.overall_risk_level ?? "low"
  const rs = riskStyle(risk)
  const density = snap?.density?.current ?? 0
  const pred5m = snap?.prediction?.density_5m ?? 0
  const avgDwell = snap?.dwell?.avg_seconds ?? 0
  const flowDir = snap?.flow?.dominant_direction ?? "—"
  const flowIntensity = snap?.flow?.flow_intensity ?? "still"
  const trend = snap?.density?.trend ?? "stable"
  const summary = snap?.intelligence?.summary ?? (cam.status === "offline" ? "Camera offline. No data available." : "Warming up stream...")
  const alertTriggered = snap?.intelligence?.alert_triggered ?? false
  const recommendedAction = snap?.intelligence?.recommended_action
  const factors = snap?.intelligence?.contributing_factors ?? []
  const isOffline = cam.status === "offline"
  const isWarming = cam.status === "warming_up"
  const isSynthesized = snap?.is_synthesized === true

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative rounded-2xl border ${rs.border} ${rs.bg} p-4 backdrop-blur-md overflow-hidden
        ${isOffline ? "opacity-50 grayscale-[60%]" : ""}
        ${risk === "critical" ? "shadow-[0_0_20px_rgba(244,63,94,0.2)] animate-pulse" : ""}
      `}
    >
      {/* Top bar */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="text-xs font-black tracking-widest uppercase text-white truncate">
            {cam.camera_name || `CAM-${cam.camera_id?.slice(0, 6)}`}
          </h3>
          <p className="text-[10px] text-sky-400/80 uppercase tracking-wider truncate mt-0.5">
            {cam.venue_name || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {alertTriggered && <Zap className="w-3.5 h-3.5 text-rose-400 animate-pulse" />}
          {isSynthesized && (
            <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <History className="w-2.5 h-2.5" />
              Historical
            </span>
          )}
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${rs.badge}`}>
            {risk}
          </span>
        </div>
      </div>

      {/* Status / summary */}
      <p className="text-[10px] text-slate-400 mb-3 leading-relaxed line-clamp-2">
        {summary}
      </p>

      {isOffline || isWarming ? (
        <div className="flex items-center gap-3 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
          <Activity className={`w-3 h-3 ${isWarming ? "animate-spin" : ""}`} />
          {isWarming ? (
            <div className="flex flex-col gap-0.5">
              <span>Initializing stream...</span>
              <span className="text-[8px] opacity-60 font-medium">Retrieving history fallback...</span>
            </div>
          ) : "Stream offline"}
        </div>
      ) : (
        <>
          {/* Live metrics grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-black/20 rounded-lg p-2 border border-white/5">
              <p className="text-[8px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1">
                <Users className="w-2.5 h-2.5" /> Now
              </p>
              <p className={`text-lg font-mono font-black ${rs.text}`}>{density}</p>
            </div>
            <div className="bg-black/20 rounded-lg p-2 border border-white/5">
              <p className="text-[8px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1">
                <TrendingUp className="w-2.5 h-2.5" /> 5m
              </p>
              <p className="text-lg font-mono font-black text-white">{pred5m}</p>
            </div>
            <div className="bg-black/20 rounded-lg p-2 border border-white/5">
              <p className="text-[8px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Dwell
              </p>
              <p className="text-lg font-mono font-black text-white">{avgDwell.toFixed(0)}s</p>
            </div>
          </div>

          {/* Flow + Trend */}
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Wind className="w-3 h-3" />
              <span>{flowDir} · {flowIntensity}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <TrendIcon trend={trend} />
              <span>{trend}</span>
            </div>
          </div>

          {/* Contributing factors */}
          {factors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {factors.slice(0, 3).map((f: string, i: number) => (
                <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5 truncate max-w-[120px]">
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Recommended action */}
          {recommendedAction && (
            <div className="mt-2 flex items-start gap-1.5 bg-black/20 rounded-lg p-2 border border-white/5">
              <ShieldCheck className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-0.5" />
              <p className="text-[9px] text-cyan-300 leading-relaxed">{recommendedAction}</p>
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Multi-camera live intelligence section
// ─────────────────────────────────────────────────────────────────
function LiveIntelligencePanel() {
  const { data, isLoading } = useZoneIntelligenceSummary(3000)

  const cameras = data?.cameras ?? []
  const activeCams = cameras.filter((c: any) => c.status === "active")
  const totalPeople = activeCams.reduce((s: number, c: any) => s + (c.snapshot?.density?.current ?? 0), 0)
  const totalPred5m = activeCams.reduce((s: number, c: any) => s + (c.snapshot?.prediction?.density_5m ?? 0), 0)
  const criticalCount = data?.risk_breakdown?.critical ?? 0
  const highCount = data?.risk_breakdown?.high ?? 0
  const recentAlerts = data?.recent_alerts ?? 0

  const overallRisk = criticalCount > 0 ? "critical" : highCount > 0 ? "high" : "low"
  const rs = riskStyle(overallRisk)

  if (isLoading) {
    return (
      <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-3">
        {[1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-white/3 animate-pulse" />)}
      </div>
    )
  }

  if (cameras.length === 0) {
    return (
      <div className="glass-panel rounded-2xl border border-dashed border-slate-700/60 p-10 flex flex-col items-center justify-center text-center">
        <Camera className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="text-slate-300 font-semibold mb-1">No Cameras Configured</h3>
        <p className="text-slate-500 text-sm">Add cameras in the Cameras page to see live intelligence here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Aggregate intelligence bar */}
      <div className={`rounded-2xl border ${rs.border} ${rs.bg} p-4 backdrop-blur-md`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-black tracking-widest uppercase text-white">
              Mission Overview · {cameras.length} Camera{cameras.length !== 1 ? "s" : ""}
            </span>
          </div>
          <span className={`text-[9px] font-black uppercase px-2 py-1 rounded border ${rs.badge} flex items-center gap-1.5`}>
            {criticalCount > 0 && <ShieldAlert className="w-3 h-3" />}
            {overallRisk} overall risk
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Active Cameras", value: activeCams.length, color: "text-emerald-400" },
            { label: "Total People", value: totalPeople, color: "text-cyan-400" },
            { label: "Predicted (5m)", value: totalPred5m, color: "text-indigo-400" },
            { label: "Active Alerts", value: recentAlerts, color: recentAlerts > 0 ? "text-rose-400" : "text-slate-400" },
            { label: "High+ Risk Cams", value: criticalCount + highCount, color: criticalCount > 0 ? "text-rose-400" : "text-orange-400" },
          ].map(stat => (
            <div key={stat.label} className="bg-black/25 rounded-xl p-2.5 border border-white/5 text-center">
              <p className="text-[8px] uppercase tracking-widest text-slate-500 font-bold mb-1">{stat.label}</p>
              <p className={`text-xl font-mono font-black ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-camera intelligence cards */}
      <div className={`grid gap-4 ${cameras.length === 1 ? "grid-cols-1" : cameras.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
        <AnimatePresence>
          {cameras.map((cam: any) => (
            <CameraIntelCard key={cam.camera_id} cam={cam} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Command Center Page
// ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="relative z-10">

        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10 mt-4">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl border border-cyan-500/30 radar-sweep" />
              <div className="p-3.5 bg-cyan-950/40 backdrop-blur-md border border-cyan-500/40 rounded-2xl shadow-[0_0_25px_rgba(34,211,238,0.2)] relative z-10">
                <BarChart3 className="w-8 h-8 text-cyan-400" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-[0.1em] text-white mb-2 font-heading uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                {t("dashboard.title") || "Command Center"}
              </h1>
              <p className="text-sm font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-glow" />
                {t("dashboard.subtitle") || "Global Operations Network"}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-[rgba(16,185,129,0.1)] border border-emerald-500/30 text-sm font-black text-emerald-400 tracking-widest uppercase shadow-[inset_0_0_15px_rgba(16,185,129,0.1)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />
            </span>
            Live · Refreshing every 3s
          </div>
        </motion.div>

        {/* Top Level Metrics */}
        <motion.div variants={itemVariants}>
          <DashboardStats />
        </motion.div>

        {/* Main Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8 mt-4">

          {/* Left — Intelligence + Analytics */}
          <div className="xl:col-span-2 space-y-6">

            {/* Live Multi-Camera Intelligence */}
            <div className="glass-panel p-6 rounded-2xl border border-cyan-500/20 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-40" />
              <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-5">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                  <Activity className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-widest text-white uppercase">Live Intelligence · All Cameras</h2>
                  <p className="text-[10px] text-cyan-500/80 uppercase tracking-widest">Real-time crowd analysis · 3s refresh</p>
                </div>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <LiveIntelligencePanel />
            </div>

            {/* Trend Chart */}
            <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
              <IntelligenceGraphs />
            </div>

            {/* Venues */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
                <div className="p-2 rounded-lg bg-slate-500/10 border border-slate-500/20">
                  <MapPin className="w-5 h-5 text-slate-400" />
                </div>
                <h2 className="text-base font-bold tracking-widest text-slate-300 uppercase">Registered Venues</h2>
              </div>
              <VenueGrid />
            </div>

          </div>

          {/* Right — Alerts */}
          <div className="xl:col-span-1 space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-rose-500/20 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
              <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                  <BellRing className="w-5 h-5 text-rose-400" />
                </div>
                <h2 className="text-base font-bold tracking-widest text-white uppercase">
                  {t("dashboard.criticalAlerts") || "Smart Alerts"}
                </h2>
              </div>
              <div className="h-[calc(100vh-380px)] overflow-y-auto pr-2 custom-scrollbar">
                <AlertPanel />
              </div>
            </div>
          </div>

        </motion.div>
      </motion.div>
    </div>
  )
}