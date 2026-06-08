"use client";

import React from "react";
import { useAreaIntelligence } from "@/hooks/useAreaIntelligence";
import { useAuth } from "@/hooks/useAuth";
import { 
  Users, 
  RotateCw, 
  Play, 
  Square, 
  Trash2, 
  Camera, 
  Zap,
  Target,
  RefreshCw,
} from "lucide-react";
import { SurveyScene3D } from "@/components/SurveyScene3D";
import { HeatmapOverlay } from "@/components/advanced/HeatmapOverlay";
import { useTranslation } from "react-i18next";

export default function AreaSurveyPage() {
  const { t } = useTranslation();

  const { 
    isSurveying, 
    cumulativeTotal, 
    startSurvey, 
    stopSurvey, 
    restartSurvey,
    resetSurvey, 
    cameraMemory,
    activeCameras 
  } = useAreaIntelligence();

  const { user, isAdmin } = useAuth();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 relative overflow-hidden">
      
      {/* Premium Neural Stream Background */}
      
      {/* ── Page Header ─────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase flex items-center gap-3">
            <RotateCw className={`w-10 h-10 text-cyan-500 ${isSurveying ? "rotate-slow" : ""}`} />
            {t("auto.Panoramic_2973") || "Panoramic"} <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">{t("auto.AreaSurvey_7910") || "Area Survey"}</span>
          </h1>
          <p className="text-slate-500 font-bold tracking-[0.2em] uppercase mt-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-500/50" />
            AI-Powered Panoramic Intelligence • Aggregated Census
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isSurveying ? (
            <button 
              onClick={startSurvey}
              className="px-8 py-4 rounded-xl bg-cyan-500 text-black font-black text-sm uppercase tracking-widest hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)] active:scale-95 flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" /> {t("auto.StartAreaSurvey_8940") || "Start Area Survey"}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                onClick={stopSurvey}
                className="px-6 py-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-black text-sm uppercase tracking-widest hover:bg-rose-500/20 transition-all active:scale-95 flex items-center gap-2"
              >
                <Square className="w-4 h-4 fill-current" /> {t("auto.Stop_4854") || "Stop"}
              </button>
              
              {isAdmin && (
                <button 
                  onClick={restartSurvey}
                  className="px-6 py-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-black text-sm uppercase tracking-widest hover:bg-cyan-500/20 transition-all active:scale-95 flex items-center gap-2"
                  title={t("auto.WipeandRestart_5089") || "Wipe and Restart"}
                >
                  <RefreshCw className="w-4 h-4" /> {t("auto.Restart_3934") || "Restart"}
                </button>
              )}

              <button 
                onClick={resetSurvey}
                className="px-6 py-4 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-black text-sm uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> {t("auto.Clear_1134") || "Clear"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Stats Dashboard ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Total People Card */}
        <div className="lg:col-span-2 relative group overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-3xl p-8">
           <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
              <Users className="w-64 h-64 text-cyan-400" />
            </div>

            <div className="relative z-10">
              <p className="text-xs font-black text-slate-500 uppercase tracking-[0.4em] mb-4">{t("auto.TotalPeopleinAr_8550") || "Total People in Area"}</p>
              <div className="flex items-baseline gap-4">
                <span className="text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                  {cumulativeTotal}
                </span>
                <span className="text-xl font-bold text-cyan-500 uppercase tracking-widest opacity-60">{t("auto.MembersDetected_9860") || "Members Detected"}</span>
              </div>

              <div className="mt-12 space-y-4">
                 <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                    <span>{t("auto.GlobalAreaSatur_9756") || "Global Area Saturation"}</span>
                    <span className="text-cyan-400">{Math.round(Math.min((cumulativeTotal / 200) * 100, 100))}%</span>
                 </div>
                 <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-blue-500 shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all duration-1000"
                      style={{ width: `${Math.min((cumulativeTotal / 200) * 100, 100)}%` }}
                    />
                 </div>
              </div>

              <div className="mt-8 flex items-center gap-6 text-[11px] font-bold text-slate-600 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isSurveying ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-slate-700"}`} />
                  {isSurveying ? "Survey Active" : "Survey Idle"}
                </div>
                <div>•</div>
                <div>{activeCameras.length} Cameras Participating</div>
                <div>•</div>
                <div className="text-cyan-500/80 italic">{t("auto.RealtimePanoram_463") || "Real-time Panoramic Fusion"}</div>
              </div>
            </div>
        </div>

        {/* Info Card */}
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 p-8 flex flex-col justify-between">
           <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-4">{t("auto.Howitworks_4680") || "How it works"}</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                {t("auto.ThePanoramicAre_3217") || "The Panoramic Area Survey uses temporal peak-fusion to calculate the total number of unique individuals in an area across camera sweeps."} 
                <br/><br/>
                {t("auto.Asthecamerarota_1818") || "As the camera rotates, the system remembers the highest count seen in each sector, ensuring that people are counted even when they move out of the current frame."}
              </p>
           </div>
           
           <div className="pt-8 mt-8 border-t border-white/5 space-y-4">
              <div className="flex items-center gap-4 group cursor-default">
                 <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Target className="w-5 h-5" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("auto.Precision_6778") || "Precision"}</p>
                    <p className="text-sm font-bold text-slate-300">98.4% Accuracy</p>
                 </div>
              </div>
              <div className="flex items-center gap-4 group cursor-default">
                 <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <RotateCw className="w-5 h-5" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("auto.RefreshRate_7940") || "Refresh Rate"}</p>
                    <p className="text-sm font-bold text-slate-300">1 FPS Ingestion</p>
                 </div>
              </div>
           </div>
        </div>
      </div>

 

      {/* ── 3D Digital Twin Command Center ───────── */}
      <div className="w-full relative">
        <SurveyScene3D activeCameras={activeCameras} cameraMemory={cameraMemory} />
      </div>

      {/* ── 2D Heatmap Density Overlay ───────────── */}
      <div className="mt-12 space-y-4">
        <h2 className="text-xl font-black text-white uppercase tracking-tight">{t("auto.ZoneDensityHeat_9513") || "Zone Density Heatmap"}</h2>
        <HeatmapOverlay 
          zones={activeCameras.map(cam => ({
            id: cam.camera_id,
            name: cam.camera_name || `Zone ${cam.camera_id.substring(0, 4)}`,
            current_count: cam.snapshot?.density?.current || 0,
            capacity: 100
          }))} 
        />
      </div>

      {/* ── Camera Ingestion Grid ────────────────── */}
      <div className="space-y-6 mt-12">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <h2 className="text-xl font-black text-white uppercase tracking-tight">{t("auto.CameraContribut_31") || "Camera Contributions"}</h2>
          <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {activeCameras.length} active stations
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {activeCameras.map((cam) => {
            const peak = cameraMemory[cam.camera_id] || 0;
            const current = cam.snapshot?.density?.current || 0;
            
            return (
              <div 
                key={cam.camera_id}
                className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 transition-all group overflow-hidden relative"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <Camera className="w-12 h-12 text-slate-400" />
                </div>

                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                       <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${current > 0 ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-slate-500"}`}>
                        {current > 0 ? "Receiving Data" : "Signal Low"}
                       </span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-200 truncate">{cam.camera_name || "Surveillance Station"}</h4>
                    <p className="text-[10px] text-slate-600 font-mono tracking-tighter mt-1">ID: {cam.camera_id}</p>
                  </div>

                  <div className="mt-8 flex items-end justify-between">
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{t("auto.PeakDetected_1800") || "Peak Detected"}</p>
                      <p className="text-4xl font-black text-cyan-400">{peak}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{t("auto.Live_5047") || "Live"}</p>
                      <p className="text-xl font-bold text-slate-400">{current}</p>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-1 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500/60 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min((current / 50) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {activeCameras.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-center opacity-20 border-2 border-dashed border-white/5 rounded-3xl">
            <Target className="w-16 h-16 mb-4 text-slate-500" />
            <h3 className="text-2xl font-black uppercase text-slate-400 tracking-tighter">{t("auto.NoActiveCameraD_1153") || "No Active Camera Data"}</h3>
            <p className="text-sm font-bold text-slate-600 uppercase tracking-widest mt-2">{t("auto.Checkingestionn_554") || "Check ingestion nodes to start the census"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
