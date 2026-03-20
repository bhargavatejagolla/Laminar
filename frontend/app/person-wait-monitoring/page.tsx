"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Clock, Users, TrendingUp, AlertTriangle, RefreshCw,
  Play, Square, ChevronDown, Wifi, WifiOff, Timer, MapPin,
  Activity, BarChart3, Eye, Plus, Trash2, BellRing,
  Zap, ShieldCheck, ShieldAlert, ShieldOff, ArrowUpRight,
  CheckCircle2, Gauge, List
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useAlerts } from "@/hooks/useAlerts";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell
} from "recharts";
import { useTranslation } from "react-i18next";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface Camera { id: string; name?: string; location_label?: string; status?: string; }
interface TrackRow { track_id: number; dwell_seconds: number; zone: string; bbox: number[]; enter_time?: string | null; last_seen_time?: string | null; }
interface LiveStats {
  people_tracked: number;
  avg_dwell_seconds: number;
  max_dwell_seconds: number;
  tracks: TrackRow[];
}
interface QueueMetrics {
  people_tracked: number;
  current_people_waiting: number;
  avg_zone_wait_seconds: number;
  max_zone_wait_seconds: number;
  throughput_per_minute: number;
  queue_health_score: number;
  congestion_status: "IDLE" | "GOOD" | "SLOW" | "CRITICAL";
}
interface Analytics {
  avg_wait_seconds: number;
  max_wait_seconds: number;
  total_records: number;
  people_currently_waiting: number;
  queue_efficiency_score: number | null;
  top_zones: { zone_name: string; count: number; avg_wait_seconds: number }[];
}
interface HourlyBucket { hour_label: string; avg_wait_seconds: number; count: number; }
interface DwellRecord {
  id: string; tracker_id: number; zone_name: string;
  dwell_seconds: number; alert_triggered: boolean;
  enter_time: string | null; last_seen_time: string | null;
}
interface Zone { id: string; zone_name: string; polygon_coordinates: number[][]; long_wait_threshold_seconds: number; }

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function fmtSecs(s: number): string {
  if (s < 60) return `${Math.floor(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}

function dwellColor(secs: number): string {
  if (secs < 60) return "text-emerald-400";
  if (secs < 300) return "text-amber-400";
  return "text-rose-400";
}
function dwellBg(secs: number): string {
  if (secs < 60) return "bg-emerald-500/10 border-emerald-500/20";
  if (secs < 300) return "bg-amber-500/10 border-amber-500/20";
  return "bg-rose-500/10 border-rose-500/20";
}

function timeToShort(isoStr?: string | null): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function CongestionBadge({ status }: { status: QueueMetrics["congestion_status"] }) {
  const cfg: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
    IDLE:     { icon: <Activity className="w-3 h-3" />, color: "text-slate-400", bg: "bg-slate-800/60", border: "border-slate-700/40" },
    GOOD:     { icon: <ShieldCheck className="w-3 h-3" />, color: "text-emerald-400", bg: "bg-emerald-900/30", border: "border-emerald-500/30" },
    SLOW:     { icon: <ShieldAlert className="w-3 h-3" />, color: "text-amber-400", bg: "bg-amber-900/20", border: "border-amber-500/30" },
    CRITICAL: { icon: <ShieldOff className="w-3 h-3" />, color: "text-rose-400", bg: "bg-rose-900/30", border: "border-rose-500/30" },
  };
  const c = cfg[status] ?? cfg["IDLE"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${c.bg} ${c.border} ${c.color}`}>
      {c.icon}{status}
    </span>
  );
}

function HealthGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 60 ? "#10b981" : pct >= 30 ? "#f59e0b" : "#f43f5e";
  const r = 42, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e3a5f" strokeWidth="8" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <p className="text-2xl font-bold text-white -mt-16 mb-12" style={{ color }}>{pct.toFixed(0)}</p>
    </div>
  );
}

function StatusBadge({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-900/40 text-rose-400 border border-rose-500/30">
      <AlertTriangle className="w-2.5 h-2.5" /> Alert
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-2.5 h-2.5" /> OK
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// Custom tooltip for recharts
// ─────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a1929] border border-[#1a3a5c] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-amber-400 font-bold">{fmtSecs(payload[0]?.value ?? 0)} avg wait</p>
      {payload[1] && <p className="text-slate-500">{payload[1]?.value} records</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────
export default function PersonWaitMonitoringPage() {
  const { t } = useTranslation();
  const { data: globalAlerts } = useAlerts();

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyBucket[]>([]);
  const [records, setRecords] = useState<DwellRecord[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [connected, setConnected] = useState(false);
  const [streamRetryCount, setStreamRetryCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneThreshold, setNewZoneThreshold] = useState(600);
  const [activeTab, setActiveTab] = useState<"live" | "analytics" | "history">("live");

  const imgRef = useRef<HTMLImageElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const alertedTracksRef = useRef<Set<number>>(new Set());
  const cameraId = selectedCamera?.id;

  // ── PAGE LIFECYCLE: activate/deactivate on mount/unmount ──────
  useEffect(() => {
    if (!cameraId) return;
    // Notify backend queue page is active
    authFetch(`${API}/api/v1/dwell/activate/${cameraId}`, { method: "POST" }).catch(() => {});
    return () => {
      // Notify backend queue page closed
      authFetch(`${API}/api/v1/dwell/deactivate/${cameraId}`, { method: "POST" }).catch(() => {});
    };
  }, [cameraId]);

  // Load cameras
  useEffect(() => {
    authFetch(`${API}/api/v1/cameras`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const arr = Array.isArray(data) ? data : (data.cameras || data.items || []);
        setCameras(arr);
        if (arr.length > 0) setSelectedCamera(arr[0]);
      })
      .catch(() => {});
  }, []);

  // On camera change: load zones, start polling
  useEffect(() => {
    if (!cameraId) return;
    loadZones(cameraId);
    loadRecords(cameraId);
    loadAnalytics(cameraId);
    loadHourlyHistory(cameraId);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadStats(cameraId);
      loadMetrics(cameraId);
      loadAnalytics(cameraId);
    }, 3000);

    loadStats(cameraId);
    loadMetrics(cameraId);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [cameraId]);

  // Auto-reconnect stream
  useEffect(() => {
    if (!streaming || connected || !cameraId) return;
    const retryTimer = setTimeout(() => {
      setStreamRetryCount(c => c + 1);
    }, 5000 + streamRetryCount * 2000);
    return () => clearTimeout(retryTimer);
  }, [connected, streaming, cameraId, streamRetryCount]);

  const loadStats = async (id: string) => {
    try {
      const r = await authFetch(`${API}/api/v1/dwell/stats/${id}`);
      if (r.ok) {
        const data: LiveStats = await r.json();
        setStats(data);
        setConnected(true);
        data.tracks.forEach(track => {
          const matchedZone = zones.find(z => z.zone_name === track.zone);
          const threshold = matchedZone ? matchedZone.long_wait_threshold_seconds : 180;
          if (track.dwell_seconds > threshold && !alertedTracksRef.current.has(track.track_id)) {
            toast.error(`${t("personWaitMonitor.dwellViolation")}: #${track.track_id}`, {
              description: `${t("personWaitMonitor.waitingFor")} ${fmtSecs(track.dwell_seconds)} ${t("personWaitMonitor.in")} ${track.zone || "unknown"} (${t("personWaitMonitor.limit")}: ${fmtSecs(threshold)})`,
              duration: 6000,
              icon: <BellRing className="w-4 h-4 text-rose-500" />,
            });
            alertedTracksRef.current.add(track.track_id);
          }
        });
        const currentIds = new Set(data.tracks.map(t => t.track_id));
        alertedTracksRef.current.forEach(id => { if (!currentIds.has(id)) alertedTracksRef.current.delete(id); });
      } else setConnected(false);
    } catch { setConnected(false); }
  };

  const loadMetrics = async (id: string) => {
    try {
      const r = await authFetch(`${API}/api/v1/dwell/metrics/${id}`);
      if (r.ok) setMetrics(await r.json());
    } catch {}
  };

  const loadAnalytics = async (id: string) => {
    try {
      const r = await authFetch(`${API}/api/v1/dwell/analytics/wait-times?camera_id=${id}`);
      if (r.ok) setAnalytics(await r.json());
    } catch {}
  };

  const loadHourlyHistory = async (id: string) => {
    try {
      const r = await authFetch(`${API}/api/v1/dwell/history/hourly?camera_id=${id}&hours=24`);
      if (r.ok) {
        const data = await r.json();
        setHourlyData(data.buckets || []);
      }
    } catch {}
  };

  const loadRecords = async (id: string) => {
    try {
      const r = await authFetch(`${API}/api/v1/dwell/records?camera_id=${id}&limit=30`);
      if (r.ok) setRecords(await r.json());
    } catch {}
  };

  const loadZones = async (id: string) => {
    try {
      const r = await authFetch(`${API}/api/v1/dwell/zones/${id}`);
      if (r.ok) setZones(await r.json());
    } catch {}
  };

  const createZone = async () => {
    if (!cameraId || !newZoneName.trim()) return;
    setLoading(true);
    try {
      const r = await authFetch(`${API}/api/v1/dwell/zones`, {
        method: "POST",
        body: JSON.stringify({
          camera_id: cameraId,
          zone_name: newZoneName.trim(),
          polygon_coordinates: [[0,0],[640,0],[640,480],[0,480]],
          long_wait_threshold_seconds: newZoneThreshold,
        }),
      });
      if (r.ok) {
        toast.success(`Zone "${newZoneName}" created`);
        setNewZoneName(""); setShowAddZone(false); loadZones(cameraId);
      }
    } finally { setLoading(false); }
  };

  const deleteZone = async (zoneId: string, name: string) => {
    if (!cameraId) return;
    await authFetch(`${API}/api/v1/dwell/zones/${zoneId}`, { method: "DELETE" });
    toast.info(`Zone "${name}" removed`);
    loadZones(cameraId);
  };

  const streamSrc = cameraId && streaming
    ? `${API}/api/v1/dwell/stream/${cameraId}${getToken() ? `?token=${getToken()}` : "?anon=1"}&retry=${streamRetryCount}`
    : undefined;

  const cameraLabel = (c: Camera) => c.location_label || c.name || c.id.slice(0, 8);
  const activeSurgeAlerts = (globalAlerts || []).filter(
    (a: any) => a.status !== "resolved" && a.status !== "dismissed" &&
    (a.severity === "critical" || a.risk_level === "critical" || a.severity === "error" || a.severity === "warning")
  );

  const congestion = metrics?.congestion_status ?? "IDLE";
  const healthScore = metrics?.queue_health_score ?? 50;

  // ─────────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────────
  const exportToCSV = () => {
    if (!records || records.length === 0) {
      toast.error("No records available to export");
      return;
    }

    const headers = ["ID", "Tracker ID", "Zone", "Dwell Time (s)", "Alert", "Enter Time", "Last Seen"];
    const rows = records.map(r => [
      r.id,
      r.tracker_id,
      r.zone_name,
      r.dwell_seconds,
      r.alert_triggered ? "Yes" : "No",
      r.enter_time || "—",
      r.last_seen_time || "—"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `laminar_dwell_times_${cameraId}_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Dwell time report downloaded");
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-transparent text-slate-200 font-sans relative">

      {/* ── Header ──────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="glass-panel border-amber-500/20 px-6 py-5 mb-6 mt-4 rounded-2xl flex items-center justify-between flex-wrap gap-3 shadow-[0_0_30px_rgba(245,158,11,0.04)]"
      >
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-500/20 rounded-2xl blur-[15px] animate-pulse" />
            <div className="p-3 bg-amber-950/40 backdrop-blur-md border border-amber-500/40 rounded-2xl relative z-10 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-black text-white tracking-[0.1em] uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]">{t("personWaitMonitor.title")}</h1>
              <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                DWELL INTEL
              </span>
            </div>
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">{t("personWaitMonitor.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CongestionBadge status={congestion} />
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border backdrop-blur-md font-bold uppercase tracking-widest ${connected
            ? "text-emerald-400 border-emerald-500/30 bg-emerald-900/20"
            : "text-slate-500 border-white/10 bg-white/5"}`}>
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connected ? t("queue.live") : t("personWaitMonitor.reconnecting")}
          </div>
          {cameras.length > 0 && (
            <div className="relative">
              <select
                value={selectedCamera?.id || ""}
                onChange={e => {
                  const cam = cameras.find(c => c.id === e.target.value);
                  if (cam) setSelectedCamera(cam);
                }}
                className="appearance-none glass-card border border-white/10 text-sm text-slate-200 rounded-xl px-4 py-2 pr-8 focus:outline-none focus:border-amber-500/50 font-bold"
              >
                {cameras.map(c => (
                  <option key={c.id} value={c.id} className="bg-black">{cameraLabel(c)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          )}
        </div>
      </motion.div>

      {/* Global Security Banner */}
      <AnimatePresence>
        {activeSurgeAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="bg-rose-950/20 border-b border-rose-900/40 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(225,29,72,0.08),transparent)] animate-pulse" style={{ animationDuration: "3s" }} />
            <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/40 animate-pulse shadow-[0_0_15px_rgba(225,29,72,0.5)]">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                    {t("surge.globalSecurityEvent")}
                    <span className="px-2 py-0.5 rounded text-[9px] bg-rose-500/20 border border-rose-500/40 text-rose-300">ACTIVE</span>
                  </h3>
                  <p className="text-xs text-rose-200/60 font-mono mt-0.5">
                    {activeSurgeAlerts.length} {t("surge.activeSurgeAnomaly")}
                  </p>
                </div>
              </div>
              <a href="/surge" className="text-xs font-bold uppercase tracking-widest px-4 py-2 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)]">
                {t("surge.accessDashboard")}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-0 space-y-6">

        {/* ── KPI Stats Grid ─────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
        >
          {[
            { label: t("personWaitMonitor.trackedNow"), value: stats?.people_tracked ?? 0, icon: Users, color: "amber" },
            { label: t("personWaitMonitor.avgWait"), value: stats ? fmtSecs(stats.avg_dwell_seconds) : "—", icon: Timer, color: "cyan" },
            { label: t("personWaitMonitor.maxWait"), value: stats ? fmtSecs(stats.max_dwell_seconds) : "—", icon: TrendingUp, color: "rose" },
            { label: t("personWaitMonitor.totalRecords"), value: analytics?.total_records ?? 0, icon: BarChart3, color: "violet" },
            { label: "Throughput/min", value: metrics?.throughput_per_minute ?? 0, icon: Zap, color: "emerald" },
            { label: "Health Score", value: metrics ? `${healthScore.toFixed(0)}%` : "—", icon: Gauge, color: "sky" },
          ].map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.07 }}
              whileHover={{ y: -3 }}
              className={`glass-panel rounded-2xl p-4 flex items-center gap-3 transition-all cursor-default group relative overflow-hidden
                border-${
                  stat.color === "amber" ? "amber" :
                  stat.color === "cyan" ? "cyan" :
                  stat.color === "rose" ? "rose" :
                  stat.color === "violet" ? "violet" :
                  stat.color === "emerald" ? "emerald" : "sky"
                }-500/20 hover:border-${
                  stat.color === "amber" ? "amber" :
                  stat.color === "cyan" ? "cyan" :
                  stat.color === "rose" ? "rose" :
                  stat.color === "violet" ? "violet" :
                  stat.color === "emerald" ? "emerald" : "sky"
                }-500/40
              `}
            >
              <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-current to-transparent opacity-40 text-${
                stat.color === "amber" ? "amber" :
                stat.color === "cyan" ? "cyan" :
                stat.color === "rose" ? "rose" :
                stat.color === "violet" ? "violet" :
                stat.color === "emerald" ? "emerald" : "sky"
              }-500`} />
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110
                bg-${
                  stat.color === "amber" ? "amber" :
                  stat.color === "cyan" ? "cyan" :
                  stat.color === "rose" ? "rose" :
                  stat.color === "violet" ? "violet" :
                  stat.color === "emerald" ? "emerald" : "sky"
                }-500/10 text-${
                  stat.color === "amber" ? "amber" :
                  stat.color === "cyan" ? "cyan" :
                  stat.color === "rose" ? "rose" :
                  stat.color === "violet" ? "violet" :
                  stat.color === "emerald" ? "emerald" : "sky"
                }-400 border border-${
                  stat.color === "amber" ? "amber" :
                  stat.color === "cyan" ? "cyan" :
                  stat.color === "rose" ? "rose" :
                  stat.color === "violet" ? "violet" :
                  stat.color === "emerald" ? "emerald" : "sky"
                }-500/20`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.15em] truncate">{stat.label}</p>
                <AnimatePresence mode="wait">
                  <motion.p key={String(stat.value)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="text-xl font-black text-white mt-0.5 tracking-tight drop-shadow-sm">{stat.value}</motion.p>
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Main Grid: Feed + Health Panel ─── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Live Feed */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            className="xl:col-span-2 glass-panel border-white/10 rounded-3xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-slate-200 uppercase tracking-tight">{t("personWaitMonitor.liveIntelligence")}</span>
                {streaming && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-900/30 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </motion.span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!streaming && (
                  <span className="text-xs text-slate-500 italic">{t("personWaitMonitor.standby")}</span>
                )}
                <button
                  onClick={() => setStreaming(s => !s)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all active:scale-95
                    ${streaming
                      ? "border-rose-500/30 bg-rose-900/20 text-rose-400 hover:bg-rose-900/40"
                      : "border-emerald-500/30 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40"
                    }`}
                >
                  {streaming ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                  {streaming ? t("personWaitMonitor.stopStream") : t("personWaitMonitor.startStream")}
                </button>
              </div>
            </div>

            <div className="relative bg-black aspect-video group">
              {/* Scanline overlay */}
              <div className="absolute inset-0 pointer-events-none z-10 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

              {streamSrc ? (
                <img
                  ref={imgRef}
                  src={streamSrc}
                  alt="Dwell time annotated feed"
                  className="w-full h-full object-contain"
                  onError={() => setConnected(false)}
                  onLoad={() => setConnected(true)}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-slate-600 text-sm">{t("personWaitMonitor.streamOffline")}</p>
                </div>
              )}

              {/* CAM overlay label */}
              {streamSrc && (
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                  <div className="bg-black/80 backdrop-blur-sm border border-amber-500/30 rounded-md px-2 py-1 text-[10px] font-mono text-amber-400">
                    {t("personWaitMonitor.cameraTest")}: {selectedCamera ? cameraLabel(selectedCamera) : "—"}
                  </div>
                </div>
              )}

              {/* Stats overlay at bottom */}
              {stats && stats.people_tracked > 0 && (
                <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between">
                  <div className="bg-black/80 backdrop-blur-sm border border-slate-700/40 rounded-lg px-3 py-1.5 text-[11px] font-mono text-slate-300 flex items-center gap-3">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span><span className="text-white font-bold">{stats.people_tracked}</span> {t("personWaitMonitor.individualDetected")}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="< 1 min" />
                    <span className="w-2 h-2 rounded-full bg-amber-400" title="1–5 min" />
                    <span className="w-2 h-2 rounded-full bg-rose-400" title="> 5 min" />
                    <span className="text-[9px] text-slate-500 ml-1">wait scale</span>
                  </div>
                </div>
              )}
            </div>

            {/* Dwell Analytics overlay info row */}
            <div className="px-4 py-2.5 border-t border-[#0f2440] bg-[#060f1e]/60 flex items-center gap-6 flex-wrap text-[11px] font-mono text-slate-500">
              <span><span className="text-slate-300">WAIT_TIME</span></span>
              <span>|</span>
              <span><span className="text-slate-300">ZONE_ID</span></span>
              <span>|</span>
              <span><span className="text-slate-300">{t("personWaitMonitor.activeTracks")}</span>: <span className="text-amber-400 font-bold">{stats?.people_tracked ?? 0}</span></span>
              <span>|</span>
              <span><span className="text-slate-300">{t("personWaitMonitor.streamsOk")}</span>: <span className={connected ? "text-emerald-400" : "text-rose-400"}>{connected ? "YES" : "NO"}</span></span>
            </div>
          </motion.div>

          {/* Queue Health Panel */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4">
            {/* Health Score Gauge */}
            <div className="glass-panel border-amber-500/20 rounded-3xl p-5 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 self-start mb-1">
                <Gauge className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-semibold text-slate-300 uppercase tracking-tight">Queue Health</span>
              </div>
              <HealthGauge score={healthScore} />
              <CongestionBadge status={congestion} />
              <div className="w-full grid grid-cols-2 gap-3 mt-2">
                <div className="glass-card rounded-xl p-3 text-center border border-white/10">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-1">In Zone</p>
                  <p className="text-xl font-black text-white">{metrics?.current_people_waiting ?? 0}</p>
                </div>
                <div className="glass-card rounded-xl p-3 text-center border border-white/10">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-1">Throughput/min</p>
                  <p className="text-xl font-black text-emerald-400">{metrics?.throughput_per_minute ?? 0}</p>
                </div>
                <div className="glass-card rounded-xl p-3 text-center border border-white/10">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-1">Avg Wait</p>
                  <p className="text-xl font-black text-amber-400">{metrics ? fmtSecs(metrics.avg_zone_wait_seconds) : "—"}</p>
                </div>
                <div className="glass-card rounded-xl p-3 text-center border border-white/10">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-1">Max Wait</p>
                  <p className="text-xl font-black text-rose-400">{metrics ? fmtSecs(metrics.max_zone_wait_seconds) : "—"}</p>
                </div>
              </div>
            </div>

            {/* Operational Analytics */}
            <div className="glass-panel border-violet-500/20 rounded-3xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-slate-300 uppercase tracking-tight">{t("personWaitMonitor.operationalAnalytics")}</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: t("personWaitMonitor.avgSystemDwell"), value: analytics ? fmtSecs(analytics.avg_wait_seconds) : "9s", color: "text-sky-400" },
                  { label: t("personWaitMonitor.peakObservedDwell"), value: analytics ? fmtSecs(analytics.max_wait_seconds) : "—", color: "text-rose-400" },
                  { label: t("personWaitMonitor.throughput"), value: analytics?.total_records ?? 0, color: "text-emerald-400" },
                  { label: t("personWaitMonitor.effIndex"), value: analytics?.queue_efficiency_score?.toFixed(2) ?? "—", color: "text-amber-400" },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-xs border-b border-[#0f2440] pb-2 last:border-0 last:pb-0">
                    <span className="text-slate-500">{row.label}</span>
                    <span className={`font-bold ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tactical Intelligence - Actionable Recommendations */}
            <div className="glass-panel border-amber-500/30 rounded-3xl p-4 bg-amber-500/5 relative overflow-hidden group shadow-[inset_0_0_20px_rgba(245,158,11,0.05)]">
               <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/40" />
               <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[40px] rounded-full pointer-events-none group-hover:bg-amber-500/10 transition-colors" />
               
               <div className="flex items-center gap-2 mb-3 relative z-10">
                 <ShieldAlert className="w-4 h-4 text-amber-500" />
                 <span className="text-[10px] font-black text-amber-500/80 uppercase tracking-[0.2em]">Tactical Intelligence Proxy</span>
               </div>
               
               <div className="space-y-3 relative z-10">
                 {metrics && (
                    <>
                      {metrics.avg_zone_wait_seconds > 180 ? (
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="flex items-start gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl shadow-[0_5px_15px_rgba(244,63,94,0.1)]">
                          <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 animate-pulse" />
                          <div className="flex-1">
                            <p className="text-[11px] font-black text-white uppercase tracking-tight">V-DEPLOY: COUNTER_EXT</p>
                            <p className="text-[9px] text-rose-300/70 mt-0.5 leading-relaxed">Wait threshold breached. Immediate deployment of +1 tactical analyst for high-density flow management.</p>
                          </div>
                        </motion.div>
                      ) : metrics.current_people_waiting > 10 ? (
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl shadow-[0_5px_15px_rgba(245,158,11,0.1)]">
                          <Zap className="w-4 h-4 text-amber-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-[11px] font-black text-white uppercase tracking-tight">MAN_ACTION: FLOW_OVERSEER</p>
                            <p className="text-[9px] text-amber-300/70 mt-0.5 leading-relaxed">High volume detected in zone matrices. Active personnel realignment suggested to prevent bottleneck.</p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-[11px] font-black text-white uppercase tracking-tight">STATE: OPTIMAL_FLOW</p>
                            <p className="text-[9px] text-emerald-300/70 mt-0.5 leading-relaxed">System performance is nominal. Throughput of {metrics?.throughput_per_minute ?? 0} ppl/min aligns with existing capacity.</p>
                          </div>
                        </motion.div>
                      )}
                    </>
                 )}
                 
                 <div className="pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[9px] text-slate-500 uppercase tracking-[0.15em] font-black">AI PREDICTIVE_ENGINE</p>
                        <span className="text-[8px] text-amber-500 font-bold px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded uppercase">Laminar_V2</span>
                    </div>
                    <p className="text-[10px] text-slate-400 italic font-medium leading-relaxed bg-white/5 p-2 rounded-lg border border-white/5">
                        "Detection of micro-oscillations in crowd velocity suggests a surge event in <span className="text-white font-bold">T+14 min</span>. Prepare backup zones."
                    </p>
                 </div>
               </div>
            </div>
          </motion.div>
        </div>

        {/* ── Tab Navigation ────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-white/10 pb-0">
          {([
            { key: "live", label: "Live Tracks", icon: Users },
            { key: "analytics", label: t("personWaitMonitor.latencyMatrix"), icon: BarChart3 },
            { key: "history", label: "24h History", icon: TrendingUp },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] border-b-2 transition-all ${
                activeTab === tab.key
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ──────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === "live" && (
            <motion.div key="live" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Live Tracks Table */}
              <div className="lg:col-span-2 glass-panel border-white/10 rounded-3xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-2">
                    <List className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-black text-white uppercase tracking-[0.1em]">Live Tracks</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={exportToCSV}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Download CSV
                    </button>
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">updates every 3s</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#0f2440]">
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">ID</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">{t("personWaitMonitor.zone")}</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Enter Time</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Dwell Time</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.tracks && stats.tracks.length > 0 ? (
                        stats.tracks.map(t => (
                          <motion.tr
                            key={t.track_id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="border-b border-[#0a1929]/60 hover:bg-[#0a1929]/40 transition-colors"
                          >
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-slate-300">T_{t.track_id}</span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{t.zone || "—"}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{timeToShort(t.enter_time)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${dwellBg(t.dwell_seconds)} ${dwellColor(t.dwell_seconds)}`}>
                                {fmtSecs(t.dwell_seconds)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${dwellColor(t.dwell_seconds)}`}>
                                {t.dwell_seconds < 60 ? "OK" : t.dwell_seconds < 300 ? "WAITING" : "LONG WAIT"}
                              </span>
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-600 text-sm">
                            No persons currently tracked
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Zone Management + Incident Logs */}
              <div className="space-y-4">
                {/* Virtual Perimeters */}
                <div className="glass-panel border-amber-500/20 rounded-3xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-semibold text-slate-300 uppercase tracking-tight">{t("personWaitMonitor.virtualPerimeters")}</span>
                    </div>
                    <button
                      onClick={() => setShowAddZone(s => !s)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all"
                    >
                      <Plus className="w-3 h-3" /> {t("personWaitMonitor.newZone")}
                    </button>
                  </div>

                  <AnimatePresence>
                    {showAddZone && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="mb-3 space-y-2 border border-[#1a3a5c] rounded-lg p-3 bg-[#081529]/60">
                        <input
                          placeholder={t("personWaitMonitor.zoneName")}
                          value={newZoneName}
                          onChange={e => setNewZoneName(e.target.value)}
                          className="w-full bg-[#0a1929] border border-[#1a3a5c] text-sm text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/50 placeholder-slate-600"
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500 whitespace-nowrap">{t("personWaitMonitor.waitThreshold")}:</label>
                          <input
                            type="number" min={30} max={3600}
                            value={newZoneThreshold}
                            onChange={e => setNewZoneThreshold(Number(e.target.value))}
                            className="flex-1 bg-[#0a1929] border border-[#1a3a5c] text-sm text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/50"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShowAddZone(false)} className="flex-1 text-xs py-1.5 rounded-lg border border-slate-700/40 text-slate-400 hover:text-white transition-all">
                            {t("personWaitMonitor.cancelZone")}
                          </button>
                          <button onClick={createZone} disabled={loading || !newZoneName.trim()}
                            className="flex-1 text-xs py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white font-semibold transition-all disabled:opacity-50">
                            {loading ? <RefreshCw className="w-3 h-3 animate-spin mx-auto" /> : t("personWaitMonitor.createZone")}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {zones.length === 0 ? (
                      <p className="text-xs text-slate-600 text-center py-4">{t("personWaitMonitor.noTrackingVectors")}</p>
                    ) : zones.map(z => (
                      <div key={z.id} className="flex items-center justify-between bg-[#0a1929] border border-[#0f2440] rounded-lg px-3 py-2 group hover:border-amber-500/20 transition-all">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">{z.zone_name}</p>
                          <p className="text-[10px] text-slate-600 font-mono">{t("personWaitMonitor.limit")}: {fmtSecs(z.long_wait_threshold_seconds)}</p>
                        </div>
                        <button onClick={() => deleteZone(z.id, z.zone_name)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-900/20 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent incident log */}
                <div className="glass-panel border-rose-500/20 rounded-3xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span className="text-sm font-semibold text-slate-300 uppercase tracking-tight">{t("personWaitMonitor.incidentLogs")}</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {records.slice(0, 6).length === 0 ? (
                      <p className="text-xs text-slate-600 text-center py-3">No incidents</p>
                    ) : records.slice(0, 6).map(r => (
                      <div key={r.id} className="flex items-center gap-2 text-xs border-b border-[#0a1929] pb-1.5 last:border-0">
                        <span className="font-mono text-slate-500">#{r.tracker_id}</span>
                        <span className="text-slate-400 truncate">{r.zone_name}</span>
                        <span className={`ml-auto font-bold font-mono shrink-0 ${dwellColor(r.dwell_seconds)}`}>{fmtSecs(r.dwell_seconds)}</span>
                        <StatusBadge value={r.alert_triggered} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "analytics" && (
            <motion.div key="analytics" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Zones */}
              <div className="glass-panel border-amber-500/20 rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-tight">{t("personWaitMonitor.latencyMatrix")}</h3>
                </div>
                {analytics?.top_zones && analytics.top_zones.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.top_zones.map((z, i) => (
                      <div key={z.zone_name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-medium">{z.zone_name}</span>
                          <span className={`font-bold font-mono ${dwellColor(z.avg_wait_seconds)}`}>{fmtSecs(z.avg_wait_seconds)}</span>
                        </div>
                        <div className="h-1.5 bg-[#0a1929] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${z.avg_wait_seconds < 60 ? "bg-emerald-500" : z.avg_wait_seconds < 300 ? "bg-amber-500" : "bg-rose-500"}`}
                            style={{ width: `${Math.min(100, (z.avg_wait_seconds / 600) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-600">{z.count} records</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-slate-600 text-sm">No zone data yet</div>
                )}
              </div>

              {/* Full Records Table */}
              <div className="glass-panel border-white/10 rounded-3xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#0f2440] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <List className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-semibold text-slate-200 uppercase tracking-tight">Dwell Records</span>
                  </div>
                  <button onClick={() => cameraId && loadRecords(cameraId)} className="text-slate-500 hover:text-slate-300">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="overflow-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#050f1f]">
                      <tr className="border-b border-[#0f2440]">
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase text-slate-600 tracking-widest">ID</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase text-slate-600 tracking-widest">Zone</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase text-slate-600 tracking-widest">Enter</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase text-slate-600 tracking-widest">Exit</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase text-slate-600 tracking-widest">Dwell</th>
                        <th className="text-left px-4 py-2.5 text-[10px] uppercase text-slate-600 tracking-widest">EVT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map(r => (
                        <tr key={r.id} className="border-b border-[#0a1929]/60 hover:bg-[#0a1929]/30 transition-colors">
                          <td className="px-4 py-2 font-mono text-slate-400">#{r.tracker_id}</td>
                          <td className="px-4 py-2 text-slate-400 max-w-[100px] truncate">{r.zone_name}</td>
                          <td className="px-4 py-2 font-mono text-[#475569]">{timeToShort(r.enter_time)}</td>
                          <td className="px-4 py-2 font-mono text-[#475569]">{timeToShort(r.last_seen_time)}</td>
                          <td className="px-4 py-2"><span className={`font-mono font-bold ${dwellColor(r.dwell_seconds)}`}>{fmtSecs(r.dwell_seconds)}</span></td>
                          <td className="px-4 py-2"><StatusBadge value={r.alert_triggered} /></td>
                        </tr>
                      ))}
                      {records.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-600">No records</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-6">
              {/* 24h Area Chart */}
              <div className="glass-panel border-amber-500/20 rounded-3xl p-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-tight">24-Hour Wait Time History</h3>
                  </div>
                  <button
                    onClick={() => cameraId && loadHourlyHistory(cameraId)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-800/40 transition-all"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>
                {hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={hourlyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dwellGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0f2440" />
                      <XAxis dataKey="hour_label" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                      <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmtSecs(v)} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="avg_wait_seconds" stroke="#f59e0b" strokeWidth={2} fill="url(#dwellGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
                    No historical data available yet
                  </div>
                )}
              </div>

              {/* Volume bar chart */}
              <div className="glass-panel border-violet-500/20 rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-tight">Queue Volume by Hour</h3>
                </div>
                {hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={hourlyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0f2440" />
                      <XAxis dataKey="hour_label" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                      <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {hourlyData.map((entry, i) => (
                          <Cell key={i} fill={entry.count > 5 ? "#7c3aed" : entry.count > 2 ? "#6d28d9" : "#4c1d95"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-32 flex items-center justify-center text-slate-600 text-sm">No volume data</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
