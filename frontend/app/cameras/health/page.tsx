"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Camera,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Shield,
  ShieldAlert,
  Clock,
  MapPin,
  Loader2,
  RotateCcw,
  Sun,
  Server
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { api } from "@/services/api";

// ───────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────
interface CameraHealth {
  camera_id: string;
  name: string;
  venue_id: string;
  location: string;
  health_status: string;
  is_online: boolean;
  is_active: boolean;
  monitoring_active: boolean;
  frame_issue_count: number;
  frame_buffer_size: number;
  issue_confidence: number | null;
  issue: string;
  last_frame_at: string | null;
  last_heartbeat_at: string | null;
}

// ───────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode; pulse: boolean }
> = {
  healthy: {
    label: "Healthy",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    pulse: false,
  },
  offline: {
    label: "Offline",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/40",
    icon: <WifiOff className="w-4 h-4 text-rose-400" />,
    pulse: true,
  },
  black_screen: {
    label: "Black Screen",
    color: "text-slate-400",
    bg: "bg-slate-700/30",
    border: "border-slate-500/40",
    icon: <Eye className="w-4 h-4 text-slate-400" />,
    pulse: true,
  },
  lens_covered: {
    label: "Lens Covered",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    icon: <EyeOff className="w-4 h-4 text-amber-400" />,
    pulse: true,
  },
  blurred: {
    label: "Blurred / Dusty",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    icon: <Sun className="w-4 h-4 text-indigo-400" />,
    pulse: true,
  },
  rotated: {
    label: "Rotated",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: <RotateCcw className="w-4 h-4 text-orange-400" />,
    pulse: false,
  },
  warning: {
    label: "Warning",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
    pulse: false,
  },
  unknown: {
    label: "Unknown",
    color: "text-slate-500",
    bg: "bg-slate-800/40",
    border: "border-slate-700/40",
    icon: <Shield className="w-4 h-4 text-slate-500" />,
    pulse: false,
  },
  // Newly initialised camera or after restart — worker is connected but hasn't confirmed health yet
  warming_up: {
    label: "Warming Up",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-dashed border-cyan-500/40",
    icon: <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />,
    pulse: false,
  },
};

function getStatusConfig(cam: CameraHealth) {
  // If camera is registered and online but worker has never processed a frame, use warming_up
  if (cam.is_online && !cam.monitoring_active && cam.health_status === "unknown") {
    return STATUS_CONFIG.warming_up;
  }
  return STATUS_CONFIG[cam.health_status] ?? STATUS_CONFIG.unknown;
}

function formatTime(ts: string | null) {
  if (!ts) return "Never";
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

// ───────────────────────────────────────────────────
// Summary Bar
// ───────────────────────────────────────────────────
function SummaryBar({ cameras }: { cameras: CameraHealth[] }) {
  const counts = cameras.reduce(
    (acc, c) => {
      const s = c.health_status;
      if (s === "healthy") acc.healthy++;
      else if (s === "offline") acc.offline++;
      else if (c.is_online && !c.monitoring_active && s === "unknown") acc.warmingUp++;
      else acc.warning++;
      return acc;
    },
    { healthy: 0, offline: 0, warning: 0, warmingUp: 0 }
  );

  const pills = [
    { label: "Healthy Nodes",    count: counts.healthy,       color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
    { label: "Degraded Status",  count: counts.warning,       color: "text-amber-400",   bg: "bg-amber-500/10",  border: "border-amber-500/30" },
    { label: "Critical Offline", count: counts.offline,       color: "text-rose-400",    bg: "bg-rose-500/10",   border: "border-rose-500/30" },
    { label: "Warming Up",       count: counts.warmingUp,     color: "text-cyan-400",    bg: "bg-cyan-500/10",   border: "border-cyan-500/40" },
    { label: "Total Monitored",  count: cameras.length,       color: "text-slate-300",   bg: "bg-white/5",       border: "border-white/10" },
  ];

  return (
    <div className="flex flex-wrap gap-4 mb-8">
      {pills.map((p) => (
        <div key={p.label} className={`flex flex-col gap-1 px-5 py-3 rounded-2xl border ${p.bg} ${p.border} backdrop-blur-md shadow-sm relative overflow-hidden group min-w-[140px]`}>
          <div className="absolute inset-x-0 top-0 h-[1px] bg-white opacity-20" />
          <span className={`text-3xl font-black font-heading ${p.color} tracking-tight group-hover:drop-shadow-md transition-all`}>{p.count}</span>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────
// Camera Card — no variant inheritance needed
// ───────────────────────────────────────────────────
function CameraCard({ cam, index }: { cam: CameraHealth; index: number }) {
  const cfg = getStatusConfig(cam);
  const isWarmingUp = cam.is_online && !cam.monitoring_active && cam.health_status === "unknown";
  // Show partial-issue bar when frame_issue_count > 0 but camera isn't yet confirmed as bad
  const hasPartialIssues = cam.frame_issue_count > 0 && cam.health_status === "healthy" && cam.frame_buffer_size > 0;
  const partialPct = cam.frame_buffer_size > 0 ? Math.round((cam.frame_issue_count / cam.frame_buffer_size) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: "easeOut" }}
      className={`relative rounded-2xl border ${cfg.border} bg-[#050505] backdrop-blur-2xl p-6 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300 overflow-hidden group shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] ${
        isWarmingUp ? "opacity-90" : ""
      }`}
    >
      {/* Glow blob */}
      <div
        className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[40px] opacity-10 transition-opacity duration-700 group-hover:opacity-30 ${cfg.bg} pointer-events-none`}
      />

      {/* Status indicator dot top right */}
      {cfg.pulse ? (
        <span className="absolute top-5 right-5 flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.bg}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.color}`} />
        </span>
      ) : (
        <span className={`absolute top-5 right-5 w-2 h-2 rounded-full border border-current ${cfg.color}`} />
      )}

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${cfg.border} ${cfg.bg} flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform`}>
          <Server className={`w-6 h-6 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h3 className="text-base font-black text-white truncate tracking-wider drop-shadow-sm">{cam.name}</h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] flex items-center gap-1.5 mt-1.5 truncate">
            <MapPin className="w-3 h-3 text-slate-600" />
            <span className="truncate">{cam.location || "Unknown Sector"}</span>
          </p>
        </div>
      </div>

      {/* Metric Grid inside Card */}
      <div className="grid grid-cols-2 gap-3 mt-2">
         <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-white/5 border border-white/5">
            <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Last Frame</span>
            <span className="text-xs font-mono font-bold text-slate-300">{formatTime(cam.last_frame_at)}</span>
         </div>
         <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-white/5 border border-white/5">
            <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest flex items-center gap-1"><Wifi className="w-3 h-3" /> Heartbeat</span>
            <span className="text-xs font-mono font-bold text-slate-300">{formatTime(cam.last_heartbeat_at)}</span>
         </div>
      </div>

      {/* Partial issue bar — shown when issues appear in buffer but aren't yet confirmed */}
      {hasPartialIssues && (
        <div className="px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase font-black text-amber-500 tracking-widest">Intermittent Issues</span>
            <span className="text-[9px] font-mono text-amber-400">{partialPct}% of frames</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500/70 transition-all duration-500"
              style={{ width: `${partialPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Badge & Issue Footer */}
      <div className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-2">
         <div className="flex items-center gap-2 flex-wrap">
           <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cfg.bg} border ${cfg.border} w-fit`}>
             {cfg.icon}
             <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${cfg.color}`}>{cfg.label}</span>
           </div>
           {/* Monitoring active badge */}
           {!isWarmingUp && (
             <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${
               cam.monitoring_active
                 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                 : "bg-slate-800/50 border-slate-700/30 text-slate-600"
             }`}>
               <span className={`w-1.5 h-1.5 rounded-full ${
                 cam.monitoring_active ? "bg-emerald-500 animate-pulse" : "bg-slate-600"
               }`} />
               {cam.monitoring_active ? "Live" : "Idle"}
             </div>
           )}
           {/* Confidence badge for confirmed issues */}
           {cam.issue_confidence !== null && cam.issue_confidence !== undefined && cam.health_status !== "healthy" && (
             <span className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
               {Math.round(cam.issue_confidence * 100)}% conf
             </span>
           )}
         </div>
         {cam.issue && cam.health_status !== "healthy" && (
           <p className="text-[11px] text-slate-400 font-medium leading-relaxed font-mono line-clamp-2 mt-1 px-1">
             <span className="text-rose-400 font-bold opacity-80 mr-1">SYS_ERR:</span>{cam.issue}
           </p>
         )}
         {isWarmingUp && (
           <p className="text-[10px] text-cyan-400 font-mono mt-1 px-1 animate-pulse">
             Worker connected — buffering frames for health analysis...
           </p>
         )}
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────
export default function CameraHealthPage() {
  const { t } = useTranslation();
  const [cameras, setCameras] = useState<CameraHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [filter, setFilter] = useState<"all" | "healthy" | "issues">("all");

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/cameras/health/all");
      setCameras(Array.isArray(res.data) ? res.data : []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Failed to fetch camera health", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Advanced technique: Poll every 5 seconds for a true live feel
    const id = setInterval(fetchHealth, 5_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const filtered = cameras.filter((c) => {
    if (filter === "healthy") return c.health_status === "healthy";
    if (filter === "issues") return c.health_status !== "healthy";
    return true;
  });

  const hasIssues = cameras.some((c) => c.health_status !== "healthy" && c.health_status !== "unknown");

  const filterTabs = [
    { key: "all" as const, label: t("common.all") || "All" },
    { key: "healthy" as const, label: `✅ ${t("cameraHealth.healthy") || "Healthy"}` },
    { key: "issues" as const, label: `🚨 ${t("alerts.high") || "Issues"}` },
  ];

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 relative overflow-hidden">

      {/* Background Matrix Effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.015)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none -z-10 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_80%,transparent_100%)]"></div>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 mt-2 relative z-10">
        <div className="flex items-center gap-5">
          {hasIssues ? (
            <div className="p-3 bg-rose-950/40 backdrop-blur-md border border-rose-500/30 rounded-2xl flex-shrink-0 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
              <ShieldAlert className="w-8 h-8 text-rose-400" />
            </div>
          ) : (
            <div className="p-3 bg-emerald-950/40 backdrop-blur-md border border-emerald-500/30 rounded-2xl flex-shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <Shield className="w-8 h-8 text-emerald-400" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black tracking-[0.1em] text-white flex gap-3 font-heading uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
              {t("cameraHealth.title") || "Camera Health Monitor"}
            </h1>
            <p className="text-sm font-bold text-slate-400 mt-2 tracking-widest uppercase">
              {t("cameraHealth.subtitle") || "Real-time hardware diagnostics for all surveillance nodes."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 glass-panel px-4 py-2 rounded-xl relative overflow-hidden">
          {/* Animated background progress bar to indicate live polling */}
          <div className="absolute left-0 bottom-0 h-[2px] bg-cyan-500/50 animate-[scan_5s_linear_infinite]" />
          
          <span className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]" suppressHydrationWarning>
            SYNC: {lastRefresh ? lastRefresh.toLocaleTimeString() : "--:--:--"}
          </span>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 hover:bg-cyan-900/40 hover:border-cyan-500/40 text-cyan-500 text-[10px] font-black uppercase tracking-widest transition-all shadow-[inset_0_0_10px_rgba(34,211,238,0.05)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            LIVE
          </button>
        </div>
      </div>

      {/* Summary bar — always rendered once loading is done */}
      {!loading && (
        <div className="relative z-10 w-full mb-8">
          <SummaryBar cameras={cameras} />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-8 relative z-10 glass-panel w-fit p-1.5 rounded-2xl">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-[0.15em] transition-all duration-300 border ${
              filter === tab.key
                ? "bg-cyan-500 border-cyan-400 text-black shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                : "bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — direct conditional rendering, NO AnimatePresence wrapping the whole block */}
      <div className="relative z-10">
        {loading ? (
          /* Loading state */
          <div className="flex items-center justify-center min-h-[400px] glass-panel rounded-3xl border border-white/5">
            <div className="flex flex-col items-center gap-5">
              <Loader2 className="w-12 h-12 text-cyan-500 animate-spin drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
              <p className="text-cyan-500 text-sm font-black tracking-widest uppercase animate-pulse">
                {t("cameraHealth.loading") || "Loading camera health data..."}
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="flex items-center justify-center min-h-[400px] glass-panel rounded-3xl border border-dashed border-white/20">
            <div className="text-center">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-5 mx-auto w-fit shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                <Camera className="w-12 h-12 text-slate-500" />
              </div>
              <h3 className="text-white text-xl font-black mb-2 tracking-widest uppercase">
                {cameras.length === 0
                  ? t("cameraHealth.noCameras") || "No cameras found"
                  : "No cameras match filter"}
              </h3>
              <p className="text-slate-500 text-sm font-mono max-w-sm mx-auto">
                {cameras.length === 0
                  ? "Connect cameras from the Cameras section to begin monitoring."
                  : "Try selecting a different filter above."}
              </p>
            </div>
          </div>
        ) : (
          /* Camera grid — simple grid, each card self-animates */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((cam, idx) => (
              <CameraCard key={cam.camera_id} cam={cam} index={idx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
