"use client";

import { useState, useEffect, useRef } from "react";
import {
  useTrafficInsights,
  useTrafficEvents,
  useTrafficStatus,
  useTrafficAnalytics,
  useTrafficNotifications,
  useTrafficDensityMatrix,
} from "@/hooks/useTelemetry";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  TrafficCone,
  Activity,
  Zap,
  Car,
  AlertTriangle,
  Camera,
  Video,
  Download,
  Upload,
  Clock,
  MapPin,
  FileText,
  Settings2,
  TrendingUp,
  Grid3x3,
  Bell,
  Gauge,
  ShieldAlert,
  BarChart3,
  Check,
  Loader2,
  Signal,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { api } from "@/services/api";
import SplashCursor from "@/components/react-bits/SplashCursor";
import { useTranslation } from "react-i18next";

// ─── Risk / density color maps ───────────────────────────────────────────────

const RISK_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  low: { label: "LOW RISK", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-500" },
  medium: { label: "MEDIUM RISK", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-500" },
  high: { label: "HIGH RISK", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", dot: "bg-orange-500" },
  critical: { label: "CRITICAL RISK", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", dot: "bg-rose-500" },
};

// ─── Components ───────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, label }: { icon: any; label: string }) {
  const { t } = useTranslation();

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 opacity-25 py-8">
      <Icon className="w-7 h-7 text-slate-600 animate-pulse" />
      <p className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] text-center">{label}</p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subLabel, color }: {
  icon: any; label: string; value: string | number; subLabel: string; color: "emerald" | "amber" | "cyan" | "rose";
}) {
  const { t } = useTranslation();
  const c = {
    emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", bar: "bg-emerald-500" },
    amber: { icon: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", bar: "bg-amber-500" },
    cyan: { icon: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", bar: "bg-cyan-500" },
    rose: { icon: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", bar: "bg-rose-500" },
  }[color];

  const isEmpty = value === 0 || value === "0" || value === "0px/s" || value === "0m" || value === "0%";

  return (
    <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-5 relative overflow-hidden group hover:border-white/10 transition-all">
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-white/5 to-transparent -translate-y-10 translate-x-10 rotate-45" />
      <div className={`p-2 w-fit rounded-xl mb-3 border ${c.bg} group-hover:scale-110 transition-transform`}>
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <p className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{label}</p>
      <p className={`text-3xl font-black italic tracking-tighter transition-colors ${isEmpty ? "text-slate-700" : "text-white group-hover:text-emerald-400"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs font-bold text-slate-600 uppercase tracking-tighter">{subLabel}</p>
      <div className="mt-3 h-px w-full bg-white/5" />
      {isEmpty && (
        <p className="text-xs font-mono text-slate-700 mt-1">{t("auto.Awaitinglivedat_4051") || "Awaiting live data..."}</p>
      )}
    </div>
  );
}

function DensityMatrixGrid({ matrix, maxValue }: { matrix: number[][]; maxValue: number }) {
  if (!matrix || matrix.length === 0) return null;
  const cols = matrix[0]?.length || 1;

  return (
    <div className="w-full space-y-1.5">
      <div className="grid gap-0.5 w-full" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {matrix.map((row, r) =>
          row.map((val, c) => {
            const pct = maxValue > 0 ? val / maxValue : 0;
            const color = pct > 0.75 ? "#ef4444" : pct > 0.45 ? "#f97316" : pct > 0.2 ? "#f59e0b" : "#10b981";
            return (
              <motion.div
                key={`${r}-${c}`}
                title={`Zone [${r},${c}]: ${val} vehicles`}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (r * cols + c) * 0.006 }}
                className="aspect-square rounded-sm cursor-pointer hover:scale-110 transition-transform"
                style={{ backgroundColor: color, opacity: Math.max(0.1, pct * 0.85 + 0.15) }}
              />
            );
          })
        )}
      </div>
      <div className="flex items-center gap-3 pt-1">
        {[
          { label: "Clear", color: "#10b981" },
          { label: "Light", color: "#f59e0b" },
          { label: "Heavy", color: "#f97316" },
          { label: "Critical", color: "#ef4444" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.color, opacity: 0.8 }} />
            <span className="text-xs font-bold text-slate-500">{l.label}</span>
          </div>
        ))}
        <span className="ml-auto text-xs font-mono text-slate-600">LIVE · {matrix.length}×{cols} GRID</span>
      </div>
    </div>
  );
}

function Sparkline({ data, color = "#10b981", height = 44 }: { data: number[]; color?: string; height?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const W = 220, H = height;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - (v / max) * (H - 4) - 2}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill={color} fillOpacity="0.10" stroke="none" />
    </svg>
  );
}

function BarChartSvg({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const palette = ["#10b981", "#f59e0b", "#f97316", "#ef4444"];

  return (
    <div className="flex items-end gap-1.5 h-16">
      {entries.map(([label, val], i) => (
        <div key={label} className="flex flex-col items-center gap-1 flex-1">
          <span className="text-xs font-black text-slate-400">{val}</span>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(3, (val / max) * 52)}px` }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="w-full rounded-t-sm"
            style={{ backgroundColor: palette[i % palette.length], opacity: 0.85 }}
          />
          <span className="text-xs text-slate-600 text-center leading-tight">{label.split(" ")[0]}</span>
        </div>
      ))}
    </div>
  );
}

function NotificationCard({ notif, index }: { notif: any; index: number }) {
  const meta = RISK_META[notif.risk_level] || RISK_META.low;
  const ts = new Date(notif.timestamp).toLocaleTimeString();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`p-3 rounded-xl border ${meta.bg} ${meta.border} space-y-2`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${meta.dot} animate-pulse`} />
          <span className={`text-xs font-black uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
        </div>
        <span className="text-xs font-mono text-slate-500">{ts}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <div className="flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-400 font-mono">{notif.latitude?.toFixed(4)}, {notif.longitude?.toFixed(4)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Car className="w-2.5 h-2.5 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-400">{notif.total_vehicles} vehicles</span>
        </div>
        <div className="flex items-center gap-1">
          <Gauge className="w-2.5 h-2.5 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-400">{notif.congestion_level}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-400">{notif.wait_time}m wait</span>
        </div>
      </div>
      <p className={`text-xs leading-snug font-medium ${meta.color} opacity-80`}>{notif.insight}</p>
      <p className="text-xs text-slate-500 italic">{notif.prediction}</p>
      {notif.recommendation && (
        <div className={`mt-2 p-2 rounded-lg bg-white/5 border-l-2 ${meta.border} flex items-start gap-2`}>
          <Zap className={`w-3 h-3 mt-0.5 shrink-0 ${meta.color}`} />
          <p className="text-[10px] font-black uppercase tracking-tight text-white/90 leading-tight">
            {notif.recommendation}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export function TrafficDashboard() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { activeVenueId, setVenue } = useActiveVenue();
  const urlVenueId = searchParams.get("venue_id");
  const urlCamId = searchParams.get("camera_id");

  // All data comes strictly from live backend hooks
  const { insights: data } = useTrafficInsights(2000);
  const { events } = useTrafficEvents();
  const { status } = useTrafficStatus(1500);
  const { analytics } = useTrafficAnalytics(undefined, 3000);
  const { notifications } = useTrafficNotifications(3000);
  const { matrixData } = useTrafficDensityMatrix(undefined, 2000);

  const [cameras, setCameras] = useState<any[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(urlCamId);
  const [isRecording, setIsRecording] = useState(false);

  // Sync Venue context
  useEffect(() => {
    if (urlVenueId && urlVenueId !== activeVenueId) {
      setVenue(urlVenueId);
    }
  }, [urlVenueId, activeVenueId, setVenue]);

  // Upload feature — completely isolated from live stats
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    api.get("/cameras")
      .then((r) => {
        if (!mounted) return;
        const allCams = Array.isArray(r.data) ? r.data : [];
        const relevantCams = allCams.filter((c: any) => ['traffic', 'generic'].includes(c.camera_type));
        let cams = relevantCams.filter((c: any) => !activeVenueId || c.venue_id === activeVenueId);
        
        // If current venue has no relevant cameras, fallback to all relevant cameras
        if (cams.length === 0 && relevantCams.length > 0) {
            cams = relevantCams;
        }

        setCameras(cams);
        if(cams.length > 0 && !activeCameraId) {
            const selected = urlCamId ? cams.find((c: any) => c.id === urlCamId) || cams[0] : cams[0];
            setActiveCameraId(selected.id);
            if (selected.venue_id && selected.venue_id !== activeVenueId) {
              setVenue(selected.venue_id);
            }
        }
    }).catch(console.error);
    return () => { mounted = false; };
  }, [activeCameraId, urlCamId, activeVenueId]);

  const handleCaptureVideo = async () => {
    if (!activeCameraId) return;
    setIsRecording(true);
    try {
      const res = await api.get(`/traffic/snapshot/video?camera_id=${activeCameraId}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = `traffic_${activeCameraId.slice(0, 8)}.mp4`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { console.error("Capture failed", e); }
    finally { setIsRecording(false); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadResult(null);
    setUploadError(null);
    setUploadLoading(true);
    setUploadProgress(0);
    setShowUploadPanel(true);

    const uploadVideo = async (file: File) => {
      setUploadedVideoUrl(URL.createObjectURL(file));
      const progTimer = setInterval(() => setUploadProgress((p) => p < 99 ? p + Math.max(1, (99 - p) * 0.1) : p), 500);
      const fd = new FormData();
      fd.append("file", file);

      try {
        const currentVenue = cameras.find(c => c.id === activeCameraId)?.venue_id;
        const res = await api.post(`/traffic/upload?camera_id=${activeCameraId || "upload-demo"}${currentVenue ? `&venue_id=${currentVenue}` : ""}`, fd);
        clearInterval(progTimer);
        setUploadProgress(100);
        setUploadResult(res.data);
        return res.data;
      } catch (err: any) {
        clearInterval(progTimer);
        throw err;
      }
    };

    if (files.length === 1) {
      try {
        await uploadVideo(files[0]);
      } catch (err: any) {
        const detail = err.response?.data?.detail || err.message;
        setUploadError(`Processing failed: ${detail}`);
      } finally {
        setUploadLoading(false);
      }
    } else {
      toast.info(`Importing ${files.length} traffic videos...`, {
        description: "Executing sequential analysis pipeline."
      });

      let successCount = 0;
      for (let i = 0; i < files.length; i++) {
        try {
          setUploadProgress(0);
          await uploadVideo(files[i]);
          successCount++;
          if (i < files.length - 1) {
            toast.success(`Video ${i + 1}/${files.length} analyzed.`, { duration: 2000 });
          }
        } catch (err: any) {
          console.error(`Error uploading video ${i}:`, err);
        }
      }

      setUploadLoading(false);
      toast.success(`Import complete: ${successCount}/${files.length} videos analyzed.`, {
        description: "Intelligence hub updated with latest telemetry."
      });
    }
  };

  const handleClearVideo = () => {
    setUploadResult(null);
    setUploadedVideoUrl(null);
    setShowUploadPanel(false);
    setUploadError(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Context Switching: Live vs Video Analysis ──────────────────────────────
  const isVideoMode = !!uploadResult;

  // ── Derive values ──────────────────────────────────────────────────────────
  const overall = data?.overall;
  const camStatus = activeCameraId ? (status[activeCameraId] ?? null) : null;

  const liveCount = camStatus?.count ?? overall?.total_vehicles ?? null;
  const liveVelocity = camStatus?.avg_velocity ?? null;
  const liveWait = camStatus?.wait_time_estimate ?? null;
  const liveRisk = camStatus?.risk_score ?? overall?.risk_score ?? null;

  // Active metrics: Use uploadResult if present, otherwise live data
  const activeCount = isVideoMode ? (uploadResult.summary?.avg_vehicle_count ?? 0) : (liveCount ?? 0);
  const activeVelocity = isVideoMode ? (uploadResult.summary?.avg_speed_px_s ?? 0) : (liveVelocity ?? 0);
  const activeWait = isVideoMode ? (uploadResult.summary?.avg_wait_time_min ?? 0) : (liveWait ?? 0);

  const videoRisk = isVideoMode ? (
    uploadResult.summary?.peak_density === "Critical" ? 90 :
      uploadResult.summary?.peak_density === "High" ? 70 :
        uploadResult.summary?.peak_density === "Medium" ? 40 : 15
  ) : 0;

  const activeRisk = isVideoMode ? videoRisk : (liveRisk ?? 0);
  const activeSignal = isVideoMode ? "N/A" : (camStatus?.signal ?? "—");
  const activeDensity = isVideoMode ? uploadResult.summary?.peak_density : (camStatus?.density ?? null);

  const riskScore = activeRisk;
  const riskMeta =
    riskScore > 75 ? RISK_META.critical :
      riskScore > 45 ? RISK_META.high :
        riskScore > 20 ? RISK_META.medium :
          RISK_META.low;

  // Charts
  const countTimeline = isVideoMode
    ? (uploadResult.timeline ?? []).map((t: any) => t.count)
    : (analytics?.count_timeline ?? []).map((p: any) => p.v);

  const speedTimeline = isVideoMode
    ? (uploadResult.timeline ?? []).map((t: any) => t.speed)
    : (analytics?.speed_timeline ?? []).map((p: any) => p.v);

  const riskTimeline = isVideoMode
    ? (uploadResult.timeline ?? []).map((t: any) => t.risk)
    : [];

  const speedHist = isVideoMode ? (uploadResult.vehicle_breakdown ?? {}) : (analytics?.speed_histogram ?? {});

  // Synthesize density breakdown from timeline if in video mode
  const videoDensityBreakdown = isVideoMode ? (uploadResult.timeline ?? []).reduce((acc: any, t: any) => {
    acc[t.density] = (acc[t.density] || 0) + 1;
    return acc;
  }, {}) : {};

  const densityBreak = isVideoMode ? videoDensityBreakdown : (analytics?.density_breakdown ?? {});

  // Synthesize "Live Events" from timeline for the Detection Stream in video mode
  const videoEvents = isVideoMode ? (uploadResult.timeline ?? []).slice(-15).reverse().map((t: any, i: number) => ({
    id: `VIDEO-${t.frame}`,
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
    count: t.count,
    velocity: t.speed,
    risk_score: t.risk,
    density: t.density
  })) : [];

  const displayEvents = isVideoMode ? videoEvents : events;

  // Synthesize Session Summary from video summary
  const videoSummary = isVideoMode ? {
    total_events: uploadResult.frames_analyzed,
    avg_vehicle_count: uploadResult.summary.avg_vehicle_count,
    avg_speed_px_s: uploadResult.summary.avg_speed_px_s,
    avg_wait_time_min: uploadResult.summary.avg_wait_time_min
  } : null;

  const displaySummary = isVideoMode ? videoSummary : analytics?.summary;

  // Density matrix
  const activeMatrix = isVideoMode ? (uploadResult.density_matrix ?? []) : (matrixData?.matrix ?? []);
  const activeMax = isVideoMode ? 10 : (matrixData?.max_value ?? 1);


  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12 relative z-10">
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-40">
        <SplashCursor />
      </div>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/smart-systems" className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-white/20 group transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
                <TrafficCone className="w-4 h-4 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-black text-white tracking-widest uppercase italic">
                {t("auto.Traffic_2235") || "Traffic"} <span className="text-emerald-500">{t("auto.Intelligence_328") || "Intelligence"}</span>
              </h1>
              <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs font-black text-emerald-400 tracking-tighter uppercase relative top-[-6px]">
                {t("auto.V5LIVE_5515") || "V5 LIVE"}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5 ml-[52px]">
              LIVE FEED · {cameras.length} NODE{cameras.length !== 1 ? "S" : ""} ·{" "}
              {isVideoMode ? (
                <span className="text-emerald-400 font-black animate-pulse">{t("auto.VIDEOANALYSISMO_8150") || "VIDEO ANALYSIS MODE"}</span>
              ) : liveRisk !== null
                ? <span className={riskMeta.color}>{riskMeta.label}</span>
                : <span className="text-slate-600">{t("auto.AWAITINGDATA_5604") || "AWAITING DATA"}</span>
              }
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()} disabled={uploadLoading}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-40">
            {uploadLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <Upload className="w-3.5 h-3.5 text-emerald-400" />}
            UPLOAD VIDEO
          </button>
          <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleFileChange} />

          <button onClick={handleCaptureVideo} disabled={isRecording || !activeCameraId}
            className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs font-bold transition-all active:scale-95 ${isRecording ? "bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse" : "bg-white/5 border-white/10 text-white hover:bg-white/10"
              }`}>
            <Video className={`w-3.5 h-3.5 ${isRecording ? "text-rose-400" : "text-emerald-400"}`} />
            {isRecording ? "RECORDING..." : "CAPTURE CLIP"}
          </button>

          <button onClick={() => window.open("/api/v1/traffic/report/pdf", "_blank")}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-500 text-black border border-emerald-400 rounded-xl text-xs font-black hover:bg-emerald-400 active:scale-95 shadow-[0_0_16px_rgba(16,185,129,0.3)] transition-all">
            <Download className="w-3.5 h-3.5" />
            {t("auto.EXPORTPDF_7156") || "EXPORT PDF"}
          </button>
        </div>
      </div>

      {/* ── STAT CARDS ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Car} label={t("auto.TotalVehicles_2202") || "Total Vehicles"} value={activeCount} subLabel={isVideoMode ? "Avg Detection Count" : "Live Detection Count"} color="emerald" />
        <StatCard icon={Zap} label={t("auto.AvgFlowSpeed_7792") || "Avg Flow Speed"} value={`${activeVelocity}px/s`} subLabel="Centroid Velocity" color="cyan" />
        <StatCard icon={Clock} label={t("auto.WaitTimeEst_5837") || "Wait Time Est."} value={`${activeWait}m`} subLabel="Queue Impact" color="amber" />
        <StatCard icon={ShieldAlert} label={t("auto.CongestionRisk_4803") || "Congestion Risk"} value={`${activeRisk}%`} subLabel={riskMeta.label} color={riskScore > 75 ? "rose" : riskScore > 45 ? "amber" : "emerald"} />
      </div>

      {/* ── MAIN GRID ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* LEFT — 8 cols */}
        <div className="xl:col-span-8 space-y-5">

          {/* LIVE VIDEO FEED ─────────────────────────────────────────────── */}
          <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl overflow-hidden flex flex-col relative shadow-2xl group min-h-[380px]">
            {/* Top bar */}
            <div className="absolute inset-x-0 top-0 z-20 p-4 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeCameraId ? "bg-rose-500 animate-pulse shadow-[0_0_6px_rgb(244,63,94)]" : "bg-slate-700"}`} />
                <span className="text-xs font-black text-white uppercase tracking-[0.25em]">
                  {activeCameraId ? "LIVE CAMERA FEED" : "NO CAMERA ACTIVE"}
                </span>
              </div>

              <div className="relative flex items-center">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <select
                  value={activeCameraId || ""}
                  onChange={(e) => setActiveCameraId(e.target.value)}
                  className="appearance-none bg-black/60 backdrop-blur-xl border border-white/10 hover:border-emerald-500/50 text-white text-xs font-black uppercase tracking-wider rounded-xl pl-8 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer"
                >
                  <option value="" disabled className="bg-black text-slate-500">
                    {cameras.length === 0 ? "NO TRAFFIC CAMERAS FOUND" : "SELECT CAMERA"}
                  </option>
                  {cameras.map((c, i) => (
                    <option key={c.id} value={c.id} className="bg-[#0a0a0f] text-white">
                      {c.name || `Node ${i + 1}`}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>

            {/* Stream */}
            <div className="flex-1 relative bg-[#020205] overflow-hidden min-h-[340px]">
              {activeCameraId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/v1/traffic/stream/${activeCameraId}`}
                  alt="Live Traffic Feed"
                  className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-4 opacity-25">
                  <Camera className="w-12 h-12 text-slate-700 animate-pulse" />
                  <p className="text-xs font-mono font-black text-slate-600 uppercase tracking-widest">{t("auto.NoCameraHardwar_5524") || "No Camera Hardware Active"}</p>
                </div>
              )}

              {/* HUD overlays — only shown when camera is active */}
              {activeCameraId && (
                <>
                  {/* Signal state pill */}
                  <div className="absolute top-14 left-4 pointer-events-none">
                    <div className={`flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur rounded-xl border ${activeSignal === "Red" ? "border-rose-500/50" : activeSignal === "Yellow" ? "border-amber-500/50" : "border-emerald-500/50"
                      }`}>
                      <Signal className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-black text-slate-400 uppercase">{t("auto.Signal_5458") || "Signal"}</span>
                      <span className={`text-xs font-black uppercase ${activeSignal === "Red" ? "text-rose-400" : activeSignal === "Yellow" ? "text-amber-400" : "text-emerald-400"
                        }`}>{activeSignal}</span>
                    </div>
                  </div>

                  {/* Density badge */}
                  {activeDensity && (
                    <div className="absolute top-14 right-4 pointer-events-none">
                      <div className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase border ${activeDensity === "Critical" ? "bg-rose-500/20 border-rose-500/50 text-rose-400" :
                        activeDensity === "High" ? "bg-orange-500/20 border-orange-500/50 text-orange-400" :
                          activeDensity === "Medium" ? "bg-amber-500/20 border-amber-500/50 text-amber-400" :
                            "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                        }`}>{activeDensity} Density</div>
                    </div>
                  )}

                  {/* Model info */}
                  <div className="absolute bottom-4 left-4 pointer-events-none">
                    <div className="bg-black/70 backdrop-blur-md border border-white/10 px-3 py-2 rounded-xl flex items-center gap-2">
                      <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
                      <div>
                        <p className="text-xs font-black text-slate-500 uppercase">YOLO Inference · CPU</p>
                        <p className="text-xs font-black text-white">NANO · 2 Hz · LIVE</p>
                      </div>
                    </div>
                  </div>

                  {/* Count badge */}
                  {activeCount !== null && (
                    <div className="absolute bottom-4 right-4 pointer-events-none">
                      <div className="bg-emerald-500/20 backdrop-blur border border-emerald-500/30 px-3 py-2 rounded-xl text-center">
                        <p className="text-xs font-black text-emerald-400 uppercase">{isVideoMode ? "Avg Count" : "Vehicles"}</p>
                        <p className="text-xl font-black text-white">{activeCount}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* UPLOAD ANALYSIS PANEL — isolated, never affects live stats */}
          <AnimatePresence>
            {showUploadPanel && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-[#0a0a0f] border border-amber-500/20 rounded-2xl overflow-hidden"
              >
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <h4 className="text-xs font-black text-white uppercase tracking-widest">{t("auto.VideoUploadAnal_5640") || "Video Upload Analysis"}</h4>
                    <span className="text-xs px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded font-black text-amber-400">{t("auto.ANALYSISACTIVE_5582") || "ANALYSIS ACTIVE"}</span>
                  </div>
                  <button onClick={handleClearVideo} className="bg-white/10 hover:bg-rose-500/20 border border-white/10 px-3 py-1 rounded-lg text-[10px] font-black text-white transition-all uppercase tracking-widest">{t("auto.REMOVEVIDEO_9291") || "REMOVE VIDEO"}</button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Video preview */}
                  {uploadedVideoUrl && (
                    <video src={uploadedVideoUrl} controls muted className="w-full rounded-xl max-h-[220px] bg-black" />
                  )}

                  {/* Progress */}
                  {uploadLoading && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                        <span className="text-xs font-black text-emerald-400 uppercase">{t("auto.ProcessingwithY_4369") || "Processing with YOLO..."}</span>
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div animate={{ width: `${uploadProgress}%` }} className="h-full bg-emerald-500 rounded-full" />
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <p className="text-xs text-rose-400 font-bold">{uploadError}</p>
                    </div>
                  )}

                  {uploadResult && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-black text-emerald-400 uppercase">Analysis Complete · {uploadResult.frames_analyzed} frames</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Avg Vehicles", value: uploadResult.summary?.avg_vehicle_count },
                          { label: "Peak Count", value: uploadResult.summary?.max_vehicle_count },
                          { label: "Avg Speed", value: `${uploadResult.summary?.avg_speed_px_s}px/s` },
                          { label: "Avg Wait", value: `${uploadResult.summary?.avg_wait_time_min}m` },
                          { label: "Peak Density", value: uploadResult.summary?.peak_density },
                          { label: "Duration", value: `${uploadResult.duration_s}s` },
                        ].map((s) => (
                          <div key={s.label} className="bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
                            <p className="text-xs uppercase text-slate-500 tracking-widest">{s.label}</p>
                            <p className="text-sm font-black text-white">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      {Object.keys(uploadResult.vehicle_breakdown || {}).length > 0 && (
                        <div>
                          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">{t("auto.VehicleTypes_7247") || "Vehicle Types"}</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(uploadResult.vehicle_breakdown).map(([cls, cnt]: [string, any]) => (
                              <span key={cls} className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border border-white/5 rounded-lg text-xs font-bold text-white capitalize">
                                {cls} <span className="text-emerald-400">×{cnt}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* DENSITY MATRIX ─────────────────────────────────────────────── */}
          <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid3x3 className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{isVideoMode ? "Video Analysis Density Matrix" : "Live Traffic Density Matrix"}</h4>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isVideoMode ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
                <span className="text-xs font-mono text-slate-500 uppercase">{isVideoMode ? "Static Snapshot" : "Real-Time · YOLO"}</span>
              </div>
            </div>
            <div className="max-w-2xl mx-auto w-full">
              {activeMatrix.length > 0
                ? <DensityMatrixGrid matrix={activeMatrix} maxValue={activeMax} />
                : <EmptyState icon={Grid3x3} label={t("auto.Awaitingdetecti_9394") || "Awaiting detection frames to build matrix"} />
              }
            </div>
          </div>

          {/* ANALYTICS CHARTS ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{t("auto.VehicleCountTre_6010") || "Vehicle Count Trend"}</h4>
              </div>
              {countTimeline.length > 1
                ? <Sparkline data={countTimeline} color="#10b981" />
                : <EmptyState icon={Activity} label={t("auto.Collectinglivee_4787") || "Collecting live events..."} />
              }
            </div>

            <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{isVideoMode ? "Vehicle Breakdown" : "Speed Distribution"}</h4>
              </div>
              {Object.values(speedHist).some((v: any) => v > 0)
                ? <BarChartSvg data={speedHist} />
                : <EmptyState icon={BarChart3} label={isVideoMode ? "No breakdown data" : "Collecting speed samples..."} />
              }
            </div>

            <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{t("auto.AvgSpeedTimelin_3735") || "Avg Speed Timeline"}</h4>
              </div>
              {speedTimeline.length > 1
                ? <Sparkline data={speedTimeline} color="#06b6d4" />
                : <EmptyState icon={Activity} label={t("auto.Collectinglivee_4787") || "Collecting live events..."} />
              }
            </div>

            <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{t("auto.CongestionBreak_8445") || "Congestion Breakdown"}</h4>
              </div>
              {Object.values(densityBreak).some((v: any) => v > 0)
                ? <BarChartSvg data={densityBreak} />
                : <EmptyState icon={Gauge} label={t("auto.Collectinglived_2707") || "Collecting live density data..."} />
              }
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — 4 cols */}
        <div className="xl:col-span-4 space-y-5">

          {/* RISK INDICATOR ─────────────────────────────────────────────────── */}
          <div className={`bg-[#0a0a0f] border rounded-2xl p-5 space-y-3 ${riskMeta.border}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className={`w-4 h-4 ${riskMeta.color}`} />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{t("auto.RiskLevel_6360") || "Risk Level"}</h4>
              </div>
              <div className={`w-2 h-2 rounded-full ${riskMeta.dot} animate-pulse`} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 font-black uppercase">{isVideoMode ? "Video Aggregated Risk" : "Live Congestion Risk"}</span>
                <span className={`text-xs font-black ${riskMeta.color}`}>
                  {activeRisk}%
                </span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  animate={{ width: `${riskScore}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full"
                  style={{ background: riskScore > 75 ? "#ef4444" : riskScore > 45 ? "#f97316" : riskScore > 20 ? "#f59e0b" : "#10b981" }}
                />
              </div>
            </div>
            <div className={`p-3 rounded-xl ${riskMeta.bg} border ${riskMeta.border}`}>
              <div className="flex items-start gap-2">
                <Zap className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${riskMeta.color}`} />
                <p className={`text-xs leading-snug italic ${riskMeta.color} opacity-80`}>
                  {isVideoMode
                    ? `Video analysis shows ${activeDensity} traffic patterns with an average of ${activeCount} vehicles detected.`
                    : (data?.suggestion ?? "Awaiting live traffic telemetry...")}
                </p>
              </div>
            </div>
          </div>

          {/* LIVE ALERTS ───────────────────────────────────────────────────── */}
          <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl overflow-hidden flex flex-col h-[400px] shrink-0">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02] shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-amber-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{t("auto.LiveIntelligenc_7579") || "Live Intelligence Alerts"}</h4>
              </div>
              {notifications.length > 0 && !isVideoMode && (
                <span className="text-xs px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded font-black text-amber-400">
                  {notifications.length} ACTIVE
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              <AnimatePresence>
                {notifications.length > 0
                  ? notifications.map((n: any, i: number) => <NotificationCard key={n.id} notif={n} index={i} />)
                  : <EmptyState icon={Bell} label={t("auto.Noalertstraffic_3832") || "No alerts — traffic is nominal or no camera active"} />
                }
              </AnimatePresence>
            </div>
          </div>

          {/* DETECTION STREAM ──────────────────────────────────────────────── */}
          <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl overflow-hidden flex flex-col h-[400px] shrink-0">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02] shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{isVideoMode ? "Analysis Event Log" : "Detection Stream"}</h4>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isVideoMode ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
                <span className="text-xs font-black text-slate-500">{isVideoMode ? "STATIC · ARCHIVE" : "SSE · LIVE"}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
              <AnimatePresence initial={false}>
                {displayEvents.length > 0
                  ? displayEvents.map((ev: any) => (
                    <motion.div key={ev.id}
                      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      className="bg-white/[0.03] border border-white/5 hover:border-emerald-500/20 p-2.5 rounded-xl transition-all">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono font-black text-emerald-500">#{ev.id?.split("-")[2]}</span>
                        <span className="text-xs text-slate-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-xs text-slate-600 uppercase">{t("auto.Vehicles_1521") || "Vehicles"}</p>
                          <p className="text-sm font-black text-white">{ev.count}</p>
                        </div>
                        <div className="w-px h-5 bg-white/5" />
                        <div className="text-center">
                          <p className="text-xs text-slate-600 uppercase">{t("auto.Speed_1854") || "Speed"}</p>
                          <p className="text-sm font-black text-cyan-400">{ev.velocity}<span className="text-xs">px/s</span></p>
                        </div>
                        <div className="w-px h-5 bg-white/5" />
                        <div className="text-center">
                          <p className="text-xs text-slate-600 uppercase">{t("auto.Risk_5782") || "Risk"}</p>
                          <p className="text-sm font-black text-rose-400">{ev.risk_score ?? 0}%</p>
                        </div>
                        <div className="ml-auto">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-black uppercase ${ev.density === "Critical" ? "bg-rose-500 text-white" :
                            ev.density === "High" ? "bg-orange-500 text-white" :
                              ev.density === "Medium" ? "bg-amber-500 text-black" :
                                "bg-emerald-500/20 text-emerald-400"
                            }`}>{ev.density}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                  : <EmptyState icon={Activity} label={t("auto.Synchronizingli_3936") || "Synchronizing live event bus..."} />
                }
              </AnimatePresence>
            </div>
          </div>

          {/* SESSION SUMMARY ───────────────────────────────────────────────── */}
          {displaySummary && (displaySummary.total_events ?? 0) > 0 && (
            <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{isVideoMode ? "Video Analysis Summary" : "Live Session Summary"}</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Events", value: displaySummary.total_events },
                  { label: "Avg Count", value: displaySummary.avg_vehicle_count },
                  { label: "Avg Speed", value: `${displaySummary.avg_speed_px_s}px/s` },
                  { label: "Avg Wait", value: `${displaySummary.avg_wait_time_min}m` },
                ].map((s) => (
                  <div key={s.label} className="bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
                    <p className="text-xs uppercase text-slate-500 tracking-widest">{s.label}</p>
                    <p className="text-sm font-black text-white">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
