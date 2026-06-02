"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Upload, Search, ShieldAlert, Target, Clock, ArrowRight, ScanLine, Activity, AlertTriangle, AlertCircle } from "lucide-react";
import { api } from "@/services/api";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import ElectricBorder from "@/components/react-bits/ElectricBorder";
import SplashCursor from "@/components/react-bits/SplashCursor";

// Trajectory Interface
interface TrajectoryPoint {
    camera_id: string;
    camera_name: string;
    timestamp: number;
    confidence: number;
    status: 'past' | 'live';
    action: string;
    zone_name?: string;
    snapshot_path?: string;
}

interface AmberResponse {
    subject_id: str;
    status: str;
    total_cameras_scanned: number;
    trajectory: TrajectoryPoint[];
}

export default function AmberDashboard() {
    const { venue } = useActiveVenue();
    const [isDragging, setIsDragging] = useState(false);
    const [imageToUpload, setImageToUpload] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);

    const [amberData, setAmberData] = useState<AmberResponse | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Time formatter
    const formatTime = (ts: number) => {
        const d = new Date(ts * 1000);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsDragging(true);
        } else if (e.type === "dragleave") {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleFile = (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Must upload an image file.');
            return;
        }
        setImageToUpload(file);
        setPreviewUrl(URL.createObjectURL(file));
    };

    const triggerAmberProtocol = async () => {
        if (!imageToUpload) return;
        if (!venue) {
            toast.info('No active venue selected. Initiating global search across all active cameras.');
        }

        setIsScanning(true);
        setScanProgress(0);
        setAmberData(null);

        // Fake progress buildup while awaiting API
        const progressInterval = setInterval(() => {
            setScanProgress(p => {
                if (p >= 90) return p;
                return p + Math.random() * 15;
            });
        }, 200);

        try {
            const formData = new FormData();
            formData.append("file", imageToUpload);

            const url = venue ? `/amber/upload?venue_id=${venue.id}` : `/amber/upload`;
            const res = await api.post(url, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });

            clearInterval(progressInterval);
            setScanProgress(100);

            // Delay slightly for dramatic effect
            setTimeout(() => {
                setIsScanning(false);
                setAmberData(res.data);
                toast.success(`LOCK ACQUIRED: Target identified across ${res.data.trajectory.length} nodes!`);
            }, 600);

        } catch (err) {
            clearInterval(progressInterval);
            setIsScanning(false);
            toast.error("AMBER Protocol failed to execute. No cameras available.");
        }
    };

    return (
        <div className="w-full min-h-screen bg-[#060000] text-red-50 p-8 flex flex-col gap-8 custom-scrollbar overflow-y-auto relative isolate">
            {/* Intense Backgrounds */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-950/20 via-[#060000] to-[#040000] pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-[2px] bg-red-500/30 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.8)]" />

            {amberData && (
                <SplashCursor
                    DENSITY_DISSIPATION={3}
                    VELOCITY_DISSIPATION={2}
                    PRESSURE={0}
                    CURL={2}
                    SPLAT_RADIUS={0.3}
                    SPLAT_FORCE={4000}
                    COLOR_UPDATE_SPEED={10}
                    SHADING={true}
                    RAINBOW_MODE={false}
                    COLOR="#EF4444"
                    TRANSPARENT={true}
                />
            )}

            {/* HEADER */}
            <header className="flex justify-between items-center shrink-0 z-10 border-b border-red-500/20 pb-6 relative">
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center animate-pulse">
                        <ShieldAlert className="w-8 h-8 text-red-500" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black font-heading tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-300">
                            ZERO-LATENCY AMBER RESCUE
                        </h1>
                        <p className="font-mono text-xs text-red-400/80 tracking-[0.2em] uppercase mt-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                            Cross-Camera Neural Semantic Mapping Matrix
                        </p>
                    </div>
                </div>
                
                <a 
                    href="/sos-report" 
                    target="_blank" 
                    className="flex items-center gap-2 px-6 py-3 rounded-xl border border-red-500/50 bg-red-950/40 text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-all font-bold uppercase tracking-widest text-xs"
                >
                    <AlertTriangle className="w-4 h-4" />
                    Open Public SOS Portal
                </a>
            </header>

            {/* MAIN BODY */}
            <div className="flex-1 flex flex-col items-center justify-center z-10 relative mt-4">

                <AnimatePresence mode="wait">
                    {!isScanning && !amberData && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                            className="w-full max-w-2xl"
                        >
                            <div
                                className={`border-2 border-dashed rounded-3xl p-12 transition-all flex flex-col items-center justify-center cursor-pointer min-h-[400px] bg-red-950/10 hover:bg-red-950/20 ${isDragging ? "border-red-500 bg-red-900/30 shadow-[0_0_50px_rgba(239,68,68,0.2)]" : "border-red-500/30"}`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />

                                {previewUrl ? (
                                    <div className="flex flex-col items-center w-full">
                                        <img src={previewUrl} alt="Target" className="w-48 h-48 object-cover rounded-2xl border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)] mb-6" />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); triggerAmberProtocol(); }}
                                            className="px-8 py-4 bg-red-600 hover:bg-red-500 transition-all font-black uppercase text-xl rounded-xl shadow-[0_0_40px_rgba(239,68,68,0.6)] flex items-center gap-3 text-white tracking-widest hover:scale-105 active:scale-95"
                                        >
                                            <ScanLine className="w-6 h-6 animate-pulse" />
                                            Issue AMBER Override
                                        </button>
                                        <p className="text-red-500/60 font-mono text-xs mt-4 uppercase tracking-widest text-center">
                                            WARNING: This action bypasses standard node priorities to inject raw semantic embeddings across all spatial matrices.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-24 h-24 rounded-full bg-red-950 flex items-center justify-center mb-6 shadow-inner border border-red-900">
                                            <Upload className="w-10 h-10 text-red-500 opacity-60" />
                                        </div>
                                        <h3 className="text-xl font-bold uppercase tracking-widest mb-2 text-red-400">Upload Subject Image</h3>
                                        <p className="text-red-500/50 font-medium text-sm">Drag and drop photo here to extract target embeddings</p>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {isScanning && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="w-full max-w-xl text-center flex flex-col items-center"
                        >
                            <div className="w-48 h-48 relative mb-8">
                                {previewUrl && <img src={previewUrl} className="absolute inset-0 w-full h-full object-cover rounded-3xl opacity-40 grayscale sepia mix-blend-screen overflow-hidden" />}
                                <div className="absolute inset-0 border-4 border-red-500 rounded-3xl animate-pulse" />
                                <div className="absolute inset-0 bg-red-500/20 rounded-3xl scan-line pointer-events-none" />
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <Target className="w-16 h-16 text-red-400 animate-spin" style={{ animationDuration: '3s' }} />
                                </div>
                            </div>
                            <h2 className="text-2xl font-black tracking-[0.2em] uppercase text-red-400 mb-2">Extracting Semantic Vectors</h2>
                            <p className="text-sm text-red-500/60 font-mono tracking-widest mb-8">Cross-referencing embeddings against {venue?.name || 'Local Venue'} Matrix...</p>

                            <div className="w-full h-2 bg-red-950 rounded-full overflow-hidden border border-red-900/50">
                                <div
                                    className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-red-400 transition-all ease-out"
                                    style={{ width: `${Math.min(100, scanProgress)}%`, transitionDuration: '200ms' }}
                                />
                            </div>
                            <div className="w-full mt-4 flex justify-between font-mono text-[10px] text-red-500/60 uppercase">
                                <span>Searching spatial logs...</span>
                                <span>{Math.round(scanProgress)}%</span>
                            </div>
                        </motion.div>
                    )}

                    {amberData && (
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: "spring", stiffness: 100, damping: 20 }}
                            className="w-full max-w-6xl grid grid-cols-[1fr_400px] gap-8"
                        >
                            {/* Visual Trajectory Map */}
                            <div className="relative rounded-3xl border border-red-500/30 bg-[#0A0000] overflow-hidden min-h-[600px] shadow-[0_0_50px_rgba(239,68,68,0.05)]">
                                <div className="absolute top-5 left-5 z-20 flex gap-3">
                                    <div className="px-4 py-2 rounded-full bg-red-500 border border-red-400 text-white font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(239,68,68,0.8)] animate-pulse flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4" />
                                        Target Acquired
                                    </div>
                                    <div className="px-4 py-2 rounded-full bg-[#110000] border border-red-900/50 text-red-500 font-mono text-xs tracking-widest">
                                        {amberData.subject_id}
                                    </div>
                                </div>

                                {/* Simulated Live Target Camera Feed */}
                                {amberData.trajectory.filter(t => t.status === 'live').map(livePoint => (
                                    <div key="live-camera" className="absolute inset-0 flex flex-col justify-end p-8 bg-[url('/grid.svg')] bg-[length:40px_40px] z-10 pointer-events-none">
                                        <div className="absolute inset-0 bg-gradient-to-t from-red-950/80 via-transparent to-transparent" />

                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 1 }}
                                            className="relative z-20 border-2 border-red-500 bg-[#0a0000]/80 backdrop-blur-xl p-6 rounded-2xl max-w-md shadow-[0_0_40px_rgba(239,68,68,0.3)]"
                                        >
                                            <h3 className="font-black text-2xl uppercase tracking-tighter text-white mb-1 flex items-center gap-2">
                                                {livePoint.camera_name}
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                            </h3>
                                            <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-4">Live Spatial Location</p>

                                            <div className="flex items-center gap-4 border-t border-red-900/50 pt-4">
                                                {(livePoint.snapshot_path || previewUrl) && <img src={livePoint.snapshot_path ? (livePoint.snapshot_path.startsWith('http') ? livePoint.snapshot_path : (livePoint.snapshot_path.startsWith('/') ? livePoint.snapshot_path : `/${livePoint.snapshot_path}`)) : previewUrl!} className="w-16 h-16 rounded-xl border border-red-500/50 object-cover" />}
                                                <div>
                                                    <p className="text-white text-lg font-mono font-black">{formatTime(livePoint.timestamp)} <span className="text-xs text-red-500 ml-1">LST</span></p>
                                                    <p className="text-[10px] text-red-500/70 font-mono tracking-widest mt-1">CONF: {Math.round(livePoint.confidence * 100)}% MATCH</p>
                                                </div>
                                            </div>
                                        </motion.div>

                                        {/* Giant Fake HUD Overlay locking onto the target */}
                                        <div className="absolute right-1/4 top-1/3 w-64 h-64 border border-red-500/40 rounded-full animate-ping pointer-events-none" style={{ animationDuration: '3s' }} />
                                        <div className="absolute right-1/4 top-1/3 w-32 h-32 border-2 border-red-500 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.5)] pointer-events-none">
                                            <Target className="w-10 h-10 text-red-500 opacity-80 animate-spin" style={{ animationDuration: '5s' }} />
                                        </div>
                                    </div>
                                ))}

                                {/* Background map static aesthetic */}
                                <div className="absolute inset-0 pointer-events-none opacity-20 filter grayscale sepia hue-rotate-[320deg] mix-blend-screen" style={{ backgroundImage: 'radial-gradient(circle at center, #660000 0%, transparent 60%)' }} />
                            </div>

                            {/* Trajectory Log Sidebar */}
                            <div className="bg-[#0A0000] border border-red-900/40 rounded-3xl p-6 flex flex-col h-full relative overflow-hidden">
                                <div className="absolute right-0 top-0 w-32 h-32 bg-red-900/20 blur-[60px]" />

                                <h2 className="font-bold text-sm tracking-widest text-red-500 uppercase flex items-center gap-2 mb-6">
                                    <Activity className="w-4 h-4" /> Neural Trajectory Log
                                </h2>

                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative">
                                    <div className="absolute left-[15px] top-4 bottom-8 w-[2px] bg-red-900/30" />

                                    {amberData.trajectory.map((t, idx) => (
                                        <motion.div
                                            initial={{ x: 20, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            transition={{ delay: idx * 0.3 }}
                                            key={t.camera_id + idx}
                                            className="relative pl-10 mb-8 last:mb-0"
                                        >
                                            <div className={`absolute left-0 top-1 w-8 h-8 rounded-full border-2 flex items-center justify-center bg-[#0a0000] z-10 ${t.status === 'live' ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'border-red-900'}`}>
                                                {t.status === 'live' ? <Target className="w-4 h-4 text-red-500 animate-pulse" /> : <Clock className="w-4 h-4 text-red-900" />}
                                            </div>

                                            <div className={`p-4 rounded-2xl border transition-all ${t.status === 'live' ? 'bg-red-950/30 border-red-500/40' : 'bg-transparent border-red-900/20'}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-black tracking-tight text-white">
                                                        {t.camera_name}
                                                        {t.zone_name && <span className="text-red-500/70 ml-2 text-[10px] uppercase font-mono tracking-widest border border-red-900/50 px-1.5 py-0.5 rounded bg-red-950/30">{t.zone_name}</span>}
                                                    </span>
                                                    <span className="text-[10px] font-mono font-bold text-red-500/80">{formatTime(t.timestamp)}</span>
                                                </div>
                                                <div className="flex gap-3 mt-2">
                                                    {t.snapshot_path && (
                                                        <img src={t.snapshot_path.startsWith('http') ? t.snapshot_path : (t.snapshot_path.startsWith('/') ? t.snapshot_path : `/${t.snapshot_path}`)} className="w-12 h-12 rounded-lg border border-red-500/30 object-cover shrink-0" />
                                                    )}
                                                    <div className="flex-1">
                                                        <p className="text-xs text-slate-300 font-medium leading-relaxed">{t.action}</p>
                                                        <div className="mt-3 flex items-center gap-2">
                                                            <div className="flex-1 h-1 bg-red-950 rounded-full overflow-hidden">
                                                                <div className="h-full bg-red-600" style={{ width: `${t.confidence * 100}%` }} />
                                                            </div>
                                                            <span className="text-[9px] font-mono text-red-400 font-bold">{Math.round(t.confidence * 100)}% MATCH</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setAmberData(null)}
                                    className="w-full py-3 bg-red-950 hover:bg-red-900 text-red-400 border border-red-900 hover:border-red-500/50 rounded-xl font-bold uppercase tracking-widest text-xs transition-all flex justify-center items-center gap-2 mt-4"
                                >
                                    <ArrowRight className="w-4 h-4 rotate-180" /> Clear Operation
                                </button>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>

            </div>
        </div>
    );
}
