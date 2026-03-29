"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Footprints, RefreshCw, MapPin, Clock, ShieldAlert, CircuitBoard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAlertStream } from "@/src/hooks/useAlertStream";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface JourneyStep {
  camera_id: string;
  camera_name?: string;
  timestamp: string;
  dwell_time?: number;
}
interface Journey {
  global_id: string;
  path: JourneyStep[];
  last_seen: string;
  is_multicam?: boolean;
  similarity?: number;
  intent?: string;
}

// A simple color palette for cameras
const CAMERA_COLORS: Record<string, string> = {};
const PALETTE = [
  "bg-violet-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-fuchsia-500",
  "bg-lime-500",
];
let colorIdx = 0;
function getCameraColor(id: string) {
  if (!CAMERA_COLORS[id]) {
    CAMERA_COLORS[id] = PALETTE[colorIdx % PALETTE.length];
    colorIdx++;
  }
  return CAMERA_COLORS[id];
}

const LiveHeartbeat = ({ active }: { active: boolean }) => (
  <div className="relative flex h-3 w-3">
    {active && (
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
    )}
    <span className={`relative inline-flex rounded-full h-3 w-3 ${active ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]' : 'bg-neutral-800'}`}></span>
  </div>
);

export default function JourneysPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJourneys = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/journeys/`);
      const data = await res.json();
      setJourneys(data.journeys || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const { connected, connectionState } = useAlertStream({
    onCrossCamera: useCallback((data: any) => {
      if (data.type === "journey_reappearance") {
        toast.info("Target Spotted Again", {
          description: data.insight || "Subject reappeared in the network.",
          icon: "👁️",
          duration: 3000,
        });
      } else {
        toast.success("Cross-Camera Transition", {
          description: data.insight || "Subject moved between cameras.",
          icon: "👣",
          duration: 3000,
        });
      }
      fetchJourneys();
    }, [fetchJourneys]),
  });

  // Handle reconnection: refetch when we get back online
  useEffect(() => {
    if (connected) {
      fetchJourneys();
    }
  }, [connected, fetchJourneys]);

  useEffect(() => {
    fetchJourneys();
    const id = setInterval(fetchJourneys, 5000); 
    return () => clearInterval(id);
  }, [fetchJourneys]);

  const liveJourneys = journeys
    .filter(j => {
      const lastSeen = new Date(j.last_seen).getTime();
      const now = new Date().getTime();
      return (now - lastSeen) < 5 * 60 * 1000; // Only show last 5 minutes
    })
    .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 text-white min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/30 relative">
            <Footprints className="h-6 w-6 text-violet-400" />
            {connected && <div className="absolute -top-1 -right-1 h-3 w-3 bg-emerald-500 rounded-full animate-ping" />}
          </div>
          <div>
            <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-black tracking-widest uppercase">Live Journey Map</h1>
                <span className={`px-2 py-0.5 ${connected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'} border text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 transition-colors`}>
                    <span className={`h-1.5 w-1.5 ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'} rounded-full`} />
                    {connectionState === 'connected' ? 'Live ReID Active' : connectionState.toUpperCase()}
                </span>
            </div>
            <p className="text-neutral-500 tracking-wider text-sm mt-1">
              Real-time cross-camera intelligence and spatial tracking.
            </p>
          </div>
        </div>
        <button
          onClick={fetchJourneys}
          className="flex items-center space-x-2 bg-violet-600 hover:bg-violet-500 text-white font-black py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-violet-500/20 text-xs uppercase tracking-widest active:scale-95"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Sync Neural Graph</span>
        </button>
      </div>
      
      {/* Neural Connectivity Matrix - Macro View */}
      {!loading && liveJourneys.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-black/40 border border-violet-500/20 rounded-3xl overflow-hidden relative group mt-8"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <CircuitBoard className="h-24 w-24 text-violet-500" />
            </div>
            <div className="flex items-center gap-4 mb-6">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                    <CircuitBoard className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Neural Connectivity Matrix</h3>
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Macro-level transition pathways across active sectors</p>
                </div>
            </div>
            
            <div className="flex flex-wrap gap-8">
                {Array.from(new Set(liveJourneys.flatMap(j => 
                    j.path.slice(0, -1).map((step, i) => `${step.camera_name || '?'}_to_${j.path[i+1].camera_name || '?'}`)
                ))).slice(0, 4).map((link, i) => {
                    const [from, to] = link.split("_to_");
                    return (
                        <div key={i} className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-2xl border border-white/5 hover:border-violet-500/30 transition-all cursor-default">
                            <span className="text-[10px] font-black text-violet-400 uppercase tracking-tighter shrink-0">{from}</span>
                            <div className="w-8 h-[1px] bg-violet-500/30 relative">
                                <motion.div 
                                    className="absolute inset-0 bg-violet-400"
                                    animate={{ opacity: [0, 1, 0], scaleX: [0, 1, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                                />
                            </div>
                            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-tighter shrink-0">{to}</span>
                        </div>
                    )
                })}
                {liveJourneys.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                         <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                         <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                            {liveJourneys.filter(j => j.path.length > 1).length} Active Traversals
                         </span>
                    </div>
                )}
            </div>
          </motion.div>
      )}

      {loading ? (
        <div className="p-20 flex justify-center">
          <Footprints className="animate-pulse h-12 w-12 text-neutral-700" />
        </div>
      ) : liveJourneys.length === 0 ? (
        <div className="p-24 bg-black/40 border border-dashed border-neutral-800 rounded-3xl flex flex-col items-center text-neutral-500 shadow-inner">
          <Footprints className="h-16 w-16 mb-6 opacity-20" />
          <p className="font-black text-white text-lg uppercase tracking-widest mb-2">No Active Neural Tracks</p>
          <p className="text-sm max-w-sm text-center opacity-60">Currently monitoring the matrix. Only live detections from the last 5 minutes are displayed here.</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <div className="grid gap-6">
            {liveJourneys.map((j) => {
              const isActive = (new Date().getTime() - new Date(j.last_seen).getTime()) < 30000;
              return (
              <motion.div
                key={j.global_id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className={`bg-black/40 border ${j.is_multicam ? 'border-violet-500/40 shadow-[0_0_30px_rgba(139,92,246,0.15)]' : 'border-neutral-800/60'} rounded-3xl p-8 relative group overflow-hidden transition-all hover:bg-black/60`}
              >
                {j.is_multicam && (
                    <div className="absolute top-0 right-0 p-1.5 bg-violet-500 text-[10px] font-black uppercase tracking-widest text-black rounded-bl-xl shadow-lg">
                        Confirmed Multicam
                    </div>
                )}
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                  <div className="flex items-center space-x-4">
                    <div className="h-12 w-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center font-black text-violet-400 shadow-inner relative">
                        <CircuitBoard className="h-6 w-6 opacity-40" />
                        {isActive && (
                            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-500/50 animate-pulse" />
                        )}
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        Global Track Identity
                        {isActive && <span className="text-emerald-400 animate-pulse">● LIVE_FEED</span>}
                      </p>
                      <p className="font-mono text-xl text-white font-black tracking-tight mt-0.5">
                        {j.global_id.split("-")[0].toUpperCase()} 
                        <span className={`block md:inline md:ml-2 text-[10px] px-2 py-0.5 rounded ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-neutral-800 text-neutral-500'} font-black uppercase tracking-widest`}>
                            {isActive ? 'Active Persistence' : 'Dormant'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="flex items-center md:justify-end space-x-2 text-xs text-neutral-400 font-bold mb-1">
                      <Clock className="h-3.5 w-3.5 text-violet-500" />
                      <span>LAST_CONTACT: {new Date(j.last_seen).toLocaleTimeString()}</span>
                    </p>
                    <div className="flex items-center md:justify-end gap-2">
                        <span className="px-3 py-1 bg-neutral-900 rounded-full text-[10px] font-black text-violet-400 border border-violet-500/20 uppercase tracking-widest">
                            {j.path.length} HOPS
                        </span>
                        <div className={`px-3 py-1 ${isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-neutral-900 text-neutral-600 border-neutral-800'} rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors border`}>
                            <LiveHeartbeat active={isActive} />
                            {isActive ? 'Live' : 'Last Contact'}
                        </div>
                    </div>
                  </div>
                </div>

                {/* Timeline Visualization */}
                <div className="flex items-center space-x-4 overflow-x-auto pb-4 scrollbar-hide">
                  {j.path.map((step, idx) => (
                    <React.Fragment key={idx}>
                      <div className="flex items-center space-x-4 min-w-fit group/step">
                        <div className={`h-14 w-14 rounded-2xl ${getCameraColor(step.camera_id)} bg-opacity-10 border-2 ${getCameraColor(step.camera_id).replace('bg-', 'border-')} flex flex-col items-center justify-center p-2 shadow-lg transition-transform group-hover/step:scale-110`}>
                            <MapPin className="h-4 w-4 mb-1" />
                            <span className="text-[10px] font-black uppercase text-white truncate max-w-full">
                                {step.camera_name
                                     ? step.camera_name.split(" ")[0]
                                     : step.camera_id.slice(-6)}
                            </span>
                        </div>
                        <div className="flex flex-col">
                          <p className="text-xs font-black text-white uppercase tracking-widest mb-0.5">
                            {step.camera_name || step.camera_id.slice(-8)}
                          </p>
                          <p className="text-[10px] font-mono text-neutral-500 font-bold whitespace-nowrap flex items-center gap-2">
                            {new Date(step.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            {step.dwell_time && step.dwell_time > 0 && (
                                <span className="text-violet-400/80 bg-violet-500/5 px-1.5 py-0.5 rounded border border-violet-500/10">
                                    {step.dwell_time}s dwell
                                </span>
                            )}
                          </p>
                        </div>
                      </div>
                      {idx < j.path.length - 1 && (
                        <div className="flex-1 min-w-[60px] h-[2px] bg-neutral-800/50 relative overflow-hidden rounded-full">
                            <motion.div 
                                className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-violet-600 via-cyan-400 to-violet-600"
                                initial={{ width: "0%" }}
                                animate={{ width: ["0%", "100%", "0%"], left: ["0%", "0%", "100%"] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: idx * 0.5 }}
                                style={{ boxShadow: "0 0 15px rgba(139, 92, 246, 0.5)" }}
                            />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Intelligent Insight Overlay (Bottom info) */}
                <div className="mt-8 pt-6 border-t border-neutral-800/50 flex flex-wrap gap-3">
                   <div className={`px-4 py-2 ${j.path.length > 1 ? "bg-violet-500/10 border-violet-500/30" : "bg-white/5 border-white/5"} rounded-xl border flex items-center gap-3`}>
                       <ShieldAlert className={`h-4 w-4 ${j.path.length > 1 ? "text-violet-400" : "text-amber-500"}`} />
                       <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                           Neural Intent: <span className="text-white ml-2">
                             {j.path.length > 1 ? (j.intent || "Cross-Camera Traversal") : "Sector Persistence"}
                           </span>
                       </span>
                   </div>
                   <div className="px-4 py-2 bg-neutral-900/50 rounded-xl border border-white/5 flex items-center gap-3 relative overflow-hidden">
                       <div 
                         className="absolute inset-0 opacity-20" 
                         style={{ 
                            background: `linear-gradient(90deg, transparent, ${j.similarity && j.similarity > 0.8 ? '#10b981' : '#8b5cf6'} 50%, transparent)`,
                            filter: 'blur(10px)'
                         }} 
                       />
                       <CircuitBoard className={`h-4 w-4 ${j.similarity && j.similarity > 0.8 ? 'text-emerald-400' : 'text-violet-400'}`} />
                       <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest relative z-10">
                           Neural Confidence: 
                           <span className={`ml-2 text-xs ${j.similarity && j.similarity > 0.8 ? 'text-emerald-400' : 'text-white'}`}>
                            {j.similarity ? Math.round(j.similarity * 100) : 100}%
                           </span>
                       </span>
                   </div>
                </div>
              </motion.div>
            );
          })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
