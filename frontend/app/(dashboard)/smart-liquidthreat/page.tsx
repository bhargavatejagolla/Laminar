"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft, 
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
    Activity,
    Smartphone,
    Maximize,
    Minimize
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
  const { t } = useTranslation();

    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    
    // Core App States
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [mlReady, setMlReady] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const cvCanvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(null);
    
    // Advanced AI Trackers
    const vehicleTrackerRef = useRef<{id: number, class: string, cx: number, cy: number, w: number, h: number, speed: number, vx: number, vy: number, stallTime: number, submergedPercent: number, rawDepth: number}[]>([]);
    const nextVehicleIdRef = useRef<number>(1);
    
    // Consensus Engine Trackers
    const [currentSeverity, setCurrentSeverity] = useState<number>(0);
    const [metrics, setMetrics] = useState({ waterCoverage: 0, trafficDisruption: 0, roadVisibility: 0, riseTrend: 0 });
    const [videoReady, setVideoReady] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const severityRef = useRef<number>(0);

    // Event Logs
    const [logs, setLogs] = useState<{time: string, text: string, type: 'info' | 'alert' | 'critical', screenshotUrl?: string | null, linkUrl?: string}[]>([]);
    const [severityLogs, setSeverityLogs] = useState<{time: string, severity: number, timestamp: number}[]>([]);
    const [selectedCamera, setSelectedCamera] = useState("PVNR_UNDERPASS_CAM_07");

    // Live Tracking states to drive UI
    const [hasNotified, setHasNotified] = useState({ elevated: false, high: false, critical: false });

    // Cleaned up TFJS loading since we now use the powerful Python YOLOv11 backend
    useEffect(() => {
        setMounted(true);
        setMlReady(true);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    // ... screenshot and logging functions ...
    const captureScreenshotUrl = () => {
        if (videoRef.current && cvCanvasRef.current) {
            try {
                const mergedCanvas = document.createElement('canvas');
                mergedCanvas.width = videoRef.current.videoWidth || 640;
                mergedCanvas.height = videoRef.current.videoHeight || 360;
                const ctx = mergedCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoRef.current, 0, 0, mergedCanvas.width, mergedCanvas.height);
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

    // Live AI Streaming to Python Backend
    useEffect(() => {
        console.log("AI Streaming Effect Triggered", { isAnalyzing, mlReady, videoReady, hasVideo: !!videoRef.current, hasCanvas: !!cvCanvasRef.current });
        
        if (!isAnalyzing || !cvCanvasRef.current || !videoRef.current || !mlReady || !videoReady) {
            console.log("AI Streaming Effect returned early. Waiting for refs to mount after Framer Motion exit animation...");
            return;
        }
        
        let active = true;
        const canvas = cvCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const video = videoRef.current;

        let lastTime = performance.now();

        const runInference = async () => {
            if (!active || !ctx) return;
            
            if (!video || video.readyState < 2) {
                animationRef.current = requestAnimationFrame(runInference) as any;
                return;
            }
            
            // Force play if browser paused it
            if (video.paused) {
                video.play().catch(e => console.log("Auto-play blocked:", e));
            }

            const nowTime = performance.now();
            const dt = nowTime - lastTime;
            
            // Sync canvas size to ACTUAL video resolution, not CSS scaled size
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 360;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Only send to backend every 300ms to avoid overwhelming the server
            if (dt > 300) {
                lastTime = nowTime;
                console.log("SENDING FRAME");
                try {
                    // Extract frame
                    const base64Frame = canvas.toDataURL('image/jpeg', 0.8);
                    
                    const res = await fetch('http://localhost:8000/api/v1/liquid/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image_base64: base64Frame,
                            camera_id: selectedCamera
                        })
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        console.log("Backend Data:", data);
                        
                        // Update state from ultra-accurate Python YOLOv11 backend
                        severityRef.current = data.severity;
                        setCurrentSeverity(data.severity);
                        setMetrics({
                            waterCoverage: data.water_coverage,
                            trafficDisruption: data.traffic_disruption,
                            roadVisibility: data.road_visibility_loss,
                            riseTrend: data.rise_trend
                        });
                        
                        // Map detections for drawing
                        vehicleTrackerRef.current = data.detections.map((d: any, idx: number) => ({
                            id: idx, class: d.class, 
                            cx: d.x + (d.w/2), cy: d.y + (d.h/2), 
                            w: d.w, h: d.h
                        }));
                    }
                } catch (e) {
                    console.error("Backend AI Error:", e);
                }
            }

            // ============================================================================
            // VISUALIZATION DRAWING
            // ============================================================================
            const rulerX = Math.floor(canvas.width * 0.15);
            const rulerY = Math.floor(canvas.height * 0.2);
            const rulerH = Math.floor(canvas.height * 0.7);
            const rulerW = 20;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(rulerX, rulerY, rulerW, rulerH);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
            ctx.lineWidth = 1;
            ctx.strokeRect(rulerX, rulerY, rulerW, rulerH);
            
            for(let i=0; i<=5; i++) {
                const markY = rulerY + (rulerH * (i/5));
                ctx.beginPath();
                ctx.moveTo(rulerX - 5, markY);
                ctx.lineTo(rulerX + 25, markY);
                ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
                ctx.stroke();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.font = 'bold 9px monospace';
                ctx.fillText(`${(1.5 - (i * 0.3)).toFixed(1)}m`, rulerX + 30, markY + 3);
            }

            const severityPixelY = rulerY + (rulerH * (1 - (severityRef.current / 100)));
            ctx.beginPath();
            ctx.moveTo(0, severityPixelY);
            ctx.lineTo(canvas.width, severityPixelY);
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(6, 182, 212, 0.8)';
            ctx.fillText(`SEVERITY: ${severityRef.current.toFixed(1)}/100`, 10, severityPixelY - 5);

            vehicleTrackerRef.current.forEach(v => {
                const minX = v.cx - v.w/2;
                const minY = v.cy - v.h/2;
                
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
                ctx.lineWidth = 2;
                ctx.strokeRect(minX, minY, v.w, v.h);
                
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(minX, minY - 15, 80, 15);
                
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 9px monospace';
                ctx.fillText(`${v.class.toUpperCase()} #${v.id}`, minX + 5, minY - 5);
            });

            ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`YOLOv11 BACKEND ACTIVE`, canvas.width - 150, 20);

            animationRef.current = requestAnimationFrame(runInference) as any;
        };

        runInference();

        return () => {
            active = false;
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isAnalyzing, mlReady, selectedCamera, videoUrl, videoReady]);

    // Live Metrics processing every second
    useEffect(() => {
        if (!isAnalyzing) return;
        
        const metricsInterval = setInterval(() => {
            const date = new Date();
            const time = date.toLocaleTimeString('en-US', { hour12: false });
            
            if (severityRef.current > 0) {
                setSeverityLogs(prev => {
                    const newLogs = [...prev, { time, severity: severityRef.current, timestamp: date.getTime() }];
                    return newLogs.slice(-20); // Keep last 20
                });
            }

            setSeverityLogs(currentLogs => {
                const sev = severityRef.current;
                // Notification Logic Engine
                
                // ELEVATED (>25)
                if (sev > 25 && !hasNotified.elevated) {
                    setHasNotified(prev => ({ ...prev, elevated: true }));
                    addLog("📢 Citizen Alert Broadcast via SMS (ELEVATED)", "info");
                }
                
                // HIGH (>50)
                if (sev > 50 && !hasNotified.high) {
                    setHasNotified(prev => ({ ...prev, high: true }));
                    addLog("🚨 Guardian Route Active: Rerouting Pedestrians", "alert");
                }

                // CRITICAL (>75)
                if (sev > 75 && !hasNotified.critical) {
                    setHasNotified(prev => ({ ...prev, critical: true }));
                    addLog("🛑 Traffic Signals Locked RED", "critical", true);
                    addLog("🚑 Green Wave Activated for Emergency Corridors", "critical");
                    addLog("🏢 Incident Hub Created for Command Center", "critical");
                    
                    fetch('/api/notify', {
                        method: 'POST',
                        body: JSON.stringify({
                            location: selectedCamera,
                            severity: 'CRITICAL',
                            confidence: 96,
                            severityScore: sev.toFixed(1),
                            screenshotUrl: captureScreenshotUrl()
                        })
                    }).then(res => res.json()).then((data) => {
                        if (data.realEmail) addLog("✉ DISPATCHED: Email delivered directly to Authorities", "info");
                        else if (data.previewUrl) addLog("✉ DISPATCHED: Email Sent. [Click to View]", "info", false, data.previewUrl);
                    }).catch(console.error);
                }
                
                return currentLogs;
            });
            
        }, 1000);
        
        return () => clearInterval(metricsInterval);
    }, [isAnalyzing, selectedCamera, hasNotified, logs]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setVideoUrl(url);
            setIsAnalyzing(true);
            setLogs([]);
            setSeverityLogs([]);
            setHasNotified({ elevated: false, high: false, critical: false });
            addLog(`Omni-Base Analysis Started: ${selectedCamera.replace(/_/g, ' ')}`, "info");
        }
    };

    const resetSystem = () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setVideoUrl(null);
        setIsAnalyzing(false);
        setVideoReady(false);
        setLogs([]);
        setSeverityLogs([]);
        setHasNotified({ elevated: false, high: false, critical: false });
        setCurrentSeverity(0);
        setMetrics({ waterCoverage: 0, trafficDisruption: 0, roadVisibility: 0, riseTrend: 0 });
    };

    if (!mounted) return null;

    // Derived UI State
    const sevString = currentSeverity > 75 ? 'CRITICAL' : currentSeverity > 50 ? 'HIGH' : currentSeverity > 25 ? 'ELEVATED' : 'NORMAL';

    return (
        <div className="min-h-screen bg-[#020617] text-white pb-24 relative overflow-hidden font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
            <AquaticBackground />
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-blue-600 via-cyan-400 to-teal-600 z-50 shadow-[0_0_20px_rgba(34,211,238,0.5)]"></div>

            <div className="relative z-10 px-6 pt-10 max-w-[1800px] mx-auto">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
                    <div className="flex items-start gap-6">
                        <button
                            onClick={() => router.push("/sentinel-command")}
                            className="group flex flex-col items-center justify-center gap-1 mt-1 transition-all"
                        >
                            <div className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shadow-[0_0_15px_rgba(0,0,0,0.3)]">
                                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors group-hover:-translate-x-0.5" />
                            </div>
                            <span className="text-[9px] font-black tracking-[0.1em] text-slate-500 uppercase mt-1">{t("auto.Back_4341") || "Back"}</span>
                        </button>

                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Waves className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400">
                                    {t("auto.InnovatorDemoEn_4551") || "Innovator Demo Engine Active"}
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] mb-2">
                                {t("auto.LaminarFlood_2648") || "Laminar Flood"} <span className="text-cyan-400">{t("auto.IntelligenceNet_6671") || "Intelligence Network"}</span>
                            </h1>
                            <p className="text-xs md:text-sm font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                {t("auto.MultiNodeOmniBa_8797") || "Multi-Node Omni-Base Calibration & City Response OS"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-3 shadow-[0_0_15px_rgba(34,211,238,0.15)]">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shadow-[0_0_8px_rgba(34,211,238,1)]"></span>
                            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em]">{t("auto.SensorsActive_4449") || "Sensors Active"}</span>
                        </div>
                        {isAnalyzing && (
                            <button onClick={resetSystem} className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl hover:bg-rose-500/20 transition-all text-rose-400" title={t("auto.ResetDemo_1130") || "Reset Demo"}>
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </motion.div>

                <AnimatePresence mode="wait">
                    {!isAnalyzing ? (
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
                            
                            <h2 className="text-3xl font-black uppercase tracking-widest text-white mb-4 drop-shadow-md">{t("auto.GlobalFloodMoni_4625") || "Global Flood Monitors Online"}</h2>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest max-w-lg text-center leading-relaxed mb-12">
                                {t("auto.Uploadunderpass_3531") || "Upload underpass CCTV footage containing pedestrians or vehicles. Omni-Base AI will dynamically calibrate depth and trigger the City OS."}
                            </p>
                            
                            <label className="cursor-pointer relative z-10 group/btn flex flex-col items-center">
                                <div className="px-8 py-4 rounded-xl bg-cyan-500 text-black font-black uppercase tracking-widest flex items-center gap-3 transition-all group-hover/btn:bg-cyan-400 group-hover/btn:scale-105 shadow-[0_0_30px_rgba(34,211,238,0.4)]">
                                    <UploadCloud className="w-6 h-6" /> {t("auto.StartIntelligen_4261") || "Start Intelligence Network"}
                                </div>
                                <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="analyzing"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                        >
                            <div className="lg:col-span-3 flex flex-col gap-6">
                                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Video className="w-3 h-3"/> {t("auto.Uploaded_1042") || "Uploaded"}</div>
                                        <div className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-[9px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1 shadow-[0_0_10px_rgba(34,211,238,0.1)]"><Camera className="w-3 h-3"/> {t("auto.LiveStream_8006") || "Live Stream"}</div>
                                    </div>
                                </div>

                                <div className={`bg-black border border-cyan-500/30 rounded-3xl overflow-hidden relative shadow-[0_0_30px_rgba(34,211,238,0.1)] flex-shrink-0 transition-all duration-300 group ${isFullscreen ? 'fixed inset-4 z-50 flex items-center justify-center' : 'w-full aspect-video'}`}>
                                    
                                    <button 
                                        onClick={() => setIsFullscreen(!isFullscreen)}
                                        className="absolute bottom-4 right-4 z-30 p-2 bg-black/60 hover:bg-cyan-500/20 border border-cyan-500/50 rounded-lg text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title={isFullscreen ? "Exit Fullscreen" : "Maximize Video"}
                                    >
                                        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                                    </button>

                                    <video 
                                        ref={videoRef}
                                        src={videoUrl!} 
                                        autoPlay 
                                        loop 
                                        muted 
                                        onLoadedData={() => setVideoReady(true)}
                                        className={`w-full h-full object-contain opacity-80 ${isFullscreen ? 'max-w-full max-h-full' : ''}`}
                                    />
                                    <canvas ref={cvCanvasRef} className="absolute inset-0 z-10 pointer-events-none w-full h-full object-contain" />

                                    <div className="absolute top-4 left-4 z-20">
                                        <div className="px-3 py-1 bg-black/60 backdrop-blur-sm border border-cyan-500/50 rounded-lg text-cyan-400 font-mono text-[10px] font-black uppercase flex items-center gap-2 transition-all hover:bg-black/80">
                                            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" /> 
                                            SOURCE: 
                                            <select 
                                                value={selectedCamera}
                                                onChange={(e) => setSelectedCamera(e.target.value)}
                                                className="bg-transparent text-cyan-400 font-black outline-none border-none cursor-pointer appearance-none pr-4"
                                            >
                                                <option className="bg-[#0f172a] text-cyan-400" value="PVNR_UNDERPASS_CAM_07">PVNR_UNDERPASS_CAM_07</option>
                                                <option className="bg-[#0f172a] text-cyan-400" value="HITECH_CITY_CAM_02">HITECH_CITY_CAM_02</option>
                                                <option className="bg-[#0f172a] text-cyan-400" value="KPHB_JUNCTION_CAM_14">KPHB_JUNCTION_CAM_14</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-4 left-4 z-20">
                                        <div className={`px-3 py-1.5 backdrop-blur-md border rounded-lg font-mono text-[10px] font-black uppercase tracking-widest shadow-lg ${currentSeverity > 75 ? 'bg-rose-900/80 border-rose-500/50 text-rose-300' : currentSeverity > 50 ? 'bg-amber-900/80 border-amber-500/50 text-amber-300' : 'bg-cyan-900/80 border-cyan-500/50 text-cyan-300'}`}>
                                            TRAFFIC DISRUPTION: {metrics.trafficDisruption.toFixed(1)}/100
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 flex-grow flex flex-col">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500 mb-4 flex items-center gap-2"><Activity className="w-4 h-4"/> {t("auto.LiveTelemetry_9011") || "Live Telemetry"}</h3>
                                    
                                    <div className="flex-grow space-y-3 font-mono text-[11px]">
                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                            <span className="text-slate-400">{t("auto.WaterCoverage_7278") || "Water Coverage"}</span>
                                            <span className={`font-bold ${metrics.waterCoverage > 50 ? 'text-amber-400' : 'text-cyan-400'}`}>{metrics.waterCoverage.toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                            <span className="text-slate-400">{t("auto.TrafficDisrupti_5226") || "Traffic Disruption"}</span>
                                            <span className={`font-bold ${metrics.trafficDisruption > 50 ? 'text-rose-400' : 'text-cyan-400'}`}>{metrics.trafficDisruption.toFixed(1)}/100</span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                            <span className="text-slate-400">{t("auto.RoadVisibilityL_5816") || "Road Visibility Loss"}</span>
                                            <span className={`font-bold ${metrics.roadVisibility > 50 ? 'text-amber-400' : 'text-cyan-400'}`}>{metrics.roadVisibility.toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-2">
                                            <span className="text-slate-400">{t("auto.RiseTrend_2096") || "Rise Trend"}</span>
                                            <span className={`font-bold ${metrics.riseTrend > 20 ? 'text-rose-400' : 'text-cyan-400'}`}>+{metrics.riseTrend.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-5 flex flex-col gap-6">
                                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden h-[200px]">
                                    <h3 className="text-[12px] font-black uppercase tracking-[0.4em] text-slate-500 mb-0">{t("auto.FloodSeverityIn_716") || "Flood Severity Index"}</h3>
                                    <motion.div 
                                        key={Math.floor(currentSeverity)}
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className={`text-[110px] font-black font-mono tracking-tighter leading-none ${currentSeverity > 75 ? 'text-rose-500 drop-shadow-[0_0_40px_rgba(244,63,94,0.6)]' : currentSeverity > 50 ? 'text-amber-500 drop-shadow-[0_0_40px_rgba(245,158,11,0.6)]' : 'text-cyan-400 drop-shadow-[0_0_40px_rgba(34,211,238,0.6)]'}`}
                                    >
                                        {Math.floor(currentSeverity)}
                                    </motion.div>
                                    <div className={`text-xl font-black tracking-[0.4em] uppercase mt-2 ${currentSeverity > 75 ? 'text-rose-500' : currentSeverity > 50 ? 'text-amber-500' : currentSeverity > 25 ? 'text-cyan-400' : 'text-slate-500'}`}>
                                        {sevString}
                                    </div>
                                </div>

                                <div className="bg-[#0f172a] border border-indigo-900/40 rounded-3xl p-6 relative overflow-hidden flex-grow flex flex-col shadow-[inset_0_0_30px_rgba(99,102,241,0.05)]">
                                    <h3 className="text-xl font-black uppercase tracking-[0.1em] text-white mb-5">{t("auto.AIRealTimeTrigg_8846") || "AI Real-Time Triggers"}</h3>
                                    <div className="space-y-4 text-sm font-mono text-slate-300 font-bold flex-grow">
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${currentSeverity > 25 ? 'text-emerald-500' : 'text-slate-600'}`} /> {t("auto.CitizenAlertCon_1437") || "Citizen Alert Condition Met"}</div>
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${currentSeverity > 50 ? 'text-emerald-500' : 'text-slate-600'}`} /> {t("auto.GuardianRerouti_2059") || "Guardian Rerouting Triggered"}</div>
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${currentSeverity > 75 ? 'text-emerald-500' : 'text-slate-600'}`} /> {t("auto.GreenWaveEscala_6609") || "Green Wave Escalation Active"}</div>
                                        <div className="flex items-center gap-3"><CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${currentSeverity > 75 ? 'text-emerald-500' : 'text-slate-600'}`} /> {t("auto.IncidentHubComm_6887") || "Incident Hub Command Generated"}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-4 flex flex-col gap-5">
                                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 h-[280px] flex flex-col">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2 flex-shrink-0"><Bell className="w-4 h-4"/> {t("auto.NotificationCen_476") || "Notification Center"}</h3>
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
                                                            <div className="absolute top-1 right-1 bg-black/80 px-2 py-1 rounded text-[8px] font-black uppercase text-cyan-400 border border-cyan-500/30 tracking-widest backdrop-blur-md">{t("auto.EvidenceCapture_2686") || "Evidence Captured"}</div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                <div className={`border rounded-3xl p-5 transition-all duration-500 ${currentSeverity > 75 ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-[#0f172a] border-slate-800'}`}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Route className={`w-4 h-4 ${currentSeverity > 75 ? 'text-emerald-400' : 'text-slate-500'}`} />
                                        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${currentSeverity > 75 ? 'text-emerald-400' : 'text-slate-400'}`}>{t("auto.GreenWaveLink_1433") || "Green Wave Link"}</h3>
                                    </div>
                                    {currentSeverity > 75 ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 font-mono text-xs font-bold">
                                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-slate-300">
                                                <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">{t("auto.OldRoute_2351") || "Old Route"}</div>
                                                <div className="flex justify-between items-center">
                                                    <span>{selectedCamera.replace(/_/g, ' ')}</span>
                                                    <span className="text-rose-400">❌ BLOCKED</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-center"><ArrowLeft className="w-4 h-4 text-emerald-500 -rotate-90" /></div>
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-white">
                                                <div className="text-[9px] uppercase tracking-widest text-emerald-600 mb-1">{t("auto.NewRoute_6040") || "New Route"}</div>
                                                <div className="flex justify-between items-center">
                                                    <span>{t("auto.OuterRingAccess_8066") || "Outer Ring Access"}</span>
                                                    <span className="text-emerald-400">✓ ACTIVE</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div className="text-[10px] font-mono text-slate-600 py-6 text-center">{t("auto.AwaitingCritica_3712") || "Awaiting Critical Escalation..."}</div>
                                    )}
                                </div>

                                <div className={`border rounded-3xl p-5 transition-all duration-500 ${currentSeverity > 25 ? 'bg-blue-950/20 border-blue-500/50' : 'bg-[#0f172a] border-slate-800'}`}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Smartphone className={`w-4 h-4 ${currentSeverity > 25 ? 'text-blue-400' : 'text-slate-500'}`} />
                                        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${currentSeverity > 25 ? 'text-blue-400' : 'text-slate-400'}`}>{t("auto.CitizenAlertNet_9366") || "Citizen Alert Network"}</h3>
                                    </div>
                                    {currentSeverity > 25 ? (
                                        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                                            <div className="grid grid-cols-2 gap-3 text-center mb-4">
                                                <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                                                    <div className="text-lg font-mono font-black text-white">3.2 <span className="text-[10px] text-slate-500">km</span></div>
                                                    <div className="text-[8px] uppercase tracking-widest text-blue-400 mt-1">{t("auto.BroadcastRadius_222") || "Broadcast Radius"}</div>
                                                </div>
                                                <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                                                    <div className="text-lg font-mono font-black text-white">1,842</div>
                                                    <div className="text-[8px] uppercase tracking-widest text-blue-400 mt-1">{t("auto.DevicesReached_8210") || "Devices Reached"}</div>
                                                </div>
                                            </div>
                                            <div className="bg-blue-600/20 border border-blue-500/50 rounded-xl p-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-[10px] font-bold text-blue-200">{t("auto.SafeRouteGenera_7681") || "Safe Route Generated"}</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">✓ Sent</span>
                                                </div>
                                                <div className="text-[9px] text-slate-300 font-mono mt-1 border-t border-blue-500/30 pt-2">
                                                    ⚠ Flood Risk Near {selectedCamera.replace(/_/g, ' ')}. Avoid Route.
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div className="text-[10px] font-mono text-slate-600 py-4 text-center">{t("auto.Standby_9804") || "Standby..."}</div>
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
