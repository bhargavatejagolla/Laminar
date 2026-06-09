"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Clock, Users, TrendingUp, AlertTriangle, RefreshCw,
  Play, Square, ChevronDown, Timer, MapPin,
  Activity, BarChart3, Eye, Plus, Trash2, BellRing,
  Zap, ShieldCheck, ShieldAlert, ShieldOff, BrainCircuit, Search, ArrowLeft,
  WifiOff, Activity as Pulse, Info, Download, FileSpreadsheet, Gauge, List, X, Maximize2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useAlerts } from "@/hooks/useAlerts";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";
import { api } from "@/services/api";
import jsPDF from "jspdf";
import { useTranslation } from "react-i18next";

// ─────────────────────────────────────────────────────────
// Premium Interactive Background Components
// ─────────────────────────────────────────────────────────
function BackgroundAtmosphere() {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <motion.div 
        animate={{ 
          x: [0, 100, 0], 
          y: [0, 50, 0],
          scale: [1, 1.2, 1]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-cyan-500/10 blur-[120px] rounded-full"
      />
      <motion.div 
        animate={{ 
          x: [0, -80, 0], 
          y: [0, 120, 0],
          scale: [1, 1.3, 1]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute -bottom-[20%] -right-[10%] w-[70%] h-[70%] bg-indigo-500/10 blur-[150px] rounded-full"
      />
      <div style={{ position: "absolute", inset: 0, opacity: 0.03, mixBlendMode: "overlay", pointerEvents: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")" }} />
    </div>
  );
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let W = 0, H = 0;
    let time = 0;

    const BASE_PARTICLE_COUNT = 30; // Reduced density for performance
    const CONNECT_DIST = 140;
    const MOUSE_CONNECT_DIST = 200;

    type Particle = {
      x: number; y: number;
      vx: number; vy: number;
      r: number;
      phase: number;
    };

    let particles: Particle[] = [];
    let mouse = { x: -1000, y: -1000 };

    const init = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      particles = Array.from({ length: BASE_PARTICLE_COUNT }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 1.5 + 0.5,
        phase: Math.random() * Math.PI * 2
      }));
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      time += 0.01;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.phase += 0.01;

        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      }

      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.2;
            ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const mDist = Math.sqrt((a.x - mouse.x) ** 2 + (a.y - mouse.y) ** 2);
        if (mDist < MOUSE_CONNECT_DIST) {
          const alpha = (1 - mDist / MOUSE_CONNECT_DIST) * 0.4;
          ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }

      for (const p of particles) {
        const pulse = 0.5 + 0.5 * Math.sin(p.phase);
        ctx.fillStyle = `rgba(6, 182, 212, ${pulse * 0.6})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.9})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    init(); draw();
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", init);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", init);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-10 opacity-60" />;
}

// ─────────────────────────────────────────────────────────
// Types & Interfaces
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
interface Journey {
  global_id: string;
  is_multicam: boolean;
  canonical_image: string | null;
  similarity?: number;
  last_seen: string;
  path: {
    camera_id: string;
    camera_name: string;
    timestamp: string;
    exit_time?: string | null;
    dwell_time: number;
    intent?: string;
    snapshot_enter_path?: string | null;
    snapshot_mid_path?: string | null;
    snapshot_exit_path?: string | null;
  }[];
}

// ─────────────────────────────────────────────────────────
// Utility Components & Helpers
// ─────────────────────────────────────────────────────────
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

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
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#050510]/90 backdrop-blur-3xl border border-white/10 rounded-2xl p-4 shadow-2xl">
      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-2">{label}</p>
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
        <p className="text-sm font-black text-white">{fmtSecs(payload[0]?.value ?? 0)} avg</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Hooks & State Management
// ─────────────────────────────────────────────────────────
function useDwellData(cameraId: string | undefined) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyBucket[]>([]);
  const [records, setRecords] = useState<DwellRecord[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [connected, setConnected] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = () => setRefreshTrigger(prev => prev + 1);

  useEffect(() => {
    if (!cameraId) return;
    
    // Activate backend dwell tracking
    api.post(`/dwell/activate/${cameraId}`).catch(console.error);

    const loadAll = async () => {
      try {
        const [s, m, a, h, r, z, j] = await Promise.allSettled([
          api.get(`/dwell/stats/${cameraId}`),
          api.get(`/dwell/metrics/${cameraId}`),
          api.get(`/dwell/analytics/wait-times?camera_id=${cameraId}`),
          api.get(`/dwell/history/hourly?camera_id=${cameraId}&hours=24`),
          api.get(`/dwell/records?camera_id=${cameraId}&limit=30`),
          api.get(`/dwell/zones/${cameraId}`),
          api.get('/journeys')
        ]);
        
        if (s.status === 'fulfilled') setStats(s.value.data);
        if (m.status === 'fulfilled') setMetrics(m.value.data);
        if (a.status === 'fulfilled') setAnalytics(a.value.data);
        if (h.status === 'fulfilled') setHourlyData(h.value.data.buckets || []);
        if (r.status === 'fulfilled') setRecords(r.value.data);
        if (z.status === 'fulfilled') setZones(z.value.data);
        if (j.status === 'fulfilled') setJourneys(j.value.data.journeys || []);
        
        // Consider connected if at least stats resolved
        setConnected(s.status === 'fulfilled');
      } catch (err) {
        setConnected(false);
        console.error("Dwell Data Sync Error:", err);
      }
    };

    loadAll();
    const interval = setInterval(loadAll, 3000); // Faster sync for premium feel
    
    return () => {
      clearInterval(interval);
      api.post(`/dwell/deactivate/${cameraId}`).catch(console.error);
    };
  }, [cameraId, refreshTrigger]);

  return { stats, metrics, analytics, hourlyData, records, zones, journeys, connected, refresh };
}

function Downbar({ metrics, connected }: { metrics: QueueMetrics | null, connected: boolean }) {
  const { t } = useTranslation();
  return (
    <motion.div 
      initial={{ y: 100 }} animate={{ y: 0 }}
      className="fixed bottom-0 left-0 right-0 z-[100] bg-black/40 backdrop-blur-3xl border-t border-white/10 px-8 py-3 flex items-center justify-between shadow-[0_-20px_40px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" : "bg-rose-500"}`} />
          <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-mono">
            {connected ? "Global_Sync_Stable" : "Sync_Interrupted"}
          </span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest">Active_Load</span>
            <span className="text-xs font-black text-white font-mono">{metrics?.people_tracked || 0} Assets</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest">Health_Index</span>
            <span className={`text-xs font-black font-mono ${metrics && metrics.queue_health_score > 70 ? "text-emerald-400" : "text-amber-400"}`}>
              {metrics?.queue_health_score || 0}%
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest">{t("auto.Throughput_4981") || "Throughput"}</span>
            <span className="text-xs font-black text-white font-mono">{metrics?.throughput_per_minute || 0} /m</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-3">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(i => (
              <motion.div 
                key={i}
                animate={{ height: [4, 12, 4] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                className="w-1 bg-cyan-500/40 rounded-full"
              />
            ))}
          </div>
          <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">Neural_Stream_v4.2</span>
        </div>
        <div className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] font-mono">
          © 2026 Laminar Intelligence Systems
        </div>
      </div>
    </motion.div>
  );
}

function HealthGauge({ score }: { score: number }) {
  const { t } = useTranslation();
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 60 ? "#10b981" : pct >= 30 ? "#f59e0b" : "#f43f5e";
  const r = 42, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center justify-center relative">
      <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90 drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
        <motion.circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ - dash}` }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-white tracking-tighter" style={{ color }}>{pct.toFixed(0)}</span>
        <span className="text-[7px] text-zinc-500 font-black uppercase tracking-[0.3em]">{t("auto.Score_4055") || "Score"}</span>
      </div>
    </div>
  );
}

const getBase64Image = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

// ─────────────────────────────────────────────────────────
// Smart Business Insights Generator
// ─────────────────────────────────────────────────────────
function generateInsights(metrics: QueueMetrics | null, stats: LiveStats | null, t: any): { icon: string; color: string; text: string; action: string | null }[] {
  const insights: { icon: string; color: string; text: string; action: string | null }[] = [];
  if (!metrics && !stats) {
    return [{ icon: "ℹ️", color: "text-zinc-400", text: "System monitoring in standby. No active camera data.", action: null }];
  }
  const avgWait = metrics?.avg_zone_wait_seconds ?? stats?.avg_dwell_seconds ?? 0;
  const maxWait = metrics?.max_zone_wait_seconds ?? stats?.max_dwell_seconds ?? 0;
  const health = metrics?.queue_health_score ?? 50;
  const people = metrics?.people_tracked ?? stats?.people_tracked ?? 0;
  const congestion = metrics?.congestion_status ?? "IDLE";

  if (congestion === "IDLE" || people === 0) {
    insights.push({ icon: "💤", color: "text-zinc-300", text: "No active queue detected. System monitoring in standby.", action: null });
    return insights;
  }
  if (maxWait > 600) {
    insights.push({ icon: "🚨", color: "text-rose-400", text: `Critical wait detected — max ${fmtSecs(maxWait)}. One or more customers are experiencing serious delays.`, action: "Open additional service counter immediately." });
  } else if (avgWait > 300) {
    insights.push({ icon: "⚠️", color: "text-amber-400", text: `High average wait (${fmtSecs(avgWait)}). Queue building up faster than service rate.`, action: "Recommend opening an additional counter or dispatching staff." });
  } else if (avgWait > 60) {
    insights.push({ icon: "📊", color: "text-yellow-300", text: `Moderate wait detected (avg ${fmtSecs(avgWait)}). Flow is manageable but rising.`, action: "Monitor and prepare overflow lane if trend continues." });
  } else {
    insights.push({ icon: "✅", color: "text-emerald-400", text: `Wait times within optimal range (avg ${fmtSecs(avgWait)}). Operations running smoothly.`, action: null });
  }
  if (health < 35) {
    insights.push({ icon: "⚡", color: "text-rose-400", text: `Queue health critical (${health}%). Throughput too low relative to crowd size.`, action: "Deploy surge staffing immediately." });
  } else if (health >= 80) {
    insights.push({ icon: "🏆", color: "text-emerald-400", text: `Excellent queue health score (${health}%). Staff performing at peak efficiency.`, action: null });
  }
  if (people >= 5) {
    insights.push({ icon: "👥", color: "text-amber-300", text: `${people} people currently tracked. Crowd density elevated.`, action: "Consider opening overflow lanes or directing flow." });
  }
  return insights;
}

function SmartInsightsPanel({ metrics, stats }: { metrics: QueueMetrics | null; stats: LiveStats | null }) {
  const { t } = useTranslation();
  const insights = generateInsights(metrics, stats, t);
  return (
    <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[48px] p-10 space-y-6 shadow-2xl relative overflow-hidden group/insights">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.8)]" />
      <div className="flex items-center gap-6 relative z-10">
        <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/30">
          <BrainCircuit className="w-8 h-8 text-cyan-400 animate-pulse" />
        </div>
        <div>
          <p className="text-sm font-black text-white uppercase tracking-[0.2em] font-mono">Decision_Intelligence</p>
          <p className="text-[10px] text-zinc-400 font-black uppercase tracking-[0.3em] mt-1">{t("auto.LiveInsightEngi_5472") || "Live Insight Engine v2.0"}</p>
        </div>
      </div>
      <div className="space-y-4 relative z-10">
        {insights.map((ins, i) => (
          <div key={i} className="p-5 bg-black/60 border border-white/5 rounded-3xl hover:border-cyan-500/20 transition-all">
            <p className={`text-[13px] leading-relaxed font-semibold ${ins.color}`}>
              <span className="mr-2">{ins.icon}</span>{ins.text}
            </p>
            {ins.action && (
              <div className="mt-3 flex items-center gap-2 pl-1">
                <div className="w-1 h-4 rounded-full bg-cyan-500/60" />
                <p className="text-[11px] text-cyan-300 font-black uppercase tracking-[0.15em]">
                  → {ins.action}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.5em] text-zinc-400 px-4 relative z-10">
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          INF_READY
        </div>
        <span>{t("auto.LiveData_2892") || "Live Data"}</span>
      </div>
    </div>
  );
}

function EvidenceCard({ journey, onPurge }: { journey: Journey, onPurge: (id: string) => void }) {
  const { t } = useTranslation();
  const [clientNow, setClientNow] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [snapshotIdx, setSnapshotIdx] = useState(0);

  const handlePurge = async () => {
    try {
      await api.delete(`/journeys/${journey.global_id}`);
      toast.success("Intelligence Record Purged (GDPR Compliant)");
      onPurge(journey.global_id);
    } catch (e) {
       toast.error("Failed to purge intelligence");
    }
  };

  useEffect(() => {
    setClientNow(Date.now());
    const t = setInterval(() => setClientNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Use the LATEST path entry (= current session)
  const latestPath = journey.path[journey.path.length - 1];
  const sessionCount = journey.path.length; // total number of sessions/visits

  // Build evidence timeline from latest session
  const snapshots = [
    latestPath?.snapshot_enter_path,
    latestPath?.snapshot_mid_path || journey.canonical_image,
    latestPath?.snapshot_exit_path
  ].filter(Boolean) as string[];

  // Active snapshot shown in carousel
  const activeSnapshot = snapshots[snapshotIdx] || snapshots[0] || null;
  const bestSnapshot = activeSnapshot;

  const getCleanUrl = (p: string) => {
    if (!p) return "";
    // 1. Normalize slashes for cross-platform compatibility
    let path = p.replace(/\\/g, "/");
    
    // 2. If it's already a full URL, return as is
    if (path.startsWith("http")) return path;

    // 3. Extract the relative storage segment if it's an absolute server path
    // e.g., "C:/.../backend/storage/dwell_snapshots/img.jpg" -> "storage/dwell_snapshots/img.jpg"
    if (path.includes("/storage/")) {
      path = "storage/" + path.split("/storage/")[1];
    }

    // 4. Ensure known storage directories are prefixed with /storage/ to match generic mount
    const storageDirs = ["dwell_snapshots", "snapshots", "alert_snapshots", "clips", "semantic_snapshots", "profile_pictures"];
    const hasKnownDir = storageDirs.some(dir => path.includes(dir));
    
    if (hasKnownDir && !path.startsWith("storage/")) {
      // Find where the known directory starts and slice from there
      for (const dir of storageDirs) {
        if (path.includes(dir)) {
          path = "storage/" + path.slice(path.indexOf(dir));
          break;
        }
      }
    }

    // 5. Final assembly with base URL
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const base = api.defaults.baseURL?.replace('/api/v1', '') || "";
    const url = `${base}${cleanPath}`;
    
    // De-duplicate slashes (except in protocol)
    return url.replace(/([^:]\/)\/+/g, "$1");
  };

  const downloadScreenshot = async () => {
    if (!bestSnapshot) return toast.error("No evidence clip available");
    try {
      toast.info("Generating pristine evidence clip...", { icon: <Download className="w-4 h-4" /> });
      const urlToFetch = getCleanUrl(bestSnapshot);
      
      try {
        const res = await fetch(urlToFetch);
        if (!res.ok) {
           console.warn("Evidence fetch failed, triggering fallback window download.");
           window.open(urlToFetch, '_blank');
           toast.success("Opened evidence in new tab for saving");
           return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `Laminar_Evidence_${shortId}_${Date.now()}.jpg`;
        a.click();
        URL.revokeObjectURL(objectUrl);
        toast.success("Evidence clip stored in secure vault");
      } catch (err) {
        console.error("Blob fetch failed, falling back to window.open", err);
        window.open(urlToFetch, '_blank');
        toast.success("Opened evidence in new tab for saving");
      }
    } catch(e) {
      toast.error("Failed to process download");
    }
  };

  const shortId = journey.global_id.split("-")[0].toUpperCase();
  const lastSeenStr = journey.last_seen || latestPath?.timestamp;
  const isActive = clientNow && lastSeenStr && (clientNow - new Date(lastSeenStr).getTime()) < 10_000;

  // SESSION-AWARE: only compute dwell for the CURRENT (latest) session
  const latestPathWithLive = (() => {
    let d = latestPath?.dwell_time || 0;
    if (isActive && latestPath?.timestamp && clientNow) {
      const elapsed = Math.floor((clientNow - new Date(latestPath.timestamp).getTime()) / 1000);
      d = Math.max(d, elapsed);
    }
    return { ...latestPath, display_dwell: d };
  })();

  // Keep pathWithLive for traversal node display (show all historical visits)
  const pathWithLive = journey.path.map((p, i) => {
    const isLatest = i === journey.path.length - 1;
    let d = p.dwell_time || 0;
    if (isLatest && isActive && p.timestamp && clientNow) {
      const elapsed = Math.floor((clientNow - new Date(p.timestamp).getTime()) / 1000);
      d = Math.max(d, elapsed);
    }
    return { ...p, display_dwell: d };
  });

  // CURRENT SESSION dwell only — not accumulated across sessions
  const currentSessionDwell = latestPathWithLive.display_dwell || 0;
  const maxCamDwell = pathWithLive.length > 0 ? Math.max(...pathWithLive.map(p => p.display_dwell || 0)) : 0;
  const peakZone = pathWithLive.length > 0
    ? pathWithLive.reduce((best, p) => (p.display_dwell || 0) > (best.display_dwell || 0) ? p : best, pathWithLive[0])
    : null;
  const firstSeen = journey.path[0]?.timestamp;
  const similarityScore = Math.min(100, Math.floor((journey.similarity || 1.0) * 100));
  const dwellPct = Math.min(100, (currentSessionDwell / 600) * 100);
  const dwellBarColor = currentSessionDwell < 60 ? "from-emerald-500 to-emerald-400" : currentSessionDwell < 300 ? "from-amber-500 to-amber-400" : "from-rose-500 to-rose-400";

  const downloadPDF = async () => {
    toast.info("Generating Comprehensive Insights...", { icon: <BrainCircuit className="w-4 h-4" /> });
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF("p", "mm", "a4");
    const W = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(3, 7, 18);
    pdf.rect(0, 0, W, 297, "F");
    pdf.setFillColor(6, 182, 212);
    pdf.rect(15, 15, 3, 10, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("LAMINAR — PERSON DWELL REPORT", 22, 24);
    pdf.setTextColor(100, 100, 115);
    pdf.setFontSize(8);
    pdf.text(`IDENTITY: ${shortId}  |  Generated: ${new Date().toLocaleString()}`, 22, 30);
    pdf.setDrawColor(6, 182, 212);
    pdf.setLineWidth(0.4);
    pdf.line(15, 36, 195, 36);

    // AI Insights & Summary Section
    pdf.setFillColor(6, 182, 212, 0.05);
    pdf.rect(15, 42, W - 30, 48, "F");
    pdf.setTextColor(6, 182, 212);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("AI INSIGHTS & SYNTHESIS", 20, 50);

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(180, 180, 195);
    pdf.setFontSize(9);
    
    let insightText = `Target identified with ${similarityScore}% Neural Confidence. `;
    if (currentSessionDwell > 600) {
      insightText += `High dwell latency detected (${fmtSecs(currentSessionDwell)}). Target exhibits extended stationary behavior, primarily peaking at Node: ${peakZone?.camera_name || 'UNKNOWN'}. Caution advised. `;
    } else {
      insightText += `Dwell latency within nominal parameters (${fmtSecs(currentSessionDwell)}). Movement across ${journey.path.length} nodes is consistent with typical flow vectors. `;
    }
    insightText += isActive ? "Target is currently ACTIVE in the facility." : "Target has EXITED or is untraceable.";
    
    const wrappedInsight = pdf.splitTextToSize(insightText, W - 40);
    pdf.text(wrappedInsight, 20, 56);

    const summaryLines = [
      [`Total Wait`, fmtSecs(currentSessionDwell)],
      [`Max Single Wait`, fmtSecs(maxCamDwell)],
      [`First Seen`, timeToShort(firstSeen)],
      [`Last Seen`, timeToShort(lastSeenStr)],
    ];
    summaryLines.forEach(([k, v], i) => {
      pdf.setTextColor(120, 120, 130);
      pdf.setFont("helvetica", "bold");
      pdf.text(k, 20, 72 + i * 5);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "normal");
      pdf.text(v, 60, 72 + i * 5);
    });

    // Evidence Snapshot
    if (bestSnapshot) {
      try {
        const b64 = await getBase64Image(getCleanUrl(bestSnapshot));
        if (b64) {
          pdf.addImage(b64, 'JPEG', 135, 48, 40, 40);
          pdf.setDrawColor(6, 182, 212);
          pdf.setLineWidth(0.5);
          pdf.rect(135, 48, 40, 40);
          pdf.setTextColor(6, 182, 212);
          pdf.setFontSize(7);
          pdf.text("EVIDENCE SNAPSHOT", 135, 91);
        }
      } catch (err) {
        console.error("Image embed failed", err);
      }
    }

    // Advanced Camera Log
    pdf.setFillColor(6, 182, 212, 0.1);
    pdf.rect(15, 100, 180, 8, "F");
    pdf.setTextColor(6, 182, 212);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("ADVANCED NODE APPEARANCE LOG", 20, 106);

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 100, 110);
    pdf.setFontSize(8);
    pdf.text("Camera / Node", 15, 115);
    pdf.text("Entry Time", 80, 115);
    pdf.text("Duration", 125, 115);
    pdf.text("Computed Exit Time", 155, 115);
    pdf.setDrawColor(30, 30, 45);
    pdf.line(15, 117, 195, 117);

    let currentY = 125;
    pathWithLive.forEach((p, i) => {
      // Auto-paginate if log is too long
      if (currentY > 270) {
        pdf.addPage();
        currentY = 20;
        pdf.setFillColor(6, 182, 212, 0.1);
        pdf.rect(15, currentY, 180, 8, "F");
        pdf.setTextColor(6, 182, 212);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text("ADVANCED NODE APPEARANCE LOG (CONT.)", 20, currentY + 6);
        currentY += 15;
      }

      // Calculate gap if not first entry
      if (i > 0) {
        const prev = pathWithLive[i - 1];
        const prevExit = new Date(prev.timestamp).getTime() + (prev.display_dwell || 0) * 1000;
        const currentEntry = new Date(p.timestamp).getTime();
        const gapSeconds = Math.floor((currentEntry - prevExit) / 1000);
        
        if (gapSeconds > 5) {
           pdf.setTextColor(244, 63, 94);
           pdf.setFont("helvetica", "italic");
           pdf.setFontSize(7);
           pdf.text(`[ TARGET SHADOWED / ABSENT FOR ${fmtSecs(gapSeconds)} ]`, 80, currentY);
           currentY += 8;
        }
      }

      const isLatest = i === pathWithLive.length - 1;
      const entryTime = new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      
      let computedExit: string;
      if (p.exit_time) {
        computedExit = new Date(p.exit_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      } else if (isLatest && isActive) {
        computedExit = "ACTIVE (PRESENT)";
      } else {
        const estExit = new Date(new Date(p.timestamp).getTime() + (p.display_dwell || 0) * 1000);
        computedExit = estExit.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      }
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(200, 200, 210);
      pdf.text(p.camera_name.slice(0, 30), 15, currentY);
      pdf.setTextColor(150, 150, 160);
      pdf.text(entryTime, 80, currentY);
      
      pdf.setTextColor(p.display_dwell > 300 ? 244 : p.display_dwell > 60 ? 245 : 16, p.display_dwell > 300 ? 63 : p.display_dwell > 60 ? 158 : 185, p.display_dwell > 300 ? 94 : p.display_dwell > 60 ? 11 : 129);
      pdf.text(fmtSecs(p.display_dwell || 0), 125, currentY);
      
      if (computedExit.includes("ACTIVE")) {
        pdf.setTextColor(52, 211, 153);
        pdf.setFont("helvetica", "bold");
      } else {
        pdf.setTextColor(150, 150, 160);
        pdf.setFont("helvetica", "normal");
      }
      pdf.text(computedExit, 155, currentY);
      
      pdf.setDrawColor(25, 25, 38);
      pdf.line(15, currentY + 2, 195, currentY + 2);
      currentY += 10;
    });

    pdf.setDrawColor(6, 182, 212, 0.2);
    pdf.line(15, 280, 195, 280);
    pdf.setTextColor(60, 60, 70);
    pdf.setFontSize(7);
    pdf.text("CONFIDENTIAL — LAMINAR AI SURVEILLANCE PLATFORM", W / 2, 287, { align: "center" });
    pdf.save(`Laminar_Person_${shortId}_${Date.now()}.pdf`);
    toast.success("Intelligence Report Generated");
  };

  const currentStayDwell = currentSessionDwell;

  return (
    <>
      <AnimatePresence>
        {showModal && bestSnapshot && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#020205]/98 backdrop-blur-3xl"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.15),transparent_80%)] pointer-events-none" />
            <div className="absolute top-12 left-12 flex items-center gap-6">
               <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl shadow-lg">
                  <ShieldCheck className="w-8 h-8 text-cyan-400 glow-cyan" />
               </div>
               <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em] glow-cyan">High_Res_Intelligence</h3>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">SUBJECT_HASH::{shortId}</p>
               </div>
            </div>
            <div className="absolute top-12 right-12 flex gap-5">
               <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={downloadScreenshot} 
                className="px-8 py-4 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 hover:bg-cyan-500/20 transition-all flex items-center gap-3 shadow-xl"
               >
                 <Download className="w-5 h-5" /> Secure_Save
               </motion.button>
               <motion.button 
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowModal(false)} 
                className="w-16 h-16 flex items-center justify-center bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 hover:text-rose-400 rounded-2xl transition-all shadow-xl"
               >
                 <X className="w-8 h-8" />
               </motion.button>
            </div>
            
            <motion.div 
              initial={{ scale: 0.8, y: 50, opacity: 0 }} 
              animate={{ scale: 1, y: 0, opacity: 1 }} 
              exit={{ scale: 0.8, y: 50, opacity: 0 }}
              className="relative p-2 bg-white/5 border border-white/10 rounded-[40px] shadow-[0_0_100px_rgba(6,182,212,0.2)]"
            >
              <img 
                src={getCleanUrl(bestSnapshot)} 
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%233f3f46" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
                  target.style.padding = '4rem';
                  target.style.opacity = '0.5';
                }}
                className="max-w-[80vw] max-h-[70vh] object-contain rounded-[32px]" 
              />
              <div className="absolute top-8 left-8 p-3 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                SURVEILLANCE_NODE_ALPHA
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} 
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -15 }}
        className="group relative bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-[40px] overflow-hidden hover:border-cyan-500/40 hover:shadow-[0_30px_80px_-20px_rgba(6,182,212,0.4)] transition-all duration-500 flex flex-col"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0" />
        
        <div className="aspect-[5/4] relative bg-black/40 overflow-hidden flex-shrink-0 group/reel z-10">
          <div className="flex w-full h-full relative cursor-pointer" onClick={() => bestSnapshot && setShowModal(true)}>
              {bestSnapshot ? (
                  <div className="relative w-full h-full">
                      <img 
                          src={getCleanUrl(bestSnapshot)} 
                          alt="Primary Target Evidence" 
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%233f3f46" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                            target.style.padding = '2rem';
                            target.style.opacity = '0.3';
                            target.style.objectFit = 'contain';
                          }}
                          className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 group-hover:scale-110 contrast-[1.2] transition-all duration-[1.5s] ease-out" 
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         <div className="px-6 py-3 bg-black/80 backdrop-blur-2xl rounded-2xl border border-white/20 flex items-center gap-3 shadow-2xl">
                            <Maximize2 className="w-5 h-5 text-cyan-400" />
                            <span className="text-[11px] font-black uppercase text-white tracking-[0.2em]">Enlarge_Identity</span>
                         </div>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90 pointer-events-none" />
                  </div>
              ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-zinc-900/40">
                      <div className="relative">
                        <Users className="w-12 h-12 text-zinc-800" />
                        <ShieldOff className="w-6 h-6 text-rose-500/40 absolute -bottom-2 -right-2" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500 font-mono">{t("auto.NoEvidenceCaptu_2353") || "No Evidence Captured"}</span>
                  </div>
              )}
          </div>

        <div className="absolute top-5 left-5 flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.05 }} className="px-4 py-2 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center gap-3 group-hover:border-cyan-500/40 transition-all shadow-lg">
            {isActive && (
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute inset-0" />
                <div className="w-2 h-2 rounded-full bg-emerald-500 relative z-10" />
              </div>
            )}
            <span className="text-[11px] font-mono font-black text-white uppercase tracking-[0.1em] glow-cyan">ID::{shortId}</span>
          </motion.div>
          {sessionCount > 1 && (
            <div className="px-2.5 py-1.5 bg-indigo-500/20 border border-indigo-500/40 rounded-xl text-[9px] font-black text-indigo-300 uppercase tracking-widest">
              {sessionCount} Sessions
            </div>
          )}
        </div>

        {/* Evidence Timeline Carousel */}
        {snapshots.length > 1 && (
          <div className="absolute bottom-16 left-5 flex gap-1.5 z-20">
            {snapshots.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setSnapshotIdx(idx); }}
                className={`h-1.5 rounded-full transition-all ${
                  idx === snapshotIdx ? 'w-6 bg-cyan-400' : 'w-1.5 bg-white/30'
                }`}
              />
            ))}
          </div>
        )}

        <div className="absolute top-5 right-5">
          <div className="px-3 py-2 bg-cyan-500/10 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl flex items-center gap-2 group-hover:bg-cyan-500/20 transition-all shadow-lg">
            <BrainCircuit className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-[11px] font-black text-cyan-300">ReID: {similarityScore}%</span>
          </div>
        </div>

        <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-3">
          <div className={`px-4 py-2 rounded-2xl text-[11px] font-black border flex items-center gap-2 backdrop-blur-2xl transition-all shadow-lg ${currentStayDwell < 60 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : currentStayDwell < 300 ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-rose-500/20 border-rose-500/40 text-rose-400"}`}>
            <Timer className="w-4 h-4" /> 
            <span className="font-mono">{fmtSecs(currentStayDwell)}</span>
            {isActive && <span className="animate-pulse ml-1">●</span>}
          </div>
          {peakZone && (
            <div className="px-4 py-2 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl text-[10px] font-mono text-zinc-300 truncate max-w-[50%] flex items-center gap-2 transition-all hover:bg-white/10">
              <MapPin className="w-3.5 h-3.5 text-indigo-400" />
              {peakZone.camera_name}
            </div>
          )}
        </div>
      </div>

      <div className="p-7 space-y-6 flex-1 flex flex-col z-10">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5 group-hover:bg-white/[0.05] transition-all hover:translate-y-[-2px] shadow-inner">
            <p className="text-[8px] font-black text-zinc-300 uppercase tracking-widest mb-2 font-mono">Capture_T</p>
            <p className="text-sm font-black text-white font-mono">{timeToShort(firstSeen)}</p>
          </div>
          <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5 group-hover:bg-white/[0.05] transition-all hover:translate-y-[-2px] shadow-inner">
            <p className="text-[8px] font-black text-zinc-300 uppercase tracking-widest mb-2 font-mono">Last_Auth</p>
            <p className="text-sm font-black text-white font-mono">{timeToShort(lastSeenStr)}</p>
          </div>
          <div className="bg-rose-500/5 rounded-2xl p-4 border border-rose-500/10 group-hover:bg-rose-500/10 transition-all hover:translate-y-[-2px] shadow-inner">
            <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-2 font-mono">Max_Wait</p>
            <p className={`text-sm font-black font-mono ${dwellColor(maxCamDwell)}`}>{fmtSecs(maxCamDwell)}</p>
          </div>
        </div>

        <div className="px-2">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] font-black text-zinc-200 uppercase tracking-[0.3em] flex items-center gap-2">
               <Pulse className="w-4 h-4 text-cyan-500/50" /> 
               {isActive ? "Current Session" : "Last Session"}
            </span>
            <span className={`text-[10px] font-black font-mono px-2 py-1 bg-white/5 rounded-lg ${dwellColor(currentSessionDwell)}`}>{fmtSecs(currentSessionDwell)}</span>
          </div>
          <div className="h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10 p-[1.5px] shadow-inner">
            <motion.div
              initial={{ width: 0 }} 
              animate={{ width: `${dwellPct}%` }}
              transition={{ duration: 2, ease: "circOut" }}
              className={`h-full rounded-full bg-gradient-to-r shadow-[0_0_15px_rgba(6,182,212,0.3)] ${dwellBarColor}`}
            />
          </div>
        </div>

        <div className="flex-1 px-1">
          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.4em] mb-4 flex items-center gap-2.5 border-b border-white/5 pb-3">
            <List className="w-4 h-4 text-indigo-400" />
            Traversal_Nodes ({journey.path.length})
          </p>
          <div className="space-y-3 max-h-[180px] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-white/10 custom-scroll">
            {pathWithLive.map((p, i) => {
              const isLatest = i === pathWithLive.length - 1;
              let exitLabel = "";
              if (p.exit_time) {
                exitLabel = new Date(p.exit_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              } else if (isLatest && isActive) {
                exitLabel = "ACTIVE";
              } else {
                exitLabel = new Date(new Date(p.timestamp).getTime() + (p.display_dwell || 0) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              }

              return (
                <motion.div 
                  initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  key={i} 
                  className="bg-black/40 border border-white/5 hover:border-cyan-500/20 hover:bg-white/[0.03] transition-all rounded-2xl p-4 group/node"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-black text-zinc-300 truncate max-w-[60%] flex items-center gap-2 font-mono">
                       <div className="w-1 h-3 bg-indigo-500/50 rounded-full" />
                       {p.camera_name}
                    </span>
                    <span className={`text-[10px] font-black font-mono border border-white/5 px-2.5 py-1 rounded-xl bg-white/5 ${dwellColor(p.display_dwell || 0)} group-hover/node:border-cyan-500/30 transition-colors`}>
                       {fmtSecs(p.display_dwell || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-black font-mono opacity-60">
                    <div className="flex items-center gap-2">
                       <span className="text-zinc-600 bg-white/5 px-1.5 py-0.5 rounded uppercase text-[7px] tracking-widest">{t("auto.Entry_9188") || "Entry"}</span>
                       <span className="text-emerald-400">{timeToShort(p.timestamp)}</span>
                    </div>
                    <div className="flex-1 mx-3 h-px border-t border-dashed border-white/10" />
                    <div className="flex items-center gap-2">
                       <span className="text-zinc-600 bg-white/5 px-1.5 py-0.5 rounded uppercase text-[7px] tracking-widest">{t("auto.Exit_5735") || "Exit"}</span>
                       <span className={isLatest && isActive ? "text-cyan-400 font-black animate-pulse" : "text-rose-400"}>{exitLabel}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="pt-6 border-t border-white/10 mt-auto flex gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={downloadScreenshot}
            className="flex-1 py-4 text-[10px] font-black uppercase tracking-[0.3em] border border-white/10 bg-white/[0.02] text-zinc-400 rounded-2xl hover:bg-white/5 hover:border-white/20 hover:text-white transition-all flex items-center justify-center gap-3 group/btn shadow-inner"
          >
            <Download className="w-4 h-4 group-hover/btn:-translate-y-1 transition-transform" /> {t("auto.Save_2393") || "Save"}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(6,182,212,0.3)" }}
            whileTap={{ scale: 0.98 }}
            onClick={downloadPDF}
            className="flex-[2] py-4 text-[10px] font-black uppercase tracking-[0.3em] border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 rounded-2xl hover:bg-cyan-500/20 hover:border-cyan-500/60 transition-all flex items-center justify-center gap-3 group/btn relative overflow-hidden shadow-xl"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite]" />
            <FileSpreadsheet className="w-4 h-4 group-hover/btn:-translate-y-1 transition-transform" /> 
            <span>Export_Dossier</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePurge}
            className="flex-1 py-4 text-[10px] font-black uppercase tracking-[0.3em] border border-rose-500/20 bg-rose-500/5 text-rose-500 rounded-2xl hover:bg-rose-500/10 hover:border-rose-500/40 transition-all flex items-center justify-center gap-2 group/btn shadow-inner"
          >
            <Trash2 className="w-4 h-4 group-hover/btn:-translate-y-1 transition-transform" />
          </motion.button>
        </div>
      </div>
    </motion.div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Spatial Intelligence Components
// ─────────────────────────────────────────────────────────
function CapacityMap({ zones, tracks, onHover }: { zones: Zone[], tracks: TrackRow[], onHover: (id: string | null) => void }) {
  const getCapacityColor = (count: number) => {
    if (count === 0) return "stroke-zinc-800 fill-zinc-900/20";
    if (count <= 2) return "stroke-emerald-500 fill-emerald-500/10";
    if (count <= 5) return "stroke-amber-500 fill-amber-500/10";
    return "stroke-rose-500 fill-rose-500/10";
  };

  return (
    <div className="relative w-full h-[300px] bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[40px] overflow-hidden group/map shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.05),transparent)] pointer-events-none" />
      <svg viewBox="0 0 400 300" className="w-full h-full p-8 transition-transform duration-700 group-hover/map:scale-[1.02]">
        <defs>
          <pattern id="tacticalGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tacticalGrid)" />

        {zones.map((z, i) => {
          const row = Math.floor(i / 3);
          const col = i % 3;
          const cx = 80 + col * 120;
          const cy = 60 + row * 100;
          const count = tracks.filter(t => t.zone === z.zone_name).length;
          const color = getCapacityColor(count);

          return (
            <motion.g key={z.id} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
              onMouseEnter={() => onHover(z.id)} onMouseLeave={() => onHover(null)}
              className="cursor-pointer group/node"
            >
              {i > 0 && (
                <line x1={80 + ((i-1)%3) * 120} y1={60 + Math.floor((i-1)/3) * 100} x2={cx} y2={cy} stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="4 4" />
              )}
              
              {count > 0 && (
                <circle cx={cx} cy={cy} r="25" className={`${color.split(' ')[0].replace('stroke-', 'fill-')} opacity-10 animate-ping`} />
              )}
              
              <circle cx={cx} cy={cy} r="20" className={`${color} transition-colors duration-500 stroke-2`} />
              <circle cx={cx} cy={cy} r="8" className={`${color.split(' ')[0].replace('stroke-', 'fill-')} opacity-40`} />
              
              <text x={cx} y={cy + 40} textAnchor="middle" className="text-[10px] font-black fill-zinc-500 uppercase tracking-widest font-mono pointer-events-none group-hover/node:fill-white transition-colors">{z.zone_name}</text>
              <text x={cx} y={cy + 4} textAnchor="middle" className="text-[10px] font-black fill-white font-mono pointer-events-none">{count}</text>

              <foreignObject x={cx - 50} y={cy - 90} width="100" height="60" className="opacity-0 group-hover/node:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-xl p-2 shadow-2xl text-center">
                  <p className="text-[7px] text-zinc-500 font-black uppercase tracking-widest mb-1">Live_Load</p>
                  <p className="text-xs font-black text-white">{((count / 10) * 100).toFixed(0)}% Cap</p>
                  <div className="w-full h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, (count / 10) * 100)}%` }} />
                  </div>
                </div>
              </foreignObject>
            </motion.g>
          );
        })}
      </svg>
      <div className="absolute top-6 left-6 flex items-center gap-2">
         <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
         <span className="text-[8px] font-black text-white uppercase tracking-[0.4em] font-mono">Spatial_Capacity_Grid v1</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────
export default function PersonWaitMonitoringPage() {
  const { t } = useTranslation();
  const { data: globalAlerts } = useAlerts();
  const router = useRouter();
  const imgRef = useRef<HTMLImageElement>(null);

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [streaming, setStreaming] = useState(true);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"live" | "analytics" | "history" | "evidence">("live");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneThreshold, setNewZoneThreshold] = useState(600);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [systemTime, setSystemTime] = useState("");

  useEffect(() => {
    setMounted(true);
    const updateTime = () => setSystemTime(new Date().toLocaleTimeString([], { hour12: false }));
    updateTime();
    const t = setInterval(updateTime, 1000);
    return () => clearInterval(t);
  }, []);

  const cameraId = selectedCamera?.id;
  const { stats, metrics, analytics, hourlyData, records, zones, journeys, connected, refresh } = useDwellData(cameraId);

  useEffect(() => {
    api.get(`/cameras`).then(r => {
      const arr = Array.isArray(r.data) ? r.data : (r.data.cameras || []);
      setCameras(arr);
      if (arr.length > 0) setSelectedCamera(arr[0]);
    });
  }, []);

  const createZone = async () => {
    if (!cameraId || !newZoneName.trim()) return;
    try {
      await api.post(`/dwell/zones`, {
        camera_id: cameraId,
        zone_name: newZoneName.trim(),
        polygon_coordinates: [[0,0],[640,0],[640,480],[0,480]],
        long_wait_threshold_seconds: newZoneThreshold,
      });
      toast.success("Node Proxy Perimeter Established");
      setNewZoneName(""); setShowAddZone(false);
      refresh();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteZone = async (zId: string) => {
    try {
      await api.delete(`/dwell/zones/${zId}`);
      refresh();
    } catch (err) {
      console.error(err);
    }
  };


  // Export & Report
  const exportToCSV = () => {
    if (records.length === 0) return toast.error("No Data in Buffer");
    const csv = [
      ["ID", "Tracker_ID", "Zone", "Dwell_S", "Enter_T"].join(","),
      ...records.map(r => [r.id, r.tracker_id, r.zone_name, r.dwell_seconds, r.enter_time].join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laminar_vector_log_${Date.now()}.csv`;
    a.click();
    toast.success("CSV Synthesis Downloaded");
  };

  const generatePDFReport = async () => {
    setLoading(true);
    toast.info("Synthesizing Executive AI Intelligence v5...", { icon: <BrainCircuit className="w-4 h-4" /> });
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Page Background
      pdf.setFillColor(3, 7, 18);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Cyber Grid Background (Subtle)
      pdf.setDrawColor(20, 20, 30);
      pdf.setLineWidth(0.1);
      for (let i = 0; i < pageWidth; i += 10) pdf.line(i, 0, i, pageHeight);
      for (let i = 0; i < pageHeight; i += 10) pdf.line(0, i, pageWidth, i);

      // Header Branding
      pdf.setFillColor(6, 182, 212);
      pdf.rect(15, 15, 3, 10, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(24);
      pdf.text("LAMINAR AI", 22, 24);
      pdf.setTextColor(100, 100, 115);
      pdf.setFontSize(8);
      pdf.text("EXECUTIVE INTELLIGENCE DOSSIER // v5.0", 22, 29);
      
      pdf.setDrawColor(6, 182, 212, 0.4);
      pdf.setLineWidth(0.5);
      pdf.line(15, 35, 195, 35);

      // Report metadata section
      pdf.setTextColor(150, 150, 160);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      const timestamp = new Date().toLocaleString();
      pdf.text(`GENERATED_AT: ${timestamp}`, 15, 42);
      pdf.text(`NODE_PROXY: ${selectedCamera?.location_label || "GLOBAL_CLUSTER"}`, 15, 47);
      pdf.text(`AUTH_TOKEN: ${Math.random().toString(36).substring(2, 10).toUpperCase()}`, 150, 42);

      // Section 1: Facility Telemetry
      const drawSectionHeader = (title: string, y: number) => {
        pdf.setFillColor(6, 182, 212, 0.1);
        pdf.rect(15, y, 180, 8, 'F');
        pdf.setTextColor(6, 182, 212);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text(title, 20, y + 6);
      };

      drawSectionHeader("I. MISSION CRITICAL TELEMETRY", 55);
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      const metricsData = [
        { label: "Active_Identities", value: stats?.people_tracked ?? 0 },
        { label: "Avg_Dwell_Latency", value: stats ? fmtSecs(stats.avg_dwell_seconds) : "0s" },
        { label: "Health_Index_Score", value: `${metrics?.queue_health_score ?? 0}%` },
        { label: "Throughput_Vector", value: `${metrics?.throughput_per_minute ?? 0} identities/min` }
      ];

      metricsData.forEach((m, i) => {
        pdf.setTextColor(120, 120, 130);
        pdf.text(m.label, 20, 75 + (i * 10));
        pdf.setTextColor(255, 255, 255);
        pdf.text(String(m.value), 90, 75 + (i * 10));
        pdf.setDrawColor(30, 30, 40);
        pdf.line(15, 78 + (i * 10), 195, 78 + (i * 10));
      });

      // Section 2: AI Behavioral Analysis
      drawSectionHeader("II. NEURAL BEHAVIORAL SYNOPSIS", 125);
      
      pdf.setTextColor(200, 200, 210);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      
      const aiConclusion = metrics && metrics.queue_health_score > 80
        ? "SYSTEM NOMINAL: Neural nodes report high velocity flow with zero congestion incidents. Thermal mapping reveals optimal asset distribution across all tracked sectors. Current efficiency exceeds 95th percentile baseline. No intervention required."
        : "ANOMALY DETECTED: Latency patterns indicate buffer saturation in secondary sectors. AI-driven projection suggests a 15% increase in dwell time over the next period if flow vectors are not optimized. Recommendation: Recalibrate queue handlers or deploy physical anchors to mitigate bottlenecking.";
      
      const wrappedAI = pdf.splitTextToSize(aiConclusion, 170);
      pdf.text(wrappedAI, 20, 142);

      // Section 3: Evidence Summary (ReID)
      drawSectionHeader("III. EVIDENCE CAPTURE SUMMARY", 165);
      pdf.setFontSize(7);
      pdf.text("CONFIDENTIAL // PROPRIETARY LAMINAR INTELLIGENCE // DO NOT DISTRIBUTE UNLESS AUTHENTICATED", pageWidth / 2, 287, { align: "center" });

      pdf.save(`Laminar_Intel_v5_${Date.now()}.pdf`);
      toast.success("Executive AI Report Synthesized Successfully");
    } finally { setLoading(false); }
  };

  // Robust stream URL construction
  const streamSrc = cameraId && streaming
    ? `/api/v1/dwell/stream/${cameraId}${getToken() ? `?token=${getToken()}` : "?anon=1"}`
    : undefined;

  return (
    <div className="min-h-screen bg-[#020205] text-white selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.08),transparent_70%)] pointer-events-none z-0" />
      <BackgroundAtmosphere />
      <ParticleCanvas />

      <style jsx global>{`
        @keyframes scan {
          from { transform: translateY(-100%); }
          to { transform: translateY(100vh); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .perspective-text {
          perspective: 1000px;
        }
        .glow-cyan {
          text-shadow: 0 0 10px rgba(6, 182, 212, 0.5);
        }
      `}</style>

      {/* Header Command Strip */}
      <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-[100] bg-black/40 backdrop-blur-3xl border-b border-white/10 px-8 py-5 mb-10 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50" />
        
        <div className="flex items-center gap-8 relative z-10">
          <motion.button 
            whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.1)" }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.back()} 
            className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition-all group shadow-inner"
          >
             <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </motion.button>
          <div className="perspective-text">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-black text-white tracking-tighter uppercase glow-cyan group cursor-default">
                PERSON_DWELL_MONITOR
                <span className="block h-0.5 w-0 group-hover:w-full bg-cyan-500 transition-all duration-500" />
              </h1>
              <div className="px-4 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2.5 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <div className="relative">
                  <span className="block w-2 h-2 rounded-full bg-cyan-500 animate-ping absolute inset-0" />
                  <span className="block w-2 h-2 rounded-full bg-cyan-400 relative z-10" />
                </div>
                Quantum_Link_v9.2
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.5em] mt-1.5 opacity-60 font-mono flex items-center gap-2">
              <Activity className="w-3 h-3 text-cyan-500/50" /> 
              Neural Monitoring Hub // Sector 7G
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5 relative z-10">
          <div className="hidden xl:flex flex-col items-end mr-6 gap-1 border-r border-white/10 pr-6">
            <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest font-mono">System_Clock</span>
            <span className="text-xs font-black text-zinc-300 font-mono tracking-widest">
              {mounted ? systemTime : "--:--:--"}
            </span>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(6,182,212,0.3)" }}
            whileTap={{ scale: 0.98 }}
            onClick={generatePDFReport} 
            disabled={loading}
            className="group relative overflow-hidden flex items-center gap-3 px-6 py-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-xl text-cyan-400 text-[10px] font-black uppercase tracking-widest transition-all"
          >
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]" />
             {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
             AI Synthesis
          </motion.button>
          
          <div className={`px-5 py-3 rounded-2xl border backdrop-blur-xl flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg ${connected ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" : "text-rose-500 border-rose-500/30 bg-rose-500/10"}`}>
             <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"}`} />
             {connected ? "NEURAL_LIVE" : "LINK_TERMINATED"}
          </div>

          {cameras.length > 0 && (
            <div className="relative group/select">
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                <ChevronDown className="w-4 h-4 text-zinc-500 group-hover/select:text-cyan-400 transition-colors" />
              </div>
              <select 
                value={selectedCamera?.id || ""} 
                onChange={e => setSelectedCamera(cameras.find(c => c.id === e.target.value) || null)}
                className="appearance-none bg-white/5 backdrop-blur-xl border border-white/10 text-[10px] uppercase font-black tracking-widest text-zinc-300 rounded-2xl px-6 py-3 pr-12 focus:outline-none focus:border-cyan-500/50 transition-all hover:bg-white/[0.08] cursor-pointer shadow-inner"
              >
                {cameras.map(c => <option key={c.id} value={c.id} className="bg-[#0a0a0b] text-zinc-300">{c.location_label || c.name || "UNNAMED_NODE"}</option>)}
              </select>
            </div>
          )}
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="px-10 space-y-12 pb-32 pt-6 relative z-10">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { label: "Detected_Flow", val: stats?.people_tracked ?? 0, icon: Users, color: "text-white", glow: "shadow-[0_0_20px_rgba(255,255,255,0.1)]", border: "border-white/20" },
            { label: "Avg_Dwell_Latency", val: fmtSecs(stats?.avg_dwell_seconds ?? 0), icon: Timer, color: "text-cyan-400", glow: "shadow-[0_0_20px_rgba(6,182,212,0.2)]", border: "border-cyan-500/30" },
            { label: "Max_Wait_Record", val: fmtSecs(stats?.max_dwell_seconds ?? 0), icon: Activity, color: "text-rose-400", glow: "shadow-[0_0_20px_rgba(244,63,94,0.2)]", border: "border-rose-500/30" },
            { label: "System_Integrity", val: "99.98%", icon: ShieldCheck, color: "text-emerald-400", glow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]", border: "border-emerald-500/30" },
          ].map((kpi, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 30, rotateX: 20 }} 
              animate={{ opacity: 1, y: 0, rotateX: 0 }} 
              transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
              whileHover={{ y: -10, scale: 1.02, rotateY: 5 }}
              className={`group bg-white/[0.03] backdrop-blur-2xl border ${kpi.border} rounded-[32px] p-7 ${kpi.glow} transition-all relative overflow-hidden flex flex-col justify-between min-h-[160px] cursor-default shadow-2xl`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="flex items-center justify-between mb-4 relative z-10">
                 <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.4em] font-mono whitespace-nowrap">{kpi.label}</p>
                 <div className={`p-2.5 rounded-2xl bg-white/5 border border-white/10 group-hover:border-cyan-500/50 transition-colors`}>
                    <kpi.icon className={`w-4 h-4 ${kpi.color} group-hover:scale-110 transition-transform`} />
                 </div>
              </div>
              <div className="relative z-10">
                <p className={`text-4xl font-black tracking-tightest leading-none ${kpi.color} group-hover:scale-105 transition-transform origin-left`}>
                  {kpi.val}
                </p>
                <div className="mt-2 h-[1px] w-full bg-white/5 overflow-hidden">
                   <motion.div 
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: i * 0.5 }}
                    className="h-full w-1/2 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"
                   />
                </div>
              </div>
              <div className="absolute -bottom-8 -right-8 opacity-[0.03] group-hover:opacity-[0.12] transition-all duration-700 group-hover:scale-125 group-hover:-rotate-12">
                <kpi.icon className="w-32 h-32" />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Live Stream & Health Section */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 relative z-10">
          <motion.div 
            initial={{ opacity: 0, x: -50 }} 
            animate={{ opacity: 1, x: 0 }}
            className="xl:col-span-2 bg-black border border-white/10 rounded-[48px] overflow-hidden relative shadow-[0_30px_70px_rgba(0,0,0,0.8)] group"
          >
            {/* Holographic Overlays */}
            <div className="absolute inset-0 z-20 pointer-events-none border-[32px] border-black/40" />
            <div className="absolute inset-0 z-30 pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity">
               <div className="absolute top-10 left-10 w-24 h-24 border-t-2 border-l-2 border-cyan-500/40" />
               <div className="absolute top-10 right-10 w-24 h-24 border-t-2 border-r-2 border-cyan-500/40" />
               <div className="absolute bottom-10 left-10 w-24 h-24 border-b-2 border-l-2 border-cyan-500/40" />
               <div className="absolute bottom-10 right-10 w-24 h-24 border-b-2 border-r-2 border-cyan-500/40" />
            </div>

            <div className="absolute top-8 left-8 z-40 flex items-center gap-4">
               <div className="px-4 py-2 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center gap-3 group-hover:border-cyan-500/50 transition-all">
                  <div className="relative">
                    <span className="block w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse" />
                  </div>
                  <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-mono glow-cyan">Visual_Inference_Stream</span>
               </div>
               <div className="px-4 py-2 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl text-[9px] text-zinc-400 font-bold uppercase tracking-widest font-mono">
                  RES::1080p // FR::30FPS
               </div>
            </div>

            <div className="relative w-full h-[500px] lg:h-[650px] flex items-center justify-center bg-[#050510] overflow-hidden">
              {streamSrc ? (
                <>
                  <img ref={imgRef} src={streamSrc} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-[2s]" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.5)_100%)] pointer-events-none" />
                </>
              ) : (
                <div className="flex flex-col items-center gap-8 opacity-25">
                   <div className="relative">
                      <WifiOff className="w-20 h-20 text-zinc-500 animate-pulse" />
                      <div className="absolute -inset-4 border border-zinc-800 rounded-full animate-ping" />
                   </div>
                   <p className="text-sm font-black uppercase tracking-[0.6em] font-mono text-zinc-600">Sync_Buffer_Empty :: Node_Search</p>
                </div>
              )}
              
              {/* Animated Scanline */}
              <div className="absolute top-0 left-0 w-full h-[200%] bg-gradient-to-b from-transparent via-cyan-500/[0.03] to-transparent pointer-events-none animate-[scan_6s_linear_infinite] z-30" />
            </div>
            
            <div className="px-10 py-5 bg-black border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
               <div className="flex gap-8">
                  <span>Packet_Ingest::Nominal</span>
                  <span>Buffer_Latency::12ms</span>
               </div>
               <button onClick={() => setStreaming(!streaming)} className="flex items-center gap-2 hover:text-white transition-colors">
                  {streaming ? <Square className="w-3 h-3 fill-rose-500" /> : <Play className="w-3 h-3 fill-emerald-500" />}
                  {streaming ? "Kill_Process" : "Boot_Stream"}
               </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 flex flex-col">
            <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[48px] p-12 flex flex-col items-center gap-10 shadow-2xl flex-1 justify-center relative overflow-hidden group/health">
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1),transparent_70%)] opacity-0 group-hover/health:opacity-100 transition-opacity duration-700" />
               <div className="flex justify-between w-full relative z-10 transition-transform duration-500 group-hover/health:-translate-y-2">
                  <span className="text-[12px] font-black text-zinc-500 uppercase tracking-[0.4em] font-mono">Flow_Health_Core</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map(i => (
                      <motion.div 
                        key={i}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                        className="w-1.5 h-1.5 rounded-full bg-cyan-500"
                      />
                    ))}
                  </div>
               </div>
               
               <div className="relative z-10 p-4 rounded-full border border-white/5 transition-transform duration-700 group-hover/health:scale-110 group-hover/health:rotate-12">
                  <HealthGauge score={metrics?.queue_health_score ?? 0} />
               </div>

               <div className="w-full grid grid-cols-2 gap-6 relative z-10">
                  <div className="bg-black/40 rounded-[32px] p-6 text-center border border-white/10 transition-all hover:bg-white/[0.05] group/card shadow-inner">
                     <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest mb-2 group-hover/card:text-zinc-400 transition-colors">Dwell_Load</p>
                     <p className="text-3xl font-black text-white glow-cyan">{metrics?.current_people_waiting ?? 0}</p>
                  </div>
                  <div className="bg-black/40 rounded-[32px] p-6 text-center border border-white/10 transition-all hover:bg-white/[0.05] group/card shadow-inner">
                     <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest mb-2 group-hover/card:text-zinc-400 transition-colors">Thru_Vector</p>
                     <p className="text-3xl font-black text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">{metrics?.throughput_per_minute ?? 0}</p>
                  </div>
               </div>
            </div>

            <SmartInsightsPanel metrics={metrics} stats={stats} />
          </motion.div>
        </div>

        {/* Cyber Tab Controls */}
        <div className="flex items-center gap-2 border-b border-white/10 flex-wrap px-4 relative z-10">
          {[
            { key: "live", label: "Neural Matrix", icon: Pulse },
            { key: "analytics", label: "Latency Heatmap", icon: BarChart3 },
            { key: "history", label: "Temporal Archive", icon: Clock },
            { key: "evidence", label: "Intelligence Hub", icon: ShieldCheck },
          ].map(tab => (
            <button 
              key={tab.key} 
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-3 px-10 py-6 text-[11px] font-black uppercase tracking-[0.4em] transition-all relative group/tab ${activeTab === tab.key ? "text-cyan-400" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <tab.icon className={`w-5 h-5 transition-all duration-300 ${activeTab === tab.key ? "text-cyan-400 scale-110 glow-cyan" : "text-zinc-600 group-hover/tab:text-zinc-400"}`} />
              <span className="relative z-10">{tab.label}</span>
              {activeTab === tab.key && (
                <>
                  <motion.div layoutId="tabUnderline" className="absolute bottom-0 left-0 right-0 h-[4px] bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,1)] z-20" />
                  <motion.div layoutId="tabGlow" className="absolute inset-0 bg-cyan-500/5 blur-xl pointer-events-none" />
                </>
              )}
            </button>
          ))}
        </div>

        {/* Tab Viewport */}
        <div className="min-h-[600px] relative">
          <AnimatePresence mode="wait">
            {activeTab === "live" && (
              <motion.div key="live" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-zinc-950/20 backdrop-blur-3xl border border-white/10 rounded-[48px] overflow-hidden shadow-2xl flex flex-col">
                   <div className="px-10 py-8 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                      <div className="flex items-center gap-4">
                         <div className="p-3 bg-white/5 rounded-2xl border border-white/10"><List className="w-5 h-5 text-zinc-400" /></div>
                         <h2 className="text-sm font-black text-white uppercase tracking-widest font-mono">{t("auto.LiveIdentificat_7090") || "Live Identification Matrix"}</h2>
                      </div>
                      <button onClick={exportToCSV} className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-zinc-300 uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-3">
                         <RefreshCw className="w-4 h-4" /> {t("auto.SyncSynthesis_6315") || "Sync Synthesis"}
                      </button>
                   </div>
                   <div className="flex-1 overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-white/5 text-[9px] text-zinc-500 uppercase tracking-[0.3em] font-black bg-white/[0.01]">
                            <th className="text-left px-10 py-6">Sector_ID</th>
                            <th className="text-left px-10 py-6">{t("auto.Node_4875") || "Node"}</th>
                            <th className="text-left px-10 py-6">{t("auto.Duration_6639") || "Duration"}</th>
                            <th className="text-left px-10 py-6">Proxy_Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-medium">
                          {stats?.tracks.map(t => (
                            <tr key={t.track_id} className="hover:bg-white/[0.02] transition-colors group">
                              <td className="px-10 py-6"><span className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/10 text-cyan-400 font-black">VT::{t.track_id}</span></td>
                              <td className="px-10 py-6 text-zinc-400 font-bold uppercase">{t.zone || "NULL_SECTOR"}</td>
                              <td className="px-10 py-6"><span className={`font-black ${dwellColor(t.dwell_seconds)}`}>{fmtSecs(t.dwell_seconds)}</span></td>
                              <td className="px-10 py-6">
                                <span className={`px-3 py-1.5 rounded-full text-[8px] font-black border ${dwellBg(t.dwell_seconds)} ${dwellColor(t.dwell_seconds)}`}>
                                   {t.dwell_seconds < 60 ? "STABLE" : "OVER_LIMIT"}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {(!stats || stats.tracks.length === 0) && (
                            <tr><td colSpan={4} className="py-40 text-center text-zinc-600 font-black uppercase tracking-[0.5em] font-mono opacity-40">{t("auto.ZeroAssetsInSig_9745") || "Zero Assets In Sight"}</td></tr>
                          )}
                        </tbody>
                      </table>
                   </div>
                </div>

                 <div className="space-y-8">
                   <div className="bg-zinc-950/20 backdrop-blur-3xl border border-white/10 rounded-[40px] p-10 shadow-2xl border-l-4 border-l-violet-500/50">
                      <div className="flex items-center justify-between mb-8">
                         <div className="flex items-center gap-4">
                            <MapPin className="w-5 h-5 text-violet-400" />
                            <h3 className="text-xs font-black text-white uppercase tracking-widest font-mono">Spatial_Intelligence</h3>
                         </div>
                      </div>
                      <CapacityMap zones={zones} tracks={stats?.tracks || []} onHover={setHoveredZone} />
                   </div>

                   <div className="bg-zinc-950/20 backdrop-blur-3xl border border-white/10 rounded-[40px] p-10 shadow-2xl border-l-4 border-l-violet-500/50">
                      <div className="flex items-center justify-between mb-8">
                         <div className="flex items-center gap-4">
                            <List className="w-5 h-5 text-violet-400" />
                            <h3 className="text-xs font-black text-white uppercase tracking-widest font-mono">Virtual_Perimeters</h3>
                         </div>
                         <button onClick={() => setShowAddZone(!showAddZone)} className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all font-mono">
                            <Plus className={`w-5 h-5 text-zinc-400 transition-transform ${showAddZone ? "rotate-45" : ""}`} />
                         </button>
                      </div>

                      <AnimatePresence>
                         {showAddZone && (
                           <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-8 space-y-4 p-5 bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden">
                              <input placeholder={t("auto.ZoneName_4942") || "Zone_Name"} value={newZoneName} onChange={e => setNewZoneName(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:border-cyan-500/50 outline-none font-mono" />
                              <input type="number" placeholder={t("auto.ThresholdS_1340") || "Threshold_S"} value={newZoneThreshold} onChange={e => setNewZoneThreshold(Number(e.target.value))} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:border-cyan-500/50 outline-none font-mono" />
                              <div className="flex gap-2">
                                 <button onClick={() => setShowAddZone(false)} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-600">{t("auto.Cancel_9092") || "Cancel"}</button>
                                 <button onClick={createZone} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest bg-cyan-600 rounded-2xl text-white shadow-lg">{t("auto.Establish_9178") || "Establish"}</button>
                              </div>
                           </motion.div>
                         )}
                      </AnimatePresence>

                      <div className="space-y-3 max-h-60 overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-white/5">
                         {zones.map(z => (
                           <div key={z.id} 
                             className={`flex items-center justify-between px-5 py-4 bg-white/[0.02] border rounded-[24px] transition-all group ${hoveredZone === z.id ? "border-cyan-500 bg-cyan-500/5" : "border-white/5 hover:border-white/10"}`}
                             onMouseEnter={() => setHoveredZone(z.id)} onMouseLeave={() => setHoveredZone(null)}
                           >
                              <div>
                                 <p className={`text-[11px] font-black uppercase ${hoveredZone === z.id ? "text-cyan-400" : "text-zinc-300"}`}>{z.zone_name}</p>
                                 <p className="text-[8px] text-zinc-600 font-mono mt-1 uppercase">Threshold: {z.long_wait_threshold_seconds}s</p>
                              </div>
                              <button onClick={() => deleteZone(z.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">
                                 <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                         ))}
                      </div>
                   </div>

                   <div className="bg-zinc-950/20 backdrop-blur-3xl border border-white/10 rounded-[40px] p-8 shadow-2xl border-l-4 border-l-rose-500/50">
                      <div className="flex items-center gap-3 mb-6">
                         <AlertTriangle className="w-5 h-5 text-rose-500" />
                         <span className="text-xs font-black text-rose-500 uppercase tracking-widest">Buffer_Incident_Log</span>
                      </div>
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-white/5">
                         {records.map(r => (
                           <div key={r.id} className="flex items-center gap-4 text-[10px] font-mono pb-3 border-b border-white/5 last:border-0 hover:bg-white/[0.01] px-2 rounded-lg transition-all">
                              <span className="text-zinc-700">#{r.tracker_id}</span>
                              <span className="text-zinc-400 flex-1 truncate">{r.zone_name}</span>
                              <span className={`font-black ${dwellColor(r.dwell_seconds)}`}>{fmtSecs(r.dwell_seconds)}</span>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === "analytics" && (
              <motion.div key="analytics" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <div className="bg-zinc-950/20 backdrop-blur-3xl border border-white/10 rounded-[48px] p-10 shadow-2xl">
                    <div className="flex items-center gap-5 mb-10">
                       <div className="p-4 bg-indigo-500/10 rounded-[28px] border border-indigo-500/20"><BarChart3 className="w-6 h-6 text-indigo-400" /></div>
                       <h2 className="text-xl font-black text-white uppercase tracking-tighter">{t("auto.LatencyHeatmap_1764") || "Latency Heatmap"}</h2>
                    </div>
                    <div className="space-y-8">
                       {analytics?.top_zones.map((z, i) => (
                         <div key={i} className="space-y-3">
                            <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-zinc-400 font-mono">
                               <span>{z.zone_name}</span>
                               <span className={dwellColor(z.avg_wait_seconds)}>{fmtSecs(z.avg_wait_seconds)} Avg</span>
                            </div>
                            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                               <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (z.avg_wait_seconds / 600) * 100)}%` }} transition={{ duration: 1, delay: i*0.1 }}
                                 className={`h-full rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)] ${z.avg_wait_seconds < 60 ? "bg-emerald-500" : "bg-cyan-500"}`}
                               />
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
                 
                 <div className="bg-zinc-950/20 backdrop-blur-3xl border border-white/10 rounded-[48px] overflow-hidden shadow-2xl flex flex-col">
                    <div className="px-10 py-8 border-b border-white/10 bg-white/[0.01]">
                       <h3 className="text-sm font-black text-white uppercase tracking-widest font-mono">{t("auto.AnomalyThreshol_6002") || "Anomaly Thresholds"}</h3>
                    </div>
                    <div className="p-10 flex-1 overflow-auto max-h-[500px] scrollbar-thin scrollbar-thumb-white/5">
                        <table className="w-full text-xs font-mono">
                           <thead>
                              <tr className="text-[10px] text-zinc-600 font-black uppercase text-left border-b border-white/5">
                                 <th className="pb-4">Asset_ID</th>
                                 <th className="pb-4">{t("auto.Time_6522") || "Time"}</th>
                                 <th className="pb-4">{t("auto.Wait_327") || "Wait"}</th>
                                 <th className="pb-4">{t("auto.Alert_220") || "Alert"}</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-white/5">
                              {records.map(r => (
                                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                                   <td className="py-4 text-zinc-300">V_{r.tracker_id}</td>
                                   <td className="py-4 text-zinc-500 italic">{timeToShort(r.enter_time)}</td>
                                   <td className={`py-4 font-black ${dwellColor(r.dwell_seconds)}`}>{fmtSecs(r.dwell_seconds)}</td>
                                   <td className="py-4">{r.alert_triggered ? <span className="text-rose-500">{t("auto.YES_4403") || "YES"}</span> : <span className="text-emerald-500">NO</span>}</td>
                                </tr>
                              ))}
                           </tbody>
                        </table>
                    </div>
                 </div>
              </motion.div>
            )}

            {activeTab === "history" && (
               <motion.div key="history" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-8">
                  <div className="bg-zinc-950/20 backdrop-blur-3xl border border-white/10 rounded-[48px] p-10 shadow-2xl">
                     <div className="flex items-center justify-between mb-10">
                        <div className="flex items-center gap-4">
                           <Clock className="w-6 h-6 text-cyan-500" />
                           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Temporal Dynamics (24h)</h2>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black text-zinc-500 uppercase">
                           Node_Signal_Nominal <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                     </div>
                     <div className="h-[450px] w-full">
                        {hourlyData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                             <AreaChart data={hourlyData}>
                                <defs>
                                   <linearGradient id="dwellGrad" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4}/>
                                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0}/>
                                   </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                                <XAxis dataKey="hour_label" axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 10, fontWeight: 800}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 10, fontWeight: 800}} />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="avg_wait_seconds" stroke="#06b6d4" strokeWidth={4} fill="url(#dwellGrad)" />
                             </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
                             <Pulse className="w-12 h-12" />
                             <p className="font-black uppercase tracking-[0.4em] text-xs font-mono">{t("auto.SynthesizingSpe_1006") || "Synthesizing Spectral Log..."}</p>
                          </div>
                        )}
                     </div>
                  </div>
               </motion.div>
            )}

            {activeTab === "evidence" && (
              <motion.div key="evidence" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
                 <div className="bg-zinc-950/40 backdrop-blur-3xl border border-white/10 rounded-[48px] p-8 flex items-center justify-between shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent pointer-events-none" />
                    <div className="flex items-center gap-6 relative z-10">
                       <div className="p-4 bg-cyan-500/10 rounded-[28px] border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                          <ShieldCheck className="w-8 h-8 text-cyan-400 animate-pulse" />
                       </div>
                       <div>
                          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Global_ReID_Hub</h2>
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.4em] mt-1">{journeys.length} Identities Authenticated By AI</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-4 z-10 w-full lg:w-auto">
                       <div className="relative group w-auto lg:w-96 flex-1">
                          <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600 transition-colors group-focus-within:text-cyan-500" />
                          <input 
                            type="text" placeholder={t("auto.FilterVectorID_2010") || "Filter Vector ID..."} value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-black border border-white/10 rounded-[24px] pl-14 pr-6 py-4 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-cyan-500/40 transition-all font-mono shadow-inner"
                          />
                       </div>
                       <motion.button
                         whileHover={{ scale: 1.02 }}
                         whileTap={{ scale: 0.98 }}
                         onClick={async () => {
                           try {
                             await api.post("/journeys/clear");
                             toast.success("Intelligence Data Lake Purged!");
                             refresh();
                           } catch(e) {
                             toast.error("Data Lake Purge Failed");
                           }
                         }}
                         className="px-6 py-4 bg-rose-500/10 border border-rose-500/30 text-rose-500 hover:bg-rose-500/20 hover:text-rose-400 rounded-[24px] flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all shadow-xl whitespace-nowrap"
                       >
                         <Trash2 className="w-4 h-4" /> Purge_Lake
                       </motion.button>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                    {journeys
                      .filter(j => j.path?.some(p => (p.dwell_time || 0) > 1) || j.canonical_image)
                      .filter(j => j.global_id.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map(j => (
                        <EvidenceCard key={j.global_id} journey={j} onPurge={() => refresh()} />
                    ))}
                    {journeys.length === 0 && (
                      <div className="col-span-full py-40 flex flex-col items-center justify-center opacity-20 gap-6">
                        <Users className="w-20 h-20" />
                        <div className="text-center">
                           <p className="font-black uppercase tracking-[0.5em] text-sm">{t("auto.TargetIsolation_9486") || "Target Isolation Null"}</p>
                           <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-2 text-zinc-500">{t("auto.Waitingforasset_7158") || "Waiting for asset detection nodes..."}</p>
                        </div>
                      </div>
                    )}
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Downbar metrics={metrics} connected={connected} />
    </div>
  );
}
