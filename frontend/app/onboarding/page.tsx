"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import FeatureGrid from "@/components/Onboarding/FeatureGrid";
import RandyAssistant from "@/components/Onboarding/RandyAssistant";
import WhyLaminarMatters from "@/components/Onboarding/WhyLaminarMatters";
import OnboardingBackground from "@/components/Onboarding/OnboardingBackground";
import { ChevronRight, Cpu, Network, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function OnboardingPage() {
  const { t } = useTranslation();

  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const handleNext = () => {
    setStepIndex((prev) => prev + 1);
  };

  const handleFinish = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#00000a] text-slate-200 font-['General_Sans','Inter',sans-serif] relative overflow-x-hidden pt-12 pb-24 selection:bg-blue-500/30">

      {/* ── Animated Background ── */}
      <OnboardingBackground />

      {/* ── Decorative Glass Accents ── */}
      <div className="fixed top-0 left-[20%] w-[1px] h-full bg-gradient-to-b from-transparent via-blue-500/10 to-transparent z-[1] hidden lg:block" />
      <div className="fixed top-0 right-[35%] w-[1px] h-full bg-gradient-to-b from-transparent via-indigo-500/10 to-transparent z-[1] hidden lg:block" />
      
      {/* ── Top Scanning Bar ── */}
      <motion.div 
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 1.5, delay: 0.5 }}
        className="fixed top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500 to-transparent z-[50] origin-center"
      />

      {/* Main Container Layout */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 flex flex-col lg:flex-row gap-12 lg:gap-24">
        
        {/* LEFT STREAM - Content & Features */}
        <div className="flex-1 max-w-3xl pt-8 pb-32">
          
          {/* Welcome Text Section */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mb-16 relative"
          >
            {/* Decorative Corner */}
            <div className="absolute -top-4 -left-4 w-8 h-8 border-t-2 border-l-2 border-blue-500/30 rounded-tl-lg" />
            
            <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-blue-950/30 border border-blue-500/20 rounded-full text-blue-400 text-[0.7rem] font-bold uppercase tracking-[0.2em] mb-8 backdrop-blur-md">
              <Network size={12} className="animate-pulse" />
              {t("auto.LaminarProfileI_4332") || "Laminar Profile Initialization"}
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-8 leading-[0.9]">
              {t("auto.SYSTEM_1783") || "SYSTEM"} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-indigo-500 to-blue-700">
                {t("auto.AWARENESS_4468") || "AWARENESS"}
              </span>
            </h1>
            
            <p className="text-slate-400 text-base leading-relaxed max-w-2xl font-medium">
              We're initializing your tactical operator privileges. Gain full situational awareness through 
              AI-driven telemetry, predictive risk assessments, and zero-trust autonomous intervention capabilities
              across your entire infrastructure.
            </p>

            {/* Glowing Accent Strip */}
            <div className="mt-8 w-24 h-1 bg-gradient-to-r from-blue-500 to-transparent rounded-full" />
          </motion.div>

          {/* Content Sections with staggered entrance */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <FeatureGrid />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <WhyLaminarMatters />
          </motion.div>

          {/* Quick Buttons Footer */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-12 flex flex-wrap gap-6 items-center"
          >
            <div className="flex flex-col gap-4">
              <div className="p-[1px] bg-gradient-to-br from-blue-500/30 via-indigo-500/30 to-transparent rounded-2xl">
                 <button onClick={() => router.push("/cinematic")} className="flex items-center gap-4 px-10 py-5 bg-[#05050f]/90 hover:bg-[#08081a] rounded-[15px] transition-all group border border-white/5 shadow-2xl">
                   <span className="text-sm font-black text-white uppercase tracking-[0.15em]">{t("auto.InitializeCine_3582") || "Initialize Cinematic Vision"}</span>
                   <ChevronRight size={18} className="text-blue-400 group-hover:translate-x-1 transition-transform" />
                 </button>
              </div>
              <p className="text-[0.65rem] text-slate-500 font-bold uppercase tracking-[0.2em] ml-2">
                {t("auto.Viewbriefingon_9122") || "View immersive briefing on strategic operations and security protocols before entering the Command Center."}
              </p>
            </div>

            <div className="flex items-center gap-8 px-4 opacity-30 grayscale hover:opacity-100 hover:grayscale-0 transition-all cursor-default">
              <div className="flex items-center gap-2"><Cpu size={14} /> <span className="text-[0.6rem] font-bold uppercase tracking-widest">{t("auto.NeuralArch_2311") || "Neural Arch"}</span></div>
              <div className="flex items-center gap-2"><ShieldCheck size={14} /> <span className="text-[0.6rem] font-bold uppercase tracking-widest">{t("auto.SecureLink_9933") || "Secure Link"}</span></div>
            </div>
          </motion.div>

        </div>

        {/* RIGHT STREAM - Randy Assistant Panel */}
        <div className="w-full lg:w-[420px] shrink-0 pointer-events-auto relative">
          <div className="lg:sticky lg:top-12">
            <motion.div
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ duration: 0.8, delay: 0.4 }}
            >
              <RandyAssistant stepIndex={stepIndex} onNext={handleNext} onFinish={handleFinish} />
            </motion.div>
          </div>
        </div>

      </div>
    </div>
  );
}
