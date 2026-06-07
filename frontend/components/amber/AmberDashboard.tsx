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
    const [droneDeployed, setDroneDeployed] = useState(false);

    const [amberData, setAmberData] = useState<AmberResponse | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Time formatter
    const formatTime = (ts: number) => {
        const d = new Date(ts * 1000);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    // Auto-load target if track_id is present
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const trackId = params.get("track_id");
        if (!trackId) return;

        const loadTarget = async () => {
            try {
                // We use the public endpoint which has all active cases
                const res = await api.get('/sos/report/public');
                const target = res.data.find((r: any) => r.tracking_id === trackId);
                if (target && target.image_url) {
                    const imgRes = await fetch(target.image_url.startsWith('http') ? target.image_url : target.image_url);
                    const blob = await imgRes.blob();
                    const file = new File([blob], "target.jpg", { type: "image/jpeg" });
                    setImageToUpload(file);
                    setPreviewUrl(URL.createObjectURL(file));
                    
                    // Auto-trigger the scan after a slight delay for dramatic effect
                    setTimeout(() => {
                        toast.info("Auto-importing SOS Target. Initializing Network Scan...");
                    }, 500);
                }
            } catch (e) {
                console.error("Failed to auto-load target", e);
            }
        };
        loadTarget();
    }, []);

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

                            <div className="w-full max-w-sm mt-8 space-y-2 text-left font-mono text-xs uppercase tracking-widest text-red-500/70">
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: scanProgress > 0 ? 1 : 0, x: 0 }} className={scanProgress > 20 ? "text-red-400" : "animate-pulse"}>
                                    {'>'} Target profile created
                                </motion.div>
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: scanProgress > 20 ? 1 : 0, x: 0 }} className={scanProgress > 40 ? "text-red-400" : "animate-pulse"}>
                                    {'>'} Face embedding generated
                                </motion.div>
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: scanProgress > 40 ? 1 : 0, x: 0 }} className={scanProgress > 60 ? "text-red-400" : "animate-pulse"}>
                                    {'>'} 127 camera nodes scanning
                                </motion.div>
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: scanProgress > 60 ? 1 : 0, x: 0 }} className={scanProgress > 80 ? "text-red-400" : "animate-pulse"}>
                                    {'>'} Potential match found (92%)
                                </motion.div>
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: scanProgress > 80 ? 1 : 0, x: 0 }} className={scanProgress > 95 ? "text-red-400" : "animate-pulse"}>
                                    {'>'} Tracking route reconstructed
                                </motion.div>
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: scanProgress > 95 ? 1 : 0, x: 0 }} className="text-white font-black drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">
                                    {'>'} Dispatch alerted
                                </motion.div>
                            </div>
                        </motion.div>
                    )}

                    {amberData && (
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: "spring", stiffness: 100, damping: 20 }}
                            className="w-full max-w-7xl grid grid-cols-[300px_1fr_350px] gap-6"
                        >
                            {/* Left Panel: Network Scale & Randy AI */}
                            <div className="flex flex-col gap-6">
                                <div className="bg-[#0A0000] border border-red-900/40 rounded-3xl p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl" />
                                    <h3 className="text-[10px] font-black uppercase text-red-500 tracking-widest mb-4">Network Scale</h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-end border-b border-red-900/30 pb-2">
                                            <span className="text-xs text-red-100/50 uppercase tracking-wider">Connected Cameras</span>
                                            <span className="text-lg font-mono font-black text-white">127</span>
                                        </div>
                                        <div className="flex justify-between items-end border-b border-red-900/30 pb-2">
                                            <span className="text-xs text-red-100/50 uppercase tracking-wider">Active Searches</span>
                                            <span className="text-lg font-mono font-black text-white">6</span>
                                        </div>
                                        <div className="flex justify-between items-end border-b border-red-900/30 pb-2">
                                            <span className="text-xs text-red-100/50 uppercase tracking-wider">City Coverage</span>
                                            <span className="text-lg font-mono font-black text-white">8.4 KM</span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <span className="text-xs text-red-100/50 uppercase tracking-wider">Scan Speed</span>
                                            <span className="text-lg font-mono font-black text-white">0.8 SEC</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#0A0000] border border-sky-900/50 rounded-3xl p-6 relative overflow-hidden flex-1">
                                    <div className="absolute top-0 left-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl" />
                                    <h3 className="text-[10px] font-black uppercase text-sky-400 tracking-widest mb-4 flex items-center gap-2">
                                        <ShieldAlert className="w-4 h-4" />
                                        Randy AI Investigation
                                    </h3>
                                    
                                    <div className="space-y-4 text-xs font-mono text-sky-100/80 leading-relaxed">
                                        <p>{'>'} Target detected on {amberData.trajectory.length > 0 ? amberData.trajectory[0].camera_name : "Camera 14"}.</p>
                                        <p>{'>'} Movement pattern suggests eastbound travel.</p>
                                        <p className="text-white font-bold">{'>'} Latest sighting:<br/><span className="text-sky-300">{amberData.trajectory.length > 0 ? amberData.trajectory[amberData.trajectory.length - 1].camera_name : "Bus Terminal"}</span></p>
                                        <p className="text-red-400 font-bold">{'>'} Confidence: 94%</p>
                                    </div>
                                </div>
                            </div>

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
                                            className="relative pl-10 mb-2 last:mb-0"
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

                                            {idx < amberData.trajectory.length - 1 && (
                                                <div className="flex justify-center my-2 pl-4">
                                                    <ArrowRight className="w-5 h-5 text-red-500/40 rotate-90" />
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setDroneDeployed(true)}
                                    className="w-full py-4 mt-4 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-[0_0_30px_rgba(239,68,68,0.5)] flex justify-center items-center gap-3 animate-pulse hover:scale-[1.02]"
                                >
                                    <Target className="w-4 h-4" /> Deploy Autonomous Drone Pursuit
                                </button>

                                <button
                                    onClick={() => setAmberData(null)}
                                    className="w-full py-3 bg-red-950 hover:bg-red-900 text-red-400 border border-red-900 hover:border-red-500/50 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all flex justify-center items-center gap-2 mt-4"
                                >
                                    <ArrowRight className="w-4 h-4 rotate-180" /> Clear Operation
                                </button>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>

                {/* AUTONOMOUS DRONE PURSUIT MODAL */}
                <AnimatePresence>
                    {droneDeployed && amberData && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-8"
                        >
                            <div className="w-full max-w-5xl bg-[#020000] border border-red-500/50 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(239,68,68,0.3)] relative">
                                {/* Header */}
                                <div className="bg-black border-b border-red-500/30 p-4 flex justify-between items-center z-20 relative">
                                    <div className="flex items-center gap-3 text-red-500 font-mono text-xs font-bold uppercase tracking-widest">
                                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,1)]" />
                                        UAV-7 "NIGHTHAWK" LIVE THERMAL FEED
                                    </div>
                                    <button onClick={() => setDroneDeployed(false)} className="text-slate-400 hover:text-white px-3 py-1.5 bg-white/5 hover:bg-red-900/50 rounded flex items-center gap-2 border border-white/10 hover:border-red-500/50 uppercase text-[10px] tracking-widest font-bold transition-all">
                                        <ArrowRight className="w-3 h-3 rotate-180" /> Abort Protocol
                                    </button>
                                </div>
                                
                                {/* Drone Video Player Overlay */}
                                <div className="relative w-full aspect-[21/9] bg-[#050200] flex items-center justify-center overflow-hidden">
                                    {/* CSS Simulated Thermal Target */}
                                    <div className="absolute inset-0 opacity-20 mix-blend-screen bg-[url('/grid.svg')] bg-[length:40px_40px] pointer-events-none" />
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.15)_0%,transparent_70%)] pointer-events-none animate-pulse" />
                                    
                                    {/* The Heat Signature */}
                                    <motion.div 
                                        animate={{ 
                                            x: [0, 20, -10, 30, 0], 
                                            y: [0, -15, 10, -5, 0] 
                                        }}
                                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-32"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-t from-orange-500 via-red-500 to-yellow-300 blur-xl opacity-90 rounded-full animate-pulse" style={{ animationDuration: '0.5s' }} />
                                        <div className="absolute inset-2 bg-white blur-md opacity-80 rounded-full animate-pulse" style={{ animationDuration: '0.3s' }} />
                                    </motion.div>
                                    
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,black_100%)] pointer-events-none" />
                                    
                                    {/* HUD Elements */}
                                    <div className="absolute inset-10 border border-red-500/20 rounded-full animate-[spin_20s_linear_infinite] pointer-events-none" />
                                    <div className="absolute inset-20 border border-dashed border-red-500/10 rounded-full animate-[spin_15s_linear_infinite_reverse] pointer-events-none" />
                                    
                                    {/* Target Lock Box */}
                                    <motion.div 
                                        animate={{ 
                                            x: [0, 20, -10, 30, 0], 
                                            y: [0, -15, 10, -5, 0] 
                                        }}
                                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-[3px] border-red-500/80 flex items-center justify-center pointer-events-none shadow-[inset_0_0_20px_rgba(239,68,68,0.3)]"
                                    >
                                        <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                        <div className="absolute -top-6 text-red-500 font-mono text-[10px] tracking-widest font-black uppercase">LOCK_MAINTAINED : {amberData.subject_id}</div>
                                        <div className="absolute -bottom-6 text-red-500/70 font-mono text-[10px] tracking-widest font-bold">THERMAL_SIGNATURE_MATCH</div>
                                        {/* Corner brackets */}
                                        <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-red-500" />
                                        <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-red-500" />
                                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-red-500" />
                                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-red-500" />
                                    </motion.div>

                                    {/* Crosshair */}
                                    <div className="absolute inset-0 pointer-events-none">
                                        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-red-500/20" />
                                        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-red-500/20" />
                                    </div>

                                    {/* Telemetry data */}
                                    <div className="absolute bottom-6 left-6 text-red-500 font-mono text-[10px] font-bold space-y-1 opacity-80 tracking-widest">
                                        <div>ALT: <span className="text-white">412 FT</span></div>
                                        <div>SPD: <span className="text-white">24 KTS</span></div>
                                        <div>HDG: <span className="text-white">274 W</span></div>
                                        <div className="pt-2 text-red-500/50">COORDINATES: 17.3850° N, 78.4867° E</div>
                                    </div>
                                    <div className="absolute top-6 right-6 text-red-500 font-mono text-[10px] font-bold space-y-1 text-right opacity-80 tracking-widest">
                                        <div>MODE: <span className="text-emerald-400 animate-pulse">AUTONOMOUS_PURSUIT</span></div>
                                        <div>BAT: <span className="text-white">84%</span></div>
                                        <div>GIMBAL: <span className="text-white">LOCKED</span></div>
                                        <div className="pt-2 text-red-500/50 flex items-center justify-end gap-2"><div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"/> RECORDING</div>
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
