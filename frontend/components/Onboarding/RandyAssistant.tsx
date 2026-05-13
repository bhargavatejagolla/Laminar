"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/services/auth";
import { useTranslation } from "react-i18next";

// 3D AI Robot Avatar for Randy
function RandyAvatar() {
  const { t } = useTranslation();
return (
    <div className="relative flex items-center justify-center mx-auto mb-6" style={{ width: 120, height: 140 }}>

      {/* ── Ambient glow backdrop ── */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: -20,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(56,189,248,0.35) 0%, rgba(139,92,246,0.2) 50%, transparent 75%)",
          filter: "blur(18px)",
        }}
      />

      {/* ── Outer orbit ring (tilted, rotating) ── */}
      <motion.div
        animate={{ rotateZ: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          width: 130, height: 130,
          borderRadius: "50%",
          border: "1.5px solid rgba(56,189,248,0.35)",
          boxShadow: "0 0 8px rgba(56,189,248,0.25)",
          transform: "rotateX(70deg)",
        }}
      >
        {/* Orbit dot */}
        <div style={{
          position: "absolute", top: -4, left: "50%", marginLeft: -4,
          width: 8, height: 8, borderRadius: "50%",
          background: "radial-gradient(circle, #38bdf8, #7c3aed)",
          boxShadow: "0 0 10px 3px rgba(56,189,248,0.8)",
        }} />
      </motion.div>

      {/* ── Inner counter-orbit ring ── */}
      <motion.div
        animate={{ rotateZ: -360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          width: 100, height: 100,
          borderRadius: "50%",
          border: "1px solid rgba(139,92,246,0.45)",
          transform: "rotateX(70deg)",
        }}
      >
        <div style={{
          position: "absolute", bottom: -3, left: "50%", marginLeft: -3,
          width: 6, height: 6, borderRadius: "50%",
          background: "radial-gradient(circle, #c084fc, #38bdf8)",
          boxShadow: "0 0 8px 2px rgba(192,132,252,0.8)",
        }} />
      </motion.div>

      {/* ── Robot Head Shell ── */}
      <div style={{
        position: "relative",
        width: 78, height: 88,
        borderRadius: "16px 16px 12px 12px",
        background: "linear-gradient(160deg, #1e3a5f 0%, #0f1f38 40%, #060d1f 100%)",
        boxShadow: `
          0 0 0 1.5px rgba(56,189,248,0.3),
          0 4px 30px rgba(0,0,0,0.8),
          inset 0 1px 0 rgba(255,255,255,0.12),
          inset 0 -2px 4px rgba(0,0,0,0.6),
          0 0 40px rgba(56,189,248,0.15)
        `,
        overflow: "hidden",
      }}>

        {/* Head top chrome ridge */}
        <div style={{
          position: "absolute", top: 0, left: 6, right: 6, height: 6,
          background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.6), rgba(139,92,246,0.6), transparent)",
          borderRadius: "0 0 4px 4px",
          filter: "blur(1px)",
        }} />

        {/* Metallic face plate highlight */}
        <div style={{
          position: "absolute", top: 8, left: 8, right: 8, bottom: 8,
          borderRadius: "10px 10px 8px 8px",
          background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, transparent 50%, rgba(0,0,0,0.3) 100%)",
        }} />

        {/* Scanline overlay */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(56,189,248,0.03) 3px, rgba(56,189,248,0.03) 4px)",
          borderRadius: "inherit",
        }} />

        {/* ── Eyes Section ── */}
        <div style={{ position: "absolute", top: 22, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16 }}>
          {/* Left Eye */}
          <motion.div
            animate={{ opacity: [1, 0.4, 1], scale: [1, 0.85, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            style={{
              width: 18, height: 10,
              borderRadius: 4,
              background: "linear-gradient(135deg, #67e8f9 0%, #38bdf8 40%, #0ea5e9 100%)",
              boxShadow: "0 0 12px 4px rgba(56,189,248,0.9), 0 0 3px rgba(255,255,255,0.6)",
              position: "relative", overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: 2, left: 3, width: 5, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.6)" }} />
          </motion.div>
          {/* Right Eye */}
          <motion.div
            animate={{ opacity: [1, 0.4, 1], scale: [1, 0.85, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            style={{
              width: 18, height: 10,
              borderRadius: 4,
              background: "linear-gradient(135deg, #67e8f9 0%, #38bdf8 40%, #0ea5e9 100%)",
              boxShadow: "0 0 12px 4px rgba(56,189,248,0.9), 0 0 3px rgba(255,255,255,0.6)",
              position: "relative", overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: 2, left: 3, width: 5, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.6)" }} />
          </motion.div>
        </div>

        {/* ── Nose / Sensor dot ── */}
        <div style={{
          position: "absolute", top: 42, left: "50%", marginLeft: -3,
          width: 6, height: 6, borderRadius: "50%",
          background: "radial-gradient(circle, #818cf8, #4f46e5)",
          boxShadow: "0 0 6px 2px rgba(129,140,248,0.7)",
        }} />

        {/* ── Mouth / Speaker grille ── */}
        <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 3 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              animate={{ scaleY: [0.5, 1.4, 0.5] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }}
              style={{
                width: 3, height: 10,
                borderRadius: 2,
                background: "linear-gradient(to top, #38bdf8, rgba(56,189,248,0.3))",
                transformOrigin: "bottom",
                boxShadow: "0 0 4px rgba(56,189,248,0.5)",
              }}
            />
          ))}
        </div>

        {/* ── Side panel accent lines ── */}
        <div style={{ position: "absolute", left: 4, top: 16, width: 2, height: 40, borderRadius: 1, background: "linear-gradient(to bottom, rgba(56,189,248,0.6), transparent)" }} />
        <div style={{ position: "absolute", right: 4, top: 16, width: 2, height: 40, borderRadius: 1, background: "linear-gradient(to bottom, rgba(139,92,246,0.6), transparent)" }} />

      </div>

      {/* ── Neck / Shoulder base ── */}
      <div style={{
        position: "absolute",
        bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: 50, height: 12,
        borderRadius: "0 0 8px 8px",
        background: "linear-gradient(180deg, #0f1f38, #060d1f)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(56,189,248,0.2)",
      }} />
    </div>
  );
}

export type RandyStep = {
  id: number;
  message: string | React.ReactNode;
};

export default function RandyAssistant({ stepIndex, onNext, onFinish }: { stepIndex: number, onNext: () => void, onFinish: () => void }) {
  const { t } = useTranslation();
  const [userName, setUserName] = useState<string>("there");

  const steps: RandyStep[] = [
    {
      id: 0,
      message: (
        <>
          <p className="mb-3 font-semibold text-slate-100">Hey Bhargava 👋</p>
          <p className="mb-3">I’m <strong>{t("auto.Randy_1155") || "Randy"}</strong>, your system guide. I’ll help you understand how Laminar works and where to start.</p>
          <p>{t("auto.Laminarletsyoum_8868") || "Laminar lets you monitor live activity, predict crowd risks, and take action before situations escalate."}</p>
        </>
      ),
    },
    {
      id: 1,
      message: (
        <>
          <p className="mb-3 font-semibold text-slate-100">{t("auto.OverviewPanel_485") || "Overview Panel."}</p>
          <p>{t("auto.Ontheleftyoucan_8735") || "On the left, you can see the main sections of Laminar."}</p>
          <p>{t("auto.From_6593") || "From"} <strong>{t("auto.Monitoring_3070") || "Monitoring"}</strong> {t("auto.livefeedstoproc_920") || "live feeds to processing"} <strong>{t("auto.SurgeAlerts_933") || "Surge Alerts"}</strong> {t("auto.andtrackingindi_4526") || "and tracking individuals using our"} <strong>{t("auto.ReID_6793") || "Re-ID"}</strong> {t("auto.engine_3206") || "engine."}</p>
        </>
      ),
    },
    {
      id: 2,
      message: (
        <>
          <p className="mb-3 font-semibold text-slate-100">To get started, add a camera source:</p>
          <ol className="list-decimal pl-4 space-y-2 text-slate-300">
            <li>Select camera type (RTSP / Webcam / HTTP)</li>
            <li>{t("auto.EnterstreamURLo_7752") || "Enter stream URL or device source"}</li>
            <li>{t("auto.ConfigureFPSand_975") || "Configure FPS and resolution"}</li>
            <li>{t("auto.Click_1512") || "Click"} <strong className="text-blue-400">{t("auto.Connect_5883") || "Connect"}</strong> {t("auto.tostartmonitori_5551") || "to start monitoring"}</li>
          </ol>
        </>
      ),
    },
    {
      id: 3,
      message: (
        <>
          <p className="mb-3 font-semibold text-slate-100">You’re all set.</p>
          <p>Start with Monitoring to see live activity instantly. I’ll be here if you need help understanding anything.</p>
        </>
      ),
    }
  ];

  const currentStep = steps[stepIndex] || steps[steps.length - 1];
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    getMe().then((user) => {
      if (!user) return;
      const name = user.full_name || user.name;
      if (name) {
        setUserName(name.split(" ")[0]); // Use first name only
      } else if (user.email) {
        setUserName(user.email.split("@")[0]); // Fallback: email prefix
      }
    });
  }, []);

  // Build greeting with real name
  const greetingStep = {
    ...steps[0],
    message: (
      <>
        <p className="mb-3 font-semibold text-slate-100">Hey {userName} 👋</p>
        <p className="mb-3">I'm <strong>{t("auto.Randy_1155") || "Randy"}</strong>, your system guide. I'll help you understand how Laminar works and where to start.</p>
        <p>{t("auto.Laminarletsyoum_8868") || "Laminar lets you monitor live activity, predict crowd risks, and take action before situations escalate."}</p>
      </>
    ),
  };
  const allSteps = [greetingStep, ...steps.slice(1)];
  const activeStep = allSteps[stepIndex] || allSteps[allSteps.length - 1];


  return (
    <div className="sticky top-24 w-full max-w-sm ml-auto bg-[rgba(6,9,24,0.7)] border border-[rgba(80,140,255,0.15)] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl p-6 md:p-8 flex flex-col">
      <RandyAvatar />
      
      <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 mb-6 text-[0.8rem] text-slate-300 leading-relaxed shadow-inner">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
          >
            {activeStep.message}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-auto flex justify-end">
        {!isLast ? (
          <button
            onClick={onNext}
            className="flex items-center gap-2 bg-[rgba(80,140,255,0.1)] hover:bg-[rgba(80,140,255,0.2)] border border-[rgba(80,140,255,0.3)] text-blue-400 px-5 py-2.5 rounded-full text-[0.75rem] font-bold uppercase tracking-wider transition-all"
          >
            {t("auto.Next_2698") || "Next"} <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={onFinish}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-6 py-2.5 rounded-full text-[0.75rem] font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(80,140,255,0.4)] transition-all"
          >
            {t("auto.GotoDashboard_562") || "Go to Dashboard"} <CheckCircle size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
