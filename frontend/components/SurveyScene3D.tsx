"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";

// Simulated fixed positions for cameras since we don't have real GPS coords in db
const CAMERA_POSITIONS = [
  [-4, 0, -3],
  [4, 0, -2],
  [-2, 0, 4],
  [3, 0, 3],
  [0, 0, 0],
  [-6, 0, 1],
  [6, 0, -5],
];

function CameraNode({ 
  cam, 
  peak, 
  current, 
  position,
  index
}: { 
  cam: any, 
  peak: number, 
  current: number, 
  position: [number, number, number],
  index: number
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  
  const isTargeted = current > 0;
  const heightMultiplier = Math.max(1, current / 5); // Scale height based on crowd
  const targetHeight = 0.5 + heightMultiplier;

  useFrame((state) => {
    if (meshRef.current) {
      // Smoothly animate height
      meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, targetHeight, 0.1);
      meshRef.current.position.y = meshRef.current.scale.y / 2;
    }
    if (ringRef.current && isTargeted) {
      ringRef.current.scale.x = 1 + Math.sin(state.clock.elapsedTime * 3 + index) * 0.2;
      ringRef.current.scale.z = 1 + Math.sin(state.clock.elapsedTime * 3 + index) * 0.2;
      ringRef.current.rotation.z += 0.01;
    }
  });

  return (
    <group position={position}>
      {/* 3D Pillar */}
      <mesh ref={meshRef} position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshStandardMaterial 
          color={isTargeted ? "#22d3ee" : "#334155"} 
          emissive={isTargeted ? "#0891b2" : "#0f172a"}
          emissiveIntensity={isTargeted ? 1.5 : 0.2}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Pulsing Floor Ring */}
      <mesh ref={ringRef} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.8, 32]} />
        <meshBasicMaterial 
          color={isTargeted ? "#22d3ee" : "#475569"} 
          transparent 
          opacity={isTargeted ? 0.8 : 0.2} 
        />
      </mesh>

      {/* HTML Overlay Label */}
      <Html position={[0, targetHeight + 1.5, 0]} center zIndexRange={[100, 0]}>
        <div className={`transition-all duration-300 transform scale-75 md:scale-100 ${isTargeted ? "opacity-100" : "opacity-40"}`}>
          <div className="bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] min-w-[140px] flex flex-col items-center">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest whitespace-nowrap mb-1">
              {cam.camera_name || `Cam ${cam.camera_id.slice(0, 4)}`}
            </div>
            <div className="flex gap-4 w-full justify-between items-end mt-2">
               <div className="flex flex-col items-center">
                 <span className="text-[8px] text-cyan-500 uppercase font-black">LIVE</span>
                 <span className="text-xl font-black text-white">{current}</span>
               </div>
               <div className="flex flex-col items-center">
                 <span className="text-[8px] text-slate-500 uppercase font-black">PEAK</span>
                 <span className="text-sm font-bold text-slate-400">{peak}</span>
               </div>
            </div>
            {isTargeted && (
               <div className="mt-2 w-full h-1 bg-cyan-500/20 rounded-full overflow-hidden">
                 <div className="h-full bg-cyan-400 animate-pulse w-full"></div>
               </div>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function SurveyScene3D({ activeCameras = [], cameraMemory = {} }: { activeCameras: any[], cameraMemory: Record<string, number> }) {
  // Memoize positions to avoid jumping around on re-renders, mapped by camera ID
  const positionsMap = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    activeCameras.forEach((cam, i) => {
      // Use predefined positions or random deterministic generated ones
      map[cam.camera_id] = CAMERA_POSITIONS[i % CAMERA_POSITIONS.length] as [number, number, number];
    });
    return map;
  }, [activeCameras]);

  return (
    <div className="w-full h-[500px] lg:h-[600px] rounded-3xl overflow-hidden border border-white/10 bg-black/40 relative shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
      {/* Decorative scanline overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[url('/scanlines.png')] mix-blend-overlay opacity-20 z-10" />
      
      <Canvas shadows camera={{ position: [10, 8, 10], fov: 45 }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 10, 40]} />
        
        <ambientLight intensity={0.2} />
        <directionalLight 
          position={[5, 10, 5]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={1024}
        />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#22d3ee" />

        {/* The futuristic floor grid */}
        <Grid 
          infiniteGrid 
          fadeDistance={30} 
          sectionColor="#334155" 
          cellColor="#0f172a" 
          position={[0, -0.01, 0]} 
        />

        {/* Map each active camera to a 3D Node */}
        {activeCameras.map((cam, index) => {
          const peak = cameraMemory[cam.camera_id] || 0;
          const current = cam.snapshot?.density?.current || 0;
          const pos = positionsMap[cam.camera_id] || [0, 0, 0];

          return (
            <CameraNode 
              key={cam.camera_id} 
              index={index}
              cam={cam} 
              peak={peak} 
              current={current} 
              position={pos} 
            />
          );
        })}

        <OrbitControls 
          enablePan={false} 
          maxPolarAngle={Math.PI / 2.1} 
          minDistance={5} 
          maxDistance={25}
          autoRotate={activeCameras.length > 0}
          autoRotateSpeed={0.5}
        />
        <Environment preset="night" />
      </Canvas>
      
      {/* Overlay UI when empty */}
      {activeCameras.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 text-center">
            <p className="text-cyan-500 font-black tracking-[0.2em] uppercase text-sm mb-1">Awaiting Telemetry</p>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">3D Command Center Offline</p>
          </div>
        </div>
      )}
      
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
         <h2 className="text-xs font-black tracking-[0.3em] uppercase text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]"></span>
            3D Spatial Command
         </h2>
      </div>
    </div>
  );
}
