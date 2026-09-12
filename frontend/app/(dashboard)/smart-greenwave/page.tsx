"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft,
    AlertTriangle,
    Cpu,
    Zap,
    UploadCloud,
    Siren,
    Clock,
    Activity,
    CheckCircle2,
    ShieldCheck,
    Navigation,
    Route,
    Radio,
    Compass,
    Sliders,
    Layers,
    Play,
    RotateCcw,
    Power,
    Check,
    Lock,
    ExternalLink,
    Video,
    ShieldAlert,
    Camera,
    Info,
    ChevronRight,
    Send
} from "lucide-react";

interface ScenarioItem {
    id: string;
    title: string;
    badge: string;
    category: string;
    risk_level: string;
    filename: string;
    duration_seconds: number;
    fps: number;
    resolution: string;
    description: string;
    expected_outcome: string;
    file_available: boolean;
    capabilities: {
        vehicle_detection: boolean;
        emergency_classification: boolean;
        beacon_analysis: string;
        tracking: boolean;
        route_prediction: boolean;
        signal_controller: string;
    };
}

interface CameraNode {
    id: string;
    name: string;
    stream_type: string;
    stream_url: string;
    venue_id: string;
}

export default function SmartGreenWavePage() {
    const { t } = useTranslation();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    // Source Lab & Stream States
    const [selectedSessionId, setSelectedSessionId] = useState<string>("GREENWAVE_DEMO_NODE_01");
    const [streamKey, setStreamKey] = useState<number>(Date.now());
    const [streamError, setStreamError] = useState(false);
    const [isDemoRunning, setIsDemoRunning] = useState(false);
    const [activeScenarioId, setActiveScenarioId] = useState<string>("ambulance_transit");
    const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
    const [liveCameras, setLiveCameras] = useState<CameraNode[]>([]);
    const [showSourceLabModal, setShowSourceLabModal] = useState(false);
    const [sourceLabTab, setSourceLabTab] = useState<"demo" | "live" | "upload">("demo");
    const [uploading, setUploading] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    // Operator Authorization Modal States
    const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
    const [operatorId, setOperatorId] = useState("OPERATOR_TRAFFIC_CHIEF");
    const [operatorNotes, setOperatorNotes] = useState("Authorized based on verified multi-frame ambulance persistence.");
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [authorizationAudit, setAuthorizationAudit] = useState<any>(null);

    // Live Telemetry States
    const [sceneState, setSceneState] = useState<string>("MONITORING");
    const [vehicleCount, setVehicleCount] = useState<number>(0);
    const [emergencyVehicles, setEmergencyVehicles] = useState<number>(0);
    const [candidateTrackId, setCandidateTrackId] = useState<string | null>(null);
    const [verifiedTrackId, setVerifiedTrackId] = useState<string | null>(null);
    const [persistenceSeconds, setPersistenceSeconds] = useState<number>(0.0);
    const [evidence, setEvidence] = useState<any>({
        vehicle_classification: 0.0,
        emergency_markings: 0.0,
        track_consistency: 0.0,
        temporal_consistency: 0.0,
        motion_consistency: 0.0,
        beacon_signal: "SUPPORTING (STATIC)",
        composite_confidence: 0.0,
        evidence_quality: "INSUFFICIENT",
        decision: "STANDBY - AWAITING CAMERA SIGNAL"
    });
    const [corridorPlan, setCorridorPlan] = useState<any>({
        corridor_id: "PVNR-CORRIDOR-01",
        corridor_name: "PVNR Expressway Corridor",
        city: "Hyderabad Smart City Core",
        junctions: [
            { id: "J1", name: "Mehdipatnam Junction (J1)", distance_meters: 220, dynamic_eta_sec: 16, clearance_recommendation: "STANDBY / NORMAL CYCLE", active: false },
            { id: "J2", name: "Attapur Crossing (J2)", distance_meters: 540, dynamic_eta_sec: 39, clearance_recommendation: "STANDBY / NORMAL CYCLE", active: false },
            { id: "J3", name: "Aramghar Junction (J3)", distance_meters: 980, dynamic_eta_sec: 67, clearance_recommendation: "STANDBY / NORMAL CYCLE", active: false }
        ],
        signal_controller: {
            status: "NOT CONNECTED (ADVISORY MODE)",
            protocol: "NTCIP-1202 / SCATS (ADVISORY)"
        }
    });
    const [activeTrack, setActiveTrack] = useState<any>(null);
    const [timeline, setTimeline] = useState<any[]>([]);

    useEffect(() => {
        setMounted(true);
        fetchScenarios();
        fetchLiveCameras();
        fetchTelemetry();

        // Engage initial demo scenario automatically
        handleSelectScenario("ambulance_transit");

        // Polling fallback every 1.5s
        const interval = setInterval(fetchTelemetry, 1500);

        // Connect SSE stream
        let es: EventSource | null = null;
        try {
            es = new EventSource(`/api/v1/greenwave/events/stream/${selectedSessionId}`);
            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.scene_state) setSceneState(data.scene_state);
                    if (data.vehicle_count !== undefined) setVehicleCount(data.vehicle_count);
                    if (data.emergency_vehicles !== undefined) setEmergencyVehicles(data.emergency_vehicles);
                    if (data.candidate_track_id !== undefined) setCandidateTrackId(data.candidate_track_id);
                    if (data.verified_track_id !== undefined) setVerifiedTrackId(data.verified_track_id);
                    if (data.persistence_seconds !== undefined) setPersistenceSeconds(data.persistence_seconds);
                    if (data.evidence) setEvidence(data.evidence);
                    if (data.corridor_plan) setCorridorPlan(data.corridor_plan);
                    if (data.active_track !== undefined) setActiveTrack(data.active_track);
                    if (data.timeline) setTimeline(data.timeline);
                } catch (err) {
                    console.error("SSE parse error:", err);
                }
            };
        } catch (e) {
            console.error("SSE connection error:", e);
        }

        return () => {
            clearInterval(interval);
            if (es) es.close();
        };
    }, []);

    const fetchScenarios = async () => {
        try {
            const res = await fetch("/api/v1/greenwave/scenarios");
            if (res.ok) {
                const data = await res.json();
                setScenarios(data);
            }
        } catch (e) {
            console.error("Failed to load scenarios:", e);
        }
    };

    const fetchLiveCameras = async () => {
        try {
            const res = await fetch("/api/v1/cameras");
            if (res.ok) {
                const data = await res.json();
                setLiveCameras(data);
            }
        } catch (e) {
            console.error("Failed to load cameras:", e);
        }
    };

    const fetchTelemetry = async () => {
        try {
            const res = await fetch(`/api/v1/greenwave/telemetry/${selectedSessionId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.scene_state) setSceneState(data.scene_state);
                if (data.vehicle_count !== undefined) setVehicleCount(data.vehicle_count);
                if (data.emergency_vehicles !== undefined) setEmergencyVehicles(data.emergency_vehicles);
                if (data.candidate_track_id !== undefined) setCandidateTrackId(data.candidate_track_id);
                if (data.verified_track_id !== undefined) setVerifiedTrackId(data.verified_track_id);
                if (data.persistence_seconds !== undefined) setPersistenceSeconds(data.persistence_seconds);
                if (data.evidence) setEvidence(data.evidence);
                if (data.corridor_plan) setCorridorPlan(data.corridor_plan);
                if (data.active_track !== undefined) setActiveTrack(data.active_track);
                if (data.timeline) setTimeline(data.timeline);
            }
        } catch (e) {
            console.error("Telemetry fetch error:", e);
        }
    };

    const handleSelectScenario = async (scId: string) => {
        try {
            const res = await fetch(`/api/v1/greenwave/demo/start?scenario_id=${scId}&camera_id=${selectedSessionId}`, {
                method: "POST"
            });
            if (res.ok) {
                setActiveScenarioId(scId);
                setIsDemoRunning(true);
                setStreamError(false);
                setStreamKey(Date.now());
                setShowSourceLabModal(false);
                const sc = scenarios.find((s) => s.id === scId);
                setActionMessage(`SCENARIO INGESTED: ${sc?.title || scId}. Running multi-signal vehicle perception and temporal tracking.`);
                setTimeout(() => setActionMessage(null), 5000);
                fetchTelemetry();
            }
        } catch (e) {
            console.error("Failed to start scenario:", e);
        }
    };

    const handleReplayScenario = async () => {
        try {
            const res = await fetch(`/api/v1/greenwave/demo/replay?camera_id=${selectedSessionId}`, {
                method: "POST"
            });
            if (res.ok) {
                setStreamKey(Date.now());
                setActionMessage("SCENARIO REPLAYED: Video rewound to frame 0. Temporal tracks, hysteresis, and candidate state reset.");
                setTimeout(() => setActionMessage(null), 4000);
                fetchTelemetry();
            }
        } catch (e) {
            console.error("Failed to replay scenario:", e);
        }
    };

    const handleStopSource = async () => {
        try {
            const res = await fetch(`/api/v1/greenwave/demo/stop?camera_id=${selectedSessionId}`, {
                method: "POST"
            });
            if (res.ok) {
                setIsDemoRunning(false);
                setStreamKey(Date.now());
                setActionMessage("SOURCE HALTED: Green Wave returned to clean STANDBY mode.");
                setTimeout(() => setActionMessage(null), 4000);
                fetchTelemetry();
            }
        } catch (e) {
            console.error("Failed to stop source:", e);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`/api/v1/greenwave/upload?camera_id=${selectedSessionId}`, {
                method: "POST",
                body: formData
            });
            if (res.ok) {
                setIsDemoRunning(true);
                setStreamError(false);
                setStreamKey(Date.now());
                setShowSourceLabModal(false);
                setActionMessage(`UPLOAD INGESTED: ${file.name}. Running downstream perception and temporal engine.`);
                setTimeout(() => setActionMessage(null), 5000);
                fetchTelemetry();
            }
        } catch (err) {
            console.error("Upload failed:", err);
        } finally {
            setUploading(false);
        }
    };

    const handleAuthorizeCorridor = async () => {
        setIsAuthorizing(true);
        try {
            const res = await fetch("/api/v1/greenwave/actions/authorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    camera_id: selectedSessionId,
                    corridor_id: corridorPlan.corridor_id,
                    operator_id: operatorId,
                    notes: operatorNotes,
                    action: "AUTHORIZE_CLEARANCE"
                })
            });
            if (res.ok) {
                const data = await res.json();
                setAuthorizationAudit(data.audit);
                setActionMessage("OPERATOR AUTHORIZATION LOGGED: Advisory clearance instructions generated.");
                setTimeout(() => setActionMessage(null), 6000);
            }
        } catch (e) {
            console.error("Authorization failed:", e);
        } finally {
            setIsAuthorizing(false);
        }
    };

    if (!mounted) return null;

    const activeScenario = scenarios.find((s) => s.id === activeScenarioId);
    const isVerified = sceneState === "VERIFIED" || sceneState === "TRANSIT ACTIVE";
    const isCandidate = sceneState === "CANDIDATE";

    return (
        <div className="relative min-h-screen w-full bg-[#070b10] text-slate-100 p-6 font-sans overflow-x-hidden">
            {/* Top Navigation & Operational Control Header */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push("/")}
                            className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-all shadow-sm"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono tracking-widest uppercase text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                                    EMERGENCY CORRIDOR INTELLIGENCE ENGINE
                                </span>
                                <span className="text-xs text-slate-500">•</span>
                                <span className="text-xs text-slate-400 font-mono">NODE: {selectedSessionId}</span>
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3 mt-0.5">
                                LAMINAR GREEN WAVE 2.0
                                <span className="text-xs font-normal px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-mono">
                                    CORRIDOR ADVISORY ACTIVE
                                </span>
                            </h1>
                        </div>
                    </div>

                    {/* Workstation Source Controls */}
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={() => setShowSourceLabModal(true)}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-medium transition-all shadow-sm hover:border-emerald-400"
                        >
                            <Video className="w-3.5 h-3.5" />
                            GREEN WAVE SOURCE LAB
                        </button>

                        <button
                            onClick={handleReplayScenario}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 text-slate-300 font-mono text-xs transition-all"
                            title="Rewind video and reset temporal engine"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            REPLAY
                        </button>

                        <button
                            onClick={handleStopSource}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40 text-rose-300 font-mono text-xs transition-all"
                            title="Halt source to clean standby"
                        >
                            <Power className="w-3.5 h-3.5" />
                            STANDBY
                        </button>
                    </div>
                </div>

                {/* Dynamic Scene Context Banner */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 flex items-center justify-between shadow-inner">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-400">
                            <Info className="w-4 h-4" />
                        </div>
                        <div className="text-xs">
                            <div className="flex items-center gap-2 font-mono">
                                <span className="text-slate-400">SOURCE CONTEXT:</span>
                                <span className="font-semibold text-white">
                                    {activeScenario?.title || "Custom Source Feed"}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    activeScenario?.category === "BASELINE"
                                        ? "bg-slate-800 text-slate-300 border border-slate-700"
                                        : "bg-rose-950/60 text-rose-300 border border-rose-800/50"
                                }`}>
                                    {activeScenario?.badge || "ACTIVE FEED"}
                                </span>
                            </div>
                            <p className="text-slate-400 mt-0.5 text-[11px]">
                                {activeScenarioId === "normal_traffic"
                                    ? "TESTED NEGATIVE CONTROL: Arterial highway traffic with ordinary vehicles. Evaluates zero verified emergency false positives."
                                    : activeScenarioId === "ambulance_transit"
                                    ? "HERO EMERGENCY TRANSIT: Real ambulance in congested corridor. Demonstrates multi-signal livery analysis, candidate flagging, persistence verification (≥3.0s), and dynamic road-graph junction clearance."
                                    : "Ingesting external video source through downstream perception, tracking, and road-graph prediction engine."}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-right font-mono text-xs">
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase">Perception Status</div>
                            <div className="text-emerald-400 font-medium">YOLOv11 + Multi-Signal Fusion</div>
                        </div>
                        <div className="h-6 w-px bg-slate-800" />
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase">Controller Status</div>
                            <div className="text-amber-400 font-medium">ADVISORY MODE (NOT CONNECTED)</div>
                        </div>
                    </div>
                </div>

                {/* Transient Action Message Banner */}
                {actionMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-950/70 text-emerald-200 px-4 py-2.5 text-xs font-mono flex items-center gap-2"
                    >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{actionMessage}</span>
                    </motion.div>
                )}
            </div>

            {/* 3-Column Workstation Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* ── Left Column: Video Viewport & Scene Matrix (Cols 1-5) ───────────── */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                    {/* Viewport Card */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-lg flex flex-col">
                        <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between font-mono text-xs">
                            <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="font-semibold text-slate-200">EMERGENCY VEHICLE DISCOVERY</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-400">
                                <span>CAM-ID: {selectedSessionId}</span>
                                <span>30 FPS</span>
                            </div>
                        </div>

                        {/* Stream Frame Container */}
                        <div className="relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
                            {!streamError ? (
                                <img
                                    key={streamKey}
                                    src={`/api/v1/greenwave/stream/${selectedSessionId}?t=${streamKey}`}
                                    alt="Laminar Green Wave Live Stream"
                                    className="w-full h-full object-cover"
                                    onError={() => setStreamError(true)}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center p-6 text-center">
                                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                                    <p className="text-xs font-mono text-slate-300">Re-establishing Green Wave stream connection...</p>
                                    <button
                                        onClick={() => {
                                            setStreamError(false);
                                            setStreamKey(Date.now());
                                        }}
                                        className="mt-3 px-3 py-1.5 rounded bg-slate-800 text-xs font-mono text-emerald-400 border border-slate-700"
                                    >
                                        RETRY STREAM
                                    </button>
                                </div>
                            )}

                            {/* Viewport Provenance Watermark */}
                            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/70 backdrop-blur border border-white/10 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
                                <Radio className="w-3 h-3 animate-pulse" />
                                LIVE FEED
                            </div>

                            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/70 backdrop-blur border border-white/10 text-[10px] font-mono text-slate-300">
                                {activeScenario?.title || "CUSTOM"}
                            </div>
                        </div>

                        {/* Viewport Bottom Telemetry Bar */}
                        <div className="p-3 bg-slate-950/60 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs font-mono">
                            <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800/80">
                                <div className="text-[10px] text-slate-400 uppercase">Live Vehicles In FOV</div>
                                <div className="text-lg font-bold text-white mt-0.5">{vehicleCount} <span className="text-xs font-normal text-slate-400">Tracked</span></div>
                            </div>
                            <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800/80">
                                <div className="text-[10px] text-slate-400 uppercase">Emergency Vehicles</div>
                                <div className={`text-lg font-bold mt-0.5 ${emergencyVehicles > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                    {emergencyVehicles} <span className="text-xs font-normal text-slate-400">{emergencyVehicles > 0 ? "Verified" : "None"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Scene Context & Spatial Matrix */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm flex flex-col gap-3 font-mono text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-2">
                                <Compass className="w-3.5 h-3.5 text-emerald-400" />
                                TRAJECTORY & SPEED CALIBRATION MATRIX
                            </span>
                            <span className="text-[10px] text-slate-500">HOMOGRAPHY GATE</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/60">
                                <div className="text-[10px] text-slate-500 uppercase">Direction of Travel</div>
                                <div className="text-sm font-bold text-slate-200 mt-1 flex items-center gap-1.5">
                                    <Navigation className="w-3.5 h-3.5 text-emerald-400 rotate-45" />
                                    {activeTrack?.direction || "STANDBY"}
                                </div>
                            </div>

                            <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/60">
                                <div className="text-[10px] text-slate-500 uppercase">Speed Velocity</div>
                                <div className="text-sm font-bold text-slate-200 mt-1">
                                    {activeTrack?.speed_kmh ? (
                                        <span className="text-emerald-400">{activeTrack.speed_kmh} km/h <span className="text-[9px] text-emerald-600 block font-normal">CALIBRATED</span></span>
                                    ) : (
                                        <span className="text-slate-300">{activeTrack?.speed_px_sec || 0} px/s <span className="text-[9px] text-amber-500/80 block font-normal">CALIBRATION REQ.</span></span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/60 flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">Target Track ID:</span>
                            <span className="font-bold text-emerald-400">{candidateTrackId || verifiedTrackId || "NO CANDIDATE"}</span>
                        </div>
                    </div>
                </div>

                {/* ── Center Column: Lifecycle State & Multi-Signal Evidence (Cols 6-8) ─ */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                    {/* Emergency Lifecycle State */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm flex flex-col gap-3 font-mono text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                                EMERGENCY LIFECYCLE ENGINE
                            </span>
                            <span className="text-[10px] text-slate-500">5-STAGE HYSTERESIS</span>
                        </div>

                        <div className="flex flex-col gap-2">
                            {[
                                { stage: "MONITORING", desc: "Arterial flow active. No emergency vehicle verified." },
                                { stage: "CANDIDATE", desc: "Vehicle detected with candidate emergency markings." },
                                { stage: "VERIFIED", desc: "Persistence satisfied (≥3.0s). Ambulance confirmed." },
                                { stage: "TRANSIT ACTIVE", desc: "Ambulance actively traversing the configured corridor." },
                                { stage: "RESOLVING", desc: "Emergency transit cleared. System returning to monitoring." }
                            ].map((s) => {
                                const isActive = sceneState === s.stage;
                                return (
                                    <div
                                        key={s.stage}
                                        className={`p-2.5 rounded-lg border transition-all ${
                                            isActive
                                                ? s.stage === "MONITORING"
                                                    ? "bg-emerald-950/50 border-emerald-600/60 text-emerald-300 shadow-sm"
                                                    : s.stage === "CANDIDATE"
                                                    ? "bg-amber-950/50 border-amber-600/60 text-amber-300 shadow-sm"
                                                    : "bg-rose-950/50 border-rose-600/60 text-rose-300 shadow-sm animate-pulse"
                                                : "bg-slate-950/30 border-slate-800/50 text-slate-500"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-[11px]">{s.stage}</span>
                                            {isActive && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                                        </div>
                                        <p className="text-[10px] mt-0.5 opacity-80">{s.desc}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Multi-Signal Evidence Fusion Card */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm flex flex-col gap-3 font-mono text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-2">
                                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                                AMBULANCE EVIDENCE FUSION
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                evidence.evidence_quality === "STRONG"
                                    ? "bg-rose-950 text-rose-300 border border-rose-800"
                                    : evidence.evidence_quality === "MODERATE"
                                    ? "bg-amber-950 text-amber-300 border border-amber-800"
                                    : "bg-slate-950 text-slate-400 border border-slate-800"
                            }`}>
                                {evidence.evidence_quality}
                            </span>
                        </div>

                        {/* Evidence Metric Bars */}
                        <div className="flex flex-col gap-2.5">
                            {[
                                { label: "Vehicle Classification", val: evidence.vehicle_classification },
                                { label: "Emergency Markings (Livery)", val: evidence.emergency_markings },
                                { label: "Track Consistency", val: evidence.track_consistency },
                                { label: "Temporal Consistency", val: evidence.temporal_consistency },
                                { label: "Motion Consistency", val: evidence.motion_consistency }
                            ].map((m) => (
                                <div key={m.label}>
                                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                        <span>{m.label}</span>
                                        <span className="text-slate-200 font-bold">{m.val}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${
                                                m.val > 70 ? "bg-rose-500" : m.val > 40 ? "bg-amber-500" : "bg-slate-700"
                                            }`}
                                            style={{ width: `${Math.min(100, Math.max(0, m.val))}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Beacon Activity (Supporting Signal) */}
                        <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/60 flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">Roof Beacon Strobe:</span>
                            <span className="font-semibold text-slate-200">{evidence.beacon_signal}</span>
                        </div>

                        {/* Decision Summary */}
                        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                            <div className="text-[10px] text-slate-500 uppercase">Current Decision</div>
                            <div className="font-bold text-white mt-0.5">{evidence.decision}</div>
                            <div className="text-[10px] text-slate-400 mt-1">
                                Persistence: <span className="text-emerald-400 font-bold">{persistenceSeconds}s</span> / 3.0s threshold
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Right Column: Corridor Road Graph & Signal Controller (Cols 9-12) ─ */}
                <div className="lg:col-span-3 flex flex-col gap-4">
                    {/* Road Graph & Corridor Plan Card */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm flex flex-col gap-3 font-mono text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-2">
                                <Route className="w-3.5 h-3.5 text-emerald-400" />
                                CORRIDOR ROAD GRAPH
                            </span>
                            <span className="text-[10px] text-slate-500">PVNR CORRIDOR</span>
                        </div>

                        <div className="text-[11px] text-slate-400 mb-1">
                            Upcoming junction pre-emption recommendations:
                        </div>

                        <div className="flex flex-col gap-2">
                            {corridorPlan?.junctions?.map((j: any) => (
                                <div
                                    key={j.id}
                                    className={`p-3 rounded-lg border flex flex-col gap-1 transition-all ${
                                        j.active
                                            ? "bg-rose-950/40 border-rose-600/50 text-rose-200"
                                            : "bg-slate-950/60 border-slate-800/60 text-slate-400"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-[11px] text-white">{j.name}</span>
                                        <span className="text-[10px] font-bold text-emerald-400">{j.dynamic_eta_sec}s ETA</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>Dist: {j.distance_meters}m</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                            j.active ? "bg-rose-900/60 text-rose-300" : "bg-slate-800 text-slate-400"
                                        }`}>
                                            {j.clearance_recommendation}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Signal Controller Status (Scientifically Honest) */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm flex flex-col gap-3 font-mono text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-2">
                                <Radio className="w-3.5 h-3.5 text-amber-400" />
                                SIGNAL CONTROLLER STATUS
                            </span>
                            <span className="text-[10px] text-amber-400">ADVISORY</span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200/90 leading-relaxed">
                            <p className="font-bold text-amber-300 mb-0.5">CONTROLLER: NOT CONNECTED</p>
                            Green Wave operates in <strong>Recommendation & Advisory Pre-Emption Mode</strong>. No municipal signal hardware is directly controlled.
                        </div>

                        <div className="text-[10px] text-slate-400 flex flex-col gap-1">
                            <div>Protocol: <span className="text-slate-200">NTCIP-1202 / SCATS (Simulated)</span></div>
                            <div>Corridor Node: <span className="text-slate-200">{corridorPlan?.corridor_id}</span></div>
                        </div>
                    </div>

                    {/* Operator Authorization Gate */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm flex flex-col gap-3 font-mono text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-2">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                OPERATOR AUTHORIZATION GATE
                            </span>
                        </div>

                        <p className="text-[11px] text-slate-400">
                            Execution of corridor pre-emption requires deliberate operator authorization with an immutable audit log.
                        </p>

                        <button
                            disabled={!isVerified}
                            onClick={() => setShowAuthorizeModal(true)}
                            className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs font-mono transition-all flex items-center justify-center gap-2 ${
                                isVerified
                                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 animate-pulse cursor-pointer"
                                    : "bg-slate-800/60 text-slate-500 border border-slate-700/40 cursor-not-allowed"
                            }`}
                        >
                            {isVerified ? (
                                <>
                                    <Siren className="w-4 h-4" />
                                    AUTHORIZE CORRIDOR CLEARANCE
                                </>
                            ) : (
                                <>
                                    <Lock className="w-3.5 h-3.5" />
                                    CORRIDOR PRE-EMPTION (STANDBY)
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Green Wave Source Lab Modal ────────────────────────────────────────── */}
            <AnimatePresence>
                {showSourceLabModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl font-mono text-xs flex flex-col gap-5"
                        >
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div>
                                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                                        <Video className="w-4 h-4 text-emerald-400" />
                                        GREEN WAVE SOURCE LAB
                                    </h2>
                                    <p className="text-slate-400 text-[11px] mt-0.5">
                                        Ingest curated demonstration scenarios, live CCTV RTSP feeds, or custom traffic videos.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowSourceLabModal(false)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* 3 Workspace Tabs */}
                            <div className="flex border-b border-slate-800">
                                {[
                                    { id: "demo", label: "DEMO SCENARIOS" },
                                    { id: "live", label: `LIVE CAMERAS (${liveCameras.length})` },
                                    { id: "upload", label: "UPLOAD TRAFFIC VIDEO" }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setSourceLabTab(tab.id as any)}
                                        className={`px-4 py-2 border-b-2 font-bold transition-all ${
                                            sourceLabTab === tab.id
                                                ? "border-emerald-400 text-emerald-300"
                                                : "border-transparent text-slate-500 hover:text-slate-300"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab 1: Demo Scenarios */}
                            {sourceLabTab === "demo" && (
                                <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
                                    {scenarios.map((sc) => (
                                        <div
                                            key={sc.id}
                                            onClick={() => handleSelectScenario(sc.id)}
                                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                                                activeScenarioId === sc.id
                                                    ? "bg-emerald-950/40 border-emerald-500/60 shadow-md"
                                                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white text-xs">{sc.title}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                                        sc.category === "BASELINE"
                                                            ? "bg-slate-800 text-slate-300"
                                                            : "bg-rose-950 text-rose-300 border border-rose-800"
                                                    }`}>
                                                        {sc.badge}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-slate-400">{sc.duration_seconds}s • {sc.fps} FPS</span>
                                            </div>

                                            <p className="text-[11px] text-slate-400 leading-relaxed">{sc.description}</p>

                                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                                                <span>Expected: <strong className="text-slate-300">{sc.expected_outcome}</strong></span>
                                                <span className="text-emerald-400 font-bold flex items-center gap-1">
                                                    SELECT SCENARIO <ChevronRight className="w-3 h-3" />
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Tab 2: Live Cameras */}
                            {sourceLabTab === "live" && (
                                <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                                    {liveCameras.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500">No CCTV cameras registered in database.</div>
                                    ) : (
                                        liveCameras.map((cam) => (
                                            <div
                                                key={cam.id}
                                                onClick={() => {
                                                    setSelectedSessionId(cam.id);
                                                    setShowSourceLabModal(false);
                                                }}
                                                className="p-3 rounded-lg border border-slate-800 bg-slate-950 hover:border-emerald-500/50 cursor-pointer flex items-center justify-between"
                                            >
                                                <div>
                                                    <div className="font-bold text-white">{cam.name}</div>
                                                    <div className="text-[10px] text-slate-500">{cam.stream_url}</div>
                                                </div>
                                                <button className="px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                                                    ATTACH
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* Tab 3: Upload Video */}
                            {sourceLabTab === "upload" && (
                                <div className="p-6 border-2 border-dashed border-slate-800 rounded-xl bg-slate-950 text-center flex flex-col items-center justify-center gap-3">
                                    <UploadCloud className="w-10 h-10 text-emerald-400" />
                                    <div>
                                        <p className="font-bold text-white text-xs">Drop .mp4 or .webm traffic video here</p>
                                        <p className="text-slate-500 text-[11px] mt-1">Video will run through the exact same downstream pipeline</p>
                                    </div>
                                    <label className="mt-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer">
                                        {uploading ? "Ingesting Video..." : "Browse Local File"}
                                        <input
                                            type="file"
                                            accept="video/mp4,video/webm"
                                            className="hidden"
                                            onChange={handleFileUpload}
                                            disabled={uploading}
                                        />
                                    </label>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Operator Authorization Modal ────────────────────────────────────────── */}
            <AnimatePresence>
                {showAuthorizeModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-lg bg-slate-900 border border-rose-600/50 rounded-2xl p-6 shadow-2xl font-mono text-xs flex flex-col gap-4"
                        >
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div className="flex items-center gap-2 text-rose-400">
                                    <ShieldAlert className="w-5 h-5" />
                                    <h2 className="text-sm font-bold text-white">OPERATOR CORRIDOR AUTHORIZATION</h2>
                                </div>
                                <button onClick={() => setShowAuthorizeModal(false)} className="text-slate-400 hover:text-white">✕</button>
                            </div>

                            <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-200 text-[11px] leading-relaxed">
                                Confirming authorization will log an immutable tactical audit record and transmit advisory clearance timings for <strong>{corridorPlan?.corridor_id}</strong>.
                            </div>

                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase">Operator ID / Call Sign</label>
                                    <input
                                        type="text"
                                        value={operatorId}
                                        onChange={(e) => setOperatorId(e.target.value)}
                                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase">Tactical Justification Notes</label>
                                    <textarea
                                        rows={3}
                                        value={operatorNotes}
                                        onChange={(e) => setOperatorNotes(e.target.value)}
                                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs font-mono"
                                    />
                                </div>
                            </div>

                            {authorizationAudit && (
                                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-[11px]">
                                    ✓ Authorization Recorded: <strong>{authorizationAudit.audit_id}</strong>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                                <button
                                    onClick={() => setShowAuthorizeModal(false)}
                                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
                                >
                                    Close
                                </button>
                                <button
                                    disabled={isAuthorizing}
                                    onClick={handleAuthorizeCorridor}
                                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    {isAuthorizing ? "Authorizing..." : "CONFIRM & TRANSMIT ADVISORY"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
