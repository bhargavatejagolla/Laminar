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
  const { t } = useTranslation();

    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<"dashboard" | "tactical" | "liability">("dashboard");
    const [incident, setIncident] = useState<any>(null);

    useEffect(() => {
        setMounted(true);
        const fetchIncidents = async () => {
            try {
                const res = await fetch("http://localhost:8000/api/v1/incident/alerts");
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        setIncident(data[0]); // Get the most recent incident
                    }
                }
            } catch (e) {
                console.error("Failed to fetch incidents", e);
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
                            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                        >
                            {!incident ? (
                                /* Main Empty State Panel (mimicking screenshot) */
                                <div className="lg:col-span-2 bg-[#121216] border border-white/5 rounded-3xl p-10 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden group shadow-inner">
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.05)_0%,transparent_60%)]"></div>
                                    
                                    <motion.div 
                                        animate={{ opacity: [0.5, 1, 0.5] }} 
                                        transition={{ duration: 3, repeat: Infinity }}
                                        className="mb-8 p-6 bg-white/5 rounded-full border border-white/5"
                                    >
                                        <AlertTriangle className="w-16 h-16 text-slate-500" strokeWidth={1.5} />
                                    </motion.div>
                                    
                                    <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-4 drop-shadow-md">{t("auto.NoLiabilityNode_8452") || "No Liability Nodes Detected"}</h2>
                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest max-w-md text-center leading-relaxed">
                                        Deploy edge infrastructure into venues tagged as "Liability" to enable local intelligence protocols.
                                    </p>
                                </div>
                            ) : (
                                /* Incident Forensics Timeline */
                                <div className="lg:col-span-2 bg-[#121216] border border-white/5 rounded-3xl p-8 relative shadow-inner">
                                    <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                                        <div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2 mb-1"><Database className="w-3 h-3"/> {t("auto.DigitalBlackBox_3806") || "Digital Black Box Record"}</div>
                                            <h2 className="text-2xl font-black uppercase tracking-widest text-white drop-shadow-md">Incident #{incident.id.substring(0, 12)}...</h2>
                                            <p className="text-xs text-rose-400 font-mono font-bold mt-1">{incident.type || 'Distress Event'}</p>
                                        </div>
                                        <div className="px-4 py-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
                                            <ShieldAlert className="w-4 h-4" /> {t("auto.ForensicsLocked_7873") || "Forensics Locked"}
                                        </div>
                                    </div>
                                    
                                    {incident.annotated_frame && (
                                        <div className="mb-6 rounded-xl overflow-hidden border border-white/10 shadow-lg relative">
                                            <img src={`data:image/jpeg;base64,${incident.annotated_frame}`} alt="Evidence" className="w-full h-auto object-cover max-h-64" />
                                            <div className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded">{t("auto.VisualEvidenceC_6287") || "Visual Evidence Captured"}</div>
                                        </div>
                                    )}

                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-6">{t("auto.IncidentReconst_9015") || "Incident Reconstruction Timeline"}</h3>
                                    
                                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                                        {[
                                            { time: "T-00:00", text: "System nominal", type: "info" },
                                            { time: "T+00:02", text: "Anomaly detected in feed", type: "warning" },
                                            { time: "T+00:04", text: `Risk elevated: ${incident.priority}`, type: "warning" },
                                            { time: "T+00:05", text: `${incident.type} Confirmed`, type: "critical" },
                                            { time: "T+00:06", text: "Incident created", type: "critical" },
                                            { time: "T+00:07", text: "Email dispatched", type: "info" },
                                            { time: "T+00:09", text: "Evidence package sealed", type: "success" }
                                        ].map((event, i) => (
                                            <motion.div 
                                                key={i}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.15 }}
                                                className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                                            >
                                                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#121216] bg-slate-800 text-slate-500 group-hover:text-amber-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 transition-colors">
                                                    <div className={`w-3 h-3 rounded-full ${event.type === 'critical' ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]' : event.type === 'warning' ? 'bg-amber-500' : event.type === 'success' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                                                </div>
                                                
                                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-white/5 bg-black/40 backdrop-blur shadow-sm group-hover:border-white/10 transition-colors">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`font-mono text-xs font-bold ${event.type === 'critical' ? 'text-rose-400' : 'text-slate-400'}`}>{event.time}</span>
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-200">{event.text}</div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Right Side Panels */}
                            <div className="space-y-6">
                                
                                {/* Generate Evidence Package */}
                                <div 
                                    onClick={() => window.open("http://localhost:8000/api/v1/incident/report/pdf", "_blank")}
                                    className="bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/40 rounded-3xl p-6 relative overflow-hidden group hover:border-amber-400 transition-colors cursor-pointer shadow-[0_0_30px_rgba(245,158,11,0.1)]"
                                >
                                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%,100%_100%] animate-[shimmer_3s_infinite]"></div>
                                    <div className="relative z-10 flex flex-col items-center justify-center text-center">
                                        <div className="w-16 h-16 rounded-2xl bg-amber-500 text-black flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(245,158,11,0.6)] group-hover:scale-105 transition-transform">
                                            <FileText className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-lg font-black uppercase tracking-widest text-amber-500 drop-shadow-md">{t("auto.GenerateEvidenc_1966") || "Generate Evidence Package"}</h3>
                                        <p className="text-[10px] font-mono text-amber-500/70 mt-2">{t("auto.OneClickPDFDoss_1105") || "One-Click PDF Dossier Creation"}</p>
                                    </div>
                                </div>

                                {/* Randy Investigation Summary */}
                                <div className="bg-[#121216] border border-fuchsia-500/30 rounded-3xl p-6 relative shadow-[inset_0_0_20px_rgba(217,70,239,0.02)]">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="p-2 bg-fuchsia-500/10 rounded-xl border border-fuchsia-500/30">
                                            <Cpu className="w-5 h-5 text-fuchsia-400" />
                                        </div>
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-400">{t("auto.RandyInvestigat_8024") || "Randy Investigation Summary"}</h3>
                                    </div>
                                    
                                    <div className="space-y-4 text-xs font-mono text-slate-300 leading-relaxed border-l-2 border-fuchsia-500/30 pl-4">
                                        {incident ? (
                                            <>
                                                <div><span className="text-emerald-400">✓</span> Analysis type: {incident.analysis_type || 'AI Core'}.</div>
                                                <div><span className="text-amber-400">!</span> {incident.description}</div>
                                                {incident.explanation && <div><span className="text-sky-400">ℹ</span> {incident.explanation}</div>}
                                                <div><span className="text-emerald-400">✓</span> Priority status locked at {incident.priority}.</div>
                                                <div><span className="text-emerald-400">✓</span> {t("auto.Automaticrespon_5098") || "Automatic response and notification dispatched."}</div>
                                            </>
                                        ) : (
                                            <>
                                                <div><span className="text-emerald-400">✓</span> {t("auto.Awaitinginciden_969") || "Awaiting incident generation."}</div>
                                                <div><span className="text-sky-400">ℹ</span> {t("auto.Systemstandingb_3097") || "System standing by for real-time telemetry."}</div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Cross-System Evidence Sources */}
                                <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 relative">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2"><Database className="w-4 h-4"/> {t("auto.EvidenceSources_8311") || "Evidence Sources"}</h3>
                                    
                                    <div className="space-y-3 font-mono text-xs font-bold text-slate-300">
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                            <div className="flex items-center gap-3"><CheckCircle className={`w-4 h-4 ${incident ? 'text-emerald-500' : 'text-slate-600'}`} /> {t("auto.GuardianRoute_7795") || "Guardian Route"}</div>
                                            <span className="text-[9px] text-slate-500 uppercase tracking-widest">{incident ? 'Verified' : 'Pending'}</span>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                            <div className="flex items-center gap-3"><CheckCircle className={`w-4 h-4 ${incident ? 'text-emerald-500' : 'text-slate-600'}`} /> {t("auto.KineticSOS_2917") || "Kinetic SOS"}</div>
                                            <span className="text-[9px] text-slate-500 uppercase tracking-widest">{incident ? 'Verified' : 'Pending'}</span>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                            <div className="flex items-center gap-3"><CheckCircle className={`w-4 h-4 ${incident ? 'text-emerald-500' : 'text-slate-600'}`} /> {t("auto.CameraNetwork_2914") || "Camera Network"}</div>
                                            <span className="text-[9px] text-slate-500 uppercase tracking-widest">{incident ? 'Verified' : 'Pending'}</span>
                                        </div>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                            <div className="flex items-center gap-3"><CheckCircle className={`w-4 h-4 ${incident ? 'text-emerald-500' : 'text-slate-600'}`} /> {t("auto.NotificationEng_7266") || "Notification Engine"}</div>
                                            <span className="text-[9px] text-slate-500 uppercase tracking-widest">{incident ? 'Verified' : 'Pending'}</span>
                                        </div>
                                        <div className={`flex items-center justify-between p-2 rounded-lg border ${incident ? 'bg-fuchsia-500/10 border-fuchsia-500/20' : 'bg-white/5 border-white/5'}`}>
                                            <div className="flex items-center gap-3"><CheckCircle className={`w-4 h-4 ${incident ? 'text-fuchsia-500' : 'text-slate-600'}`} /> {t("auto.RandyAIAnalysis_851") || "Randy AI Analysis"}</div>
                                            <span className={`text-[9px] uppercase tracking-widest ${incident ? 'text-fuchsia-500' : 'text-slate-500'}`}>{incident ? 'Sealed' : 'Pending'}</span>
                                        </div>
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
