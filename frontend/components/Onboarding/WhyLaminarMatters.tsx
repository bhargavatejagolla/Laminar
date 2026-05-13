"use client";

import { motion } from "framer-motion";
import { ShieldAlert, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function WhyLaminarMatters() {
  const { t } = useTranslation();

  return (
    <div className="mt-16 mb-24">
      <div className="flex items-center gap-6 mb-12">
        <h2 className="text-[1.2rem] font-black tracking-[0.3em] text-white uppercase font-['General_Sans','Inter',sans-serif]">
          {t("auto.StrategicIntell_403") || "Strategic Intelligence"}
        </h2>
        <div className="flex-1 h-[1px] bg-gradient-to-r from-blue-500/30 via-indigo-500/10 to-transparent" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Safety Section */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="bg-[#0a050f]/60 border border-red-500/20 rounded-[2rem] overflow-hidden relative group backdrop-blur-xl"
        >
          {/* Subtle background glow */}
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-red-600/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-red-600/20 transition-all duration-700" />
          
          <div className="p-10 flex flex-col h-full z-10 relative">
            <div className="flex items-center gap-4 mb-6 text-blue-400">
              <div className="p-2 bg-blue-500/10 rounded-lg"><ShieldAlert size={24} /></div>
              <h3 className="uppercase tracking-[0.25em] font-black text-[0.75rem]">{t("auto.RiskIntelligenc_9503") || "Risk Intelligence"}</h3>
            </div>
            
            <p className="text-slate-300 text-[0.9rem] leading-relaxed mb-8 flex-1 font-medium">
              Crowd congestion can escalate within seconds. Laminar's predictive telemetry identifies instability markers before they reach critical thresholds.
            </p>
            
            <div className="w-full h-48 bg-[#050510] rounded-2xl border border-white/5 flex items-center justify-center overflow-hidden relative group-hover:border-blue-500/30 transition-all">
                <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1517457373958-b7bdd4587205?q=80&w=800&auto=format&fit=crop')] bg-cover bg-center grayscale contrast-125"></div>
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-blue-600/20 to-transparent" />
                <span className="absolute bottom-4 left-6 text-[0.6rem] uppercase tracking-[0.3em] text-blue-400 font-black z-10">{t("auto.NeuralHeatmapv2_3784") || "Neural Heatmap v2.4"}</span>
                <div className="w-4 h-4 rounded-full bg-blue-500 absolute top-4 right-4 animate-ping opacity-50" />
            </div>
          </div>
        </motion.div>

        {/* Business Section */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="bg-[#050a14]/60 border border-emerald-500/20 rounded-[2rem] overflow-hidden relative group backdrop-blur-xl"
        >
          {/* Subtle background glow */}
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-emerald-600/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-emerald-600/20 transition-all duration-700" />
          
          <div className="p-10 flex flex-col h-full z-10 relative">
            <div className="flex items-center gap-4 mb-6 text-indigo-400">
              <div className="p-2 bg-indigo-500/10 rounded-lg"><TrendingUp size={24} /></div>
              <h3 className="uppercase tracking-[0.25em] font-black text-[0.75rem]">{t("auto.OperationalEffi_6827") || "Operational Efficacy"}</h3>
            </div>
            
            <p className="text-slate-300 text-[0.9rem] leading-relaxed mb-8 flex-1 font-medium">
              Understanding operational flow helps optimize resource allocation, reduce subjects' wait times, and improve overall system throughput.
            </p>
            
            <div className="w-full h-48 bg-[#050510] rounded-2xl border border-white/5 flex items-center justify-center overflow-hidden relative group-hover:border-indigo-500/30 transition-all">
                <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1556740738-b6a63e27c4df?q=80&w=800&auto=format&fit=crop')] bg-cover bg-center grayscale hue-rotate-180"></div>
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-indigo-600/20 to-transparent" />
                <span className="absolute bottom-4 left-6 text-[0.6rem] uppercase tracking-[0.3em] text-indigo-400 font-black z-10">{t("auto.FlowAnalysisMod_9863") || "Flow Analysis Mode"}</span>
                <div className="w-4 h-4 rounded-full bg-indigo-500 absolute top-4 right-4 opacity-50" />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
