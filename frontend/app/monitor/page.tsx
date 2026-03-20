"use client";

import { useCameras } from "@/hooks/useCameras";
import { LayoutGrid, Activity, Video, AlertTriangle, Maximize2, ShieldAlert, Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { getToken } from "@/services/auth";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

export default function MonitorWallPage() {
  const { data: cameras, isLoading } = useCameras();
  const [gridSize, setGridSize] = useState(4); // default 2x2
  const [searchQuery, setSearchQuery] = useState("");
  const [fullscreenCamera, setFullscreenCamera] = useState<any>(null);
  const { t } = useTranslation();
  
  const activeCameras = useMemo(() => {
    const safeCameras = Array.isArray(cameras) ? cameras : [];
    let filtered = safeCameras.filter(c => c.is_active) || [];
    if (searchQuery) {
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  }, [cameras, searchQuery]);

  const displayCameras = useMemo(() => {
    return activeCameras.slice(0, gridSize);
  }, [activeCameras, gridSize]);

  const paddingCameras = useMemo(() => {
    const padCount = Math.max(0, gridSize - displayCameras.length);
    return Array.from({ length: padCount }).map((_, i) => i);
  }, [gridSize, displayCameras]);

  const gridClass = useMemo(() => {
    if (gridSize <= 1) return "grid-cols-1";
    if (gridSize <= 4) return "grid-cols-1 md:grid-cols-2";
    if (gridSize <= 9) return "grid-cols-1 md:grid-cols-3 lg:grid-cols-3";
    return "grid-cols-1 md:grid-cols-4 lg:grid-cols-4";
  }, [gridSize]);

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 flex flex-col relative overflow-hidden">
      
      {/* Background Matrix Effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none -z-10 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 mt-2 relative z-10 w-full">
        <div className="flex items-center gap-5">
          <div className="p-3 bg-cyan-950/40 backdrop-blur-md border border-cyan-500/30 rounded-2xl flex-shrink-0 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <LayoutGrid className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
             <h1 className="text-3xl font-black tracking-[0.1em] text-white flex items-center gap-4 font-heading uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
               {t("monitor.title") || "Global Matrix"}
               <span className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-[0.2em] shadow-[inset_0_0_10px_rgba(244,63,94,0.2)] flex items-center gap-2">
                 <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                 {t("monitor.livemultiplex") || "LIVE MULTIPLEX"}
               </span>
             </h1>
             <p className="text-sm font-bold text-slate-400 mt-2 tracking-widest uppercase">
               {t("monitor.subtitle") || "Synchronized Grid Processing"}
             </p>
          </div>
        </div>

        <div className="flex items-center gap-4 glass-panel px-4 py-2 rounded-xl flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={t("common.search") || "Filter..."} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/50 border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:border-cyan-500/50 w-48 transition-colors"
            />
          </div>
          <span className="text-[10px] uppercase font-black text-cyan-500 tracking-[0.2em]">{t("monitor.gridMatrix") || "Matrix Config"}</span>
          <div className="flex gap-1.5">
             {[1, 4, 9, 16].map((size) => (
                <button 
                  key={size}
                  onClick={() => setGridSize(size)} 
                  className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold transition-all duration-300 border
                    ${gridSize === size 
                      ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_15px_rgba(34,211,238,0.5)]' 
                      : 'bg-black/50 border-white/5 text-slate-400 hover:text-white hover:border-white/20'}`}
                >
                  {Math.sqrt(size)}x{Math.sqrt(size)}
                </button>
             ))}
          </div>
        </div>
      </div>

      <div className={`grid ${gridClass} gap-6 flex-1 auto-rows-fr relative z-10 w-full group/matrix`}>
         <AnimatePresence mode="popLayout">
           {isLoading ? (
              Array.from({ length: gridSize }).map((_, i) => (
                <motion.div 
                  key={`loading-${i}`} 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-[#050505] border border-white/5 rounded-2xl animate-pulse min-h-[350px] shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]"
                />
              ))
           ) : (
              <>
                 {displayCameras.map((cam, i) => (
                   <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.4 }}
                    key={cam.id} 
                    className="relative bg-black rounded-2xl border border-white/10 overflow-hidden group/feed min-h-[350px] shadow-[0_10px_30px_rgba(0,0,0,0.8)] transition-all duration-500 hover:z-20 hover:scale-[1.02] hover:shadow-[0_20px_50px_rgba(34,211,238,0.15)] hover:border-cyan-500/40"
                   >
                     {/* Outer Hover Glow */}
                     <div className="absolute inset-0 bg-transparent rounded-2xl ring-2 ring-cyan-500/0 group-hover/feed:ring-cyan-500/50 transition-all duration-500 pointer-events-none z-30"></div>

                     <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-10 mix-blend-overlay"></div>
                     <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent scan-line pointer-events-none z-20"></div>
                     
                     <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-[#020202] overflow-hidden">
                       {/* Try to load the stream, fallback to icon if it fails */}
                       {cam.is_active && cam.is_online ? (
                         <img 
                            src={`http://127.0.0.1:8000/api/v1/vision/feed/${cam.id}?token=${encodeURIComponent(getToken() || "")}`}
                            alt={`Camera ${cam.name} Feed`}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover/feed:scale-105"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                         />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                            <div className="relative mb-4">
                               <div className="absolute inset-0 bg-rose-500/10 blur-[20px] rounded-full animate-pulse"></div>
                               <ShieldAlert className="w-16 h-16 text-rose-500/60 relative z-10" />
                            </div>
                            <span className="text-[10px] font-mono font-black text-rose-500/80 uppercase tracking-[0.3em] mb-2">Matrix Link Severed</span>
                            <div className="flex flex-col items-center gap-1 opacity-40">
                               <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Awaiting Signal Synchronization</span>
                               <span className="text-[8px] font-mono text-slate-600 uppercase tracking-widest">Ref: SYS_CONN_DROP_{cam.id.substring(0,4)}</span>
                            </div>
                          </div>
                        )}
                        <div className="hidden absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                          <div className="relative mb-4">
                             <div className="absolute inset-0 bg-rose-500/10 blur-[20px] rounded-full animate-pulse"></div>
                             <ShieldAlert className="w-16 h-16 text-rose-500/60 relative z-10" />
                          </div>
                          <span className="text-[10px] font-mono font-black text-rose-500/80 uppercase tracking-[0.3em] mb-2">Signal Processing Error</span>
                          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest opacity-40">Auto-recovery in progress...</span>
                        </div>
                     </div>
  
                     {/* Top Bar overlays */}
                     <div className="absolute top-4 left-4 right-4 flex justify-between z-20">
                       <div className="bg-black/80 backdrop-blur-md text-white px-3 py-1.5 rounded-lg border border-white/10 flex flex-col gap-1 shadow-[0_0_20px_rgba(0,0,0,0.5)] group-hover/feed:border-cyan-500/40 transition-colors">
                         <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${cam.is_active && cam.is_online ? 'bg-rose-500 animate-[pulse_1s_ease-in-out_infinite] shadow-[0_0_8px_rgba(244,63,94,0.8)]' : 'bg-slate-600'}`}></div>
                            <span className="font-mono text-[10px] uppercase font-black tracking-widest">{cam.name}</span>
                         </div>
                         <div className="flex items-center gap-2 text-[8px] text-slate-400 font-bold tracking-tighter">
                            <Activity className="w-2.5 h-2.5" />
                            <span>V-INTEL: ACTIVE</span>
                            <span className="text-cyan-500">YOLO11s_CORE</span>
                         </div>
                       </div>
                       
                       <div className="flex flex-col gap-2 items-end">
                          <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-widest">
                            <Activity className="w-3.5 h-3.5" /> 
                            <span>{cam.fps || 30} FPS</span>
                          </div>
                          <div className="bg-rose-500/10 backdrop-blur-md px-2 py-1 rounded border border-rose-500/20 text-rose-400 text-[8px] font-black uppercase tracking-widest">
                            LVL: NOMINAL
                          </div>
                       </div>
                     </div>
  
                     {/* Bottom Bar overlay */}
                     <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none z-20 opacity-0 group-hover/feed:opacity-100 transition-opacity duration-300">
                       <div className="flex flex-col gap-2">
                            <div className="bg-emerald-500/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold tracking-widest uppercase flex items-center gap-2">
                                <Search className="w-3.5 h-3.5" />
                                SCANNING: {cam.name.toUpperCase()}
                            </div>
                            <div className="bg-black/40 backdrop-blur-sm px-2 py-1 rounded text-[8px] font-mono text-slate-500 flex gap-2">
                                <span>POS: LAT_SYNC</span>
                                <span>REF: 001x{cam.id.substring(0,4)}</span>
                            </div>
                       </div>
                       <button 
                         onClick={() => setFullscreenCamera(cam)}
                         className="p-2.5 bg-black/80 hover:bg-cyan-500/20 backdrop-blur-md border border-white/10 hover:border-cyan-500/50 rounded-lg text-slate-300 hover:text-cyan-400 transition-colors pointer-events-auto backdrop-saturate-150"
                       >
                          <Maximize2 className="w-4 h-4" />
                       </button>
                     </div>
                   </motion.div>
                 ))}
  
                 {paddingCameras.map((pad, i) => (
                   <motion.div 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 + 0.2 }}
                    key={`pad-${pad}`} 
                    className="relative bg-[rgba(10,10,15,0.4)] backdrop-blur-3xl rounded-2xl border border-white/5 flex flex-col items-center justify-center min-h-[350px] opacity-60 shadow-[inset_0_0_30px_rgba(255,255,255,0.01)]"
                   >
                     <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_25%,rgba(255,255,255,0.02)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.02)_75%,rgba(255,255,255,0.02)_100%)] bg-[length:20px_20px]"></div>
                     <Video className="w-10 h-10 text-slate-800 mb-3" />
                     <p className="text-[10px] font-mono text-slate-600 font-bold uppercase tracking-[0.3em]">Signal Missing / Unassigned</p>
                   </motion.div>
                 ))}
              </>
           )}
         </AnimatePresence>
      </div>

      {/* Fullscreen Camera Modal */}
      <AnimatePresence>
        {fullscreenCamera && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 md:p-8"
          >
            <div className="relative w-full h-full max-w-7xl max-h-[90vh] bg-black border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-[0_0_50px_rgba(34,211,238,0.1)]">
              
              {/* Modal Header */}
              <div className="flex justify-between items-center p-4 border-b border-white/10 bg-black/50">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.8)]"></div>
                  <h2 className="text-lg font-bold text-white uppercase tracking-widest font-heading">
                    {fullscreenCamera.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
                    {fullscreenCamera.fps || 15} FPS
                  </span>
                </div>
                <button 
                  onClick={() => setFullscreenCamera(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Body (Camera Feed) */}
              <div className="flex-1 relative bg-[#020202] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent scan-line pointer-events-none z-20"></div>
                {fullscreenCamera.is_active && fullscreenCamera.is_online ? (
                  <img 
                     src={`http://127.0.0.1:8000/api/v1/vision/feed/${fullscreenCamera.id}?token=${encodeURIComponent(getToken() || "")}&_t=${Date.now()}`}
                     alt={`Camera ${fullscreenCamera.name} Fullscreen`}
                     className="w-full h-full object-contain"
                     onError={(e) => {
                       e.currentTarget.style.display = 'none';
                       e.currentTarget.nextElementSibling?.classList.remove('hidden');
                     }}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <ShieldAlert className="w-24 h-24 text-rose-500 mb-4 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)]" />
                    <span className="text-sm font-mono font-bold text-rose-500 uppercase tracking-[0.3em]">Signal Offline</span>
                  </div>
                )}
                <div className="hidden absolute inset-0 flex flex-col items-center justify-center">
                  <ShieldAlert className="w-24 h-24 text-rose-500 mb-4 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)]" />
                  <span className="text-sm font-mono font-bold text-rose-500 uppercase tracking-[0.3em]">Signal Offline</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
