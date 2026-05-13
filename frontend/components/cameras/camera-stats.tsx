"use client";

import { Camera } from "@/hooks/useCameras";
import { Activity, ShieldCheck, ShieldAlert, Video } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

interface Props {
  cameras: Camera[];
  isLoading: boolean;
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } }
}

export default function CameraStats({ cameras, isLoading }: Props) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 glass-panel rounded-2xl animate-pulse relative overflow-hidden">
             <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-white/5 to-transparent scan-line" />
          </div>
        ))}
      </div>
    );
  }

  const totalCameras = cameras.length;
  const activeCameras = cameras.filter((c) => c.is_active).length;
  const offlineCameras = totalCameras - activeCameras;
  const multiSiteMode = new Set(cameras.map((c) => c.venue_id)).size;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
      
      {/* Total Nodes */}
      <motion.div variants={itemVariants} className="glass-card p-6 group cursor-default h-[140px] flex flex-col justify-between">
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-slate-500/10 blur-[30px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"></div>
        <div className="flex justify-between items-start relative z-10 w-full mb-2">
          <div className="p-2.5 bg-slate-800/50 backdrop-blur-md rounded-xl border border-white/5 shadow-inner">
             <Video className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
          </div>
        </div>
        <div className="relative z-10">
          <h4 className="text-4xl font-black font-heading text-white tracking-tight leading-none drop-shadow-md group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all">
             {totalCameras}
          </h4>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">{t("auto.GrossNodesConfi_8869") || "Gross Nodes Config"}</p>
        </div>
      </motion.div>

      {/* Active Streams */}
      <motion.div variants={itemVariants} className="glass-card border-t border-emerald-500/20 p-6 group cursor-default h-[140px] flex flex-col justify-between" style={{ boxShadow: 'inset 0 0 20px rgba(16,185,129,0.02)' }}>
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/20 blur-[30px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"></div>
        <div className="flex justify-between items-start relative z-10 w-full mb-2">
          <div className="p-2.5 bg-emerald-950/40 backdrop-blur-md border border-emerald-500/30 rounded-xl shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]">
             <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30 tracking-[0.2em] uppercase shadow-[0_0_10px_rgba(16,185,129,0.1)]">
             {t("auto.LIVE_4994") || "LIVE"} <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </span>
        </div>
        <div className="relative z-10">
           <h4 className="text-4xl font-black font-heading text-white tracking-tight leading-none group-hover:text-emerald-400 drop-shadow-md transition-colors">
              {activeCameras}
           </h4>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">{t("auto.ActiveUpstreamL_2515") || "Active Upstream Links"}</p>
        </div>
      </motion.div>

      {/* Disconnected / Error */}
      <motion.div variants={itemVariants} className="glass-card border-t border-rose-500/20 p-6 group cursor-default h-[140px] flex flex-col justify-between" style={{ boxShadow: 'inset 0 0 20px rgba(244,63,94,0.02)' }}>
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-rose-500/20 blur-[30px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"></div>
        <div className="flex justify-between items-start relative z-10 w-full mb-2">
          <div className="p-2.5 bg-rose-950/40 backdrop-blur-md border border-rose-500/30 rounded-xl shadow-[inset_0_0_10px_rgba(244,63,94,0.2)]">
             <ShieldAlert className="w-5 h-5 text-rose-400" />
          </div>
        </div>
        <div className="relative z-10">
          <h4 className="text-4xl font-black font-heading text-white tracking-tight leading-none group-hover:text-rose-400 drop-shadow-md transition-colors">
             {offlineCameras}
          </h4>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">Node Failures / Offline</p>
        </div>
      </motion.div>

      {/* Locations Supported */}
      <motion.div variants={itemVariants} className="glass-card border-t border-cyan-500/20 p-6 group cursor-default h-[140px] flex flex-col justify-between" style={{ boxShadow: 'inset 0 0 20px rgba(34,211,238,0.02)' }}>
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-cyan-500/20 blur-[30px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"></div>
        <div className="flex justify-between items-start relative z-10 w-full mb-2">
          <div className="p-2.5 bg-cyan-950/40 backdrop-blur-md border border-cyan-500/30 rounded-xl shadow-[inset_0_0_10px_rgba(34,211,238,0.2)]">
             <Activity className="w-5 h-5 text-cyan-400" />
          </div>
        </div>
        <div className="relative z-10">
          <h4 className="text-4xl font-black font-heading text-white tracking-tight leading-none group-hover:text-cyan-400 drop-shadow-md transition-colors">
             {multiSiteMode}
          </h4>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">{t("auto.CrossSiteOperat_2655") || "Cross-Site Operations"}</p>
        </div>
      </motion.div>

    </div>
  );
}
