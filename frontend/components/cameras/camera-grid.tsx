"use client";

import { Camera } from "@/hooks/useCameras";
import { useState } from "react";
import { Video, WifiOff, MapPin, Activity, ArrowRight, Trash2, Power, PowerOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { api } from "@/services/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { HeatmapOverlay } from "@/components/advanced/HeatmapOverlay";
import EditCameraModal from "./edit-camera-modal";
import { Edit } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  cameras: Camera[];
  isLoading: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 15 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } }
}

export default function CameraGrid({ cameras, isLoading }: Props) {
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const endpoint = isActive ? `/cameras/${id}/disable` : `/cameras/${id}/enable`;
      await api.post(endpoint);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cameras/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });

  if (isLoading) {
     return (
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {Array.from({ length: 6 }).map((_, i) => (
           <div
             key={i}
             className="h-[200px] rounded-2xl glass-panel animate-pulse relative overflow-hidden"
           >
             <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-white/5 to-transparent scan-line" />
           </div>
         ))}
       </div>
     );
  }

  if (!cameras || cameras.length === 0) {
     return (
       <div className="flex flex-col items-center justify-center p-16 bg-[rgba(10,10,15,0.4)] backdrop-blur-3xl rounded-2xl border border-dashed border-white/10 text-center shadow-[inset_0_0_50px_rgba(255,255,255,0.02)]">
         <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-5 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
           <Video className="w-12 h-12 text-slate-500" />
         </div>
         <h3 className="text-white text-xl font-black mb-2 tracking-widest uppercase">{t("auto.NoDeploymentsAc_9207") || "No Deployments Active"}</h3>
         <p className="text-slate-500 text-sm max-w-md font-mono">
           {t("auto.Connectyourfirs_7873") || "Connect your first sensor node via RTSP or ONVIF protocol to initialize the intelligence grid."}
         </p>
       </div>
     );
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {cameras.map((camera) => (
        <motion.div 
          key={camera.id} 
          variants={itemVariants}
          className="group relative bg-[#050505] rounded-2xl p-6 border border-white/10 overflow-hidden hover:-translate-y-1 transition-all duration-500 hover:border-cyan-500/50 hover:shadow-[0_15px_40px_rgba(34,211,238,0.15)] flex flex-col justify-between h-[220px]"
        >
           {/* Ambient Hover Glow */}
           <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/20 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0"></div>
           
           {/* Scanline Effect */}
           <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.02] to-transparent scan-line pointer-events-none mix-blend-overlay z-10"></div>
           
           {/* 🗺️ Heatmap Overlay (Live density visualization) */}
           {camera.is_active && (
             <div className="absolute inset-0 z-0 opacity-40 pointer-events-none overflow-hidden rounded-2xl">
               <HeatmapOverlay zones={[]} />
             </div>
           )}

           <div className="relative z-20 flex flex-col h-full">
             {/* Header */}
             <div className="flex justify-between items-start mb-4 gap-3">
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                   <h3 className="text-white text-lg font-black tracking-wider flex items-center gap-2 group-hover:text-cyan-400 transition-colors uppercase truncate drop-shadow-md">
                     {camera.name}
                   </h3>
                   <div className="flex items-center gap-2">
                     <MapPin className="w-3.5 h-3.5 text-slate-500" />
                     <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black truncate">
                       {camera.venue_id.slice(0, 12)}...
                     </p>
                   </div>
                </div>
                
                {camera.is_active ? (
                   <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-black text-emerald-400 tracking-[0.2em] uppercase flex-shrink-0 shadow-[inset_0_0_10px_rgba(16,185,129,0.1)]">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                      </span>
                      {t("auto.Active_3416") || "Active"}
                   </div>
                ) : (
                   <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[10px] font-black text-rose-400 tracking-[0.2em] uppercase flex-shrink-0 shadow-[inset_0_0_10px_rgba(244,63,94,0.1)]">
                      <WifiOff className="w-3 h-3" /> {t("auto.Offline_6760") || "Offline"}
                   </div>
                )}
             </div>
  
             {/* Metrics */}
             <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-white/10 text-xs">
                <div className="flex flex-col gap-1.5">
                   <span className="text-slate-500/80 uppercase tracking-widest text-[10px] font-black">{t("auto.NodeType_2736") || "Node Type"}</span>
                   <span className="text-cyan-100 uppercase font-mono font-bold">{camera.stream_type || "UNKNOWN"}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                   <span className="text-slate-500/80 uppercase tracking-widest text-[10px] font-black">{t("auto.PulseCheck_6350") || "Pulse Check"}</span>
                   <span className="text-slate-300 font-mono text-[11px]">
                     {camera.last_heartbeat_at 
                       ? formatDistanceToNow(new Date(camera.last_heartbeat_at), { addSuffix: true }) 
                       : "Never"}
                   </span>
                </div>
             </div>
  
             {/* Action Buttons */}
             <div className="flex items-center gap-3 mt-auto">
                <Link href={`/cameras/${camera.id}`} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-400 transition-all group/btn shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">
                   <Activity className="w-4 h-4" /> {t("auto.ViewFeed_6065") || "View Feed"} <ArrowRight className="w-3.5 h-3.5 ml-1 opacity-50 group-hover/btn:opacity-100 group-hover/btn:translate-x-1 transition-all" />
                </Link>
                <button 
                  onClick={() => toggleMutation.mutate({ id: camera.id, isActive: camera.is_active })}
                  className={`flex items-center justify-center p-2.5 rounded-xl border transition-all duration-300 ${camera.is_active ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/20' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'}`}
                  title={camera.is_active ? "Deactivate Node" : "Activate Node"}
                >
                   {camera.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => {
                    if (confirm("SEVERE: Are you sure you want to permanently delete this camera node?")) {
                      deleteMutation.mutate(camera.id);
                    }
                  }}
                  className="flex items-center justify-center p-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-500 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-400 transition-all"
                  title="Purge Node"
                >
                   <Trash2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setEditingCamera(camera)}
                  className="flex items-center justify-center p-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-500 hover:bg-cyan-500/20 hover:border-cyan-500/40 hover:text-cyan-400 transition-all"
                  title="Edit Node settings"
                >
                   <Edit className="w-4 h-4" />
                </button>
             </div>
           </div>
        </motion.div>
      ))}
      <EditCameraModal 
        camera={editingCamera}
        isOpen={!!editingCamera}
        onClose={() => setEditingCamera(null)}
      />
    </motion.div>
  );
}
