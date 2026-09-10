"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Loader2, Wifi, WifiOff, Scan, Activity,
  Crosshair, Cpu, Server, AlertTriangle, Eye, RefreshCw, Target, ArrowLeft,
  Upload, Play, Pause, Volume2, VolumeX, Maximize, Film, Layers, CheckCircle2,
  XCircle, Sliders, Clock, Compass, ShieldCheck, Zap
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import Ferrofluid from "@/components/ui/Ferrofluid";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ForensicMatch {
  timestamp_sec: number;
  timestamp_formatted: string;
  confidence: number;
  score: number;
  class_name: string;
  dominant_color: string;
  bbox_norm: [number, number, number, number];
  region: string;
  rationale: string;
  thumbnail_url: string;
}

interface ForensicQueryResult {
  status: "VERIFIED" | "NOT_VERIFIED";
  verdict_title: string;
  summary: string;
  matches: ForensicMatch[];
  relevance_gate: {
    active: boolean;
    threshold: number;
    highest_confidence?: number;
    gated_candidates_count?: number;
  };
  telemetry: {
    query_ms: number;
    frames_searched: number;
    video_duration_sec: number;
  };
}

interface LibraryVideo {
  video_id: string;
  filename: string;
  file_path: string;
  size_mb: number;
  indexed: boolean;
  stream_url: string;
}

interface CameraSearchResult {
  description: string;
  camera_id: string;
  timestamp: string;
  image_url: string | null;
  distance: number;
  bbox?: number[] | null;
}

interface IndexStatus {
  total_items: number;
  model_loaded: boolean;
  semantic_snapshots?: number;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_BASE = "/api/v1";
const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1")
  .replace(/\/api\/v1$/, "");

const FORENSIC_PRESETS = [
  "White car",
  "Car",
  "Person in dark clothing",
  "Person wearing blue",
  "Truck or lorry",
  "Backpack or luggage",
];

export default function AISearchPage() {
  const { t } = useTranslation();
  const router = useRouter();

  // Mode Selection: Forensic Video Retrieval (P0) vs Camera Mesh
  const [activeTab, setActiveTab] = useState<"video" | "mesh">("video");

  // ── Video State ─────────────────────────────────────────────
  const [libraryVideos, setLibraryVideos] = useState<LibraryVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<LibraryVideo | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingTelemetry, setIndexingTelemetry] = useState<any | null>(null);

  // ── Forensic Player State ───────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [activeHit, setActiveHit] = useState<ForensicMatch | null>(null);

  // ── Search State ────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [threshold, setThreshold] = useState(0.40);
  const [forensicLoading, setForensicLoading] = useState(false);
  const [forensicResult, setForensicResult] = useState<ForensicQueryResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Camera Mesh State (Tab 2) ───────────────────────────────
  const [meshResults, setMeshResults] = useState<CameraSearchResult[]>([]);
  const [meshLoading, setMeshLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<IndexStatus | null>(null);

  // ── Fetch Library Videos ────────────────────────────────────
  const fetchLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      const res = await fetch(`${API_BASE}/search/video-library`);
      if (res.ok) {
        const data = await res.json();
        const vids: LibraryVideo[] = data.videos || [];
        setLibraryVideos(vids);
        if (vids.length > 0 && !selectedVideo) {
          setSelectedVideo(vids[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load video library:", err);
    } finally {
      setLoadingLibrary(false);
    }
  }, [selectedVideo]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // ── Fetch Camera Mesh Status ────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/search/status`)
      .then(r => r.json())
      .then(d => setBackendStatus(d))
      .catch(() => {});
  }, []);

  // ── Video Time Update ───────────────────────────────────────
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);

    // Auto-highlight match if playback is within 0.8s of a detected hit
    if (forensicResult?.matches) {
      const nearby = forensicResult.matches.find(
        m => Math.abs(m.timestamp_sec - cur) <= 0.8
      );
      if (nearby) {
        setActiveHit(nearby);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
  };

  // ── Play / Pause Toggle ─────────────────────────────────────
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // ── Click-to-Seek Handler ───────────────────────────────────
  const handleSeekTo = (match: ForensicMatch) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = match.timestamp_sec;
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
    setActiveHit(match);
  };

  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = pct * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // ── Video Upload ────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/search/upload-video?auto_index=true`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Upload failed with status ${res.status}`);
      }

      const data = await res.json();
      await fetchLibrary();
      
      const newVideo: LibraryVideo = {
        video_id: data.video_id,
        filename: data.filename,
        file_path: "",
        size_mb: roundNumber(file.size / (1024 * 1024), 2),
        indexed: data.indexed,
        stream_url: data.stream_url,
      };
      setSelectedVideo(newVideo);
      if (data.telemetry) {
        setIndexingTelemetry(data.telemetry);
      }
    } catch (err: any) {
      setError(err.message || "Failed to upload video");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Trigger Indexing for Selected Video ──────────────────────
  const handleIndexVideo = async () => {
    if (!selectedVideo) return;
    setIsIndexing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/search/index-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: selectedVideo.video_id, force_reindex: true }),
      });
      if (!res.ok) throw new Error("Indexing failed");
      const data = await res.json();
      setIndexingTelemetry(data.telemetry);
      setSelectedVideo(prev => prev ? { ...prev, indexed: true } : null);
      fetchLibrary();
    } catch (err: any) {
      setError(err.message || "Indexing failed");
    } finally {
      setIsIndexing(false);
    }
  };

  // ── Forensic Search Handler ─────────────────────────────────
  const handleForensicSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q || !selectedVideo || forensicLoading) return;

    setForensicLoading(true);
    setError(null);
    setHasSearched(true);
    setActiveHit(null);

    try {
      const res = await fetch(`${API_BASE}/search/forensic-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: selectedVideo.video_id,
          query: q,
          threshold: threshold,
          top_k: 8,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Search execution failed");
      }

      const data: ForensicQueryResult = await res.json();
      setForensicResult(data);

      // Auto-jump to first hit if verified
      if (data.status === "VERIFIED" && data.matches.length > 0) {
        handleSeekTo(data.matches[0]);
      }
    } catch (err: any) {
      setError(err.message || "Forensic search failed");
    } finally {
      setForensicLoading(false);
    }
  };

  // ── Camera Mesh Search (Tab 2) ──────────────────────────────
  const handleMeshSearch = async () => {
    if (!query.trim() || meshLoading) return;
    setMeshLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/search/semantic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), top_k: 8 }),
      });
      if (!res.ok) throw new Error("Mesh search failed");
      const data = await res.json();
      setMeshResults(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Camera mesh search failed");
    } finally {
      setMeshLoading(false);
    }
  };

  function roundNumber(num: number, decimals: number) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  function resolveThumb(url: string) {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${BACKEND_BASE}${url}`;
  }

  return (
    <div
      className="min-h-screen bg-[#030508] text-white overflow-x-hidden"
      style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
    >
      {/* ── Dynamic Cyber Background ────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none select-none z-0">
        <Ferrofluid
          colors={["#0ea5e9", "#0284c7", "#0f172a"]}
          speed={0.4}
          scale={1.6}
          turbulence={1}
          fluidity={0.1}
          rimWidth={0.2}
          sharpness={2.5}
          shimmer={1.5}
          glow={2}
          flowDirection="down"
          opacity={0.65}
          mouseInteraction={true}
          mouseStrength={0.8}
          mouseRadius={0.35}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_-10%,rgba(56,189,248,0.1),transparent)] pointer-events-none mix-blend-screen" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#030508] to-transparent pointer-events-none" />
      </div>

      {/* ── Content Container ────────────────────────────────── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8 pointer-events-auto">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-xs font-bold uppercase tracking-widest group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </button>

        {/* Header Strip */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 shadow-[0_0_24px_rgba(56,189,248,0.15)] shrink-0">
              <Scan className="h-7 w-7 text-sky-400" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black uppercase tracking-[0.12em] bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Forensic Video Retrieval
              </h1>
              <p className="text-xs font-bold text-sky-400 uppercase tracking-widest mt-0.5 flex items-center gap-2">
                <span>Evidence-Grounded Retrieval Engine</span>
                <span className="inline-block w-1 h-1 rounded-full bg-sky-400" />
                <span className="text-slate-400 font-normal">VideoRAG Native Workstation</span>
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-white/[0.04] p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl">
            <button
              onClick={() => setActiveTab("video")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                activeTab === "video"
                  ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_16px_rgba(56,189,248,0.4)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Film className="w-4 h-4" />
              Forensic Video Clip
            </button>
            <button
              onClick={() => setActiveTab("mesh")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                activeTab === "mesh"
                  ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_16px_rgba(56,189,248,0.4)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-4 h-4" />
              Live Camera Mesh
            </button>
          </div>
        </div>

        {/* ── Error Banner ───────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="underline hover:text-white">Dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 1: FORENSIC VIDEO RETRIEVAL WORKSTATION           */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === "video" && (
          <div className="space-y-8">
            {/* Video Selection & Ingestion Bar */}
            <div className="bg-[#0b0d14]/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-xl">
              <div className="flex flex-1 items-center gap-3 overflow-x-auto pb-1 md:pb-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 shrink-0 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-sky-400" />
                  Source Clip:
                </span>
                <select
                  value={selectedVideo?.video_id || ""}
                  onChange={(e) => {
                    const match = libraryVideos.find(v => v.video_id === e.target.value);
                    if (match) {
                      setSelectedVideo(match);
                      setForensicResult(null);
                      setActiveHit(null);
                      setHasSearched(false);
                    }
                  }}
                  className="bg-black/60 border border-white/15 text-xs text-white rounded-xl px-3 py-2 outline-none focus:border-sky-500 max-w-xs md:max-w-md truncate"
                >
                  {libraryVideos.map((v) => (
                    <option key={v.video_id} value={v.video_id}>
                      {v.filename} ({v.size_mb} MB) {v.indexed ? "✓ Indexed" : "⚠ Not Indexed"}
                    </option>
                  ))}
                </select>

                {selectedVideo && (
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                    selectedVideo.indexed
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                  }`}>
                    {selectedVideo.indexed ? "✓ Forensically Indexed" : "Needs Indexing"}
                  </span>
                )}
              </div>

              {/* Action Buttons: Re-Index & Upload */}
              <div className="flex items-center gap-2.5 shrink-0">
                {selectedVideo && !selectedVideo.indexed && (
                  <button
                    onClick={handleIndexVideo}
                    disabled={isIndexing}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    {isIndexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-sky-400" />}
                    Index Video Now
                  </button>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="video/mp4,video/x-m4v,video/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_16px_rgba(56,189,248,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {isUploading ? "Processing..." : "Upload New Video"}
                </button>
              </div>
            </div>

            {/* Main Interactive Grid: Video Player + Forensic HUD */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Video Player & Controls (7 cols) */}
              <div className="lg:col-span-7 bg-[#0a0c13] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                {/* Video Viewport with Canvas Bounding Box HUD */}
                <div className="relative aspect-video bg-black overflow-hidden select-none">
                  {/* Scanline CRT overlay */}
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(56,189,248,0.02)_0px,rgba(56,189,248,0.02)_1px,transparent_1px,transparent_3px)] z-10 pointer-events-none" />

                  {selectedVideo ? (
                    <video
                      ref={videoRef}
                      src={`${BACKEND_BASE}${selectedVideo.stream_url}`}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      muted={isMuted}
                      className="w-full h-full object-contain"
                      playsInline
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                      <Film className="w-8 h-8 opacity-40" />
                      <p className="text-xs">No video selected</p>
                    </div>
                  )}

                  {/* Active Target Bounding Box Overlay */}
                  {activeHit && (
                    <div
                      className="absolute border-2 border-sky-400 z-20 pointer-events-none transition-all duration-200 shadow-[0_0_16px_rgba(56,189,248,0.8)]"
                      style={{
                        left: `${activeHit.bbox_norm[0]}%`,
                        top: `${activeHit.bbox_norm[1]}%`,
                        width: `${activeHit.bbox_norm[2] - activeHit.bbox_norm[0]}%`,
                        height: `${activeHit.bbox_norm[3] - activeHit.bbox_norm[1]}%`,
                      }}
                    >
                      {/* Reticle corners */}
                      <span className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-sky-300" />
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-sky-300" />
                      <span className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-sky-300" />
                      <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-sky-300" />

                      {/* Floating Lock Pill */}
                      <div className="absolute -top-7 left-0 bg-black/90 border border-sky-400/80 text-sky-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1.5">
                        <Target className="w-2.5 h-2.5 animate-pulse" />
                        <span>LOCK: {activeHit.class_name.toUpperCase()} ({activeHit.confidence}%)</span>
                      </div>
                    </div>
                  )}

                  {/* Top HUD Bar */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
                    <div className="flex items-center gap-2 bg-black/70 border border-white/10 rounded-full px-3 py-1 text-[10px] font-mono text-slate-300 backdrop-blur-md">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>FORENSIC PLAYBACK</span>
                    </div>
                    {activeHit && (
                      <div className="bg-sky-500/20 border border-sky-400/40 text-sky-300 text-[10px] font-mono font-bold px-3 py-1 rounded-full backdrop-blur-md">
                        LOC: {activeHit.region}
                      </div>
                    )}
                  </div>
                </div>

                {/* Interactive Forensic Timeline with Evidence Pins */}
                <div className="p-4 bg-[#07090e] border-t border-white/10 space-y-3">
                  <div
                    onClick={handleTimelineScrub}
                    className="relative w-full h-3 bg-slate-800/80 rounded-full cursor-pointer overflow-visible group"
                  >
                    {/* Progress Fill */}
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full relative"
                      style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />

                    {/* Timeline Hit Pins */}
                    {forensicResult?.matches?.map((hit, idx) => {
                      const pinLeft = duration ? (hit.timestamp_sec / duration) * 100 : 0;
                      const isActive = activeHit?.timestamp_sec === hit.timestamp_sec;
                      return (
                        <div
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSeekTo(hit);
                          }}
                          className={`absolute -top-1 w-3.5 h-3.5 -translate-x-1/2 rounded-full cursor-pointer transition-transform hover:scale-150 z-30 ${
                            isActive ? "scale-125" : ""
                          }`}
                          style={{ left: `${pinLeft}%` }}
                          title={`Verified Hit: ${hit.class_name} at ${hit.timestamp_formatted}`}
                        >
                          <span className="absolute inset-0 rounded-full bg-sky-400 animate-ping opacity-75" />
                          <span className={`relative block w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_10px_#38bdf8] ${
                            isActive ? "bg-emerald-400" : "bg-sky-400"
                          }`} />
                        </div>
                      );
                    })}
                  </div>

                  {/* Player Controls Bar */}
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlay}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                      >
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <span className="font-mono text-[11px] text-sky-400">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Speed:</span>
                      {[0.5, 1, 2].map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            if (videoRef.current) videoRef.current.playbackRate = s;
                            setPlaybackSpeed(s);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            playbackSpeed === s ? "bg-sky-500 text-white" : "bg-white/5 text-slate-400 hover:text-white"
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Search Command Bar & Evidence Dossier (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                {/* Search Box */}
                <div className="bg-[#0b0d14]/90 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-sky-400" />
                      Forensic Target Query
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                      <ShieldCheck className="w-3 h-3" />
                      Evidence Gate: ACTIVE
                    </div>
                  </div>

                  <div className="flex gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/10 focus-within:border-sky-500/60 focus-within:shadow-[0_0_20px_rgba(56,189,248,0.15)] transition-all">
                    <Search className="ml-3 my-auto h-4 w-4 text-sky-400 shrink-0" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleForensicSearch()}
                      placeholder="e.g. 'white car', 'person in red'..."
                      className="flex-1 bg-transparent py-2.5 text-xs text-white placeholder-slate-500 outline-none font-medium"
                      disabled={forensicLoading}
                    />
                    <button
                      onClick={() => handleForensicSearch()}
                      disabled={forensicLoading || !query.trim() || !selectedVideo}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_14px_rgba(56,189,248,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40"
                    >
                      {forensicLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "SEARCH"}
                    </button>
                  </div>

                  {/* Preset Query Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {FORENSIC_PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setQuery(p);
                          handleForensicSearch(p);
                        }}
                        disabled={forensicLoading}
                        className="px-2.5 py-1 rounded-full text-[10px] font-medium text-slate-300 border border-white/10 bg-white/5 hover:border-sky-400 hover:text-sky-300 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Telemetry Gauge Bar */}
                  {indexingTelemetry && (
                    <div className="pt-2 border-t border-white/10 text-[10px] text-slate-400 font-mono space-y-1">
                      <div className="flex justify-between">
                        <span>Adaptive Samples: {indexingTelemetry.sampled_frames}</span>
                        <span className="text-emerald-400">dHash Pruned: {indexingTelemetry.pruned_static_pct}% static</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Retained Keyframes: {indexingTelemetry.retained_frames}</span>
                        <span>Index Time: {indexingTelemetry.index_elapsed_sec}s</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Evidence Dossier / Verdict Display */}
                {forensicResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* Verdict Card */}
                    <div className={`p-4 rounded-2xl border backdrop-blur-xl ${
                      forensicResult.status === "VERIFIED"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {forensicResult.status === "VERIFIED" ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-amber-400 shrink-0" />
                        )}
                        <h3 className="font-black text-sm uppercase tracking-wider">
                          {forensicResult.verdict_title}
                        </h3>
                        {forensicResult.status === "VERIFIED" && forensicResult.relevance_gate.highest_confidence && (
                          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                            {forensicResult.relevance_gate.highest_confidence}% MAX CONF
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {forensicResult.summary}
                      </p>
                    </div>

                    {/* Evidence Match Cards */}
                    {forensicResult.matches.length > 0 && (
                      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-sky-400" />
                          Verified Occurrence Strip ({forensicResult.matches.length}):
                        </span>

                        {forensicResult.matches.map((match, idx) => {
                          const isFocused = activeHit?.timestamp_sec === match.timestamp_sec;
                          return (
                            <div
                              key={idx}
                              onClick={() => handleSeekTo(match)}
                              className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3.5 ${
                                isFocused
                                  ? "bg-sky-500/15 border-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.2)]"
                                  : "bg-white/[0.03] border-white/10 hover:border-sky-500/40 hover:bg-white/[0.05]"
                              }`}
                            >
                              {/* Evidence Thumbnail */}
                              <div className="relative w-24 h-16 rounded-lg bg-black overflow-hidden shrink-0 border border-white/10">
                                <img
                                  src={resolveThumb(match.thumbnail_url)}
                                  alt="Evidence"
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute bottom-1 right-1 px-1.5 py-0.2 bg-black/80 rounded text-[9px] font-mono text-sky-400 font-bold">
                                  {match.timestamp_formatted}
                                </div>
                              </div>

                              {/* Evidence Meta & Click-to-Seek Action */}
                              <div className="flex-1 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                                      {match.class_name} ({match.dominant_color})
                                    </span>
                                    <span className="text-[10px] font-bold font-mono text-emerald-400">
                                      {match.confidence}% CONF
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                                    {match.rationale}
                                  </p>
                                </div>

                                <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/5">
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    Region: {match.region}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSeekTo(match);
                                    }}
                                    className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300 uppercase tracking-wider"
                                  >
                                    <Play className="w-2.5 h-2.5" />
                                    SEEK TO {match.timestamp_formatted}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 2: LIVE CAMERA MULTI-NODE MESH SEARCH              */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === "mesh" && (
          <div className="space-y-6">
            <div className="bg-[#0b0d14]/80 border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-wider text-white">
                    Live Multi-Node Mesh Search
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Query historical snapshots and vector embeddings across all deployed camera venues.
                  </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border border-sky-500/30 bg-sky-500/10 text-sky-400">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{backendStatus?.semantic_snapshots || 0} Snapshots Online</span>
                </div>
              </div>

              <div className="flex gap-2 p-1.5 rounded-xl bg-white/[0.04] border border-white/10 focus-within:border-sky-500/60">
                <Search className="ml-3 my-auto h-4 w-4 text-sky-400 shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleMeshSearch()}
                  placeholder="Query multi-camera network — e.g. 'Person in red shirt'..."
                  className="flex-1 bg-transparent py-2.5 text-xs text-white placeholder-slate-500 outline-none"
                  disabled={meshLoading}
                />
                <button
                  onClick={handleMeshSearch}
                  disabled={meshLoading || !query.trim()}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-xs uppercase tracking-wider"
                >
                  {meshLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "SCAN MESH"}
                </button>
              </div>
            </div>

            {/* Mesh Results Grid */}
            {meshResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {meshResults.map((r, i) => (
                  <div key={i} className="bg-[#0a0c13] border border-white/10 rounded-2xl overflow-hidden shadow-xl p-3 space-y-2">
                    <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                      {r.image_url ? (
                        <img src={resolveThumb(r.image_url)} alt="Mesh Hit" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-600 text-xs">No image</div>
                      )}
                      <div className="absolute top-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-bold text-emerald-400">
                        {Math.round((1 - r.distance) * 100)}% Match
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">{r.description}</p>
                    <div className="text-[10px] text-slate-500 font-mono">
                      CAM: {r.camera_id.slice(0, 10)}...
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500 text-xs">
                Enter a target query to scan across the connected camera network.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
