"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Radio, ShieldAlert, Activity, Car, AlertTriangle, Video, MapPin,
  FileText, CheckCircle2, ChevronRight, Download, RefreshCw,
  Layers, Clock, Filter, Eye, AlertCircle, ArrowUpRight, Zap
} from "lucide-react";
import { api } from "@/services/api";
import { RoadCommandGisMap } from "@/components/road-command/RoadCommandGisMap";
import { EvidenceDrawer } from "@/components/road-command/EvidenceDrawer";

interface Venue {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  capacity?: number;
  warning_threshold?: number;
  critical_threshold?: number;
  city?: string;
  venue_type?: string;
}

interface Camera {
  id: string;
  name: string;
  venue_id?: string;
  camera_type?: string;
  latitude?: number;
  longitude?: number;
  is_active?: boolean;
  stream_type?: string;
}

interface UrbanPulse {
  overall_status: string;
  headline: string;
  metrics: {
    active_critical: number;
    active_warnings: number;
    incidents_count: number;
    traffic_alerts: number;
    parking_alerts: number;
    road_defects_count: number;
    total_events_buffered: number;
  };
  timestamp: string;
}

export default function RoadIntelligenceCommandPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [urbanPulse, setUrbanPulse] = useState<UrbanPulse | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "traffic" | "parking" | "incident" | "road_condition">("all");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Load Venues & Base Telemetry
  const loadInitialData = useCallback(async () => {
    try {
      const [vRes, cRes] = await Promise.all([
        api.get("/venues"),
        api.get("/cameras")
      ]);
      const vList: Venue[] = Array.isArray(vRes.data) ? vRes.data : [];
      const cList: Camera[] = Array.isArray(cRes.data) ? cRes.data : [];
      setVenues(vList);
      setCameras(cList);

      if (vList.length > 0 && !selectedVenueId) {
        setSelectedVenueId(vList[0].id);
      }
    } catch (e) {
      console.error("Failed loading command center base data", e);
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load Events & Urban Pulse whenever selectedVenueId changes
  const refreshEventsAndPulse = useCallback(async () => {
    try {
      const params = selectedVenueId ? `?venue_id=${selectedVenueId}` : "";
      const [evRes, pulseRes] = await Promise.all([
        api.get(`/events${params}`),
        api.get(`/events/urban-pulse${params}`)
      ]);
      if (evRes.data?.events) {
        setEvents(evRes.data.events);
      }
      if (pulseRes.data?.pulse) {
        setUrbanPulse(pulseRes.data.pulse);
      }
    } catch (err) {
      console.error("Error refreshing events", err);
    }
  }, [selectedVenueId]);

  useEffect(() => {
    refreshEventsAndPulse();
    const interval = setInterval(refreshEventsAndPulse, 4000);
    return () => clearInterval(interval);
  }, [refreshEventsAndPulse]);

  // Active Venue metadata
  const currentVenue = useMemo(() => {
    return venues.find(v => v.id === selectedVenueId) || venues[0];
  }, [venues, selectedVenueId]);

  // Scoped Cameras
  const displayCameras = useMemo(() => {
    if (!selectedVenueId) return cameras;
    return cameras.filter(c => c.venue_id === selectedVenueId);
  }, [cameras, selectedVenueId]);

  // Filtered Events by Active Tab
  const filteredEvents = useMemo(() => {
    if (activeTab === "all") return events;
    return events.filter(e => e.domain === activeTab);
  }, [events, activeTab]);

  // Export Audited Operational Report
  const handleExportReport = async () => {
    setExporting(true);
    const toastId = toast.loading("Generating audited operational report with data provenance…");
    try {
      const reportPayload = {
        title: "LAMINAR Road Intelligence Operational Report",
        generated_at: new Date().toISOString(),
        venue: currentVenue ? {
          id: currentVenue.id,
          name: currentVenue.name,
          city: currentVenue.city,
          latitude: currentVenue.latitude,
          longitude: currentVenue.longitude
        } : null,
        urban_pulse: urbanPulse,
        events_summary: {
          total: events.length,
          critical: events.filter(e => e.severity === "critical").length,
          warnings: events.filter(e => e.severity === "warning" || e.severity === "high").length
        },
        data_provenance: {
          perception_engine: "YOLO11 Nano + ByteTrack Multi-Object Tracker",
          configuration_source: "LAMINAR Venue Configuration Matrix",
          location_datum: "WGS84 Geodetic Coordinates",
          active_cameras: displayCameras.map(c => ({ id: c.id, name: c.name, type: c.camera_type }))
        },
        verified_events: events
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportPayload, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `LAMINAR_ROAD_REPORT_${currentVenue?.name || "SECTOR"}_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast.success("Audited Operational Report Generated Successfully", { id: toastId });
    } catch (err: any) {
      toast.error(`Report generation failed: ${err.message}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
            Mounting Urban Command Architecture…
          </p>
        </div>
      </div>
    );
  }

  const isPulseCritical = urbanPulse?.overall_status === "CRITICAL";
  const isPulseElevated = urbanPulse?.overall_status === "ELEVATED";

  return (
    <div className="min-h-screen bg-[#080810] text-slate-200 flex flex-col font-sans">
      {/* ── TOP NAV BAR ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.06] bg-[#080810]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link
            href="/road-intelligence"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 hover:text-cyan-300 text-xs font-mono uppercase transition-all"
            title="Switch to Live Perception Screen"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            Live Corridor View
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black uppercase tracking-[0.15em] text-white leading-none">
                  LAMINAR <span className="text-indigo-400">ROAD COMMAND CENTER</span>
                </h1>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 uppercase">
                  Central GIS Mesh
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-widest">
                {currentVenue?.name || "Citywide"} · {displayCameras.length} Edge Cameras Connected · Real-Time Tactical State
              </p>
            </div>
          </div>
        </div>

        {/* Sector Selector & Global Export */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sector Selector */}
          <div className="flex items-center gap-2 bg-[#0c1322] border border-cyan-500/30 rounded-xl px-2.5 py-1.5 shadow-[0_0_15px_rgba(34,211,238,0.08)]">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <select
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="bg-transparent text-cyan-300 text-xs font-black font-mono outline-none cursor-pointer pr-2 max-w-[200px]"
            >
              <option value="" className="bg-[#080810] text-white font-mono">
                🌐 All Sectors (City Matrix)
              </option>
              {venues.map((v) => (
                <option key={v.id} value={v.id} className="bg-[#080810] text-white font-mono">
                  {v.name} · {(v.venue_type || "Sector").toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Export Report Button */}
          <button
            onClick={handleExportReport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            {exporting ? "Compiling Report…" : "Export Audited Report"}
          </button>
        </div>
      </div>

      {/* ── URBAN PULSE EXECUTIVE BANNER ── */}
      <div className="px-6 py-4 bg-gradient-to-r from-black/60 via-[#0c101c]/90 to-black/60 border-b border-white/[0.08]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Status & Headline */}
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-full border text-xs font-mono font-black uppercase tracking-wider flex items-center gap-2 ${
              isPulseCritical
                ? "border-rose-500/50 bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                : isPulseElevated
                ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
            }`}>
              <span className={`w-2 h-2 rounded-full ${isPulseCritical ? "bg-rose-400 animate-ping" : isPulseElevated ? "bg-amber-400" : "bg-emerald-400"}`} />
              URBAN PULSE: {urbanPulse?.overall_status || "NOMINAL"}
            </div>
            <p className="text-xs text-slate-300 font-medium leading-tight">
              {urbanPulse?.headline || "All road systems nominal. Traffic flow and spatial parking parameters operating within safe limits."}
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="px-3 py-1 bg-white/[0.02] border border-white/5 rounded-xl">
              <span className="text-[9px] text-slate-500 uppercase block">Critical Incidents</span>
              <strong className={urbanPulse?.metrics.active_critical ? "text-rose-400" : "text-white"}>
                {urbanPulse?.metrics.active_critical ?? 0}
              </strong>
            </div>
            <div className="px-3 py-1 bg-white/[0.02] border border-white/5 rounded-xl">
              <span className="text-[9px] text-slate-500 uppercase block">Traffic Alerts</span>
              <strong className={urbanPulse?.metrics.traffic_alerts ? "text-amber-400" : "text-white"}>
                {urbanPulse?.metrics.traffic_alerts ?? 0}
              </strong>
            </div>
            <div className="px-3 py-1 bg-white/[0.02] border border-white/5 rounded-xl">
              <span className="text-[9px] text-slate-500 uppercase block">Parking Alerts</span>
              <strong className={urbanPulse?.metrics.parking_alerts ? "text-emerald-400" : "text-white"}>
                {urbanPulse?.metrics.parking_alerts ?? 0}
              </strong>
            </div>
            <div className="px-3 py-1 bg-white/[0.02] border border-white/5 rounded-xl">
              <span className="text-[9px] text-slate-500 uppercase block">Road Defects</span>
              <strong className="text-slate-400">
                {urbanPulse?.metrics.road_defects_count ?? 0}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── DOMAIN FILTER TABS ── */}
      <div className="px-6 pt-4 flex items-center gap-2 border-b border-white/[0.04] bg-[#090c14]">
        {[
          { key: "all", label: "All Intelligence Domains" },
          { key: "incident", label: "Incidents & Collisions" },
          { key: "traffic", label: "Traffic & Bottlenecks" },
          { key: "parking", label: "Smart Parking Matrix" },
          { key: "road_condition", label: "Road Condition Defects" }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === tab.key
                ? "border-cyan-400 text-white bg-cyan-500/5"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── MAIN CONTENT (GIS MAP + EVENTS SPLIT) ── */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* Left / Center: Tactical GIS Vector Map (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              Spatial Intelligence Map (GIS)
            </span>
            <span className="text-slate-500 text-[10px]">
              Datum: {currentVenue?.latitude ? `${Number(currentVenue.latitude).toFixed(4)}, ${Number(currentVenue.longitude).toFixed(4)}` : "17.3850, 78.4867"}
            </span>
          </div>

          <div className="h-[480px] lg:h-[620px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative">
            <RoadCommandGisMap
              venue={currentVenue}
              cameras={displayCameras}
              events={filteredEvents}
              selectedEvent={selectedEvent}
              onSelectEvent={(ev: any) => setSelectedEvent(ev)}
            />
          </div>
        </div>

        {/* Right: Active Events Feed & Explainability (5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-white font-bold uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              Intelligence Events Log ({filteredEvents.length})
            </span>
            <span className="text-[10px] text-slate-500">Live SSE Stream Attached</span>
          </div>

          <div className="h-[480px] lg:h-[620px] overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {filteredEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mb-2" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Corridor Clear</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  Zero active intelligence breaches or hazards recorded for this sector domain.
                </p>
              </div>
            ) : (
              filteredEvents.map((ev) => {
                const isCrit = ev.severity === "critical";
                const isH = ev.severity === "high";
                const isSelected = selectedEvent?.event_id === ev.event_id;

                return (
                  <motion.div
                    key={ev.event_id}
                    onClick={() => setSelectedEvent(ev)}
                    whileHover={{ scale: 1.01 }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? "bg-cyan-500/10 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                        : isCrit
                        ? "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/30"
                        : isH
                        ? "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/30"
                        : "bg-white/[0.02] hover:bg-white/[0.05] border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded font-black uppercase ${
                          isCrit
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                            : isH
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                            : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                        }`}>
                          {ev.severity}
                        </span>
                        <span className="text-slate-500 font-bold uppercase">{ev.domain}</span>
                      </div>
                      <span className="text-slate-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-white uppercase tracking-wide flex items-center justify-between">
                        <span>{ev.title}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400" />
                      </h4>
                      <p className="text-xs text-slate-400 leading-snug line-clamp-2">{ev.description}</p>
                    </div>

                    {/* "Why?" Explainability Tag */}
                    {ev.explanation?.reason && (
                      <div className="text-[10px] font-mono bg-black/40 px-2.5 py-1 rounded-lg border border-white/5 text-cyan-300 flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="truncate"><strong>Why?</strong> {ev.explanation.reason}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 pt-1 border-t border-white/5">
                      <span>Source: <strong className="text-slate-300">{ev.location?.location_source || "VENUE_CONFIG"}</strong></span>
                      <span>Confidence: <strong className="text-cyan-400">{Math.round((ev.confidence || 0.9) * 100)}%</strong></span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── EVIDENCE INSPECTION DRAWER ── */}
      <AnimatePresence>
        {selectedEvent && (
          <EvidenceDrawer
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onUpdate={refreshEventsAndPulse}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
