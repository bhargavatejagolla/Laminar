"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import CinematicVideoPlayer from "@/components/Onboarding/CinematicVideoPlayer";
import { ChevronRight, ShieldAlert, Target } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function CinematicPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isComplete, setIsComplete] = useState(false);

  const videos = [
    "/images/video-1055635440974647.mp4",
    "/images/video-1055635444307980.mp4",
    "/images/video-1055635447641313.mp4",
    "/images/video-1055646264306898.mp4",
  ];

  const handleFinish = () => {
    router.push("/dashboard");
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black flex items-center justify-center">
      <CinematicVideoPlayer 
        videos={videos} 
        onComplete={() => setIsComplete(true)} 
      />

      {/* Top Banner Overlay */}
      <div className="fixed top-0 left-0 w-full p-8 z-50 flex justify-between items-start pointer-events-none">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col gap-1"
        >
          <div className="flex items-center gap-2 text-blue-500 font-bold text-xs uppercase tracking-[0.3em]">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            {t("auto.Classified_1234") || "Classified Intelligence"}
          </div>
          <div className="text-white/40 text-[0.6rem] font-mono uppercase tracking-widest">
            {t("auto.OperationalP_5678") || "Operational Protocol: LAMINAR-VISION-X"}
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          whileHover={{ opacity: 1 }}
          onClick={handleFinish}
          className="pointer-events-auto text-white/30 hover:text-white text-[0.6rem] font-bold uppercase tracking-[0.2em] transition-all border-b border-white/10 pb-1"
        >
          {t("auto.SkipBriefing_9999") || "Skip Briefing"}
        </motion.button>
      </div>

      {/* Center Overlay when complete or near end */}
      <AnimatePresence>
        {isComplete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="max-w-md w-full p-10 bg-zinc-950/80 border border-white/5 rounded-[32px] text-center shadow-2xl relative overflow-hidden">
               {/* Background Glow */}
               <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 blur-[80px]" />
               <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 blur-[80px]" />

               <motion.div
                 initial={{ y: 20, opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 transition={{ delay: 0.2 }}
               >
                 <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-8">
                    <Target className="text-blue-500" size={32} />
                 </div>
                 
                 <h2 className="text-3xl font-black text-white tracking-tighter mb-4 uppercase">
                   {t("auto.MissionReady_2211") || "Mission Ready"}
                 </h2>
                 
                 <p className="text-zinc-500 text-sm font-medium mb-10 leading-relaxed">
                   {t("auto.OperationalA_3344") || "Operational awareness synchronized. Your operator credentials have been validated for level-4 access."}
                 </p>

                 <button
                   onClick={handleFinish}
                   className="w-full flex items-center justify-center gap-3 py-5 bg-white text-black hover:bg-zinc-200 transition-all rounded-2xl font-black text-xs uppercase tracking-[0.2em]"
                 >
                   {t("auto.EnterCommandCen_8017") || "Enter Command Center"}
                   <ChevronRight size={16} />
                 </button>
               </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        body {
          background: black !important;
        }
      `}</style>
    </main>
  );
}
