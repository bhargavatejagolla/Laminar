"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Box, Sphere, Html, Ring } from "@react-three/drei";
import * as THREE from "three";
import { Play, Pause, FastForward, Rewind, ArrowLeft, Map, Activity, Clock, Users, Video, Database } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { toast } from "sonner";
import Loading from "@/app/loading";
import { motion, AnimatePresence } from "framer-motion";

interface Tracklet {
    time: number;
    x: number;
    y: number;
    z: number;
    sensor: string;
}

interface SpatialEntity {
    id: string;
    type: string;
    color: string;
    tracklets: Tracklet[];
    baseCamera: string;
}

interface SpatialData {
    venue_id: string;
    duration_minutes: number;
    resolution_fps: number;
    entities: SpatialEntity[];
}

const CAMERAS = [
    { id: "cam_gate_a", name: "Gate A", pos: [20, 0, -15] },
    { id: "cam_food_court", name: "Food Court", pos: [-25, 0, 10] },
    { id: "cam_main_hall", name: "Main Hall", pos: [0, 0, 30] },
    { id: "cam_exit_west", name: "Exit West", pos: [-35, 0, -20] },
];

// Time configurations
// Base time: 18:00
const START_TIME = new Date();
START_TIME.setHours(18, 0, 0, 0);

// Timeline spans 75 mins total (from 18:00 to 19:15)
// Current time is 19:00
// Prediction is up to 19:15
const TOTAL_DURATION_MINS = 75;
const CURRENT_MARK_MINS = 60; // 19:00
const MAX_FRAMES = TOTAL_DURATION_MINS * 60; // 4500 seconds

const DENSITY_COLORS = {
    LOW: "#3b82f6", // Blue
    MEDIUM: "#eab308", // Yellow
    HIGH: "#ef4444", // Red
    CRITICAL: "#a855f7" // Purple
};

function getDensityColor(cameraName: string, timeSec: number) {
    if (cameraName === "Gate A") {
        // Incident at Gate A from 18:40 to 19:00 (2400s to 3600s)
        if (timeSec > 2400 && timeSec < 3800) return DENSITY_COLORS.CRITICAL;
        if (timeSec > 2100) return DENSITY_COLORS.HIGH;
    }
    
    if (cameraName === "Food Court") {
        if (timeSec > 1800 && timeSec < 3000) return DENSITY_COLORS.HIGH;
    }

    if (timeSec > CURRENT_MARK_MINS * 60) return DENSITY_COLORS.MEDIUM; // Prediction
    
    return DENSITY_COLORS.LOW;
}

// -------------------------------------------------------------
// Helper Component: Entity Node
// -------------------------------------------------------------
function EntityNode({ entity, currentFrame }: { entity: SpatialEntity, currentFrame: number }) {
    const pos = useMemo(() => {
        if (entity.tracklets.length === 0) return null;
        if (currentFrame < entity.tracklets[0].time || currentFrame > entity.tracklets[entity.tracklets.length - 1].time) return null;

        let start = entity.tracklets[0];
        let end = entity.tracklets[entity.tracklets.length - 1];

        for (let i = 0; i < entity.tracklets.length - 1; i++) {
            if (currentFrame >= entity.tracklets[i].time && currentFrame <= entity.tracklets[i + 1].time) {
                start = entity.tracklets[i];
                end = entity.tracklets[i + 1];
                break;
            }
        }

        if (start.time === end.time) return new THREE.Vector3(start.x, start.y, start.z);

        const alpha = (currentFrame - start.time) / (end.time - start.time);
        return new THREE.Vector3(
            start.x + (end.x - start.x) * alpha,
            start.y,
            start.z + (end.z - start.z) * alpha,
        );
    }, [entity, currentFrame]);

    // Check if it's in the predicted future
    const isPrediction = currentFrame > CURRENT_MARK_MINS * 60;
    
    // Dynamic coloring based on time and location
    const color = getDensityColor(entity.baseCamera, currentFrame);

    if (!pos) return null;

    return (
        <group position={pos}>
            <Box args={[0.5, 1.6, 0.5]} position={[0, 0.8, 0]}>
                <meshBasicMaterial 
                    color={color} 
                    opacity={isPrediction ? 0.2 : 0.6} 
                    transparent 
                    wireframe={isPrediction} 
                />
            </Box>
            <Sphere args={[0.2, 16, 16]} position={[0, 1.8, 0]}>
                <meshStandardMaterial 
                    color={color} 
                    emissive={color} 
                    emissiveIntensity={isPrediction ? 0.5 : 2} 
                    toneMapped={false} 
                    transparent 
                    opacity={isPrediction ? 0.4 : 1} 
                />
            </Sphere>
        </group>
    );
}

function CameraZones({ currentFrame }: { currentFrame: number }) {
    return (
        <group>
            {CAMERAS.map((cam) => {
                const color = getDensityColor(cam.name, currentFrame);
                const isPrediction = currentFrame > CURRENT_MARK_MINS * 60;
                return (
                    <group key={cam.id} position={new THREE.Vector3(...cam.pos)}>
                        {/* Zone Ring */}
                        <Ring args={[4.5, 5, 32]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                            <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
                        </Ring>
                        <Ring args={[4.9, 5, 32]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                            <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
                        </Ring>
                        
                        {/* Camera Marker */}
                        <Box args={[0.6, 0.6, 0.6]} position={[0, 4, 0]}>
                            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
                        </Box>
                        <Line points={[new THREE.Vector3(0,0,0), new THREE.Vector3(0,4,0)]} color={color} opacity={0.3} transparent />
                        
                        <Html center position={[0, 5, 0]}>
                            <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-lg px-2 py-1 flex flex-col items-center">
                                <span className="text-[10px] font-bold text-white whitespace-nowrap">{cam.name}</span>
                                {color === DENSITY_COLORS.CRITICAL && (
                                    <span className="text-[8px] font-mono text-purple-400 font-bold uppercase animate-pulse">Critical Density</span>
                                )}
                                {isPrediction && (
                                    <span className="text-[8px] font-mono text-yellow-400 font-bold uppercase">PREDICTED</span>
                                )}
                            </div>
                        </Html>
                    </group>
                );
            })}
        </group>
    );
}

// -------------------------------------------------------------
// Main Component
// -------------------------------------------------------------
export default function SpatialEngine() {
    const router = useRouter();
    const { venue } = useActiveVenue();
    const [spatialData, setSpatialData] = useState<SpatialData | null>(null);
    const [loading, setLoading] = useState(true);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(CURRENT_MARK_MINS * 60); // Start at current time

    const formatRealTime = (secondsElapsed: number) => {
        const d = new Date(START_TIME.getTime() + secondsElapsed * 1000);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        // We ensure a robust demo by providing mock data if the API fails
        const mockFallback = () => {
            const mockEntities: SpatialEntity[] = [];
            let entityIdCounter = 1000;
            
            // Distribute 75+ entities across cameras
            CAMERAS.forEach(cam => {
                const count = cam.name === "Gate A" ? 35 : 15; // Gate A has incident

                for(let i=0; i<count; i++) {
                    const tracklets: Tracklet[] = [];
                    // Start position near camera
                    let x = cam.pos[0] + (Math.random() - 0.5) * 15;
                    let z = cam.pos[2] + (Math.random() - 0.5) * 15;
                    
                    // Generate full timeline of movement
                    for(let time=0; time<=MAX_FRAMES; time+=15) {
                        // If Gate A and time is around 18:45, compress them to simulate crowd crush
                        if (cam.name === "Gate A" && time > 2400 && time < 3600) {
                            x += (cam.pos[0] - x) * 0.05 + (Math.random() - 0.5);
                            z += (cam.pos[2] - z) * 0.05 + (Math.random() - 0.5);
                        } else {
                            // Normal wandering
                            x += (Math.random() - 0.5) * 2;
                            z += (Math.random() - 0.5) * 2;
                        }

                        tracklets.push({
                            time,
                            x,
                            y: 0,
                            z,
                            sensor: "optical_camera"
                        });
                    }
                    mockEntities.push({
                        id: `AGENT-${entityIdCounter++}`,
                        type: "person",
                        color: "#fff", // overridden by density
                        tracklets,
                        baseCamera: cam.name
                    });
                }
            });
            
            setSpatialData({
                venue_id: venue?.id || "demo-venue",
                duration_minutes: TOTAL_DURATION_MINS,
                resolution_fps: 1,
                entities: mockEntities
            });
            setLoading(false);
            // Don't auto-play immediately, let user see the "Current" state
            // setIsPlaying(true); 
            toast.success("Spatial Matrix Initialized with Intelligence Sync");
        };

        if (!venue) {
            setTimeout(mockFallback, 800);
            return;
        }

        api.get(`/spatial/scene/${venue.id}?minutes=${TOTAL_DURATION_MINS}`)
            .then(res => {
                setSpatialData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.warn("API failed, using simulated matrix data.");
                mockFallback();
            });
    }, [venue]);

    useEffect(() => {
        if (!isPlaying) return;
        let lastTime = performance.now();

        const animateId = requestAnimationFrame(function loop(time) {
            if (!isPlaying) return;
            const delta = (time - lastTime) / 1000;
            lastTime = time;

            const speedMultiplier = 45; // 1 second real time = 45 seconds playback

            setCurrentFrame(prev => {
                let next = prev + (delta * speedMultiplier);
                if (next >= MAX_FRAMES) {
                    setIsPlaying(false); // Pause at end
                    return MAX_FRAMES;
                }
                return next;
            });

            requestAnimationFrame(loop);
        });

        return () => cancelAnimationFrame(animateId);
    }, [isPlaying]);

    const togglePlay = () => {
        if (currentFrame >= MAX_FRAMES) setCurrentFrame(0);
        setIsPlaying(!isPlaying);
    };

    const isPrediction = currentFrame > CURRENT_MARK_MINS * 60;
    const isHistorical = currentFrame < CURRENT_MARK_MINS * 60 - 30;

    const setMode = (mode: 'historical' | 'live' | 'future') => {
        if (mode === 'historical') setCurrentFrame(45 * 60); // 18:45
        if (mode === 'live') setCurrentFrame(CURRENT_MARK_MINS * 60); // 19:00
        if (mode === 'future') setCurrentFrame(MAX_FRAMES); // 19:15
    };

    return (
        <div className="w-full h-screen bg-[#050508] relative overflow-hidden flex flex-col font-sans text-white">

            {/* ───── TOP BAR ───── */}
            <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/90 to-transparent z-10 flex justify-between items-start pt-6 px-10 pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    <button 
                        onClick={() => router.back()} 
                        className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex justify-center items-center transition backdrop-blur-md cursor-pointer shadow-lg group"
                        title="Go Back"
                    >
                        <ArrowLeft className="w-6 h-6 text-white/80 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex justify-center items-center backdrop-blur-md shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                        <Map className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-md">
                            4D SPATIAL <span className="text-indigo-400">PLAYBACK ENGINE</span>
                        </h1>
                        <p className="text-indigo-400/90 text-[10px] font-mono tracking-[0.25em] font-bold mt-1 flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isPrediction ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,1)]' : 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,1)]'} animate-pulse`} /> 
                            {isPrediction ? "PREDICTIVE FUTURE SIMULATION" : isHistorical ? "HISTORICAL REPLAY MODE" : "LIVE REALITY SYNTHESIS"}
                        </p>
                    </div>
                </div>

                {/* Mode Toggles */}
                <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center p-1 shadow-2xl pointer-events-auto">
                    <button onClick={() => setMode('historical')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all ${isHistorical ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
                        ◉ Historical Replay
                    </button>
                    <button onClick={() => setMode('live')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all ${!isHistorical && !isPrediction ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
                        ◉ Live Reality
                    </button>
                    <button onClick={() => setMode('future')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all ${isPrediction ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
                        ◉ Future Simulation
                    </button>
                </div>
            </div>

            {/* ───── DYNAMIC SIDE PANELS ───── */}
            <div className="absolute top-32 left-10 w-80 z-10 pointer-events-none">
                <AnimatePresence mode="wait">
                    {/* Prediction Factors Panel */}
                    {isPrediction && (
                        <motion.div 
                            key="future"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20, transition: { duration: 0.1 } }}
                            className="bg-black/60 backdrop-blur-2xl border border-purple-500/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(168,85,247,0.1)] relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(168,85,247,0.15)_0%,transparent_70%)]"></div>
                            <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-purple-400 mb-5 flex items-center gap-2 relative z-10">
                                <Activity className="w-3 h-3" /> Prediction Factors
                            </h3>
                            <div className="space-y-4 font-mono text-xs font-bold text-slate-300 relative z-10">
                                <div className="flex items-center gap-3"><span className="text-rose-400 font-black text-sm">↑</span> Food Court inflow surge</div>
                                <div className="flex items-center gap-3"><span className="text-rose-400 font-black text-sm">↑</span> Exit West severe congestion</div>
                                <div className="flex items-center gap-3"><span className="text-amber-400 font-black text-sm">↑</span> Historical Saturday pattern match</div>
                                <div className="flex items-center gap-3"><span className="text-purple-400 font-black text-sm">↑</span> Event ending in 12 min</div>
                            </div>
                            <div className="mt-6 pt-5 border-t border-purple-500/20 relative z-10">
                                <div className="text-[9px] uppercase tracking-widest text-purple-400/60 mb-1">AI Confidence</div>
                                <div className="text-2xl font-black text-white flex items-baseline gap-2">
                                    94.2% <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest animate-pulse">High Conviction</span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Historical Cross-System Timeline */}
                    {isHistorical && (
                        <motion.div 
                            key="history"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20, transition: { duration: 0.1 } }}
                            className="bg-black/60 backdrop-blur-2xl border border-indigo-500/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(99,102,241,0.1)] relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20"></div>
                            <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-indigo-400 mb-5 flex items-center gap-2 relative z-10">
                                <Database className="w-3 h-3" /> Cross-System Timeline
                            </h3>
                            <div className="space-y-5 font-mono text-xs font-bold text-slate-300 relative z-10 before:absolute before:inset-0 before:ml-[11px] before:w-[2px] before:bg-gradient-to-b before:from-indigo-500 before:via-emerald-500 before:to-amber-500">
                                <div className="relative pl-8">
                                    <div className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-[#050508] border-2 border-indigo-500 -translate-x-1/2"></div>
                                    <div className="text-indigo-400 mb-1 font-black">18:52</div>
                                    <div className="text-[10px] leading-relaxed">Spatial Engine predicts surge.</div>
                                </div>
                                <div className="relative pl-8">
                                    <div className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-[#050508] border-2 border-rose-500 -translate-x-1/2"></div>
                                    <div className="text-rose-400 mb-1 font-black">18:54</div>
                                    <div className="text-[10px] leading-relaxed">Kinetic SOS alerted.</div>
                                </div>
                                <div className="relative pl-8">
                                    <div className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-[#050508] border-2 border-emerald-500 -translate-x-1/2 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                    <div className="text-emerald-400 mb-1 font-black">18:55</div>
                                    <div className="text-[10px] leading-relaxed">Guardian Route rerouted civilians.</div>
                                </div>
                                <div className="relative pl-8">
                                    <div className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-[#050508] border-2 border-emerald-500 -translate-x-1/2"></div>
                                    <div className="text-emerald-400 mb-1 font-black">18:56</div>
                                    <div className="text-[10px] leading-relaxed">Green Wave prepared emergency access.</div>
                                </div>
                                <div className="relative pl-8">
                                    <div className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-[#050508] border-2 border-amber-500 -translate-x-1/2"></div>
                                    <div className="text-amber-400 mb-1 font-black">18:57</div>
                                    <div className="text-[10px] leading-relaxed">Liability Engine started evidence capture.</div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Live Telemetry Panel */}
                    {!isPrediction && !isHistorical && (
                        <motion.div 
                            key="live"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20, transition: { duration: 0.1 } }}
                            className="bg-black/60 backdrop-blur-2xl border border-emerald-500/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(16,185,129,0.1)] relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.1)_0%,transparent_70%)]"></div>
                            <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-400 mb-5 flex items-center gap-2 relative z-10">
                                <Video className="w-3 h-3" /> Live Telemetry
                            </h3>
                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                <div className="bg-white/5 border border-white/5 p-3 rounded-xl">
                                    <div className="text-[8px] uppercase tracking-widest text-slate-400 mb-1">Live Pop</div>
                                    <div className="text-2xl font-black text-white font-mono">842</div>
                                </div>
                                <div className="bg-white/5 border border-white/5 p-3 rounded-xl">
                                    <div className="text-[8px] uppercase tracking-widest text-slate-400 mb-1">Active Cams</div>
                                    <div className="text-2xl font-black text-white font-mono">24</div>
                                </div>
                            </div>
                            <div className="mt-5 space-y-4 pt-5 border-t border-white/10 relative z-10">
                                <div>
                                    <div className="flex justify-between items-center text-[10px] font-mono font-bold mb-1.5">
                                        <span className="text-slate-400 uppercase tracking-widest">Main Hall Density</span>
                                        <span className="text-rose-400">HIGH</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-rose-500 w-[85%]"></div></div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center text-[10px] font-mono font-bold mb-1.5">
                                        <span className="text-slate-400 uppercase tracking-widest">Food Court Density</span>
                                        <span className="text-amber-400">MEDIUM</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-amber-500 w-[55%]"></div></div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center text-[10px] font-mono font-bold mb-1.5">
                                        <span className="text-slate-400 uppercase tracking-widest">Exit West Capacity</span>
                                        <span className="text-emerald-400">68%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 w-[68%]"></div></div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="absolute top-32 right-10 w-72 z-10 pointer-events-none">
                <AnimatePresence>
                    {isPrediction && (
                        <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="bg-purple-950/40 backdrop-blur-2xl border border-purple-500/40 rounded-3xl p-6 shadow-[0_0_40px_rgba(168,85,247,0.15)] relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.15)_0%,transparent_70%)]"></div>
                            <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-purple-400 mb-5 flex items-center gap-2 relative z-10">
                                <Clock className="w-3 h-3" /> Forecast Horizon
                            </h3>
                            <div className="space-y-5 font-mono text-xs relative z-10">
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-purple-300 font-black mb-2 flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-purple-400"></span> +5 min
                                    </div>
                                    <div className="flex justify-between items-center text-slate-300 bg-black/40 p-2 rounded-lg border border-purple-500/20">
                                        <span>Main Hall Density:</span>
                                        <span className="text-amber-400 font-bold">74%</span>
                                    </div>
                                </div>
                                <div className="pt-1">
                                    <div className="text-[10px] uppercase tracking-widest text-purple-300 font-black mb-2 flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-purple-400"></span> +10 min
                                    </div>
                                    <div className="flex justify-between items-center text-slate-300 bg-black/40 p-2 rounded-lg border border-purple-500/20">
                                        <span>Main Hall Density:</span>
                                        <span className="text-rose-400 font-bold">88%</span>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <div className="text-[10px] uppercase tracking-widest text-rose-400 font-black mb-2 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span> +15 min
                                    </div>
                                    <div className="p-3 bg-gradient-to-r from-rose-500/20 to-rose-600/10 border border-rose-500/40 rounded-xl text-rose-400 font-black text-center uppercase tracking-[0.15em] shadow-[inset_0_0_20px_rgba(244,63,94,0.1)]">
                                        Critical Surge Expected
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ───── 3D CANVAS PORTAL ───── */}
            <div className="flex-1 w-full h-full cursor-move">
                {loading ? (
                    <Loading />
                ) : (
                    <Canvas camera={{ position: [0, 45, 50], fov: 45 }}>
                        <color attach="background" args={["#050508"]} />

                        <ambientLight intensity={0.3} />
                        <directionalLight position={[10, 20, 10]} intensity={1.5} />

                        {/* Simulated ground plane grid mapping camera views */}
                        <Grid
                            infiniteGrid
                            fadeDistance={150}
                            cellColor={isPrediction ? "#4c1d95" : "#312e81"}
                            sectionColor={isPrediction ? "#7c3aed" : "#4f46e5"}
                            sectionSize={10}
                            cellSize={2}
                        />

                        <OrbitControls
                            makeDefault
                            minPolarAngle={0}
                            maxPolarAngle={Math.PI / 2 - 0.05}
                            maxDistance={200}
                        />

                        <CameraZones currentFrame={currentFrame} />

                        {spatialData?.entities.map(entity => (
                            <EntityNode key={entity.id} entity={entity} currentFrame={currentFrame} />
                        ))}

                    </Canvas>
                )}
            </div>

            {/* ───── TEMPORAL SCRUBBER HUD ───── */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-5xl bg-black/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setCurrentFrame(Math.max(0, currentFrame - 60))} className="p-2 hover:bg-white/10 rounded-full transition pointer-events-auto">
                            <Rewind className="w-5 h-5 text-slate-300" />
                        </button>
                        <button onClick={togglePlay} className={`p-4 rounded-full text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] transition hover:scale-105 pointer-events-auto ${isPrediction ? 'bg-purple-600 hover:bg-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.4)]' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
                            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                        </button>
                        <button onClick={() => setCurrentFrame(Math.min(MAX_FRAMES, currentFrame + 60))} className="p-2 hover:bg-white/10 rounded-full transition pointer-events-auto">
                            <FastForward className="w-5 h-5 text-slate-300" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 bg-black/50 border border-white/10 px-6 py-2 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Status</span>
                        {isPrediction ? (
                            <span className="text-sm font-bold text-yellow-400 tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> FUTURE SIMULATION
                            </span>
                        ) : isHistorical ? (
                            <span className="text-sm font-bold text-slate-300 tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-400" /> HISTORICAL REPLAY
                            </span>
                        ) : (
                            <span className="text-sm font-bold text-emerald-400 tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> LIVE REALITY
                            </span>
                        )}
                    </div>

                    <div className={`flex items-center gap-4 px-6 py-2 rounded-xl border ${isPrediction ? 'bg-purple-950/30 border-purple-500/30' : 'bg-indigo-950/30 border-indigo-500/30'}`}>
                        <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${isPrediction ? 'text-purple-400' : 'text-indigo-400'}`}>Timeline</span>
                        <span className="text-2xl font-mono font-black text-white w-24 text-center tabular-nums">
                            {formatRealTime(currentFrame)}
                        </span>
                    </div>
                </div>

                <div className="w-full relative h-10 pointer-events-auto cursor-pointer group">
                    
                    {/* Time markers (18:00, 18:15, etc) */}
                    <div className="absolute top-0 left-0 w-full flex justify-between px-2 -translate-y-4 text-[10px] font-mono text-slate-400 font-bold pointer-events-none z-20">
                        <span>18:00</span>
                        <span>18:15</span>
                        <span>18:30</span>
                        <span className="text-red-400">18:45 (Incident)</span>
                        <span className="text-emerald-400">19:00 (Live)</span>
                        <span className="text-yellow-400">Predicted 19:15</span>
                    </div>

                    {/* Timeline background with historical / prediction zones */}
                    <div className="absolute inset-x-0 top-3 h-4 bg-white/5 rounded-full overflow-hidden flex">
                        <div className="h-full bg-slate-800" style={{ width: '80%' }} /> {/* Past to Current */}
                        <div className="h-full bg-purple-900/40 border-l border-purple-500/50" style={{ width: '20%' }} /> {/* Prediction */}
                    </div>

                    {/* Timeline progress fill */}
                    <div
                        className={`absolute top-3 left-0 h-4 rounded-l-full transition-all pointer-events-none ${isPrediction ? 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-500' : 'bg-gradient-to-r from-indigo-800 to-indigo-500'}`}
                        style={{ width: `${(currentFrame / MAX_FRAMES) * 100}%` }}
                    />
                    
                    {/* The Playhead Marker */}
                    <div 
                        className={`absolute top-1.5 w-7 h-7 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all pointer-events-none border-2 border-white ${isPrediction ? 'bg-purple-500' : 'bg-indigo-500'}`}
                        style={{ left: `calc(${(currentFrame / MAX_FRAMES) * 100}% - 14px)` }}
                    ></div>

                    {/* Dragger input */}
                    <input
                        type="range"
                        min="0"
                        max={MAX_FRAMES}
                        value={currentFrame}
                        onChange={(e) => setCurrentFrame(parseFloat(e.target.value))}
                        className="w-full h-full opacity-0 cursor-ew-resize absolute inset-0 z-10"
                    />
                </div>
            </div>

        </div>
    );
}
