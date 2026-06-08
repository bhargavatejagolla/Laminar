"use client";

import { useState, useEffect } from "react";
import { BrainCircuit, MapPin, Activity, ShieldCheck, CloudLightning, Calendar, PartyPopper, ChevronDown, ChevronLeft, Target, Zap } from "lucide-react";
import AnalyticsCharts from "@/components/reports/analytics-charts";
import { useVenues } from "@/hooks/useVenues";
import { usePrediction } from "@/hooks/usePrediction";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

const Tooltip = ({ children, label }: { children: React.ReactNode; label: string }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute z-[100] w-64 p-3 mb-2 bottom-full left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl pointer-events-none"
          >
            <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">{t("auto.IntelligenceIns_4334") || "Intelligence Insight"}</p>
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">{label}</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-white/10"></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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

const AIRecommendationPanel = ({ venue, predictionData }: { venue: any, predictionData: any }) => {
  const { t } = useTranslation();
  const [actions, setActions] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    setTimeStr(new Date().toLocaleTimeString());
    const interval = setInterval(() => setTimeStr(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!venue) return;

    // Rule-Based Logic Translation
    const newActions: string[] = [];
    const capacity = Math.max(venue.capacity || 100, 1);
    const density = (venue.current_occupancy || 0) / capacity;
    const risk = venue.current_risk || 0;

    // Extrapolate
    const flow = (venue.avg_velocity || 0) * 0.5;
    const proj15 = (venue.current_occupancy || 0) + (flow * 15);
    const proj15Density = proj15 / capacity;

    if (density > 0.8) {
      newActions.push("Open Alternate Exit Routes");
      newActions.push("Reduce Incoming Flow Rate");
    } else if (density > 0.6) {
      newActions.push("Prepare Secondary Ingress Channels");
    }

    if (risk >= 75) {
      newActions.push("Notify Tactical Response Teams");
      newActions.push("Escalate Threat Level in C2");
    }

    if (proj15Density > 0.75) {
      newActions.push("Activate Public Audio Guidance");
      newActions.push("Redirect Crowd Flow to Zone B");
    }

    if (newActions.length === 0) {
      newActions.push("Maintain Standard Monitoring Protocol");
    }

    setActions(newActions);
    setVisibleCount(0); // reset typewriter
  }, [venue, predictionData]);

  // Typewriter effect
  useEffect(() => {
    if (visibleCount < actions.length) {
      const timer = setTimeout(() => {
        setVisibleCount(prev => prev + 1);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, actions]);

  const severity = actions.some(a => a.includes("Escalate") || a.includes("Alternate")) ? "HIGH" : actions.some(a => a.includes("Prepare") || a.includes("Audio")) ? "ELEVATED" : "STANDARD";
  const glow = severity === "HIGH" ? "shadow-[0_0_30px_rgba(244,63,94,0.15)] border-rose-500/30" : severity === "ELEVATED" ? "shadow-[0_0_30px_rgba(245,158,11,0.15)] border-amber-500/30" : "shadow-[0_0_30px_rgba(16,185,129,0.15)] border-emerald-500/30";
  const badgeColor = severity === "HIGH" ? "bg-rose-500 text-white" : severity === "ELEVATED" ? "bg-amber-500 text-black" : "bg-emerald-500 text-black";

  return (
    <div className={`p-6 rounded-[2rem] glass-panel relative overflow-hidden transition-all duration-500 ${glow}`}>
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-sm ${badgeColor}`}>
              [{severity} PRIORITY]
            </span>
          </div>
          <p className="text-xl font-black text-white tracking-widest uppercase drop-shadow-md">
            {t("auto.Operational_6743") || "Operational"}<br />{t("auto.Protocol_4669") || "Protocol"}
          </p>
        </div>
        <div className="text-right">
          <span className="block text-[8px] uppercase font-black tracking-widest text-slate-500 mb-0.5">{t("auto.Time_3110") || "Time"}</span>
          <span className="text-xs font-mono font-black text-indigo-300">{timeStr}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
        <Zap className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-indigo-400">
          {t("auto.AIRecommendatio_2259") || "AI Recommendation"}
        </span>
      </div>

      <div className="bg-black/50 backdrop-blur-sm rounded-xl p-5 border border-white/5 font-mono space-y-3.5 min-h-[140px] shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
        {actions.map((action, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 transition-all duration-300 ${idx < visibleCount ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
          >
            <span className="text-emerald-400 mt-0.5 text-sm drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">✓</span>
            <span className={`text-[11px] uppercase font-bold tracking-wider leading-relaxed ${idx < visibleCount ? "text-slate-200" : "text-transparent"}`}>
              {action}
            </span>
          </div>
        ))}
        {visibleCount < actions.length && (
          <div className="flex items-center gap-3 opacity-80 pt-1">
            <span className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin mt-0.5"></span>
            <span className="text-[10px] uppercase font-black text-indigo-400 tracking-widest animate-pulse">{t("auto.Computing_3394") || "Computing..."}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default function PredictionPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const [selectedVenueId, setSelectedVenueId] = useState("");

  const { data: predictionData, isLoading: predictionLoading } = usePrediction(selectedVenueId);

  return (
    <div className="min-h-screen bg-[#020617] text-white pb-12 relative overflow-hidden font-sans">

      {/* Immersive Glassmorphism Background Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-indigo-900/10 rounded-full blur-[150px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[1000px] h-[1000px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-900/5 rounded-full blur-[150px] pointer-events-none -z-10"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none -z-10 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_80%,transparent_100%)]"></div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full px-6 xl:px-12 mx-auto pt-6"
      >
        {/* Navigation Bar */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.back()}
            className="group flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-400/30 transition-all backdrop-blur-md shadow-[0_0_20px_rgba(255,255,255,0.02)] hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]"
          >
            <div className="p-1 rounded-full bg-white/10 group-hover:bg-indigo-500/20 text-slate-400 group-hover:text-indigo-400 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 group-hover:text-white transition-colors">{t("auto.ReturntoHub_2354") || "Return to Hub"}</span>
          </button>
        </motion.div>

        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col mb-10">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-indigo-950/40 backdrop-blur-md border border-indigo-500/30 rounded-2xl flex-shrink-0 shadow-[0_0_30px_rgba(99,102,241,0.15)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <BrainCircuit className="w-8 h-8 text-indigo-400 relative z-10" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-[0.1em] text-white flex items-center gap-4 font-heading uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                {t("auto.PredictionEngin_7492") || "Prediction Engine"}
                <span className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-[10px] font-black uppercase tracking-[0.2em] shadow-[inset_0_0_10px_rgba(99,102,241,0.1)] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
                  {t("auto.LIVESYNTHETICFO_7775") || "LIVE SYNTHETIC FORECAST"}
                </span>
              </h1>
              <div className="flex items-center gap-6 mt-2">
                <p className="text-sm font-bold text-indigo-200/60 tracking-widest uppercase">
                  {t("auto.NeuralTrajector_4361") || "Neural Trajectory Extrapolation & Live Telemetry"}
                </p>
                <div className="flex gap-4">
                  <Tooltip label={t("auto.ESAExponentialS_2106") || "ESA: Exponential Smoothing Algorithm. Prioritizes recent data surges for immediate reaction."}>
                    <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black text-indigo-400/80 cursor-help hover:bg-indigo-500/10 transition-colors uppercase tracking-tighter">{t("auto.EMANative_8962") || "EMA-Native"}</span>
                  </Tooltip>
                  <Tooltip label={t("auto.ARIMAAutoregres_2530") || "ARIMA: Autoregressive Integrated Moving Average. Models underlying momentum cycles and seasonality."}>
                    <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black text-cyan-400/80 cursor-help hover:bg-cyan-500/10 transition-colors uppercase tracking-tighter">{t("auto.AR1Enabled_946") || "AR1-Enabled"}</span>
                  </Tooltip>
                  <Tooltip label={t("auto.TRAJECTORYMLbas_3230") || "TRAJECTORY: ML-based future state projection considering regional events and temporal shifts."}>
                    <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black text-slate-400/80 cursor-help hover:bg-white/10 transition-colors uppercase tracking-tighter">{t("auto.NeuralProj_4950") || "Neural-Proj"}</span>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Matrix Selection & Context */}
        <motion.div variants={itemVariants} className="glass-panel border-t border-indigo-500/20 border-x border-b border-white/5 rounded-[2rem] p-8 lg:p-10 mb-10 relative overflow-hidden group">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
          <div className="absolute -inset-[100%] bg-[conic-gradient(from_90deg_at_50%_50%,rgba(99,102,241,0)_0%,rgba(99,102,241,0.05)_50%,rgba(99,102,241,0)_100%)] rotate-180 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 -z-10"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">

            {/* Left side selector */}
            <div className="space-y-6 flex flex-col justify-center">
              <h2 className="text-2xl font-black text-white flex items-center gap-4 tracking-widest uppercase shadow-indigo-400 drop-shadow-md">
                <MapPin className="w-6 h-6 text-indigo-400" /> {t("auto.TargetSubMatrix_4456") || "Target Sub-Matrix"}
              </h2>
              <p className="text-xs text-slate-400 font-mono leading-relaxed max-w-lg opacity-80">
                {t("auto.Bindcoordinaten_6023") || "Bind coordinate node to the Live Prediction Core. The ML subsystem synchronizes active spatial feeds and projects high-fidelity trajectory models."}
              </p>

              <div className="relative group/select w-full max-w-md">
                <div className="absolute inset-0 bg-indigo-500/20 blur-md rounded-2xl transition-all group-focus-within/select:bg-indigo-500/30 group-focus-within/select:blur-xl"></div>
                <select
                  value={selectedVenueId}
                  onChange={(e) => setSelectedVenueId(e.target.value)}
                  className="w-full relative z-10 bg-black/60 border border-white/10 text-sm font-mono tracking-widest rounded-2xl pl-6 pr-12 py-5 text-white focus:outline-none focus:border-indigo-400/60 appearance-none shadow-[inset_0_0_20px_rgba(255,255,255,0.03)] transition-all uppercase hover:border-white/20 hover:bg-white/10 cursor-pointer backdrop-blur-md"
                >
                  <option value="" disabled className="bg-[#050505] text-slate-500">{t("auto.InitializeTarge_307") || "Initialize Target Node..."}</option>
                  {Array.isArray(venues) && venues.map(v => (
                    <option key={v.id} value={v.id} className="bg-[#050505]">{v.name}</option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none z-10 bg-indigo-500/20 p-1.5 rounded-lg border border-indigo-500/30 group-hover/select:border-indigo-400/50 transition-colors">
                  <ChevronDown className="w-4 h-4 text-indigo-300 transition-transform duration-300 group-focus-within/select:-rotate-180" />
                </div>
              </div>
            </div>

            {/* Right side context */}
            <div className="relative overflow-hidden bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/5 p-8 rounded-3xl flex flex-col justify-center shadow-[inset_0_0_50px_rgba(99,102,241,0.05)]">
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(99,102,241,0.03)_25%,rgba(99,102,241,0.03)_50%,transparent_50%,transparent_75%,rgba(99,102,241,0.03)_75%,rgba(99,102,241,0.03)_100%)] bg-[length:20px_20px]"></div>
              <div className="flex justify-between items-center mb-6 relative z-10 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3 text-indigo-400 text-sm tracking-widest uppercase font-black drop-shadow-md">
                  <ShieldCheck className="w-5 h-5 text-indigo-300" />
                  {t("auto.NeuralInsights_7372") || "Neural Insights"}
                </div>
                {predictionData?.confidence ? (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.3)] tracking-[0.2em] uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                    {Math.round(predictionData.confidence * 100)}% Match
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-slate-800/50 text-slate-400 border border-white/5 tracking-[0.2em] uppercase flex items-center gap-2">
                    <CloudLightning className="w-3 h-3 text-slate-500" /> {t("auto.AwaitingTelemet_9207") || "Awaiting Telemetry"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400/90 leading-relaxed font-mono relative z-10 text-justify">
                {predictionData?.forecast_explanation || "Laminar Intelligence Protocol active. Calibrating sector trajectory models..."}
              </p>
              {/* Geo-Coordinates Panel */}
              <AnimatePresence mode="popLayout">
                {selectedVenueId && Array.isArray(venues) && venues.find(v => v.id === selectedVenueId) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="relative z-10 flex gap-4 mt-6 pt-6 border-t border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">{t("auto.GeoCoordinates_3069") || "Geo-Coordinates"}</span>
                        <span className="text-xs font-mono font-bold text-cyan-300 tracking-wider">
                          {venues.find(v => v.id === selectedVenueId)?.latitude?.toFixed(5) || 'UNKNOWN'}, {venues.find(v => v.id === selectedVenueId)?.longitude?.toFixed(5) || 'UNKNOWN'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </motion.div>

        <AnimatePresence mode="popLayout">
          {selectedVenueId && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10"
            >
              {/* Context Card 1 */}
              <div className="glass-panel border-t-cyan-500/50 border-l border-b border-r border-white/5 rounded-3xl p-6 lg:p-8 flex items-center gap-6 hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden bg-gradient-to-br from-black/60 to-cyan-950/10 shadow-[inset_0_0_30px_rgba(34,211,238,0.03)] hover:shadow-[0_15px_40px_rgba(34,211,238,0.15)]">
                <div className="absolute inset-0 bg-cyan-500/0 group-hover:bg-cyan-500/5 transition-colors duration-500"></div>
                <div className="p-4 bg-cyan-950/40 backdrop-blur-md border border-cyan-500/30 text-cyan-400 rounded-2xl shrink-0 shadow-[0_0_20px_rgba(34,211,238,0.2)] relative z-10">
                  <CloudLightning className="w-7 h-7" />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] text-cyan-200/50 uppercase tracking-[0.25em] font-black">{t("auto.AtmosphericMod_2486") || "Atmospheric Mod"}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <h4 className="text-xl font-black text-white uppercase tracking-wider drop-shadow-sm">
                      {predictionData?.weather_context?.condition
                        ? predictionData.weather_context.condition.replace(/_/g, ' ')
                        : 'Atmospheric Stability'}
                    </h4>
                    {predictionData?.weather_context?.temperature !== undefined && (
                      <span className="text-xs font-black text-white bg-cyan-500/30 px-2.5 py-1 rounded-lg border border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                        {predictionData.weather_context.temperature.toFixed(1)}°C
                      </span>
                    )}
                    {predictionData && !predictionData.weather_context && (
                      <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20 uppercase tracking-widest">
                        {t("auto.SystemCalibrate_9999") || "System Calibrated"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Context Card 2 */}
              <div className="glass-panel border-t-indigo-500/50 border-l border-b border-r border-white/5 rounded-3xl p-6 lg:p-8 flex items-center gap-6 hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden bg-gradient-to-br from-black/60 to-indigo-950/10 shadow-[inset_0_0_30px_rgba(99,102,241,0.03)] hover:shadow-[0_15px_40px_rgba(99,102,241,0.15)]">
                <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/5 transition-colors duration-500"></div>
                <div className="p-4 bg-indigo-950/40 backdrop-blur-md border border-indigo-500/30 text-indigo-400 rounded-2xl shrink-0 shadow-[0_0_20px_rgba(99,102,241,0.2)] relative z-10">
                  <Calendar className="w-7 h-7" />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] text-indigo-200/50 uppercase tracking-[0.25em] font-black">{t("auto.TemporalShift_4406") || "Temporal Shift"}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <h4 className="text-xl font-black text-white uppercase tracking-wider truncate max-w-[150px] drop-shadow-sm">
                      {predictionData?.holiday_context?.name || 'Standard'}
                    </h4>
                    {predictionData?.holiday_context && (
                      <span className="text-[10px] uppercase tracking-widest font-black text-white bg-indigo-500/30 px-2.5 py-1 rounded-lg border border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                        {predictionData.holiday_context.type}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Context Card 3 */}
              <div className="glass-panel border-t-emerald-500/50 border-l border-b border-r border-white/5 rounded-3xl p-6 lg:p-8 flex items-center gap-6 hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden bg-gradient-to-br from-black/60 to-emerald-950/10 shadow-[inset_0_0_30px_rgba(16,185,129,0.03)] hover:shadow-[0_15px_40px_rgba(16,185,129,0.15)]">
                <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors duration-500"></div>
                <div className="p-4 bg-emerald-950/40 backdrop-blur-md border border-emerald-500/30 text-emerald-400 rounded-2xl shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.2)] relative z-10">
                  <PartyPopper className="w-7 h-7" />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] text-emerald-200/50 uppercase tracking-[0.25em] font-black">{t("auto.RegionalEvents_6523") || "Regional Events"}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <h4 className="text-xl font-black text-white uppercase tracking-wider drop-shadow-sm">
                      {predictionData?.event_type || 'Isolated'}
                    </h4>
                    {predictionData?.event_type && (
                      <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                        + Flow Modifiers
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {selectedVenueId && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-12 mt-6"
            >
              <div className="flex items-center gap-4 mb-6">
                <Target className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-black text-white uppercase tracking-widest drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                  {t("auto.LiveProjectionT_4414") || "Live Projection Timeline"}
                </h3>
                <div className="flex-1 h-[1px] bg-gradient-to-r from-indigo-500/40 to-transparent"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[5, 15, 30].map(mins => {
                  const venue = Array.isArray(venues) ? venues.find((v: any) => v.id === selectedVenueId) : null;
                  const cap = Math.max(venue?.capacity || 100, 1);
                  const current = venue?.current_occupancy || 0;

                  // Extrapolate accurately using live entry/exit bounds or straight from timeline projections
                  let pCount = current;
                  if (predictionData?.forecast_curve && predictionData.forecast_curve.length > 0) {
                    const curve = predictionData.forecast_curve;
                    const initialScore = curve[0];
                    let projectedScore = curve[Math.min(mins - 1, curve.length - 1)];

                    // Linear Extrapolation for points beyond the curve's horizon
                    if (mins > curve.length) {
                        const diff = curve[curve.length - 1] - curve[0];
                        projectedScore += diff * ((mins - curve.length) / curve.length);
                    }

                    // Delta in occupancy correlates to delta in risk score
                    const scoreDiff = (projectedScore - initialScore) / Math.max(100, initialScore || 1);
                    pCount = Math.floor(Math.max(current, current + (scoreDiff * cap * 0.5)));
                  } else {
                    // Fallback using realistic dampen factor based on velocity
                    const baseVelocity = ((venue as any)?.avg_velocity || 0);
                    // Damped significantly to prevent massive surges
                    const flowFactor = (baseVelocity * 0.002) * Math.max(1, cap / 100); 
                    pCount = Math.floor(current + (flowFactor * mins));
                  }

                  // Retain absolute realism boundaries (can't magically triple capacity in 5 mins unless extremely critical)
                  const maxAllowedGrowth = cap * 0.4 * (mins / 5);
                  if (pCount > current + maxAllowedGrowth) {
                     pCount = Math.floor(current + maxAllowedGrowth);
                  }

                  const hash = venue?.id ? venue.id.charCodeAt(0) : 0;
                  pCount = Math.floor(Math.max(current, pCount + (hash % 3)));

                  const density = pCount / cap;
                  let label = "Stable Crowd";
                  let colorName = "emerald";

                  if (density > 0.85) {
                    label = "Critical Bottleneck";
                    colorName = "rose";
                  } else if (density > 0.6) {
                    label = "Congestion Risk";
                    colorName = "amber";
                  } else if (density > 0.4) {
                    label = "Moderate Crowd";
                    colorName = "indigo";
                  }

                  const colorClass = colorName === 'rose' ? 'text-rose-400' : colorName === 'amber' ? 'text-amber-400' : colorName === 'indigo' ? 'text-indigo-400' : 'text-emerald-400';
                  const bgClass = colorName === 'rose' ? 'bg-rose-500/10 border-rose-500/30' : colorName === 'amber' ? 'bg-amber-500/10 border-amber-500/30' : colorName === 'indigo' ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-emerald-500/10 border-emerald-500/30';
                  const glowClass = colorName === 'rose' ? 'shadow-[0_0_20px_rgba(244,63,94,0.15)] hover:shadow-[0_0_30px_rgba(244,63,94,0.3)]' : colorName === 'amber' ? 'shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:shadow-[0_0_30px_rgba(245,158,11,0.3)]' : colorName === 'indigo' ? 'shadow-[0_0_20px_rgba(99,102,241,0.15)] hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]' : 'shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]';

                  return (
                    <div key={mins} className={`glass-panel border-l-[3px] rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 ${bgClass} ${glowClass}`}>
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-2xl font-black text-white font-mono tracking-tighter">+{mins} <span className="text-sm text-slate-400 font-sans tracking-widest pl-1">{t("auto.MINS_3777") || "MINS"}</span></span>
                        <div className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest ${colorClass} bg-black/40 border border-white/5`}>
                          T+{mins}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest block mb-1">{t("auto.ProjectedState_508") || "Projected State"}</span>
                          <span className={`text-[13px] font-black uppercase tracking-widest drop-shadow-md ${colorClass}`}>{label}</span>
                        </div>

                        <div className="flex items-center justify-between border-t border-white/10 pt-3">
                          <div>
                            <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest block mb-1">{t("auto.ProjVolume_4031") || "Proj. Volume"}</span>
                            <div className="flex items-end gap-1.5">
                              <span className="text-lg font-mono font-black text-white leading-none">{pCount}</span>
                              <span className="text-[10px] font-mono text-slate-500 leading-none pb-[3px]">/ {cap}</span>
                            </div>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]">
                            <span className={`text-xs font-black font-mono ${colorClass}`}>{Math.round((density > 1 ? 1 : density) * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={itemVariants} className="w-full relative grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-6 items-start">
          <div className="w-full relative">
            {selectedVenueId && (
              <>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[80%] bg-indigo-500/10 blur-[100px] pointer-events-none -z-10 rounded-full"></div>
              </>
            )}
            <AnalyticsCharts venueId={selectedVenueId} />
          </div>

          {selectedVenueId && (
            <div className="xl:sticky top-6">
              <AIRecommendationPanel
                venue={Array.isArray(venues) ? venues.find((v: any) => v.id === selectedVenueId) : null}
                predictionData={predictionData}
              />
            </div>
          )}
        </motion.div>

      </motion.div>
    </div>
  );
}
