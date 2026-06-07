"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
    ShieldAlert, 
    Shield, 
    BrainCircuit, 
    Zap, 
    Box, 
    Target, 
    ShieldCheck, 
    Activity,
    Cpu,
    Radio,
    Fingerprint,
    ScanLine,
    Droplets,
    HeartPulse
} from "lucide-react";

const MODULES = [
    {
        id: "guardian",
        name: "Guardian Route",
        desc: "AI Personal Protection Network. Autonomous threat tracking and dynamic safety routing.",
        href: "/smart-guardian",
        icon: Shield,
        color: "sky",
        metric: "1042 Active Sessions",
        status: "OPTIMAL"
    },
    {
        id: "amber",
        name: "Instant AMBER Protocol",
        desc: "Rapid deployment missing person tracking with automated trajectory prediction.",
        href: "/amber-rescue",
        icon: Target,
        color: "amber",
        metric: "Scanning 1.2M nodes",
        status: "STANDBY"
    },
    {
        id: "kinetic",
        name: "Kinetic SOS",
        desc: "Behavioral threat analysis. Detects panic, running, and distress gestures instantly.",
        href: "/smart-kinetic",
        icon: BrainCircuit,
        color: "rose",
        metric: "8.4ms Latency",
        status: "ACTIVE"
    },
    {
        id: "greenwave",
        name: "AI Green Wave",
        desc: "Autonomous emergency traffic intelligence. Clears roads before sirens arrive.",
        href: "/smart-greenwave",
        icon: Zap,
        color: "emerald",
        metric: "0 Corridors Active",
        status: "OPTIMAL"
    },
    {
        id: "sos",
        name: "NAV.SOS Management",
        desc: "Centralized emergency coordination, dispatch, and responder routing.",
        href: "/sos-management",
        icon: ShieldAlert,
        color: "red",
        metric: "All Units Clear",
        status: "STANDBY"
    },
    {
        id: "liability",
        name: "Liability Defense",
        desc: "Immutable incident documentation, automated audits, and risk intelligence.",
        href: "/smart-liability",
        icon: ShieldCheck,
        color: "indigo",
        metric: "100% Coverage",
        status: "OPTIMAL"
    },
    {
        id: "spatial",
        name: "4D Spatial Engine",
        desc: "Next-gen structural analytics. Visualizes real-time load, density, and flow.",
        href: "/spatial-engine",
        icon: Box,
        color: "fuchsia",
        metric: "Tracking 24 Venues",
        status: "ACTIVE"
    },
    {
        id: "resonance",
        name: "Resonance Engine",
        desc: "Eulerian Structural Micro-Vibration Analysis. Predicts bridge and building collapses seconds before failure.",
        href: "/smart-resonance",
        icon: Activity,
        color: "orange",
        metric: "Monitoring 4 Bridges",
        status: "ACTIVE"
    },
    {
        id: "liquidthreat",
        name: "Liquid Threat Engine",
        desc: "Multi-Node Urban Flood Intelligence & Autonomous Route Intervention System.",
        href: "/smart-liquidthreat",
        icon: Droplets,
        color: "cyan",
        metric: "4 Active Corridors",
        status: "MONITORING"
    },
    {
        id: "aegis",
        name: "AEGIS Protocol",
        desc: "Autonomous Emergency Guidance & Intervention System. Orchestrates drones, civilians, and traffic for medical events.",
        href: "/smart-aegis",
        icon: HeartPulse,
        color: "rose",
        metric: "1 Active Dispatch",
        status: "ARMED"
    }
];

// Color maps for Tailwind
const COLOR_MAP: Record<string, { text: string, bg: string, border: string, shadow: string, glow: string }> = {
    sky: { text: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30", shadow: "hover:shadow-[0_0_30px_rgba(56,189,248,0.2)]", glow: "shadow-[0_0_15px_rgba(56,189,248,0.8)]" },
    cyan: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", shadow: "hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]", glow: "shadow-[0_0_15px_rgba(34,211,238,0.8)]" },
    amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", shadow: "hover:shadow-[0_0_30px_rgba(245,158,11,0.2)]", glow: "shadow-[0_0_15px_rgba(245,158,11,0.8)]" },
    rose: { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", shadow: "hover:shadow-[0_0_30px_rgba(244,63,94,0.2)]", glow: "shadow-[0_0_15px_rgba(244,63,94,0.8)]" },
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", shadow: "hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]", glow: "shadow-[0_0_15px_rgba(16,185,129,0.8)]" },
    red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", shadow: "hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]", glow: "shadow-[0_0_15px_rgba(239,68,68,0.8)]" },
    indigo: { text: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/30", shadow: "hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]", glow: "shadow-[0_0_15px_rgba(99,102,241,0.8)]" },
    fuchsia: { text: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", shadow: "hover:shadow-[0_0_30px_rgba(217,70,239,0.2)]", glow: "shadow-[0_0_15px_rgba(217,70,239,0.8)]" },
    orange: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", shadow: "hover:shadow-[0_0_30px_rgba(249,115,22,0.2)]", glow: "shadow-[0_0_15px_rgba(249,115,22,0.8)]" }
};

export default function SentinelCommandPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden font-sans pb-24 selection:bg-cyan-500/30">
            {/* Neural Grid Background */}
            <div className="absolute inset-0 pointer-events-none z-0 opacity-30">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_60%,transparent_100%)]"></div>
            </div>

            <div className="relative z-10 px-6 pt-12 max-w-[1400px] mx-auto">
                
                {/* ── Global Header ─────────────────────────── */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-16 text-center flex flex-col items-center relative">
                    <button 
                        onClick={() => router.push("/dashboard")}
                        className="absolute left-0 top-0 flex items-center gap-2 text-slate-400 hover:text-cyan-400 uppercase tracking-widest text-[10px] font-black transition-colors bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg"
                    >
                        <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        Main Dashboard
                    </button>

                    <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-6 shadow-[0_0_20px_rgba(34,211,238,0.15)] mt-4 md:mt-0">
                        <ScanLine className="w-4 h-4 text-cyan-400" />
                        <span className="text-[10px] font-black tracking-[0.2em] uppercase text-cyan-400">Autonomous Protection Layer</span>
                    </div>
                    
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)] mb-4">
                        Sentinel Command
                    </h1>
                    
                    <p className="text-sm md:text-base font-mono text-slate-400 max-w-2xl">
                        Laminar's highest-level tactical intelligence hub. All autonomous threat detection, dynamic routing, and rapid response modules are active and standing by.
                    </p>
                </motion.div>

                {/* ── Readiness Score Panel ─────────────────────────── */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    transition={{ delay: 0.1 }}
                    className="mb-16 bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 flex flex-col md:flex-row items-center justify-between gap-8 shadow-[inset_0_0_50px_rgba(34,211,238,0.02)]"
                >
                    <div className="flex items-center gap-8">
                        <div className="relative flex items-center justify-center">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="w-32 h-32 rounded-full border border-dashed border-cyan-500/40 absolute" />
                            <motion.div animate={{ rotate: -360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="w-28 h-28 rounded-full border border-cyan-500/20 absolute" />
                            <div className="w-24 h-24 rounded-full bg-cyan-500/10 flex flex-col items-center justify-center border border-cyan-500/50 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
                                <span className="text-3xl font-black text-cyan-400 font-mono">99.9</span>
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-500">%</span>
                            </div>
                        </div>
                        <div>
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Global System Health</h2>
                            <div className="text-2xl font-black uppercase tracking-widest text-white">Sentinel Readiness Score</div>
                        </div>
                    </div>

                    <div className="flex gap-12">
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 flex items-center gap-2"><Cpu className="w-3 h-3"/> Neural Cores</span>
                            <span className="text-2xl font-black font-mono text-white">7/7</span>
                            <span className="text-[10px] font-bold text-emerald-400 mt-1 uppercase tracking-widest">Active</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 flex items-center gap-2"><Radio className="w-3 h-3"/> Telemetry</span>
                            <span className="text-2xl font-black font-mono text-white">12ms</span>
                            <span className="text-[10px] font-bold text-cyan-400 mt-1 uppercase tracking-widest">Latency</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 flex items-center gap-2"><Fingerprint className="w-3 h-3"/> Authorization</span>
                            <span className="text-2xl font-black font-mono text-white">CMD</span>
                            <span className="text-[10px] font-bold text-rose-400 mt-1 uppercase tracking-widest">Lvl 5</span>
                        </div>
                    </div>
                </motion.div>

                {/* ── Tactical Modules Grid ─────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {MODULES.map((mod, i) => {
                        const style = COLOR_MAP[mod.color];
                        
                        return (
                            <motion.div 
                                key={mod.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + (i * 0.05) }}
                                onClick={() => router.push(mod.href)}
                                className={`bg-[#0a0a0c]/80 backdrop-blur-xl border ${style.border} rounded-3xl p-6 relative overflow-hidden group cursor-pointer transition-all duration-300 ${style.shadow}`}
                            >
                                <div className={`absolute top-0 right-0 w-32 h-32 ${style.bg} blur-[50px] group-hover:scale-150 transition-transform duration-700 pointer-events-none rounded-full translate-x-1/2 -translate-y-1/2`}></div>
                                
                                <div className="flex justify-between items-start mb-6 relative z-10">
                                    <div className={`p-3 rounded-2xl ${style.bg} border ${style.border}`}>
                                        <mod.icon className={`w-6 h-6 ${style.text}`} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full bg-current ${style.text} animate-pulse ${style.glow}`}></span>
                                        <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${style.text}`}>{mod.status}</span>
                                    </div>
                                </div>

                                <h3 className="text-xl font-black uppercase tracking-widest text-white mb-2 relative z-10">{mod.name}</h3>
                                <p className="text-xs font-mono text-slate-400 mb-8 min-h-[40px] leading-relaxed relative z-10">{mod.desc}</p>
                                
                                <div className="flex items-center justify-between border-t border-white/10 pt-4 relative z-10 mt-auto">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        <Activity className="w-3 h-3" /> {mod.metric}
                                    </div>
                                    
                                    <button className={`text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-lg bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors ${style.text}`}>
                                        Open Module
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
