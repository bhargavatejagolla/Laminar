"use client";

import { useState } from "react";
import { useZoneIntelligenceSummary } from "@/hooks/useZoneIntelligence";
import { Loader2, AlertTriangle, ArrowUpRight, ArrowRight, ArrowDownRight, ArrowDown, ArrowDownLeft, ArrowLeft, ArrowUpLeft, ArrowUp, Activity } from "lucide-react";
import ZoneDetailPanel from "./zone-detail-panel";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

function getDirectionIcon(direction: string) {
  switch (direction.toUpperCase()) {
    case "N": return <ArrowUp className="w-4 h-4" />;
    case "NE": return <ArrowUpRight className="w-4 h-4" />;
    case "E": return <ArrowRight className="w-4 h-4" />;
    case "SE": return <ArrowDownRight className="w-4 h-4" />;
    case "S": return <ArrowDown className="w-4 h-4" />;
    case "SW": return <ArrowDownLeft className="w-4 h-4" />;
    case "W": return <ArrowLeft className="w-4 h-4" />;
    case "NW": return <ArrowUpLeft className="w-4 h-4" />;
    default: return null;
  }
}

function getRiskColor(level: string) {
  switch (level) {
    case "critical": return "border-rose-500 bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]";
    case "high": return "border-orange-500 bg-orange-500/10 text-orange-400";
    case "medium": return "border-amber-500 bg-amber-500/10 text-amber-400";
    case "low": return "border-emerald-500 bg-emerald-500/10 text-emerald-400";
    default: return "border-slate-700 bg-slate-800/50 text-slate-400";
  }
}

function getRiskPulse(level: string) {
  if (level === "critical") return "animate-pulse shadow-[0_0_30px_rgba(244,63,94,0.5)]";
  return "";
}

export default function LiveVenueMap() {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useZoneIntelligenceSummary();
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        <span className="ml-3 text-cyan-400 font-mono tracking-widest text-sm">{t("auto.INITIALIZINGRAD_7135") || "INITIALIZING RADAR..."}</span>
      </div>
    );
  }

  // isError is only triggered by network failure, not missing data.
  // If data is valid but no cameras, show the empty state (not an error message).
  if (isError) {
    return (
      <div className="p-8 border border-rose-500/30 bg-rose-500/10 rounded-xl text-center">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <p className="text-rose-400 font-medium">Failed to reach Intelligence Engine — check backend connection</p>
        <p className="text-slate-500 text-xs mt-1">{t("auto.Retryingautomat_8867") || "Retrying automatically..."}</p>
      </div>
    );
  }

  // Flatten backend structure: each camera item is { camera_id, status, snapshot: {...} | null }
  // Show ALL cameras from DB — active, warming_up, and offline.
  const rawCameras = data?.cameras ?? [];
  const cameras = rawCameras.map((c: any) => {
    const isOffline = c.status === "offline";
    const isWarmingUp = c.status === "warming_up";
    const snap = c.snapshot;
    return {
      camera_id: c.camera_id,
      camera_name: c.camera_name || `CAM-${c.camera_id?.slice(0, 6)}`,
      venue_name: c.venue_name || "Unknown Venue",
      status: c.status,
      isOffline,
      isWarmingUp,
      intelligence: snap?.intelligence ?? {
        overall_risk_level: "low",
        summary: isOffline ? "Camera offline" : "Stream warming up...",
        alert_triggered: false,
        alert_type: null,
        alert_reason: null,
        recommended_action: null,
        contributing_factors: [],
      },
      flow: snap?.flow ?? { dominant_direction: "none", flow_intensity: "still", stationary_ratio: 1, distribution: {}, avg_speed_px_per_frame: 0 },
      density: snap?.density ?? { current: 0, trend: "stable", smoothed: 0, rate_per_min: 0, projected_2min: 0, projected_5min: 0, surge_intensity: "low" },
      prediction: snap?.prediction ?? { density_5m: 0, density_10m: 0, time_to_critical_min: null, trend: "stable", confidence: 0 },
      dwell: snap?.dwell ?? { avg_seconds: 0, max_seconds: 0, long_dwell_count: 0, group_dwell_detected: false, group_dwell_zones: [], zone_status: "normal", stagnation_score: 0, distribution: { short: 0, medium: 0, long: 0 } },
      // Keep full snapshot for ZoneDetailPanel
      _snapshot: snap,
    };
  });


  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-[#0f172a]/30 rounded-xl border border-slate-800/50 text-center border-dashed">
        <Activity className="w-10 h-10 text-slate-600 mb-4" />
        <h3 className="text-slate-300 font-semibold mb-2">{t("auto.NoActiveZones_7685") || "No Active Zones"}</h3>
        <p className="text-slate-500 text-sm max-w-sm">
          {t("auto.Awaitingstreamd_5094") || "Awaiting stream data from connected camera nodes."}
        </p>
      </div>
    );
  }

  const selectedNode = cameras.find((c) => c.camera_id === selectedCameraId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${selectedCameraId ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
        <AnimatePresence>
          {cameras.map((node) => {
            const risk = node.intelligence.overall_risk_level;
            const colorClass = node.isOffline ? "border-slate-700 bg-slate-800/20 text-slate-500" : getRiskColor(risk);
            const pulseClass = node.isOffline ? "" : getRiskPulse(risk);
            const isSelected = selectedCameraId === node.camera_id;

            return (
              <motion.div
                key={node.camera_id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => setSelectedCameraId(isSelected ? null : node.camera_id)}
                className={`relative ${node.isOffline ? 'cursor-pointer opacity-60 grayscale-[50%]' : 'cursor-pointer'} p-4 rounded-xl border backdrop-blur-md transition-all duration-300 
                  ${colorClass} ${pulseClass} ${isSelected ? 'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]' : ''}`}
              >
                {/* Node Tracker ID */}
                <div className="flex justify-between items-start mb-3 border-b border-current/20 pb-2">
                  <div className="flex-1 overflow-hidden pr-2">
                    <h3 className="text-[12px] font-black tracking-widest uppercase truncate text-white" title={node.camera_name || node.venue_name || `CAM ${node.camera_id}`}>
                      {node.camera_name ? node.camera_name : (node.venue_name ? node.venue_name : `CAM ${node.camera_id.substring(0, 6)}`)}
                    </h3>
                    <p className="text-[10px] font-bold text-sky-400/80 truncate mt-0.5 uppercase tracking-wider">
                      {node.venue_name || "Location: LIVE NODE"}
                    </p>
                    <p className="text-[10px] opacity-80 uppercase tracking-widest mt-1.5 flex items-center gap-1.5 font-semibold">
                      <span className={`w-1.5 h-1.5 rounded-full ${pulseClass ? 'bg-current animate-pulse' : 'bg-current'}`} />
                      {risk} RISK
                    </p>
                  </div>
                  {/* Flow Arrow */}
                  <div className="flex bg-black/20 p-2 rounded-lg border border-current/30" title={`Flow: ${node.flow.dominant_direction}`}>
                    {getDirectionIcon(node.flow.dominant_direction) || <Activity className="w-4 h-4" />}
                  </div>
                </div>

                {/* Live Stats */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-black/20 p-2 rounded-lg">
                    <p className="text-[10px] uppercase opacity-70 mb-1 tracking-wider">{t("auto.Current_9100") || "Current"}</p>
                    <p className="text-xl font-bold font-mono">{node.density.current}</p>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg">
                    <p className="text-[10px] uppercase opacity-70 mb-1 tracking-wider">Pred (5m)</p>
                    <p className="text-xl font-bold font-mono">{node.prediction.density_5m}</p>
                  </div>
                </div>

                {/* Trend indicator */}
                <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold">
                  <span className={`w-2 h-2 rounded-full ${node.density.trend === 'increasing' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                  {node.density.trend} TREND
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Drill-down panel */}
      {selectedCameraId && (
        <div className="lg:col-span-1 border-l border-white/10 pl-6 animate-in slide-in-from-right-8 duration-300">
          <ZoneDetailPanel 
            node={selectedNode?._snapshot ?? undefined} 
            onClose={() => setSelectedCameraId(null)}
          />
        </div>
      )}

    </div>
  );
}
