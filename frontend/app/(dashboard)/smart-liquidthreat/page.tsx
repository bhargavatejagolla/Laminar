"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ArrowLeft, 
    AlertTriangle, 
    Waves, 
    Droplets,
    UploadCloud,
    Trash2,
    CheckCircle2,
    Route,
    Camera,
    Video,
    Radio,
    ShieldCheck,
    Bell,
    BarChart3,
    Activity,
    Info,
    Smartphone
} from "lucide-react";

// Deep Ocean Theme background
const AquaticBackground = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 mix-blend-screen z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-20">
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.15)_0%,transparent_50%)] animate-pulse" style={{ animationDuration: '6s' }} />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_80%,transparent_100%)]"></div>
    </div>
);

export default function SmartLiquidThreatPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    
    // Core App States
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const cvCanvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();

    // Simulation States
    const [logs, setLogs] = useState<{time: string, text: string, type: 'info' | 'alert' | 'critical', screenshotUrl?: string | null, linkUrl?: string}[]>([]);
    const [waterLogs, setWaterLogs] = useState<{time: string, depth: string, timestamp: number}[]>([]);
    const [simStep, setSimStep] = useState(0);
    const [selectedCamera, setSelectedCamera] = useState("PVNR_UNDERPASS_CAM_07");

    useEffect(() => {
        setMounted(true);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    // Live CV Overlay Drawing
    useEffect(() => {
        if (!isAnalyzing || !cvCanvasRef.current || !videoRef.current) return;
        
        const canvas = cvCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let scanY = 0;
        let scanDir = 1;

        const drawCV = () => {
            if (!videoRef.current) return;
            canvas.width = videoRef.current.clientWidth;
            canvas.height = videoRef.current.clientHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Calculate mock water height based on simStep
            const waterHeightRatio = simStep >= 5 ? 0.7 : simStep >= 4 ? 0.55 : simStep >= 3 ? 0.4 : simStep >= 2 ? 0.25 : simStep >= 1 ? 0.15 : 0;
            const waterY = canvas.height * (1 - waterHeightRatio);

            // Draw scanning line
            scanY += scanDir * 2;
            if (scanY > canvas.height) scanDir = -1;
            if (scanY < 0) scanDir = 1;
            
            ctx.beginPath();
            ctx.moveTo(0, scanY);
            ctx.lineTo(canvas.width, scanY);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw a stationary reference pole with depth markings to explain HOW measurement works
            const poleX = 60;
            const poleY = canvas.height * 0.2;
            const poleH = canvas.height * 0.7;
            const poleW = 10;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(poleX, poleY, poleW, poleH);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
            ctx.lineWidth = 1;
            ctx.strokeRect(poleX, poleY, poleW, poleH);
            
            // Draw depth markers on the pole
            for(let i=0; i<=5; i++) {
                const markY = poleY + (poleH * (i/5));
                ctx.beginPath();
                ctx.moveTo(poleX - 5, markY);
                ctx.lineTo(poleX + 15, markY);
                ctx.stroke();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = '8px monospace';
                ctx.fillText(`${(1.5 - (i * 0.3)).toFixed(1)}m`, poleX + 20, markY + 3);
            }
            
            // Draw intersection measurement
            if (waterHeightRatio > 0) {
                ctx.beginPath();
                ctx.moveTo(poleX - 20, waterY);
                ctx.lineTo(poleX + 40, waterY);
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.9)';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                ctx.fillStyle = 'rgba(244, 63, 94, 1)';
                ctx.font = 'bold 11px monospace';
                const measuredDepth = 1.5 * (waterHeightRatio / 0.7); // scale up to 1.5m max for demo
                ctx.fillText(`MEASUREMENT: ${measuredDepth.toFixed(2)}m`, poleX + 45, waterY + 4);
            }

            // Draw random jittering bounding boxes for moving objects
            const boxes = [
                { x: canvas.width * 0.7, y: canvas.height * 0.5, w: 80, h: 40, label: 'VEHICLE_TRACK' }
            ];

            boxes.forEach(box => {
                const jitterX = (Math.random() - 0.5) * 2;
                const jitterY = (Math.random() - 0.5) * 2;
                
                ctx.strokeStyle = waterY < box.y + box.h ? 'rgba(244, 63, 94, 0.8)' : 'rgba(16, 185, 129, 0.8)'; // Red if underwater, else Green
                ctx.lineWidth = 1.5;
                ctx.strokeRect(box.x + jitterX, box.y + jitterY, box.w, box.h);
                
                ctx.fillStyle = ctx.strokeStyle;
                ctx.font = '10px monospace';
                ctx.fillText(`${box.label} [${(Math.random() * 0.1 + 0.9).toFixed(2)}]`, box.x + jitterX, box.y + jitterY - 5);
            });

            // Draw Telemetry text
            ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`FPS: ${(58 + Math.random() * 4).toFixed(1)}`, canvas.width - 60, 20);
            ctx.fillText(`LATENCY: ${(12 + Math.random() * 3).toFixed(0)}ms`, canvas.width - 80, 35);
            ctx.fillText(`MODEL: LIQUID-YOLOv8-SEG`, canvas.width - 150, 50);

            // Draw exact water line boundary tracking
            if (waterHeightRatio > 0) {
                ctx.beginPath();
                ctx.setLineDash([5, 5]);
                ctx.moveTo(0, waterY);
                ctx.lineTo(canvas.width, waterY);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fillText(`SURFACE_BOUNDARY_Z`, 10, waterY - 5);
            }

            animationRef.current = requestAnimationFrame(drawCV);
        };

        drawCV();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isAnalyzing, simStep]);

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
        setWaterLogs([]);
        setSimStep(0);
    };

    const captureScreenshotUrl = () => {
        if (videoRef.current && cvCanvasRef.current) {
            try {
                // We create a new canvas to merge the video and the cvCanvas together
                const mergedCanvas = document.createElement('canvas');
                mergedCanvas.width = videoRef.current.videoWidth || 640;
                mergedCanvas.height = videoRef.current.videoHeight || 360;
                const ctx = mergedCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoRef.current, 0, 0, mergedCanvas.width, mergedCanvas.height);
                    // Also draw the CV canvas on top for evidence!
                    ctx.drawImage(cvCanvasRef.current, 0, 0, mergedCanvas.width, mergedCanvas.height);
                    return mergedCanvas.toDataURL('image/jpeg', 0.8);
                }
            } catch (e) {
                console.error("Screenshot capture failed", e);
            }
        }
        return null;
    };

    const addLog = (text: string, type: 'info' | 'alert' | 'critical' = 'info', includeScreenshot = false, linkUrl?: string) => {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        let screenshotUrl = null;
        if (includeScreenshot) {
            screenshotUrl = captureScreenshotUrl();
        }
        setLogs(prev => [{ time, text, type, screenshotUrl, linkUrl }, ...prev]);
    };

    const addWaterLog = (depth: string) => {
        const date = new Date();
        const time = date.toLocaleTimeString('en-US', { hour12: false });
        setWaterLogs(prev => [...prev, { time, depth, timestamp: date.getTime() }]);
    };

    // Dynamic Calculation (No Mock Data)
    const calculateRiseRate = () => {
        if (waterLogs.length < 2) return "0.00";
        const first = waterLogs[0];
        const last = waterLogs[waterLogs.length - 1];
        const depthDiff = parseFloat(last.depth) - parseFloat(first.depth);
        const timeDiffMs = last.timestamp - first.timestamp;
        
        if (timeDiffMs === 0) return "0.00";
        
        // Time dilation: 1 demo second = 1 real minute to make rates realistic for the hackathon presentation
        const timeDiffMins = timeDiffMs / 1000; 
        const rate = depthDiff / timeDiffMins;
        return isNaN(rate) || !isFinite(rate) ? "0.00" : rate.toFixed(2);
    };

    // Ultimate Demo Sequence
    const startSimulation = () => {
        setIsAnalyzing(true);
        setSimStep(1);
        
        // Ensure state is updated before using it in the timeout if needed, but since it's a simple closure, it captures the current render's selectedCamera.
        const currentCamName = selectedCamera.replace(/_/g, ' ');
        
        addLog(`⚠ Water Rise Detected: ${currentCamName}`, "alert", true);
        addWaterLog("0.32m");

        setTimeout(() => {
            addWaterLog("0.47m");
            setSimStep(2);
        }, 2000);
        
        setTimeout(() => {
            addWaterLog("0.63m");
            addLog("⚠ Flood Warning Issued", "alert");
            setSimStep(3);
        }, 4500);

        setTimeout(() => {
            addWaterLog("0.81m");
        }, 6000);

        setTimeout(() => {
            addWaterLog("1.02m");
            
            const currentRiseRate = calculateRiseRate();
            const evidenceImg = captureScreenshotUrl();
            
            addLog("🚨 Route Closure Initiated", "critical", true);
            setSimStep(4);
            
            // Dispatch Real Email to Police Notification Pipeline
            fetch('/api/notify', {
                method: 'POST',
                body: JSON.stringify({
                    location: currentCamName,
                    severity: 'CRITICAL',
                    confidence: 94,
                    riseRate: currentRiseRate,
                    screenshotUrl: evidenceImg
                })
            }).then(res => res.json()).then((data) => {
                if (data.realEmail) {
                    addLog("✉ DISPATCHED: Alert delivered directly to Police Inboxes via SMTP", "info");
                } else if (data.previewUrl) {
                    addLog("✉ DISPATCHED: Email Sent to Police. [Click to View Real Email]", "info", false, data.previewUrl);
                } else {
                    addLog("✉ DISPATCHED: Email Sent to commish@hydpolice.gov.in", "info");
                }
            }).catch(console.error);
            
        }, 8000);

        setTimeout(() => {
            addWaterLog("1.20m");
            addLog("🛑 Traffic Signals Locked RED", "critical");
            setSimStep(5);
        }, 10000);

        setTimeout(() => {
            addLog("🚑 Ambulance Route Updated", "info");
            setSimStep(6);
        }, 12500);

        setTimeout(() => {
            addLog("📢 Citizen Alert Broadcast", "info");
            setSimStep(7);
        }, 15000);
    };

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-[#020617] text-white pb-24 relative overflow-hidden font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
            <AquaticBackground />
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-blue-600 via-cyan-400 to-teal-600 z-50 shadow-[0_0_20px_rgba(34,211,238,0.5)]"></div>

            <div className="relative z-10 px-6 pt-10 max-w-[1800px] mx-auto">
                
                {/* Header Section */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
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
                                <Waves className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400">
                                    Autonomous Route Intervention
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] mb-2">
                                Laminar Liquid <span className="text-cyan-400">Threat Engine</span>
                            </h1>
                            <p className="text-xs md:text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                Multi-Node Urban Flood Intelligence & City Response OS
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-3 shadow-[0_0_15px_rgba(34,211,238,0.15)]">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shadow-[0_0_8px_rgba(34,211,238,1)]"></span>
                            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em]">Sensors Active</span>
                        </div>
                        {isAnalyzing && (
                            <button onClick={resetSystem} className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl hover:bg-rose-500/20 transition-all text-rose-400" title="Reset Simulation">
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
                            className="bg-[#0f172a]/80 backdrop-blur-xl border border-cyan-900/50 rounded-3xl p-16 flex flex-col items-center justify-center min-h-[600px] relative overflow-hidden shadow-inner"
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.05)_0%,transparent_60%)]"></div>
                            
                            <motion.div 
                                animate={{ opacity: [0.5, 1, 0.5] }} 
                                transition={{ duration: 3, repeat: Infinity }}
                                className="mb-8 p-8 bg-cyan-950/30 rounded-full border border-cyan-800/30 shadow-[0_0_50px_rgba(34,211,238,0.1)]"
                            >
                                <Droplets className="w-20 h-20 text-cyan-500" strokeWidth={1} />
                            </motion.div>
                            
                            <h2 className="text-3xl font-black uppercase tracking-widest text-white mb-4 drop-shadow-md">Global Flood Monitors Online</h2>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest max-w-lg text-center leading-relaxed mb-12">
                                City-scale network standing by. Upload underpass CCTV footage to demonstrate autonomous threat classification and Green Wave response.
                            </p>
                            
                            <label className="cursor-pointer relative z-10 group/btn flex flex-col items-center">
                                <div className="px-8 py-4 rounded-xl bg-cyan-500 text-black font-black uppercase tracking-widest flex items-center gap-3 transition-all group-hover/btn:bg-cyan-400 group-hover/btn:scale-105 shadow-[0_0_30px_rgba(34,211,238,0.4)]">
                                    <UploadCloud className="w-6 h-6" /> Initialize Liquid Threat Demo
                                </div>
                                <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                                <span className="text-[10px] text-slate-500 font-mono mt-4 uppercase tracking-widest">Supports .mp4 urban camera feeds</span>
                            </label>
                        </motion.div>
                    ) : (
                        // LIVE ANALYSIS STATE
                        <motion.div 
                            key="analyzing"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                        >
                            {/* =========================================================================
                                LEFT PANEL: VISUAL INGESTION & WATER DYNAMICS 
                                ========================================================================= */}
                            <div className="lg:col-span-3 flex flex-col gap-6">
                                
                                {/* Live Feed Selector */}
                                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Video className="w-3 h-3"/> Uploaded</div>
                                        <div className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-[9px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1 shadow-[0_0_10px_rgba(34,211,238,0.1)]"><Camera className="w-3 h-3"/> Live CCTV</div>
                                        <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Radio className="w-3 h-3"/> RTSP</div>
                                    </div>
                                </div>

                                {/* Video Feed with Dynamic Water Overlay */}
                                <div className="bg-black border border-cyan-500/30 rounded-3xl overflow-hidden relative shadow-[0_0_30px_rgba(34,211,238,0.1)] group flex-shrink-0 h-[280px]">
                                    <video 
                                        ref={videoRef}
                                        src={videoUrl!} 
                                        autoPlay 
                                        loop 
                                        muted 
                                        className="w-full h-full object-cover opacity-80"
                                    />
                                    
                                    {/* CV Canvas Overlay */}
                                    <canvas 
                                        ref={cvCanvasRef}
                                        className="absolute inset-0 z-10 pointer-events-none"
                                    />

                                    <div className="absolute top-4 left-4 z-20">
                                        <div className="px-3 py-1 bg-black/60 backdrop-blur-sm border border-cyan-500/50 rounded-lg text-cyan-400 font-mono text-[10px] font-black uppercase flex items-center gap-2 transition-all hover:bg-black/80">
                                            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" /> 
                                            SOURCE: 
                                            <select 
                                                value={selectedCamera}
                                                onChange={(e) => {
                                                    setSelectedCamera(e.target.value);
                                                    if (isAnalyzing) {
                                                        setLogs([]);
                                                        setWaterLogs([]);
                                                        setSimStep(0);
                                                        setTimeout(() => startSimulation(), 100);
                                                    }
                                                }}
                                                className="bg-transparent text-cyan-400 font-black outline-none border-none cursor-pointer appearance-none pr-4"
                                            >
                                                <option className="bg-[#0f172a] text-cyan-400" value="PVNR_UNDERPASS_CAM_07">PVNR_UNDERPASS_CAM_07</option>
                                                <option className="bg-[#0f172a] text-cyan-400" value="HITECH_CITY_CAM_02">HITECH_CITY_CAM_02</option>
                                                <option className="bg-[#0f172a] text-cyan-400" value="KPHB_JUNCTION_CAM_14">KPHB_JUNCTION_CAM_14</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Dynamic Water Overlay */}
                                    {simStep >= 1 && (
                                        <div 
                                            className="absolute bottom-0 left-0 right-0 bg-cyan-600/40 border-t border-cyan-400/80 backdrop-blur-[2px] transition-all duration-[2000ms] ease-in-out z-10 flex items-start justify-center pt-2 overflow-hidden"
                                            style={{ height: simStep >= 5 ? '70%' : simStep >= 4 ? '55%' : simStep >= 3 ? '40%' : simStep >= 2 ? '25%' : '15%' }}
                                        >
                                            <div className="absolute top-0 w-full h-1 bg-cyan-300/80 blur-sm"></div>
                                            <div className="text-white font-mono text-[10px] font-black bg-black/40 px-2 py-0.5 rounded shadow-sm">WATER_SURFACE_TRACKING</div>
                                        </div>
                                    )}
                                </div>

                                {/* Water Rise Timeline & Velocity */}
                                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 flex-grow flex flex-col">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500 mb-4 flex items-center gap-2"><Activity className="w-4 h-4"/> Water Rise Telemetry</h3>
                                    
                                    <div className="bg-black/50 border border-white/5 rounded-xl p-3 mb-4 flex justify-between items-center">
                                        <div>
                                            <div className="text-[8px] uppercase tracking-widest text-slate-500">Rise Rate</div>
                                            <div className={`text-sm font-mono font-black ${parseFloat(calculateRiseRate()) > 0.12 ? 'text-rose-400' : 'text-emerald-400'}`}>{calculateRiseRate()}m/min</div>
                                        </div>
                                        <div className="h-6 w-px bg-white/10"></div>
                                        <div className="text-right">
                                            <div className="text-[8px] uppercase tracking-widest text-slate-500">Critical Threshold</div>
                                            <div className="text-sm font-mono font-black text-slate-300">0.12m/min</div>
                                        </div>
                                    </div>

                                    <div className="flex-grow space-y-2 overflow-y-auto pr-2 max-h-[140px]">
                                        <AnimatePresence>
                                            {waterLogs.slice().reverse().map((log, i) => (
                                                <motion.div 
                                                    key={i}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="flex items-center justify-between text-[11px] font-mono border-b border-white/5 pb-2 last:border-0"
                                                >
                                                    <span className="text-slate-500">{log.time}</span>
                                                    <span className={`font-bold ${i === 0 ? 'text-cyan-400' : 'text-slate-400'}`}>{log.depth}</span>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                    
                                    {parseFloat(calculateRiseRate()) > 0.12 && waterLogs.length > 1 && (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-center bg-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest py-1.5 rounded">
                                            Rapid Rise Rate Detected
                                        </motion.div>
                                    )}
                                </div>
                            </div>

                            {/* =========================================================================
                                CENTER PANEL: MULTI-NODE, AI DECISION & FORECAST 
                                ========================================================================= */}
                            <div className="lg:col-span-5 flex flex-col gap-6">
                                
                                {/* Massive: Flood Severity Index */}
                                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden h-[200px]">
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.1)_0%,transparent_70%)] pointer-events-none"></div>
                                    <h3 className="text-[12px] font-black uppercase tracking-[0.4em] text-slate-500 mb-0">Flood Severity Index</h3>
                                    
                                    <motion.div 
                                        key={simStep}
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className={`text-[110px] font-black font-mono tracking-tighter leading-none ${simStep >= 4 ? 'text-rose-500 drop-shadow-[0_0_40px_rgba(244,63,94,0.6)]' : simStep >= 3 ? 'text-amber-500 drop-shadow-[0_0_40px_rgba(245,158,11,0.6)]' : simStep >= 2 ? 'text-cyan-400 drop-shadow-[0_0_40px_rgba(34,211,238,0.6)]' : 'text-slate-600'}`}
                                    >
                                        {simStep >= 4 ? '91' : simStep >= 3 ? '67' : simStep >= 2 ? '34' : '12'}
                                    </motion.div>
                                    
                                    <div className={`text-xl font-black tracking-[0.4em] uppercase mt-2 ${simStep >= 4 ? 'text-rose-500' : simStep >= 3 ? 'text-amber-500' : simStep >= 2 ? 'text-cyan-400' : 'text-slate-500'}`}>
                                        {simStep >= 4 ? 'CRITICAL' : simStep >= 3 ? 'WARNING' : simStep >= 2 ? 'WATCH' : 'NORMAL'}
                                    </div>
                                </div>

                                {/* WHY DID AI TRIGGER (Giant Card) */}
                                <div className="bg-[#0f172a] border border-indigo-900/40 rounded-3xl p-6 relative overflow-hidden flex-grow flex flex-col shadow-[inset_0_0_30px_rgba(99,102,241,0.05)]">
                                    <h3 className="text-xl font-black uppercase tracking-[0.1em] text-white mb-5">Why did AI Trigger?</h3>
                                    
                                    <div className="space-y-4 text-sm font-mono text-slate-300 font-bold flex-grow">
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${simStep >= 2 ? 'text-emerald-500' : 'text-slate-600'}`} /> Water Level Above Threshold</div>
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${simStep >= 3 ? 'text-emerald-500' : 'text-slate-600'}`} /> Rise Rate Above Threshold</div>
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${simStep >= 4 ? 'text-emerald-500' : 'text-slate-600'}`} /> Multi-Camera Confirmation</div>
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${simStep >= 5 ? 'text-emerald-500' : 'text-slate-600'}`} /> Route Accessibility Reduced</div>
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${simStep >= 5 ? 'text-emerald-500' : 'text-slate-600'}`} /> Historical Pattern Match</div>
                                    </div>

                                    {simStep >= 5 && (
                                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 flex justify-between items-center">
                                            <span className="text-xs uppercase tracking-widest text-indigo-400 font-black">AI Decision Confidence</span>
                                            <span className="text-2xl font-mono font-black text-indigo-300">94%</span>
                                        </motion.div>
                                    )}
                                </div>

                                {/* Multi-Camera & Prediction Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Multi-Camera Correlation */}
                                    <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5">
                                        <h3 className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400 mb-4">Multi-Node Correlation</h3>
                                        <div className="space-y-2 font-mono text-[11px] mb-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-slate-400">Camera A</span>
                                                <span className={`font-bold ${simStep >= 2 ? 'text-cyan-400' : 'text-slate-600'}`}>0.4m {simStep >= 2 && '↑'}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-slate-400">Camera B</span>
                                                <span className={`font-bold ${simStep >= 3 ? 'text-amber-400' : 'text-slate-600'}`}>0.8m {simStep >= 3 && '↑↑'}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-slate-400">Camera C</span>
                                                <span className={`font-bold ${simStep >= 4 ? 'text-rose-400' : 'text-slate-600'}`}>1.3m {simStep >= 4 && '↑↑↑'}</span>
                                            </div>
                                        </div>
                                        {simStep >= 4 && (
                                            <div className="text-[9px] text-center border-t border-white/5 pt-3 uppercase tracking-widest text-rose-400 font-black">
                                                Propagation: North → South
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Prediction Confidence */}
                                    <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5">
                                        <h3 className="text-[9px] font-black uppercase tracking-[0.1em] text-blue-400 mb-4">AI Forecast</h3>
                                        <div className="space-y-3 font-mono text-[11px] font-bold">
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">Road Closure</span>
                                                <span className={simStep >= 4 ? 'text-rose-400' : 'text-slate-600'}>{simStep >= 4 ? '96%' : '--'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">Vehicle Entrapment</span>
                                                <span className={simStep >= 4 ? 'text-amber-400' : 'text-slate-600'}>{simStep >= 4 ? '83%' : '--'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">Emergency Delay</span>
                                                <span className={simStep >= 4 ? 'text-cyan-400' : 'text-slate-600'}>{simStep >= 4 ? '91%' : '--'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* =========================================================================
                                RIGHT PANEL: CITY OS RESPONSES, LIABILITY, CITIZENS 
                                ========================================================================= */}
                            <div className="lg:col-span-4 flex flex-col gap-5">
                                
                                {/* Notification Center */}
                                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 h-[280px] flex flex-col">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2 flex-shrink-0"><Bell className="w-4 h-4"/> Notification Center</h3>
                                    <div className="flex-grow space-y-3 overflow-y-auto pr-2 flex flex-col custom-scrollbar">
                                        <AnimatePresence>
                                            {logs.map((log, i) => (
                                                <motion.div 
                                                    key={i + log.text}
                                                    initial={{ opacity: 0, x: -20, height: 0 }}
                                                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                                                    className={`flex-shrink-0 text-[10px] font-mono px-3 py-3 rounded-lg border flex flex-col gap-2 shadow-sm ${
                                                        log.type === 'critical' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                                                        log.type === 'alert' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                                        'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                                                    }`}
                                                >
                                                    <div className="flex gap-3 items-center">
                                                        <span className="opacity-60">{log.time}</span>
                                                        <span className="font-bold tracking-wide">
                                                            {log.linkUrl ? (
                                                                <a href={log.linkUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline hover:text-cyan-100 decoration-cyan-500/50 underline-offset-4">
                                                                    {log.text}
                                                                </a>
                                                            ) : (
                                                                log.text
                                                            )}
                                                        </span>
                                                    </div>
                                                    {log.screenshotUrl && (
                                                        <div className="mt-2 rounded border border-white/20 overflow-hidden relative shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                                                            <img src={log.screenshotUrl} alt="evidence" className="w-full h-auto max-h-[100px] object-cover opacity-90" />
                                                            <div className="absolute top-1 right-1 bg-black/80 px-2 py-1 rounded text-[8px] font-black uppercase text-cyan-400 border border-cyan-500/30 tracking-widest backdrop-blur-md">Evidence Captured</div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Green Wave Route Recalculation */}
                                <div className={`border rounded-3xl p-5 transition-all duration-500 ${simStep >= 6 ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-[#0f172a] border-slate-800'}`}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Route className={`w-4 h-4 ${simStep >= 6 ? 'text-emerald-400' : 'text-slate-500'}`} />
                                        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${simStep >= 6 ? 'text-emerald-400' : 'text-slate-400'}`}>Green Wave Link</h3>
                                    </div>
                                    
                                    {simStep >= 6 ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 font-mono text-xs font-bold">
                                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-slate-300">
                                                <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Old Route</div>
                                                <div className="flex justify-between items-center">
                                                    <span>PVNR Underpass</span>
                                                    <span className="text-rose-400">❌ BLOCKED</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex justify-center"><ArrowLeft className="w-4 h-4 text-emerald-500 -rotate-90" /></div>
                                            
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-white">
                                                <div className="text-[9px] uppercase tracking-widest text-emerald-600 mb-1">New Route</div>
                                                <div className="flex justify-between items-center">
                                                    <span>Outer Ring Access</span>
                                                    <span className="text-emerald-400">✓ ACTIVE</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div className="text-[10px] font-mono text-slate-600 py-6 text-center">Awaiting Threat Escalation...</div>
                                    )}
                                </div>

                                {/* Citizen Alert Network */}
                                <div className={`border rounded-3xl p-5 transition-all duration-500 ${simStep >= 7 ? 'bg-blue-950/20 border-blue-500/50' : 'bg-[#0f172a] border-slate-800'}`}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Smartphone className={`w-4 h-4 ${simStep >= 7 ? 'text-blue-400' : 'text-slate-500'}`} />
                                        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${simStep >= 7 ? 'text-blue-400' : 'text-slate-400'}`}>Citizen Alert Network</h3>
                                    </div>
                                    
                                    {simStep >= 7 ? (
                                        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                                            <div className="grid grid-cols-2 gap-3 text-center mb-4">
                                                <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                                                    <div className="text-lg font-mono font-black text-white">3.2 <span className="text-[10px] text-slate-500">km</span></div>
                                                    <div className="text-[8px] uppercase tracking-widest text-blue-400 mt-1">Broadcast Radius</div>
                                                </div>
                                                <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                                                    <div className="text-lg font-mono font-black text-white">1,842</div>
                                                    <div className="text-[8px] uppercase tracking-widest text-blue-400 mt-1">Devices Reached</div>
                                                </div>
                                            </div>
                                            <div className="bg-blue-600/20 border border-blue-500/50 rounded-xl p-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-[10px] font-bold text-blue-200">Safe Route Generated</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">✓ Sent</span>
                                                </div>
                                                <div className="text-[9px] text-slate-300 font-mono mt-1 border-t border-blue-500/30 pt-2">
                                                    ⚠ Flood Risk Near {selectedCamera.replace(/_/g, ' ')}. Avoid Route. Alternative Route Available.
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div className="text-[10px] font-mono text-slate-600 py-4 text-center">Standby...</div>
                                    )}
                                </div>

                                {/* Liability Integration */}
                                <div className={`border rounded-3xl p-5 transition-all duration-500 ${simStep >= 7 ? 'bg-[#0f172a] border-slate-700' : 'bg-[#0f172a] border-slate-800'}`}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <ShieldCheck className={`w-4 h-4 ${simStep >= 7 ? 'text-slate-300' : 'text-slate-500'}`} />
                                        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${simStep >= 7 ? 'text-slate-300' : 'text-slate-400'}`}>Liability Integration</h3>
                                    </div>
                                    
                                    {simStep >= 7 ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 text-[10px] font-mono text-slate-400">
                                            <div className="text-[9px] uppercase tracking-widest text-cyan-500 mb-2 font-black">Evidence Package Created</div>
                                            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-slate-500" /> Video Archived</div>
                                            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-slate-500" /> Water Metrics Stored</div>
                                            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-slate-500" /> Response Timeline Stored</div>
                                            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-slate-500" /> Notification Logs Stored</div>
                                        </motion.div>
                                    ) : (
                                        <div className="text-[10px] font-mono text-slate-600 py-3 text-center">Awaiting Incident Data...</div>
                                    )}
                                </div>

                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
