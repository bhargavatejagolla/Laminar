"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Box, Sphere, Html } from "@react-three/drei";
import * as THREE from "three";
import { Play, Pause, FastForward, Rewind, Maximize, Activity, Map, Video } from "lucide-react";
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
}

interface SpatialData {
    venue_id: string;
    duration_minutes: number;
    resolution_fps: number;
    entities: SpatialEntity[];
}

// -------------------------------------------------------------
// Helper Component: Entity Node
// Renders an individual moving target in 3D space, smoothly interpolated.
// -------------------------------------------------------------
function EntityNode({ entity, currentFrame }: { entity: SpatialEntity, currentFrame: number }) {
    const meshRef = useRef<THREE.Mesh>(null);

    // Find the closest specific tracklet time, or interpolate
    const pos = useMemo(() => {
        // If it doesn't exist during this frame, return null
        if (entity.tracklets.length === 0) return null;
        if (currentFrame < entity.tracklets[0].time || currentFrame > entity.tracklets[entity.tracklets.length - 1].time) return null;

        // Linear Search for segment
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

        // Interpolation factor
        const alpha = (currentFrame - start.time) / (end.time - start.time);

        return new THREE.Vector3(
            start.x + (end.x - start.x) * alpha,
            start.y,
            start.z + (end.z - start.z) * alpha,
        );
    }, [entity, currentFrame]);

    // Determine current active sensor for this frame
    const currentSensor = useMemo(() => {
        if (entity.tracklets.length === 0) return 'optical_camera';
        const active = entity.tracklets.filter(t => t.time <= currentFrame);
        if (!active.length) return 'optical_camera';
        return active[active.length - 1].sensor;
    }, [entity, currentFrame]);

    const isIoT = currentSensor !== 'optical_camera';

    if (!pos) return null;

    return (
        <group position={pos}>
            {/* Height-bounding box proxy */}
            {entity.type === "person" ? (
                <Box args={[0.6, 1.8, 0.6]} position={[0, -0.1, 0]}>
                    <meshBasicMaterial color={entity.color} opacity={isIoT ? 0.05 : 0.3} transparent wireframe={!isIoT} />
                </Box>
            ) : (
                <Box args={[2.5, 1.5, 4.5]} position={[0, -0.75, 0]}>
                    <meshBasicMaterial color={entity.color} opacity={isIoT ? 0.05 : 0.3} transparent />
                </Box>
            )}

            <Sphere args={[0.2, 16, 16]}>
                <meshStandardMaterial color={isIoT ? '#ffffff' : entity.color} emissive={entity.color} emissiveIntensity={isIoT ? 0.5 : 2} toneMapped={false} transparent opacity={isIoT ? 0.4 : 1} />
            </Sphere>

            <Html position={[0, entity.type === "person" ? 1.2 : 2.0, 0]} center>
                <div className={`backdrop-blur-md px-2 py-0.5 rounded border text-[8px] font-mono whitespace-nowrap transition-all ${isIoT ? 'bg-cyan-900/40 border-cyan-500/30 text-cyan-300' : 'bg-black/80 border-white/20'}`} style={{ color: !isIoT ? entity.color : undefined }}>
                    {entity.id} {isIoT && " [IoT SHADOW]"}
                </div>
            </Html>
        </group>
    );
}

function EntityPath({ entity, currentFrame }: { entity: SpatialEntity, currentFrame: number }) {
    // Is the latest segment IoT tracked?
    const isShadowTracked = useMemo(() => {
        const active = entity.tracklets.filter(t => t.time <= currentFrame);
        if (!active.length) return false;
        return active[active.length - 1].sensor !== 'optical_camera';
    }, [entity, currentFrame]);

    const points = useMemo(() => {
        const activeTrace = entity.tracklets.filter(t => t.time <= currentFrame);
        if (activeTrace.length < 2) return null;
        return activeTrace.map(t => new THREE.Vector3(t.x, 0, t.z));
    }, [entity, currentFrame]);

    if (!points) return null;

    return (
        <Line
            points={points}
            color={isShadowTracked ? '#22d3ee' : entity.color}
            lineWidth={isShadowTracked ? 1 : 1.5}
            opacity={isShadowTracked ? 0.3 : 0.6}
            transparent
        />
    );
}

// -------------------------------------------------------------
// IoT Beacon Nodes
// -------------------------------------------------------------
function IoTBeacons() {
    // Scattered physical IoT sensor geometries around the venue
    const nodes = [
        { id: "BLE-A", pos: [15, 2, -10] },
        { id: "BLE-B", pos: [-20, 2, 15] },
        { id: "WIFI-C", pos: [5, 4, 30] },
        { id: "WIFI-D", pos: [-35, 4, -25] }
    ];

    return (
        <group>
            {nodes.map(n => (
                <group key={n.id} position={new THREE.Vector3(...n.pos)}>
                    <mesh>
                        <octahedronGeometry args={[1, 0]} />
                        <meshStandardMaterial color="#0e7490" emissive="#06b6d4" emissiveIntensity={1.5} wireframe />
                    </mesh>
                    <Html center position={[0, -1.5, 0]}>
                        <div className="bg-cyan-950/80 border border-cyan-500/50 rounded px-1.5 py-0.5 text-[6px] font-mono text-cyan-300 whitespace-nowrap">
                            {n.id} [IoT NODE]
                        </div>
                    </Html>
                </group>
            ))}
        </group>
    );
}

// -------------------------------------------------------------
// Main Component
// -------------------------------------------------------------
export default function SpatialEngine() {
    const { venue } = useActiveVenue();
    const [spatialData, setSpatialData] = useState<SpatialData | null>(null);
    const [loading, setLoading] = useState(true);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const maxFrames = spatialData ? spatialData.duration_minutes * 60 : 900;

    // Format MM:SS function
    const formatTimeInfo = (frame: number) => {
        const totalSec = frame;
        const m = Math.floor(totalSec / 60);
        const s = Math.floor(totalSec % 60);
        return `T-${spatialData ? spatialData.duration_minutes - m : 15}:${s.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!venue) return;

        // Simulate fetching the 4D coordinate map
        api.get(`/spatial/scene/${venue.id}?minutes=15`)
            .then(res => {
                setSpatialData(res.data);
                setLoading(false);
                // Auto start playing
                setIsPlaying(true);
            })
            .catch(err => {
                toast.error("Failed to compile spatial matrix data.");
                setLoading(false);
            });
    }, [venue]);

    // Custom playback loop bypassing React re-renders for max FPS if possible, but 
    // typical state updates work okay for 1Hz data mapped to 60fps interpolation.
    useEffect(() => {
        if (!isPlaying) return;
        let lastTime = performance.now();

        const animateId = requestAnimationFrame(function loop(time) {
            if (!isPlaying) return;
            const delta = (time - lastTime) / 1000;
            lastTime = time;

            // Speed multiplier: 1 real second = 5 playback seconds (to make 15 minutes scrubbable)
            const speedMultiplier = 15;

            setCurrentFrame(prev => {
                let next = prev + (delta * speedMultiplier);
                if (next >= maxFrames) next = 0; // Loop around
                return next;
            });

            requestAnimationFrame(loop);
        });

        return () => cancelAnimationFrame(animateId);
    }, [isPlaying, maxFrames]);

    const [globalTrackingMode, setGlobalTrackingMode] = useState<"VISION" | "FUSION">("VISION");

    useEffect(() => {
        // Analyze frame to see if any entities are in shadow track
        if (!spatialData) return;
        let usingIoT = false;
        for (const ent of spatialData.entities) {
            const active = ent.tracklets.filter(t => t.time <= currentFrame);
            if (active.length > 0 && active[active.length - 1].sensor !== 'optical_camera') {
                usingIoT = true;
                break;
            }
        }
        setGlobalTrackingMode(usingIoT ? "FUSION" : "VISION");
    }, [currentFrame, spatialData]);

    const togglePlay = () => setIsPlaying(!isPlaying);

    return (
        <div className="w-full h-screen bg-[#050508] relative overflow-hidden flex flex-col font-sans text-white">

            {/* ───── TOP BAR ───── */}
            <div className="absolute top-0 inset-x-0 h-20 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-start pt-6 px-10 pointer-events-none">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex justify-center items-center backdrop-blur-md shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                        <Map className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 drop-shadow-md">
                            4D SPATIAL PLAYBACK ENGINE
                        </h1>
                        <p className="text-indigo-400/80 text-[10px] font-mono tracking-[0.3em] font-bold mt-1.5 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,1)]" /> Neural Radiance Synthesis Active
                        </p>
                    </div>
                </div>

                <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-5 py-2.5 rounded-xl flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Venue Matrix</p>
                        <p className="text-sm font-bold tracking-wider">{venue?.name || 'INITIALIZING...'}</p>
                    </div>
                    <div className="w-[1px] h-8 bg-white/10" />
                    <div className="text-right">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Tracking Matrix</p>
                        <p className={`text-sm font-bold tracking-wider ${globalTrackingMode === "FUSION" ? "text-cyan-400" : "text-white"}`}>
                            {globalTrackingMode}
                        </p>
                    </div>
                    <div className="w-[1px] h-8 bg-white/10" />
                    <div className="text-right">
                        <p className="text-[9px] uppercase tracking-widest text-emerald-500 mb-0.5 animate-pulse">Status</p>
                        <p className="text-sm font-bold tracking-wider text-white">STITCHED 3D</p>
                    </div>
                    <div className="w-[1px] h-8 bg-white/10" />
                    <div className="text-right">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Entities</p>
                        <p className="text-lg font-mono font-black tracking-tighter text-indigo-400">{spatialData?.entities.length || 0}</p>
                    </div>
                </div>
            </div>

            {/* ───── 3D CANVAS PORTAL ───── */}
            <div className="flex-1 w-full h-full cursor-move">
                {loading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center relative">
                        <div className="w-32 h-32 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <p className="absolute text-indigo-400 font-mono text-xs font-bold tracking-[0.2em] uppercase mt-40">Constructing Neural Fields...</p>
                    </div>
                ) : (
                    <Canvas camera={{ position: [0, 25, 35], fov: 45 }}>
                        <color attach="background" args={["#050508"]} />

                        <ambientLight intensity={0.4} />
                        <directionalLight position={[10, 20, 10]} intensity={1.5} />

                        {/* Simulated ground plane grid mapping camera views */}
                        <Grid
                            infiniteGrid
                            fadeDistance={100}
                            cellColor="#312e81"
                            sectionColor="#4f46e5"
                            sectionSize={10}
                            cellSize={2}
                        />

                        <OrbitControls
                            makeDefault
                            minPolarAngle={0}
                            maxPolarAngle={Math.PI / 2 - 0.05}
                            maxDistance={150}
                        />

                        <IoTBeacons />

                        {spatialData?.entities.map(entity => (
                            <group key={entity.id}>
                                <EntityNode entity={entity} currentFrame={currentFrame} />
                                <EntityPath entity={entity} currentFrame={currentFrame} />
                            </group>
                        ))}

                    </Canvas>
                )}
            </div>

            {/* ───── TEMPORAL SCRUBBER HUD ───── */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-4xl bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setCurrentFrame(Math.max(0, currentFrame - 60))} className="p-2 hover:bg-white/10 rounded-full transition pointer-events-auto">
                            <Rewind className="w-5 h-5 text-slate-300" />
                        </button>
                        <button onClick={togglePlay} className="p-4 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] transition hover:scale-105 pointer-events-auto">
                            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                        </button>
                        <button onClick={() => setCurrentFrame(Math.min(maxFrames, currentFrame + 60))} className="p-2 hover:bg-white/10 rounded-full transition pointer-events-auto">
                            <FastForward className="w-5 h-5 text-slate-300" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 bg-indigo-950/30 border border-indigo-500/30 px-6 py-2 rounded-xl">
                        <span className="text-[10px] font-bold text-indigo-400 tracking-[0.2em] uppercase">Temporal Coordinate</span>
                        <span className="text-xl font-mono font-black text-white w-28 text-center tabular-nums">
                            {formatTimeInfo(currentFrame)}
                        </span>
                    </div>
                </div>

                <div className="w-full relative h-3 bg-white/5 rounded-full overflow-hidden pointer-events-auto cursor-pointer group">
                    {/* Timeline track */}
                    <div
                        className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-indigo-600 to-cyan-400 group-hover:brightness-125 transition-all pointer-events-none"
                        style={{ width: `${(currentFrame / maxFrames) * 100}%` }}
                    />
                    {/* Timeline dragger input */}
                    <input
                        type="range"
                        min="0"
                        max={maxFrames}
                        value={currentFrame}
                        onChange={(e) => setCurrentFrame(parseFloat(e.target.value))}
                        className="w-full h-full opacity-0 cursor-ew-resize absolute inset-0 z-10"
                    />
                </div>
                <div className="flex justify-between mt-2 px-1 text-[9px] font-mono text-slate-500 tracking-widest">
                    <span>T-15 MINUTES</span>
                    <span>LIVE</span>
                </div>
            </div>

        </div>
    );
}
