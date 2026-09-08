"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Car, AlertTriangle, Activity, BrainCircuit, Upload,
  RotateCw, X, ChevronRight, Zap, Shield, Eye,
  TrendingUp, Clock, MapPin, Radio, Layers,
  FileText, ArrowUpRight, CheckCircle2, AlertCircle,
  Play, Pause, Maximize2, RefreshCw, BarChart3, Grid, ShieldAlert, Video, Settings2
} from "lucide-react";
import { api } from "@/services/api";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useParkingInsights, useTrafficInsights, useIncidentAlerts, useIncidentStream } from "@/hooks/useTelemetry";
import { useRoadVenue } from "@/hooks/useRoadVenue";

// ── Types ──────────────────────────────────────────────────────────────────
interface Camera { id: string; name: string; stream_url?: string; camera_type?: string; venue_id?: string; }
interface Venue  { id: string; name: string; venue_type: string; }

interface AnalysisSummary {
  avg_vehicle_count?: number;
  peak_count?: number;
  avg_speed_px_s?: number;
  avg_wait_min?: number;
  peak_density?: string;
  duration_seconds?: number;
}

interface AnalysisResultData {
  summary?: AnalysisSummary;
  vehicle_breakdown?: Record<string, number>;
  density_matrix?: number[][];
  events?: Array<{ time: string; vehicles: number; speed: string; risk: string }>;
  incidents?: any[];
}

// ── Severity Colours ──────────────────────────────────────────────────────
const SEV: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high:     "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium:   "text-amber-400 bg-amber-500/10 border-amber-500/30",
  low:      "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};

// ── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "cyan", icon: Icon, onClick }: any) {
  const colors: Record<string, string> = {
    cyan:    "border-cyan-500/20 from-cyan-500/5 text-cyan-400",
    rose:    "border-rose-500/20 from-rose-500/5 text-rose-400",
    emerald: "border-emerald-500/20 from-emerald-500/5 text-emerald-400",
    amber:   "border-amber-500/20 from-amber-500/5 text-amber-400",
    violet:  "border-violet-500/20 from-violet-500/5 text-violet-400",
  };

  return (
    <div
      onClick={onClick}
      className={`relative bg-gradient-to-br ${colors[color]} to-transparent border rounded-2xl p-5 flex flex-col gap-2 overflow-hidden ${onClick ? "cursor-pointer hover:scale-[1.02] transition-all shadow-lg" : ""}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
        {onClick && <ArrowUpRight className="w-4 h-4 opacity-70" />}
      </div>
      <p className="text-3xl font-black font-mono leading-none">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 font-mono mt-1">{sub}</p>}
      {Icon && (
        <div className="absolute bottom-2 right-3 opacity-[0.07]">
          <Icon className="w-14 h-14 text-white" />
        </div>
      )}
    </div>
  );
}

// ── Incident Feed Row ──────────────────────────────────────────────────────
function IncidentRow({ inc, idx }: { inc: any; idx: number }) {
  const sev = (inc.severity || inc.risk || "medium").toLowerCase();
  return (
    <motion.div
      key={inc.id || idx}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.04 }}
      className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors"
    >
      <div className={`mt-0.5 px-2 py-0.5 rounded text-[9px] font-mono font-black border uppercase shrink-0 ${SEV[sev] || SEV.medium}`}>
        {sev}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-200 uppercase tracking-wide truncate">
          {inc.type || inc.event_type || "Road Incident Detected"}
        </p>
        <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
          {inc.description || inc.insight || `Timestamp: ${inc.timestamp_seconds ? `${inc.timestamp_seconds}s` : new Date().toLocaleTimeString()}`}
        </p>
      </div>
    </motion.div>
  );
}

// ── Interactive Density Matrix Grid ────────────────────────────────────────
function DensityMatrixGrid({ matrix }: { matrix: number[][] }) {
  if (!matrix || matrix.length === 0) return null;
  const flatVals = matrix.flat();
  const maxVal = Math.max(...flatVals, 1);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5 p-3 bg-black/40 rounded-xl border border-white/5">
        {matrix.map((row, r) =>
          row.map((val, c) => {
            const pct = val / maxVal;
            const bgClass =
              pct > 0.75 ? "bg-rose-500" :
              pct > 0.45 ? "bg-amber-500" :
              pct > 0.15 ? "bg-emerald-500" : "bg-emerald-950/40";

            return (
              <motion.div
                key={`${r}-${c}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: (r * 4 + c) * 0.02 }}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 border border-white/5 ${bgClass} transition-all hover:scale-105`}
                title={`Zone [${r + 1},${c + 1}]: ${val} vehicles`}
              >
                <span className="text-[9px] font-mono font-bold text-white/90">{val}</span>
              </motion.div>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> CLEAR</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> MODERATE</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> CRITICAL</span>
        <span className="text-slate-600">4×4 SPATIAL GRID</span>
      </div>
    </div>
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
        className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/80 backdrop-blur-lg"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 10, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl bg-[#0c0c14] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              {isParking ? <Car className="w-5 h-5 text-emerald-400" /> : <Activity className="w-5 h-5 text-rose-400" />}
              <h2 className="text-base font-black uppercase tracking-widest text-white">
                {isParking ? "Parking Spatial Analytics" : "Traffic Flow Analytics"}
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
                  <StatCard label="Capacity" value={(insights?.overall?.capacity ?? 0) || (insights?.total_slots ?? 100)} color="cyan" />
                </div>
                {zones.length > 0 && (
                  <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
                    <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-[0.3em] mb-4">Parking Zone Matrix</p>
                    <div className="space-y-3">
                      {zones.map(([zoneId, zone]: [string, any]) => {
                        const pct = Math.round(zone.occupancy_pct || 0);
                        return (
                          <div key={zoneId}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-300 font-bold uppercase tracking-wider">Zone {zoneId.toUpperCase()}</span>
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
                  <p className="text-[10px] text-rose-400 font-mono font-bold uppercase tracking-[0.3em] mb-3">Flow Timeline</p>
                  <div className="h-20 flex items-end gap-1">
                    {insights?.timeline && insights.timeline.length > 0 ? (
                      insights.timeline.slice(-30).map((pt: any, i: number) => {
                        const h = Math.min(100, Math.max(8, Number(pt.density || pt.value || pt.count || 10)));
                        return (
                          <div key={i} className="flex-1 rounded-t-sm bg-rose-500/40 hover:bg-rose-500/70 transition-colors"
                            style={{ height: `${h}%` }}
                            title={`Time: ${pt.time || pt.t || i} - Val: ${h}`}
                          />
                        );
                      })
                    ) : (
                      <div className="w-full flex items-center justify-center text-[10px] font-mono text-slate-500 py-6">
                        Real-time telemetry timeline will plot here as vehicles traverse corridor.
                      </div>
                    )}
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

// ── Main Operational Page ─────────────────────────────────────────────────
function RoadIntelligenceContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const urlVenueId = searchParams.get("venue_id");
  const { roadVenueId, setRoadVenue } = useRoadVenue();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<"traffic" | "parking" | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");

  // Forensic Upload Video & Image State
  const [sourceMode, setSourceMode] = useState<"live" | "upload">("live");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResultData | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  // Dynamic Telemetry Polling (scoped by selectedVenueId)
  const { insights: parkingInsights } = (useParkingInsights(selectedVenueId) || {}) as any;
  const { insights: trafficInsights } = (useTrafficInsights(selectedVenueId) || {}) as any;
  const incidentResult = useIncidentAlerts(selectedVenueId) as any;
  const rawAlerts: any[] = Array.isArray(incidentResult?.alerts)
    ? incidentResult.alerts
    : Array.isArray(incidentResult)
    ? incidentResult
    : [];

  // Live SSE Stream for Real-time Road Incidents
  const { lastEvent: liveIncident } = useIncidentStream();
  const [streamAlerts, setStreamAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (liveIncident) {
      setStreamAlerts(prev => [liveIncident, ...prev.filter(e => e.id !== liveIncident.id)].slice(0, 20));
    }
  }, [liveIncident]);

  const activeIncidents = [...streamAlerts, ...rawAlerts].filter(
    (item, idx, arr) => arr.findIndex(x => (x.id && x.id === item.id) || (x.timestamp === item.timestamp && x.type === item.type)) === idx
  ).slice(0, 10);

  // Load Venues & Cameras
  useEffect(() => {
    async function loadData() {
      try {
        const [vRes, cRes] = await Promise.all([api.get("/venues"), api.get("/cameras")]);
        const allV: Venue[] = Array.isArray(vRes.data) ? vRes.data : [];
        const allC: Camera[] = Array.isArray(cRes.data) ? cRes.data : [];

        setVenues(allV);
        setCameras(allC);

        // Determine initial active venue:
        // 1. Prioritize ?venue_id= URL parameter from Venue Management
        // 2. Otherwise stored roadVenueId
        // 3. Otherwise default to "" (Citywide Multi-Venue Matrix)
        if (urlVenueId && allV.some(v => v.id === urlVenueId)) {
          setSelectedVenueId(urlVenueId);
          setRoadVenue(urlVenueId);
        } else if (roadVenueId && allV.some(v => v.id === roadVenueId)) {
          setSelectedVenueId(roadVenueId);
        } else {
          // If there are road-specific venues, suggest the first one
          const roadTyped = allV.filter(v => ["traffic", "parking", "incident"].includes((v.venue_type || "").toLowerCase()));
          if (roadTyped.length > 0) {
            setSelectedVenueId(roadTyped[0].id);
            setRoadVenue(roadTyped[0].id);
          } else if (allV.length > 0) {
            setSelectedVenueId(allV[0].id);
            setRoadVenue(allV[0].id);
          } else {
            setSelectedVenueId("");
          }
        }
      } catch (e) {
        console.error("Failed to load road intelligence data", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [urlVenueId]);

  // Handle venue switcher selection
  const handleVenueChange = (newVenueId: string) => {
    setSelectedVenueId(newVenueId);
    if (newVenueId) {
      setRoadVenue(newVenueId);
    }
  };

  // Poll video upload status when job queued
  useEffect(() => {
    if (!activeJobId || jobStatus === "COMPLETED" || jobStatus === "FAILED") return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/jobs/status/${activeJobId}`);
        const status = res.data?.status;
        setJobStatus(status);
        setJobProgress(res.data?.progress_percent || 0);

        if (res.data?.result_data) {
          setAnalysisResult(res.data.result_data);
        }

        if (status === "COMPLETED") {
          toast.success("Forensic video analysis complete!");
          clearInterval(interval);
        } else if (status === "FAILED") {
          toast.error(`Analysis failed: ${res.data?.error_message || "Error"}`);
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Poll error", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJobId, jobStatus]);

  // Video/Image Upload Handler
  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setAnalysisResult(null);
    setSourceMode("upload"); // Automatically navigate to forensic upload suite
    const toastId = toast.loading("Uploading media to LAMINAR Neural Core…");

    const formData = new FormData();
    formData.append("file", file);

    try {
      if (file.type.startsWith("video/")) {
        setUploadedImageUrl(null);
        const res = await api.post("/jobs/analyze-video", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        const jobId = res.data?.job_id;
        if (jobId) {
          setActiveJobId(jobId);
          setJobStatus("PROCESSING");
          toast.success("Video queued. Neural tracking initiated.", { id: toastId });
        }
      } else {
        const res = await api.post("/traffic/upload-image", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        setActiveJobId(null);
        setJobStatus("COMPLETED");
        const previewUrl = res.data?.screenshot_url ? `/api/v1${res.data.screenshot_url}` : URL.createObjectURL(file);
        setUploadedImageUrl(previewUrl);
        setAnalysisResult({
          summary: {
            avg_vehicle_count: res.data?.count || 0,
            peak_count: res.data?.count || 0,
            avg_speed_px_s: Math.round(res.data?.avg_velocity || 0),
            avg_wait_min: Math.round((res.data?.wait_time_estimate || 0) * 10) / 10,
            peak_density: (res.data?.traffic_flow?.density || "LOW").toUpperCase(),
            duration_seconds: 0
          },
          vehicle_breakdown: res.data?.vehicle_breakdown || {},
          density_matrix: res.data?.density_matrix || [],
          events: [],
          incidents: res.data?.incidents || []
        });
        toast.success(`Image Analysis Complete — ${res.data?.count || 0} vehicles detected`, { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message || "Error"}`, { id: toastId });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  // Calculated metrics (links live edge nodes with active video upload analytics)
  const isAnalyzingUpload = !!activeJobId && jobStatus !== "FAILED";
  const uploadAvgCount   = analysisResult?.summary?.avg_vehicle_count;
  const uploadSpeed      = analysisResult?.summary?.avg_speed_px_s;

  const trafficDensity   = (isAnalyzingUpload && uploadAvgCount !== undefined)
    ? Math.min(100, Math.round(uploadAvgCount * 6))
    : Math.round((trafficInsights?.metrics?.density || 0) * 100);

  const currentSpeed     = (isAnalyzingUpload && uploadSpeed !== undefined)
    ? Math.round(uploadSpeed)
    : Math.round(trafficInsights?.metrics?.avg_speed || 0);

  const parkingAvail     = parkingInsights?.overall?.total_available ?? 0;
  const parkingOccupied  = parkingInsights?.overall?.occupied ?? 0;
  const parkingCap       = parkingInsights?.overall?.capacity ?? 100;
  const hasIncidents     = activeIncidents.length > 0;
  const flowState        = isAnalyzingUpload && uploadAvgCount !== undefined
    ? (uploadAvgCount > 10 ? "congested" : uploadAvgCount > 4 ? "moderate_flow" : "free_flow")
    : ((trafficInsights as any)?.flow_state || "free_flow");
  const flowLabel        = flowState.replace(/_/g, " ").toUpperCase();

  // Active venue metadata
  const currentVenue = venues.find(v => v.id === selectedVenueId);

  // Cameras matching selected venue or all road cameras
  const displayCameras = selectedVenueId
    ? cameras.filter(c => c.venue_id === selectedVenueId)
    : cameras;

  // Parking Configuration Awareness (True if parking cameras exist or zones mapped)
  const hasParkingCameras = displayCameras.some(c => (c.camera_type || "").toLowerCase() === "parking");
  const hasParkingZones = Boolean(parkingInsights?.zones && Object.keys(parkingInsights.zones).length > 0);
  const parkingConfigured = hasParkingCameras || hasParkingZones;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">Initializing Road Intelligence Suite…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080810] text-white flex flex-col font-sans">

      {/* ── TOP NAV BAR WITH UNIFIED VENUE SELECTOR ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.06] bg-[#080810]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/venues" className="p-2.5 rounded-xl hover:bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-all" title="Back to Venue Management">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.15)]">
              <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black uppercase tracking-[0.15em] text-white leading-none">
                  LAMINAR <span className="text-cyan-400">ROAD INTELLIGENCE SUITE</span>
                </h1>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 uppercase">
                  v2.5 Connected
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-widest">
                {venues.length} Sectors Registered · {displayCameras.length} Edge Feeds Online · Real-time AI Vision
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Sector Selector, Primary Source Toggle & Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Primary Source Switcher Toggle */}
          <div className="flex items-center p-1 bg-black/60 border border-white/10 rounded-xl shadow-inner">
            <button
              onClick={() => setSourceMode("live")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-black uppercase tracking-wider transition-all ${
                sourceMode === "live"
                  ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Live Corridor Cameras
              <span className={`px-1.5 py-0.5 text-[9px] rounded-md ${sourceMode === "live" ? "bg-black/30 text-black font-bold" : "bg-white/10 text-slate-300"}`}>
                {displayCameras.length}
              </span>
            </button>
            <button
              onClick={() => setSourceMode("upload")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-black uppercase tracking-wider transition-all ${
                sourceMode === "upload"
                  ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              Upload Road Footage
              {(activeJobId || uploadedImageUrl) && (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </button>
          </div>

          {/* Interactive Sector / Venue Selector Dropdown */}
          <div className="flex items-center gap-2 bg-[#0c1322] border border-cyan-500/30 rounded-xl px-2 py-1 shadow-[0_0_15px_rgba(34,211,238,0.08)]">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1" />
            <select
              value={selectedVenueId}
              onChange={(e) => handleVenueChange(e.target.value)}
              className="bg-transparent text-cyan-400 text-xs font-black font-mono outline-none cursor-pointer py-1 pr-2 max-w-[220px]"
            >
              <option value="" className="bg-[#080810] text-white font-mono">
                🌐 All Sectors (Citywide Matrix)
              </option>
              {venues.map((v) => {
                const camCount = cameras.filter(c => c.venue_id === v.id).length;
                const vType = (v.venue_type || "Sector").toUpperCase();
                return (
                  <option key={v.id} value={v.id} className="bg-[#080810] text-white font-mono">
                    {v.name} · {vType} ({camCount} {camCount === 1 ? "node" : "nodes"})
                  </option>
                );
              })}
            </select>
            {selectedVenueId && (
              <Link
                href={`/venues/${selectedVenueId}`}
                className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-white/5 rounded transition-all"
                title="Open Sector Configuration in Venue Management"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Hazard Status Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono font-black uppercase ${hasIncidents ? "border-rose-500/40 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>
            <span className={`w-2 h-2 rounded-full ${hasIncidents ? "bg-rose-400 animate-ping" : "bg-emerald-400"}`} />
            {hasIncidents ? `${activeIncidents.length} Hazards Active` : "Corridor Clear"}
          </div>

          {/* Sync / Reset Button */}
          <button
            onClick={async () => {
              const tId = toast.loading("Re-synchronizing edge feeds…");
              try {
                await Promise.allSettled([api.post("/parking/reset-frame"), api.post("/traffic/reset")]);
                toast.success("Feeds synchronized with Global State", { id: tId });
              } catch { toast.error("Reset failed", { id: tId }); }
            }}
            className="p-2.5 rounded-xl hover:bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-all"
            title="Re-sync Feeds"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT (SCROLLABLE) ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* ── EXECUTIVE STAT CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {sourceMode === "live" ? (
            <>
              <StatCard
                label="Traffic Flow Density"
                value={`${trafficDensity}%`}
                sub={`Status: ${flowLabel}`}
                color="rose"
                icon={Activity}
                onClick={() => setActiveModal("traffic")}
              />
              <StatCard
                label="Parking Capacity"
                value={parkingConfigured ? parkingAvail : "NOT CONFIGURED"}
                sub={
                  parkingConfigured
                    ? `${parkingOccupied} occupied / ${parkingCap} total spots`
                    : currentVenue
                    ? `No parking nodes mapped in ${currentVenue.name}`
                    : "No parking nodes mapped in sector"
                }
                color={parkingConfigured ? "emerald" : "amber"}
                icon={Car}
                onClick={parkingConfigured ? () => setActiveModal("parking") : undefined}
              />
              <StatCard
                label="Live Hazards & Incidents"
                value={activeIncidents.length}
                sub={hasIncidents ? "Immediate dispatch required" : "Nominal road vectors"}
                color={hasIncidents ? "rose" : "cyan"}
                icon={AlertTriangle}
              />
              <StatCard
                label="Active Edge Nodes"
                value={displayCameras.length}
                sub={currentVenue ? `Scoped to ${currentVenue.name}` : `Aggregating ${venues.length} sectors`}
                color="violet"
                icon={Eye}
              />
            </>
          ) : (
            <>
              <StatCard
                label="Avg Vehicle Volume"
                value={
                  uploadAvgCount !== undefined
                    ? uploadAvgCount
                    : jobStatus === "PROCESSING"
                    ? "Analyzing…"
                    : "0"
                }
                sub={`Peak count: ${analysisResult?.summary?.peak_count ?? 0} vehicles`}
                color="cyan"
                icon={Activity}
              />
              <StatCard
                label="Average Velocity"
                value={
                  uploadSpeed !== undefined
                    ? `${Math.round(uploadSpeed)} px/s`
                    : jobStatus === "PROCESSING"
                    ? "Calculating…"
                    : "0 px/s"
                }
                sub={`Est. corridor delay: ${analysisResult?.summary?.avg_wait_min ?? 0}m`}
                color="amber"
                icon={TrendingUp}
              />
              <StatCard
                label="Footage Incidents"
                value={analysisResult?.incidents?.length || 0}
                sub={
                  (analysisResult?.incidents?.length || 0) > 0
                    ? "Collision / hazard detected"
                    : "Corridor clear — zero hazards"
                }
                color={(analysisResult?.incidents?.length || 0) > 0 ? "rose" : "emerald"}
                icon={AlertTriangle}
              />
              <StatCard
                label="Pipeline Status"
                value={jobStatus || (uploadedImageUrl ? "COMPLETED" : "STANDBY")}
                sub={
                  activeJobId
                    ? `Job: ${activeJobId.slice(0, 8)}`
                    : uploadedImageUrl
                    ? "Snapshot Analyzed"
                    : "Awaiting Media Injection"
                }
                color="violet"
                icon={BrainCircuit}
              />
            </>
          )}
        </div>

        {/* ── MODE 1: FORENSIC UPLOAD & MEDIA ANALYSIS ── */}
        {sourceMode === "upload" && (
          <div className="space-y-8">
            {/* Active Source Banner for Uploaded Media Context */}
            {(activeJobId || uploadedImageUrl) && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-xs font-mono shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                  </span>
                  <span className="font-bold text-white uppercase tracking-wider">Active Pipeline Source:</span>
                  <span className="text-cyan-300 font-bold uppercase">
                    {activeJobId ? "Uploaded Road Video Analysis" : "Uploaded Road Image Snapshot"}
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400">
                    Source ID: <strong className="text-white font-mono">{activeJobId ? activeJobId.slice(0, 8) : "IMG-SNAPSHOT"}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>Sector Context:</span>
                  <span className="text-cyan-300 font-bold">
                    {currentVenue ? `${currentVenue.name} · ${(currentVenue.venue_type || "Road").toUpperCase()}` : "Standalone Corridor Media"}
                  </span>
                </div>
              </div>
            )}

            {/* ── SECTION 1: FORENSIC VIDEO ANALYZER & MEDIA SUITE ── */}
            <div className="bg-white/[0.01] border border-white/[0.08] rounded-3xl p-6 space-y-6 shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                    <Video className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                      Forensic Video & Media Analysis Suite
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-white/5 border border-white/10 text-cyan-400 uppercase">
                        YOLO Neural Pipeline
                      </span>
                    </h2>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">
                      Inject traffic footage or snapshot for bounding boxes, velocity estimation, and density mapping
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <label className={`cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(34,211,238,0.15)] ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                    <Upload className="w-4 h-4" />
                    {uploading ? "Uploading & Analyzing…" : "Inject Media Video/Photo"}
                    <input type="file" accept="video/*,image/*" className="hidden" onChange={handleMediaUpload} disabled={uploading} />
                  </label>
                </div>
              </div>

              {/* Active Job Progress Bar */}
              {activeJobId && jobStatus !== "COMPLETED" && jobStatus !== "FAILED" && (
                <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl space-y-2 animate-pulse">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-cyan-400 font-bold uppercase">Processing Neural Pipeline — Job: {activeJobId.slice(0, 8)}</span>
                    <span className="text-white font-black">{Math.round(jobProgress)}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full" animate={{ width: `${jobProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Media Player / Viewer & Results View */}
              {activeJobId || uploadedImageUrl ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* HTML5 Video Player or Annotated Image */}
                  <div className="lg:col-span-2 space-y-3">
                    <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 relative shadow-2xl flex items-center justify-center">
                      {activeJobId ? (
                        <video
                          src={`/api/v1/jobs/stream/${activeJobId}`}
                          controls
                          autoPlay
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <img
                          src={uploadedImageUrl!}
                          alt="Annotated Traffic Media"
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1">
                      <span>{activeJobId ? `Stream ID: ${activeJobId}` : "Annotated Traffic Snapshot"}</span>
                      <span className="text-emerald-400 font-bold">● Neural Annotated Media Active</span>
                    </div>
                  </div>

                  {/* Analysis Summary Cards */}
                  <div className="space-y-4">
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
                      <p className="text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-[0.2em]">Media Analysis Summary</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase font-mono">Avg Vehicles</p>
                          <p className="text-xl font-black font-mono text-white">
                            {analysisResult?.summary?.avg_vehicle_count !== undefined
                              ? analysisResult.summary.avg_vehicle_count
                              : jobStatus === "PROCESSING" ? "Analyzing…" : "0"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase font-mono">Peak Count</p>
                          <p className="text-xl font-black font-mono text-cyan-400">
                            {analysisResult?.summary?.peak_count !== undefined
                              ? analysisResult.summary.peak_count
                              : jobStatus === "PROCESSING" ? "Analyzing…" : "0"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase font-mono">Avg Velocity</p>
                          <p className="text-xl font-black font-mono text-amber-400">
                            {analysisResult?.summary?.avg_speed_px_s !== undefined
                              ? `${analysisResult.summary.avg_speed_px_s} px/s`
                              : jobStatus === "PROCESSING" ? "Calculating…" : "0 px/s"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase font-mono">Avg Delay</p>
                          <p className="text-xl font-black font-mono text-emerald-400">
                            {analysisResult?.summary?.avg_wait_min !== undefined
                              ? `${analysisResult.summary.avg_wait_min}m`
                              : jobStatus === "PROCESSING" ? "Calculating…" : "0m"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Vehicle Classification Breakdown */}
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2">
                      <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-[0.2em]">Detected Vehicle Types</p>
                      <div className="flex flex-wrap gap-2">
                        {analysisResult?.vehicle_breakdown && Object.keys(analysisResult.vehicle_breakdown).length > 0 ? (
                          Object.entries(analysisResult.vehicle_breakdown).map(([cls, cnt]) => (
                            <span key={cls} className="px-2.5 py-1 bg-white/5 rounded-lg border border-white/10 text-xs font-mono font-bold text-slate-200">
                              {cls} <strong className="text-cyan-400">×{cnt}</strong>
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500 font-mono">
                            {jobStatus === "PROCESSING" ? "Detecting vehicle classes…" : (activeJobId || uploadedImageUrl ? "No vehicles detected in frame" : "Awaiting media input")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Spatial Density Grid */}
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2">
                      <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-[0.2em]">Media Density Matrix</p>
                      <DensityMatrixGrid matrix={analysisResult?.density_matrix || []} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.005]">
                  <Upload className="w-10 h-10 text-slate-600 mb-3" />
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">No Media Selected For Forensic Analysis</p>
                  <p className="text-[11px] text-slate-600 mt-1 max-w-sm">
                    Click <strong className="text-cyan-400">Inject Media Video/Photo</strong> above to upload traffic footage or snapshot for full YOLO vehicle classification, speed calculation, and density mapping.
                  </p>
                </div>
              )}
            </div>

            {/* ── FOOTAGE INCIDENT REVIEW ── */}
            <div className="bg-white/[0.01] border border-white/[0.08] rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <h2 className="text-base font-black uppercase tracking-wider text-white">Footage Incident Analysis</h2>
                </div>
                <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/30">
                  {analysisResult?.incidents?.length || 0} Hazards Detected
                </span>
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {(analysisResult?.incidents?.length || 0) === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-600 font-mono text-xs uppercase tracking-widest">
                    <Shield className="w-8 h-8 mb-2 opacity-40 text-emerald-400" />
                    Corridor Clear — No collision hazards detected in uploaded media
                  </div>
                ) : (
                  analysisResult!.incidents!.map((inc: any, i: number) => (
                    <IncidentRow key={inc.id || i} inc={inc} idx={i} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MODE 2: LIVE CORRIDOR OPERATIONAL FEEDS ── */}
        {sourceMode === "live" && (
          <div className="space-y-8">
            {/* Quick Banner to switch to Forensic Media Suite */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
              <div className="flex items-center gap-3">
                <Video className="w-4 h-4 text-cyan-400 shrink-0" />
                <p className="text-xs text-slate-400 font-mono">
                  Have recorded road footage or snapshot? Switch to <strong className="text-white font-bold">Upload Road Footage</strong> for frame-by-frame YOLO tracking & speed vectors.
                </p>
              </div>
              <button
                onClick={() => setSourceMode("upload")}
                className="px-3.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shrink-0"
              >
                Switch to Media Suite →
              </button>
            </div>

            {/* ── SECTION 2: LIVE OPERATIONAL EDGE NODES GRID ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-base font-black uppercase tracking-wider text-white">Live Operational Edge Nodes</h2>
                  {currentVenue && (
                    <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-lg">
                      Sector: {currentVenue.name}
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-slate-500">{displayCameras.length} Node Feeds Displayed</span>
              </div>

              {displayCameras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 border border-dashed border-white/10 rounded-3xl bg-white/[0.01] text-center p-6">
                  <MapPin className="w-10 h-10 text-slate-600 mb-3" />
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                    {currentVenue ? `No Edge Nodes Attached to "${currentVenue.name}"` : "No Edge Nodes Found"}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 max-w-md">
                    {currentVenue
                      ? "This sector doesn't have camera nodes assigned yet. Attach cameras in Venue Settings, or switch to view citywide nodes."
                      : "Go to Venues and configure your road or traffic cameras to stream into this command center."}
                  </p>
                  <div className="flex items-center gap-3 mt-4">
                    {selectedVenueId && (
                      <button
                        onClick={() => setSelectedVenueId("")}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                      >
                        🌐 View All Citywide Nodes ({cameras.length})
                      </button>
                    )}
                    <Link
                      href={currentVenue ? `/venues/${currentVenue.id}` : "/venues"}
                      className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-all"
                    >
                      Configure Nodes in Venue →
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {displayCameras.map((cam, idx) => {
                    const isParking = (cam.camera_type || "").toLowerCase() === "parking";
                    const streamUrl = isParking
                      ? `/api/v1/parking/stream/${cam.id}`
                      : `/api/v1/traffic/stream/${cam.id}`;
                    const camVenue = venues.find(v => v.id === cam.venue_id);

                    return (
                      <motion.div
                        key={cam.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-white/[0.02] border border-white/[0.07] hover:border-white/20 rounded-2xl overflow-hidden transition-all shadow-xl flex flex-col"
                      >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] bg-black/30">
                          <div className="flex items-center gap-2.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <span className="text-xs font-bold text-white uppercase tracking-wider">{cam.name}</span>
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase ${isParking ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"}`}>
                              {isParking ? "Parking Node" : "Traffic Node"}
                            </span>
                            {camVenue && (
                              <span className="text-[9px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                                {camVenue.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Link href={`/cameras`} className="p-1 text-slate-500 hover:text-cyan-400 transition-colors" title="Configure Camera Node Settings">
                              <Settings2 className="w-3.5 h-3.5" />
                            </Link>
                            <span className="text-[9px] font-mono text-slate-500 uppercase">ONLINE</span>
                            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                          </div>
                        </div>

                        <div className="aspect-video bg-[#05050a] flex items-center justify-center relative overflow-hidden group">
                          <img
                            src={streamUrl}
                            alt={`${cam.name} stream`}
                            className="w-full h-full object-cover relative z-10"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = "0";
                            }}
                            onLoad={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = "1";
                            }}
                          />

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

                          <div className="absolute top-3 left-3 z-20 pointer-events-none">
                            <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 text-[9px] font-mono text-cyan-300">
                              CAM_{idx + 1} // 1080p
                            </div>
                          </div>
                        </div>

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
                              {isParking ? (parkingConfigured ? `${parkingAvail} spots` : "Unconfigured") : `${Math.round(trafficInsights?.metrics?.avg_speed || 0)} km/h`}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── SECTION 3: INCIDENT & PHYSICS ENGINE ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white/[0.01] border border-white/[0.08] rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <h2 className="text-base font-black uppercase tracking-wider text-white">Live Incident & Hazard Engine</h2>
                  </div>
                  <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/30">
                    {activeIncidents.length} Hazards Recorded
                  </span>
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {activeIncidents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-600 font-mono text-xs uppercase tracking-widest">
                      <Shield className="w-8 h-8 mb-2 opacity-40" />
                      No Active Hazards Recorded in Monitored Sector
                    </div>
                  ) : (
                    activeIncidents.map((inc, i) => <IncidentRow key={inc.id || i} inc={inc} idx={i} />)
                  )}
                </div>
              </div>

              {/* Randy AI Operational Explainer */}
              <div className="bg-white/[0.01] border border-white/[0.08] rounded-3xl p-6 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <BrainCircuit className="w-5 h-5 text-violet-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-violet-400">Randy AI Operational Summary</h3>
                  </div>
                  <div className="bg-violet-500/5 border border-violet-500/15 rounded-2xl p-4">
                    <p className="text-xs font-mono text-violet-200/90 leading-relaxed">
                      {(trafficInsights as any)?.randy_summary ||
                        (hasIncidents
                          ? `${activeIncidents.length} active road hazard(s) detected across monitored sectors. Collision vector score elevated. Initiate tactical response.`
                          : "All road systems nominal. Traffic flow and spatial parking parameters operating within safe limits."
                        )}
                    </p>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const tId = toast.loading("Generating Tactical PDF Report…");
                    try {
                      const res = await fetch("/api/v1/traffic/report/pdf");
                      if (!res.ok) throw new Error();
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url; a.download = "road_intelligence_report.pdf"; a.click();
                      toast.success("PDF Downloaded!", { id: tId });
                    } catch { toast.error("Export failed", { id: tId }); }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono font-bold uppercase tracking-widest text-white transition-all shadow-lg"
                >
                  <FileText className="w-4 h-4" />
                  Export PDF Tactical Report
                </button>
              </div>
            </div>
          </div>
        )}

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

export default function RoadIntelligencePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    }>
      <RoadIntelligenceContent />
    </Suspense>
  );
}
