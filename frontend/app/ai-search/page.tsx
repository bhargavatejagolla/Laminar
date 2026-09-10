"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search, Loader2, Wifi, WifiOff, Scan, Activity,
  Crosshair, Cpu, Server, AlertTriangle, Eye, RefreshCw, Target, ArrowLeft,
  Upload, Play, Pause, Volume2, VolumeX, Maximize, Film, Layers, CheckCircle2,
  XCircle, Sliders, Clock, Compass, ShieldCheck, Zap, Sparkles, MessageSquare, Send, CornerDownLeft,
  Image as ImageIcon, User, Car, Briefcase, MapPin, Trash2
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
  quadrant: string;
  region: string;
  similarity_score?: number;
  rationale: string;
  thumbnail_url: string;
}

interface ForensicQueryResult {
  status: "VERIFIED" | "NOT_VERIFIED";
  verdict_title: string;
  summary: string;
  forensic_brief?: string;
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
    entities_compared?: number;
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

interface ChatMessage {
  role: "user" | "copilot";
  text: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_BASE = "/api/v1";
const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1")
  .replace(/\/api\/v1$/, "");

const PRESET_GROUPS = [
  {
    category: "People",
    icon: User,
    items: ["Person wearing blue", "Person in dark clothing", "Person with backpack"],
  },
  {
    category: "Vehicles",
    icon: Car,
    items: ["White vehicle", "Red car", "Bicycle or motorcycle"],
  },
  {
    category: "Belongings",
    icon: Briefcase,
    items: ["Backpack or luggage", "Handbag or purse"],
  },
  {
    category: "Spatial",
    icon: MapPin,
    items: ["Person in Top-Right", "Vehicle in Center"],
  },
];

const QUADRANTS = ["All", "Top-Left", "Top-Right", "Center", "Bottom-Left", "Bottom-Right"];

export default function AISearchPage() {
  const { t } = useTranslation();
  const router = useRouter();

  // Mode Selection: Forensic Video Retrieval vs Camera Mesh
  const [activeTab, setActiveTab] = useState<"video" | "mesh">("video");

  // Search Mode inside Video: Text Query vs Reference Appearance
  const [searchMode, setSearchMode] = useState<"text" | "reference">("text");

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

  // ── Text Search State ───────────────────────────────────────
  const [query, setQuery] = useState("");
  const [threshold, setThreshold] = useState(0.40);
  const [selectedQuadrant, setSelectedQuadrant] = useState("All");
  const [forensicLoading, setForensicLoading] = useState(false);
  const [forensicResult, setForensicResult] = useState<ForensicQueryResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reference Appearance Search State ───────────────────────
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceThreshold, setReferenceThreshold] = useState(0.52);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  // ── Forensic Copilot Chat State ─────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  // ── Click-to-Seek Handlers ──────────────────────────────────
  const handleSeekTo = (match: ForensicMatch) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = match.timestamp_sec;
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
    setActiveHit(match);
  };

  const handleSeekToSeconds = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
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

  // ── Forensic Text Search Handler ─────────────────────────────
  const handleForensicSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q || !selectedVideo || forensicLoading) return;

    setForensicLoading(true);
    setError(null);
    setHasSearched(true);
    setActiveHit(null);
    setChatMessages([]);

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

      if (data.forensic_brief) {
        setChatMessages([
          { role: "copilot", text: data.forensic_brief }
        ]);
      }

      if (data.status === "VERIFIED" && data.matches.length > 0) {
        handleSeekTo(data.matches[0]);
      }
    } catch (err: any) {
      setError(err.message || "Forensic search failed");
    } finally {
      setForensicLoading(false);
    }
  };

  // ── Reference Appearance Search Handler ──────────────────────
  const handleReferenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferenceFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setReferencePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClearReference = () => {
    setReferenceFile(null);
    setReferencePreview(null);
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  };

  const handleReferenceSearch = async () => {
    if (!referenceFile || !selectedVideo || referenceLoading) return;

    setReferenceLoading(true);
    setError(null);
    setHasSearched(true);
    setActiveHit(null);
    setChatMessages([]);

    const formData = new FormData();
    formData.append("video_id", selectedVideo.video_id);
    formData.append("file", referenceFile);
    formData.append("threshold", referenceThreshold.toString());
    formData.append("top_k", "8");

    try {
      const res = await fetch(`${API_BASE}/search/reference-search`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Reference search failed");
      }

      const data: ForensicQueryResult = await res.json();
      setForensicResult(data);

      if (data.forensic_brief) {
        setChatMessages([
          { role: "copilot", text: data.forensic_brief }
        ]);
      }

      if (data.status === "VERIFIED" && data.matches.length > 0) {
        handleSeekTo(data.matches[0]);
      }
    } catch (err: any) {
      setError(err.message || "Reference appearance search failed");
    } finally {
      setReferenceLoading(false);
    }
  };

  // ── Forensic Copilot Q&A Handler ────────────────────────────
  const handleSendChatMessage = async (presetText?: string) => {
    const qText = (presetText || chatInput).trim();
    if (!qText || !selectedVideo || !forensicResult || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", text: qText };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/search/forensic-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: selectedVideo.video_id,
          question: qText,
          matches: forensicResult.matches,
        }),
      });

      if (!res.ok) throw new Error("Copilot response failed");
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "copilot", text: data.answer }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: "copilot", text: "Forensic query temporarily unavailable." }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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

  // ── Filtered Matches by Quadrant ────────────────────────────
  const displayedMatches = useMemo(() => {
    if (!forensicResult?.matches) return [];
    if (selectedQuadrant === "All") return forensicResult.matches;
    return forensicResult.matches.filter(m => m.quadrant === selectedQuadrant);
  }, [forensicResult, selectedQuadrant]);

  function roundNumber(num: number, decimals: number) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  function resolveThumb(url: string) {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${BACKEND_BASE}${url}`;
  }

  function parseTimestampToSeconds(ts: string): number {
    const parts = ts.split(":");
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return 0;
  }

  // Renders text with clickable [MM:SS] citation buttons
  function renderClickableBrief(text: string) {
    if (!text) return null;
    const parts = text.split(/(\[\d{2}:\d{2}(?:\.\d+)?\])/g);
    return parts.map((part, idx) => {
      const match = part.match(/^\[(\d{2}:\d{2}(?:\.\d+)?)\]$/);
      if (match) {
        const tsFormatted = match[1];
        const sec = parseTimestampToSeconds(tsFormatted);
        return (
          <button
            key={idx}
            onClick={() => handleSeekToSeconds(sec)}
            className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 hover:text-white border border-sky-400/40 font-mono font-bold text-[11px] transition-all cursor-pointer shadow-[0_0_8px_rgba(56,189,248,0.3)]"
          >
            <Play className="w-2.5 h-2.5" />
            {tsFormatted}
          </button>
        );
      }
      return <span key={idx}>{part}</span>;
    });
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
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  CCTV FORENSIC WORKSTATION
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Deep ReID + Spatial Pyramid
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black uppercase tracking-[0.12em] bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Forensic Video Retrieval
              </h1>
              <p className="text-xs font-bold text-sky-400 uppercase tracking-widest mt-0.5 flex items-center gap-2">
                <span>Visual Similarity & Natural Language Search</span>
                <span className="inline-block w-1 h-1 rounded-full bg-sky-400" />
                <span className="text-slate-400 font-normal">Temporal Frame Pinning + Click-to-Seek</span>
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
              Surveillance Video
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

        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-white text-xs underline font-bold"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: FORENSIC SURVEILLANCE VIDEO RETRIEVAL WORKSTATION           */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {activeTab === "video" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* ── Left Column: Video Library & Ingestion (3 cols) ── */}
            <div className="lg:col-span-3 space-y-6">
              {/* Video Selector Card */}
              <div className="bg-[#0b0d14]/90 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-sky-400" />
                    CCTV Library
                  </span>
                  <button
                    onClick={fetchLibrary}
                    disabled={loadingLibrary}
                    className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                    title="Refresh Library"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLibrary ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {/* Upload Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-msvideo"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full mb-4 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-dashed border-white/20 hover:border-sky-500/50 text-xs font-bold text-slate-300 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                      <span>Ingesting & Indexing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-sky-400" />
                      <span>Upload CCTV Footage</span>
                    </>
                  )}
                </button>

                {/* Video List */}
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {libraryVideos.map((vid) => {
                    const isSelected = selectedVideo?.video_id === vid.video_id;
                    return (
                      <div
                        key={vid.video_id}
                        onClick={() => {
                          setSelectedVideo(vid);
                          setForensicResult(null);
                          setActiveHit(null);
                        }}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-sky-500/10 border-sky-500/50 shadow-[0_0_12px_rgba(56,189,248,0.15)]"
                            : "bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold truncate text-slate-200 max-w-[150px]">
                            {vid.filename}
                          </span>
                          {vid.indexed ? (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              INDEXED
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              PENDING
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>{vid.size_mb} MB</span>
                          <span className="text-slate-400 font-normal">MP4</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Index Action if Pending */}
                {selectedVideo && !selectedVideo.indexed && (
                  <button
                    onClick={handleIndexVideo}
                    disabled={isIndexing}
                    className="w-full mt-4 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_14px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {isIndexing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Adaptive Indexing...</span>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-3.5 h-3.5" />
                        <span>Build Forensic Index</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Spatial Pyramid Reference */}
              <div className="bg-[#0b0d14]/90 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
                <span className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2 mb-3">
                  <Compass className="w-4 h-4 text-sky-400" />
                  Spatial Pyramid
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-center">
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                    Top-Left
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                    Top-Right
                  </div>
                  <div className="col-span-2 p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 font-bold">
                    Center Focus Zone
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                    Bottom-Left
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                    Bottom-Right
                  </div>
                </div>
              </div>
            </div>

            {/* ── Center & Right Columns (9 cols) ── */}
            <div className="lg:col-span-9 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Center Column: Forensic Video Player (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="bg-[#0b0d14]/90 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl relative group">
                    {/* Video Header Strip */}
                    <div className="px-4 py-3 bg-black/60 border-b border-white/10 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-mono text-slate-300 text-[11px] truncate max-w-[220px]">
                          {selectedVideo?.filename || "No Video Loaded"}
                        </span>
                      </div>
                      {activeHit && (
                        <div className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-[10px] font-bold">
                          LOCK: {activeHit.class_name.toUpperCase()} ({activeHit.quadrant})
                        </div>
                      )}
                    </div>

                    {/* HTML5 Video Player Container */}
                    <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                      {selectedVideo ? (
                        <>
                          <video
                            ref={videoRef}
                            src={selectedVideo.stream_url}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            className="w-full h-full object-contain"
                            playsInline
                            muted={isMuted}
                            preload="metadata"
                          />

                          {/* Dynamic Target Bounding Box Overlay */}
                          {activeHit && (
                            <div
                              className="absolute pointer-events-none transition-all duration-300 border-2 border-sky-400 bg-sky-400/10 shadow-[0_0_20px_rgba(56,189,248,0.5)] rounded"
                              style={{
                                left: `${activeHit.bbox_norm[0]}%`,
                                top: `${activeHit.bbox_norm[1]}%`,
                                width: `${activeHit.bbox_norm[2] - activeHit.bbox_norm[0]}%`,
                                height: `${activeHit.bbox_norm[3] - activeHit.bbox_norm[1]}%`,
                              }}
                            >
                              <div className="absolute -top-6 left-0 bg-sky-500 text-white font-mono text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 shadow-md whitespace-nowrap">
                                <Target className="w-2.5 h-2.5" />
                                {activeHit.class_name.toUpperCase()} {activeHit.confidence}%
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center p-8 text-slate-500">
                          <Film className="w-10 h-10 mx-auto mb-2 opacity-40" />
                          <p className="text-xs font-bold uppercase tracking-wider">Select or Upload a Video to Begin</p>
                        </div>
                      )}
                    </div>

                    {/* Timeline & Player Controls */}
                    <div className="p-4 bg-black/60 border-t border-white/10 space-y-3">
                      {/* Timeline Scrubber with Pin Markers */}
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
                        {displayedMatches.map((hit, idx) => {
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
                              title={`Verified Hit: ${hit.class_name} at ${hit.timestamp_formatted} (${hit.quadrant})`}
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
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Speed:</span>
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
                </div>

                {/* Right Column: Search Command Bar & Evidence Dossier (5 cols) */}
                <div className="lg:col-span-5 space-y-5">
                  {/* Search Mode Segmented Control & Search Card */}
                  <div className="bg-[#0b0d14]/90 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl space-y-4">
                    {/* Header & Evidence Gate Indicator */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                        <Crosshair className="w-4 h-4 text-sky-400" />
                        Forensic Intelligence Search
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        <ShieldCheck className="w-3 h-3" />
                        Evidence Gate: ACTIVE
                      </div>
                    </div>

                    {/* Search Mode Tabs: Text vs Reference Image */}
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                      <button
                        onClick={() => setSearchMode("text")}
                        className={`py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                          searchMode === "text"
                            ? "bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.3)]"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Search className="w-3 h-3" />
                        Natural Language
                      </button>
                      <button
                        onClick={() => setSearchMode("reference")}
                        className={`py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                          searchMode === "reference"
                            ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <ImageIcon className="w-3 h-3" />
                        Reference Image
                      </button>
                    </div>

                    {/* ── MODE A: Natural Language Search Bar ── */}
                    {searchMode === "text" && (
                      <div className="space-y-3">
                        <div className="flex gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/10 focus-within:border-sky-500/60 focus-within:shadow-[0_0_20px_rgba(56,189,248,0.15)] transition-all">
                          <Search className="ml-3 my-auto h-4 w-4 text-sky-400 shrink-0" />
                          <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleForensicSearch()}
                            placeholder="e.g. 'person wearing blue', 'white car', 'backpack'..."
                            className="flex-1 bg-transparent py-2.5 text-xs text-white placeholder-slate-400 outline-none font-medium"
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

                        {/* Categorized CCTV Preset Chips */}
                        <div className="space-y-2 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            CCTV Forensic Presets:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {PRESET_GROUPS.flatMap(g => g.items).map((p) => (
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
                        </div>
                      </div>
                    )}

                    {/* ── MODE B: Reference Appearance Search ── */}
                    {searchMode === "reference" && (
                      <div className="space-y-3">
                        <input
                          ref={referenceInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleReferenceFileChange}
                          className="hidden"
                        />

                        {!referencePreview ? (
                          <div
                            onClick={() => referenceInputRef.current?.click()}
                            className="border-2 border-dashed border-sky-500/30 hover:border-sky-400 bg-sky-500/5 hover:bg-sky-500/10 rounded-2xl p-6 text-center cursor-pointer transition-all group"
                          >
                            <ImageIcon className="w-8 h-8 text-sky-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                            <p className="text-xs font-bold text-white uppercase tracking-wider">
                              Upload Reference Specimen
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Screenshot or crop of suspect, vehicle, or personal item (PNG, JPG)
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-400/40 flex items-center gap-3">
                              <div className="relative w-16 h-16 rounded-lg bg-black overflow-hidden border border-sky-400/50 shrink-0">
                                <img
                                  src={referencePreview}
                                  alt="Target Specimen"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-sky-400 text-black">
                                    SPECIMEN LOADED
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-white truncate mt-1">
                                  {referenceFile?.name}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {referenceFile ? roundNumber(referenceFile.size / 1024, 1) : 0} KB
                                </p>
                              </div>
                              <button
                                onClick={handleClearReference}
                                className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-colors"
                                title="Remove reference"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Reference Similarity Gate Slider */}
                            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400 font-bold uppercase tracking-wider">
                                  Similarity Verification Gate:
                                </span>
                                <span className="font-mono text-sky-400 font-bold">
                                  {Math.round(referenceThreshold * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.30"
                                max="0.85"
                                step="0.02"
                                value={referenceThreshold}
                                onChange={(e) => setReferenceThreshold(parseFloat(e.target.value))}
                                className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                              />
                            </div>

                            {/* Action Button */}
                            <button
                              onClick={handleReferenceSearch}
                              disabled={referenceLoading || !selectedVideo}
                              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                            >
                              {referenceLoading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span>Comparing Deep Visual Embeddings...</span>
                                </>
                              ) : (
                                <>
                                  <Crosshair className="w-4 h-4" />
                                  <span>Scan Surveillance for Appearance</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Telemetry Gauge Bar */}
                    {indexingTelemetry && (
                      <div className="pt-2 border-t border-white/10 text-[10px] text-slate-400 font-mono space-y-1">
                        <div className="flex justify-between">
                          <span>Adaptive Samples: {indexingTelemetry.sampled_frames}</span>
                          <span className="text-emerald-400">dHash Pruned: {indexingTelemetry.pruned_static_pct}% static</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Retained Keyframes: {indexingTelemetry.retained_frames}</span>
                          <span>Appearance Entities: {indexingTelemetry.embeddings_count || indexingTelemetry.retained_frames}</span>
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

                      {/* AI Forensic Brief (Grounded Multimodal Reasoning) */}
                      {forensicResult.status === "VERIFIED" && forensicResult.forensic_brief && (
                        <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 backdrop-blur-xl shadow-lg relative overflow-hidden">
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
                            <span className="text-xs font-black uppercase tracking-wider text-sky-300">
                              Forensic Intelligence Synthesis
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 ml-auto">
                              Grounded Citations
                            </span>
                          </div>
                          <div className="text-xs text-slate-200 leading-relaxed">
                            {renderClickableBrief(forensicResult.forensic_brief)}
                          </div>
                        </div>
                      )}

                      {/* Spatial Quadrant Filter Buttons */}
                      {forensicResult.matches.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                              <Compass className="w-3.5 h-3.5 text-sky-400" />
                              Spatial Zone Filter:
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Showing {displayedMatches.length} of {forensicResult.matches.length}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {QUADRANTS.map((quad) => (
                              <button
                                key={quad}
                                onClick={() => setSelectedQuadrant(quad)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                  selectedQuadrant === quad
                                    ? "bg-sky-500 text-white shadow-[0_0_10px_rgba(56,189,248,0.4)]"
                                    : "bg-white/5 text-slate-400 hover:text-white"
                                }`}
                              >
                                {quad}
                              </button>
                            ))}
                          </div>

                          {/* Evidence Match Cards */}
                          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                            {displayedMatches.map((match, idx) => {
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
                                          {match.class_name} {match.dominant_color !== "unknown" ? `(${match.dominant_color})` : ""}
                                        </span>
                                        <span className="text-[10px] font-bold font-mono text-emerald-400">
                                          {match.confidence}% {match.similarity_score !== undefined ? "SIMILARITY" : "CONF"}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                                        {match.rationale}
                                      </p>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/5">
                                      <span className="text-[10px] text-slate-400 font-mono bg-white/5 px-1.5 py-0.5 rounded">
                                        {match.quadrant}
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
                        </div>
                      )}

                      {/* Forensic Copilot Follow-Up Q&A Drawer */}
                      {forensicResult.status === "VERIFIED" && (
                        <div className="p-4 rounded-2xl bg-[#0b0d14]/90 border border-white/10 space-y-3">
                          <button
                            onClick={() => setChatOpen(!chatOpen)}
                            className="flex items-center justify-between w-full text-xs font-bold text-slate-300 hover:text-white transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                              Investigator Q&A Copilot
                            </span>
                            <span className="text-[10px] text-sky-400 underline">
                              {chatOpen ? "Collapse Q&A" : "Ask Follow-Up Question"}
                            </span>
                          </button>

                          <AnimatePresence>
                            {chatOpen && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-3 pt-2"
                              >
                                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                                  {chatMessages.map((msg, idx) => (
                                    <div
                                      key={idx}
                                      className={`p-2.5 rounded-xl text-xs ${
                                        msg.role === "user"
                                          ? "bg-sky-500/20 text-sky-100 ml-6 border border-sky-500/30"
                                          : "bg-white/5 text-slate-200 mr-6 border border-white/10"
                                      }`}
                                    >
                                      <span className="text-[9px] font-bold uppercase tracking-wider block mb-1 text-slate-400">
                                        {msg.role === "user" ? "Investigator" : "Randy Forensic Copilot"}
                                      </span>
                                      {renderClickableBrief(msg.text)}
                                    </div>
                                  ))}
                                  <div ref={chatBottomRef} />
                                </div>

                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                                    placeholder="e.g. 'When did the target enter center sector?'"
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-sky-500"
                                    disabled={chatLoading}
                                  />
                                  <button
                                    onClick={() => handleSendChatMessage()}
                                    disabled={chatLoading || !chatInput.trim()}
                                    className="p-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white transition-colors disabled:opacity-40"
                                  >
                                    {chatLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: LIVE CAMERA MESH MULTI-NODE RETRIEVAL (BACKWARD COMPAT)    */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {activeTab === "mesh" && (
          <div className="space-y-6">
            <div className="bg-[#0b0d14]/90 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-wider text-white">
                    Live Camera Mesh Semantic Search
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time cross-camera vector retrieval over active node snapshots
                  </p>
                </div>
                {backendStatus && (
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                    <Server className="w-3.5 h-3.5 text-sky-400" />
                    <span>Indexed Items: {backendStatus.total_items}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-sky-500">
                  <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleMeshSearch()}
                    placeholder="Search live camera mesh (e.g. 'person carrying luggage near gate 3')..."
                    className="w-full bg-transparent text-xs text-white placeholder-slate-400 outline-none"
                  />
                </div>
                <button
                  onClick={handleMeshSearch}
                  disabled={meshLoading || !query.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_16px_rgba(56,189,248,0.3)] disabled:opacity-50 flex items-center gap-2"
                >
                  {meshLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "SEARCH MESH"}
                </button>
              </div>
            </div>

            {/* Mesh Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {meshResults.map((hit, idx) => (
                <div
                  key={idx}
                  className="bg-[#0b0d14]/90 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-lg hover:border-sky-500/40 transition-all group"
                >
                  <div className="aspect-video bg-black relative">
                    {hit.image_url ? (
                      <img
                        src={resolveThumb(hit.image_url)}
                        alt="Camera Snapshot"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Eye className="w-8 h-8 opacity-40" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-sky-400 border border-white/10">
                      CAM: {hit.camera_id}
                    </div>
                  </div>
                  <div className="p-3.5 space-y-2">
                    <p className="text-xs text-slate-200 line-clamp-2 font-medium">
                      {hit.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-2 border-t border-white/5">
                      <span>{hit.timestamp}</span>
                      <span className="text-emerald-400 font-bold">{(1 - hit.distance).toFixed(2)} SIM</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
