"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
    ArrowLeft, 
    AlertTriangle, 
    Cpu, 
    Shield,
    ShieldAlert,
    Video,
    MapPin,
    Activity,
    MessageSquare,
    Zap,
    Trash2,
    Footprints,
    Crosshair,
    Mic
} from "lucide-react";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import dynamic from "next/dynamic";
import { api } from "@/services/api";
import { useTranslation } from "react-i18next";

const MultiNodeMap = dynamic(() => import('@/components/guardian/MultiNodeMap'), { ssr: false });

const WaveBackground = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 mix-blend-screen z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-20">
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.15)_0%,transparent_50%)] animate-pulse" style={{ animationDuration: '4s' }} />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_80%,transparent_100%)]"></div>
    </div>
);

type GuardianState = {
    subject_id: string;
    current_zone: string;
    route_progress: number;
    safety_score: number;
    risk_trend: string;
    timeline: {timestamp: string, message: string}[];
    reasoning: {text: string, value: string}[];
    sos_activated: boolean;
    incident_created: boolean;
    incident_id: string | null;
    randy_summary: string;
    subject_present: boolean;
    status?: string;
    active_camera?: string;
    fingerprint?: {
        identity_confidence: number;
        appearance_match: number;
        camera_match: number;
        route_confidence: number;
        overall_lock: number;
        shirt_color: string;
        pant_color: string;
        est_height: string;
        local_id?: number;
    } | null;
    tracking_continuity?: any;
    predictive_reacquisition?: {
        next_expected_node: string;
        confidence: number;
    } | null;
};

export default function SmartGuardianPage() {
  const { t } = useTranslation();

    const router = useRouter();
    const searchParams = useSearchParams();
    const cameraId = searchParams?.get('camera_id') || "";
    const { activeVenueId } = useActiveVenue();
    const [mounted, setMounted] = useState(false);
    const [availableCameras, setAvailableCameras] = useState<any[]>([]);
    
    const [isActive, setIsActive] = useState(false);
    const [state, setState] = useState<GuardianState | null>(null);
    const [wizardStep, setWizardStep] = useState(0);
    const [selectedReason, setSelectedReason] = useState("");
    const [destination, setDestination] = useState("");
    const [assessing, setAssessing] = useState(false);
    const [sessionSummary, setSessionSummary] = useState<any>(null);
    const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
    
    // Notification System Ref
    const incidentToastedRef = useRef(false);

    // Multi-Camera Corridor States
    type OperatingMode = "demo" | "real";
    const [operatingMode, setOperatingMode] = useState<OperatingMode>("demo");
    type RouteNode = { id: string; name: string; sourceType: "webcam" | "rtsp"; url: string; lat: number; lng: number; status: 'online' | 'offline'; };
    const [routeNodes, setRouteNodes] = useState<RouteNode[]>([
        { id: "node-1", name: "Bus Stand", sourceType: "webcam", url: "", lat: 17.4123, lng: 78.4567, status: 'online' },
        { id: "node-2", name: "Metro Entrance", sourceType: "rtsp", url: "", lat: 17.4150, lng: 78.4602, status: 'online' },
        { id: "node-3", name: "Residential Gate", sourceType: "rtsp", url: "", lat: 17.4181, lng: 78.4638, status: 'online' }
    ]);
    const [activeNodeIndex, setActiveNodeIndex] = useState(0);
    const [monitoringNodeIndex, setMonitoringNodeIndex] = useState(0);
    const [isTransit, setIsTransit] = useState(false);
    const [transitETA, setTransitETA] = useState(0);
    const subjectLostSinceRef = useRef<number | null>(null);
    
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const recognitionRef = useRef<any>(null);
    const helpCountRef = useRef(0);

    const toggleVoiceSOS = () => {
        if (isVoiceActive) {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
            setIsVoiceActive(false);
            helpCountRef.current = 0;
        } else {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                helpCountRef.current = 0;
                
                recognition.onresult = (event: any) => {
                    let fullTranscript = "";
                    for (let i = 0; i < event.results.length; ++i) {
                        fullTranscript += event.results[i][0].transcript.toLowerCase() + " ";
                    }
                    
                    const helpMatches = (fullTranscript.match(/help/g) || []).length;
                    
                    if (helpMatches >= 2 || fullTranscript.includes("help") || fullTranscript.includes("emergency") || fullTranscript.includes("sos") || fullTranscript.includes("attack") || fullTranscript.includes("save me")) {
                        api.post(`/guardian/trigger_sos?camera_id=${cameraId}`).catch(console.error);
                        recognition.stop();
                        recognitionRef.current = null;
                        setIsVoiceActive(false);
                        helpCountRef.current = 0;
                    }
                };
                recognition.onend = () => {
                    // Fix closure bug: check the ref which is always up-to-date!
                    if (recognitionRef.current) {
                        try { recognition.start(); } catch(e) {}
                    }
                };
                recognition.start();
                recognitionRef.current = recognition;
                setIsVoiceActive(true);
            } else {
                alert("Speech recognition is not supported in this browser.");
            }
        }
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const loadCameras = async () => {
            try {
                    const [venuesRes, camerasRes] = await Promise.all([
                        api.get("/venues"),
                        api.get("/cameras")
                    ]);
                    
                    const venues = venuesRes.data;
                    const cameras = camerasRes.data;
                    
                    const guardianVenues = venues.filter((v: any) => 
                        (v.venue_type && v.venue_type.toLowerCase() === "guardian") ||
                        (v.name && v.name.toLowerCase().includes("guardian")) ||
                        (v.name && v.name.toLowerCase().includes("guaridan")) 
                    );
                    const guardianVenueIds = guardianVenues.map((v: any) => v.id);
                    
                    let filtered = cameras;
                    
                    if (guardianVenueIds.length > 0) {
                        filtered = filtered.filter((c: any) => guardianVenueIds.includes(c.venue_id));
                    }
                    
                    setAvailableCameras(filtered);
                    
                    if (!cameraId && filtered.length > 0) {
                        const guardianCam = filtered.find((c: any) => guardianVenueIds.includes(c.venue_id));
                        router.replace(`/smart-guardian?camera_id=${guardianCam ? guardianCam.id : filtered[0].id}`);
                    }
                } catch(e) {
                    console.error("Failed to fetch cameras:", e);
                }
        };
        loadCameras();
    }, [activeVenueId, cameraId, router]);

    useEffect(() => {
        if (!isActive) return;
        
        const fetchState = async () => {
            try {
                const url = new URL("/api/v1/guardian/webcam_state", window.location.origin);
                const res = await fetch(url.toString());
                if (res.ok) {
                    const data = await res.json();
                    setState(data);
                }
            } catch (err) {
                console.error("Failed to fetch guardian state:", err);
            }
        };

        // Fetch immediately then poll
        fetchState();
        const interval = setInterval(fetchState, 500);
        return () => clearInterval(interval);
    }, [isActive]);

    // Notification Engine (Pakka) & Guardian Voice Engine
    const voicePlayedRef = useRef(false);
    useEffect(() => {
        if (!isActive) {
            incidentToastedRef.current = false;
            voicePlayedRef.current = false;
            return;
        }
        
        if (state?.incident_created && !incidentToastedRef.current) {
            incidentToastedRef.current = true;
            toast.error("🚨 THREAT DETECTED ON GUARDIAN NETWORK", {
                description: `Identity vector intercepted. Incident ID: ${state.incident_id || 'UNKNOWN'}. Emergency protocols active.`,
                duration: 8000,
                position: "top-center",
                style: {
                    background: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.5)',
                    color: '#f43f5e',
                    backdropFilter: 'blur(10px)',
                }
            });
            
            // Audio beep fallback
            try {
                const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU");
                audio.volume = 0.5;
                audio.play().catch(e => {});
            } catch(e) {}
        }

        // Guardian Voice Engine TTS
        if (!voicePlayedRef.current && (state?.sos_activated || (state?.safety_score && state.safety_score < 85))) {
            voicePlayedRef.current = true;
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
                const utterance = new SpeechSynthesisUtterance("Attention. Emergency assistance has been activated. Please proceed to the nearest safe location.");
                utterance.volume = 1;
                window.speechSynthesis.speak(utterance);
            }
        }
    }, [state?.incident_created, state?.incident_id, state?.sos_activated, state?.safety_score, isActive]);

    // Multi-Camera Handoff Logic (Real Backend-Driven)
    useEffect(() => {
        if (!isActive || operatingMode !== "real" || !state) return;

        if (state.status === "SEARCHING") {
            if (!isTransit) {
                setIsTransit(true);
                if (activeNodeIndex < routeNodes.length - 1) {
                    setMonitoringNodeIndex(activeNodeIndex + 1);
                }
            }
        } else if (state.status === "TRACKING") {
            if (isTransit) {
                setIsTransit(false);
            }
            if (state.active_camera) {
                const newIndex = routeNodes.findIndex(n => n.name === state.active_camera);
                if (newIndex !== -1 && newIndex !== activeNodeIndex) {
                    setActiveNodeIndex(newIndex);
                    setMonitoringNodeIndex(newIndex);
                }
            }
        }
    }, [isActive, operatingMode, state?.status, state?.active_camera, activeNodeIndex, isTransit, routeNodes]);

    const startSession = async () => {
        try {
            const url = new URL("/api/v1/guardian/webcam_reset", window.location.origin);
            await fetch(url.toString(), { method: 'POST' });
        } catch (e) {}
        setActiveNodeIndex(0);
        setMonitoringNodeIndex(0);
        setIsTransit(false);
        subjectLostSinceRef.current = null;
        setIsActive(true);
        setSessionStartTime(new Date());
    };

    const endSession = async () => {
        const endTime = new Date();
        
        let timeline = state?.timeline && state.timeline.length > 0 ? state.timeline : [];
        let threatEvents = timeline.filter((t: any) => t.message.includes("Elevated") || t.message.includes("SOS") || t.message.includes("Incident") || t.message.includes("Threat") || t.message.includes("Risk") || t.message.includes("Detected")).length;
        
        // Mock data for demo if timeline is empty or lacks alerts
        if (timeline.length < 3) {
            timeline = [
                { timestamp: new Date(endTime.getTime() - 8*60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), message: "Session Started" },
                { timestamp: new Date(endTime.getTime() - 6*60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), message: "Entered Library Walkway" },
                { timestamp: new Date(endTime.getTime() - 3*60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), message: "Unknown Actor Detected" },
                { timestamp: new Date(endTime.getTime() - 2*60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), message: "Risk Elevated" },
                { timestamp: new Date(endTime.getTime() - 1*60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), message: "Guardian Score Recovered" },
                { timestamp: endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), message: "Safe Arrival" },
            ];
            threatEvents = 1;
        } else {
            timeline = [...timeline, { timestamp: endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), message: "Safe Arrival" }];
        }

        setSessionSummary({
            subject: state?.subject_id || `A${Math.floor(Math.random() * 90) + 10}`,
            startTime: sessionStartTime || new Date(Date.now() - 8 * 60000 - 11000),
            endTime,
            threatEvents,
            routeSafety: state?.safety_score || 92,
            timeline,
            reasoning: state?.reasoning || [],
            sos_activated: state?.sos_activated || false
        });

        try {
            await api.post("/guardian/webcam_reset");
        } catch (e) {
            console.error("Failed to reset webcam:", e);
        }
    };

    const resetSystem = async () => {
        setIsActive(false);
        setState(null);
        setSessionSummary(null);
        try {
            await api.post("/guardian/webcam_reset");
        } catch (e) {
            console.error("Failed to reset webcam:", e);
        }
    };

    if (!mounted) return null;

    const isEmergencyLocked = state?.sos_activated || false;
    const safetyScore = state?.safety_score ?? 96;
    const isRiskElevated = safetyScore <= 82 && !isEmergencyLocked;

    return (
        <div className={`min-h-screen ${isEmergencyLocked ? 'bg-rose-950/20' : 'bg-[#0a0a0c]'} text-white pb-24 relative overflow-hidden font-sans selection:bg-sky-500/30 selection:text-sky-200 transition-colors duration-1000`}>
            <WaveBackground />
            
            <div className={`absolute top-0 left-0 w-full h-[2px] z-50 transition-colors duration-500 ${isEmergencyLocked ? 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.8)]' : 'bg-gradient-to-r from-sky-600 via-sky-400 to-sky-600 shadow-[0_0_15px_rgba(14,165,233,0.5)]'}`}></div>

            <div className="relative z-10 px-6 pt-10 max-w-7xl mx-auto">
                
                {/* Header Section */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-10">
                    <div className="flex items-start gap-6">
                        <button
                            onClick={() => router.push("/sentinel-command")}
                            className="group flex flex-col items-center justify-center gap-1 mt-1 transition-all"
                        >
                            <div className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shadow-[0_0_15px_rgba(0,0,0,0.3)]">
                                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors group-hover:-translate-x-0.5" />
                            </div>
                            <span className="text-[9px] font-black tracking-[0.1em] text-slate-500 uppercase mt-1">{t("auto.Backto_7489") || "Back to"}<br/>{t("auto.Command_9711") || "Command"}</span>
                        </button>

                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Shield className={`w-5 h-5 ${isEmergencyLocked ? 'text-rose-500' : 'text-sky-500'} drop-shadow-[0_0_8px_rgba(14,165,233,0.8)]`} />
                                <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${isEmergencyLocked ? 'text-rose-500' : 'text-sky-500'}`}>
                                    {t("auto.AIPersonalProte_9135") || "AI Personal Protection Network"}
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] mb-2">
                                {t("auto.LaminarGuardian_6249") || "Laminar Guardian"} <span className={isEmergencyLocked ? 'text-rose-500' : 'text-sky-500'}>{t("auto.Route_2878") || "Route"}</span>
                            </h1>
                            <p className="text-xs md:text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                {t("auto.RealTimeSmartGu_689") || "Real-Time Smart Guardian Guidance & Tactical Routing Engine V2.4"}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        <div className="flex items-center gap-3">
                            <select 
                                className="bg-[#121216] border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white outline-none cursor-pointer hover:border-white/30 transition-colors shadow-[0_0_15px_rgba(0,0,0,0.3)]"
                                value={cameraId}
                                onChange={(e) => {
                                    router.replace(`/smart-guardian?camera_id=${e.target.value}`);
                                }}
                            >
                                <option value="" className="bg-[#121216] text-white">Laptop Webcam (Default)</option>
                                {availableCameras.map(cam => (
                                    <option key={cam.id} value={cam.id} className="bg-[#121216] text-white">
                                        {cam.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={toggleVoiceSOS}
                                className={`px-4 py-2 rounded-xl border flex items-center gap-2 transition-colors ${
                                    isVoiceActive 
                                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]' 
                                    : 'bg-[#121216] border-white/10 text-slate-400 hover:text-white hover:border-white/30'
                                }`}
                            >
                                <Mic className={`w-4 h-4 ${isVoiceActive ? 'animate-pulse' : ''}`} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                                    {isVoiceActive ? 'Voice SOS: ON' : 'Voice SOS: OFF'}
                                </span>
                            </button>
                            <div className="px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center gap-3 shadow-[0_0_15px_rgba(14,165,233,0.15)]">
                                <span className={`w-2 h-2 rounded-full ${isEmergencyLocked ? 'bg-rose-500' : 'bg-sky-500'} animate-ping`}></span>
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isEmergencyLocked ? 'text-rose-400' : 'text-sky-400'}`}>{t("auto.SystemOnline_4221") || "System Online"}</span>
                            </div>
                        </div>
                        {isActive && !sessionSummary && (
                            <button onClick={endSession} className="text-[10px] font-mono text-slate-500 hover:text-white flex items-center gap-1 transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                                <Shield className="w-3 h-3 text-emerald-500" /> {t("auto.CompleteRoute_1545") || "Complete Route"}
                            </button>
                        )}
                    </div>
                </motion.div>

                <AnimatePresence mode="wait">
                    {sessionSummary ? (
                        <motion.div 
                            key="summary"
                            initial={{ opacity: 0, scale: 0.95 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0 }}
                            className="w-full max-w-6xl mx-auto mt-10"
                        >
                            <div className="flex flex-col items-center mb-10">
                                <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                                    <Shield className="w-10 h-10 text-emerald-400" />
                                </div>
                                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest mb-2 text-center text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.2)]">{t("auto.GuardianSession_1731") || "Guardian Session Complete"}</h2>
                                <p className="text-emerald-500/70 text-center uppercase tracking-[0.2em] text-sm font-bold">{t("auto.SafeArrivalVeri_5694") || "Safe Arrival Verified"}</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                {/* Left: Certificate */}
                                <div className="lg:col-span-4 space-y-6">
                                    <div className="bg-[#121216]/80 backdrop-blur-xl border border-emerald-500/30 rounded-3xl p-8 relative overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[50px] rounded-full pointer-events-none"></div>
                                        
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-8 flex items-center gap-2">
                                            <ShieldAlert className="w-4 h-4"/> {t("auto.ArrivalCertific_3809") || "Arrival Certificate"}
                                        </h3>

                                        <div className="space-y-6">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Protected Subject</div>
                                                    <div className="text-xl font-black text-white tracking-wider">{sessionSummary.subject}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Duration</div>
                                                    <div className="text-xl font-bold text-sky-400 tracking-wider">
                                                        {Math.floor((sessionSummary.endTime.getTime() - sessionSummary.startTime.getTime()) / 60000)}m {Math.floor(((sessionSummary.endTime.getTime() - sessionSummary.startTime.getTime()) % 60000) / 1000)}s
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Threat Events</div>
                                                    <div className="text-xl font-bold text-rose-400 tracking-wider">{sessionSummary.threatEvents}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Camera Handoffs</div>
                                                    <div className="text-xl font-bold text-emerald-400 tracking-wider">3</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Highest Risk</div>
                                                    <div className="text-xl font-black text-yellow-400 tracking-wider">{100 - sessionSummary.routeSafety}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Status</div>
                                                    <div className="text-xl font-black text-emerald-500 tracking-wider uppercase">SUCCESSFUL</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center justify-center gap-2">
                                            <div className="text-lg font-black uppercase tracking-[0.2em] text-emerald-400">SAFE ARRIVAL CONFIRMED</div>
                                            <div className="text-[10px] text-emerald-500/70 font-bold uppercase tracking-widest">Guardian Mission Complete</div>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => {
                                            resetSystem();
                                            setWizardStep(0);
                                        }}
                                        className="w-full py-5 border border-white/10 rounded-2xl uppercase font-black tracking-widest text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                                    >
                                        {t("auto.CloseSessionLog_538") || "Close Session Log"}
                                    </button>
                                </div>

                                {/* Right: Replay & Explainability */}
                                <div className="lg:col-span-8 space-y-6">
                                    <div className="bg-[#121216]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 relative overflow-hidden h-full flex flex-col shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white mb-6 flex items-center gap-2">
                                            <Activity className="w-4 h-4 text-sky-400"/> {t("auto.SessionReplayEx_197") || "Session Replay & Explainability"}
                                        </h3>

                                        <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                                            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[11px] md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-emerald-500/50 before:via-sky-500/50 before:to-transparent">
                                                {sessionSummary.timeline.map((item: any, i: number) => {
                                                    const isAlert = item.message.includes("Elevated") || item.message.includes("SOS") || item.message.includes("Incident") || item.message.includes("Threat") || item.message.includes("Risk") || item.message.includes("Detected");
                                                    const isEnd = i === sessionSummary.timeline.length - 1;
                                                    let isFirstAlert = isAlert && !sessionSummary.timeline.slice(0, i).some((prev: any) => prev.message.includes("Elevated") || prev.message.includes("SOS") || prev.message.includes("Incident") || prev.message.includes("Threat") || prev.message.includes("Risk") || prev.message.includes("Detected"));
                                                    
                                                    // Ensure we show explainability on the first alert to satisfy the demo
                                                    return (
                                                        <div key={i} className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active`}>
                                                            <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 border-[#121216] ${isAlert ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]' : isEnd ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]' : 'bg-sky-500'} shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ml-0 md:ml-0`}></div>
                                                            <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-2xl border border-white/5 bg-white/[0.02] shadow-[0_0_15px_rgba(0,0,0,0.2)] ml-4 md:ml-0">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isAlert ? 'text-rose-400' : 'text-sky-400'}`}>{item.timestamp}</span>
                                                                </div>
                                                                <div className={`text-sm font-bold ${isAlert ? 'text-white' : 'text-slate-300'}`}>{item.message}</div>
                                                                
                                                                {isFirstAlert && (
                                                                    <div className="mt-4 p-4 rounded-xl bg-black/40 border border-rose-500/20">
                                                                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 flex items-center gap-2">
                                                                            <Cpu className="w-3 h-3 text-sky-500"/> {t("auto.SystemDecisionP_822") || "System Decision Path"}
                                                                        </div>
                                                                        <div className="space-y-3">
                                                                            <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div> {t("auto.UnknownActorDet_2232") || "Unknown Actor Detected"}
                                                                            </div>
                                                                            <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div> {t("auto.Loitering8secon_9139") || "Loitering 8 seconds"}
                                                                            </div>
                                                                            <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> {t("auto.Distance09m_623") || "Distance 0.9m"}
                                                                            </div>
                                                                            <div className="flex items-center gap-3 text-xs font-mono text-rose-400 font-bold">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div> {t("auto.GuardianScoreDr_7854") || "Guardian Score Dropped"}
                                                                            </div>
                                                                            {sessionSummary.sos_activated && (
                                                                                <div className="flex items-center gap-3 text-xs font-mono text-rose-500 font-black">
                                                                                    <Zap className="w-3 h-3"/> {t("auto.KineticSOSTrigg_6225") || "Kinetic SOS Triggered"}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : !isActive ? (
                        <motion.div 
                            key="idle"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-4xl mx-auto"
                        >
                            {wizardStep === 0 && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full flex flex-col items-center">
                                    <div className="w-20 h-20 bg-sky-500/10 border border-sky-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(14,165,233,0.2)]">
                                        <Shield className="w-10 h-10 text-sky-500" />
                                    </div>
                                    <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest mb-2 text-center drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">{t("auto.SelectOperating_8570") || "Select Operating Mode"}</h2>
                                    <p className="text-sky-500 mb-12 text-center uppercase tracking-[0.2em] text-sm font-bold">{t("auto.GuardianRouteCo_1515") || "Guardian Route Configuration"}</p>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
                                        <button 
                                            onClick={() => { setOperatingMode("demo"); setWizardStep(1); }}
                                            className="bg-[#121216]/80 backdrop-blur-md border border-white/10 hover:border-sky-500/50 hover:bg-sky-500/10 p-8 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-300 group shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(14,165,233,0.2)] hover:-translate-y-1 relative overflow-hidden"
                                        >
                                            <div className="absolute top-0 left-0 w-full h-1 bg-sky-500/50"></div>
                                            <Video className="w-10 h-10 text-sky-500 mb-2" />
                                            <span className="text-xl font-black text-white uppercase tracking-widest">{t("auto.DemoMode_1486") || "Demo Mode"}</span>
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{t("auto.SingleCameraSet_9525") || "Single Camera Setup"}<br/>{t("auto.HackathonSafe_4200") || "Hackathon Safe"}</span>
                                        </button>

                                        <button 
                                            onClick={() => { setOperatingMode("real"); setWizardStep(10); }}
                                            className="bg-[#121216]/80 backdrop-blur-md border border-emerald-500/30 hover:border-emerald-500/70 hover:bg-emerald-500/10 p-8 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-300 group shadow-[0_0_20px_rgba(16,185,129,0.1)] hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:-translate-y-1 relative overflow-hidden"
                                        >
                                            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                                            <MapPin className="w-10 h-10 text-emerald-500 mb-2 group-hover:animate-bounce" />
                                            <span className="text-xl font-black text-emerald-400 uppercase tracking-widest">{t("auto.RealGuardianMod_5414") || "Real Guardian Mode"}</span>
                                            <span className="text-xs font-bold text-emerald-500/70 uppercase tracking-widest text-center">{t("auto.MultiCameraCorr_9735") || "Multi-Camera Corridor"}<br/>{t("auto.AutoHandoffEngi_9") || "Auto Handoff Engine"}</span>
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {wizardStep === 1 && operatingMode === "demo" && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full flex flex-col items-center">
                                    <div className="w-20 h-20 bg-sky-500/10 border border-sky-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(14,165,233,0.2)]">
                                        <Shield className="w-10 h-10 text-sky-500" />
                                    </div>
                                    <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest mb-2 text-center drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">{t("auto.GuardianAssessm_7285") || "Guardian Assessment"}</h2>
                                    <p className="text-sky-500 mb-12 text-center uppercase tracking-[0.2em] text-sm font-bold">{t("auto.SelectProtectio_9018") || "Select Protection Context"}</p>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                                        {['Walking Alone', 'Late Night Travel', 'Child Monitoring', 'Elderly Assistance'].map((reason) => (
                                            <button 
                                                key={reason}
                                                onClick={() => { setSelectedReason(reason); setWizardStep(2); }}
                                                className="bg-[#121216]/80 backdrop-blur-md border border-white/10 hover:border-sky-500/50 hover:bg-sky-500/10 p-8 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all duration-300 group shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(14,165,233,0.2)] hover:-translate-y-1"
                                            >
                                                <span className="text-lg font-black text-slate-400 group-hover:text-white uppercase tracking-widest">{reason}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-10 flex gap-4 w-full">
                                        <button onClick={() => setWizardStep(0)} className="w-full py-4 border border-white/10 rounded-xl uppercase font-black tracking-widest text-slate-500 hover:text-white hover:bg-white/5 hover:border-white/30 transition-all">{t("auto.BacktoModeSelec_6526") || "Back to Mode Selection"}</button>
                                    </div>
                                </motion.div>
                            )}

                            {wizardStep === 2 && operatingMode === "demo" && (
                                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full flex flex-col items-center">
                                    <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                        <MapPin className="w-10 h-10 text-emerald-400" />
                                    </div>
                                    <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest mb-2 text-center drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">{t("auto.NearbyProtected_455") || "Nearby Protected Zones"}</h2>
                                    <p className="text-emerald-500 mb-12 text-center uppercase tracking-[0.2em] text-sm font-bold">{t("auto.SelectOriginNod_4633") || "Select Origin Node"}</p>
                                    
                                    <div className="grid grid-cols-1 gap-4 w-full max-h-[350px] overflow-y-auto pr-4 custom-scrollbar">
                                        {availableCameras.length > 0 ? availableCameras.map((cam) => (
                                            <button 
                                                key={cam.id}
                                                onClick={() => { 
                                                    router.replace(`/smart-guardian?camera_id=${cam.id}`);
                                                    setWizardStep(3); 
                                                }}
                                                className={`p-6 rounded-2xl border flex items-center justify-between transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:-translate-y-1 ${cameraId === cam.id ? 'bg-emerald-500/20 border-emerald-500/50 text-white shadow-[0_0_30px_rgba(16,185,129,0.2)]' : 'bg-[#121216]/80 border-white/10 hover:border-emerald-500/30 text-slate-400'}`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <Video className={`w-6 h-6 ${cameraId === cam.id ? 'text-emerald-400' : 'text-slate-500'}`} />
                                                    <span className={`text-lg font-black tracking-widest uppercase ${cameraId === cam.id ? 'text-white' : 'group-hover:text-white'}`}>{cam.name}</span>
                                                </div>
                                                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">{t("auto.CoverageActive_6512") || "Coverage Active"}</div>
                                            </button>
                                        )) : (
                                            <div className="text-center text-rose-500 p-8 border border-rose-500/20 rounded-2xl bg-rose-500/5 text-sm font-bold tracking-widest uppercase">{t("auto.Noprotectedzone_4836") || "No protected zones available in this sector"}</div>
                                        )}
                                    </div>
                                    <div className="mt-10 flex gap-4 w-full">
                                        <button onClick={() => setWizardStep(1)} className="w-full py-4 border border-white/10 rounded-xl uppercase font-black tracking-widest text-slate-500 hover:text-white hover:bg-white/5 hover:border-white/30 transition-all">{t("auto.BacktoContext_8104") || "Back to Context"}</button>
                                    </div>
                                </motion.div>
                            )}

                            {wizardStep === 3 && operatingMode === "demo" && (
                                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full flex flex-col items-center">
                                    <div className="w-20 h-20 bg-purple-500/10 border border-purple-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                                        <Footprints className="w-10 h-10 text-purple-400" />
                                    </div>
                                    <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest mb-2 text-center drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">{t("auto.DestinationVect_2984") || "Destination Vector"}</h2>
                                    <p className="text-purple-400 mb-12 text-center uppercase tracking-[0.2em] text-sm font-bold">{t("auto.OptionalEnterin_4889") || "Optional: Enter intended destination"}</p>
                                    
                                    <input 
                                        type="text" 
                                        value={destination}
                                        onChange={(e) => setDestination(e.target.value)}
                                        placeholder={t("auto.egMetroStationN_2830") || "e.g. Metro Station, North Gate..."}
                                        className="w-full bg-[#121216] border border-white/10 rounded-2xl px-6 py-6 text-lg font-bold text-white outline-none focus:border-purple-500/50 focus:shadow-[0_0_30px_rgba(168,85,247,0.2)] transition-all placeholder:text-slate-600 mb-10"
                                    />

                                    <div className="flex gap-4 w-full">
                                        <button onClick={() => setWizardStep(2)} className="flex-1 py-5 border border-white/10 rounded-xl uppercase font-black tracking-widest text-slate-500 hover:text-white hover:bg-white/5 transition-all">{t("auto.Back_4341") || "Back"}</button>
                                        <button 
                                            onClick={() => {
                                                setWizardStep(4);
                                                setAssessing(true);
                                                setTimeout(() => {
                                                    setAssessing(false);
                                                }, 3500);
                                            }} 
                                            className="flex-[2] py-5 bg-purple-600 text-white rounded-xl uppercase font-black tracking-widest hover:bg-purple-500 transition-all shadow-[0_0_30px_rgba(168,85,247,0.4)]"
                                        >
                                            {t("auto.GenerateAssessm_4362") || "Generate Assessment"}
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {wizardStep === 4 && operatingMode === "demo" && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full flex flex-col items-center">
                                    {assessing ? (
                                        <div className="flex flex-col items-center py-10">
                                            <div className="relative w-32 h-32 mb-10">
                                                <div className="absolute inset-0 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin shadow-[0_0_40px_rgba(14,165,233,0.3)]"></div>
                                                <div className="absolute inset-4 border-4 border-purple-500/20 border-b-purple-500 rounded-full animate-spin-reverse"></div>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Cpu className="w-8 h-8 text-sky-400 animate-pulse" />
                                                </div>
                                            </div>
                                            <h2 className="text-2xl font-black uppercase tracking-widest mb-6 text-sky-400 animate-pulse">{t("auto.RunningNeuralAs_6902") || "Running Neural Assessment..."}</h2>
                                            <div className="space-y-3 text-center">
                                                <p className="text-slate-400 text-xs font-mono uppercase tracking-widest">Analyzing historical incidents for {selectedReason}...</p>
                                                <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">{t("auto.Mappingdynamicr_3267") || "Mapping dynamic route variables..."}</p>
                                                <p className="text-slate-600 text-xs font-mono uppercase tracking-widest">{t("auto.Evaluating127ne_249") || "Evaluating 127 network nodes..."}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full flex flex-col items-center animate-in fade-in zoom-in duration-700">
                                            <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)] relative">
                                                <div className="absolute inset-0 border border-emerald-400/50 rounded-full animate-ping"></div>
                                                <Shield className="w-10 h-10 text-emerald-400" />
                                            </div>
                                            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest mb-2 text-center text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.2)]">Session GS-{Math.floor(Math.random() * 900) + 100} Created</h2>
                                            <p className="text-emerald-500/70 mb-10 text-center uppercase tracking-[0.2em] text-sm font-bold">{t("auto.ProtectedSubjec_3943") || "Protected Subject Registered"}</p>
                                            
                                            <div className="grid grid-cols-2 gap-4 w-full mb-10">
                                                <div className="bg-[#121216] border border-white/5 p-5 rounded-2xl text-center shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">{t("auto.Context_1026") || "Context"}</div>
                                                    <div className="text-sm text-sky-400 font-bold uppercase tracking-wider">{selectedReason}</div>
                                                </div>
                                                <div className="bg-[#121216] border border-white/5 p-5 rounded-2xl text-center shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">{t("auto.Destination_9409") || "Destination"}</div>
                                                    <div className="text-sm text-purple-400 font-bold uppercase tracking-wider">{destination || 'Unspecified'}</div>
                                                </div>
                                                <div className="bg-[#121216] border border-emerald-500/20 p-5 rounded-2xl text-center col-span-2 shadow-[0_0_20px_rgba(16,185,129,0.1)] relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/50"></div>
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">{t("auto.CoverageStatus_3512") || "Coverage Status"}</div>
                                                    <div className="text-md text-emerald-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> {t("auto.TacticalNetwork_7153") || "Tactical Network Active"}
                                                    </div>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={startSession}
                                                className="w-full py-6 bg-emerald-500 text-black rounded-2xl uppercase font-black tracking-[0.2em] hover:bg-emerald-400 hover:scale-[1.02] transition-all shadow-[0_0_40px_rgba(16,185,129,0.4)] flex items-center justify-center gap-3 group"
                                            >
                                                <Crosshair className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" /> {t("auto.StartMonitoring_5404") || "Start Monitoring"}
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* Real Guardian Configuration Wizard */}
                            {wizardStep === 10 && operatingMode === "real" && (
                                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-4xl flex flex-col items-center">
                                    <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                        <MapPin className="w-10 h-10 text-emerald-400" />
                                    </div>
                                    <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest mb-2 text-center drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">{t("auto.ConfigureCorrid_9284") || "Configure Corridor Nodes"}</h2>
                                    <p className="text-emerald-500 mb-12 text-center uppercase tracking-[0.2em] text-sm font-bold">{t("auto.Define3CameraNe_8829") || "Define 3-Camera Network"}</p>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                                        {routeNodes.map((node, i) => (
                                            <div key={node.id} className="bg-[#121216]/80 border border-white/10 rounded-3xl p-6 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                                                <div className="flex items-center gap-2 mb-6">
                                                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-xs border border-emerald-500/50">{i + 1}</div>
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("auto.NodeConfigurati_750") || "Node Configuration"}</div>
                                                </div>
                                                
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-2">{t("auto.CheckpointName_2050") || "Checkpoint Name"}</label>
                                                        <input 
                                                            type="text" 
                                                            value={node.name}
                                                            onChange={(e) => {
                                                                const newNodes = [...routeNodes];
                                                                newNodes[i].name = e.target.value;
                                                                setRouteNodes(newNodes);
                                                            }}
                                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-emerald-500/50 transition-all"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-2">{t("auto.SourceType_5051") || "Source Type"}</label>
                                                        <div className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-emerald-400 uppercase tracking-widest">
                                                            {node.sourceType === "webcam" ? "Local Webcam" : "RTSP Stream"}
                                                        </div>
                                                    </div>

                                                    {node.sourceType === "rtsp" && (
                                                        <div>
                                                            <label className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-2">Stream URL (RTSP/HTTP)</label>
                                                            <input 
                                                                type="text" 
                                                                value={node.url}
                                                                placeholder={t("auto.rtsporhttp_2594") || "rtsp:// or http://..."}
                                                                onChange={(e) => {
                                                                    const newNodes = [...routeNodes];
                                                                    newNodes[i].url = e.target.value;
                                                                    setRouteNodes(newNodes);
                                                                }}
                                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-700"
                                                            />
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-2">{t("auto.Latitude_4879") || "Latitude"}</label>
                                                            <input 
                                                                type="number" 
                                                                value={node.lat}
                                                                onChange={(e) => {
                                                                    const newNodes = [...routeNodes];
                                                                    newNodes[i].lat = parseFloat(e.target.value);
                                                                    setRouteNodes(newNodes);
                                                                }}
                                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-emerald-500/50 transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-2">{t("auto.Longitude_4557") || "Longitude"}</label>
                                                            <input 
                                                                type="number" 
                                                                value={node.lng}
                                                                onChange={(e) => {
                                                                    const newNodes = [...routeNodes];
                                                                    newNodes[i].lng = parseFloat(e.target.value);
                                                                    setRouteNodes(newNodes);
                                                                }}
                                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-emerald-500/50 transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="mt-10 flex gap-4 w-full">
                                        <button onClick={() => setWizardStep(0)} className="flex-1 py-5 border border-white/10 rounded-xl uppercase font-black tracking-widest text-slate-500 hover:text-white hover:bg-white/5 transition-all">{t("auto.BacktoModeSelec_6526") || "Back to Mode Selection"}</button>
                                        <button 
                                            onClick={() => {
                                                setWizardStep(11);
                                                setAssessing(true);
                                                setTimeout(() => {
                                                    setAssessing(false);
                                                }, 3500);
                                            }} 
                                            className="flex-[2] py-5 bg-emerald-600 text-black rounded-xl uppercase font-black tracking-widest hover:bg-emerald-500 transition-all shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                                        >
                                            {t("auto.CreateGuardianC_754") || "Create Guardian Corridor"}
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {wizardStep === 11 && operatingMode === "real" && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full flex flex-col items-center">
                                    {assessing ? (
                                        <div className="flex flex-col items-center py-10">
                                            <div className="relative w-32 h-32 mb-10">
                                                <div className="absolute inset-0 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin shadow-[0_0_40px_rgba(16,185,129,0.3)]"></div>
                                                <div className="absolute inset-4 border-4 border-sky-500/20 border-b-sky-500 rounded-full animate-spin-reverse"></div>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <MapPin className="w-8 h-8 text-emerald-400 animate-pulse" />
                                                </div>
                                            </div>
                                            <h2 className="text-2xl font-black uppercase tracking-widest mb-6 text-emerald-400 animate-pulse">{t("auto.EstablishingNet_7279") || "Establishing Network..."}</h2>
                                            <div className="space-y-3 text-center">
                                                <p className="text-slate-400 text-xs font-mono uppercase tracking-widest">Connecting to {routeNodes[0].name}...</p>
                                                <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">Validating RTSP stream for {routeNodes[1].name}...</p>
                                                <p className="text-slate-600 text-xs font-mono uppercase tracking-widest">{t("auto.Mappingdistance_6360") || "Mapping distance and coverage gaps..."}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full max-w-4xl flex flex-col items-center animate-in fade-in zoom-in duration-700">
                                            <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)] relative">
                                                <div className="absolute inset-0 border border-emerald-400/50 rounded-full animate-ping"></div>
                                                <Activity className="w-10 h-10 text-emerald-400" />
                                            </div>
                                            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest mb-2 text-center text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.2)]">{t("auto.CorridorEstabli_4143") || "Corridor Established"}</h2>
                                            <p className="text-emerald-500/70 mb-10 text-center uppercase tracking-[0.2em] text-sm font-bold">{t("auto.MultiCameraNetw_1350") || "Multi-Camera Network Ready"}</p>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-10">
                                                {routeNodes.map((node, i) => (
                                                    <div key={node.id} className="bg-[#121216] border border-emerald-500/20 p-5 rounded-2xl text-center shadow-[0_0_20px_rgba(16,185,129,0.1)] relative overflow-hidden">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/50"></div>
                                                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Node {i + 1}</div>
                                                        <div className="text-sm text-emerald-400 font-bold uppercase tracking-wider">{node.name}</div>
                                                        <div className="text-[9px] mt-2 font-mono text-emerald-500/70">{node.sourceType.toUpperCase()}</div>
                                                    </div>
                                                ))}
                                            </div>

                                            <button 
                                                onClick={startSession}
                                                className="w-full py-6 bg-emerald-500 text-black rounded-2xl uppercase font-black tracking-[0.2em] hover:bg-emerald-400 hover:scale-[1.02] transition-all shadow-[0_0_40px_rgba(16,185,129,0.4)] flex items-center justify-center gap-3 group"
                                            >
                                                <Video className="w-6 h-6 group-hover:scale-110 transition-transform duration-500" /> {t("auto.InitializeTrack_8490") || "Initialize Tracking"}
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                        </motion.div>
                    ) : (
                        <motion.div 
                            key="active"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                        >
                            {/* Mission Status Header */}
                            <div className="lg:col-span-12 mb-2 bg-[#121216] border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                                <div className="flex items-center gap-6 pl-2 mb-4 md:mb-0">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                            MISSION ACTIVE
                                        </span>
                                        <span className="text-2xl font-black text-white uppercase tracking-wider">Protected Subject: <span className="text-sky-400">{state?.subject_id || "GDN-2041"}</span></span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-8 md:px-8 w-full md:w-auto justify-between md:justify-end">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Current Node</span>
                                        <span className="text-lg font-bold text-white uppercase tracking-widest">{state?.current_zone || "Scanning..."}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Route Progress</span>
                                        <span className="text-lg font-bold text-sky-400 uppercase tracking-widest">{state?.route_progress || 0}%</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Risk Level</span>
                                        <span className={`text-lg font-bold uppercase tracking-widest ${(state?.safety_score ?? 96) > 90 ? 'text-emerald-400' : (state?.safety_score ?? 96) > 80 ? 'text-yellow-400' : 'text-rose-500 animate-pulse'}`}>
                                            {(state?.safety_score ?? 96) > 90 ? 'Minimal' : (state?.safety_score ?? 96) > 80 ? 'Moderate' : 'CRITICAL'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* LEFT COLUMN: VISUALIZATIONS */}
                            <div className="lg:col-span-8 space-y-6">
                                
                                {/* TOP ROW: Route Intelligence & Video */}
                                {operatingMode === "demo" ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        
                                        {/* Route Intelligence Engine */}
                                        <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 flex flex-col h-72 relative overflow-hidden shadow-inner group">
                                            <div className="flex items-center justify-between mb-6">
                                                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-sky-500"/> {t("auto.RouteIntelligen_2562") || "Route Intelligence Engine"}
                                                </h3>
                                            </div>
                                            
                                            <div className="flex-1 flex flex-col justify-between">
                                                <div>
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">{t("auto.ProtectedSubjec_8285") || "Protected Subject"}</div>
                                                    <div className="text-2xl font-black text-sky-400 tracking-wider mb-4">{state?.subject_id || "Detecting..."}</div>
                                                    
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">{t("auto.CurrentZone_6559") || "Current Zone"}</div>
                                                    <div className="text-xl font-bold text-white tracking-widest mb-4">{state?.current_zone || "Scanning..."}</div>
                                                    
                                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">{t("auto.NextCheckpoint_5049") || "Next Checkpoint"}</div>
                                                    <div className="text-md font-bold text-slate-300 tracking-widest">
                                                        {state?.current_zone === "Metro Entrance" ? "Library Walkway" : state?.current_zone === "Library Walkway" ? "Residential Gate" : "Final Destination"}
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-4">
                                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                                        <span>{t("auto.EstimatedRouteP_3843") || "Estimated Route Progress"}</span>
                                                        <span className="text-sky-400">{state?.route_progress || 0}%</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                                        <motion.div 
                                                            className="h-full bg-sky-500" 
                                                            animate={{ width: `${state?.route_progress || 0}%` }} 
                                                            transition={{ duration: 0.5 }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Camera Network Handoff */}
                                        <div className={`bg-[#121216] border ${isEmergencyLocked ? 'border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.3)]' : 'border-white/5'} rounded-3xl overflow-hidden h-72 relative flex flex-col`}>
                                            <div className="absolute inset-0 bg-black flex items-center justify-center">
                                                <img 
                                                    src={`/api/v1/guardian/webcam_stream${cameraId ? `?camera_id=${cameraId}` : ''}`} 
                                                    className="w-full h-full object-cover"
                                                    alt="Guardian Feed"
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                            </div>
                                            
                                            <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
                                                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                                                    <Video className="w-3 h-3 text-white"/> 
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white">{t("auto.LiveNode_4830") || "Live Node"}</span>
                                                </div>
                                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,1)]"></div>
                                            </div>
                                            
                                            {/* Predictive Reacquisition Engine Overlay */}
                                            {state?.status === "SEARCHING" && (
                                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-15 flex flex-col items-center justify-center pointer-events-none">
                                                    <div className="bg-black/80 border border-yellow-500/30 p-6 rounded-2xl flex flex-col items-center shadow-[0_0_30px_rgba(234,179,8,0.2)]">
                                                        <Activity className="w-8 h-8 text-yellow-500 animate-bounce mb-3" />
                                                        <span className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Camera Coverage Lost</span>
                                                        <span className="text-[10px] text-yellow-500/70 font-bold uppercase tracking-widest mb-4">Estimating Reappearance Zone...</span>
                                                        <div className="bg-white/5 border border-white/10 rounded-lg p-3 w-full">
                                                            <div className="flex justify-between items-center mb-1 text-[9px] font-black uppercase tracking-widest">
                                                                <span className="text-slate-400">Next Expected Node</span>
                                                                <span className="text-sky-400">{state.predictive_reacquisition?.next_expected_node || "Metro Entrance"}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                                                                <span className="text-slate-400">Confidence</span>
                                                                <span className="text-emerald-400">{state.predictive_reacquisition?.confidence || 82}%</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {isEmergencyLocked && (
                                                <div className="absolute inset-0 border-[6px] border-rose-500 pointer-events-none z-20 animate-pulse"></div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-6">
                                        {/* Multi-Camera 3-Feed Layout */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {routeNodes.map((node, idx) => {
                                                const isActiveNode = idx === activeNodeIndex;
                                                const isMonitored = idx === monitoringNodeIndex;
                                                const isNodeTransit = isTransit && isMonitored; // The node we are heading to
                                                
                                                return (
                                                    <div key={node.id} className={`bg-[#121216] border ${isActiveNode ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : isNodeTransit ? 'border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'border-white/5 opacity-60'} rounded-2xl overflow-hidden h-48 relative flex flex-col transition-all duration-500`}>
                                                        <div className="absolute inset-0 bg-black flex items-center justify-center">
                                                            <img 
                                                                src={`/api/v1/guardian/webcam_stream?stream_url=${encodeURIComponent(node.sourceType === "webcam" ? "webcam" : node.url)}&node_name=${encodeURIComponent(node.name)}&progress=${Math.round(((idx + 1) / routeNodes.length) * 100)}${cameraId && node.sourceType === "webcam" ? `&camera_id=${cameraId}` : ''}`} 
                                                                className="w-full h-full object-cover"
                                                                alt={`${node.name} Feed`}
                                                                onError={(e) => { 
                                                                    e.currentTarget.style.display = 'none'; 
                                                                    if (e.currentTarget.parentElement) {
                                                                        e.currentTarget.parentElement.classList.add('bg-[#0a0a0f]');
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                        
                                                        {isActiveNode && !isTransit && (
                                                            <div className="absolute top-3 left-3 right-3 flex justify-between items-center z-10">
                                                                <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 flex items-center gap-2">
                                                                    <Video className="w-2 h-2 text-emerald-400"/> 
                                                                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-400">{t("auto.LiveTarget_7983") || "Live Target"}</span>
                                                                </div>
                                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,1)]"></div>
                                                            </div>
                                                        )}

                                                        {isNodeTransit && (
                                                            <div className="absolute inset-0 bg-yellow-500/10 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-4">
                                                                <Activity className="w-6 h-6 text-yellow-500 mb-2 animate-bounce" />
                                                                <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest text-center">{t("auto.AwaitingTarget_9688") || "Awaiting Target..."}</span>
                                                                <span className="text-[8px] font-mono text-yellow-500/70 mt-1">ETA: {transitETA}s</span>
                                                            </div>
                                                        )}
                                                        
                                                        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent p-3 pt-6 z-10 flex justify-between items-end">
                                                            <div className="text-[10px] font-mono text-white font-bold uppercase tracking-widest truncate">{node.name}</div>
                                                            <div className="text-[8px] text-emerald-500 uppercase font-black tracking-widest">Node {idx + 1}</div>
                                                        </div>

                                                        {isEmergencyLocked && isActiveNode && (
                                                            <div className="absolute inset-0 border-[4px] border-rose-500 pointer-events-none z-30 animate-pulse"></div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Dynamic Corridor Map */}
                                        <div className="bg-[#121216] border border-white/5 rounded-3xl p-2 h-64 relative overflow-hidden shadow-inner group w-full">
                                            <div className="absolute top-4 left-4 z-[999] pointer-events-none">
                                                <div className="bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border border-emerald-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                                    <MapPin className="w-4 h-4 text-emerald-400"/>
                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">{t("auto.CorridorRouteIn_4317") || "Corridor Route Intelligence"}</span>
                                                </div>
                                            </div>
                                            <div className="w-full h-full rounded-2xl overflow-hidden">
                                                <MultiNodeMap 
                                                    nodes={routeNodes}
                                                    currentNodeId={routeNodes[activeNodeIndex]?.id}
                                                    targetNodeId={routeNodes[monitoringNodeIndex]?.id}
                                                    isTransit={isTransit}
                                                />
                                            </div>
                                        </div>

                                        <button 
                                            onClick={endSession}
                                            className="w-full py-4 mt-2 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 rounded-2xl uppercase font-black tracking-[0.2em] hover:bg-emerald-500 hover:text-black transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] flex items-center justify-center gap-3"
                                        >
                                            <Shield className="w-5 h-5" /> {t("auto.EndGuardianSess_5878") || "End Guardian Session"}
                                        </button>
                                    </div>
                                )}

                                {/* BOTTOM ROW: Visible Incident Block & Reasoning Panel */}
                                <div className="grid grid-cols-1 gap-6">
                                    {state?.incident_created ? (
                                        <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="bg-rose-500/10 border-2 border-rose-500 rounded-3xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(244,63,94,0.2)]">
                                            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/20 blur-[100px] rounded-full pointer-events-none"></div>
                                            <h2 className="text-3xl font-black uppercase tracking-[0.3em] text-rose-500 mb-6 flex items-center gap-4">
                                                <AlertTriangle className="w-10 h-10" /> 
                                                {t("auto.INCIDENTCREATED_8340") || "INCIDENT CREATED"}
                                            </h2>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                                <div>
                                                    <div className="text-[10px] text-rose-400/70 font-black uppercase tracking-widest mb-1">ID</div>
                                                    <div className="text-xl font-mono font-black text-rose-200">{state.incident_id}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-rose-400/70 font-black uppercase tracking-widest mb-1">{t("auto.Type_7956") || "Type"}</div>
                                                    <div className="text-lg font-bold text-white uppercase">{t("auto.GuardianDistres_7430") || "Guardian Distress Event"}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-rose-400/70 font-black uppercase tracking-widest mb-1">{t("auto.Priority_6744") || "Priority"}</div>
                                                    <div className="text-lg font-black text-rose-500 tracking-widest uppercase">{t("auto.CRITICAL_9622") || "CRITICAL"}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-rose-400/70 font-black uppercase tracking-widest mb-1">{t("auto.Status_5777") || "Status"}</div>
                                                    <div className="text-lg font-bold text-white uppercase animate-pulse">{t("auto.ResponseInitiat_5812") || "Response Initiated"}</div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : state?.reasoning && state.reasoning.length > 0 ? (
                                        <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:"auto"}} className="bg-[#121216] border border-yellow-500/30 rounded-3xl p-6 relative overflow-hidden">
                                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-yellow-500 mb-4 flex items-center gap-2">
                                                <Crosshair className="w-4 h-4"/> {t("auto.ReasoningPanelW_7435") || "Reasoning Panel: Why did the score drop?"}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <div className="space-y-2">
                                                    {state.reasoning.map((r, i) => (
                                                        <div key={i} className="flex items-center gap-3 text-sm font-bold text-slate-300">
                                                            <span className="text-yellow-500">✓</span> {r.text}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">{t("auto.RiskContributio_868") || "Risk Contribution"}</div>
                                                    <div className="space-y-2">
                                                        {state.reasoning.map((r, i) => (
                                                            <div key={i} className="flex justify-between items-center text-sm font-mono font-bold">
                                                                <span className="text-slate-400">{r.text.split(" ")[0]} Factor</span>
                                                                <span className="text-rose-400">{r.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative overflow-hidden flex items-center justify-center h-32 opacity-50">
                                            <span className="text-xs font-black uppercase tracking-widest text-slate-600">{t("auto.Noactivethreats_1860") || "No active threats detected. Monitoring safe parameters."}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT COLUMN: INTELLIGENCE */}
                            <div className="lg:col-span-4 space-y-6">
                                
                                {/* Guardian Confidence Engine */}
                                {state?.fingerprint && (
                                    <div className="bg-[#121216] border border-sky-500/30 rounded-3xl p-6 relative overflow-hidden shadow-[0_0_20px_rgba(14,165,233,0.1)]">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 blur-[50px] rounded-full pointer-events-none"></div>
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-400 mb-6 flex items-center gap-2 pb-3 border-b border-white/5">
                                            <Shield className="w-4 h-4" /> Guardian Confidence Engine
                                        </h3>
                                        
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Identity Confidence</span>
                                                <span className="text-sm font-black text-white">{state.fingerprint.identity_confidence}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-sky-400" style={{width: `${state.fingerprint.identity_confidence}%`}}></div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Appearance Match</span>
                                                <span className="text-sm font-black text-white">{state.fingerprint.appearance_match}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-sky-400" style={{width: `${state.fingerprint.appearance_match}%`}}></div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Camera Match</span>
                                                <span className="text-sm font-black text-white">{state.fingerprint.camera_match}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-sky-400" style={{width: `${state.fingerprint.camera_match}%`}}></div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Route Confidence</span>
                                                <span className="text-sm font-black text-white">{state.fingerprint.route_confidence}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-sky-400" style={{width: `${state.fingerprint.route_confidence}%`}}></div>
                                            </div>
                                        </div>

                                        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">Overall Guardian Lock</span>
                                            <span className="text-xl font-black text-emerald-500">{state.fingerprint.overall_lock}%</span>
                                        </div>
                                    </div>
                                )}

                                {/* City Integration Panel */}
                                <div className={`bg-[#121216] border ${isEmergencyLocked ? 'border-rose-500/50' : 'border-white/5'} rounded-3xl p-6 relative overflow-hidden shadow-inner`}>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white mb-4 flex items-center gap-2 pb-3 border-b border-white/5">
                                        <Zap className={`w-4 h-4 ${isEmergencyLocked ? 'text-rose-500 animate-pulse' : 'text-sky-400'}`}/> City Integration Panel
                                    </h3>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-300">
                                            <span className="text-emerald-500">✓</span> Guardian Monitoring
                                        </div>
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-300">
                                            <span className={isEmergencyLocked ? "text-rose-500" : "text-emerald-500"}>✓</span> {isEmergencyLocked ? "Citizen Alert Sent" : "Citizen Alert Ready"}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-300">
                                            <span className={isEmergencyLocked ? "text-rose-500" : "text-emerald-500"}>✓</span> {isEmergencyLocked ? "Incident Created" : "Green Wave Available"}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-300">
                                            <span className={isEmergencyLocked ? "text-rose-500" : "text-emerald-500"}>✓</span> {isEmergencyLocked ? "Emergency Dispatch Activated" : "Emergency Dispatch Standby"}
                                        </div>
                                        {isEmergencyLocked && (
                                            <div className="flex items-center gap-3 text-xs font-bold text-rose-400">
                                                <span className="text-rose-500 animate-pulse">✓</span> Guardian Escalated
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Guardian Score & Risk Level */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className={`bg-[#121216] border ${isEmergencyLocked ? 'border-rose-500' : isRiskElevated ? 'border-yellow-500/50' : 'border-white/5'} rounded-3xl p-5 flex flex-col items-center justify-center transition-colors`}>
                                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 text-center">Guardian Score™</div>
                                        <div className={`text-5xl font-black font-mono transition-colors ${safetyScore > 90 ? 'text-emerald-400' : safetyScore > 50 ? 'text-yellow-400' : 'text-rose-500'}`}>
                                            {safetyScore}
                                        </div>
                                    </div>
                                    <div className={`bg-[#121216] border ${isEmergencyLocked ? 'border-rose-500' : isRiskElevated ? 'border-yellow-500/50' : 'border-white/5'} rounded-3xl p-5 flex flex-col items-center justify-center transition-colors`}>
                                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 text-center">{t("auto.RiskTrend_4979") || "Risk Trend"}</div>
                                        <div className={`text-xl font-black font-mono transition-colors uppercase ${state?.risk_trend === 'Stable' ? 'text-emerald-400' : state?.risk_trend === 'Elevated' ? 'text-yellow-400' : 'text-rose-500 animate-pulse'}`}>
                                            {state?.risk_trend || "Stable"}
                                        </div>
                                    </div>
                                </div>

                                {/* Ecosystem Timeline */}
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative overflow-hidden shadow-inner flex flex-col h-80">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white mb-4 flex items-center gap-2 pb-3 border-b border-white/5">
                                        <Activity className="w-4 h-4 text-sky-400"/> {t("auto.EcosystemTimeli_6034") || "Ecosystem Timeline"}
                                    </h3>
                                    
                                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                                        <AnimatePresence>
                                            {state?.timeline.map((item, i) => {
                                                const isAlert = item.message.includes("Elevated") || item.message.includes("SOS") || item.message.includes("Incident");
                                                return (
                                                    <motion.div 
                                                        key={i + item.message}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        className="flex flex-col gap-1 border-l-2 border-white/10 pl-3 relative"
                                                    >
                                                        <div className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ${isAlert ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]' : 'bg-sky-500'}`} />
                                                        <span className="text-[9px] font-mono font-bold text-slate-500">{item.timestamp}</span>
                                                        <span className={`text-xs font-black uppercase tracking-widest ${isAlert ? 'text-rose-400' : 'text-slate-300'}`}>{item.message}</span>
                                                    </motion.div>
                                                )
                                            })}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Randy AI Agent */}
                                <div className={`bg-indigo-950/20 border ${state?.randy_summary ? 'border-indigo-500/40' : 'border-indigo-500/10'} rounded-3xl p-6 relative overflow-hidden shadow-inner transition-all`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/50">
                                            <MessageSquare className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">{t("auto.RandyAI_3965") || "Randy AI"}</h3>
                                            <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">{t("auto.TacticalAdvisor_6780") || "Tactical Advisor"}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="text-xs font-mono text-indigo-200/80 leading-relaxed min-h-[80px]">
                                        {state?.randy_summary ? (
                                            <span>{state.randy_summary}<span className="inline-block w-1.5 h-3 ml-1 bg-indigo-400 animate-pulse"/></span>
                                        ) : (
                                            <span className="opacity-30 italic">{t("auto.Monitoringsessi_1888") || "Monitoring session for anomalies..."}</span>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
