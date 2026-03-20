"use client";

import { useState } from "react";
import { BrainCircuit, MapPin, Activity, ShieldCheck, CloudLightning, Calendar, PartyPopper, ChevronDown } from "lucide-react";
import AnalyticsCharts from "@/components/reports/analytics-charts";
import { useVenues } from "@/hooks/useVenues";
import { usePrediction } from "@/hooks/usePrediction";
import { motion, AnimatePresence } from "framer-motion";

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

export default function PredictionPage() {
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const [selectedVenueId, setSelectedVenueId] = useState("");

  const { data: predictionData, isLoading: predictionLoading } = usePrediction(selectedVenueId);

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 relative overflow-hidden">
      
      {/* Immersive Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[800px] h-[800px] bg-cyan-900/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.015)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none -z-10 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_80%,transparent_100%)]"></div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10 mt-2">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-indigo-950/40 backdrop-blur-md border border-indigo-500/30 rounded-2xl flex-shrink-0 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
              <BrainCircuit className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
               <h1 className="text-3xl font-black tracking-[0.1em] text-white flex items-center gap-4 font-heading uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                 Prediction Engine
                 <span className="px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-[10px] font-black uppercase tracking-[0.2em] shadow-[inset_0_0_10px_rgba(99,102,241,0.1)] flex items-center gap-2">
                   <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                   SYNTHETIC FORECAST
                 </span>
               </h1>
               <p className="text-sm font-bold text-slate-400 mt-2 tracking-widest uppercase">
                 Neural Trajectory Extrapolation Core
               </p>
            </div>
          </div>
        </motion.div>

        {/* Matrix Selection */}
        <motion.div variants={itemVariants} className="glass-panel border-t border-indigo-500/20 rounded-2xl p-8 mb-8 relative overflow-hidden group">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
             
             {/* Left side selector */}
             <div className="space-y-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-3 tracking-widest uppercase shadow-indigo-400 drop-shadow-md">
                <MapPin className="w-5 h-5 text-indigo-400" /> Target Sub-Matrix
              </h2>
              <p className="text-[12px] text-slate-400 font-mono leading-relaxed max-w-lg">
                Input coordinate sector to initialize the predictive layer. The ML core will synchronize historical telemetry sets and project high-probability anomaly vectors.
              </p>
              
              <div className="relative group/select w-full max-w-md">
                <div className="absolute inset-0 bg-indigo-500/0 rounded-xl blur transition-colors group-focus-within/select:bg-indigo-500/10"></div>
                <select 
                  value={selectedVenueId}
                  onChange={(e) => setSelectedVenueId(e.target.value)}
                  className="w-full relative z-10 bg-black/50 border border-white/10 text-sm font-mono tracking-widest rounded-xl pl-5 pr-12 py-4 text-white focus:outline-none focus:border-indigo-500/50 appearance-none shadow-[inset_0_0_15px_rgba(255,255,255,0.02)] transition-all uppercase hover:border-white/20 hover:bg-white/5 cursor-pointer"
                >
                  <option value="" disabled className="bg-[#050505]">Initialize Coordinate Node</option>
                  {Array.isArray(venues) && venues.map(v => (
                      <option key={v.id} value={v.id} className="bg-[#050505]">{v.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-5 h-5 text-indigo-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-transform group-focus-within/select:-rotate-180" />
              </div>
             </div>
  
              {/* Right side context */}
              <div className="relative overflow-hidden bg-indigo-950/20 border border-indigo-500/20 p-6 rounded-2xl flex flex-col justify-center">
                 <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(99,102,241,0.03)_25%,rgba(99,102,241,0.03)_50%,transparent_50%,transparent_75%,rgba(99,102,241,0.03)_75%,rgba(99,102,241,0.03)_100%)] bg-[length:20px_20px]"></div>
                 <div className="flex justify-between items-center mb-4 relative z-10 border-b border-indigo-500/20 pb-3">
                    <div className="flex items-center gap-3 text-indigo-400 text-xs tracking-widest uppercase font-black">
                       <ShieldCheck className="w-4 h-4" />
                       Neural Insights
                    </div>
                    {predictionData?.confidence ? (
                        <span className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)] tracking-[0.2em] uppercase">
                          {Math.round(predictionData.confidence * 100)}% Match
                        </span>
                    ) : (
                       <span className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-slate-800/50 text-slate-500 border border-white/5 tracking-[0.2em] uppercase">
                          Awaiting Data
                       </span>
                    )}
                 </div>
                 <p className="text-[11px] text-slate-400 leading-relaxed font-mono relative z-10 text-justify">
                    {predictionData?.forecast_explanation || "Trajectory deviation algorithm utilizes a deep LSTM temporal gating subsystem tuned for dense environment analytics. Sigma bands indicate extreme confidence upper boundaries."}
                 </p>
              </div>
  
          </div>
        </motion.div>

        <AnimatePresence mode="popLayout">
         {selectedVenueId && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
          >
            {/* Context Card 1 */}
            <div className="glass-panel border-t-cyan-500/40 border-l border-b border-r border-white/5 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 hover:-translate-y-1 transition-transform group shadow-[inset_0_0_20px_rgba(34,211,238,0.02)] hover:shadow-[0_10px_30px_rgba(34,211,238,0.1)]">
              <div className="p-3 bg-cyan-950/50 border border-cyan-500/30 text-cyan-400 rounded-xl shrink-0 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                <CloudLightning className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">Atmospheric Mod</p>
                <div className="flex items-center gap-3 mt-2">
                  <h4 className="text-lg font-bold text-white uppercase tracking-wider">
                    {predictionData?.weather_context?.condition ? predictionData.weather_context.condition.replace(/_/g, ' ') : 'Nominal'}
                  </h4>
                  {predictionData?.weather_context && (
                    <span className="text-xs font-black text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/30 capitalize">
                      {predictionData.weather_context.temperature}°C
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Context Card 2 */}
            <div className="glass-panel border-t-indigo-500/40 border-l border-b border-r border-white/5 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 hover:-translate-y-1 transition-transform group shadow-[inset_0_0_20px_rgba(99,102,241,0.02)] hover:shadow-[0_10px_30px_rgba(99,102,241,0.1)]">
              <div className="p-3 bg-indigo-950/50 border border-indigo-500/30 text-indigo-400 rounded-xl shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">Temporal Shift</p>
                <div className="flex items-center gap-3 mt-2">
                  <h4 className="text-lg font-bold text-white uppercase tracking-wider truncate max-w-[150px]">
                     {predictionData?.holiday_context?.name || 'Standard Baseline'} 
                  </h4>
                  {predictionData?.holiday_context && (
                    <span className="text-[10px] uppercase tracking-widest font-black text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/30">
                      {predictionData.holiday_context.type}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Context Card 3 */}
            <div className="glass-panel border-t-emerald-500/40 border-l border-b border-r border-white/5 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 hover:-translate-y-1 transition-transform group shadow-[inset_0_0_20px_rgba(16,185,129,0.02)] hover:shadow-[0_10px_30px_rgba(16,185,129,0.1)]">
              <div className="p-3 bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 rounded-xl shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <PartyPopper className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">Regional Events</p>
                <div className="flex items-center gap-3 mt-2">
                  <h4 className="text-lg font-bold text-white uppercase tracking-wider">
                     {predictionData?.event_type || 'None Detected'} 
                  </h4>
                  {predictionData?.event_type && (
                    <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                      + Flow Limit
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
         )}
        </AnimatePresence>

        <motion.div variants={itemVariants} className="w-full relative">
           {selectedVenueId && (
             <div className="absolute inset-0 bg-indigo-500/5 blur-[50px] pointer-events-none -z-10 rounded-[3rem]"></div>
           )}
           <AnalyticsCharts venueId={selectedVenueId} />
        </motion.div>

      </motion.div>
    </div>
  );
}
