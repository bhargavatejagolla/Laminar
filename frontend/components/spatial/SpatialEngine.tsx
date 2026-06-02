"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Box, Sphere, Html, Ring } from "@react-three/drei";
import * as THREE from "three";
import { Play, Pause, FastForward, Rewind, ArrowLeft, Map, Activity, Clock, Users, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { toast } from "sonner";

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

    return (
        <div className="w-full h-screen bg-[#050508] relative overflow-hidden flex flex-col font-sans text-white">

            {/* ───── TOP BAR ───── */}
            <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/90 to-transparent z-10 flex justify-between items-start pt-6 px-10 pointer-events-none">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => router.back()} 
                        className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex justify-center items-center transition backdrop-blur-md pointer-events-auto cursor-pointer shadow-lg"
                        title="Go Back"
                    >
                        <ArrowLeft className="w-6 h-6 text-white/80" />
                    </button>
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex justify-center items-center backdrop-blur-md shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                        <Map className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-md">
                            4D SPATIAL PLAYBACK ENGINE
                        </h1>
                        <p className="text-indigo-400/90 text-[10px] font-mono tracking-[0.25em] font-bold mt-1 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,1)] animate-pulse" /> 
                            {isPrediction ? "PREDICTIVE AI SYNTHESIS ACTIVE" : "NEURAL RADIANCE SYNTHESIS ACTIVE"}
                        </p>
                    </div>
                </div>

                {/* Intelligent Stats Panel */}
                <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center p-1 shadow-2xl pointer-events-auto">
                    <div className="flex items-center gap-6 px-5 py-2">
                        <div className="text-right">
                            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5 flex items-center justify-end gap-1"><Users className="w-3 h-3"/> Live Population</p>
                            <p className="text-lg font-bold tracking-wider text-white">842</p>
                        </div>
                        <div className="w-[1px] h-10 bg-white/10" />
                        <div className="text-right">
                            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5 flex items-center justify-end gap-1"><Video className="w-3 h-3"/> Active Cameras</p>
                            <p className="text-lg font-bold tracking-wider text-white">24</p>
                        </div>
                        <div className="w-[1px] h-10 bg-white/10" />
                        <div className="text-right">
                            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5 flex items-center justify-end gap-1"><Activity className="w-3 h-3"/> Historical Samples</p>
                            <p className="text-lg font-bold tracking-wider text-white">128,421</p>
                        </div>
                        <div className="w-[1px] h-10 bg-white/10" />
                        <div className="text-right bg-indigo-900/30 px-3 py-1.5 rounded-xl border border-indigo-500/20">
                            <p className="text-[9px] uppercase tracking-widest text-indigo-300 mb-0.5 flex items-center justify-end gap-1"><Clock className="w-3 h-3"/> Prediction Horizon</p>
                            <p className="text-lg font-bold tracking-wider text-indigo-400">+15 min</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ───── 3D CANVAS PORTAL ───── */}
            <div className="flex-1 w-full h-full cursor-move">
                {loading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center relative">
                        <div className="w-32 h-32 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <p className="absolute text-indigo-400 font-mono text-xs font-bold tracking-[0.2em] uppercase mt-40">Compiling Intelligence Matrix...</p>
                    </div>
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
                                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> FUTURE PROJECTION
                            </span>
                        ) : currentFrame < CURRENT_MARK_MINS * 60 - 30 ? (
                            <span className="text-sm font-bold text-slate-300 tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-400" /> HISTORICAL REPLAY
                            </span>
                        ) : (
                            <span className="text-sm font-bold text-emerald-400 tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> CURRENT REALITY
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
