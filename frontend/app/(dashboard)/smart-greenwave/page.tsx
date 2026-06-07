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
    Route
} from "lucide-react";

// Wave background matching Laminar aesthetic - Emerald Theme
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
    const videoRef = useRef<HTMLVideoElement>(null);

    // Simulation States
    const [logs, setLogs] = useState<{time: string, text: string, type: 'info' | 'alert'}[]>([]);
    const [signalA, setSignalA] = useState<SignalState>("green");
    const [signalB, setSignalB] = useState<SignalState>("red");
    const [signalC, setSignalC] = useState<SignalState>("red");
    const [clearedNodes, setClearedNodes] = useState(0);
    const [simStep, setSimStep] = useState(0);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setVideoUrl(url);
            startSimulation();
        }
    };

    const resetSystem = () => {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
        setIsAnalyzing(false);
        setLogs([]);
        setSignalA("green");
        setSignalB("red");
        setSignalC("red");
        setClearedNodes(0);
        setSimStep(0);
    };

    const addLog = (text: string, type: 'info' | 'alert' = 'info') => {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        setLogs(prev => [{ time, text, type }, ...prev].slice(0, 8));
    };

    // The core hackathon demo simulation sequence
    const startSimulation = () => {
        setIsAnalyzing(true);
        setSimStep(1);
        addLog("Initializing visual ingestion pipeline...", "info");

        setTimeout(() => addLog("YOLOv8 active. Scanning vehicles...", "info"), 1500);
        
        setTimeout(() => {
            addLog("TARGET LOCK: Ambulance Detected (AMB-102)", "alert");
            setSimStep(2);
        }, 3500);

        setTimeout(() => {
            addLog("Calculating optimal trajectory: Node A → B → C", "info");
            setSimStep(3);
        }, 5000);

        setTimeout(() => {
            addLog("GREEN WAVE CORRIDOR ACTIVATED", "alert");
            // Node A is already green. Ambulance passes.
            setClearedNodes(1);
        }, 7000);

        setTimeout(() => {
            addLog("Node A secured. Pre-empting Node B...", "info");
            setSignalA("red");
            setSignalB("green");
            setClearedNodes(2);
        }, 11000);

        setTimeout(() => {
            addLog("Node B secured. Pre-empting Node C...", "info");
            setSignalB("red");
            setSignalC("green");
            setClearedNodes(3);
            setSimStep(4);
            addLog("Corridor clear. Tactical operation successful.", "info");
        }, 16000);
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
                                    Tactical Node Override
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] mb-2">
                                Laminar Green Wave <span className="text-emerald-500">Intelligence</span>
                            </h1>
                            <p className="text-xs md:text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                Real-Time Smart Greenwave Guidance & Tactical Routing Engine V2.1
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
                                
                                <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-4 drop-shadow-md">No Green Wave Nodes Detected</h2>
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest max-w-md text-center leading-relaxed mb-8">
                                    Deploy edge infrastructure into venues tagged as "Greenwave" to enable local intelligence protocols.
                                </p>
                                
                                <label className="cursor-pointer relative z-10 group/btn flex flex-col items-center">
                                    <div className="px-6 py-3 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest flex items-center gap-3 transition-all group-hover/btn:bg-emerald-400 group-hover/btn:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                                        <UploadCloud className="w-5 h-5" /> Initialize Demo Feed
                                    </div>
                                    <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                                    <span className="text-[10px] text-slate-500 font-mono mt-3 uppercase tracking-widest">Upload .mp4 incident footage</span>
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
                            <div className="lg:col-span-2 space-y-6">
                                {/* Video Feed */}
                                <div className="bg-black border border-emerald-500/30 rounded-3xl overflow-hidden relative shadow-[0_0_30px_rgba(16,185,129,0.1)] group">
                                    <video 
                                        ref={videoRef}
                                        src={videoUrl!} 
                                        autoPlay 
                                        loop 
                                        muted 
                                        className="w-full h-[400px] object-cover opacity-80"
                                    />
                                    
                                    {/* Video Overlays */}
                                    <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-sm border border-emerald-500/50 rounded-lg text-emerald-400 font-mono text-[10px] font-black uppercase flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> LIVE STREAM: INT-A
                                    </div>
                                    
                                    {simStep >= 2 && (
                                        <motion.div initial={{ opacity: 0, scale: 1.5 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                            <div className="border-2 border-red-500 w-48 h-48 rounded flex items-end justify-center pb-2 relative bg-red-500/10">
                                                <div className="absolute -top-6 bg-red-500 text-black font-black text-[10px] px-2 py-1 rounded">AMBULANCE (99.4%)</div>
                                                <div className="w-10 h-10 border-t-2 border-l-2 border-red-500 absolute top-0 left-0" />
                                                <div className="w-10 h-10 border-b-2 border-r-2 border-red-500 absolute bottom-0 right-0" />
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* YOLO Detection Logs Overlay */}
                                    <div className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl p-3 max-h-32 overflow-hidden flex flex-col justify-end">
                                        <AnimatePresence>
                                            {logs.map((log, i) => (
                                                <motion.div 
                                                    key={i + log.text}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className={`text-[10px] font-mono mb-1 ${log.type === 'alert' ? 'text-rose-400 font-bold' : 'text-slate-300'}`}
                                                >
                                                    <span className="text-slate-500 mr-2">[{log.time}]</span>
                                                    {log.text}
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Dynamic Green Wave Corridor Map */}
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-8 shadow-inner">
                                    <div className="flex items-center justify-between mb-8">
                                        <div>
                                            <h3 className="text-lg font-black uppercase tracking-widest text-white drop-shadow-md">Predicted Route Corridor</h3>
                                            <p className="text-xs text-slate-400 font-mono mt-1">Autonomous sequential pre-emption active</p>
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[10px] font-black uppercase">
                                            <Zap className="w-3 h-3" /> Green Wave Online
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between relative mt-12 px-4">
                                        <div className="absolute top-1/2 left-8 right-8 h-1 bg-white/10 -translate-y-1/2 rounded-full overflow-hidden">
                                            <motion.div 
                                                className="h-full bg-emerald-500" 
                                                initial={{ width: '0%' }}
                                                animate={{ width: simStep >= 4 ? '100%' : simStep >= 3 ? '50%' : '10%' }}
                                                transition={{ duration: 1 }}
                                            />
                                        </div>
                                        
                                        <IntersectionNode name="Intersection A" signal={signalA} density="High" eta="12s" active={simStep >= 1} />
                                        <IntersectionNode name="Intersection B" signal={signalB} density="Medium" eta="28s" active={simStep >= 3} />
                                        <IntersectionNode name="Intersection C" signal={signalC} density="Low" eta="43s" active={simStep >= 4} />
                                    </div>
                                    
                                    {/* Mini City Map Overlay */}
                                    {simStep >= 2 && (
                                        <motion.div 
                                            initial={{ opacity: 0, scale: 0.9 }} 
                                            animate={{ opacity: 1, scale: 1 }} 
                                            className="mt-12 bg-black/50 border border-emerald-500/20 rounded-2xl p-6 relative overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.05)_0%,transparent_70%)] pointer-events-none"></div>
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center justify-between">
                                                <span>Live City Map</span>
                                                <span className="text-emerald-500 animate-pulse">Pre-clearing route</span>
                                            </h4>
                                            
                                            <div className="flex flex-col items-center justify-center space-y-2 relative z-10 font-mono text-xs font-bold">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-emerald-400">H</div>
                                                    <span className="text-emerald-400 tracking-widest uppercase">Hospital</span>
                                                </div>
                                                <div className="h-6 w-0.5 bg-emerald-500/30 relative overflow-hidden">
                                                    {simStep >= 4 && <motion.div initial={{top:"100%"}} animate={{top:"0%"}} transition={{duration:1}} className="absolute inset-0 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />}
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-3 h-3 rounded-full ${simStep >= 4 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]' : 'bg-red-500'} transition-colors duration-500`} />
                                                    <span className={`${simStep >= 4 ? 'text-emerald-400' : 'text-slate-400'} tracking-widest`}>J-C</span>
                                                </div>
                                                <div className="h-6 w-0.5 bg-emerald-500/30 relative overflow-hidden">
                                                    {simStep >= 3 && <motion.div initial={{top:"100%"}} animate={{top:"0%"}} transition={{duration:1}} className="absolute inset-0 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />}
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-3 h-3 rounded-full ${simStep >= 3 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]' : 'bg-red-500'} transition-colors duration-500`} />
                                                    <span className={`${simStep >= 3 ? 'text-emerald-400' : 'text-slate-400'} tracking-widest`}>J-B</span>
                                                </div>
                                                <div className="h-6 w-0.5 bg-emerald-500/30 relative overflow-hidden">
                                                    {simStep >= 1 && <motion.div initial={{top:"100%"}} animate={{top:"0%"}} transition={{duration:1}} className="absolute inset-0 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />}
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />
                                                    <span className="text-emerald-400 tracking-widest">J-A</span>
                                                </div>
                                                <div className="h-6 w-0.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />
                                                
                                                <motion.div 
                                                    animate={{ y: [-2, 2, -2] }} 
                                                    transition={{ repeat: Infinity, duration: 2 }}
                                                    className="flex items-center gap-3 mt-2"
                                                >
                                                    <Siren className="w-5 h-5 text-rose-500" />
                                                    <span className="text-rose-400 tracking-widest uppercase">Ambulance</span>
                                                </motion.div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </div>

                            {/* Metrics & Analytics Sidebar */}
                            <div className="space-y-6">
                                
                                {/* Waiting Time Intelligence */}
                                <div className="bg-[#121216] border border-sky-500/20 rounded-3xl p-6 relative overflow-hidden shadow-[inset_0_0_20px_rgba(14,165,233,0.02)]">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 mb-6 flex items-center gap-2"><Clock className="w-4 h-4"/> Waiting Time Intelligence</h3>
                                    
                                    <div className="space-y-4">
                                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                                            <div className="flex justify-between items-center mb-2">
                                                <div>
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Without Laminar</div>
                                                    <div className="text-sm font-black font-mono text-slate-300">Normal Route</div>
                                                </div>
                                                <div className="text-xl font-black font-mono text-slate-400">4m 12s</div>
                                            </div>
                                            <div className="w-full h-2 bg-black rounded-full overflow-hidden border border-white/5">
                                                <div className="h-full w-full bg-red-500/50"></div>
                                            </div>
                                        </div>

                                        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                                            <div className="flex justify-between items-center mb-2">
                                                <div>
                                                    <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">With Laminar</div>
                                                    <div className="text-sm font-black font-mono text-emerald-400">Green Wave Route</div>
                                                </div>
                                                <div className="text-xl font-black font-mono text-emerald-400">1m 08s</div>
                                            </div>
                                            <div className="w-full h-2 bg-black rounded-full overflow-hidden border border-emerald-500/30">
                                                <div className="h-full w-[25%] bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 text-center border-t border-white/5 pt-4">
                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Total Impact</div>
                                        <div className="text-3xl font-black uppercase tracking-tighter text-white drop-shadow-md">
                                            3m 04s <span className="text-emerald-500 text-xl">SAVED</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Emergency Priority Score */}
                                <div className="bg-[#121216] border border-rose-500/20 rounded-3xl p-6 relative overflow-hidden">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Emergency Priority Status</h3>
                                    <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs font-mono">
                                        <div>
                                            <div className="text-[9px] text-slate-500 tracking-widest uppercase">Priority Level</div>
                                            <div className="text-rose-400 font-bold mt-1">CRITICAL</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] text-slate-500 tracking-widest uppercase">Patient Risk</div>
                                            <div className="text-rose-400 font-bold mt-1">HIGH</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] text-slate-500 tracking-widest uppercase">Corridor Status</div>
                                            <div className="text-emerald-400 font-bold mt-1">PREPARING</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] text-slate-500 tracking-widest uppercase">Response Mode</div>
                                            <div className="text-sky-400 font-bold mt-1">AUTONOMOUS</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Live Telemetry */}
                                <div className="grid grid-cols-2 gap-4">
                                    <MetricCard label="Target ID" value="AMB-102" sub="Emergency Vehicle" icon={Siren} color="rose" />
                                    <MetricCard label="Current Speed" value="42" sub="km/h" icon={Navigation} color="sky" />
                                    <MetricCard label="Intersections Cleared" value={clearedNodes.toString()} sub="Total Nodes" icon={Route} color="indigo" />
                                    <MetricCard label="ETA Reduction" value="72%" sub="Efficiency" icon={Activity} color="emerald" />
                                </div>

                                {/* Ecosystem Integration */}
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">AI Green Wave Active</h3>
                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-3">Linked Systems</div>
                                    <div className="space-y-2 text-xs font-mono font-bold text-slate-300">
                                        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Traffic Node</div>
                                        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Guardian Route</div>
                                        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Emergency Dispatch</div>
                                        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Incident Hub</div>
                                        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-fuchsia-500" /> Randy AI</div>
                                    </div>
                                </div>

                                {/* Randy Tactical Analysis */}
                                <div className="bg-fuchsia-950/20 border border-fuchsia-500/30 rounded-3xl p-6 relative overflow-hidden shadow-[inset_0_0_20px_rgba(217,70,239,0.05)]">
                                    <div className="flex items-center gap-3 mb-4 relative z-10">
                                        <div className="p-2 bg-fuchsia-500/20 rounded-lg border border-fuchsia-500/50">
                                            <ShieldCheck className="w-4 h-4 text-fuchsia-400" />
                                        </div>
                                        <span className="text-[11px] font-black text-fuchsia-400 uppercase tracking-[0.2em]">Randy Tactical Analysis</span>
                                    </div>
                                    
                                    <div className="relative z-10 space-y-3 text-xs font-mono leading-relaxed text-slate-300">
                                        <div className="text-rose-400 font-bold mb-3">Ambulance AMB-102 detected.</div>
                                        {simStep >= 2 && (
                                            <motion.div initial={{opacity:0}} animate={{opacity:1}}>
                                                <div className="text-slate-500">Traffic density at Junction B:</div>
                                                <div className="text-white font-bold text-sm">82%</div>
                                            </motion.div>
                                        )}
                                        {simStep >= 3 && (
                                            <motion.div initial={{opacity:0}} animate={{opacity:1}}>
                                                <div className="text-slate-500 mt-2">Predicted blockage:</div>
                                                <div className="text-red-400 font-bold text-sm">14 seconds</div>
                                            </motion.div>
                                        )}
                                        {simStep >= 4 && (
                                            <motion.div initial={{opacity:0}} animate={{opacity:1}}>
                                                <div className="text-slate-500 mt-2">Action Taken:</div>
                                                <div className="text-emerald-400 font-bold">Signal synchronization activated.</div>
                                                
                                                <div className="text-slate-500 mt-2">Expected ETA reduction:</div>
                                                <div className="text-emerald-400 font-bold text-sm">72%</div>
                                            </motion.div>
                                        )}
                                    </div>
                                </div>

                                <div className="text-center mt-8 px-4 opacity-50 hover:opacity-100 transition-opacity">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 italic">"Clearing the road before the siren arrives."</p>
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
function IntersectionNode({ name, signal, density, eta, active }: { name: string, signal: SignalState, density: string, eta: string, active?: boolean }) {
    return (
        <div className="relative z-10 flex flex-col items-center">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{name}</div>
            
            <div className="flex flex-col items-center justify-center text-[9px] font-mono mb-3 bg-black/40 px-2 py-1 rounded border border-white/5 w-24 text-center">
                <div className="text-slate-400">Density: <span className={density === 'High' ? 'text-red-400' : density === 'Medium' ? 'text-yellow-400' : 'text-emerald-400'}>{density}</span></div>
                <div className="text-slate-400 mt-0.5">ETA: <span className="text-white">{eta}</span></div>
            </div>

            <div className={`bg-black border p-2 rounded-xl flex flex-col gap-1.5 transition-all duration-300 ${active ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'border-white/10 shadow-lg'}`}>
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${signal === 'red' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'bg-red-950 opacity-30'}`} />
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${signal === 'yellow' ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.8)]' : 'bg-yellow-950 opacity-30'}`} />
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${signal === 'green' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]' : 'bg-emerald-950 opacity-30'}`} />
            </div>
        </div>
    );
}

function MetricCard({ label, value, sub, icon: Icon, color }: { label: string, value: string, sub: string, icon: any, color: string }) {
    const colorMap: Record<string, string> = {
        rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
        sky: "text-sky-400 bg-sky-500/10 border-sky-500/20",
        indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
        emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    };

    return (
        <div className="bg-[#121216] border border-white/5 rounded-2xl p-4 flex flex-col justify-between group hover:border-white/20 transition-all">
            <div className="flex items-center justify-between mb-4">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">{label}</span>
                <div className={`p-1.5 rounded-lg border ${colorMap[color]}`}>
                    <Icon className="w-3 h-3" />
                </div>
            </div>
            <div>
                <div className="text-xl font-black font-mono text-white tracking-tighter">{value}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{sub}</div>
            </div>
        </div>
    );
}
