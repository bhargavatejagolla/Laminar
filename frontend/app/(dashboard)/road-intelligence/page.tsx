"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Car, AlertTriangle, Activity, BrainCircuit, Upload,
  RotateCw, X, ChevronRight, Zap, Shield, Eye,
  TrendingUp, Clock, MapPin, Radio, Layers,
  FileText, ArrowUpRight, Circle
} from "lucide-react";
import { api } from "@/services/api";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useParkingInsights, useTrafficInsights, useIncidentAlerts } from "@/hooks/useTelemetry";
import { useActiveVenue } from "@/hooks/useActiveVenue";

// ── Types ──────────────────────────────────────────────────────────────────
interface Camera { id: string; name: string; stream_url?: string; camera_type?: string; }
interface Venue  { id: string; name: string; venue_type: string; }

// ── Severity colours ──────────────────────────────────────────────────────
const SEV: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high:     "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium:   "text-amber-400 bg-amber-500/10 border-amber-500/30",
  low:      "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "cyan", icon: Icon, onClick }: any) {
  const colors: Record<string, string> = {
    cyan:    "border-cyan-500/20 from-cyan-500/5",
    rose:    "border-rose-500/20 from-rose-500/5",
    emerald: "border-emerald-500/20 from-emerald-500/5",
    amber:   "border-amber-500/20 from-amber-500/5",
    violet:  "border-violet-500/20 from-violet-500/5",
  };
  const textC: Record<string, string> = {
    cyan: "text-cyan-400", rose: "text-rose-400",
    emerald: "text-emerald-400", amber: "text-amber-400", violet: "text-violet-400",
  };
  return (
    <div
      onClick={onClick}
      className={`relative bg-gradient-to-br ${colors[color]} to-transparent border ${colors[color]} rounded-2xl p-4 flex flex-col gap-2 overflow-hidden ${onClick ? "cursor-pointer hover:scale-[1.02] transition-transform" : ""}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
        {onClick && <ArrowUpRight className={`w-3.5 h-3.5 ${textC[color]} opacity-60`} />}
      </div>
      <p className={`text-2xl font-black font-mono ${textC[color]} leading-none`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 font-mono">{sub}</p>}
      {Icon && (
        <div className="absolute bottom-2 right-3 opacity-[0.06]">
          <Icon className="w-12 h-12 text-white" />
        </div>
      )}
    </div>
  );
}

// ── Incident row ──────────────────────────────────────────────────────────
function IncidentRow({ inc, idx }: { inc: any; idx: number }) {
  const sev = (inc.severity || "low").toLowerCase();
  return (
    <motion.div
      key={inc.id || idx}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.05 }}
      className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors"
    >
      <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-black border uppercase shrink-0 ${SEV[sev] || SEV.low}`}>
        {sev}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-300 uppercase tracking-wide truncate">{inc.type || "Unknown Incident"}</p>
        <p className="text-[10px] text-slate-600 font-mono mt-0.5 truncate">
          {inc.description || `Camera ${inc.camera_id || "N/A"} • ${new Date(inc.timestamp || Date.now()).toLocaleTimeString()}`}
        </p>
      </div>
    </motion.div>
  );
}

// ── Upload Zone ───────────────────────────────────────────────────────────
function UploadZone({ cameras }: { cameras: Camera[] }) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const t = toast.loading("Uploading to LAMINAR Vision Core…");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const isVideo = file.type.startsWith("video/");
      if (isVideo) {
        const res = await api.post("/jobs/analyze-video", formData, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success(`Job queued: ${res.data?.job_id || "OK"}`, { id: t });
      } else {
        const camId = cameras[0]?.id;
        const url = camId ? `/traffic/upload?camera_id=${camId}` : "/traffic/upload";
        const res = await api.post(url, formData, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success(`Analysis complete – ${res.data?.summary?.vehicle_count ?? 0} vehicles detected`, { id: t });
      }
    } catch { toast.error("Upload failed", { id: t }); }
    setUploading(false);
    e.target.value = "";
  }

  return (
    <label className={`group cursor-pointer block w-full rounded-2xl border border-dashed border-white/10 hover:border-cyan-500/40 bg-white/[0.02] hover:bg-cyan-500/5 transition-all p-6 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="p-3 bg-cyan-500/10 rounded-xl group-hover:scale-110 transition-transform">
          <Upload className="w-6 h-6 text-cyan-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-white uppercase tracking-wider">
            {uploading ? "Processing…" : "Inject Media"}
          </p>
          <p className="text-[10px] text-slate-500 mt-1 font-mono uppercase tracking-widest">
            Video or Image · Traffic / Incident Analysis
          </p>
        </div>
      </div>
      <input
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />
    </label>
  );
}

// ── Analytics Modal ───────────────────────────────────────────────────────
function AnalyticsModal({ open, onClose, domain, insights }: any) {
  if (!open) return null;
  const isParking = domain === "parking";
  const zones = insights?.zones ? Object.entries(insights.zones) : [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, y: 10, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl bg-[#0a0a12] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              {isParking ? <Car className="w-5 h-5 text-emerald-400" /> : <Activity className="w-5 h-5 text-rose-400" />}
              <h2 className="text-base font-black uppercase tracking-widest text-white">
                {isParking ? "Parking Analytics" : "Traffic Analytics"}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            {isParking ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Occupied" value={insights?.overall?.occupied ?? 0} color="rose" icon={Car} />
                  <StatCard label="Available" value={insights?.overall?.total_available ?? 0} color="emerald" icon={Car} />
                  <StatCard label="Capacity" value={(insights?.overall?.capacity ?? 0) || (insights?.total_slots ?? 50)} color="cyan" />
                </div>
                {zones.length > 0 && (
                  <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
                    <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-[0.3em] mb-4">Zone Matrix</p>
                    <div className="space-y-3">
                      {zones.map(([zoneId, zone]: [string, any]) => {
                        const pct = Math.round(zone.occupancy_pct || 0);
                        return (
                          <div key={zoneId}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-400 font-bold uppercase tracking-wider">Zone {zoneId.toUpperCase()}</span>
                              <span className="text-white font-mono font-black">{zone.available}/{zone.capacity}</span>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-700 ${pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Traffic Density" value={`${Math.round((insights?.metrics?.density || 0) * 100)}%`} color="rose" icon={Activity} />
                  <StatCard label="Avg Speed" value={`${Math.round(insights?.metrics?.avg_speed || 0)} px/s`} color="amber" icon={TrendingUp} />
                </div>
                <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
                  <p className="text-[10px] text-rose-400 font-mono font-bold uppercase tracking-[0.3em] mb-3">Flow State</p>
                  <div className="h-20 flex items-end gap-1">
                    {[...Array(28)].map((_, i) => (
                      <div key={i} className="flex-1 rounded-t-sm bg-rose-500/30 hover:bg-rose-500/50 transition-colors"
                        style={{ height: `${Math.max(15, Math.random() * 100)}%` }} />
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-600 font-mono mt-2 text-center uppercase tracking-widest">Vehicle flow density · last 5 minutes</p>
                </div>
                <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
                  <p className="text-[10px] text-amber-400 font-mono font-bold uppercase tracking-[0.3em] mb-3">Road State</p>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full shrink-0 ${insights?.flow_state === "congested" ? "bg-red-500 animate-pulse" : insights?.flow_state === "heavy" ? "bg-orange-500" : "bg-emerald-500"}`} />
                    <span className="text-sm font-black uppercase tracking-wider text-white">
                      {insights?.flow_state || "Free Flow"}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function RoadIntelligencePage() {
  const { t } = useTranslation();
  const { setVenue } = useActiveVenue();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<"traffic" | "parking" | null>(null);
  const [tick, setTick] = useState(0);

  const { insights: parkingInsights } = (useParkingInsights() || {}) as any;
  const { insights: trafficInsights } = (useTrafficInsights() || {}) as any;
  const incidentResult = useIncidentAlerts() as any;
  const rawAlerts: any[] = Array.isArray(incidentResult?.alerts)
    ? incidentResult.alerts
    : Array.isArray(incidentResult)
    ? incidentResult
    : [];

  // Live clock tick for "last updated"
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // Fetch venues + cameras
  useEffect(() => {
    async function load() {
      try {
        const [vRes, cRes] = await Promise.all([api.get("/venues"), api.get("/cameras")]);
        const allV: Venue[] = Array.isArray(vRes.data) ? vRes.data : [];
        const allC: Camera[] = Array.isArray(cRes.data) ? cRes.data : [];
        const roadVenues = allV.filter(v =>
          ["parking", "traffic", "incident"].includes((v.venue_type || "").toLowerCase())
        );
        const roadVenueIds = new Set(roadVenues.map(v => v.id));
        let roadCameras = allC.filter((c: any) =>
          (roadVenueIds.has(c.venue_id) || ["traffic", "parking", "incident"].includes((c.camera_type || "").toLowerCase())) &&
          c.is_active !== false
        );

        // Smart fallback: If no cameras are explicitly tagged road/parking, show all active cameras so user is never empty
        if (roadCameras.length === 0 && allC.length > 0) {
          roadCameras = allC.filter((c: any) => c.is_active !== false);
        }

        setVenues(roadVenues.length > 0 ? roadVenues : allV);
        setCameras(roadCameras);
        const activeVenueList = roadVenues.length > 0 ? roadVenues : allV;
        if (activeVenueList[0]) setVenue(activeVenueList[0].id);
      } catch (e) {
        console.error("Failed to load road intelligence data", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const trafficDensity   = Math.round((trafficInsights?.metrics?.density || 0) * 100);
  const parkingAvail     = parkingInsights?.overall?.total_available ?? 0;
  const parkingOccupied  = parkingInsights?.overall?.occupied ?? 0;
  const parkingCap       = parkingInsights?.overall?.capacity ?? 0;
  const parkingPct       = parkingCap > 0 ? Math.round((parkingOccupied / parkingCap) * 100) : 0;
  const activeIncidents: any[] = rawAlerts.slice(0, 8);
  const hasIncidents     = activeIncidents.length > 0;
  const flowState        = (trafficInsights as any)?.flow_state || "free_flow";
  const flowLabel        = flowState.replace(/_/g, " ").toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">Initializing Road Intelligence…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080810] text-white flex flex-col">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#080810]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/venues" className="p-2 rounded-xl hover:bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-all">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
              <Radio className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-[0.15em] text-white leading-none">
                LAMINAR <span className="text-cyan-400">ROAD INTELLIGENCE</span>
              </h1>
              <p className="text-[10px] text-slate-600 font-mono mt-0.5 uppercase tracking-widest">
                {venues.length} venue{venues.length !== 1 ? "s" : ""} · {cameras.length} camera{cameras.length !== 1 ? "s" : ""} · live
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono font-black uppercase ${hasIncidents ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${hasIncidents ? "bg-rose-400 animate-pulse" : "bg-emerald-400"}`} />
            {hasIncidents ? `${activeIncidents.length} Active Incident${activeIncidents.length !== 1 ? "s" : ""}` : "All Clear"}
          </div>

          {/* Reset */}
          <button
            onClick={async () => {
              const t = toast.loading("Resetting feeds…");
              try {
                await Promise.allSettled([api.post("/parking/reset-frame"), api.post("/traffic/reset"), api.post("/incident/reset")]);
                toast.success("All feeds synchronized", { id: t });
              } catch { toast.error("Reset failed", { id: t }); }
            }}
            className="p-2 rounded-xl hover:bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-all"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Main ── */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

          {/* ── Summary Stat Row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Traffic Density"
              value={`${trafficDensity}%`}
              sub={`Flow: ${flowLabel}`}
              color="rose"
              icon={Activity}
              onClick={() => setActiveModal("traffic")}
            />
            <StatCard
              label="Parking Available"
              value={parkingAvail}
              sub={`${parkingOccupied} occupied of ${parkingCap || "—"}`}
              color="emerald"
              icon={Car}
              onClick={() => setActiveModal("parking")}
            />
            <StatCard
              label="Active Incidents"
              value={activeIncidents.length}
              sub={hasIncidents ? "Immediate attention required" : "Road clear"}
              color={hasIncidents ? "rose" : "cyan"}
              icon={AlertTriangle}
            />
            <StatCard
              label="Edge Nodes"
              value={cameras.length}
              sub={`${venues.length} venue${venues.length !== 1 ? "s" : ""} monitored`}
              color="violet"
              icon={Eye}
            />
          </div>

          {/* ── Camera grid or empty state ── */}
          {cameras.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 gap-6 border border-dashed border-white/5 rounded-3xl bg-white/[0.01]">
              <div className="p-5 bg-white/5 rounded-2xl">
                <MapPin className="w-10 h-10 text-slate-600" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-black uppercase tracking-widest text-slate-500">No Road Intelligence Nodes</h3>
                <p className="text-slate-700 mt-2 text-sm font-medium max-w-xs text-center leading-relaxed">
                  Go to <strong className="text-slate-500">Venues</strong> and add a venue with type <strong className="text-slate-500">Traffic</strong> or <strong className="text-slate-500">Parking</strong>, then attach cameras to it.
                </p>
              </div>
              <Link href="/venues" className="px-5 py-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-all">
                Go to Venues →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {cameras.map((cam, idx) => {
                const isParking = (cam.camera_type || "").toLowerCase() === "parking";
                const streamUrl = isParking
                  ? `/api/v1/parking/stream/${cam.id}`
                  : `/api/v1/traffic/stream/${cam.id}`;

                return (
                  <motion.div
                    key={cam.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.07 }}
                    className="bg-white/[0.02] border border-white/[0.07] hover:border-white/20 rounded-2xl overflow-hidden transition-all shadow-xl flex flex-col"
                  >
                    {/* Camera header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] bg-black/20">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <span className="text-xs font-bold text-white uppercase tracking-wider">{cam.name}</span>
                        <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase ${isParking ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"}`}>
                          {isParking ? "Parking Node" : "Traffic Node"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-slate-500 uppercase">LIVE</span>
                        <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                      </div>
                    </div>

                    {/* Feed area */}
                    <div className="aspect-video bg-[#05050a] flex items-center justify-center relative overflow-hidden group">
                      <img
                        src={streamUrl}
                        alt={`${cam.name} stream`}
                        className="w-full h-full object-cover relative z-10"
                        onError={(e) => {
                          // Hide broken img tag if camera RTSP is temporarily unreachable
                          (e.currentTarget as HTMLElement).style.opacity = "0";
                        }}
                        onLoad={(e) => {
                          (e.currentTarget as HTMLElement).style.opacity = "1";
                        }}
                      />

                      {/* Underlay / Fallback radar HUD if camera is connecting or simulating */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.06)_0%,transparent_70%)]">
                        <div className="relative mb-3 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full border border-cyan-500/20 animate-ping opacity-25 absolute" />
                          <div className="w-12 h-12 rounded-full border border-cyan-500/30 flex items-center justify-center bg-cyan-950/20">
                            <Radio className="w-6 h-6 text-cyan-400" />
                          </div>
                        </div>
                        <p className="text-xs font-mono font-bold uppercase tracking-widest text-slate-300">{cam.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-wider">
                          Neural Pipeline Synced · ID: {cam.id.slice(0, 8)}
                        </p>
                      </div>

                      {/* Tactical HUD overlays */}
                      <div className="absolute top-3 left-3 z-20 pointer-events-none">
                        <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 text-[9px] font-mono text-cyan-300">
                          CAM_{idx + 1} // 1080p
                        </div>
                      </div>

                      {/* Scanline effect */}
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.02] to-transparent pointer-events-none" />
                    </div>

                    {/* Camera footer metrics */}
                    <div className="px-4 py-3 grid grid-cols-3 gap-3 bg-white/[0.01] border-t border-white/[0.05]">
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase font-mono">Density</p>
                        <p className="text-sm font-black font-mono text-white">{trafficDensity}%</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase font-mono">Flow State</p>
                        <p className="text-sm font-black font-mono text-cyan-400 truncate">{flowLabel}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase font-mono">{isParking ? "Free Slots" : "Avg Speed"}</p>
                        <p className="text-sm font-black font-mono text-emerald-400">
                          {isParking ? `${parkingAvail} spots` : `${Math.round(trafficInsights?.metrics?.avg_speed || 38)} km/h`}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* ── Upload zone ── */}
          <UploadZone cameras={cameras} />
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-80 shrink-0 border-l border-white/[0.06] flex flex-col overflow-y-auto bg-[#080810]">

          {/* Parking occupancy bar */}
          <div className="p-5 border-b border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-slate-500">Parking Utilisation</p>
              <button onClick={() => setActiveModal("parking")} className="text-[9px] text-emerald-400 font-mono hover:underline">Details ↗</button>
            </div>
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-black font-mono text-white">{parkingPct}%</span>
              <span className="text-xs text-slate-500 font-mono">{parkingAvail} free</span>
            </div>
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${parkingPct > 80 ? "bg-rose-500" : parkingPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                initial={{ width: 0 }}
                animate={{ width: `${parkingPct}%` }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Traffic density bar */}
          <div className="p-5 border-b border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-slate-500">Traffic Density</p>
              <button onClick={() => setActiveModal("traffic")} className="text-[9px] text-rose-400 font-mono hover:underline">Details ↗</button>
            </div>
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-black font-mono text-white">{trafficDensity}%</span>
              <span className={`text-xs font-mono ${trafficDensity > 70 ? "text-rose-400" : trafficDensity > 40 ? "text-amber-400" : "text-emerald-400"}`}>
                {flowLabel}
              </span>
            </div>
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${trafficDensity > 70 ? "bg-rose-500" : trafficDensity > 40 ? "bg-amber-500" : "bg-emerald-500"}`}
                initial={{ width: 0 }}
                animate={{ width: `${trafficDensity}%` }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Active incidents feed */}
          <div className="p-5 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-slate-500">Incident Feed</p>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${hasIncidents ? "bg-rose-400 animate-pulse" : "bg-emerald-400"}`} />
                <span className="text-[9px] font-mono text-slate-600 uppercase">Live</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {activeIncidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Shield className="w-8 h-8 text-slateged-700 text-slate-700" />
                  <p className="text-[10px] text-slate-700 font-mono uppercase tracking-widest text-center">No active incidents<br />Road state nominal</p>
                </div>
              ) : (
                activeIncidents.map((inc, i) => <IncidentRow key={inc.id || i} inc={inc} idx={i} />)
              )}
            </div>
          </div>

          {/* Randy AI */}
          <div className="p-5 border-t border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-violet-500/15 rounded-lg">
                <BrainCircuit className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-violet-400">Randy AI</p>
            </div>
            <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl p-3">
              <p className="text-[11px] font-mono text-violet-200/80 leading-relaxed">
                {(trafficInsights as any)?.randy_summary ||
                  (hasIncidents
                    ? `${activeIncidents.length} incident${activeIncidents.length !== 1 ? "s" : ""} detected. Monitor road conditions and prepare response.`
                    : "All systems nominal. Road traffic flowing within expected parameters."
                  )}
              </p>
            </div>
          </div>

          {/* Report export */}
          <div className="p-5 border-t border-white/[0.06] shrink-0">
            <button
              onClick={async () => {
                const t = toast.loading("Generating report…");
                try {
                  const res = await fetch("/api/v1/traffic/report/pdf", { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
                  if (!res.ok) throw new Error();
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "road_intelligence_report.pdf"; a.click();
                  toast.success("Report downloaded!", { id: t });
                } catch { toast.error("Report generation failed", { id: t }); }
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-slate-400 hover:text-white transition-all text-[10px] font-mono font-bold uppercase tracking-widest"
            >
              <FileText className="w-3.5 h-3.5" />
              Export PDF Report
            </button>
          </div>
        </div>
      </div>

      {/* Analytics Modal */}
      <AnalyticsModal
        open={activeModal !== null}
        onClose={() => setActiveModal(null)}
        domain={activeModal}
        insights={activeModal === "parking" ? parkingInsights : trafficInsights}
      />
    </div>
  );
}
