"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useIncidentAlerts, useIncidentStream } from "@/hooks/useTelemetry";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import SplashCursor from "@/components/react-bits/SplashCursor";
import { useSearchParams } from "next/navigation";
import { api } from "@/services/api";
import {
  ArrowLeft,
  ShieldAlert,
  Flame,
  MapPin,
  Clock,
  AlertCircle,
  Bell,
  Activity,
  Radio,
  UploadCloud,
  Navigation,
  Crosshair,
  Server,
  Video,
  Maximize2,
  Zap,
  Trash2,
  User as UserIcon,
  ShieldCheck,
  FileDown,
  Loader2,
  Eye,
  Cpu,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

// ── TACTICAL CAMERA COMPONENT ──────────────────────────────────────────
function LiveTacticalCamera({
  venueId,
  initialCamId,
}: {
  venueId: string | null;
  initialCamId?: string | null;
}) {
  const { t } = useTranslation();

  const [activeCam, setActiveCam] = useState<any>(null);
  const [camsList, setCamsList] = useState<any[]>([]);

  useEffect(() => {
    if (!venueId) return;
    const fetchCams = async () => {
      try {
        // Use auth-aware api service (attaches JWT automatically)
        const res = await api.get(`/cameras?venue_id=${venueId}&camera_type=security`);
        const cams = res.data;
        if (cams && cams.length > 0) {
          setCamsList(cams);
          const selected = initialCamId
            ? cams.find((c: any) => c.id === initialCamId) || cams[0]
            : cams[0];
          setActiveCam(selected);
        }
      } catch (e) {
        console.error("Tactical cam resolution failed", e);
      }
    };
    fetchCams();
  }, [venueId, initialCamId]);

  if (!venueId || !activeCam)
    return (
      <div className="aspect-video bg-black/40 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3">
        <Video className="w-8 h-8 text-slate-800" />
        <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest">
          {t("auto.AwaitingTactica_1451") || "Awaiting Tactical Feed..."}
        </p>
      </div>
    );

  return (
    <div className="relative group rounded-2xl overflow-hidden border border-white/10 aspect-video shadow-2xl bg-black">
      <img
        src={`/api/v1/traffic/stream/${activeCam.id}`}
        alt="Tactical Feed"
        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
        onError={(e) => {
          e.currentTarget.src =
            "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&q=80&w=1200";
        }}
      />

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-4 left-4 flex gap-2">
          <div className="bg-rose-500 text-white text-[8px] font-black px-2 py-1 rounded-sm tracking-widest animate-pulse flex items-center gap-1.5 shadow-lg">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
            LIVE_TACTICAL_FEED
          </div>
          <div className="bg-black/80 backdrop-blur-md border border-white/10 text-white text-[8px] font-mono px-2 py-1 rounded-sm tracking-widest uppercase italic">
            OBJ_DET · ACTIVE
          </div>
        </div>

        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md border border-white/10 p-1.5 rounded-lg flex items-center justify-center text-slate-400">
          <Maximize2 className="w-3 h-3 hover:text-white cursor-pointer pointer-events-auto" />
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
          <div className="space-y-1">
            <div className="relative inline-block mb-1">
              <select
                value={activeCam.id}
                onChange={(e) => setActiveCam(camsList.find(c => c.id === e.target.value))}
                className="appearance-none bg-black/80 backdrop-blur-md border border-white/10 hover:border-rose-500/50 text-[10px] text-white font-black uppercase tracking-widest shadow-black drop-shadow-md rounded-lg pl-2.5 pr-7 py-1.5 cursor-pointer focus:outline-none transition-colors"
              >
                {camsList.map((c: any) => (
                  <option key={c.id} value={c.id} className="bg-[#0a0a0f] text-white">
                    {c.name.toUpperCase()}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div className="flex gap-2 text-[7px] text-rose-400 font-mono font-bold tracking-tighter">
              <span>{t("auto.LAT174411_5933") || "LAT: 17.4411"}</span>
              <span>{t("auto.LNG786601_5719") || "LNG: 78.6601"}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[8px] text-emerald-400 font-mono font-black animate-pulse uppercase italic">
              {t("auto.SyncStable_162") || "Sync: Stable"}
            </span>
            <div className="h-0.5 w-24 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: ["20%", "80%", "40%"] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="h-full bg-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ALERT SOURCE BADGE ─────────────────────────────────────────────────
function SourceBadge({ source }: { source?: string }) {
  const { t } = useTranslation();
  if (!source) return null;
  if (source === "SYNCHRONOUS_VIDEO_UPLOAD") {
    return (
      <span className="text-[7px] px-1.5 py-0.5 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded font-black uppercase tracking-tighter flex items-center gap-1">
        <Video className="w-2.5 h-2.5" /> {t("auto.VIDEO_6724") || "VIDEO"}
      </span>
    );
  }
  return (
    <span className="text-[7px] px-1.5 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded font-black uppercase tracking-tighter flex items-center gap-1">
      <Eye className="w-2.5 h-2.5" /> {t("auto.LIVE_112") || "LIVE"}
    </span>
  );
}

// ── STAT CARD ──────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  pulse,
}: {
  label: string;
  value: number | string;
  icon: any;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className={`bg-[#0a0a0f] border border-white/5 rounded-xl p-3 flex items-center gap-3`}>
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className={`w-4 h-4 ${pulse ? "animate-pulse" : ""}`} />
      </div>
      <div>
        <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest leading-none mb-0.5">
          {label}
        </p>
        <p className="text-base font-black text-white leading-none">{value}</p>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────
export function IncidentDashboard() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { activeVenueId, setVenue } = useActiveVenue();
  const urlVenueId = searchParams.get("venue_id");
  const urlCamId = searchParams.get("camera_id");

  const [venueId, setVenueId] = useState<string | null>(
    urlVenueId || activeVenueId
  );
  const { alerts: liveAlerts, loading } = useIncidentAlerts();
  const { lastEvent } = useIncidentStream();
  const [isPulsing, setIsPulsing] = useState(false);

  const [sessionAlerts, setSessionAlerts] = useState<any[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [dispatchedIds, setDispatchedIds] = useState<Set<string>>(new Set());
  const [tacticalLogs, setTacticalLogs] = useState<
    { time: string; message: string; type: string; source: string }[]
  >([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Sync URL venue with global state
  useEffect(() => {
    if (urlVenueId && urlVenueId !== activeVenueId) {
      setVenue(urlVenueId);
    }
  }, [urlVenueId, activeVenueId, setVenue]);

  useEffect(() => {
    if (activeVenueId) setVenueId(activeVenueId);
  }, [activeVenueId]);

  // ── BEST-IN-CLASS NOTIFICATIONS ────────────────────────────────────
  useEffect(() => {
    if (!lastEvent) return;

    const isCritical = lastEvent.priority === "CRITICAL";

    if (isCritical) {
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 3000);

      toast.error(`CRITICAL HIT: ${lastEvent.type}`, {
        description: lastEvent.description,
        duration: 10000,
        action: {
          label: "Engage Protocol",
          onClick: () => handleDispatchPolice(lastEvent.id),
        },
      });
    } else {
      toast.info(`Tactical Alert: ${lastEvent.type}`, {
        description: lastEvent.description,
        duration: 5000,
      });
    }

    // Dynamic session persistence
    setSessionAlerts((prev) => {
      if (prev.some((a) => a.id === lastEvent.id)) return prev;
      return [lastEvent, ...prev];
    });
  }, [lastEvent]);

  // ── FIX: Use auth-aware api service for venues fetch ──
  useEffect(() => {
    if (venueId) return;
    const fetchVenues = async () => {
      try {
        const res = await api.get("/venues");
        const venues = res.data;
        if (venues && venues[0]) {
          setVenueId(venues[0].id);
          setVenue(venues[0].id);
        }
      } catch (e: any) {
        // Graceful degradation – don't crash UI if venues unavailable
        console.warn("Venue auto-load skipped:", e?.response?.status ?? e?.message);
      }
    };
    fetchVenues();
  }, [venueId, setVenue]);

  const allAlerts = Array.from(
    new Map(
      [...liveAlerts, ...sessionAlerts].map((a) => [a.id, a])
    ).values()
  ).sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Build tactical logs from all alerts
  useEffect(() => {
    if (allAlerts.length > 0) {
      const latest = allAlerts[0];
      const source =
        latest.analysis_type === "SYNCHRONOUS_VIDEO_UPLOAD" ? "VIDEO" : "LIVE";
      const logMsg = `[${source}] ${latest.type} · ${latest.priority}`;
      setTacticalLogs((prev) => {
        if (prev[0]?.message === logMsg) return prev;
        return [
          {
            time: new Date().toLocaleTimeString(),
            message: logMsg,
            type: latest.priority,
            source,
          },
          ...prev,
        ].slice(0, 10);
      });
    }
  }, [allAlerts]);

  // ── PDF Download (blob) with auth ──────────────────────────────────
  const handleExportPDF = useCallback(async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await api.get("/incident/report/pdf", {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "incident_tactical_log.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Tactical log exported successfully.");
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "PDF generation failed on server.";
      toast.error(`Export failed: ${msg}`);
    } finally {
      setPdfLoading(false);
    }
  }, [pdfLoading]);

  // ── Video upload ──────────────────────────────────────────────────
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadLoading(true);

    const uploadFile = async (file: File) => {
      setUploadedVideoUrl(URL.createObjectURL(file));
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(
        `/api/v1/incident/upload?venue_id=${venueId || ""}`,
        {
          method: "POST",
          body: fd,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );

      if (!res.ok) throw new Error("Upload failed on server.");
      const data = await res.json();
      if (data.success) {
        setSessionAlerts((prev) => [data.incident, ...prev]);
        if (data.incident.processed_video_url) {
          // Replace raw video with annotated AI stream
          setUploadedVideoUrl(data.incident.processed_video_url);
        }
        return data;
      }
      throw new Error("Neural Scan Failed");
    };

    if (files.length === 1) {
      const promise = uploadFile(files[0]);
      toast.promise(promise, {
        loading: "Engaging AI Neural Sweep...",
        success: (data) =>
          data.incident?.priority === "CRITICAL"
            ? "⚠ ACCIDENT IDENTIFIED: Dispatch Initialized."
            : "✓ Scan Complete: No Critical Hazards.",
        error: "Tactical analysis aborted.",
      });
      try { await promise; } catch (e) { }
      setUploadLoading(false);
    } else {
      toast.info(`Processing ${files.length} incident sources...`, {
        description: "Engaging tactical neural pipeline for batch sweep."
      });

      let successCount = 0;
      for (const file of files) {
        try {
          const data = await uploadFile(file);
          if (data.success) successCount++;
        } catch (err) {
          console.error("Batch incident upload error", err);
        }
      }

      setUploadLoading(false);
      toast.success(`Batch complete: ${successCount}/${files.length} sources analyzed.`, {
        description: "Tactical intelligence synchronized across city nodes."
      });
    }
  };

  // ── Dispatch police ───────────────────────────────────────────────
  const handleDispatchPolice = async (incidentId: string) => {
    const t = toast.loading("Engaging tactical backup...");
    try {
      const res = await api.post(
        `/incident/dispatch/police?incident_id=${incidentId}`
      );
      if (res.data?.success) {
        setDispatchedIds((prev) => new Set(prev).add(incidentId));
        toast.success("POLICE DISPATCHED: Sector 7 responding.", { id: t });
      }
    } catch (e) {
      toast.error("Dispatch failure.", { id: t });
    }
  };

  const criticalCount = allAlerts.filter((a) => a.priority === "CRITICAL").length;
  const dispatchedCount = dispatchedIds.size + allAlerts.filter(a => a.dispatch_status === "BROADCAST_SENT").length;

  return (
    <motion.div
      animate={isPulsing ? {
        backgroundColor: ["#0a0a10", "#2d0a0a", "#0a0a10"],
        boxShadow: ["inset 0 0 0px #000", "inset 0 0 100px rgba(244,63,94,0.2)", "inset 0 0 0px #000"]
      } : {}}
      transition={{ duration: 1.5, repeat: isPulsing ? 1 : 0 }}
      className="space-y-5 pb-20 -m-8 p-8 min-h-screen transition-colors duration-1000 relative z-10"
    >
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-40">
        <SplashCursor />
      </div>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/smart-systems"
            className="p-2.5 bg-[#12121a] hover:bg-[#1a1a25] rounded-xl border border-white/5 transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
              <h1 className="text-2xl font-black text-white tracking-widest uppercase italic">
                Incident{" "}
                <span className="text-rose-500">{t("auto.Intelligence_328") || "Intelligence"}</span>
              </h1>
              <span className="px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded text-[9px] font-black text-rose-500 tracking-tighter uppercase relative top-[-6px]">
                TACTICAL_V4
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* PDF Export Button */}
          <button
            onClick={handleExportPDF}
            disabled={pdfLoading}
            className="px-4 py-2 bg-[#12121a] border border-white/10 hover:border-amber-500/50 text-amber-500 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pdfLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            {pdfLoading ? "Generating..." : "Export Tactical Log"}
          </button>

          {/* Status badge */}
          <div
            className={`px-4 py-2 border rounded-xl flex items-center gap-3 ${criticalCount > 0
              ? "bg-rose-500/10 border-rose-500/30"
              : "bg-[#0a0a0f] border-white/5"
              }`}
          >
            <div className="text-right">
              <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">
                {t("auto.Status_5777") || "Status"}
              </p>
              <p
                className={`text-[10px] font-black uppercase ${criticalCount > 0
                  ? "text-rose-500 animate-pulse"
                  : "text-emerald-500"
                  }`}
              >
                {criticalCount > 0 ? "Threat Elevated" : "Urban Stable"}
              </p>
            </div>
            <div
              className={`w-3 h-3 rounded-full ${criticalCount > 0
                ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,1)] animate-pulse"
                : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                }`}
            />
          </div>
        </div>
      </div>

      {/* ── LIVE STATS BAR ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={t("auto.TotalAlerts_1033") || "Total Alerts"}
          value={allAlerts.length}
          icon={AlertCircle}
          color="bg-slate-500/10 text-slate-400"
        />
        <StatCard
          label={t("auto.Critical_3578") || "Critical"}
          value={criticalCount}
          icon={AlertTriangle}
          color={criticalCount > 0 ? "bg-rose-500/10 text-rose-500" : "bg-slate-500/10 text-slate-400"}
          pulse={criticalCount > 0}
        />
        <StatCard
          label={t("auto.Dispatched_9217") || "Dispatched"}
          value={dispatchedCount}
          icon={CheckCircle2}
          color="bg-emerald-500/10 text-emerald-500"
        />
        <StatCard
          label={t("auto.CameraFeed_3040") || "Camera Feed"}
          value={venueId ? "ACTIVE" : "STANDBY"}
          icon={Cpu}
          color={venueId ? "bg-cyan-500/10 text-cyan-500" : "bg-slate-500/10 text-slate-400"}
          pulse={!!venueId}
        />
      </div>

      {/* ── MAIN TACTICAL GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COL 1: Live Feed & Analysis (4) */}
        <div className="lg:col-span-12 xl:col-span-4 space-y-6">
          <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl overflow-hidden p-1 shadow-2xl">
            <LiveTacticalCamera venueId={venueId} initialCamId={urlCamId} />
          </div>

          <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <UploadCloud className="w-12 h-12 text-white" />
            </div>
            <h3 className="text-xs font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap className="w-3 h-3" /> {t("auto.AnalysisInjecti_3475") || "Analysis Injection"}
            </h3>
            <p className="text-[10px] text-slate-500 mb-6 font-mono leading-relaxed uppercase">
              {t("auto.Manualneuralswe_8473") || "Manual neural sweep protocol for external recordings or CCTV footage without direct streams."}
            </p>

            <label className="group relative w-full h-32 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-rose-500/50 hover:bg-rose-500/5 transition-all">
              {uploadLoading ? (
                <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
              ) : (
                <>
                  <UploadCloud className="w-8 h-8 text-slate-700 group-hover:text-rose-500 transition-colors" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-white transition-colors">
                    {t("auto.InjectExternalV_4752") || "Inject External Vector"}
                  </span>
                </>
              )}
              <input
                type="file"
                multiple
                className="hidden"
                accept="image/*,video/*"
                onChange={handleVideoUpload}
                disabled={uploadLoading}
              />
            </label>

            {uploadedVideoUrl && (
              <div className="mt-4 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-rose-400 uppercase flex items-center gap-1.5 animate-pulse">
                    <Video className="w-3 h-3" /> {t("auto.ProcessingVecto_3797") || "Processing Vector"}
                  </span>
                  <button
                    onClick={() => {
                      setUploadedVideoUrl(null);
                      setSessionAlerts([]);
                    }}
                    className="p-1 hover:bg-rose-500/20 rounded text-rose-500 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <video
                  src={uploadedVideoUrl}
                  controls
                  muted
                  autoPlay
                  loop
                  className="w-full h-32 object-cover rounded-lg border border-rose-500/10 grayscale hover:grayscale-0 transition-all duration-700"
                />
              </div>
            )}
          </div>
        </div>

        {/* COL 2: Dispatch Stream (5) */}
        <div className="lg:col-span-8 xl:col-span-5 space-y-5">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Radio className="w-4 h-4 text-rose-500 animate-pulse" /> {t("auto.UrbanDispatchSt_2385") || "Urban Dispatch Stream"}
            </h3>
            <span className="px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[8px] font-mono text-slate-500 uppercase tracking-widest">
              Nodes Active: {allAlerts.length > 0 ? "204" : "–"}
            </span>
          </div>

          <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-2 custom-scrollbar">
            <AnimatePresence mode="popLayout" initial={false}>
              {allAlerts.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-64 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl opacity-30 grayscale"
                >
                  <Server className="w-10 h-10 mb-2" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em]">
                    {t("auto.ListeningforTac_6382") || "Listening for Tactical Hits..."}
                  </p>
                </motion.div>
              ) : (
                allAlerts.map((alert, idx) => (
                  <motion.div
                    key={alert.id || idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`relative bg-[#0a0a0f] border rounded-2xl p-5 group hover:bg-[#0c0c14] transition-all duration-300 ${alert.priority === "CRITICAL"
                      ? "border-rose-500/30"
                      : "border-white/5"
                      }`}
                  >
                    {alert.annotated_frame && (
                      <div className="absolute top-0 right-0 w-32 h-full opacity-10 group-hover:opacity-40 transition-opacity pointer-events-none">
                        <img
                          src={`data:image/jpeg;base64,${alert.annotated_frame}`}
                          className="w-full h-full object-cover grayscale"
                        />
                        <div className="absolute inset-0 bg-gradient-to-l from-black via-transparent to-transparent" />
                      </div>
                    )}

                    <div className="flex items-start gap-4 relative z-10">
                      <div
                        className={`p-3 rounded-xl ${alert.priority === "CRITICAL"
                          ? "bg-rose-500/10 text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.1)]"
                          : "bg-amber-500/10 text-amber-500"
                          }`}
                      >
                        {alert.type?.includes("Fire") ? (
                          <Flame className="w-5 h-5" />
                        ) : (
                          <ShieldAlert className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-black uppercase tracking-widest ${alert.priority === "CRITICAL"
                                ? "text-rose-500"
                                : "text-amber-500"
                                }`}
                            >
                              {alert.type}
                            </span>
                            {/* Source badge */}
                            <SourceBadge source={alert.analysis_type} />
                            {alert.analysis_type && (
                              <span className="text-[7px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded font-black uppercase tracking-tighter">
                                AI_SCAN
                              </span>
                            )}
                          </div>
                          <span className="text-[8px] font-mono text-slate-600 uppercase">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-white/70 leading-relaxed font-medium mb-3">
                          "{alert.description}"
                        </p>

                        {alert.explanation && (
                          <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl mb-4 group-hover:bg-white/[0.05] transition-colors">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Crosshair className="w-3 h-3 text-rose-500" />
                              <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">
                                {t("auto.NeuralInsightPr_2110") || "Neural Insight Protocol"}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">
                              {alert.explanation}
                            </p>
                            {alert.vehicle_count > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {Object.entries(alert.vehicle_types || {}).map(
                                  ([type, count]: [any, any]) => (
                                    <span
                                      key={type}
                                      className="text-[8px] font-black uppercase px-2 py-0.5 bg-black/40 border border-white/5 rounded text-slate-500"
                                    >
                                      {type}:{" "}
                                      <span className="text-white">
                                        {count}
                                      </span>
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                            <MapPin className="w-3 h-3 text-rose-500" />{" "}
                            {alert.venue_name || "Urban Core"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                            <Activity className="w-3 h-3 text-cyan-500/50" />{" "}
                            {alert.latitude?.toFixed(4) || "0.000"},{" "}
                            {alert.longitude?.toFixed(4) || "0.000"}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3 justify-between h-full min-h-[100px]">
                        <button
                          onClick={() => handleDispatchPolice(alert.id)}
                          disabled={
                            dispatchedIds.has(alert.id) ||
                            alert.dispatch_status === "BROADCAST_SENT"
                          }
                          className={`px-4 py-2 border rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${dispatchedIds.has(alert.id) ||
                            alert.dispatch_status === "BROADCAST_SENT"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                            : "bg-rose-500 hover:bg-rose-600 text-white border-transparent"
                            }`}
                        >
                          {dispatchedIds.has(alert.id) ||
                            alert.dispatch_status === "BROADCAST_SENT"
                            ? "Dispatched ✓"
                            : "Notify Police"}
                        </button>
                        <div className="bg-black/50 border border-white/5 rounded-lg px-2 py-1 flex items-center gap-2 group-hover:border-rose-500/20">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${dispatchedIds.has(alert.id) ||
                              alert.dispatch_status === "BROADCAST_SENT"
                              ? "bg-emerald-500 animate-pulse shadow-[0_0_5px_rgba(16,185,129,1)]"
                              : "bg-rose-500"
                              }`}
                          />
                          <span
                            className={`text-[8px] font-black uppercase tracking-tighter ${dispatchedIds.has(alert.id) ||
                              alert.dispatch_status === "BROADCAST_SENT"
                              ? "text-emerald-500"
                              : "text-slate-500"
                              }`}
                          >
                            {dispatchedIds.has(alert.id) ||
                              alert.dispatch_status === "BROADCAST_SENT"
                              ? "Unit En Route"
                              : "Alert Broadcast"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* COL 3: Situational Awareness & Logs (3) */}
        <div className="lg:col-span-12 xl:col-span-3 space-y-6">
          <div className="bg-[#0a0a0f] border border-white/5 rounded-2xl p-6 relative overflow-hidden group shadow-2xl">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-transparent opacity-50" />
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-rose-500" />{" "}
                Situational Map
              </h3>
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            </div>

            <div className="aspect-square bg-white/[0.02] border border-white/5 rounded-2xl relative mb-6 overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 bg-[length:40px_40px]" />
              <Crosshair className="w-8 h-8 text-rose-500/20 animate-pulse" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-4 border-t border-rose-500/20 rounded-full"
              />

              {allAlerts.slice(0, 5).map((a, i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                  className={`absolute w-2 h-2 rounded-full shadow-[0_0_10px_rgba(244,63,94,1)] ${a.priority === "CRITICAL" ? "bg-rose-500" : "bg-amber-500"
                    }`}
                  style={{
                    left: `${30 + ((i * 17) % 50)}%`,
                    top: `${20 + ((i * 21) % 60)}%`,
                  }}
                />
              ))}

              <div className="absolute bottom-4 left-4 right-4 flex justify-between">
                <span className="text-[8px] font-mono text-slate-600 uppercase tracking-widest">
                  {t("auto.Sector7BHub_8334") || "Sector 7-B Hub"}
                </span>
                <span className="text-[8px] font-mono text-emerald-500 uppercase tracking-widest font-black">
                  {t("auto.SyncLock_5642") || "Sync Lock"}
                </span>
              </div>
            </div>

            {/* Neural Heartbeat Log */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                Neural Heartbeat{" "}
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
              </h4>
              <div className="space-y-3">
                {tacticalLogs.length === 0 ? (
                  <p className="text-[9px] text-slate-600 font-mono italic">
                    {t("auto.Awaitingtactica_3288") || "Awaiting tactical mesh handshake..."}
                  </p>
                ) : (
                  tacticalLogs.map((log, i) => (
                    <div
                      key={i}
                      className="flex gap-3 items-start border-l border-white/10 pl-3"
                    >
                      <div
                        className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${log.type === "CRITICAL"
                          ? "bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,1)] animate-pulse"
                          : log.source === "VIDEO"
                            ? "bg-violet-500"
                            : "bg-cyan-500"
                          }`}
                      />
                      <div className="min-w-0">
                        <p className="text-[9px] font-mono text-white/50 leading-none mb-1">
                          [{log.time}]
                        </p>
                        <p
                          className={`text-[9px] font-mono leading-relaxed truncate ${log.type === "CRITICAL"
                            ? "text-rose-400"
                            : log.source === "VIDEO"
                              ? "text-violet-400"
                              : "text-slate-400"
                            }`}
                        >
                          {log.message}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Automated Protocols card */}
          <div className="bg-gradient-to-br from-amber-950/20 to-[#0a0a0f] border border-amber-500/20 rounded-2xl p-6 group">
            <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center mb-4 border border-amber-500/30">
              <Bell className="w-5 h-5 text-amber-500 animate-bounce" />
            </div>
            <h4 className="text-white font-bold mb-2 uppercase tracking-tight text-xs">
              {t("auto.AutomatedProtoc_9248") || "Automated Protocols"}
            </h4>
            <p className="text-[10px] text-slate-400 leading-relaxed font-mono uppercase tracking-tighter">
              {t("auto.Criticalhitstri_2997") || "Critical hits trigger persistent automated broadcasts to Law Enforcement Response Nodes."}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="px-2 py-1 bg-amber-500 text-black text-[8px] font-black rounded uppercase tracking-widest shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                {t("auto.Active_9776") || "Active"}
              </div>
              <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-1/2 h-full bg-amber-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
