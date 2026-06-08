"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Bell, X, ShieldAlert, TrafficCone, ParkingCircle,
  CheckCircle2, Zap, ChevronDown, ChevronUp, Car,
  Clock, Gauge, Users, Activity, AlertTriangle,
} from "lucide-react";

interface MeshNotification {
  id: string;
  timestamp: string;
  domain: "traffic" | "parking" | "incident" | "crowd";
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  venue_id?: string;
  venue_name?: string;
  metadata?: {
    vehicle_count?: number;
    flow_speed?: number;
    wait_time?: number;
    congestion_level?: string;
    risk_score?: number;
    occupancy?: number;
    occupancy_percent?: number;
    avg_count?: number;
    insight?: string;
    recommendation?: string;
    density?: string;
    [key: string]: any;
  };
}

// ── Priority config ────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, {
  ring: string; badge: string; bar: string; glow: string; pulse: boolean;
}> = {
  CRITICAL: {
    ring:  "ring-2 ring-rose-500/60",
    badge: "bg-rose-500/20 text-rose-300 border border-rose-500/40",
    bar:   "bg-rose-500",
    glow:  "shadow-[0_0_16px_rgba(239,68,68,0.35)]",
    pulse: true,
  },
  HIGH: {
    ring:  "ring-1 ring-orange-500/40",
    badge: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
    bar:   "bg-orange-500",
    glow:  "shadow-[0_0_12px_rgba(249,115,22,0.25)]",
    pulse: false,
  },
  MEDIUM: {
    ring:  "ring-1 ring-amber-500/30",
    badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    bar:   "bg-amber-500",
    glow:  "",
    pulse: false,
  },
  LOW: {
    ring:  "ring-1 ring-emerald-500/20",
    badge: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    bar:   "bg-emerald-500",
    glow:  "",
    pulse: false,
  },
};

const DOMAIN_CONFIG: Record<string, {
  icon: React.ReactNode; label: string; accent: string; headerGrad: string;
}> = {
  traffic: {
    icon:      <TrafficCone className="w-4 h-4" />,
    label:     "Traffic",
    accent:    "text-amber-400",
    headerGrad:"from-amber-500/20 to-orange-500/10",
  },
  parking: {
    icon:      <ParkingCircle className="w-4 h-4" />,
    label:     "Parking",
    accent:    "text-cyan-400",
    headerGrad:"from-cyan-500/20 to-blue-500/10",
  },
  incident: {
    icon:      <ShieldAlert className="w-4 h-4" />,
    label:     "Incident",
    accent:    "text-rose-400",
    headerGrad:"from-rose-500/20 to-red-500/10",
  },
  crowd: {
    icon:      <Users className="w-4 h-4" />,
    label:     "Crowd",
    accent:    "text-fuchsia-400",
    headerGrad:"from-fuchsia-500/20 to-purple-500/10",
  },
};

// ── Relative time helper ───────────────────────────────────────────────────
function relativeTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 10)  return "just now";
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Metric chip ───────────────────────────────────────────────────────────
function Chip({ icon, label, value, accent = "text-slate-300" }: {
  icon: React.ReactNode; label: string; value: string | number; accent?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-lg px-2 py-1 border border-white/[0.06]">
      <span className="text-slate-500 w-3.5 h-3.5 shrink-0">{icon}</span>
      <span className="text-[9px] text-slate-500 uppercase tracking-wide font-bold">{label}</span>
      <span className={`text-[10px] font-black ${accent}`}>{value}</span>
    </div>
  );
}

// ── Domain-specific metric chips ──────────────────────────────────────────
function MetricChips({ n }: { n: MeshNotification }) {
  const { t } = useTranslation();
  const m = n.metadata || {};
  if (n.domain === "traffic") {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {m.vehicle_count != null && (
          <Chip icon={<Car className="w-3.5 h-3.5" />} label={t("auto.Vehicles_363") || "Vehicles"}
            value={m.vehicle_count} accent="text-amber-300" />
        )}
        {m.flow_speed != null && (
          <Chip icon={<Gauge className="w-3.5 h-3.5" />} label={t("auto.Speed_6542") || "Speed"}
            value={`${Number(m.flow_speed).toFixed(1)} px/s`} accent="text-blue-300" />
        )}
        {m.wait_time != null && (
          <Chip icon={<Clock className="w-3.5 h-3.5" />} label={t("auto.Wait_2691") || "Wait"}
            value={`${Number(m.wait_time).toFixed(1)} min`} accent="text-orange-300" />
        )}
        {m.congestion_level && (
          <Chip icon={<Activity className="w-3.5 h-3.5" />} label={t("auto.Congestion_8809") || "Congestion"}
            value={m.congestion_level}
            accent={
              m.congestion_level === "Critical" ? "text-rose-400" :
              m.congestion_level === "High"     ? "text-orange-400" :
              m.congestion_level === "Medium"   ? "text-amber-400" : "text-emerald-400"
            }
          />
        )}
        {m.risk_score != null && (
          <Chip icon={<AlertTriangle className="w-3.5 h-3.5" />} label={t("auto.Risk_7459") || "Risk"}
            value={`${m.risk_score}%`}
            accent={Number(m.risk_score) > 70 ? "text-rose-400" : Number(m.risk_score) > 40 ? "text-orange-400" : "text-emerald-400"}
          />
        )}
      </div>
    );
  }
  if (n.domain === "parking") {
    const occ = m.occupancy_percent ?? m.occupancy;
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {occ != null && (
          <Chip icon={<Activity className="w-3.5 h-3.5" />} label={t("auto.Occupancy_9528") || "Occupancy"}
            value={`${Number(occ).toFixed(0)}%`}
            accent={Number(occ) > 90 ? "text-rose-400" : Number(occ) > 70 ? "text-orange-400" : "text-emerald-400"}
          />
        )}
        {m.vehicle_count != null && (
          <Chip icon={<Car className="w-3.5 h-3.5" />} label={t("auto.Vehicles_363") || "Vehicles"}
            value={m.vehicle_count} accent="text-cyan-300" />
        )}
      </div>
    );
  }
  if (n.domain === "incident" || n.domain === "crowd") {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {m.avg_count != null && (
          <Chip icon={<Users className="w-3.5 h-3.5" />} label={t("auto.Count_6039") || "Count"}
            value={Math.round(m.avg_count)} accent="text-fuchsia-300" />
        )}
        {m.risk_score != null && (
          <Chip icon={<AlertTriangle className="w-3.5 h-3.5" />} label={t("auto.Risk_7459") || "Risk"}
            value={`${m.risk_score}%`} accent="text-rose-300" />
        )}
      </div>
    );
  }
  return null;
}

// ── Individual notification card ──────────────────────────────────────────
function NotifCard({ n, onDismiss }: { n: MeshNotification; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  const cfg  = PRIORITY_CONFIG[n.priority] || PRIORITY_CONFIG.LOW;
  const dom  = DOMAIN_CONFIG[n.domain]     || DOMAIN_CONFIG.crowd;
  const meta = n.metadata || {};

  // Tick for relative time updates
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const insight = meta.insight || meta.recommendation || "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 30, scale: 0.97 }}
      animate={{ opacity: 1, x: 0,  scale: 1 }}
      exit={{ opacity: 0, x: -20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className={`relative mx-2 my-1.5 rounded-xl border border-white/[0.07] bg-[#0d0d16] overflow-hidden ${cfg.ring} ${cfg.glow} transition-shadow`}
    >
      {/* Priority pulse ring for CRITICAL */}
      {cfg.pulse && (
        <span className="absolute inset-0 rounded-xl ring-2 ring-rose-500/50 animate-pulse pointer-events-none" />
      )}

      {/* Domain gradient header strip */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${dom.headerGrad}`} />

      <div className="p-3">
        {/* Top row */}
        <div className="flex items-start gap-2.5">
          {/* Priority bar */}
          <div className={`w-1 self-stretch rounded-full shrink-0 ${cfg.bar} ${cfg.pulse ? "animate-pulse" : ""}`} />

          {/* Domain icon bubble */}
          <div className={`w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 ${dom.accent}`}>
            {dom.icon}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-white uppercase tracking-wide">
                {n.type.replace(/_/g, " ")}
              </span>
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${cfg.badge}`}>
                {n.priority}
              </span>
              <span className={`text-[8px] font-bold px-1 py-0.5 rounded bg-white/[0.04] uppercase ${dom.accent}`}>
                {dom.label}
              </span>
            </div>

            {/* Venue */}
            {n.venue_name && (
              <p className="text-[9px] text-slate-500 font-mono mt-0.5 truncate">
                📍 {n.venue_name}
              </p>
            )}

            {/* Description */}
            <p className="text-[11px] text-slate-300 leading-snug mt-1 line-clamp-2">
              {n.description}
            </p>

            {/* Metric chips */}
            <MetricChips n={n} />

            {/* AI insight (collapsed) */}
            {insight && !expanded && (
              <p className="text-[9px] text-slate-500 font-mono mt-1.5 line-clamp-1 italic">
                💡 {insight}
              </p>
            )}

            {/* Expanded detail */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {insight && (
                    <div className="mt-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[9px] text-slate-400 font-mono uppercase tracking-wider font-bold mb-1">
                        💡 AI Insight
                      </p>
                      <p className="text-[10px] text-slate-300 leading-relaxed">{insight}</p>
                    </div>
                  )}
                  {meta.recommendation && (
                    <div className="mt-1.5 p-2 rounded-lg bg-blue-950/30 border border-blue-500/20">
                      <p className="text-[9px] text-blue-400 font-mono uppercase tracking-wider font-bold mb-1">
                        📋 Recommendation
                      </p>
                      <p className="text-[10px] text-slate-300 leading-relaxed">{meta.recommendation}</p>
                    </div>
                  )}
                  {meta.coordinates && (
                    <div className="mt-2 p-2.5 rounded-lg bg-[#042f2e]/50 border border-emerald-500/20 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <p className="text-[9px] text-emerald-400/80 font-mono uppercase tracking-[0.15em] font-black">
                          {t("auto.TacticalLocatio_7049") || "Tactical Location Data"}
                        </p>
                      </div>
                      <p className="text-[11px] text-emerald-300 font-mono font-bold tracking-tight">{meta.coordinates}</p>
                    </div>
                  )}
                  {meta.screenshot_url && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-rose-500/30 bg-black/40 shadow-inner relative group">
                      <div className="absolute top-2 left-2 bg-rose-500/80 backdrop-blur text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-rose-400/50 flex items-center gap-1.5 z-10">
                        <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                        {t("auto.LiveFeedSnapsho_9158") || "Live Feed Snapshot"}
                      </div>
                      <img src={meta.screenshot_url} alt="Incident Snapshot" className="w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-xl pointer-events-none" />
                    </div>
                  )}
                  {/* Raw metadata extras */}
                  {meta.risk_score != null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            Number(meta.risk_score) > 70 ? "bg-rose-500" :
                            Number(meta.risk_score) > 40 ? "bg-orange-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, Number(meta.risk_score))}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono shrink-0">
                        {meta.risk_score}% risk
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom row */}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[9px] text-slate-600 font-mono">
                {relativeTime(n.timestamp)}
              </span>
              {(insight || meta.recommendation) && (
                <button
                  onClick={() => setExpanded((e) => !e)}
                  className="flex items-center gap-0.5 text-[9px] text-cyan-500/60 hover:text-cyan-400 font-bold uppercase tracking-wider transition-colors ml-auto"
                >
                  {expanded ? (
                    <><ChevronUp className="w-2.5 h-2.5" /> {t("auto.Less_263") || "Less"}</>
                  ) : (
                    <><ChevronDown className="w-2.5 h-2.5" /> {t("auto.Details_6811") || "Details"}</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-white/10 rounded-lg transition-all shrink-0 text-slate-600 hover:text-slate-300 mt-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Bell ─────────────────────────────────────────────────────────────
export function NotificationBell() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<MeshNotification[]>([]);
  const [unread, setUnread]   = useState(0);
  const [open, setOpen]       = useState(false);
  const [filter, setFilter]   = useState<string>("ALL");
  const panelRef  = useRef<HTMLDivElement>(null);
  const audioCtx  = useRef<AudioContext | null>(null);

  // Subtle beep on CRITICAL/HIGH
  const beep = useCallback((priority: string) => {
    if (!["CRITICAL", "HIGH"].includes(priority)) return;
    try {
      if (!audioCtx.current) {
        audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = priority === "CRITICAL" ? 880 : 660;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }, []);

  // SSE subscription
  useEffect(() => {
    let sse: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      sse = new EventSource("/api/v1/notifications/stream");
      sse.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.status === "mesh_connected") return;
          const notif = data as MeshNotification;
          setNotifications((prev) => [notif, ...prev].slice(0, 60));
          setUnread((u) => u + 1);
          beep(notif.priority);
        } catch {}
      };
      sse.onerror = () => {
        sse?.close();
        retry = setTimeout(connect, 5000);
      };
    };

    // Load recent from REST
    fetch("/api/v1/notifications/recent?limit=30")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setNotifications(data.slice(0, 30)); })
      .catch(() => {});

    connect();
    return () => { sse?.close(); clearTimeout(retry); };
  }, [beep]);

  // Outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleOpen = () => { setOpen((o) => !o); if (!open) setUnread(0); };
  const dismiss = (id: string) => setNotifications((p) => p.filter((n) => n.id !== id));
  const clearAll = () => setNotifications([]);

  const domains = ["ALL", "traffic", "parking", "incident", "crowd"];
  const filtered = filter === "ALL" ? notifications : notifications.filter((n) => n.domain === filter);
  const criticalCount = notifications.filter((n) => n.priority === "CRITICAL").length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        id="notification-bell"
        onClick={handleOpen}
        className={`relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border transition-all group ${
          criticalCount > 0
            ? "border-rose-500/50 shadow-[0_0_16px_rgba(239,68,68,0.25)]"
            : "border-white/10 hover:border-cyan-500/40"
        }`}
        aria-label={t("auto.Notifications_5440") || "Notifications"}
      >
        <Bell className={`w-5 h-5 transition-colors ${
          criticalCount > 0 ? "text-rose-400 animate-pulse" : "text-slate-400 group-hover:text-cyan-300"
        }`} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-rose-500/40"
            >
              {unread > 99 ? "99+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,   scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="absolute right-0 top-full mt-3 w-[420px] bg-[#080810] border border-white/[0.08] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)] z-[200] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-white/[0.03] to-transparent">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span className="text-[11px] font-black text-white uppercase tracking-[0.15em]">
                  {t("auto.TacticalMesh_1799") || "Tactical Mesh"}
                </span>
                <span className="text-[9px] text-slate-600 font-mono bg-white/[0.04] px-1.5 py-0.5 rounded">
                  {notifications.length} events
                </span>
              </div>
              <button
                onClick={clearAll}
                className="text-[9px] text-slate-600 hover:text-rose-400 font-bold uppercase tracking-widest transition-colors"
              >
                {t("auto.ClearAll_2619") || "Clear All"}
              </button>
            </div>

            {/* Domain filter tabs */}
            <div className="flex gap-1 px-3 py-2 border-b border-white/[0.04] overflow-x-auto no-scrollbar">
              {domains.map((d) => {
                const count = d === "ALL" ? notifications.length : notifications.filter((n) => n.domain === d).length;
                const isActive = filter === d;
                return (
                  <button
                    key={d}
                    onClick={() => setFilter(d)}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                      isActive
                        ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                        : "text-slate-600 hover:text-slate-400 hover:bg-white/[0.04]"
                    }`}
                  >
                    {d !== "ALL" && DOMAIN_CONFIG[d]?.icon && (
                      <span className={`w-3 h-3 ${DOMAIN_CONFIG[d]?.accent}`}>
                        {DOMAIN_CONFIG[d]?.icon}
                      </span>
                    )}
                    {d}
                    {count > 0 && (
                      <span className={`text-[8px] ${isActive ? "text-cyan-400" : "text-slate-700"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* List */}
            <div className="max-h-[460px] overflow-y-auto custom-scrollbar py-1">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400/60" />
                  </div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                    All Clear — No Active Events
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {filtered.map((n) => (
                    <NotifCard key={n.id} n={n} onDismiss={() => dismiss(n.id)} />
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {filtered.length > 0 && (
              <div className="px-4 py-2.5 border-t border-white/[0.04] bg-gradient-to-r from-white/[0.02] to-transparent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[9px] text-slate-600 font-mono uppercase tracking-widest">
                      Neural Mesh Active · Real-time Feed
                    </p>
                  </div>
                  {criticalCount > 0 && (
                    <span className="text-[9px] text-rose-400 font-black uppercase animate-pulse">
                      {criticalCount} Critical
                    </span>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
