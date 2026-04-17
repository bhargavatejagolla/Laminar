"use client";

import { useState } from "react";
import { useCameras } from "@/hooks/useCameras";
import { Video, Activity, Search, Filter, Plus, ShieldCheck } from "lucide-react";
import CameraGrid from "@/components/cameras/camera-grid";
import CameraStats from "@/components/cameras/camera-stats";
import AddCameraModal from "@/components/venues/add-camera-modal";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";

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

export default function CamerasPage() {
  const { data: cameras, isLoading } = useCameras();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();

  const safeCameras = Array.isArray(cameras) ? cameras : [];
  const filteredCameras = safeCameras.filter((c: any) => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 relative overflow-hidden">
      
      {/* Background Matrix Effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.015)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none -z-10 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_0%,#000_80%,transparent_100%)]"></div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10 mt-2">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-cyan-950/40 backdrop-blur-md border border-cyan-500/30 rounded-2xl flex-shrink-0 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
              <Video className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
               <h1 className="text-3xl font-black tracking-[0.1em] text-white font-heading uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                 {t("cameras.title") || "Camera Network"}
               </h1>
               <p className="text-sm font-bold text-slate-400 mt-1 tracking-widest uppercase">
                 {t("cameras.subtitle") || "Distributed Surveillance Nodes"}
               </p>
            </div>
          </div>

          {/* Global Toolbar */}
          <div className="flex items-center gap-3">
             <div className="relative group">
               <div className="absolute inset-0 bg-cyan-500/0 rounded-xl blur transition-colors group-focus-within:bg-cyan-500/20"></div>
               <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-cyan-400 transition-colors z-10" />
               <input 
                 type="text" 
                 placeholder={t("cameras.searchPlaceholder") || "Search network nodes..."} 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="relative z-10 bg-black/50 border border-white/10 text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-cyan-500/50 transition-colors w-64 text-slate-200 placeholder:text-slate-600 font-mono focus:bg-cyan-950/20"
               />
             </div>
             
             <button className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border border-white/10 bg-black/50 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors whitespace-nowrap shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">
               <Filter className="w-4 h-4" /> {t("cameras.filter") || "Filter"}
             </button>
             
             {isAdmin && (
             <button 
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-black uppercase tracking-wider rounded-xl bg-cyan-500 text-black hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)]"
             >
                <Plus className="w-4 h-4" /> {t("cameras.addNode") || "Add Node"}
             </button>
             )}
          </div>
        </motion.div>

        {/* Network Stats */}
        <motion.div variants={itemVariants}>
          <CameraStats cameras={cameras || []} isLoading={isLoading} />
        </motion.div>

        {/* Camera Grid Structure */}
        <motion.div variants={itemVariants} className="mt-8 glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
           <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
           
           <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
             <h2 className="text-lg font-bold tracking-widest uppercase flex items-center gap-3 shadow-cyan-400 drop-shadow-md">
                <ShieldCheck className="w-5 h-5 text-cyan-500" /> {t("cameras.videoIngestionNodes") || "Ingestion Nodes"}
             </h2>
             <span className="text-xs font-mono bg-black/50 border border-white/10 text-cyan-400 px-3 py-1.5 rounded-lg tracking-widest uppercase shadow-[inset_0_0_10px_rgba(34,211,238,0.1)]">
                {filteredCameras.length} Node{filteredCameras.length !== 1 ? t("cameras.nodesFound") : t("cameras.nodeFound")}
             </span>
           </div>
           
           <CameraGrid cameras={filteredCameras} isLoading={isLoading} />
        </motion.div>
      </motion.div>

      <AddCameraModal 
         isOpen={isAddModalOpen} 
         onClose={() => setIsAddModalOpen(false)} 
      />

    </div>
  );
}
