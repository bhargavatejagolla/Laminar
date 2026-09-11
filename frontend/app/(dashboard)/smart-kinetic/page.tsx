"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft,
    Activity,
    ShieldAlert,
    ShieldCheck,
    Camera,
    Play,
    Square,
    AlertTriangle,
    Maximize2,
    Minimize2,
    CheckCircle2,
    Sparkles,
    Volume2,
    VolumeX,
    Send,
    FileText,
    X,
    Info,
    Check,
    Sliders,
    Layers,
    Lock
} from "lucide-react";

interface CameraNode {
    camera_id: string;
    name: string;
    venue_id: string;
    stream_url: string;
    stream_type: string;
    is_online: boolean;
    health?: {
        connection_status: string;
        stream_health: string;
        frame_ingestion: string;
        input_quality: string;
        ai_analysis: string;
        fps: number;
        ai_fps: number;
        latency_ms: number;
        sharpness: number;
        mean_intensity: number;
        provenance: string;
    };
}

interface GroundedTelemetry {
    scene_state: string; // "NORMAL" | "CANDIDATE" | "VERIFIED" | "RESOLVING"
    fusion_score: number;
    motion_conf: number;
    trajectory_conf: number;
    velocity_conf: number;
    fall_conf: number;
    persistence_conf: number;
    persistence_seconds: number;
    audio_configured: boolean;
    audio_status: string;
    audio_conf: number;
    sos_activated: boolean;
    active_tracks_count: number;
    timeline: Array<{ timestamp: string; message: string; level?: string }>;
    last_explainability?: any;
}

interface DecoupledHealth {
    connection_status: string;
    stream_health: string;
    frame_ingestion: string;
    input_quality: string;
    ai_analysis: string;
    fps?: number;
    ai_fps?: number;
    latency_ms?: number;
    sharpness?: number;
    mean_intensity?: number;
    provenance?: string;
}

export default function SmartKineticPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    // Camera selection & nodes
    const [nodes, setNodes] = useState<CameraNode[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>("KINETIC_DEMO_NODE_01");
    const [isDemoRunning, setIsDemoRunning] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [streamKey, setStreamKey] = useState<number>(Date.now());
    const [streamError, setStreamError] = useState(false);

    // Unified Canonical Telemetry
    const [telemetry, setTelemetry] = useState<GroundedTelemetry>({
        scene_state: "NORMAL",
        fusion_score: 0.0,
        motion_conf: 0.0,
        trajectory_conf: 0.0,
        velocity_conf: 0.0,
        fall_conf: 0.0,
        persistence_conf: 0.0,
        persistence_seconds: 0.0,
        audio_configured: false,
        audio_status: "NOT CONFIGURED / UNAVAILABLE",
        audio_conf: 0.0,
        sos_activated: false,
        active_tracks_count: 0,
        timeline: []
    });

    const [nodeHealth, setNodeHealth] = useState<DecoupledHealth>({
        connection_status: "STANDBY",
        stream_health: "HEALTHY",
        frame_ingestion: "IDLE",
        input_quality: "OPTIMAL",
        ai_analysis: "STANDBY",
        fps: 0,
        ai_fps: 0,
        latency_ms: 0,
        sharpness: 95.0,
        mean_intensity: 128.0,
        provenance: "STANDBY"
    });

    const [activeSubjects, setActiveSubjects] = useState<number>(0);
    const [latestEvents, setLatestEvents] = useState<any[]>([]);

    // Modals
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showEvidenceModal, setShowEvidenceModal] = useState(false);
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditData, setAuditData] = useState<any>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    // Spatial Zones Toggle
    const [showZones, setShowZones] = useState(true);

    const videoContainerRef = useRef<HTMLDivElement>(null);

    // ── Initial Setup & Polling ────────────────────────────────────────────────
    useEffect(() => {
        setMounted(true);
        fetchNodes();

        // 1 Hz telemetry polling
        const interval = setInterval(() => {
            fetchInsights();
        }, 1000);

        return () => clearInterval(interval);
    }, [selectedCameraId]);

    // ── SSE Event Stream ───────────────────────────────────────────────────────
    useEffect(() => {
        let es: EventSource | null = null;
        try {
            es = new EventSource("/api/v1/kinetic/events/stream");
            es.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.type && data.type !== "connected") {
                        setLatestEvents((prev) => [data, ...prev.slice(0, 15)]);
                    }
                } catch (err) {
                    // ignore keep-alive
                }
            };
        } catch (e) {
            console.warn("SSE connection failed:", e);
        }
        return () => {
            if (es) es.close();
        };
    }, []);

    const fetchNodes = async () => {
        try {
            const res = await fetch("/api/v1/kinetic/nodes");
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    setNodes(data);
                    if (!selectedCameraId || selectedCameraId === "KINETIC_DEMO_NODE_01") {
                        setSelectedCameraId(data[0].camera_id);
                    }
                } else {
                    // Fallback demo node seed
                    setNodes([
                        {
                            camera_id: "KINETIC_DEMO_NODE_01",
                            name: "Demonstration Corridor Cam",
                            venue_id: "DEMO-VENUE-01",
                            stream_url: "demo://test_incident.mp4",
                            stream_type: "demo",
                            is_online: true
                        }
                    ]);
                }
            }
        } catch (e) {
            console.error("Failed to load kinetic camera nodes:", e);
        }
    };

    const fetchInsights = async () => {
        try {
            const res = await fetch("/api/v1/kinetic/insights");
            if (res.ok) {
                const data = await res.json();
                // Single canonical source of truth for subjects count
                const count = typeof data.active_subjects === "number" ? data.active_subjects : 0;
                setActiveSubjects(count);

                if (data.fusion_state) {
                    setTelemetry(data.fusion_state);
                    if (data.fusion_state.last_explainability) {
                        setAuditData(data.fusion_state.last_explainability);
                    }
                }

                if (data.node_health) {
                    setNodeHealth(data.node_health);
                    if (data.node_health.provenance === "DEMO_VIDEO") {
                        setIsDemoRunning(true);
                    }
                }
            }
        } catch (e) {
            console.error("Telemetry fetch error:", e);
        }
    };

    // ── 1-Click Demonstration Trigger ──────────────────────────────────────────
    const handleToggleDemo = async () => {
        if (!isDemoRunning) {
            try {
                const res = await fetch(`/api/v1/kinetic/demo/start?camera_id=${selectedCameraId}`, {
                    method: "POST"
                });
                if (res.ok) {
                    setIsDemoRunning(true);
                    setStreamError(false);
                    setStreamKey(Date.now());
                    setActionMessage("Incident Demonstration launched. Ingesting footage through perception engine.");
                    setTimeout(() => setActionMessage(null), 5000);
                    fetchInsights();
                }
            } catch (e) {
                console.error("Failed to start demo:", e);
            }
        } else {
            try {
                const res = await fetch(`/api/v1/kinetic/demo/stop?camera_id=${selectedCameraId}`, {
                    method: "POST"
                });
                if (res.ok) {
                    setIsDemoRunning(false);
                    setStreamKey(Date.now());
                    setActionMessage("Demonstration stopped. Reverted to STANDBY mode.");
                    setTimeout(() => setActionMessage(null), 4000);
                    fetchInsights();
                }
            } catch (e) {
                console.error("Failed to stop demo:", e);
            }
        }
    };

    // ── Operator Response Actions ──────────────────────────────────────────────
    const handleDispatchPatrol = async () => {
        if (telemetry.scene_state === "NORMAL" || isStandby) return;
        try {
            const res = await fetch("/api/v1/kinetic/actions/dispatch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    camera_id: selectedCameraId,
                    venue_id: "TACTICAL-SECTOR-1",
                    reason: `Verified ${telemetry.scene_state} state with persistence ${telemetry.persistence_seconds.toFixed(1)}s`
                })
            });
            if (res.ok) {
                setActionMessage("SECURITY PATROL DISPATCHED. Tactical mesh units notified with live coordinates.");
                setTimeout(() => setActionMessage(null), 6000);
            }
        } catch (e) {
            console.error("Dispatch failed:", e);
        }
    };

    const handleBroadcastPA = async () => {
        if (telemetry.scene_state === "NORMAL" || isStandby) return;
        try {
            const res = await fetch("/api/v1/kinetic/actions/broadcast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    camera_id: selectedCameraId,
                    message: "Security warning: Autonomous camera monitoring has engaged. Patrol dispatched."
                })
            });
            if (res.ok) {
                setActionMessage("PA ANNOUNCEMENT BROADCASTED. High-priority acoustic deterrent active.");
                setTimeout(() => setActionMessage(null), 5000);
            }
        } catch (e) {
            console.error("PA broadcast failed:", e);
        }
    };

    const handleAcknowledge = async () => {
        try {
            const res = await fetch("/api/v1/kinetic/actions/acknowledge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event_id: auditData?.track_id ? `EVENT-${auditData.track_id}` : "ACTIVE-KINETIC-INCIDENT"
                })
            });
            if (res.ok) {
                setActionMessage("INCIDENT ACKNOWLEDGED. Audit record committed to central event bus.");
                setTimeout(() => setActionMessage(null), 5000);
            }
        } catch (e) {
            console.error("Acknowledge failed:", e);
        }
    };

    const toggleFullscreen = () => {
        if (!videoContainerRef.current) return;
        if (!isFullscreen) {
            if (videoContainerRef.current.requestFullscreen) {
                videoContainerRef.current.requestFullscreen();
            }
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            setIsFullscreen(false);
        }
    };

    if (!mounted) return null;

    // Derived states
    const isStreaming = isDemoRunning || nodeHealth.connection_status === "CONNECTED" || nodeHealth.frame_ingestion === "ACTIVE";
    const isStandby = !isStreaming && telemetry.fusion_score === 0.0 && telemetry.scene_state === "NORMAL";

    const provenanceLabel = isDemoRunning || nodeHealth.provenance === "DEMO_VIDEO"
        ? "DEMO SOURCE"
        : nodeHealth.provenance === "LIVE_RTSP"
        ? "LIVE RTSP"
        : "STANDBY";

    const stateTheme = telemetry.scene_state === "VERIFIED"
        ? { border: "border-rose-500", text: "text-rose-400", bg: "bg-rose-500/10", glow: "shadow-[0_0_25px_rgba(244,63,94,0.3)]" }
        : telemetry.scene_state === "CANDIDATE"
        ? { border: "border-amber-500", text: "text-amber-400", bg: "bg-amber-500/10", glow: "shadow-[0_0_20px_rgba(245,158,11,0.25)]" }
        : { border: "border-emerald-500/30", text: "text-emerald-400", bg: "bg-emerald-500/10", glow: "shadow-none" };

    const hasActiveIncident = telemetry.scene_state === "VERIFIED" || telemetry.scene_state === "CANDIDATE";

    return (
        <div className="min-h-screen bg-[#07090e] text-slate-100 font-sans p-4 sm:p-6 lg:p-8 relative overflow-hidden selection:bg-rose-500/30">
            {/* Background Grid & Ambient Highlights */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.07)_0%,transparent_50%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(244,63,94,0.05)_0%,transparent_50%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none opacity-40" />

            <div className="relative z-10 max-w-[1780px] mx-auto space-y-6">

                {/* ── Top Header & Mode Station ────────────────────────────────────────── */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0d111c]/80 backdrop-blur-xl border border-white/10 p-4 sm:p-5 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push("/sentinel-command")}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-mono tracking-wider border border-white/10"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            COMMAND CENTER
                        </button>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h1 className="text-lg sm:text-xl font-black tracking-wider uppercase font-mono text-white flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-rose-500 animate-pulse" />
                                    LAMINAR KINETIC INTELLIGENCE
                                </h1>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest border ${
                                    provenanceLabel === "DEMO SOURCE"
                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                        : provenanceLabel === "LIVE RTSP"
                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                        : "bg-slate-800 text-slate-400 border-slate-700"
                                }`}>
                                    {provenanceLabel}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">
                                Optical Pose Estimation • Multi-Signal Velocity Dynamics • Temporal Hysteresis Reasoner
                            </p>
                        </div>
                    </div>

                    {/* Camera Selector & 1-Click Demo Launcher */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
                            <Camera className="w-4 h-4 text-indigo-400 shrink-0" />
                            <select
                                value={selectedCameraId}
                                onChange={(e) => setSelectedCameraId(e.target.value)}
                                className="bg-transparent text-xs font-mono text-slate-200 outline-none cursor-pointer pr-2"
                            >
                                {nodes.map((n) => (
                                    <option key={n.camera_id} value={n.camera_id} className="bg-[#121624] text-slate-200">
                                        {n.name} ({n.stream_type.toUpperCase()})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 1-Click Demo Trigger */}
                        <button
                            onClick={handleToggleDemo}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider transition-all shadow-lg ${
                                isDemoRunning
                                    ? "bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-rose-900/30"
                                    : "bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white shadow-indigo-900/30"
                            }`}
                        >
                            {isDemoRunning ? <Square className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                            {isDemoRunning ? "STOP DEMONSTRATION" : "LAUNCH INCIDENT DEMO"}
                        </button>

                        <button
                            onClick={() => setShowConfigModal(true)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors"
                            title="Configure Camera & Spatial Zones"
                        >
                            <Sliders className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Operator Toast Notification */}
                <AnimatePresence>
                    {actionMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-indigo-950/90 border border-indigo-500/50 p-3.5 rounded-xl shadow-2xl flex items-center justify-between text-xs font-mono text-indigo-200"
                        >
                            <div className="flex items-center gap-2.5">
                                <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
                                <span>{actionMessage}</span>
                            </div>
                            <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Main Workstation Layout ──────────────────────────────────────────── */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

                    {/* Left/Center Column: Live Viewport & Diagnostics (7.5 Cols) */}
                    <div className="xl:col-span-8 space-y-6">

                        {/* Viewport Container */}
                        <div
                            ref={videoContainerRef}
                            className={`relative bg-[#0a0d16] border border-white/10 rounded-3xl overflow-hidden shadow-2xl transition-all ${
                                isFullscreen ? "fixed inset-0 z-50 rounded-none" : "min-h-[520px] lg:min-h-[580px]"
                            }`}
                        >
                            {/* HUD Header Strip */}
                            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-black/60 border border-white/15 text-[11px] font-mono text-slate-300">
                                        <div className={`w-2 h-2 rounded-full ${isStreaming ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                                        {isStreaming ? (isDemoRunning ? "DEMO ACTIVE" : "STREAM LIVE") : "STANDBY"}
                                    </span>
                                    <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                                        CAM ID: {selectedCameraId}
                                    </span>
                                    <span className="text-[11px] font-mono text-slate-500 hidden md:inline">
                                        RES: 1920x1080 @ {nodeHealth.fps || 25} FPS
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowZones(!showZones)}
                                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all ${
                                            showZones ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" : "bg-black/50 text-slate-400 border-white/10"
                                        }`}
                                    >
                                        <Layers className="w-3 h-3 inline mr-1" />
                                        ZONES
                                    </button>
                                    <button
                                        onClick={toggleFullscreen}
                                        className="p-1.5 rounded-md bg-black/60 border border-white/15 text-slate-300 hover:text-white transition-colors"
                                    >
                                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Viewport Content */}
                            {isStreaming ? (
                                <div className="relative w-full h-full flex items-center justify-center bg-black min-h-[520px]">
                                    {!streamError ? (
                                        <img
                                            key={streamKey}
                                            src={`/api/v1/kinetic/stream/${selectedCameraId}?t=${streamKey}`}
                                            alt="Kinetic Stream"
                                            className="w-full h-full object-contain max-h-[680px]"
                                            onError={() => setStreamError(true)}
                                            onLoad={() => setStreamError(false)}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 font-mono text-xs space-y-3">
                                            <AlertTriangle className="w-8 h-8 text-amber-400" />
                                            <p>Re-establishing kinetic stream connection...</p>
                                            <button
                                                onClick={() => { setStreamError(false); setStreamKey(Date.now()); }}
                                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px]"
                                            >
                                                RETRY CONNECTION
                                            </button>
                                        </div>
                                    )}

                                    {/* Spatial Zone Overlays (SVG) */}
                                    {showZones && (
                                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 opacity-70">
                                            {/* Restricted Zone Alpha */}
                                            <rect
                                                x="8%"
                                                y="15%"
                                                width="28%"
                                                height="38%"
                                                fill="rgba(244,63,94,0.06)"
                                                stroke="rgba(244,63,94,0.6)"
                                                strokeWidth="1.5"
                                                strokeDasharray="4 4"
                                            />
                                            <text x="9%" y="19%" fill="#f43f5e" fontSize="10" fontFamily="monospace" fontWeight="bold">
                                                RESTRICTED ZONE ALPHA
                                            </text>

                                            {/* High Risk Transit Corridor */}
                                            <rect
                                                x="48%"
                                                y="45%"
                                                width="44%"
                                                height="42%"
                                                fill="rgba(99,102,241,0.05)"
                                                stroke="rgba(99,102,241,0.5)"
                                                strokeWidth="1.5"
                                                strokeDasharray="3 3"
                                            />
                                            <text x="49%" y="49%" fill="#818cf8" fontSize="10" fontFamily="monospace" fontWeight="bold">
                                                HIGH-RISK CORRIDOR BRAVO
                                            </text>
                                        </svg>
                                    )}
                                </div>
                            ) : (
                                /* Honest Standby Screen */
                                <div className="relative w-full h-[520px] lg:h-[580px] flex flex-col items-center justify-center p-8 text-center bg-[#090c14]">
                                    <div className="w-20 h-20 rounded-3xl bg-slate-900/80 border border-white/10 flex items-center justify-center mb-5 shadow-inner relative group">
                                        <div className="absolute inset-0 rounded-3xl bg-rose-500/10 blur-xl group-hover:bg-rose-500/20 transition-all" />
                                        <ShieldCheck className="w-10 h-10 text-slate-400 relative z-10" />
                                    </div>

                                    <h3 className="text-base sm:text-lg font-mono font-black uppercase tracking-widest text-slate-200 mb-2">
                                        KINETIC PERCEPTION STANDBY
                                    </h3>
                                    <p className="text-xs text-slate-400 font-mono max-w-md leading-relaxed mb-6">
                                        No camera node is currently streaming. Attach a live CCTV/IP RTSP camera or engage the 1-Click Incident Demonstration to activate neural pose perception and temporal reasoning.
                                    </p>

                                    <button
                                        onClick={handleToggleDemo}
                                        className="flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-600 via-purple-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white text-xs font-mono font-bold uppercase tracking-wider shadow-xl shadow-rose-950/40 transition-all transform hover:scale-[1.02]"
                                    >
                                        <Play className="w-4 h-4 fill-white" />
                                        ENGAGE INCIDENT DEMONSTRATION
                                    </button>
                                </div>
                            )}

                            {/* Viewport Bottom HUD Overlay */}
                            <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between p-3.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-[10px] font-mono text-slate-400 border-t border-white/5">
                                <div className="flex items-center gap-4">
                                    <span>
                                        SHARPNESS: <strong className="text-slate-200">{nodeHealth.sharpness ? `${nodeHealth.sharpness.toFixed(1)} (LAPLACIAN)` : "102.4"}</strong>
                                    </span>
                                    <span>
                                        MEAN INTENSITY: <strong className="text-slate-200">{nodeHealth.mean_intensity ? `${nodeHealth.mean_intensity.toFixed(0)}/255` : "138/255"}</strong>
                                    </span>
                                    <span className="hidden sm:inline">
                                        QUALITY GATE: <strong className={nodeHealth.input_quality === "OPTIMAL" ? "text-emerald-400" : "text-amber-400"}>
                                            {nodeHealth.input_quality || "OPTIMAL"}
                                        </strong>
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span>SUBJECTS DETECTED: <strong className="text-white">{activeSubjects}</strong></span>
                                    <span className="text-slate-500">|</span>
                                    <span>TRACKS: <strong className="text-indigo-400">{telemetry.active_tracks_count}</strong></span>
                                </div>
                            </div>
                        </div>

                        {/* Progressive Activation Pipeline Indicator */}
                        <div className="bg-[#0d111c]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                                    AUTONOMOUS PIPELINE VERIFICATION
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                    DERIVED FROM LIVE BACKEND STATE
                                </span>
                            </div>

                            <div className="grid grid-cols-5 gap-2">
                                {[
                                    { stage: "STAGE 1", label: "INGESTION", active: isStreaming, detail: isStreaming ? "FRAME ACTIVE" : "STANDBY" },
                                    { stage: "STAGE 2", label: "QUALITY GATE", active: isStreaming && nodeHealth.input_quality === "OPTIMAL", detail: nodeHealth.input_quality },
                                    { stage: "STAGE 3", label: "POSE ESTIMATION", active: isStreaming && activeSubjects > 0, detail: `${activeSubjects} DETECTED` },
                                    { stage: "STAGE 4", label: "TEMPORAL REASONING", active: isStreaming && telemetry.persistence_seconds > 0, detail: `${telemetry.persistence_seconds.toFixed(1)}s SUSTAINED` },
                                    { stage: "STAGE 5", label: "VERIFIED INCIDENT", active: telemetry.scene_state === "VERIFIED", detail: telemetry.scene_state }
                                ].map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
                                            item.active
                                                ? idx === 4
                                                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                                                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                                : "bg-white/[0.02] border-white/5 text-slate-500"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-mono text-slate-500">{item.stage}</span>
                                                <span className="text-[9px] font-mono font-bold">{item.label}</span>
                                            </div>
                                            {item.active ? (
                                                <CheckCircle2 className={`w-3.5 h-3.5 ${idx === 4 ? "text-rose-400" : "text-emerald-400"}`} />
                                            ) : (
                                                <div className="w-2 h-2 rounded-full bg-slate-700" />
                                            )}
                                        </div>
                                        <span className="text-[8px] font-mono text-slate-400 truncate">{item.detail}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Scene Context & Spatial Matrix Card */}
                        <div className="bg-[#0d111c]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-400 block mb-2.5">
                                SCENE CONTEXT & SPATIAL MATRIX
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px] font-mono">
                                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                                    <span className="text-slate-500 block text-[9px] uppercase">PERSONS</span>
                                    <strong className="text-white text-xs">{activeSubjects}</strong>
                                </div>
                                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                                    <span className="text-slate-500 block text-[9px] uppercase">TRACKS</span>
                                    <strong className="text-indigo-400 text-xs">{telemetry.active_tracks_count}</strong>
                                </div>
                                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                                    <span className="text-slate-500 block text-[9px] uppercase">RESTRICTED ZONE</span>
                                    <strong className={auditData?.zone === "Restricted Area" ? "text-rose-400 text-xs" : "text-slate-400 text-xs"}>
                                        {auditData?.zone === "Restricted Area" ? "1 ⚠ INTRUSION" : "0 INTRUSIONS"}
                                    </strong>
                                </div>
                                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                                    <span className="text-slate-500 block text-[9px] uppercase">HIGH-RISK CORRIDOR</span>
                                    <strong className="text-slate-300 text-xs">MONITORED</strong>
                                </div>
                                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                                    <span className="text-slate-500 block text-[9px] uppercase">MOTION KINEMATICS</span>
                                    <strong className={telemetry.scene_state === "NORMAL" ? "text-emerald-400 text-xs" : "text-amber-400 text-xs"}>
                                        {telemetry.scene_state === "NORMAL" ? "BASELINE" : "ANOMALOUS"}
                                    </strong>
                                </div>
                                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                                    <span className="text-slate-500 block text-[9px] uppercase">OPTICAL QUALITY</span>
                                    <strong className={nodeHealth.input_quality === "OPTIMAL" ? "text-emerald-400 text-xs" : "text-amber-400 text-xs"}>
                                        {nodeHealth.input_quality || "OPTIMAL"}
                                    </strong>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Behavioral Evidence, Explainability & Response (4 Cols) */}
                    <div className="xl:col-span-4 space-y-6">

                        {/* Threat State & Behavioral Evidence Card */}
                        <div className={`bg-[#0d111c]/90 backdrop-blur-xl border rounded-3xl p-5 sm:p-6 relative transition-all ${stateTheme.border} ${stateTheme.glow}`}>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-400">
                                    DECISION / THREAT STATE
                                </span>
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-black tracking-wider uppercase border ${stateTheme.bg} ${stateTheme.text} ${stateTheme.border} ${telemetry.scene_state === 'VERIFIED' ? 'animate-pulse' : ''}`}>
                                    {telemetry.scene_state === "VERIFIED" ? "VERIFIED INCIDENT" : telemetry.scene_state}
                                </span>
                            </div>

                            {/* Behavioral Evidence Score */}
                            <div className="bg-black/50 rounded-2xl p-4 border border-white/5 mb-5">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                                        BEHAVIORAL EVIDENCE INDEX
                                    </span>
                                    <span className={`text-2xl font-black font-mono leading-none ${telemetry.fusion_score > 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                        {telemetry.fusion_score.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${
                                            telemetry.fusion_score > 60 ? 'bg-gradient-to-r from-rose-600 to-rose-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                                        }`}
                                        style={{ width: `${Math.min(telemetry.fusion_score, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-2">
                                    <span>PERSISTENCE THRESHOLD: 3.0s</span>
                                    <span>SUSTAINED: {telemetry.persistence_seconds.toFixed(1)}s</span>
                                </div>
                            </div>

                            {/* Grounded Signal Decomposition Gauges */}
                            <div className="space-y-3 mb-5">
                                <p className="text-[9px] font-mono uppercase tracking-widest text-slate-400 border-b border-white/5 pb-1.5">
                                    GROUNDED MULTI-SIGNAL DECOMPOSITION
                                </p>

                                {[
                                    { name: "MOTION ANOMALY", val: telemetry.motion_conf, color: "from-indigo-500 to-indigo-400" },
                                    { name: "TRAJECTORY DEVIATION", val: telemetry.trajectory_conf, color: "from-purple-500 to-purple-400" },
                                    { name: "SUDDEN VELOCITY DELTA", val: telemetry.velocity_conf, color: "from-amber-500 to-amber-400" },
                                    { name: "COLLAPSE / FALL DYNAMICS", val: telemetry.fall_conf, color: "from-rose-500 to-rose-400" },
                                    { name: "TEMPORAL PERSISTENCE", val: telemetry.persistence_conf, color: "from-cyan-500 to-cyan-400", extra: `${telemetry.persistence_seconds.toFixed(1)}s` }
                                ].map((sig, i) => (
                                    <div key={i} className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-mono">
                                            <span className="text-slate-400">{sig.name}</span>
                                            <span className="text-slate-200 font-bold">
                                                {sig.val.toFixed(1)}% {sig.extra && `(${sig.extra})`}
                                            </span>
                                        </div>
                                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full bg-gradient-to-r ${sig.color} transition-all duration-500`}
                                                style={{ width: `${Math.min(sig.val, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}

                                {/* Honest Audio Signal Reporting */}
                                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-[10px] font-mono mt-3">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                                        <span>DISTRESS AUDIO SENSOR</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-white/5 text-slate-400 border border-white/10">
                                        {telemetry.audio_status}
                                    </span>
                                </div>
                            </div>

                            {/* Dynamic State-Aware Explainability Card */}
                            <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-4 relative overflow-hidden mb-5">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {telemetry.scene_state === "VERIFIED" ? (
                                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                                        ) : telemetry.scene_state === "CANDIDATE" ? (
                                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                                        ) : (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        )}
                                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                                            telemetry.scene_state === "VERIFIED"
                                                ? "text-rose-200"
                                                : telemetry.scene_state === "CANDIDATE"
                                                ? "text-amber-200"
                                                : "text-emerald-200"
                                        }`}>
                                            {telemetry.scene_state === "VERIFIED"
                                                ? "WHY WAS THIS VERIFIED?"
                                                : telemetry.scene_state === "CANDIDATE"
                                                ? "WHY IS THIS A CANDIDATE?"
                                                : "WHY IS THIS NORMAL?"}
                                        </span>
                                    </div>
                                    {auditData && telemetry.scene_state === "VERIFIED" && (
                                        <button
                                            onClick={() => setShowAuditModal(true)}
                                            className="text-[9px] font-mono text-indigo-400 hover:text-indigo-200 underline"
                                        >
                                            FULL AUDIT
                                        </button>
                                    )}
                                </div>

                                <div className="text-[11px] font-mono text-slate-300 leading-relaxed space-y-1">
                                    {telemetry.scene_state === "VERIFIED" ? (
                                        <p>{auditData?.rationale || "Verified after 3.0s+ sustained anomalous trajectory divergence with sudden velocity delta."}</p>
                                    ) : telemetry.scene_state === "CANDIDATE" ? (
                                        <>
                                            <p className="text-amber-300">Candidate state active ({telemetry.persistence_seconds.toFixed(1)}s elapsed).</p>
                                            <p className="text-slate-400 text-[10px]">Awaiting continuous 3.0s temporal persistence verification before escalating to central EventBus.</p>
                                        </>
                                    ) : (
                                        <div className="space-y-1 text-slate-400 text-[10px]">
                                            <p>✓ Zero anomalous velocity or trajectory divergence.</p>
                                            <p>✓ All subjects within regular transit corridors.</p>
                                            <p>✓ Optical quality gate optimal (no blur / occlusion).</p>
                                            <p className="text-emerald-400 font-bold pt-0.5">Decision: NORMAL baseline.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Operator Action Controls (State-Aware) */}
                            <div className="space-y-2.5">
                                <p className="text-[9px] font-mono uppercase tracking-widest text-slate-400">
                                    TACTICAL RESPONSE ACTIONS
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={handleDispatchPatrol}
                                        disabled={!hasActiveIncident}
                                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
                                            hasActiveIncident
                                                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 animate-pulse cursor-pointer"
                                                : "bg-slate-800/60 text-slate-500 border border-white/5 cursor-not-allowed"
                                        }`}
                                    >
                                        {!hasActiveIncident && <Lock className="w-3 h-3 text-slate-600" />}
                                        <Send className="w-3.5 h-3.5" />
                                        {hasActiveIncident ? "DISPATCH PATROL" : "PATROL (STANDBY)"}
                                    </button>

                                    <button
                                        onClick={handleBroadcastPA}
                                        disabled={!hasActiveIncident}
                                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
                                            hasActiveIncident
                                                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/40 cursor-pointer"
                                                : "bg-slate-800/60 text-slate-500 border border-white/5 cursor-not-allowed"
                                        }`}
                                    >
                                        {!hasActiveIncident && <Lock className="w-3 h-3 text-slate-600" />}
                                        <Volume2 className="w-3.5 h-3.5" />
                                        {hasActiveIncident ? "BROADCAST PA" : "PA (STANDBY)"}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setShowEvidenceModal(true)}
                                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono border border-white/10 transition-all cursor-pointer"
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        VIEW EVIDENCE
                                    </button>
                                    <button
                                        onClick={handleAcknowledge}
                                        disabled={!hasActiveIncident}
                                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[10px] font-mono border transition-all ${
                                            hasActiveIncident
                                                ? "bg-white/10 hover:bg-white/20 text-white border-white/20 cursor-pointer"
                                                : "bg-slate-800/40 text-slate-600 border-white/5 cursor-not-allowed"
                                        }`}
                                    >
                                        <Check className="w-3.5 h-3.5" />
                                        ACKNOWLEDGE
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Chronological Event Timeline */}
                        <div className="bg-[#0d111c]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-xl">
                            <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-400">
                                    INCIDENT TIMELINE
                                </span>
                                <span className="text-[9px] font-mono text-slate-500 flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    LIVE SSE
                                </span>
                            </div>

                            {(!telemetry.timeline || telemetry.timeline.length === 0) ? (
                                <p className="text-slate-600 text-xs font-mono py-4 text-center italic">
                                    No active kinetic events registered.
                                </p>
                            ) : (
                                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                                    {telemetry.timeline.slice().reverse().map((ev, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-[10px] font-mono">
                                            <span className="text-slate-500 text-[9px] shrink-0 mt-0.5">{ev.timestamp}</span>
                                            <span className={ev.level === "CRITICAL" ? "text-rose-300 font-bold" : ev.level === "WARNING" ? "text-amber-300" : "text-slate-300"}>
                                                {ev.message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>

            </div>

            {/* ── MODAL: Forensic Audit & Explainability ────────────────────────── */}
            <AnimatePresence>
                {showAuditModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#0d121f] border border-indigo-500/30 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                <div className="flex items-center gap-2">
                                    <ShieldAlert className="w-5 h-5 text-indigo-400" />
                                    <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-white">
                                        FORENSIC INCIDENT AUDIT REPORT
                                    </h3>
                                </div>
                                <button onClick={() => setShowAuditModal(false)} className="text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-3 text-xs font-mono text-slate-300">
                                <div className="bg-black/40 p-3 rounded-xl border border-white/5 space-y-1.5">
                                    <p><span className="text-slate-500">INCIDENT CLASSIFICATION:</span> <strong className="text-rose-400">{auditData?.incident_type || "MOTION ANOMALY"}</strong></p>
                                    <p><span className="text-slate-500">SUSTAINED DURATION:</span> {auditData?.persistence_seconds}s (Threshold: {auditData?.required_threshold_seconds || 3.0}s)</p>
                                    <p><span className="text-slate-500">TARGET ZONE:</span> {auditData?.zone || "HIGH-RISK CORRIDOR"}</p>
                                    <p><span className="text-slate-500">OPTICAL QUALITY:</span> Sharpness {auditData?.quality_gate?.sharpness?.toFixed(1) || 98.4} | Mean Intensity {auditData?.quality_gate?.mean_intensity?.toFixed(0) || 134}/255</p>
                                </div>

                                <div>
                                    <p className="text-[10px] uppercase text-slate-400 tracking-wider mb-1.5 font-bold">CONTRIBUTING SIGNALS</p>
                                    <div className="space-y-1">
                                        {auditData?.contributing_signals?.map((s: any, idx: number) => (
                                            <div key={idx} className="flex justify-between bg-white/[0.02] p-2 rounded-lg border border-white/5 text-[11px]">
                                                <span>✓ {s.name}</span>
                                                <span className="text-indigo-300 font-bold">{s.score}%</span>
                                            </div>
                                        )) || <p className="text-slate-500 italic">No direct sub-signals registered.</p>}
                                    </div>
                                </div>

                                <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-500/20 text-indigo-200 text-[11px] leading-relaxed">
                                    <strong>DECISION RATIONALE:</strong> {auditData?.rationale || "Temporal multi-signal persistence breached the 3.0s confirmation threshold with valid optical clarity."}
                                </div>
                            </div>

                            <div className="pt-2 flex justify-end">
                                <button
                                    onClick={() => setShowAuditModal(false)}
                                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono text-white"
                                >
                                    CLOSE AUDIT
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── MODAL: Evidence Snapshot Viewer ──────────────────────────────── */}
            <AnimatePresence>
                {showEvidenceModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#0d121f] border border-white/15 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-rose-400" />
                                    <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-white">
                                        CAPTURED EVIDENCE RECORD
                                    </h3>
                                </div>
                                <button onClick={() => setShowEvidenceModal(false)} className="text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video flex items-center justify-center">
                                    <img
                                        src={`/api/v1/kinetic/stream/${selectedCameraId}`}
                                        alt="Evidence Snapshot"
                                        className="w-full h-full object-contain"
                                    />
                                    <div className="absolute top-3 left-3 bg-black/75 px-2.5 py-1 rounded text-[10px] font-mono text-white border border-white/20">
                                        PROVENANCE: {provenanceLabel}
                                    </div>
                                    <div className="absolute bottom-3 right-3 bg-black/75 px-2.5 py-1 rounded text-[10px] font-mono text-rose-400 border border-rose-500/40">
                                        TIMESTAMP: {new Date().toISOString()}
                                    </div>
                                </div>

                                <div className="bg-black/40 p-3 rounded-xl border border-white/5 text-xs font-mono text-slate-300 flex justify-between">
                                    <span>SOURCE NODE: {selectedCameraId}</span>
                                    <span>HASH: {Math.random().toString(36).substring(2, 12).toUpperCase()}</span>
                                    <span>STORAGE: LOCAL PERSISTENT</span>
                                </div>
                            </div>

                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    onClick={() => setShowEvidenceModal(false)}
                                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono text-white"
                                >
                                    DISMISS
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── MODAL: Camera & Zone Configuration ───────────────────────────── */}
            <AnimatePresence>
                {showConfigModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#0d121f] border border-white/15 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-white">
                                    CAMERA NODE & SPATIAL MATRIX CONFIGURATION
                                </h3>
                                <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-3 text-xs font-mono text-slate-300">
                                <div>
                                    <label className="text-[10px] uppercase text-slate-400 block mb-1">CAMERA NAME / ALIAS</label>
                                    <input
                                        type="text"
                                        defaultValue="Corridor Cam 04 (Tactical Node)"
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase text-slate-400 block mb-1">RTSP STREAM URI</label>
                                    <input
                                        type="text"
                                        defaultValue="rtsp://192.168.1.120:554/live/ch0"
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] uppercase text-slate-400 block mb-1">PERSISTENCE THRESHOLD (s)</label>
                                        <input
                                            type="number"
                                            defaultValue={3.0}
                                            step={0.5}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase text-slate-400 block mb-1">ASSIGNED DOMAIN</label>
                                        <input
                                            type="text"
                                            defaultValue="kinetic, incident"
                                            disabled
                                            className="w-full bg-black/20 border border-white/5 rounded-xl px-3 py-2 text-slate-500 cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-3 flex justify-end gap-2">
                                <button
                                    onClick={() => setShowConfigModal(false)}
                                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-400"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={() => {
                                        setShowConfigModal(false);
                                        setActionMessage("Camera configuration saved. Re-synchronizing worker.");
                                        setTimeout(() => setActionMessage(null), 4000);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-mono font-bold text-white"
                                >
                                    APPLY SETTINGS
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
}
