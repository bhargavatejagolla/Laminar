"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
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
    Radar,
    MapPin,
    Archive,
    ListChecks,
    Network,
    Gavel,
    Play
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
  const { t } = useTranslation();

    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<"dashboard" | "tactical" | "liability">("dashboard");
    const fallbackIncident = {
        id: "INC-2041",
        is_historical: true,
        type: "Crowd Surge & Exit Congestion",
        priority: "CRITICAL",
        status: "Closed",
        confidence: 92,
        evidence_count: 17,
        annotated_frame: null,
        timeline: [
            { time: "22:41:02", text: "Crowd Density Threshold Crossed", type: "warning" },
            { time: "22:41:08", text: "Panic Cluster Detected", type: "critical" },
            { time: "22:41:12", text: "Guardian Alert Triggered", type: "critical" },
            { time: "22:41:22", text: "Emergency Corridor Activated", type: "success" },
            { time: "22:41:31", text: "Incident Escalated", type: "info" }
        ],
        blackbox: [
            { time: "22:41:02", action: "Alert Generated", source: "Crowd Intel" },
            { time: "22:41:04", action: "Operator Acknowledged", source: "System" },
            { time: "22:41:10", action: "Green Wave Activated", source: "Traffic Node" },
            { time: "22:41:22", action: "Citizen Alert Sent", source: "Guardian API" },
            { time: "22:41:30", action: "Incident Closed", source: "Operator" }
        ],
        ai_determination: {
            primary_cause: "Exit Congestion",
            contributing_factors: ["High Density", "Route Obstruction"],
            predicted_avoidability: 72,
            confidence: 91
        },
        randy_summary: {
            cause: "Pedestrian congestion near Exit West",
            affected_area: "Gate A",
            potential_impact: "Evacuation delay",
            recommended_action: "Open alternate corridor",
            confidence: 89
        },
        map: {
            location: "Gate A",
            coordinates: "17.444, 78.377",
            nearest_camera: "CAM-07",
            nearest_exit: "EXIT-WEST"
        }
    };

    const [incident, setIncident] = useState<any>(fallbackIncident);

    useEffect(() => {
        setMounted(true);
        const fetchIncidents = async () => {
            try {
                const res = await fetch("http://localhost:8000/api/v1/incident/alerts");
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        setIncident({ ...fallbackIncident, ...data[0], is_historical: false });
                    } else {
                        setIncident(fallbackIncident);
                    }
                } else {
                    setIncident(fallbackIncident);
                }
            } catch (e) {
                console.error("Failed to fetch incidents", e);
                setIncident(fallbackIncident);
            }
        };
        fetchIncidents();
        const interval = setInterval(fetchIncidents, 3000);
        return () => clearInterval(interval);
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
                            <span className="text-[9px] font-black tracking-[0.1em] text-slate-500 uppercase mt-1">{t("auto.Backto_7489") || "Back to"}<br/>{t("auto.Command_9711") || "Command"}</span>
                        </button>

                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <ShieldCheck className="w-5 h-5 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-500">
                                    {t("auto.TacticalNodeOve_8323") || "Tactical Node Override"}
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] mb-2">
                                {t("auto.LaminarLiabilit_3283") || "Laminar Liability"} <span className="text-amber-500">{t("auto.Intelligence_328") || "Intelligence"}</span>
                            </h1>
                            <p className="text-xs md:text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                {t("auto.RealTimeSmartLi_2179") || "Real-Time Smart Liability Guidance & Tactical Routing Engine V2.1"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shadow-[0_0_8px_rgba(245,158,11,1)]"></span>
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">{t("auto.SystemOnline_4221") || "System Online"}</span>
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
                            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                        >
                            {/* Left Column: Open Incidents & Map */}
                            <div className="lg:col-span-3 space-y-6">
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative shadow-inner">
                                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                                        <Archive className="w-4 h-4 text-slate-400" />
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                                            {incident.is_historical ? "Historical Reconstruction" : "Open Incidents"}
                                        </h3>
                                    </div>
                                    
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 cursor-pointer hover:border-amber-500/50 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-sm font-black text-white">{incident.id}</span>
                                            <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded ${incident.status === 'Closed' ? 'bg-slate-500/20 text-slate-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                {incident.status}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-3">{incident.type}</div>
                                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono font-bold">
                                            <span>Confidence: <span className="text-emerald-400">{incident.confidence || 92}%</span></span>
                                            <span>Evid: <span className="text-sky-400">{incident.evidence_count || 17}</span></span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative shadow-inner">
                                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                                        <MapPin className="w-4 h-4 text-slate-400" />
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Incident Map</h3>
                                    </div>
                                    <div className="h-32 bg-slate-900 rounded-xl mb-4 relative overflow-hidden border border-white/10 flex items-center justify-center">
                                        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%,transparent_100%)] bg-[size:10px_10px]"></div>
                                        <div className="w-4 h-4 bg-rose-500 rounded-full animate-ping absolute"></div>
                                        <div className="w-2 h-2 bg-rose-500 rounded-full absolute"></div>
                                    </div>
                                    <div className="space-y-3 font-mono text-[10px] font-bold text-slate-400">
                                        <div className="flex justify-between"><span>Location</span><span className="text-white">{incident.map?.location || "Gate A"}</span></div>
                                        <div className="flex justify-between"><span>Coordinates</span><span className="text-sky-400">{incident.map?.coordinates || "17.444, 78.377"}</span></div>
                                        <div className="flex justify-between"><span>Nearest Cam</span><span className="text-white">{incident.map?.nearest_camera || "CAM-07"}</span></div>
                                        <div className="flex justify-between"><span>Nearest Exit</span><span className="text-white">{incident.map?.nearest_exit || "EXIT-WEST"}</span></div>
                                    </div>
                                </div>
                            </div>

                            {/* Center Column: Timeline & AI Determination */}
                            <div className="lg:col-span-5 space-y-6">
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-8 relative shadow-inner flex-1">
                                    <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                                        <div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 flex items-center gap-2 mb-1"><Activity className="w-3 h-3"/> AI Investigation Timeline</div>
                                            <h2 className="text-2xl font-black uppercase tracking-widest text-white drop-shadow-md">{incident.id}</h2>
                                        </div>
                                        <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                                            <ShieldCheck className="w-4 h-4" /> Reconstruction Complete
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                                        {(incident.timeline || []).map((event: any, i: number) => (
                                            <motion.div 
                                                key={i}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.15 }}
                                                className="relative flex items-center group is-active"
                                            >
                                                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#121216] bg-slate-800 text-slate-500 group-hover:text-amber-500 shadow shrink-0 relative z-10 transition-colors">
                                                    <div className={`w-3 h-3 rounded-full ${event.type === 'critical' ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]' : event.type === 'warning' ? 'bg-amber-500' : event.type === 'success' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                                                </div>
                                                
                                                <div className="ml-4 w-[calc(100%-3rem)] p-4 rounded-xl border border-white/5 bg-black/40 backdrop-blur shadow-sm group-hover:border-white/10 transition-colors">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`font-mono text-xs font-bold ${event.type === 'critical' ? 'text-rose-400' : 'text-slate-400'}`}>{event.time}</span>
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-200">{event.text}</div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                {/* AI Determination */}
                                <div className="bg-[#121216] border border-amber-500/30 rounded-3xl p-6 relative shadow-[0_0_20px_rgba(245,158,11,0.1)] overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-[50px] rounded-full pointer-events-none"></div>
                                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                                        <Gavel className="w-4 h-4 text-amber-500" />
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-500">AI Liability Determination</h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Primary Cause</div>
                                            <div className="text-sm font-bold text-white">{incident.ai_determination?.primary_cause || "Exit Congestion"}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Predicted Avoidability</div>
                                            <div className="text-sm font-black text-rose-400">{incident.ai_determination?.predicted_avoidability || 72}%</div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-4">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Contributing Factors</div>
                                        <div className="flex flex-wrap gap-2">
                                            {(incident.ai_determination?.contributing_factors || ["High Density", "Route Obstruction"]).map((factor: string, i: number) => (
                                                <span key={i} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs font-bold text-slate-300">
                                                    {factor}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">Assessment Confidence</span>
                                        <span className="text-xl font-black text-emerald-500">{incident.ai_determination?.confidence || 91}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Fusion, Randy, Black Box */}
                            <div className="lg:col-span-4 space-y-6">
                                
                                {/* Evidence Fusion */}
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative shadow-inner">
                                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                                        <Network className="w-4 h-4 text-slate-400" />
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Cross-System Evidence Fusion</h3>
                                    </div>
                                    <div className="space-y-3 font-mono text-xs font-bold text-slate-300">
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                            <div className="flex items-center gap-3"><CheckCircle className="w-4 h-4" /> Guardian Route</div>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                            <div className="flex items-center gap-3"><CheckCircle className="w-4 h-4" /> Crowd Intelligence</div>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                            <div className="flex items-center gap-3"><CheckCircle className="w-4 h-4" /> Green Wave</div>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                            <div className="flex items-center gap-3"><CheckCircle className="w-4 h-4" /> Flood Intelligence</div>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                            <div className="flex items-center gap-3"><CheckCircle className="w-4 h-4" /> 4D Playback</div>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                            <div className="flex items-center gap-3"><CheckCircle className="w-4 h-4" /> AI Video Search</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Black Box Recorder */}
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative shadow-inner">
                                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                                        <Database className="w-4 h-4 text-slate-400" />
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Black Box Recorder</h3>
                                    </div>
                                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-hide">
                                        {(incident.blackbox || []).map((log: any, i: number) => (
                                            <div key={i} className="flex flex-col border-l-2 border-slate-700 pl-3">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[9px] font-mono font-bold text-sky-400">{log.time}</span>
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{log.source}</span>
                                                </div>
                                                <span className="text-xs font-bold text-slate-300">{log.action}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Randy Investigation Summary */}
                                <div className="bg-[#121216] border border-fuchsia-500/30 rounded-3xl p-6 relative shadow-[inset_0_0_20px_rgba(217,70,239,0.02)]">
                                    <div className="flex items-center gap-3 mb-5 border-b border-white/5 pb-4">
                                        <div className="p-2 bg-fuchsia-500/10 rounded-xl border border-fuchsia-500/30">
                                            <Cpu className="w-5 h-5 text-fuchsia-400" />
                                        </div>
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-400">Randy Investigation Summary</h3>
                                    </div>
                                    
                                    <div className="space-y-4 text-xs font-mono text-slate-300 leading-relaxed">
                                        <div>
                                            <span className="text-slate-500 block text-[9px] uppercase tracking-widest font-black mb-1">Primary Cause</span>
                                            <span className="text-amber-400">{incident.randy_summary?.cause}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block text-[9px] uppercase tracking-widest font-black mb-1">Affected Area</span>
                                            <span className="text-white">{incident.randy_summary?.affected_area}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block text-[9px] uppercase tracking-widest font-black mb-1">Potential Impact</span>
                                            <span className="text-rose-400">{incident.randy_summary?.potential_impact}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block text-[9px] uppercase tracking-widest font-black mb-1">Recommended Action</span>
                                            <span className="text-emerald-400">{incident.randy_summary?.recommended_action}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div 
                                        onClick={() => router.push("/spatial-engine")}
                                        className="bg-sky-500/10 border border-sky-500/40 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-sky-500/20 transition-all text-center group shadow-[0_0_15px_rgba(14,165,233,0.1)]"
                                    >
                                        <Play className="w-6 h-6 text-sky-400 mb-2 group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">Reconstruct Incident</span>
                                    </div>
                                    <div 
                                        onClick={() => window.open("http://localhost:8000/api/v1/incident/report/pdf", "_blank")}
                                        className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-amber-500/20 transition-all text-center group shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                                    >
                                        <FileText className="w-6 h-6 text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Evidence Package</span>
                                    </div>
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
                                <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-white">{t("auto.AIPoweredEmerge_1663") || "AI-Powered Emergency Infrastructure Control"}</h2>
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
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {t("auto.KineticSOSCrowd_6166") || "Kinetic SOS & Crowd Intelligence"}</li>
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {t("auto.AMBERProtocolGu_5883") || "AMBER Protocol & Guardian Route"}</li>
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {t("auto.AIVideoSearch_767") || "AI Video Search"}</li>
                                            <li className="mt-4 p-3 bg-black/50 border border-white/5 rounded-lg text-rose-400 font-bold">
                                                {t("auto.CrowdCrushDetec_3765") || "Crowd Crush Detected"}<br/>
                                                {t("auto.RiskLevelCRITIC_3301") || "Risk Level: CRITICAL"}<br/>
                                                {t("auto.LocationGateB_2723") || "Location: Gate B"}
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
                                            {t("auto.LAMINARautomati_6941") || "LAMINAR automatically identifies nearby operational assets in real-time, including: Cameras, Security Teams, Emergency Personnel, Smart Gates, Traffic Signals, Public Displays, and PA Systems."}
                                        </p>
                                    }
                                />

                                <InfoCard 
                                    icon={Video}
                                    title="3. Tactical Override Activation"
                                    color="rose"
                                    content={
                                        <div className="space-y-4">
                                            <p className="text-sm text-slate-300 leading-relaxed">{t("auto.Thesystemtempor_3035") || "The system temporarily prioritizes the affected zone."}</p>
                                            <div className="bg-black/50 border border-white/5 p-3 rounded-lg font-mono text-xs space-y-2">
                                                <div className="flex justify-between items-center opacity-50">
                                                    <span>{t("auto.MultipleNodes_1658") || "Multiple Nodes"}</span> <span>→ General Monitoring</span>
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
                                            <p className="text-xs text-slate-400">{t("auto.Theentirelocalc_3375") || "The entire local camera grid automatically refocuses on the active incident and escape routes. Nearest personnel receive location, multi-angle live feeds, and risk scores."}</p>
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
                                <h3 className="text-xl font-black text-amber-500 uppercase tracking-widest mb-2">{t("auto.Wheneverysecond_7542") || "When every second matters..."}</h3>
                                <p className="text-3xl font-black uppercase tracking-tighter text-white drop-shadow-md">{t("auto.Infrastructurer_4114") || "Infrastructure responds automatically."}</p>
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
                                <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-white">{t("auto.AIPoweredEviden_6412") || "AI-Powered Evidence, Compliance & Legal Defense"}</h2>
                                <p className="text-lg text-slate-400 font-medium leading-relaxed mb-8">
                                    {t("auto.Afteranincident_8176") || "After an incident, organizations face challenges: missing evidence, conflicting statements, legal investigations, and liability claims."} <strong>{t("auto.LiabilityIntell_2856") || "Liability Intelligence"}</strong> {t("auto.automaticallycr_4307") || "automatically creates a complete digital evidence trail for every significant event detected within LAMINAR."}
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
                                            {t("auto.Thesystemgather_2643") || "The system gathers relevant video clips, camera snapshots, exact incident timelines, AI confidence scores, location data, and alert history into a secure package."}
                                        </p>
                                    }
                                />

                                <InfoCard 
                                    icon={ShieldCheck}
                                    title="3. Response Audit Trail"
                                    color="indigo"
                                    content={
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            {t("auto.LAMINARcreatesa_9864") || "LAMINAR creates accountability by recording: Who received the alert, response times, actions taken, escalations triggered, and notifications sent."}
                                        </p>
                                    }
                                />

                                <InfoCard 
                                    icon={FileText}
                                    title="4. Intelligence Reports"
                                    color="fuchsia"
                                    content={
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            {t("auto.Instantlygenera_7634") || "Instantly generate Executive Incident Reports, PDF Evidence Packages, Compliance Reports, and Investigation Summaries. Ready for insurance claims or legal review in minutes."}
                                        </p>
                                    }
                                />
                            </div>

                            <div className="bg-rose-500/5 border border-rose-500/20 rounded-3xl p-8 text-center max-w-4xl mx-auto mt-12">
                                <h3 className="text-xl font-black text-rose-500 uppercase tracking-widest mb-2">{t("auto.Fromdetectionto_9882") || "From detection to documentation"}</h3>
                                <p className="text-3xl font-black uppercase tracking-tighter text-white drop-shadow-md">{t("auto.Everyincidentle_1811") || "Every incident leaves a verifiable digital trail."}</p>
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
