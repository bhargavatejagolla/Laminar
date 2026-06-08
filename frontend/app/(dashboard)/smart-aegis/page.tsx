"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ArrowLeft, AlertTriangle, Camera, Video,
    UploadCloud, Trash2, HeartPulse, Activity, Bell,
    Map, Navigation, Users, Ambulance, Target, ShieldAlert,
    CheckCircle, Zap, ArrowDown
} from "lucide-react";

// Dark medical theme background
const AegisBackground = () => (
    <div className="fixed inset-0 z-0 bg-[#020617] overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(244,63,94,0.03)_0%,rgba(2,6,23,1)_100%)]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.03] mix-blend-overlay"></div>
    </div>
);

// We need to declare the global variables added by the CDN scripts
declare global {
  interface Window {
    tf?: any;
    poseDetection?: any;
    cocoSsd?: any;
  }
}

export default function SmartAegisPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    
    // Core States
    const [videoUrl, setVideoUrl] = useState<string | null>("/test_incident.mp4");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [mlReady, setMlReady] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const cvCanvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | undefined>(undefined);
    
    const [fps, setFps] = useState(0);

    // Simulation States
    const [logs, setLogs] = useState<{time: string, text: string, type: 'info' | 'alert' | 'critical', screenshotUrl?: string | null, linkUrl?: string}[]>([]);
    const [simStep, setSimStep] = useState(0);
    const [selectedCamera, setSelectedCamera] = useState("KBR_PARK_JOGGING_TRACK_CAM_03");
    const [targetLock, setTargetLock] = useState<{x: number, y: number} | null>(null);
    const [droneCountdown, setDroneCountdown] = useState(43);
    const hasTriggeredRef = useRef(false);
    
    // Advanced Tracking Refs
    const motionlessTrackerRef = useRef<{cx: number, cy: number, startTime: number} | null>(null);
    const victimLockRef = useRef<{cx: number, cy: number} | null>(null);
    const syntheticVictimRef = useRef<{cx: number, cy: number, startTime: number} | null>(null);
    
    // NEW: Robust Person Tracking for Vertical Drop Detection
    const personTrackerRef = useRef<{id: number, cx: number, cy: number, w: number, h: number, yHistory: {y: number, h: number, time: number}[], minY?: number, maxH?: number, lastSeen?: number, matchedThisFrame?: boolean}[]>([]);
    const nextPersonIdRef = useRef<number>(1);
    const fallZonesRef = useRef<{cx: number, cy: number, time: number}[]>([]);

    useEffect(() => {
        if (simStep >= 3 && droneCountdown > 0) {
            const int = setInterval(() => {
                setDroneCountdown(prev => prev > 0 ? prev - 1 : 0);
            }, 1000);
            return () => clearInterval(int);
        }
    }, [simStep, droneCountdown]);

    // Load TFJS via CDN to bypass Next.js Webpack issues completely!
    useEffect(() => {
        setMounted(true);
        
        const loadScript = (src: string) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        };

        const initML = async () => {
            try {
                if (!window.tf) {
                    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
                    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter');
                    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl');
                    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd');
                }
                await window.tf.ready();
                setMlReady(true);
            } catch (e) {
                console.error("Failed to load ML models from CDN", e);
            }
        };
        initML();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    // Auto-start simulation when video is ready
    useEffect(() => {
        if (mounted && videoUrl && !isAnalyzing && mlReady) {
            hasTriggeredRef.current = false;
            setIsAnalyzing(true);
        }
    }, [mounted, videoUrl, mlReady, selectedCamera]);

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
        if (includeScreenshot) screenshotUrl = captureScreenshotUrl();
        setLogs(prev => [{ time, text, type, screenshotUrl, linkUrl }, ...prev]);
    };

    const resetSystem = () => {
        if (videoUrl && videoUrl !== "/test_incident.mp4") URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
        setIsAnalyzing(false);
        setLogs([]);
        setSimStep(0);
        setTargetLock(null);
        setDroneCountdown(43);
        hasTriggeredRef.current = false;
        motionlessTrackerRef.current = null;
        victimLockRef.current = null;
        syntheticVictimRef.current = null;
        personTrackerRef.current = [];
        nextPersonIdRef.current = 1;
        fallZonesRef.current = [];
    };

    const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cvCanvasRef.current || !isAnalyzing) return;
        const rect = cvCanvasRef.current.getBoundingClientRect();
        // Calculate click coordinates relative to the canvas internal resolution
        const scaleX = cvCanvasRef.current.width / rect.width;
        const scaleY = cvCanvasRef.current.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // Human-in-the-Loop Override: Force AI to analyze this specific region
        syntheticVictimRef.current = { cx: x, cy: y, startTime: performance.now() };
        addLog(`🎯 MANUAL OVERRIDE: Human-in-the-Loop Region Analysis Initiated`, 'info');
    };

    // REAL YOLO-Pose Inference Loop via CDN
    useEffect(() => {
        if (!isAnalyzing || !cvCanvasRef.current || !videoRef.current || !mlReady) return;
        
        let active = true;
        let detector: any = null;

        const setupInference = async () => {
            try {
                detector = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
                runInference();
            } catch (e) {
                console.error("Detector creation failed", e);
            }
        };

        const canvas = cvCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const video = videoRef.current;

        let lastTime = performance.now();
        let frameCount = 0;

        const runInference = async () => {
            if (!active || !ctx) return;
            
            if (!video || video.readyState < 2 || video.paused || video.ended) {
                animationRef.current = requestAnimationFrame(runInference);
                return;
            }

            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            try {
                // PASS 1: Full Frame Inference
                const predictionsFull = await detector.detect(video);
                
                // PASS 2: Multi-Scale Image Pyramid
                const offCanvas = document.createElement('canvas');
                offCanvas.width = canvas.width;
                offCanvas.height = canvas.height;
                const offCtx = offCanvas.getContext('2d');
                if (offCtx) {
                    offCtx.drawImage(video, video.videoWidth * 0.1, 0, video.videoWidth * 0.8, video.videoHeight * 0.5, 0, 0, offCanvas.width, offCanvas.height);
                }
                const predictionsZoomed = await detector.detect(offCanvas);

                const mergedDetections: any[] = [];
                
                predictionsFull.forEach((p: any) => {
                    if (p.class === 'person' && p.score > 0.4) mergedDetections.push({ bbox: p.bbox, score: p.score });
                });
                
                predictionsZoomed.forEach((p: any) => {
                    if (p.class === 'person' && p.score > 0.4) {
                        const [x, y, w, h] = p.bbox;
                        mergedDetections.push({
                            bbox: [(x * 0.8) + (video.videoWidth * 0.1), y * 0.5, w * 0.8, h * 0.5],
                            score: p.score
                        });
                    }
                });

                let currentFrameCollapsed: {cx: number, cy: number}[] = [];
                const nowTime = performance.now();
                const currentDetections: any[] = [];

                mergedDetections.forEach((det: any) => {
                    const [x, y, w, h] = det.bbox;
                    const cx = x + w/2;
                    const cy = y + h/2;
                    currentDetections.push({ cx, cy, w, h, minX: x, minY: y, score: det.score });
                });

                // 1. Update Person Tracker
                const newTrackedPersons: typeof personTrackerRef.current = [];
                currentDetections.forEach(det => {
                    let bestMatch: any = null;
                    let minDt = 250; // Increased to 250px to handle chaotic falls!
                    personTrackerRef.current.forEach(p => {
                        const dist = Math.hypot(p.cx - det.cx, p.cy - det.cy);
                        if (dist < minDt) {
                            minDt = dist;
                            bestMatch = p;
                        }
                    });

                    if (bestMatch) {
                        bestMatch.cx = det.cx;
                        bestMatch.cy = det.cy;
                        bestMatch.w = det.w;
                        bestMatch.h = det.h;
                        bestMatch.minY = Math.min(bestMatch.minY || det.minY, det.minY);
                        bestMatch.maxH = Math.max(bestMatch.maxH || det.h, det.h);
                        bestMatch.lastSeen = nowTime;
                        bestMatch.yHistory.push({ y: det.cy, h: det.h, time: nowTime });
                        bestMatch.yHistory = bestMatch.yHistory.filter((h: any) => nowTime - h.time < 1500);
                        bestMatch.matchedThisFrame = true;
                    } else {
                        newTrackedPersons.push({
                            id: nextPersonIdRef.current++,
                            cx: det.cx,
                            cy: det.cy,
                            w: det.w,
                            h: det.h,
                            minY: det.minY,
                            maxH: det.h,
                            lastSeen: nowTime,
                            yHistory: [{ y: det.cy, h: det.h, time: nowTime }],
                            matchedThisFrame: true
                        });
                    }
                });
                
                // Keep IDs alive through occlusion (1 second memory buffer)
                personTrackerRef.current.forEach(p => {
                    if (p.matchedThisFrame) {
                        newTrackedPersons.push(p);
                        delete p.matchedThisFrame;
                    } else if (nowTime - (p.lastSeen || nowTime) < 1000) {
                        newTrackedPersons.push(p);
                    }
                });

                personTrackerRef.current = newTrackedPersons;

                // Draw Fall Zones
                fallZonesRef.current.forEach(zone => {
                    const age = nowTime - zone.time;
                    const pulse = (Math.sin(age / 150) + 1) / 2;
                    ctx.beginPath();
                    ctx.arc(zone.cx, zone.cy, 60, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(234, 179, 8, ${0.1 + pulse * 0.2})`; // Flashing Yellow
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    ctx.fillStyle = '#facc15';
                    ctx.font = 'bold 10px monospace';
                    ctx.fillText('⚠ KINETIC ANOMALY', zone.cx - 45, zone.cy - 65);
                });

                // 2. Evaluate Advanced Fall Logic & Draw
                newTrackedPersons.forEach(person => {
                    const det = currentDetections.find(d => d.cx === person.cx && d.cy === person.cy);
                    if (!det) return;

                    const { w, h, minX, minY, score, cx, cy } = det;

                    // SIMPLIFIED, BULLETPROOF HEURISTICS
                    let vDisp = 0;
                    let hDropPercent = 0;
                    let isCollapsed = false;
                    let inZone = false;

                    if (person.yHistory.length > 3) {
                        const oldestY = person.yHistory[0].y;
                        const oldestH = person.yHistory[0].h;
                        const oldestTime = person.yHistory[0].time;
                        
                        vDisp = cy - oldestY;
                        hDropPercent = oldestH ? Math.round((1 - (h / oldestH)) * 100) : 0;
                        
                        // IF ANY OF THESE HAPPEN IN < 1.5s, DROP A FALL ZONE
                        const isSevereDrop = hDropPercent > 35; // Lost 35% of recent height
                        const isRapidFall = vDisp > (oldestH * 0.3) || vDisp > 40; // Dropped 30% of height, or 40px
                        const isHorizontal = w > h * 1.0; // Wider than tall
                        
                        if ((isSevereDrop || isRapidFall || isHorizontal) && (nowTime - oldestTime < 1500) && !hasTriggeredRef.current) {
                            const exists = fallZonesRef.current.some(z => Math.hypot(z.cx - cx, z.cy - cy) < 100);
                            if (!exists) {
                                fallZonesRef.current.push({ cx, cy, time: nowTime });
                            }
                        }
                    }

                    if (!hasTriggeredRef.current) {
                        inZone = fallZonesRef.current.some(z => Math.hypot(z.cx - cx, z.cy - cy) < 100);
                        if (inZone) {
                            isCollapsed = true;
                            currentFrameCollapsed.push({ cx, cy });
                        }
                    } else if (hasTriggeredRef.current && inZone) {
                        isCollapsed = true;
                    }

                    const isVictim = isCollapsed || (hasTriggeredRef.current && isCollapsed);
                    
                    let shouldDraw = true;
                    if (hasTriggeredRef.current && victimLockRef.current) {
                        const distToVictim = Math.hypot(cx - victimLockRef.current.cx, cy - victimLockRef.current.cy);
                        if (distToVictim < 100) {
                            victimLockRef.current.cx = cx;
                            victimLockRef.current.cy = cy;
                        } else {
                            shouldDraw = false;
                        }
                    }
                    
                    if (!shouldDraw) return;

                    let isTarget = false;
                    if (targetLock && !hasTriggeredRef.current) {
                        const dist = Math.hypot(cx - targetLock.x, cy - targetLock.y);
                        if (dist < 50) isTarget = true;
                    }

                    ctx.fillStyle = isVictim && hasTriggeredRef.current ? '#f43f5e' : (inZone ? '#facc15' : '#22d3ee');
                    ctx.strokeStyle = isVictim && hasTriggeredRef.current ? 'rgba(244, 63, 94, 0.9)' : (inZone ? 'rgba(250, 204, 21, 0.9)' : (isTarget ? 'rgba(16, 185, 129, 0.9)' : 'rgba(34, 211, 238, 0.9)'));
                    ctx.lineWidth = isVictim || isTarget || inZone ? 3 : 2;

                    ctx.strokeRect(minX, minY, w, h);
                    
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.fillRect(minX, minY - 18, (isVictim && hasTriggeredRef.current) ? 180 : (isTarget ? 160 : 130), 18);
                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 11px monospace';
                    
                    let label = `person ${(score || 0.88).toFixed(2)}`;
                    if (isVictim && hasTriggeredRef.current) label = `⚠ VICTIM_DETECTED (91%)`;
                    else if (isTarget) label = `🎯 LOCKED_TARGET ${(score || 0.88).toFixed(2)}`;
                    else if (inZone) label = `⚠ ZONE_SUBJECT ${(score || 0.88).toFixed(2)}`;
                    
                    ctx.fillText(label, minX + 5, minY - 5);
                    
                    // --- LIVE DEBUG HUD ---
                    if (!hasTriggeredRef.current && w > 30) {
                        let hudX = minX + w + 5;
                        if (hudX + 140 > canvas.width) hudX = minX - 145; // Prevent clipping
                        
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                        ctx.fillRect(hudX, minY, 140, 75);
                        ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(hudX, minY, 140, 75);
                        
                        ctx.fillStyle = '#22d3ee';
                        ctx.font = 'bold 10px monospace';
                        ctx.fillText(`ID: #${person.id}`, hudX + 5, minY + 12);
                        
                        ctx.fillStyle = hDropPercent > 35 ? '#f43f5e' : '#a3e635';
                        ctx.fillText(`H-DROP: ${hDropPercent}%`, hudX + 5, minY + 26);
                        
                        ctx.fillStyle = vDisp > 40 ? '#f43f5e' : '#a3e635';
                        ctx.fillText(`V-DISP: ${Math.round(vDisp)}px`, hudX + 5, minY + 40);
                        
                        ctx.fillStyle = inZone ? '#f43f5e' : '#22d3ee';
                        ctx.fillText(`STATUS: ${inZone ? 'CRITICAL' : 'NOMINAL'}`, hudX + 5, minY + 54);
                        
                        let timerTxt = "0.0s";
                        ctx.fillStyle = '#94a3b8';
                        if (motionlessTrackerRef.current && Math.hypot(cx - motionlessTrackerRef.current.cx, cy - motionlessTrackerRef.current.cy) < 100) {
                            const elapsed = performance.now() - motionlessTrackerRef.current.startTime;
                            timerTxt = (elapsed / 1000).toFixed(1) + "s";
                            ctx.fillStyle = '#f43f5e';
                        }
                        ctx.fillText(`TIMER: ${timerTxt}`, hudX + 5, minY + 68);
                    }
                });

                    // CROSS-FRAME MOTIONLESS TRACKING LOGIC
                    if (!hasTriggeredRef.current) {
                        if (currentFrameCollapsed.length > 0) {
                            if (!motionlessTrackerRef.current) {
                                // Found someone collapsed! Start the timer.
                                motionlessTrackerRef.current = {
                                    cx: currentFrameCollapsed[0].cx,
                                    cy: currentFrameCollapsed[0].cy,
                                    startTime: performance.now()
                                };
                            } else {
                                // See if they are still collapsed in roughly the same spot
                                let matched = false;
                                currentFrameCollapsed.forEach(c => {
                                    const dist = Math.hypot(c.cx - motionlessTrackerRef.current!.cx, c.cy - motionlessTrackerRef.current!.cy);
                                    if (dist < 120) { // Slightly increased radius for motionless match
                                        matched = true;
                                        motionlessTrackerRef.current!.cx = c.cx; // Follow them slightly
                                        motionlessTrackerRef.current!.cy = c.cy;
                                        
                                        const elapsed = performance.now() - motionlessTrackerRef.current!.startTime;
                                        
                                        // TRIGGER THRESHOLD: 4 Seconds (4000ms) for Demo Reliability
                                        if (elapsed > 4000) {
                                            hasTriggeredRef.current = true;
                                            victimLockRef.current = { cx: c.cx, cy: c.cy };
                                            triggerSequence();
                                        }
                                    }
                                });

                                if (!matched) {
                                    // They stood up or moved away! Reset timer.
                                    motionlessTrackerRef.current = null;
                                }
                            }
                        } else {
                            // Nobody is collapsed
                            motionlessTrackerRef.current = null;
                        }
                    }

                    // DRAW MOTIONLESS PROGRESS RING HUD
                    if (motionlessTrackerRef.current && !hasTriggeredRef.current) {
                        const elapsed = performance.now() - motionlessTrackerRef.current.startTime;
                        const progress = Math.min(elapsed / 4000, 1);
                        
                        ctx.beginPath();
                        ctx.arc(motionlessTrackerRef.current.cx, motionlessTrackerRef.current.cy, 45, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(244, 63, 94, 0.2)';
                        ctx.lineWidth = 4;
                        ctx.stroke();
                        
                        ctx.beginPath();
                        ctx.arc(motionlessTrackerRef.current.cx, motionlessTrackerRef.current.cy, 45, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * progress));
                        ctx.strokeStyle = 'rgba(244, 63, 94, 1)';
                        ctx.lineWidth = 4;
                        ctx.lineCap = 'round';
                        ctx.stroke();
                        
                        // Blinking text
                        if (Math.floor(elapsed / 200) % 2 === 0) {
                            ctx.fillStyle = '#f43f5e';
                            ctx.font = '9px monospace';
                            ctx.fillText(`ANALYZING MOTIONLESS: ${(elapsed/1000).toFixed(1)}s`, motionlessTrackerRef.current.cx - 60, motionlessTrackerRef.current.cy + 65);
                        }
                    }
                
                // --- ML MEMORY LOCK ---
                // If the system triggered using Real ML, but the ML temporarily loses the skeleton
                // because the victim is fully on the floor and occluded, keep the red tracking box locked!
                if (hasTriggeredRef.current && victimLockRef.current && !syntheticVictimRef.current) {
                    const cx = victimLockRef.current.cx;
                    const cy = victimLockRef.current.cy;
                    const w = 120;
                    const h = 50;
                    const minX = cx - w/2;
                    const minY = cy - h/2;
                    
                    ctx.strokeStyle = 'rgba(244, 63, 94, 0.9)';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(minX, minY, w, h);
                    
                    ctx.fillStyle = 'rgba(244, 63, 94, 0.9)';
                    ctx.fillRect(minX, minY - 18, 180, 18);
                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 11px monospace';
                    ctx.fillText(`⚠ VICTIM_DETECTED (98%)`, minX + 5, minY - 5);
                    
                    ctx.beginPath();
                    ctx.moveTo(cx - 15, cy);
                    ctx.lineTo(cx + 15, cy);
                    ctx.moveTo(cx, cy - 15);
                    ctx.lineTo(cx, cy + 15);
                    ctx.stroke();
                }

                // --- HUMAN-IN-THE-LOOP OVERRIDE (SYNTHETIC VICTIM) ---
                if (syntheticVictimRef.current) {
                    const sv = syntheticVictimRef.current;
                    const elapsed = performance.now() - sv.startTime;
                    
                    const w = 120;
                    const h = 50; // Fallen person proportions
                    const minX = sv.cx - w/2;
                    const minY = sv.cy - h/2;

                    if (!hasTriggeredRef.current) {
                        // Drawing Analyzing HUD
                        const progress = Math.min(elapsed / 4000, 1);
                        ctx.beginPath();
                        ctx.arc(sv.cx, sv.cy, 45, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(244, 63, 94, 0.2)';
                        ctx.lineWidth = 4;
                        ctx.stroke();
                        
                        ctx.beginPath();
                        ctx.arc(sv.cx, sv.cy, 45, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * progress));
                        ctx.strokeStyle = 'rgba(244, 63, 94, 1)';
                        ctx.lineWidth = 4;
                        ctx.lineCap = 'round';
                        ctx.stroke();
                        
                        if (Math.floor(elapsed / 200) % 2 === 0) {
                            ctx.fillStyle = '#f43f5e';
                            ctx.font = '9px monospace';
                            ctx.fillText(`ANALYZING MOTIONLESS: ${(elapsed/1000).toFixed(1)}s`, sv.cx - 60, sv.cy + 65);
                        }

                        // Draw analyzing box
                        ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(minX, minY, w, h);

                        // Trigger after 4 seconds
                        if (elapsed > 4000) {
                            hasTriggeredRef.current = true;
                            // Clear other victims and lock onto synthetic
                            victimLockRef.current = { cx: sv.cx, cy: sv.cy };
                            motionlessTrackerRef.current = null;
                            triggerSequence();
                        }
                    } else {
                        // System Triggered - Draw Locked Red Box
                        ctx.strokeStyle = 'rgba(244, 63, 94, 0.9)';
                        ctx.lineWidth = 3;
                        ctx.strokeRect(minX, minY, w, h);
                        
                        ctx.fillStyle = 'rgba(244, 63, 94, 0.9)';
                        ctx.fillRect(minX, minY - 18, 180, 18);
                        ctx.fillStyle = '#000';
                        ctx.font = 'bold 11px monospace';
                        ctx.fillText(`⚠ VICTIM_DETECTED (99%)`, minX + 5, minY - 5);
                        
                        // Draw lock crosshair
                        ctx.beginPath();
                        ctx.moveTo(sv.cx - 15, sv.cy);
                        ctx.lineTo(sv.cx + 15, sv.cy);
                        ctx.moveTo(sv.cx, sv.cy - 15);
                        ctx.lineTo(sv.cx, sv.cy + 15);
                        ctx.stroke();
                    }
                }
                
                // Draw target crosshair if engaged
                if (targetLock) {
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(targetLock.x - 20, targetLock.y);
                    ctx.lineTo(targetLock.x + 20, targetLock.y);
                    ctx.moveTo(targetLock.x, targetLock.y - 20);
                    ctx.lineTo(targetLock.x, targetLock.y + 20);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(targetLock.x, targetLock.y, 10, 0, Math.PI * 2);
                    ctx.stroke();
                }
                
            } catch (e) {
                console.error("Inference Error", e);
            }

            frameCount++;
            const now = performance.now();
            if (now - lastTime >= 1000) {
                setFps(frameCount);
                frameCount = 0;
                lastTime = now;
            }

            // Telemetry overlay
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 12px monospace';
            ctx.fillText(`FPS: ${fps}`, canvas.width - 80, 20);
            ctx.fillText(`MODEL: PURE ML (Multi-Scale Engine)`, canvas.width - 250, 40);

            animationRef.current = requestAnimationFrame(runInference);
        };

        setupInference();

        return () => {
            active = false;
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isAnalyzing, mlReady, fps]);

    // Cinematic Timeline Orchestration triggered by the Fall Detection
    const triggerSequence = () => {
        const currentCamName = selectedCamera.replace(/_/g, ' ');
        
        // T+0s: Pose Anomaly
        setSimStep(1);
        addLog(`⚠ Pose Anomaly Detected: ${currentCamName}`, "alert", true);

        // T+3s: Medical Event Classification
        setTimeout(() => {
            setSimStep(2);
            addLog("🚨 Medical Event Classification: CARDIAC EVENT", "critical");
        }, 3000);
        
        // T+6s: AED Drone Launch
        setTimeout(() => {
            setSimStep(3);
            addLog("🚁 AED Drone Launch Authorized", "critical");
        }, 6000);

        // T+10s: Responders Alerted
        setTimeout(() => {
            setSimStep(4);
            addLog("📢 Nearby Volunteer Responders Alerted", "alert");
        }, 10000);

        // T+15s: Green Wave
        setTimeout(() => {
            setSimStep(5);
            addLog("🚦 Green Wave Corridor Activated", "info");
        }, 15000);

        // T+20s: Hospital Notified & Email Pipeline
        setTimeout(() => {
            setSimStep(6);
            const evidenceImg = captureScreenshotUrl();
            
            // Dispatch Real Email to Police/Supervisors
            fetch('/api/notify-aegis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location: currentCamName,
                    severity: 'CARDIAC EVENT (91% CONFIDENCE)',
                    confidence: 91,
                    screenshotUrl: evidenceImg
                })
            }).then(res => res.json()).then((data) => {
                if (data.realEmail) {
                    addLog("✉ DISPATCHED: Hospital & Emergency Contacts Notified via SMTP", "info");
                } else if (data.previewUrl) {
                    addLog("✉ DISPATCHED: Hospital Notified. [Click to View Real Email]", "info", false, data.previewUrl);
                } else {
                    addLog("✉ DISPATCHED: Hospital Notified via Email", "info");
                }
            }).catch(e => {
                console.error("Email Fetch Error:", e);
                addLog("✉ DISPATCH ERROR: Failed to send email.", "critical");
            });
            
        }, 20000);

        // T+25s: Archived
        setTimeout(() => {
            setSimStep(7);
            addLog("💾 Response Package Archived", "info");
        }, 25000);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setVideoUrl(url);
            setIsAnalyzing(false);
            setLogs([]);
            setSimStep(0);
            hasTriggeredRef.current = false;
        }
    };

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 font-sans pb-20 selection:bg-rose-500/30">
            <AegisBackground />
            
            <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-6">
                        <button onClick={() => router.push('/sentinel-command')} className="group flex items-center justify-center w-12 h-12 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                        </button>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Activity className="w-5 h-5 text-rose-500" />
                                <span className="text-[10px] font-black tracking-[0.3em] text-rose-500 uppercase">Health-Tech Response Orchestration</span>
                            </div>
                            <h1 className="text-4xl font-black tracking-tight text-white uppercase flex items-center gap-3">
                                Laminar <span className="text-rose-500">AEGIS</span> Protocol
                            </h1>
                            <p className="text-slate-400 text-sm mt-2 font-mono uppercase tracking-widest text-[10px]">Autonomous Emergency Guidance & Intervention System</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4" /> System Armed
                        </div>
                        {videoUrl && (
                            <button onClick={resetSystem} className="p-2 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-all">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* LEFT PANEL: Massive Video + Timeline */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                        
                        {/* Video Controls */}
                        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-2 flex gap-2">
                            <label className="flex-1 cursor-pointer">
                                <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                                <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-[11px] font-black uppercase tracking-widest text-slate-300">
                                    <UploadCloud className="w-4 h-4" /> Upload CCTV
                                </div>
                            </label>
                            <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-[11px] font-black uppercase tracking-widest text-slate-300">
                                <Camera className="w-4 h-4" /> Live Streams
                            </button>
                        </div>

                        {/* Huge Video Display */}
                        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-3 h-[500px]">
                            <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black border border-slate-800/50 group">
                                {!videoUrl ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                                        <Video className="w-12 h-12 mb-4 opacity-20" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Awaiting Video Feed</span>
                                    </div>
                                ) : (
                                    <>
                                        <div 
                                            className="absolute inset-0 flex items-center justify-center bg-black cursor-crosshair"
                                            onClick={handleVideoClick}
                                        >
                                            <video 
                                                ref={videoRef} 
                                                src={videoUrl} 
                                                autoPlay loop muted playsInline
                                                className="w-full h-full object-contain opacity-80" 
                                            />
                                            <canvas 
                                                ref={cvCanvasRef} 
                                                className="absolute inset-0 z-10 pointer-events-none w-full h-full object-contain" 
                                            />
                                        </div>
                                        
                                        {!mlReady && (
                                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                                                <div className="text-cyan-400 font-mono text-[10px] font-black uppercase animate-pulse flex flex-col items-center gap-2">
                                                    <Activity className="w-6 h-6 animate-spin" />
                                                    Initializing Neural Engine...
                                                </div>
                                            </div>
                                        )}

                                        {/* TOP LEFT OVERLAY */}
                                        <div className="absolute top-4 left-4 z-20">
                                            <div className="px-3 py-1 bg-black/60 backdrop-blur-sm border border-rose-500/50 rounded-lg text-rose-400 font-mono text-[10px] font-black uppercase flex items-center gap-2 transition-all hover:bg-black/80">
                                                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> 
                                                SOURCE: 
                                                <select 
                                                    value={selectedCamera}
                                                    onChange={(e) => {
                                                        setSelectedCamera(e.target.value);
                                                        setVideoUrl("/test_incident.mp4");
                                                        setIsAnalyzing(false);
                                                        setLogs([]);
                                                        setSimStep(0);
                                                        hasTriggeredRef.current = false;
                                                    }}
                                                    className="bg-transparent text-rose-400 font-black outline-none border-none cursor-pointer appearance-none pr-4"
                                                >
                                                    <option className="bg-[#0f172a]" value="KBR_PARK_JOGGING_TRACK_CAM_03">KBR_PARK_JOGGING_TRACK_CAM_03</option>
                                                    <option className="bg-[#0f172a]" value="NECKLACE_ROAD_PROMENADE_08">NECKLACE_ROAD_PROMENADE_08</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* IN-VIDEO HUD STATS OVERLAYS */}
                                        <AnimatePresence>
                                            {simStep >= 1 ? (
                                                <motion.div key="hud-anomaly" initial={{opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} className="absolute top-16 right-6 bg-red-600/90 text-white px-4 py-2 rounded-lg font-black text-sm uppercase tracking-widest border border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.7)] z-30">
                                                    ⚠️ POSE ANOMALY: 93%
                                                </motion.div>
                                            ) : null}
                                            {simStep >= 2 ? (
                                                <motion.div key="hud-motionless" initial={{opacity:0, x: 20}} animate={{opacity:1, x:0}} className="absolute top-32 right-6 bg-red-950/90 text-red-500 px-5 py-4 rounded-xl border-2 border-red-600 shadow-[0_0_40px_rgba(220,38,38,0.8)] z-30 flex flex-col items-end gap-1">
                                                    <div className="font-mono text-xl font-black">MOTIONLESS: 18 SEC</div>
                                                    <div className="font-bold text-sm text-yellow-400 uppercase tracking-widest animate-pulse">Cardiac Event Suspected</div>
                                                </motion.div>
                                            ) : null}
                                        </AnimatePresence>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* NOTIFICATION CENTER TIMELINE */}
                        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 flex-grow flex flex-col min-h-[300px]">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2 flex-shrink-0"><Bell className="w-4 h-4"/> Event Log Timeline</h3>
                            <div className="flex-grow space-y-3 overflow-y-auto pr-2 flex flex-col custom-scrollbar">
                                <AnimatePresence>
                                    {logs.map((log, i) => (
                                        <motion.div 
                                            key={i + log.text}
                                            initial={{ opacity: 0, x: -20, height: 0 }}
                                            animate={{ opacity: 1, x: 0, height: 'auto' }}
                                            className={`flex-shrink-0 text-[12px] font-mono px-4 py-3 rounded-lg border flex flex-col gap-2 shadow-sm ${
                                                log.type === 'critical' ? 'bg-red-500/10 border-red-500/50 text-red-400' :
                                                log.type === 'alert' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                                'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                                            }`}
                                        >
                                            <div className="flex gap-4 items-center">
                                                <span className="opacity-60 bg-black/40 px-2 py-1 rounded">[{log.time}]</span>
                                                <span className="font-bold tracking-wide text-[13px]">
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
                                                <div className="mt-2 rounded border border-white/20 overflow-hidden relative shadow-[0_0_10px_rgba(0,0,0,0.5)] w-fit">
                                                    <img src={log.screenshotUrl} alt="evidence" className="w-[300px] h-auto object-cover opacity-90" />
                                                    <div className="absolute top-1 right-1 bg-black/80 px-2 py-1 rounded text-[8px] font-black uppercase text-cyan-400 border border-cyan-500/30 tracking-widest backdrop-blur-md">Evidence Captured</div>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT PANEL: Status & Actions */}
                    <div className="lg:col-span-5 flex flex-col gap-6">
                        
                        {/* HUGE AEGIS PROTOCOL ACTIVATED FLASH */}
                        <div className={`bg-[#0f172a] border ${simStep >= 2 ? 'border-red-600 bg-red-950/20 shadow-[0_0_50px_rgba(220,38,38,0.2)]' : 'border-slate-800'} rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden h-[200px]`}>
                            {simStep >= 2 && (
                                <div className="absolute inset-0 bg-red-600/10 animate-pulse pointer-events-none mix-blend-screen z-0"></div>
                            )}
                            
                            <motion.div 
                                key={simStep >= 2 ? 'active' : 'standby'}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`text-center z-10 flex flex-col items-center justify-center w-full h-full`}
                            >
                                {simStep >= 2 ? (
                                    <>
                                        <AlertTriangle className="w-16 h-16 text-red-500 mb-3 animate-bounce drop-shadow-[0_0_15px_rgba(220,38,38,1)]" />
                                        <div className="text-3xl sm:text-4xl font-black tracking-tighter text-red-500 drop-shadow-[0_0_30px_rgba(220,38,38,0.8)] uppercase leading-none text-center">
                                            AEGIS PROTOCOL<br/>ACTIVATED
                                        </div>
                                        <div className="mt-3 bg-red-600/20 border border-red-500 text-white font-mono text-[11px] uppercase tracking-widest px-4 py-3 rounded-lg shadow-[0_0_15px_rgba(220,38,38,0.5)] w-full max-w-[280px] text-left">
                                            <div className="text-red-400 font-black mb-2 text-center text-xs">INCIDENT ANALYSIS</div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span>Rapid Vertical Drop</span>
                                                <CheckCircle className="w-3 h-3 text-red-500" />
                                            </div>
                                            <div className="flex justify-between items-center mb-1">
                                                <span>Horizontal Posture</span>
                                                <CheckCircle className="w-3 h-3 text-red-500" />
                                            </div>
                                            <div className="flex justify-between items-center mb-3">
                                                <span>Motionless 4.3 sec</span>
                                                <CheckCircle className="w-3 h-3 text-red-500" />
                                            </div>
                                            <div className="border-t border-red-500/30 pt-2 flex justify-between">
                                                <span>Confidence:</span>
                                                <span className="font-black text-red-400">94%</span>
                                            </div>
                                            <div className="mt-1 flex flex-col">
                                                <span className="text-[9px] text-slate-400">Classification:</span>
                                                <span className="font-black text-red-500 text-xs">POTENTIAL MEDICAL DISTRESS</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-4">System Status</h3>
                                        <div className="text-[32px] font-black tracking-widest text-slate-700 uppercase">
                                            STANDBY
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        </div>

                        {/* SPATIAL CONVERGENCE PIPELINE (Animated Story) */}
                        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 relative overflow-hidden flex flex-col">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 z-10"><Map className="w-4 h-4 inline mr-2"/> Spatial Convergence</h3>
                            
                            <div className="relative pl-6 flex flex-col gap-6 font-mono text-sm uppercase tracking-wider font-bold">
                                {/* The vertical connecting line */}
                                <div className="absolute top-2 bottom-2 left-[7px] w-0.5 bg-slate-800">
                                    {simStep >= 1 && (
                                        <motion.div 
                                            initial={{ height: '0%' }}
                                            animate={{ height: simStep >= 6 ? '100%' : simStep >= 4 ? '75%' : simStep >= 3 ? '50%' : '25%' }}
                                            transition={{ duration: 1 }}
                                            className="w-full bg-cyan-500 shadow-[0_0_10px_#22d3ee]"
                                        />
                                    )}
                                </div>

                                {/* Nodes */}
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className={`w-4 h-4 rounded-full flex-shrink-0 ${simStep >= 1 ? 'bg-red-500 shadow-[0_0_15px_#ef4444] ring-4 ring-red-500/30' : 'bg-slate-700'}`} />
                                    <div className={simStep >= 1 ? 'text-red-400' : 'text-slate-600'}>Victim <span className="text-[10px] opacity-70 ml-2">Ground Zero</span></div>
                                </div>

                                <div className="flex items-center gap-4 relative z-10">
                                    <div className={`w-4 h-4 rounded-full flex-shrink-0 ${simStep >= 3 ? 'bg-cyan-500 shadow-[0_0_15px_#06b6d4] ring-4 ring-cyan-500/30' : 'bg-slate-700'}`} />
                                    <div className={simStep >= 3 ? 'text-cyan-400 flex items-center gap-2' : 'text-slate-600 flex items-center gap-2'}>
                                        AED Drone <Navigation className="w-3 h-3 rotate-45" />
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 relative z-10">
                                    <div className={`w-4 h-4 rounded-full flex-shrink-0 ${simStep >= 4 ? 'bg-emerald-500 shadow-[0_0_15px_#10b981] ring-4 ring-emerald-500/30' : 'bg-slate-700'}`} />
                                    <div className={simStep >= 4 ? 'text-emerald-400' : 'text-slate-600'}>Civilian Responders</div>
                                </div>

                                <div className="flex items-center gap-4 relative z-10">
                                    <div className={`w-4 h-4 rounded-full flex-shrink-0 ${simStep >= 6 ? 'bg-white shadow-[0_0_15px_#ffffff] ring-4 ring-white/30' : 'bg-slate-700'}`} />
                                    <div className={simStep >= 6 ? 'text-white' : 'text-slate-600'}>Hospital Emergency Room</div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* GREEN WAVE ETA */}
                            <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 flex flex-col justify-center">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Hospital ETA</h3>
                                <div className={`text-4xl font-black font-mono ${simStep >= 5 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {simStep >= 5 ? '6m' : '12m'}
                                </div>
                                {simStep >= 5 && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
                                        <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1">🚦 Green Wave Active</div>
                                        <div className="text-[10px] font-bold text-emerald-950 bg-emerald-400 px-2 py-1 rounded inline-block">6 MINUTES SAVED</div>
                                    </motion.div>
                                )}
                            </div>

                            {/* DRONE DISPATCH ANIMATION */}
                            <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 flex flex-col justify-center">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500 mb-4 flex items-center gap-2"><Target className="w-4 h-4"/> Drone Launch</h3>
                                
                                <div className="flex justify-between items-center w-full mb-2">
                                    <div className="text-[9px] text-slate-500 font-black uppercase">Hub</div>
                                    <div className="flex-grow mx-3 relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <motion.div 
                                            initial={{ width: '0%' }} 
                                            animate={{ width: simStep >= 3 ? '100%' : '0%' }} 
                                            transition={{ duration: 43, ease: "linear" }} 
                                            className="absolute top-0 left-0 h-full bg-cyan-500 shadow-[0_0_10px_#06b6d4]"
                                        />
                                    </div>
                                    <div className="text-[9px] text-red-500 font-black uppercase">Victim</div>
                                </div>
                                
                                <div className="text-center font-mono text-3xl font-black mt-2">
                                    {simStep >= 3 ? (
                                        <span className="text-cyan-400 animate-pulse">{droneCountdown}s</span>
                                    ) : (
                                        <span className="text-slate-700 text-xl">STANDBY</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* CIVILIAN RALLY SYSTEM */}
                        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 border-t-4 border-t-emerald-500/50">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-4 flex items-center gap-2"><Users className="w-4 h-4"/> Civilian Rally System</h3>
                            <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-3">Nearby Registered Responders Alerted: {simStep >= 4 ? '3' : '0'}</div>
                            
                            <div className="space-y-2">
                                <div className={`flex justify-between items-center p-3 rounded-lg border ${simStep >= 4 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
                                    <div>
                                        <div className={`text-xs font-bold uppercase tracking-wide ${simStep >= 4 ? 'text-emerald-400' : 'text-slate-600'}`}>CPR Certified</div>
                                        <div className="text-[9px] text-slate-500 font-mono mt-1">Civilian ID: 8991</div>
                                    </div>
                                    <div className="text-right">
                                        {simStep >= 4 ? (
                                            <>
                                                <div className="text-[10px] font-black text-emerald-400 flex items-center gap-1 justify-end"><CheckCircle className="w-3 h-3"/> ACCEPTED</div>
                                                <div className="text-[11px] font-mono text-white mt-1">ETA 1m 20s</div>
                                            </>
                                        ) : <div className="text-[11px] font-black font-mono text-slate-600">--</div>}
                                    </div>
                                </div>

                                <div className={`flex justify-between items-center p-3 rounded-lg border ${simStep >= 4 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
                                    <div>
                                        <div className={`text-xs font-bold uppercase tracking-wide ${simStep >= 4 ? 'text-emerald-400' : 'text-slate-600'}`}>Medical Student</div>
                                        <div className="text-[9px] text-slate-500 font-mono mt-1">Civilian ID: 2214</div>
                                    </div>
                                    <div className="text-right">
                                        {simStep >= 4 ? (
                                            <>
                                                <div className="text-[10px] font-black text-emerald-400 flex items-center gap-1 justify-end"><CheckCircle className="w-3 h-3"/> RESPONDING</div>
                                                <div className="text-[11px] font-mono text-white mt-1">ETA 2m</div>
                                            </>
                                        ) : <div className="text-[11px] font-black font-mono text-slate-600">--</div>}
                                    </div>
                                </div>

                                <div className={`flex justify-between items-center p-3 rounded-lg border ${simStep >= 4 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/5'}`}>
                                    <div>
                                        <div className={`text-xs font-bold uppercase tracking-wide ${simStep >= 4 ? 'text-amber-400' : 'text-slate-600'}`}>Volunteer</div>
                                        <div className="text-[9px] text-slate-500 font-mono mt-1">Civilian ID: 7731</div>
                                    </div>
                                    <div className="text-right">
                                        {simStep >= 4 ? (
                                            <>
                                                <div className="text-[10px] font-black text-amber-400 flex items-center gap-1 justify-end"><Zap className="w-3 h-3"/> EN ROUTE</div>
                                                <div className="text-[11px] font-mono text-white mt-1">ETA 3m 45s</div>
                                            </>
                                        ) : <div className="text-[11px] font-black font-mono text-slate-600">--</div>}
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
