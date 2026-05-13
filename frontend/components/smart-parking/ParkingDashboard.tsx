"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";
import {
  ArrowLeft, Car, AlertTriangle, ArrowRight, Zap, Target, Activity, BrainCircuit,
  UploadCloud, FileDown, Loader2, Video, Search, MapPin, Eye, Radio, Server,
  TrendingUp, CheckCircle2, ShieldAlert
} from "lucide-react";
import { api } from "@/services/api";
import SplashCursor from "@/components/react-bits/SplashCursor";
import { useParkingInsights, useParkingEvents } from "@/hooks/useTelemetry";
import { IntelligenceMap } from "@/components/map/IntelligenceMap";

// ── STAT CARD ──
function StatCard({ label, value, icon: Icon, color, pulse }: { label: string, value: any, icon: any, color: string, pulse?: boolean }) {
  return (
    <div className="bg-[#0a0a0f] border border-white/5 rounded-xl p-3 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className={`w-4 h-4 ${pulse ? "animate-pulse" : ""}`} />
      </div>
      <div>
        <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest leading-none mb-0.5">{label}</p>
        <p className="text-base font-black text-white leading-none">{value}</p>
      </div>
    </div>
  );
}

export function ParkingDashboard() {
  const { insights: data, loading } = useParkingInsights();
  const { events: liveEvents } = useParkingEvents();
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);

  // Derived effective data
  const activeData = analysisData || data;
  const isAnalysisMode = !!analysisData;

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const res = await api.get("/venues");
        const venues = res.data?.items ? res.data.items : Array.isArray(res.data) ? res.data : [];
        const parkingVenue = venues.find((v: any) => v.venue_type?.toLowerCase().includes("parking")) || venues[0];
        if (parkingVenue) setVenueId(parkingVenue.id);
      } catch (e) { console.error("Venue resolution failed", e); }
    };
    fetchVenues();
  }, []);

  // ── PDF Export ──
  const handleExportPDF = useCallback(async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await api.get("/parking/report/pdf", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "parking_tactical_log.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Tactical report exported successfully.");
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  }, [pdfLoading]);

  // ── File/Video Upload ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setUploadLoading(true);

    const uploadFile = async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/v1/parking/upload?camera_id=upload-demo${venueId ? `&venue_id=${venueId}` : ""}`, {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (result.success) setAnalysisData(result);
      return result;
    };

    if (files.length === 1) {
      toast.promise(uploadFile(files[0]), {
        loading: 'Engaging YOLOv8 Neural Engine...',
        success: 'Tactical analysis complete.',
        error: 'Upload failed',
      });
    } else {
      toast.info(`Processing ${files.length} frames...`);
      for (const file of files) await uploadFile(file);
      toast.success("Batch analysis synchronized.");
    }
    setUploadLoading(false);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#0a0a10]">
        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
      </div>
    );
  }

  const overall = activeData.overall || {};
  const criticalCount = (activeData.alerts?.length || 0) + (overall.status === "CRITICAL" ? 1 : 0);

  return (
    <div className="w-full h-full bg-[#0a0a10] text-white p-8 overflow-hidden flex flex-col gap-6 relative z-10">
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-30">
        <SplashCursor />
      </div>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/smart-systems" className="p-2.5 bg-[#12121a] hover:bg-[#1a1a25] rounded-xl border border-white/5 transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-widest uppercase italic flex items-center gap-3">
              <Car className="text-cyan-400 w-6 h-6" />
              Parking <span className="text-cyan-400">Intelligence</span>
            </h1>
            <p className="text-slate-400 text-[10px] font-mono tracking-widest uppercase mt-1">Real-time tactical spatial analytics</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            disabled={pdfLoading}
            className="px-4 py-2 bg-[#12121a] border border-white/10 hover:border-amber-500/50 text-amber-500 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2"
          >
            {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            {pdfLoading ? "Generating..." : "Export Tactical Log"}
          </button>

          <div className={`px-4 py-2 border rounded-xl flex items-center gap-3 ${criticalCount > 0 ? "bg-rose-500/10 border-rose-500/30" : "bg-[#0a0a0f] border-white/5"}`}>
            <div className="text-right">
              <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Status</p>
              <p className={`text-[10px] font-black uppercase ${criticalCount > 0 ? "text-rose-500 animate-pulse" : "text-emerald-500"}`}>
                {criticalCount > 0 ? "Congestion Peak" : "Spatial Nominal"}
              </p>
            </div>
            <div className={`w-3 h-3 rounded-full ${criticalCount > 0 ? "bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,1)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"}`} />
          </div>
        </div>
      </div>

      {/* ── STATS BAR ── */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <StatCard label="Total Occupancy" value={`${overall.occupancy_pct}%`} icon={Target} color="bg-cyan-500/10 text-cyan-400" pulse={overall.occupancy_pct > 80} />
        <StatCard label="Available Slots" value={overall.total_available} icon={CheckCircle2} color="bg-emerald-500/10 text-emerald-400" />
        <StatCard label="Total Capacity" value={overall.total_slots} icon={Server} color="bg-slate-500/10 text-slate-400" />
        <StatCard label="AI Certainty" value="98.2%" icon={BrainCircuit} color="bg-fuchsia-500/10 text-fuchsia-400" />
      </div>

      {/* ── MAIN CONTENT GRID ── */}
      <div className="flex-1 flex gap-6 min-h-0">

        {/* LEFT: Feed & Upload */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex-[3] rounded-2xl border border-white/10 bg-black overflow-hidden relative group shadow-2xl">
            <div className="absolute top-4 left-4 z-10 flex gap-2">
              <div className="bg-rose-500 text-white text-[8px] font-black px-2 py-1 rounded-sm tracking-widest flex items-center gap-1.5 uppercase shadow-xl animate-pulse">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                LIVE_SPATIAL_FEED
              </div>
            </div>

            <div className="absolute top-4 right-4 z-20">
              <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest text-white flex items-center gap-2 transition-all">
                {uploadLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <UploadCloud className="w-3.5 h-3.5 text-cyan-400" />}
                INJECT VECTOR
                <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleFileUpload} disabled={uploadLoading} />
              </label>
            </div>

            <div className="w-full h-full bg-[url('/grid.svg')] bg-center relative flex items-center justify-center">
              <img
                src={`/api/v1/parking/feed?t=${Date.now()}`}
                alt="Tactical Feed"
                className={`max-w-full max-h-full object-contain transition-opacity duration-500 ${isAnalysisMode ? 'opacity-100' : 'opacity-80 mix-blend-screen'}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a10] via-transparent to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-1 bg-cyan-500/20 scan-line" />
            </div>

            {isAnalysisMode && (
              <motion.button
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => setAnalysisData(null)}
                className="absolute bottom-6 right-6 bg-rose-500 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-2xl hover:bg-rose-400 transition-all z-30"
              >
                CLEAR ANALYSIS
              </motion.button>
            )}
          </div>

          {/* AI Insights Bar */}
          <div className="bg-[#12121a] border border-fuchsia-500/30 rounded-2xl p-5 relative overflow-hidden flex-none">
            <div className="flex items-center gap-3 mb-3">
              <BrainCircuit className="w-4 h-4 text-fuchsia-400" />
              <h3 className="font-bold text-fuchsia-100 tracking-wider text-xs uppercase">Neural Decision Engine</h3>
            </div>
            <p className="text-fuchsia-300 font-mono text-xs leading-relaxed italic">
              "{overall.suggestion || activeData.suggestion}"
            </p>
            <div className="mt-4 flex items-center justify-between text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
              <span>Projection: {overall.prediction || activeData.prediction}</span>
              <span className="text-fuchsia-500">Confidence: 0.98</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Tactical Log & Zones Map */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">

          {/* Real-time Event Stream */}
          <div className="flex-[3] bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col min-h-0 relative overflow-hidden">
            {/* Scanline Overlay */}
            <div className="absolute inset-x-0 h-[100px] bg-gradient-to-b from-cyan-500/5 to-transparent top-0 pointer-events-none z-10" />

            <div className="p-4 border-b border-white/5 flex items-center justify-between relative z-20 bg-[#0a0a0f]/80 backdrop-blur">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-cyan-500 animate-pulse" /> Tactical Event Log
              </h3>
              <span className="text-[8px] font-mono text-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.5)] bg-cyan-500/10 px-2 py-0.5 rounded-full">{liveEvents.length} Active Detections</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar relative z-20">
              <AnimatePresence mode="popLayout" initial={false}>
                {liveEvents.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
                    <div className="relative mb-4">
                      <Search className="w-10 h-10 text-cyan-500" />
                      <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500 animate-pulse">Scanning Urban Grid...</p>
                  </div>
                ) : (
                  liveEvents.map((ev, i) => (
                    <motion.div
                      key={ev.id || i}
                      initial={{ opacity: 0, x: 20, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -20, scale: 0.9 }}
                      className="group bg-white/5 border border-white/5 hover:border-cyan-500/30 p-3 rounded-xl transition-all duration-300 relative overflow-hidden"
                    >
                      {/* Detection Scan Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/5 to-cyan-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full shadow-[0_0_8px_rgba(6,182,212,1)]" />
                          <span className="text-[10px] font-black text-white uppercase tracking-wider">{ev.type}</span>
                        </div>
                        <span className="text-[8px] font-mono text-slate-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        {ev.message ? (
                          <span className="text-[10px] font-mono text-emerald-400 leading-tight flex-1 mr-2 break-words">{ev.message}</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <span className="text-[7px] text-slate-500 uppercase font-bold tracking-tighter">Certainty</span>
                              <span className="text-[10px] font-mono text-emerald-400 font-bold">{ev.confidence}%</span>
                            </div>
                            <div className="w-px h-6 bg-white/10" />
                            <div className="flex flex-col">
                              <span className="text-[7px] text-slate-500 uppercase font-bold tracking-tighter">Vector</span>
                              <span className="text-[10px] font-mono text-slate-300">{ev.position || "N/A"}</span>
                            </div>
                          </div>
                        )}
                        <div className={`px-2 py-0.5 rounded text-[7px] font-black tracking-widest uppercase ${ev.risk === 'high' ? 'bg-rose-500/20 text-rose-500' : 'bg-cyan-500/20 text-cyan-500'}`}>
                          {ev.risk || 'NOMINAL'}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Tactical Zones Log */}
          <div className="flex-[2] bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col overflow-hidden relative group">
            <div className="absolute top-4 left-4 z-10">
              <div className="bg-black/60 backdrop-blur-md border border-white/10 px-2 py-1 rounded text-[8px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3 h-3 text-cyan-500" />
                TACTICAL_ZONES
              </div>
            </div>
            <div className="flex-1 overflow-y-auto mt-12 p-4 space-y-2 custom-scrollbar relative z-20">
              {Object.entries(activeData.zones || {}).map(([zid, state]: [string, any]) => (
                <div key={zid} className="flex items-center justify-between p-3 border border-white/5 rounded-xl bg-white/5">
                  <span className="text-xs font-bold text-white">Zone {zid}</span>
                  <span className={`px-2 py-1 text-[10px] font-black uppercase rounded ${state.status === 'AVAILABLE' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>
                    {state.status}
                  </span>
                </div>
              ))}
              {(!activeData.zones || Object.keys(activeData.zones).length === 0) && (
                <div className="text-center text-xs text-slate-500 mt-10 uppercase tracking-widest font-mono">
                  No Zone Data Available
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
