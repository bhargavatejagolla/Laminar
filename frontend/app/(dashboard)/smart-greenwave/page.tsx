"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ArrowLeft, 
    AlertTriangle, 
    Cpu, 
    Zap,
    UploadCloud,
    Siren,
    Clock,
    Activity,
    Trash2,
    CheckCircle2,
    ShieldCheck,
    Navigation,
    Route,
    Search,
    Target
} from "lucide-react";

const WaveBackground = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 mix-blend-screen z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-20">
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.15)_0%,transparent_50%)] animate-pulse" style={{ animationDuration: '4s' }} />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_80%,transparent_100%)]"></div>
    </div>
);

type SignalState = "red" | "green" | "yellow";

export default function SmartGreenWavePage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    
    // Core App States
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Simulation States
    const [logs, setLogs] = useState<{time: string, text: string, type: 'info' | 'alert'}[]>([]);
    const [density, setDensity] = useState<string>("Low");
    const [targetId, setTargetId] = useState<string>("");
    const [confidence, setConfidence] = useState<number>(0);
    const [vehicleCount, setVehicleCount] = useState<number>(0);
    const [candidateCount, setCandidateCount] = useState<number>(0);
    const [avgSpeed, setAvgSpeed] = useState<number>(0);
    const [congestionIndex, setCongestionIndex] = useState<number>(0);
    const [status, setStatus] = useState<string>("NO EMERGENCY");
    const [reasoning, setReasoning] = useState<any>({ light: 0, motion: 0, vehicle: 0, priority: 0 });
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [simStep, setSimStep] = useState(0);

    const [corridorNodes, setCorridorNodes] = useState({
        A: { eta: "8s", cleared: false, status: "Preparing" },
        B: { eta: "19s", cleared: false, status: "Standby" },
        C: { eta: "31s", cleared: false, status: "Standby" }
    });

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsAnalyzing(true);
            setSimStep(1);
            setLogs([{ time: new Date().toLocaleTimeString('en-US', { hour12: false }), text: "Uploading video to analysis engine...", type: "info" }]);
            
            const formData = new FormData();
            formData.append("file", file);
            
            try {
                const res = await fetch("http://localhost:8000/api/v1/greenwave/upload", {
                    method: "POST",
                    body: formData
                });
                const data = await res.json();
                const session_id = data.session_id;
                setSessionId(session_id);
                
                // Connect to stream
                setVideoUrl(`http://localhost:8000/api/v1/greenwave/stream/${session_id}`);
                
                // Connect to SSE
                const sse = new EventSource(`http://localhost:8000/api/v1/greenwave/events/stream/${session_id}`);
                sse.onmessage = (event) => {
                    const parsed = JSON.parse(event.data);
                    if (parsed.status) {
                        setStatus(parsed.status);
                        
                        // Map status to simStep for visual timeline if needed
                        if (parsed.status === "SCANNING") setSimStep(1);
                        else if (parsed.status === "CANDIDATE" || parsed.status === "CANDIDATE FOUND") setSimStep(2);
                        else if (parsed.status === "VERIFYING" || parsed.status === "TRACKING") setSimStep(3);
                        else if (parsed.status === "CONFIRMED") setSimStep(4);
                        else if (parsed.status === "CORRIDOR ACTIVE") setSimStep(5);
                        else if (parsed.status === "MISSION COMPLETE") setSimStep(6);
                        
                        setLogs(parsed.logs || []);
                        if (parsed.target_id !== undefined) setTargetId(parsed.target_id);
                        if (parsed.confidence !== undefined) setConfidence(parsed.confidence);
                        if (parsed.density !== undefined) setDensity(parsed.density);
                        if (parsed.vehicle_count !== undefined) setVehicleCount(parsed.vehicle_count);
                        if (parsed.candidate_count !== undefined) setCandidateCount(parsed.candidate_count);
                        if (parsed.avg_speed !== undefined) setAvgSpeed(parsed.avg_speed);
                        if (parsed.congestion_index !== undefined) setCongestionIndex(parsed.congestion_index);
                        if (parsed.reasoning !== undefined) setReasoning(parsed.reasoning);
                        if (parsed.corridor_nodes) setCorridorNodes(parsed.corridor_nodes);
                    }
                };
            } catch (err) {
                console.error(err);
                setLogs(prev => [{ time: new Date().toLocaleTimeString('en-US', { hour12: false }), text: "Failed to upload video to engine", type: "alert" }, ...prev]);
            }
        }
    };

    const resetSystem = async () => {
        if (sessionId) {
            try {
                await fetch(`http://localhost:8000/api/v1/greenwave/reset/${sessionId}`, { method: "POST" });
            } catch(e) {}
        }
        if (videoUrl && !videoUrl.includes('localhost')) URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
        setIsAnalyzing(false);
        setLogs([]);
        setSimStep(0);
        setSessionId(null);
        setTargetId("");
        setConfidence(0);
        setVehicleCount(0);
        setCandidateCount(0);
        setAvgSpeed(0);
        setCongestionIndex(0);
        setDensity("Low");
        setStatus("NO EMERGENCY");
        setReasoning({ light: 0, motion: 0, vehicle: 0, priority: 0 });
        setCorridorNodes({
            A: { eta: "8s", cleared: false, status: "Preparing" },
            B: { eta: "19s", cleared: false, status: "Standby" },
            C: { eta: "31s", cleared: false, status: "Standby" }
        });
    };

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white pb-24 relative overflow-hidden font-sans selection:bg-emerald-500/30 selection:text-emerald-200" style={{ '--emerald-400': '#34d399', '--emerald-500': '#10b981', '--slate-400': '#94a3b8', '--slate-500': '#64748b' } as React.CSSProperties}>
            <WaveBackground />
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 z-50 shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>

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
                                <Activity className="w-5 h-5 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-500">
                                    Emergency Corridor Intelligence Engine
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] mb-2">
                                Laminar Green Wave <span className="text-emerald-500">2.0</span>
                            </h1>
                            <p className="text-xs md:text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                Detect • Verify • Track • Predict • Clear Corridor • Measure Impact
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shadow-[0_0_8px_rgba(16,185,129,1)]"></span>
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">System Online</span>
                        </div>
                        {isAnalyzing && (
                            <button onClick={resetSystem} className="p-2 bg-red-500/10 border border-red-500/30 rounded-xl hover:bg-red-500/20 transition-all text-red-400" title="Delete Feed & Reset">
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </motion.div>

                <AnimatePresence mode="wait">
                    {!isAnalyzing ? (
                        // EMPTY STATE
                        <motion.div 
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                        >
                            <div className="lg:col-span-2 bg-[#121216] border border-white/5 rounded-3xl p-10 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden group shadow-inner">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.05)_0%,transparent_60%)]"></div>
                                
                                <motion.div 
                                    animate={{ opacity: [0.5, 1, 0.5] }} 
                                    transition={{ duration: 3, repeat: Infinity }}
                                    className="mb-8 p-6 bg-white/5 rounded-full border border-white/5"
                                >
                                    <AlertTriangle className="w-16 h-16 text-slate-500" strokeWidth={1.5} />
                                </motion.div>
                                
                                <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-4 drop-shadow-md">No Emergency Vehicle Detected</h2>
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest max-w-md text-center leading-relaxed mb-8">
                                    Corridor Engine standby. Upload a video, stream RTSP, or trigger via Guardian SOS.
                                </p>
                                
                                <label className="cursor-pointer relative z-10 group/btn flex flex-col items-center">
                                    <div className="px-6 py-3 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest flex items-center gap-3 transition-all group-hover/btn:bg-emerald-400 group-hover/btn:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                                        <UploadCloud className="w-5 h-5" /> Upload Video
                                    </div>
                                    <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                                    <span className="text-[10px] text-slate-500 font-mono mt-3 uppercase tracking-widest">or RTSP / Guardian Trigger</span>
                                </label>
                            </div>

                            <div className="space-y-6">
                                {/* Infrastructure Load */}
                                <div className="bg-[#121216] border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden shadow-[inset_0_0_20px_rgba(16,185,129,0.02)]">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-6">Infrastructure Load</h3>
                                    
                                    <div className="mb-8">
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Capacity</span>
                                            <span className="text-xl font-black font-mono">0%</span>
                                        </div>
                                        <div className="w-full h-2 bg-black rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full w-0 bg-emerald-500"></div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                        <div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Venues</span>
                                            <span className="text-2xl font-black font-mono text-white">0</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Edge Nodes</span>
                                            <span className="text-2xl font-black font-mono text-emerald-500">0</span>
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
                                        No vehicles currently detected. Maintain standard dynamic pattern.
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                    ) : (
                        
                        // LIVE ANALYSIS STATE
                        <motion.div 
                            key="analyzing"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                        >
                            {/* LEFT PANEL: Emergency Vehicle Discovery */}
                            <div className="space-y-6 flex flex-col">
                                <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-emerald-500">Emergency Vehicle Discovery</h3>
                                
                                <div className="bg-black border border-emerald-500/30 rounded-3xl overflow-hidden relative shadow-[0_0_30px_rgba(16,185,129,0.1)] group">
                                    <img 
                                        src={videoUrl!} 
                                        alt="Green Wave Live Feed"
                                        className="w-full h-[250px] object-cover opacity-80"
                                    />
                                    <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-sm border border-emerald-500/50 rounded-lg text-emerald-400 font-mono text-[10px] font-black uppercase flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> LIVE FEED
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-[#121216] border border-white/5 rounded-2xl p-4 shadow-inner">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Live Traffic</div>
                                        <div className="text-xl font-black text-white">{vehicleCount} <span className="text-xs text-slate-400">Total Vehicles</span></div>
                                    </div>
                                    <div className="bg-[#121216] border border-white/5 rounded-2xl p-4 shadow-inner">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Congestion</div>
                                        <div className={`text-xl font-black ${density === 'High' ? 'text-rose-400' : density === 'Medium' ? 'text-yellow-400' : 'text-emerald-400'}`}>{density}</div>
                                    </div>
                                </div>

                                <div className="bg-[#121216] border border-rose-500/20 rounded-2xl p-6 shadow-inner flex-1 flex flex-col justify-center">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-4">Emergency Candidate Panel</h4>
                                    {targetId ? (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                <span className="text-xs font-mono text-slate-400">Candidate ID</span>
                                                <span className="text-sm font-bold font-mono text-white">{targetId}</span>
                                            </div>
                                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                <span className="text-xs font-mono text-slate-400">Type</span>
                                                <span className="text-sm font-bold font-mono text-rose-400">Emergency Vehicle</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-mono text-slate-400">Current Confidence</span>
                                                <span className="text-sm font-bold font-mono text-emerald-400">{confidence}%</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center text-slate-500 font-mono text-xs">Scanning for candidates...</div>
                                    )}
                                </div>
                            </div>

                            {/* CENTER PANEL: Emergency Lifecycle Engine */}
                            <div className="bg-[#121216] border border-white/5 rounded-3xl p-8 shadow-inner relative overflow-hidden flex flex-col">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.03)_0%,transparent_70%)]"></div>
                                <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-8 relative z-10">Emergency Lifecycle Engine</h3>
                                
                                <div className="space-y-4 relative z-10 flex-1">
                                    <LifecycleStep title="SEARCHING" active={simStep >= 1} current={simStep === 1} icon={Search} />
                                    <LifecycleStep title="CANDIDATE FOUND" active={simStep >= 2} current={simStep === 2} icon={Target} />
                                    <LifecycleStep title="VERIFYING" active={simStep >= 3} current={simStep === 3} icon={Navigation} />
                                    <LifecycleStep title="CONFIRMED" active={simStep >= 4} current={simStep === 4} icon={CheckCircle2} />
                                    <LifecycleStep title="CORRIDOR ACTIVE" active={simStep >= 5} current={simStep === 5} icon={Zap} />
                                    <LifecycleStep title="MISSION COMPLETE" active={simStep >= 6} current={simStep === 6} icon={ShieldCheck} />
                                </div>
                                
                                <AnimatePresence>
                                    {(simStep >= 4) && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0, marginTop: 0 }} 
                                            animate={{ opacity: 1, height: 'auto', marginTop: 32 }}
                                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                            className="pt-6 border-t border-white/10"
                                        >
                                            <div className="flex items-center justify-between mb-6">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Center Map Corridor</h4>
                                            </div>
                                            <div className="space-y-4 px-2">
                                                <JunctionNode name="Junction A" eta={corridorNodes.A.eta} status={corridorNodes.A.status} cleared={corridorNodes.A.cleared} />
                                                <JunctionNode name="Junction B" eta={corridorNodes.B.eta} status={corridorNodes.B.status} cleared={corridorNodes.B.cleared} />
                                                <JunctionNode name="Junction C" eta={corridorNodes.C.eta} status={corridorNodes.C.status} cleared={corridorNodes.C.cleared} />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* RIGHT PANEL: AI Reasoning Engine & Impact */}
                            <div className="space-y-6 flex flex-col">
                                <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-emerald-500">AI Reasoning Engine</h3>
                                
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 shadow-inner flex-1">
                                    <div className="space-y-4 mb-8">
                                        <ReasoningRow label="Light Signature" score={reasoning.light} />
                                        <ReasoningRow label="Route Consistency" score={reasoning.priority} />
                                        <ReasoningRow label="Vehicle Profile" score={reasoning.vehicle} />
                                        <ReasoningRow label="Motion Priority" score={reasoning.motion} />
                                        <div className="pt-4 mt-4 border-t border-white/10 flex justify-between items-center">
                                            <span className="text-xs font-black uppercase tracking-widest text-white">Final Confidence</span>
                                            <span className="text-2xl font-black font-mono text-emerald-400">{confidence}%</span>
                                        </div>
                                    </div>

                                    <div className="bg-black/50 p-4 rounded-xl border border-white/5 mb-6">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Reasoning</h4>
                                        <ul className="space-y-2">
                                            <ReasoningCheck text="Emergency light sequence detected" active={reasoning.light > 60} />
                                            <ReasoningCheck text="Persistent route trajectory" active={reasoning.priority > 60} />
                                            <ReasoningCheck text="Priority vehicle profile" active={reasoning.vehicle > 60} />
                                            <ReasoningCheck text="Traffic density context active" active={density !== 'Low'} />
                                            <ReasoningCheck text="Confidence > 75%" active={confidence > 75} />
                                        </ul>
                                    </div>
                                </div>

                                <div className="bg-[#121216] border border-sky-500/20 rounded-3xl p-6 shadow-inner mt-auto">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-sky-400 mb-4">Impact Intelligence</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <ImpactStat label="Vehicles Analysed" value={vehicleCount * 14} />
                                        <ImpactStat label="Emergency Vehicles" value={simStep >= 4 ? "1" : "0"} />
                                        <ImpactStat label="Junctions Cleared" value={Object.values(corridorNodes).filter(n => n.cleared).length.toString()} />
                                        <ImpactStat label="System Confidence" value={`${confidence}%`} />
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

// Subcomponents

function JunctionNode({ name, eta, status, cleared }: { name: string, eta: string, status: string, cleared: boolean }) {
    return (
        <div className={`flex justify-between items-center p-3 rounded-xl border transition-all ${cleared ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-black/40 border-white/5'}`}>
            <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white">{name}</div>
                <div className="text-[9px] font-mono text-slate-500">ETA {eta}</div>
            </div>
            <div className={`text-[10px] font-black uppercase tracking-widest ${cleared ? 'text-emerald-400' : status === 'Preparing' ? 'text-yellow-400' : 'text-slate-500'}`}>
                {cleared ? '✓ Cleared' : status}
            </div>
        </div>
    );
}

function LifecycleStep({ title, active, current, icon: Icon }: { title: string, active: boolean, current: boolean, icon: any }) {
    return (
        <div className={`flex items-center gap-4 p-3 rounded-xl border transition-all duration-500 ${current ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : active ? 'bg-white/5 border-emerald-500/20' : 'bg-transparent border-transparent opacity-40'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${current ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : active ? 'bg-emerald-500 border-emerald-400 text-black' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                {active && !current ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            <div className="flex-1">
                <div className={`text-[10px] font-black uppercase tracking-widest ${current ? 'text-emerald-400' : active ? 'text-white' : 'text-slate-500'}`}>{title}</div>
            </div>
            {current && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
        </div>
    );
}

function ReasoningRow({ label, score }: { label: string, score: number }) {
    return (
        <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
            </div>
            <div className="flex items-center gap-4">
                <div className={`text-sm font-black font-mono ${score > 70 ? 'text-emerald-400' : score > 30 ? 'text-yellow-400' : 'text-rose-400'}`}>{score}%</div>
            </div>
        </div>
    );
}

function ReasoningCheck({ text, active }: { text: string, active: boolean }) {
    return (
        <li className="flex items-start gap-2">
            <span className={`text-[10px] font-black mt-0.5 ${active ? 'text-emerald-500' : 'text-slate-600'}`}>{active ? '✓' : '○'}</span>
            <span className={`text-[10px] font-mono leading-tight ${active ? 'text-emerald-100' : 'text-slate-600'}`}>{text}</span>
        </li>
    );
}

function ImpactStat({ label, value }: { label: string, value: string | number }) {
    return (
        <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</span>
            <span className="text-xl font-black font-mono text-white">{value}</span>
        </div>
    );
}
