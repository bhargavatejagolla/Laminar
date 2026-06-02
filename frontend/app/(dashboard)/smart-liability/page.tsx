"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Activity, 
    ArrowLeft, 
    AlertTriangle,
    CheckCircle, 
    ChevronRight, 
    Database, 
    FileText, 
    HardDrive, 
    ShieldAlert,
    Cpu,
    Crosshair,
    Video,
    Users,
    Siren,
    Scale,
    ShieldCheck,
    Radar
} from "lucide-react";

// Wave background matching Laminar aesthetic
const WaveBackground = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 mix-blend-screen z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-20">
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.15)_0%,transparent_50%)] animate-pulse" style={{ animationDuration: '4s' }} />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_80%,transparent_100%)]"></div>
    </div>
);

export default function SmartLiabilityPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<"dashboard" | "tactical" | "liability">("dashboard");

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white pb-24 relative overflow-hidden font-sans selection:bg-amber-500/30 selection:text-amber-200" style={{ '--amber-400': '#fbbf24', '--amber-500': '#f59e0b', '--slate-400': '#94a3b8', '--slate-500': '#64748b' } as React.CSSProperties}>
            <WaveBackground />

            {/* Top glowing strip */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 z-50 shadow-[0_0_15px_rgba(245,158,11,0.5)]"></div>

            <div className="relative z-10 px-6 pt-10 max-w-7xl mx-auto">
                {/* Header Section */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-12">
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
                                <ShieldCheck className="w-5 h-5 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-500">
                                    Tactical Node Override
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] mb-2">
                                Laminar Liability <span className="text-amber-500">Intelligence</span>
                            </h1>
                            <p className="text-xs md:text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                Real-Time Smart Liability Guidance & Tactical Routing Engine V2.1
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shadow-[0_0_8px_rgba(245,158,11,1)]"></span>
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">System Online</span>
                        </div>
                    </div>
                </motion.div>

                {/* Dashboard Navigation Tabs */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex gap-4 mb-8 border-b border-white/5 pb-4">
                    {[
                        { id: "dashboard", label: "Live Command", icon: Activity },
                        { id: "tactical", label: "Tactical Override", icon: Crosshair },
                        { id: "liability", label: "Liability Intelligence", icon: Scale }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                activeTab === tab.id 
                                    ? "bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)]" 
                                    : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </motion.div>

                <AnimatePresence mode="wait">
                    {activeTab === "dashboard" && (
                        <motion.div 
                            key="dashboard"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                        >
                            {/* Main Empty State Panel (mimicking screenshot) */}
                            <div className="lg:col-span-2 bg-[#121216] border border-white/5 rounded-3xl p-10 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden group shadow-inner">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.05)_0%,transparent_60%)]"></div>
                                
                                <motion.div 
                                    animate={{ opacity: [0.5, 1, 0.5] }} 
                                    transition={{ duration: 3, repeat: Infinity }}
                                    className="mb-8 p-6 bg-white/5 rounded-full border border-white/5"
                                >
                                    <AlertTriangle className="w-16 h-16 text-slate-500" strokeWidth={1.5} />
                                </motion.div>
                                
                                <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-4 drop-shadow-md">No Liability Nodes Detected</h2>
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest max-w-md text-center leading-relaxed">
                                    Deploy edge infrastructure into venues tagged as "Liability" to enable local intelligence protocols.
                                </p>
                            </div>

                            {/* Right Side Panels */}
                            <div className="space-y-6">
                                {/* Infrastructure Load */}
                                <div className="bg-[#121216] border border-amber-500/20 rounded-3xl p-6 relative overflow-hidden shadow-[inset_0_0_20px_rgba(245,158,11,0.02)]">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-6">Infrastructure Load</h3>
                                    
                                    <div className="mb-8">
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Capacity</span>
                                            <span className="text-xl font-black font-mono">0%</span>
                                        </div>
                                        <div className="w-full h-2 bg-black rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full w-0 bg-amber-500"></div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                        <div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Venues</span>
                                            <span className="text-2xl font-black font-mono text-white">0</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Edge Nodes</span>
                                            <span className="text-2xl font-black font-mono text-amber-500">0</span>
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
                                        No critical incidents currently detected. Maintaining standard dynamic monitoring pattern.
                                    </p>
                                </div>
                                
                                <div className="text-right text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/50 flex items-center justify-end gap-2">
                                    Sync State <span className="text-amber-500">0.4ms Latency</span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "tactical" && (
                        <motion.div 
                            key="tactical"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-12"
                        >
                            <div className="max-w-4xl">
                                <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-white">AI-Powered Emergency Infrastructure Control</h2>
                                <p className="text-lg text-slate-400 font-medium leading-relaxed mb-8">
                                    During emergencies, manual coordination wastes valuable time. Tactical Node Override is LAMINAR's autonomous infrastructure coordination layer. When a critical incident is detected, LAMINAR temporarily overrides normal operational priorities and automatically allocates resources toward the affected area.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InfoCard 
                                    icon={Radar}
                                    title="1. Incident Detection"
                                    color="amber"
                                    content={
                                        <ul className="space-y-2 text-sm text-slate-300 font-mono">
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Kinetic SOS & Crowd Intelligence</li>
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> AMBER Protocol & Guardian Route</li>
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> AI Video Search</li>
                                            <li className="mt-4 p-3 bg-black/50 border border-white/5 rounded-lg text-rose-400 font-bold">
                                                Crowd Crush Detected<br/>
                                                Risk Level: CRITICAL<br/>
                                                Location: Gate B
                                            </li>
                                        </ul>
                                    }
                                />

                                <InfoCard 
                                    icon={Crosshair}
                                    title="2. Resource Identification"
                                    color="blue"
                                    content={
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            LAMINAR automatically identifies nearby operational assets in real-time, including: Cameras, Security Teams, Emergency Personnel, Smart Gates, Traffic Signals, Public Displays, and PA Systems.
                                        </p>
                                    }
                                />

                                <InfoCard 
                                    icon={Video}
                                    title="3. Tactical Override Activation"
                                    color="rose"
                                    content={
                                        <div className="space-y-4">
                                            <p className="text-sm text-slate-300 leading-relaxed">The system temporarily prioritizes the affected zone.</p>
                                            <div className="bg-black/50 border border-white/5 p-3 rounded-lg font-mono text-xs space-y-2">
                                                <div className="flex justify-between items-center opacity-50">
                                                    <span>Multiple Nodes</span> <span>→ General Monitoring</span>
                                                </div>
                                                <div className="flex justify-between items-center text-rose-400 font-bold border-t border-white/10 pt-2">
                                                    <span>Cam 12 (Main)</span> <span>→ Emergency Tracking</span>
                                                </div>
                                                <div className="flex justify-between items-center text-amber-400 font-bold border-t border-white/10 pt-2">
                                                    <span>Cam 14 (South)</span> <span>→ Crowd Dispersion</span>
                                                </div>
                                                <div className="flex justify-between items-center text-emerald-400 font-bold border-t border-white/10 pt-2">
                                                    <span>Cam 08 (Perim)</span> <span>→ Evac Route Scan</span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-400">The entire local camera grid automatically refocuses on the active incident and escape routes. Nearest personnel receive location, multi-angle live feeds, and risk scores.</p>
                                        </div>
                                    }
                                />

                                <InfoCard 
                                    icon={Activity}
                                    title="4. Live Command Dashboard"
                                    color="emerald"
                                    content={
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            Operators see the active incident, resource deployment status, response progress, incident timeline, and infrastructure state—all from a single, unified command interface. The entire process happens within seconds.
                                        </p>
                                    }
                                />
                            </div>

                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-8 text-center max-w-4xl mx-auto">
                                <h3 className="text-xl font-black text-amber-500 uppercase tracking-widest mb-2">When every second matters...</h3>
                                <p className="text-3xl font-black uppercase tracking-tighter text-white drop-shadow-md">Infrastructure responds automatically.</p>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "liability" && (
                        <motion.div 
                            key="liability"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-12"
                        >
                            <div className="max-w-4xl">
                                <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-white">AI-Powered Evidence, Compliance & Legal Defense</h2>
                                <p className="text-lg text-slate-400 font-medium leading-relaxed mb-8">
                                    After an incident, organizations face challenges: missing evidence, conflicting statements, legal investigations, and liability claims. <strong>Liability Intelligence</strong> automatically creates a complete digital evidence trail for every significant event detected within LAMINAR.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InfoCard 
                                    icon={Siren}
                                    title="1. Event Capture"
                                    color="rose"
                                    content={
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            Whenever an incident occurs (Crowd surge, Medical emergency, Security threat, Traffic accident), LAMINAR automatically begins evidence collection without human intervention.
                                        </p>
                                    }
                                />

                                <InfoCard 
                                    icon={Users}
                                    title="2. Evidence Packaging"
                                    color="sky"
                                    content={
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            The system gathers relevant video clips, camera snapshots, exact incident timelines, AI confidence scores, location data, and alert history into a secure package.
                                        </p>
                                    }
                                />

                                <InfoCard 
                                    icon={ShieldCheck}
                                    title="3. Response Audit Trail"
                                    color="indigo"
                                    content={
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            LAMINAR creates accountability by recording: Who received the alert, response times, actions taken, escalations triggered, and notifications sent.
                                        </p>
                                    }
                                />

                                <InfoCard 
                                    icon={FileText}
                                    title="4. Intelligence Reports"
                                    color="fuchsia"
                                    content={
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            Instantly generate Executive Incident Reports, PDF Evidence Packages, Compliance Reports, and Investigation Summaries. Ready for insurance claims or legal review in minutes.
                                        </p>
                                    }
                                />
                            </div>

                            <div className="bg-rose-500/5 border border-rose-500/20 rounded-3xl p-8 text-center max-w-4xl mx-auto mt-12">
                                <h3 className="text-xl font-black text-rose-500 uppercase tracking-widest mb-2">From detection to documentation</h3>
                                <p className="text-3xl font-black uppercase tracking-tighter text-white drop-shadow-md">Every incident leaves a verifiable digital trail.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function InfoCard({ icon: Icon, title, content, color }: { icon: any, title: string, content: React.ReactNode, color: "amber" | "rose" | "blue" | "emerald" | "sky" | "indigo" | "fuchsia" }) {
    const colorMap = {
        amber: "border-amber-500/30 bg-amber-500/5 text-amber-400 group-hover:border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
        rose: "border-rose-500/30 bg-rose-500/5 text-rose-400 group-hover:border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.1)]",
        blue: "border-blue-500/30 bg-blue-500/5 text-blue-400 group-hover:border-blue-500/60 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
        emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400 group-hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
        sky: "border-sky-500/30 bg-sky-500/5 text-sky-400 group-hover:border-sky-500/60 shadow-[0_0_15px_rgba(14,165,233,0.1)]",
        indigo: "border-indigo-500/30 bg-indigo-500/5 text-indigo-400 group-hover:border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.1)]",
        fuchsia: "border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-400 group-hover:border-fuchsia-500/60 shadow-[0_0_15px_rgba(217,70,239,0.1)]",
    };

    return (
        <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 group transition-all hover:bg-[#15151a]">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-5 transition-all ${colorMap[color]}`}>
                <Icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black uppercase tracking-widest text-white mb-4">{title}</h3>
            {content}
        </div>
    );
}
