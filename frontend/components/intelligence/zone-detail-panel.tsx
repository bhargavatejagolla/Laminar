"use client";

import { ZoneIntelligenceSnapshot } from "@/hooks/useZoneIntelligence";
import { X, Activity, Droplets, Move, Network, Clock, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  node?: ZoneIntelligenceSnapshot;
  onClose: () => void;
}

export default function ZoneDetailPanel({ node, onClose }: Props) {
  if (!node) return null;

  return (
    <div className="bg-[#050f1f]/80 backdrop-blur-xl border border-cyan-500/20 rounded-2xl h-full flex flex-col overflow-hidden relative shadow-[0_0_20px_rgba(34,211,238,0.1)]">
      
      {/* Glints */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50" />
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/30">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-white font-bold tracking-widest uppercase">NODE {node.camera_id.substring(0,6)}</h2>
            <p className="text-[10px] text-cyan-500 tracking-widest uppercase font-mono">Telemetry Feed</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-rose-500/20 hover:border-rose-500/30 border border-transparent rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
        
        {/* Risk Status */}
        <div className={`p-4 rounded-xl border flex items-center gap-4 ${
          node.intelligence.overall_risk_level === 'critical' ? 'bg-rose-500/10 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.2)]' :
          node.intelligence.overall_risk_level === 'high' ? 'bg-orange-500/10 border-orange-500/50' :
          node.intelligence.overall_risk_level === 'medium' ? 'bg-amber-500/10 border-amber-500/50' :
          'bg-emerald-500/10 border-emerald-500/50'
        }`}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Live Status</p>
            <h3 className="text-xl font-black uppercase tracking-widest">{node.intelligence.overall_risk_level} RISK</h3>
            <p className="text-xs opacity-80 mt-1 max-w-[250px]">{node.intelligence.summary}</p>
          </div>
        </div>

        {/* Prediction Data */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold tracking-widest uppercase text-slate-300">Phase 2 Prediction</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/20 p-3 rounded-lg border border-white/5">
              <p className="text-[10px] uppercase text-slate-500 tracking-widest font-bold mb-1">Density (10m)</p>
              <p className="text-2xl font-mono text-white">{node?.prediction?.density_10m ?? 0}</p>
            </div>
            <div className="bg-black/20 p-3 rounded-lg border border-white/5">
              <p className="text-[10px] uppercase text-slate-500 tracking-widest font-bold mb-1">Time to Critical</p>
              <p className="text-2xl font-mono text-cyan-400">
                {node?.prediction?.time_to_critical_min ? `${node.prediction.time_to_critical_min}m` : 'Safe'}
              </p>
            </div>
          </div>
        </div>

        {/* Dwell Data */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold tracking-widest uppercase text-slate-300">Dwell Metrics</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
             <div className="bg-black/20 p-3 rounded-lg border border-white/5">
              <p className="text-[10px] uppercase text-slate-500 tracking-widest font-bold mb-1">Avg Dwell</p>
              <p className="text-lg font-mono text-white">{(node?.dwell?.avg_seconds ?? 0).toFixed(1)}s</p>
            </div>
             <div className="bg-black/20 p-3 rounded-lg border border-white/5">
              <p className="text-[10px] uppercase text-slate-500 tracking-widest font-bold mb-1">Status</p>
              <p className="text-lg font-mono text-purple-400 capitalize">{node?.dwell?.zone_status ?? "Unknown"}</p>
            </div>
          </div>
        </div>

        {/* Flow Data */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Move className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold tracking-widest uppercase text-slate-300">Motion Flow</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div className="bg-black/20 p-3 rounded-lg border border-white/5">
              <p className="text-[10px] uppercase text-slate-500 tracking-widest font-bold mb-1">Velocity</p>
              <p className="text-lg font-mono text-white">{(node?.flow?.avg_speed_px_per_frame ?? 0).toFixed(1)} px/f</p>
            </div>
             <div className="bg-black/20 p-3 rounded-lg border border-white/5">
              <p className="text-[10px] uppercase text-slate-500 tracking-widest font-bold mb-1">Intensity</p>
              <p className="text-lg font-mono text-blue-400 capitalize">{node?.flow?.flow_intensity ?? "Low"}</p>
            </div>
          </div>
        </div>
        
        {/* Fusion Recommendations */}
        <AnimatePresence>
          {node?.intelligence?.alert_type && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-4 border border-indigo-500/30 bg-indigo-500/10 p-4 rounded-xl relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay"></div>
              <div className="relative z-10">
                 <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-indigo-400" />
                    <span className="text-[10px] tracking-widest uppercase font-black text-indigo-300">Phase 2 AI Fusion</span>
                 </div>
                 <h4 className="text-sm font-bold text-white mb-1">{node.intelligence.alert_reason?.replace(/_/g, ' ')}</h4>
                 <p className="text-xs text-indigo-200 uppercase tracking-wide leading-relaxed mt-2 p-2 border border-indigo-500/20 bg-black/20 rounded-lg">
                    {node.intelligence.recommended_action}
                 </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
