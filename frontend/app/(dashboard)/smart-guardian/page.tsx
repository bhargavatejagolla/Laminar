"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ArrowLeft, 
    AlertTriangle, 
    Cpu, 
    Shield,
    ShieldAlert,
    Video,
    MapPin,
    Navigation,
    Activity,
    UploadCloud,
    MessageSquare,
    Zap,
    Trash2,
    Footprints,
    Eye
} from "lucide-react";

// Wave background matching Laminar aesthetic - Sky/Cyan Theme
const WaveBackground = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 mix-blend-screen z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-20">
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.15)_0%,transparent_50%)] animate-pulse" style={{ animationDuration: '4s' }} />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_80%,transparent_100%)]"></div>
    </div>
);

type DemoState = "idle" | "nominal" | "escalating";

export default function SmartGuardianPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    
    // Core Demo States
    const [demoState, setDemoState] = useState<DemoState>("idle");
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Simulation Data
    const [activeCamera, setActiveCamera] = useState("Camera A (Main Gate)");
    const [guardianScore, setGuardianScore] = useState(96);
    const [riskLevel, setRiskLevel] = useState<"LOW" | "MEDIUM" | "HIGH">("LOW");
    const [bubbleState, setBubbleState] = useState<"GREEN" | "YELLOW" | "RED">("GREEN");
    const [timeline, setTimeline] = useState<{time: string, event: string, color: string}[]>([]);
    const [randyText, setRandyText] = useState("");
    const [isEmergencyLocked, setIsEmergencyLocked] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const addTimelineEvent = (event: string, color: string = "text-slate-300") => {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        setTimeline(prev => [{ time, event, color }, ...prev]);
    };

    // Camera Handoff Loop during Nominal state
    useEffect(() => {
        if (demoState !== "nominal") return;
        
        let cams = ["Camera A (Main Gate)", "Camera B (Street 42)", "Camera C (Library Path)"];
        let i = 0;
        const interval = setInterval(() => {
            i = (i + 1) % cams.length;
            setActiveCamera(cams[i]);
            if (i > 0) addTimelineEvent(`Entered ${cams[i]} Zone`, "text-sky-400");
        }, 5000);

        return () => clearInterval(interval);
    }, [demoState]);

    const startSession = () => {
        setDemoState("nominal");
        setGuardianScore(96);
        setRiskLevel("LOW");
        setBubbleState("GREEN");
        setTimeline([]);
        setRandyText("");
        setIsEmergencyLocked(false);
        addTimelineEvent("Guardian Session #1042 Started", "text-emerald-400");
    };

    const handleThreatUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setVideoUrl(url);
            triggerEscalation();
        }
    };

    const triggerEscalation = () => {
        setDemoState("escalating");
        
        // Sequence of events for the demo WOW factor
        setTimeout(() => {
            addTimelineEvent("Unknown Subject Detected", "text-yellow-400");
            setBubbleState("YELLOW");
            setRiskLevel("MEDIUM");
            setGuardianScore(78);
        }, 2000);

        setTimeout(() => {
            addTimelineEvent("Follower Confidence 87%", "text-rose-400");
            setGuardianScore(54);
        }, 4000);

        setTimeout(() => {
            addTimelineEvent("Suspicious Following Confirmed", "text-rose-500 font-bold");
            setBubbleState("RED");
            setRiskLevel("HIGH");
            setGuardianScore(31);
        }, 6000);

        setTimeout(() => {
            addTimelineEvent("Safer Path Recalculated", "text-emerald-400");
            addTimelineEvent("Security Unit Assigned (1.2km)", "text-sky-400");
        }, 8000);

        setTimeout(() => {
            simulateRandyTyping("Guardian Session #1042 has detected a potential tailing pattern. The same individual has remained within close proximity across three camera zones. Risk level has been elevated to HIGH and nearby security resources have been notified.");
        }, 9000);
    };

    const simulateRandyTyping = (fullText: string) => {
        let i = 0;
        setRandyText("");
        const typing = setInterval(() => {
            setRandyText(fullText.substring(0, i));
            i++;
            if (i > fullText.length) clearInterval(typing);
        }, 30);
    };

    const triggerEmergencyShield = () => {
        setIsEmergencyLocked(true);
        addTimelineEvent("🚨 EMERGENCY SHIELD ACTIVATED", "text-rose-500 font-black");
        setGuardianScore(0);
        setBubbleState("RED");
    };

    const resetSystem = () => {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
        setDemoState("idle");
        setIsEmergencyLocked(false);
    };

    if (!mounted) return null;

    return (
        <div className={`min-h-screen ${isEmergencyLocked ? 'bg-rose-950/20' : 'bg-[#0a0a0c]'} text-white pb-24 relative overflow-hidden font-sans selection:bg-sky-500/30 selection:text-sky-200 transition-colors duration-1000`} style={{ '--sky-400': '#38bdf8', '--sky-500': '#0ea5e9', '--slate-400': '#94a3b8', '--slate-500': '#64748b' } as React.CSSProperties}>
            <WaveBackground />
            
            {/* Top glowing strip */}
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
                            <span className="text-[9px] font-black tracking-[0.1em] text-slate-500 uppercase mt-1">Back to<br/>Command</span>
                        </button>

                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Shield className={`w-5 h-5 ${isEmergencyLocked ? 'text-rose-500' : 'text-sky-500'} drop-shadow-[0_0_8px_rgba(14,165,233,0.8)]`} />
                                <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${isEmergencyLocked ? 'text-rose-500' : 'text-sky-500'}`}>
                                    AI Personal Protection Network
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] mb-2">
                                Laminar Guardian <span className={isEmergencyLocked ? 'text-rose-500' : 'text-sky-500'}>Route</span>
                            </h1>
                            <p className="text-xs md:text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                Real-Time Smart Guardian Guidance & Tactical Routing Engine V2.1
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        <div className="px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center gap-3 shadow-[0_0_15px_rgba(14,165,233,0.15)]">
                            <span className={`w-2 h-2 rounded-full ${isEmergencyLocked ? 'bg-rose-500' : 'bg-sky-500'} animate-ping`}></span>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isEmergencyLocked ? 'text-rose-400' : 'text-sky-400'}`}>System Online</span>
                        </div>
                        {demoState !== "idle" && (
                            <button onClick={resetSystem} className="text-[10px] font-mono text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
                                <Trash2 className="w-3 h-3" /> Reset Demo
                            </button>
                        )}
                    </div>
                </motion.div>

                <AnimatePresence mode="wait">
                    {demoState === "idle" ? (
                        
                        // IDLE / EMPTY STATE
                        <motion.div 
                            key="idle"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                        >
                            <div className="lg:col-span-2 bg-[#121216] border border-white/5 rounded-3xl p-10 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden group shadow-inner">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.05)_0%,transparent_60%)]"></div>
                                
                                <motion.div 
                                    animate={{ opacity: [0.5, 1, 0.5] }} 
                                    transition={{ duration: 3, repeat: Infinity }}
                                    className="mb-8 p-6 bg-white/5 rounded-full border border-white/5"
                                >
                                    <AlertTriangle className="w-16 h-16 text-slate-500" strokeWidth={1.5} />
                                </motion.div>
                                
                                <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-4 drop-shadow-md">No Guardian Route Nodes Detected</h2>
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest max-w-md text-center leading-relaxed mb-10">
                                    Deploy edge infrastructure into venues tagged as "Guardian" to enable local intelligence protocols.
                                </p>
                                
                                <button 
                                    onClick={startSession}
                                    className="relative z-10 px-8 py-4 rounded-xl bg-sky-500 text-black font-black uppercase tracking-[0.2em] flex items-center gap-3 transition-all hover:bg-sky-400 hover:scale-105 shadow-[0_0_30px_rgba(14,165,233,0.4)]"
                                >
                                    <Shield className="w-6 h-6" /> Start Guardian Session
                                </button>
                                <span className="text-[10px] text-slate-500 font-mono mt-3 uppercase tracking-widest relative z-10">Simulate "Walk Me Home" Request</span>
                            </div>

                            <div className="space-y-6">
                                {/* Infrastructure Load */}
                                <div className="bg-[#121216] border border-sky-500/20 rounded-3xl p-6 relative overflow-hidden shadow-[inset_0_0_20px_rgba(14,165,233,0.02)]">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-500 mb-6">Infrastructure Load</h3>
                                    
                                    <div className="mb-8">
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Capacity</span>
                                            <span className="text-xl font-black font-mono">0%</span>
                                        </div>
                                        <div className="w-full h-2 bg-black rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full w-0 bg-sky-500"></div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                        <div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Venues</span>
                                            <span className="text-2xl font-black font-mono text-white">0</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Edge Nodes</span>
                                            <span className="text-2xl font-black font-mono text-sky-500">0</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Decision Engine */}
                                <div className="bg-[#121216] border border-fuchsia-500/20 rounded-3xl p-6 relative overflow-hidden shadow-[inset_0_0_20px_rgba(217,70,239,0.02)]">
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="p-3 bg-fuchsia-500/10 rounded-xl border border-fuchsia-500/20">
                                            <Cpu className="w-6 h-6 text-fuchsia-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-[12px] font-black uppercase tracking-[0.1em] text-white">Decision Engine</h3>
                                            <span className="text-[9px] font-bold text-fuchsia-400 uppercase tracking-widest">Autonomous Phase</span>
                                        </div>
                                    </div>
                                    <p className="text-xs font-mono text-slate-400 leading-relaxed pt-2">
                                        No active Guardian Sessions. Maintain standard dynamic pattern.
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                    ) : (
                        
                        // ACTIVE / ESCALATING DEMO STATE
                        <motion.div 
                            key="active"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                        >
                            {/* LEFT COLUMN: VISUALIZATIONS */}
                            <div className="lg:col-span-8 space-y-6">
                                
                                {/* TOP ROW: Map & Camera */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    
                                    {/* Safe Route Intelligence */}
                                    <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 flex flex-col h-64 relative overflow-hidden shadow-inner group">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                                <MapPin className="w-4 h-4 text-sky-500"/> Safe Route Intelligence
                                            </h3>
                                            <div className="text-[10px] font-black bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20">
                                                ETA: 12 MINS
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 relative">
                                            {/* Stylized route line */}
                                            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-sky-500/30">
                                                <motion.div 
                                                    className="w-full bg-sky-400" 
                                                    initial={{ height: "0%" }} 
                                                    animate={{ height: "100%" }} 
                                                    transition={{ duration: 15, ease: "linear" }}
                                                />
                                            </div>
                                            
                                            <div className="space-y-4 relative z-10 pl-8">
                                                <div className="relative">
                                                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
                                                    <div className="text-sm font-bold text-white">Metro Station</div>
                                                </div>
                                                <div className="relative opacity-70">
                                                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-slate-600" />
                                                    <div className="text-sm font-bold text-white">Library Junction</div>
                                                </div>
                                                <div className="relative opacity-40">
                                                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-slate-600" />
                                                    <div className="text-sm font-bold text-white">Market Road</div>
                                                </div>
                                                <div className="relative opacity-20">
                                                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-slate-600" />
                                                    <div className="text-sm font-bold text-white">Apartment</div>
                                                </div>
                                            </div>

                                            {demoState === "escalating" && riskLevel === "HIGH" && (
                                                <motion.div initial={{opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} className="absolute bottom-0 right-0 bg-rose-500/10 border border-rose-500/30 p-2 rounded-lg text-rose-400 text-[9px] font-black uppercase">
                                                    Safe Route Recalculated
                                                </motion.div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Camera Network Handoff */}
                                    <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 flex flex-col h-64 relative overflow-hidden shadow-inner group">
                                        <div className="absolute inset-0 bg-black">
                                            {/* Simulated static camera background */}
                                            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] animate-[pulse_2s_infinite]"></div>
                                            {videoUrl && (
                                                <video src={videoUrl} autoPlay loop muted className="absolute inset-0 w-full h-full object-cover opacity-60" />
                                            )}
                                        </div>
                                        
                                        <div className="relative z-10 flex items-center justify-between mb-auto">
                                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white flex items-center gap-2 drop-shadow-md">
                                                <Video className="w-4 h-4 text-white"/> Camera Network
                                            </h3>
                                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,1)]"></div>
                                        </div>

                                        <div className="relative z-10 mt-auto">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 drop-shadow">Current Handoff</div>
                                            <motion.div 
                                                key={activeCamera} 
                                                initial={{opacity: 0, x: 20}} 
                                                animate={{opacity: 1, x: 0}} 
                                                className="text-lg font-black font-mono text-white drop-shadow-lg bg-black/40 px-3 py-1 rounded backdrop-blur inline-block border border-white/10"
                                            >
                                                {activeCamera}
                                            </motion.div>
                                        </div>

                                        {demoState === "idle" || demoState === "nominal" ? (
                                            <label className="absolute inset-0 flex items-center justify-center cursor-pointer group/upload bg-black/50 opacity-0 hover:opacity-100 transition-opacity backdrop-blur-sm">
                                                <div className="px-4 py-2 bg-sky-500 text-black font-black uppercase text-[10px] tracking-widest rounded flex items-center gap-2 group-hover/upload:scale-105 transition-transform">
                                                    <UploadCloud className="w-4 h-4" /> Inject Guardian Event
                                                </div>
                                                <input type="file" accept="video/*" className="hidden" onChange={handleThreatUpload} />
                                            </label>
                                        ) : null}

                                        {/* Dynamic Bounding Boxes during Escalation */}
                                        {demoState === "escalating" && (
                                            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="absolute inset-0 pointer-events-none">
                                                <div className="absolute top-1/4 left-1/4 border-2 border-emerald-500 w-24 h-48 rounded flex flex-col justify-end p-1 bg-emerald-500/10">
                                                    <span className="bg-emerald-500 text-black text-[8px] font-black px-1 rounded w-fit">USER</span>
                                                </div>
                                                {guardianScore < 90 && (
                                                    <motion.div initial={{scale:1.2, opacity:0}} animate={{scale:1, opacity:1}} className="absolute top-1/4 right-1/4 border-2 border-rose-500 w-24 h-48 rounded flex flex-col justify-end p-1 bg-rose-500/10">
                                                        <span className="bg-rose-500 text-black text-[8px] font-black px-1 rounded w-fit">UNKNOWN SUBJ</span>
                                                    </motion.div>
                                                )}
                                            </motion.div>
                                        )}
                                    </div>
                                </div>

                                {/* BOTTOM ROW: Dynamic Safety Bubble & Actions */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    
                                    {/* Safety Bubble Viz */}
                                    <div className="md:col-span-2 bg-[#121216] border border-white/5 rounded-3xl p-6 relative overflow-hidden flex items-center shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]">
                                        <div className="w-1/2 relative flex items-center justify-center h-32">
                                            <motion.div 
                                                className={`absolute inset-0 rounded-full border-2 border-dashed ${bubbleState === 'GREEN' ? 'border-emerald-500' : bubbleState === 'YELLOW' ? 'border-yellow-500' : 'border-rose-500'}`}
                                                animate={{ rotate: 360, scale: [1, 1.05, 1] }}
                                                transition={{ rotate: { duration: 20, repeat: Infinity, ease: "linear" }, scale: { duration: 2, repeat: Infinity } }}
                                            />
                                            <div className={`w-8 h-8 rounded-full ${bubbleState === 'GREEN' ? 'bg-emerald-500' : bubbleState === 'YELLOW' ? 'bg-yellow-500' : 'bg-rose-500'} shadow-[0_0_20px_currentColor]`} />
                                        </div>
                                        <div className="w-1/2 pl-6">
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
                                                <Footprints className="w-4 h-4"/> Dynamic Safety Bubble
                                            </h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="text-[9px] text-slate-500 uppercase font-black">Radius</div>
                                                    <div className="text-xl font-mono font-black text-white">30m</div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] text-slate-500 uppercase font-black mb-1">Status</div>
                                                    <div className={`px-2 py-1 inline-block rounded text-[10px] font-black uppercase border ${bubbleState === 'GREEN' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : bubbleState === 'YELLOW' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                                                        {bubbleState === 'GREEN' ? 'SAFE' : bubbleState === 'YELLOW' ? 'MONITORING' : 'THREAT DETECTED'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Panel */}
                                    <div className="flex flex-col gap-4">
                                        <button 
                                            onClick={triggerEmergencyShield}
                                            disabled={isEmergencyLocked}
                                            className={`flex-1 rounded-3xl border flex flex-col items-center justify-center p-4 transition-all ${isEmergencyLocked ? 'bg-rose-500/20 border-rose-500 opacity-50' : 'bg-rose-500/10 border-rose-500/50 hover:bg-rose-500/20 hover:border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.15)] hover:shadow-[0_0_30px_rgba(244,63,94,0.3)]'}`}
                                        >
                                            <ShieldAlert className={`w-8 h-8 mb-2 ${isEmergencyLocked ? 'text-rose-500' : 'text-rose-400'}`} />
                                            <span className="text-[11px] font-black text-rose-400 uppercase tracking-widest text-center">Emergency<br/>Shield</span>
                                        </button>
                                        
                                        {demoState === "escalating" && riskLevel === "HIGH" && (
                                            <motion.div initial={{opacity:0, scale:0.9}} animate={{opacity:1, scale:1}} className="flex-1 bg-sky-500/10 border border-sky-500/30 rounded-3xl p-4 flex flex-col items-center justify-center text-center">
                                                <Zap className="w-6 h-6 text-sky-400 mb-2" />
                                                <span className="text-[9px] font-black text-sky-400 uppercase tracking-widest">Security<br/>Notified</span>
                                            </motion.div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: INTELLIGENCE */}
                            <div className="lg:col-span-4 space-y-6">
                                
                                {/* Guardian Score & Risk Level */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className={`bg-[#121216] border ${isEmergencyLocked ? 'border-rose-500/30' : 'border-white/5'} rounded-3xl p-5 flex flex-col items-center justify-center transition-colors`}>
                                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 text-center">Guardian Score™</div>
                                        <div className={`text-4xl font-black font-mono transition-colors ${guardianScore > 80 ? 'text-emerald-400' : guardianScore > 50 ? 'text-yellow-400' : 'text-rose-500'}`}>
                                            {guardianScore}
                                        </div>
                                    </div>
                                    <div className={`bg-[#121216] border ${isEmergencyLocked ? 'border-rose-500/30' : 'border-white/5'} rounded-3xl p-5 flex flex-col items-center justify-center transition-colors`}>
                                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 text-center">Risk Level</div>
                                        <div className={`text-xl font-black font-mono transition-colors ${riskLevel === 'LOW' ? 'text-emerald-400' : riskLevel === 'MEDIUM' ? 'text-yellow-400' : 'text-rose-500'}`}>
                                            {riskLevel}
                                        </div>
                                    </div>
                                </div>

                                {/* Guardian Timeline */}
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative overflow-hidden shadow-inner flex flex-col h-64">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white mb-4 flex items-center gap-2 pb-3 border-b border-white/5">
                                        <Activity className="w-4 h-4 text-sky-400"/> Guardian Timeline
                                    </h3>
                                    
                                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                                        <AnimatePresence>
                                            {timeline.map((item, i) => (
                                                <motion.div 
                                                    key={i + item.event}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="flex flex-col gap-1"
                                                >
                                                    <span className="text-[9px] font-mono font-bold text-slate-500">{item.time}</span>
                                                    <span className={`text-xs font-black uppercase tracking-widest ${item.color}`}>{item.event}</span>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Randy AI Agent */}
                                <div className={`bg-indigo-950/20 border ${randyText ? 'border-indigo-500/40' : 'border-indigo-500/10'} rounded-3xl p-6 relative overflow-hidden shadow-inner group transition-all`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/50">
                                            <MessageSquare className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Randy AI</h3>
                                            <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">Tactical Advisor</span>
                                        </div>
                                    </div>
                                    
                                    <div className="text-xs font-mono text-indigo-200/80 leading-relaxed min-h-[80px]">
                                        {randyText ? (
                                            <span>{randyText}<span className="inline-block w-1.5 h-3 ml-1 bg-indigo-400 animate-pulse"/></span>
                                        ) : (
                                            <span className="opacity-30 italic">Monitoring session for anomalies...</span>
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
