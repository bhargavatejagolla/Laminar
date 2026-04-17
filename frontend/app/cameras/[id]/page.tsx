"use client";

import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Video,
  Activity,
  Users,
  Settings,
  Maximize2,
  WifiOff,
  Shield,
  Film,
  PlayCircle,
  Download,
  Map,
  Loader2,
  RefreshCw
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { getToken } from "@/services/auth";
import { toast } from "sonner";
import { useAlertStream } from "@/src/hooks/useAlertStream";

const BACKEND_BASE = "/api/v1";

export default function CameraStreamPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [streamError, setStreamError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapUrl, setHeatmapUrl] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch camera details
  const { data: camera, isLoading: cameraLoading } = useQuery({
    queryKey: ["camera", id],
    queryFn: async () => {
      const res = await api.get(`/cameras/${id}`);
      return res.data;
    },
  });

  // Fetch camera health — polls every 3 seconds
  const { data: health } = useQuery({
    queryKey: ["cameraHealth", id],
    queryFn: async () => {
      const res = await api.get(`/cameras/${id}/health`);
      return res.data;
    },
    refetchInterval: 3000,
    retry: false,
  });

  // Fetch real live intelligence snapshot — polls every 2 seconds
  const { data: metrics } = useQuery({
    queryKey: ["cameraIntelligence", id],
    queryFn: async () => {
      const res = await api.get(`/intelligence/camera/${id}`);
      return res.data;
    },
    refetchInterval: 2000,
  });

  // Fetch recorded clips
  const { data: clips, refetch: refetchClips } = useQuery({
    queryKey: ["cameraClips", id],
    queryFn: async () => {
      const res = await api.get(`/cameras/${id}/clips`);
      return res.data;
    },
  });

  // Build the live MJPEG stream URL with JWT token auth
  const token = getToken();
  const streamUrl = token
    ? `${BACKEND_BASE}/vision/feed/${id}?token=${encodeURIComponent(token)}`
    : null;

  // Real metrics from camera intelligence snapshot
  const snapshot = metrics?.snapshot;
  const peopleCount = snapshot?.density?.current ?? 0;
  const riskLevel = snapshot?.intelligence?.overall_risk_level ?? "low";
  const riskScore = riskLevel === "critical" ? 95 : riskLevel === "high" ? 75 : riskLevel === "medium" ? 50 : 25;
  const frameRate = health?.fps_configured ?? camera?.fps ?? 0;
  const isStreamActive = health?.health_status === "healthy" || health?.health_status === "degraded";

  // WebSocket Live Analytics Mapping
  const [liveMetric, setLiveMetric] = useState<any>(null);
  
  useAlertStream({
    enabled: true,
    onMetricUpdate: (metric) => {
      if (metric.camera_id === id) {
        setLiveMetric(metric);
      }
    }
  });
  
  const entries = liveMetric?.entries ?? 0;
  const exits = liveMetric?.exits ?? 0;
  const actSitting = liveMetric?.activity?.sitting ?? 0;
  const actStanding = liveMetric?.activity?.standing ?? 0;
  const actNormal = liveMetric?.activity?.normal ?? 0;
  const actWalking = liveMetric?.activity?.walking ?? 0;
  const liveVelocity = liveMetric?.velocity ?? null;

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Error attempting to toggle fullscreen:", err);
    }
  };

  // Listen to fullscreen change
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Reload stream on error
  const reloadStream = () => {
    setStreamError(false);
    if (imgRef.current && streamUrl) {
      const url = new URL(streamUrl);
      url.searchParams.set("_t", Date.now().toString());
      imgRef.current.src = url.toString();
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return "rose";
    if (score >= 50) return "amber";
    return "emerald";
  };
  const riskColor = getRiskColor(riskScore);
  const riskLabel =
    riskScore >= 80 ? "CRITICAL" : riskScore >= 50 ? "WARNING" : "LOW";

  // Fetch Heatmap Frame every 1 second when active
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showHeatmap && isStreamActive) {
      const fetchHeatmap = async () => {
        try {
          const res = await api.get(`/cameras/${id}/density-map`, { responseType: "blob" });
          const url = URL.createObjectURL(res.data);
          setHeatmapUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        } catch (e) {
          // Heatmap might not be ready on first tick
        }
      };
      
      fetchHeatmap();
      interval = setInterval(fetchHeatmap, 1000);
    } else {
      setHeatmapUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
    }
    return () => clearInterval(interval);
  }, [showHeatmap, isStreamActive, id]);

  const handleRecord = async () => {
    try {
      setIsRecording(true);
      toast.info("Recording 10s evidence clip...");
      
      await api.post(`/cameras/${id}/record?duration=10`);
      
      // Auto-refresh clips after 11 seconds assuming 10s recording completes
      setTimeout(() => {
        setIsRecording(false);
        refetchClips();
        toast.success("Clip saved successfully!");
      }, 11000);
      
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to start recording");
      setIsRecording(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-white pb-12">
      {/* Navigation */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Network
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#0f172a] border border-slate-700 rounded-xl flex-shrink-0">
            <Video className="w-8 h-8 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              {cameraLoading ? (
                <span className="text-slate-400">Initializing Node...</span>
              ) : (
                camera?.name ?? "Unknown Camera"
              )}
              {isStreamActive ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400 tracking-widest uppercase mt-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  LIVE
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-700/50 border border-slate-600/30 text-[10px] font-semibold text-slate-400 tracking-widest uppercase mt-1">
                  <WifiOff className="w-3 h-3" /> OFFLINE
                </span>
              )}
            </h1>
            <p className="text-sm font-medium text-slate-400 font-mono mt-1">
              NODE_ID: {id}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={reloadStream}
            className="p-2 bg-[#0f172a] border border-slate-700 hover:border-cyan-500/50 rounded-lg text-slate-400 hover:text-cyan-400 transition-all"
            title="Reload stream"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-[#0f172a] border border-slate-700 hover:border-cyan-500/50 rounded-lg text-slate-400 hover:text-cyan-400 transition-all"
            title="Fullscreen"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Live Stream */}
        <div className="lg:col-span-3 space-y-4">
          <div
            ref={containerRef}
            className={`relative aspect-video bg-black rounded-xl border overflow-hidden group transition-all duration-500 ${
              showHeatmap && isStreamActive
                ? (peopleCount / (camera?.capacity || 100)) >= 0.8 ? "border-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.3)]"
                  : (peopleCount / (camera?.capacity || 100)) >= 0.5 ? "border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.3)]"
                  : "border-indigo-500 shadow-[0_0_40px_rgba(99,102,241,0.3)]"
                : "border-slate-800 shadow-[0_0_30px_rgba(0,0,0,0.5)]"
            }`}
          >
            {/* === REAL MJPEG LIVE STREAM === */}
            {streamUrl && !streamError && isStreamActive ? (
              <img
                ref={imgRef}
                src={streamUrl}
                alt="Live Camera Feed"
                className="absolute inset-0 w-full h-full object-contain"
                onError={() => setStreamError(true)}
                onLoad={() => setStreamError(false)}
              />
            ) : (
              /* Offline / Error fallback */
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020617] gap-4">
                <div className="p-4 rounded-full bg-slate-800/80 border border-slate-700">
                  {streamError ? (
                    <WifiOff className="w-12 h-12 text-rose-400" />
                  ) : (
                    <Loader2 className="w-12 h-12 text-slate-400 animate-spin" />
                  )}
                </div>
                <p className="text-slate-400 text-sm font-mono">
                  {streamError
                    ? "Stream unavailable — camera may be offline or not processing"
                    : "Connecting to stream..."}
                </p>
                {streamError && (
                  <button
                    onClick={reloadStream}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium transition-all"
                  >
                    <RefreshCw className="w-4 h-4" /> Retry Connection
                  </button>
                )}
                {/* Grid overlay for visual interest even when offline */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />
              </div>
            )}

            {/* Heatmap Real Data Overlay */}
            {showHeatmap && (
              <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between">
                {/* Overlay Image */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Base overlay to dim the video slightly for better contrast */}
                  <div className="absolute inset-0 bg-black/30" />
                  {heatmapUrl ? (
                    <img
                      src={heatmapUrl}
                      alt="Crowd Density Heatmap"
                      className="w-full h-full object-contain mix-blend-screen"
                      style={{ opacity: 0.4 }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                       <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                       <span className="text-indigo-300 font-mono text-xs">GENERATING HEATMAP...</span>
                    </div>
                  )}
                </div>

                {/* Top Status */}
                <div className="relative p-4 lg:mt-12 mt-16 flex justify-between items-start">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur border border-indigo-500 text-xs font-mono shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    <span className="text-indigo-300 tracking-widest uppercase font-bold">Density Heatmap Active</span>
                  </div>
                  
                  {/* Dynamic Density Pill */}
                  {peopleCount >= 0 && (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur border text-xs font-mono tracking-widest uppercase font-bold
                      ${(peopleCount / (camera?.capacity || 100)) >= 0.8 ? 'border-rose-500 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 
                        (peopleCount / (camera?.capacity || 100)) >= 0.5 ? 'border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 
                        'border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}
                    `}>
                      <span className={`w-2 h-2 rounded-full animate-pulse
                        ${(peopleCount / (camera?.capacity || 100)) >= 0.8 ? 'bg-rose-500' : 
                          (peopleCount / (camera?.capacity || 100)) >= 0.5 ? 'bg-amber-500' : 
                          'bg-emerald-500'}
                      `} />
                      {(peopleCount / (camera?.capacity || 100)) >= 0.8 ? 'OVERCROWDED' : 
                       (peopleCount / (camera?.capacity || 100)) >= 0.5 ? 'BUSY' : 'SAFE'}
                    </div>
                  )}
                </div>

                {/* Bottom Legend */}
                <div className="relative p-4 mb-16 mx-auto w-3/4 max-w-md">
                   <div className="bg-black/80 backdrop-blur p-3 rounded-xl border border-white/10 shadow-2xl">
                     <div className="flex justify-between text-[10px] font-mono text-slate-400 font-bold uppercase tracking-widest mb-1.5">
                       <span>Low / Safe</span>
                       <span>High / Critical</span>
                     </div>
                     <div className="w-full h-2 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 via-amber-500 to-rose-600" />
                   </div>
                </div>
              </div>
            )}

            {/* Stream HUD Overlays (always visible) */}
            <div className="absolute top-4 left-4 flex gap-2 z-20">
              <div className="bg-black/70 backdrop-blur text-white px-2 py-1 rounded text-xs font-mono font-bold uppercase border border-white/10 flex items-center gap-2 tracking-wider">
                <div className={`w-2 h-2 rounded-full ${isStreamActive ? "bg-red-500 animate-pulse" : "bg-slate-600"}`}></div>
                {isStreamActive ? "REC" : "IDLE"}
              </div>
              {isStreamActive && (
                <div className="bg-black/70 backdrop-blur text-cyan-400 px-2 py-1 rounded text-xs font-mono border border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                  AI_ACTIVE · YOLO v11
                </div>
              )}
            </div>

            {/* Bottom info bar */}
            <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur border border-white/10 px-3 py-1.5 rounded-lg flex items-center gap-4 text-sm font-mono text-slate-300 z-10">
              <span className="flex items-center gap-2">
                <Video className="w-4 h-4 text-slate-400" />
                {frameRate} FPS
              </span>
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                {peopleCount} detected
              </span>
            </div>

            <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur border border-white/10 px-3 py-1.5 rounded-lg text-sm font-mono text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.1)] z-10">
              {camera?.resolution_width && camera?.resolution_height
                ? `${camera.resolution_width}×${camera.resolution_height}`
                : "HD"}{" "}
              • MJPEG
            </div>
          </div>

          {/* Camera Info Bar */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Status",
                value: health?.health_status?.toUpperCase() ?? "UNKNOWN",
                color:
                  health?.health_status === "healthy"
                    ? "text-emerald-400"
                    : "text-rose-400",
              },
              {
                label: "Stream Type",
                value: camera?.stream_type?.toUpperCase() ?? "---",
                color: "text-cyan-400",
              },
              {
                label: "Venue",
                value: camera?.venue_id
                  ? camera.venue_id.substring(0, 8) + "..."
                  : "---",
                color: "text-slate-300",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-[#0f172a]/80 border border-slate-800 rounded-lg px-4 py-3"
              >
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">
                  {item.label}
                </p>
                <p className={`text-sm font-bold font-mono ${item.color}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          
          {/* Evidence Clips Gallery */}
          {clips && clips.length > 0 && (
            <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-5 mt-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Film className="w-4 h-4 text-purple-400" /> Evidence Clips
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {clips.map((clip: any) => (
                  <div key={clip.id} className="relative group bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                    <div className="aspect-video bg-black flex items-center justify-center relative">
                      <video 
                        src={`${BACKEND_BASE.replace('/api/v1', '')}${clip.url}`} 
                        className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                        controls
                        preload="metadata"
                      />
                    </div>
                    <div className="p-2 border-t border-slate-800 bg-slate-900/90 flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-mono truncate">{clip.filename.split('_')[2]}</span>
                      <a
                        href={`http://localhost:8000${clip.download_url || clip.url}?token=${encodeURIComponent(token || '')}`}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 p-1 bg-cyan-900/20 rounded"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    </div>
                    {clip.status === "recording" && (
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-[9px] font-semibold text-rose-400 uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                        Encoding...
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Telemetry Sidebar */}
        <div className="space-y-4">
          {/* Live AI Telemetry */}
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Live AI Telemetry
            </h3>

            <div className="space-y-5">
              {/* People Count */}
              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-sm font-medium text-slate-300">
                    Detected People
                  </span>
                  <span className="font-mono text-xl font-bold text-white tracking-tight">
                    {peopleCount}{" "}
                    <span className="text-[10px] text-slate-500">PAX</span>
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div
                    className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (peopleCount / Math.max(camera?.capacity ?? 100, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Risk Score */}
              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-sm font-medium text-slate-300">
                    Risk Level
                  </span>
                  <span
                    className={`font-mono font-semibold tracking-tight text-${riskColor}-400`}
                  >
                    {riskLabel}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div
                    className={`bg-${riskColor}-400 h-1.5 rounded-full transition-all duration-500`}
                    style={{ width: `${Math.min(riskScore, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  Score: {(riskScore).toFixed(1)}%
                </p>
              </div>

              {/* Frame Rate */}
              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-sm font-medium text-slate-300">
                    Frame Rate
                  </span>
                  <span className="font-mono text-slate-200 font-semibold">
                    {frameRate} fps
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div
                    className="bg-violet-400 h-1.5 rounded-full"
                    style={{
                      width: `${Math.min(100, (frameRate / 30) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              
            </div>
          </div>

          {/* New Live Traffic Analytics Card */}
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest mb-4 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><Map className="w-4 h-4" /> Live Traffic Analytics</span>
              <span className="text-[9px] text-cyan-400 font-mono bg-cyan-400/10 px-1.5 py-0.5 rounded border border-cyan-400/20 animate-pulse">STREAM</span>
            </h3>

            {/* Live Velocity Badge */}
            {liveVelocity !== null && (
              <div className="mb-4 flex items-center justify-between bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Crowd Velocity</span>
                <span className={`font-mono text-sm font-black ${
                  liveVelocity > 20 ? 'text-rose-400' : liveVelocity > 8 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {liveVelocity.toFixed(1)} <span className="text-[9px] font-normal text-slate-500">px/s</span>
                </span>
              </div>
            )}

            <div className="space-y-5">
              {/* Entry / Exit Gates */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    Flow Gates
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 rounded-lg p-2.5 border border-emerald-500/10 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]">
                    <p className="text-[10px] text-slate-500 font-bold mb-1 tracking-wider uppercase">Entries</p>
                    <p className="text-2xl font-black font-mono text-emerald-400">{entries}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2.5 border border-rose-500/10 shadow-[inset_0_0_10px_rgba(244,63,94,0.02)]">
                    <p className="text-[10px] text-slate-500 font-bold mb-1 tracking-wider uppercase">Exits</p>
                    <p className="text-2xl font-black font-mono text-rose-400">{exits}</p>
                  </div>
                </div>
              </div>

              {/* Behavior Kinetics */}
              <div className="pt-4 border-t border-slate-800/80">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    Live Kinetics
                  </span>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5 font-mono font-medium">
                      <span className="text-cyan-400">Sitting / Resting</span>
                      <span className="text-cyan-300">{actSitting}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div className="bg-cyan-500 h-1.5 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.6)] transition-all duration-300" style={{ width: `${actSitting}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5 font-mono font-medium">
                      <span className="text-blue-400">Standing / Idle</span>
                      <span className="text-blue-300">{actStanding}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)] transition-all duration-300" style={{ width: `${actStanding}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5 font-mono font-medium">
                      <span className="text-emerald-400">Normal Moving</span>
                      <span className="text-emerald-300">{actNormal}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div className="bg-emerald-500 h-1.5 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.6)] transition-all duration-300" style={{ width: `${actNormal}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5 font-mono font-medium">
                      <span className="text-orange-400">Walking / Fast</span>
                      <span className="text-orange-300">{actWalking}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div className="bg-orange-500 h-1.5 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.6)] transition-all duration-300" style={{ width: `${actWalking}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Health Summary */}
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Health Check
            </h3>
            <div className="space-y-2 text-xs font-mono">
              {[
                {
                  key: "Camera Active",
                  val: health?.is_active ? "YES" : "NO",
                  ok: health?.is_active,
                },
                {
                  key: "Online",
                  val: health?.is_online ? "YES" : "NO",
                  ok: health?.is_online,
                },
                {
                  key: "Monitoring",
                  val: health?.monitoring_enabled ? "ON" : "OFF",
                  ok: health?.monitoring_enabled,
                },
                {
                  key: "Health",
                  val: health?.health_status ?? "checking...",
                  ok: health?.health_status === "healthy",
                },
              ].map((row) => (
                <div key={row.key} className="flex justify-between">
                  <span className="text-slate-500">{row.key}</span>
                  <span
                    className={
                      row.ok === undefined
                        ? "text-slate-400"
                        : row.ok
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }
                  >
                    {String(row.val).toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
            {health?.message && (
              <p className="text-[10px] text-slate-500 mt-3 font-mono leading-relaxed border-t border-slate-800 pt-3">
                {health.message}
              </p>
            )}
          </div>

          {/* AI Explanation / Context Panel */}
          {snapshot?.intelligence?.summary && (
             <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.05)] rounded-xl p-5">
              <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Live AI Context
              </h3>
              <p className="text-sm font-mono text-slate-300 leading-relaxed mb-4">
                {snapshot.intelligence.summary}
              </p>
              
              {snapshot.intelligence.recommended_action && (
                <div className="bg-indigo-950/30 border border-indigo-500/20 p-3 rounded-lg">
                  <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider mb-1">Recommended Action</p>
                  <p className="text-xs text-indigo-200">{snapshot.intelligence.recommended_action}</p>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <button
            onClick={reloadStream}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-slate-300 rounded-lg transition-all font-semibold tracking-wide text-sm flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Reload Stream
          </button>
          
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            disabled={!isStreamActive}
            className={`w-full py-2.5 rounded-lg transition-all font-semibold tracking-wide text-sm flex items-center justify-center gap-2 border shadow-lg
              ${!isStreamActive 
                ? "bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed"
                : showHeatmap
                  ? "bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-400"
              }
            `}
          >
            <Map className="w-4 h-4" /> {showHeatmap ? "Hide Density Heatmap" : "Show Density Heatmap"}
          </button>
          
          <button
            onClick={handleRecord}
            disabled={!isStreamActive || isRecording}
            className={`w-full py-2.5 rounded-lg transition-all font-semibold tracking-wide text-sm flex items-center justify-center gap-2 border shadow-lg
              ${isRecording 
                ? "bg-rose-500/20 border-rose-500/50 text-rose-400 cursor-not-allowed" 
                : !isStreamActive 
                  ? "bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed"
                  : "bg-rose-600 hover:bg-rose-500 border-rose-500 text-white"
              }
            `}
          >
            {isRecording ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Recording (10s)...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" /> Record 10s Clip
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
