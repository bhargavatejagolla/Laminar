"use client";

import { useState, useEffect } from "react";
import { X, Video, Save, ShieldCheck, Settings } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Camera } from "@/hooks/useCameras";
import { useVenues } from "@/hooks/useVenues";
import { useTranslation } from "react-i18next";

interface Props {
  camera: Camera | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditCameraModal({ camera, isOpen, onClose }: Props) {
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const { data: venues } = useVenues();
  const [formData, setFormData] = useState({
    name: "",
    stream_url: "",
    stream_type: "",
    camera_type: "generic",
    fps: 15,
    resolution_width: 1920,
    resolution_height: 1080,
    is_active: true,
    monitoring_enabled: true,
    tracking_enabled: true,
    location_description: "",
    venue_id: "",
  });

  useEffect(() => {
    if (camera) {
      setFormData({
        name: camera.name || "",
        stream_url: (camera as any).stream_url || "",
        stream_type: camera.stream_type || "device",
        camera_type: (camera as any).camera_type || "generic",
        fps: camera.fps || 15,
        resolution_width: (camera as any).resolution_width || 1920,
        resolution_height: (camera as any).resolution_height || 1080,
        is_active: camera.is_active ?? true,
        monitoring_enabled: (camera as any).monitoring_enabled ?? true,
        tracking_enabled: (camera as any).tracking_enabled ?? true,
        location_description: (camera as any).location_description || "",
        venue_id: camera.venue_id || "",
      });
    }
  }, [camera]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (!camera) return;
      const res = await api.put(`/cameras/${camera.id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      onClose();
    },
  });

  if (!isOpen || !camera) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f172a] border border-cyan-500/20 rounded-2xl shadow-[0_0_50px_rgba(34,211,238,0.1)] w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-white/5 bg-slate-900/50">
          <h2 className="text-xl font-black text-white flex items-center gap-3 tracking-wider uppercase">
            <Settings className="w-6 h-6 text-cyan-400" /> {t("auto.EditNodeConfigu_9869") || "Edit Node Configuration"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-500/20">
          {/* Basic Info */}
          <div className="grid grid-cols-1 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">{t("auto.NodeIdentity_1928") || "Node Identity"}</label>
              <input 
                type="text" 
                placeholder={t("auto.NodeName_556") || "Node Name"}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">Location Context (Optional)</label>
              <input 
                type="text" 
                placeholder={t("auto.egNearthemainen_4707") || "e.g. Near the main entrance, North side"}
                value={formData.location_description}
                onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">{t("auto.TargetVenue_2550") || "Target Venue"}</label>
              <select 
                value={formData.venue_id}
                onChange={(e) => setFormData({ ...formData, venue_id: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all font-mono appearance-none"
              >
                <option value="" disabled>{t("auto.SelectVenue_7914") || "Select Venue..."}</option>
                {Array.isArray(venues) && venues.map((v: any) => (
                   <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Stream Config */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">Stream URI (RTSP / HTTP / ID)</label>
            <input 
              type="text" 
              value={formData.stream_url}
              onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">{t("auto.TransferProtoco_5305") || "Transfer Protocol"}</label>
              <select 
                value={formData.stream_type}
                onChange={(e) => setFormData({ ...formData, stream_type: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all appearance-none font-mono"
              >
                <option value="device">Internal Node (Webcam)</option>
                <option value="rtsp">Network Stream (RTSP)</option>
                <option value="http">Hypertext (HTTP/MJPEG)</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">Feature Category</label>
              <select 
                value={formData.camera_type || "generic"}
                onChange={(e) => setFormData({ ...formData, camera_type: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all appearance-none font-mono"
              >
                <option value="generic">Generic (All Modules)</option>
                <option value="parking">Smart Parking</option>
                <option value="traffic">Smart Traffic</option>
                <option value="security">Security & Incidents</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">Sampling Rate (FPS)</label>
              <input 
                type="number" 
                value={formData.fps}
                min="1"
                max="120"
                onChange={(e) => setFormData({ ...formData, fps: Math.min(120, parseInt(e.target.value) || 15) })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
              />
              <p className="text-[10px] text-cyan-500/50 mt-1 uppercase font-black tracking-tighter">120 FPS HIGH-SPEED SYNC</p>
            </div>
          </div>
          
          {/* Resolution */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">{t("auto.BufferWidth_6338") || "Buffer Width"}</label>
              <input 
                type="number" 
                value={formData.resolution_width}
                onChange={(e) => setFormData({ ...formData, resolution_width: parseInt(e.target.value) || 1920 })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-black">{t("auto.BufferHeight_8549") || "Buffer Height"}</label>
              <input 
                type="number" 
                value={formData.resolution_height}
                onChange={(e) => setFormData({ ...formData, resolution_height: parseInt(e.target.value) || 1080 })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
              />
            </div>
          </div>

          {/* Intelligence Toggles */}
          <div className="space-y-3 pt-4 bg-cyan-950/20 p-5 rounded-2xl border border-cyan-500/10 shadow-[inset_0_0_20px_rgba(34,211,238,0.05)]">
             <h3 className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-black mb-4 flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> {t("auto.EngineProtocols_7100") || "Engine Protocols"}
             </h3>
             <label className="flex items-center gap-4 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input type="checkbox" checked={formData.monitoring_enabled} onChange={e => setFormData({...formData, monitoring_enabled: e.target.checked})} className="peer sr-only" id="monitor-toggle" />
                  <div className="w-10 h-5 bg-slate-800 rounded-full border border-white/10 peer-checked:bg-cyan-500/50 peer-checked:border-cyan-400/50 transition-all"></div>
                  <div className="absolute left-1 w-3 h-3 bg-slate-400 rounded-full peer-checked:left-6 peer-checked:bg-white transition-all"></div>
                </div>
                <span className="text-xs font-bold text-slate-400 group-hover:text-white transition-colors uppercase tracking-wider">{t("auto.VisionPipelineI_7973") || "Vision Pipeline Inference"}</span>
             </label>
             <label className="flex items-center gap-4 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input type="checkbox" checked={formData.tracking_enabled} onChange={e => setFormData({...formData, tracking_enabled: e.target.checked})} className="peer sr-only" id="track-toggle" />
                  <div className="w-10 h-5 bg-slate-800 rounded-full border border-white/10 peer-checked:bg-cyan-500/50 peer-checked:border-cyan-400/50 transition-all"></div>
                  <div className="absolute left-1 w-3 h-3 bg-slate-400 rounded-full peer-checked:left-6 peer-checked:bg-white transition-all"></div>
                </div>
                <span className="text-xs font-bold text-slate-400 group-hover:text-white transition-colors uppercase tracking-wider">Deep Neural Tracking (Re-ID)</span>
             </label>
             <label className="flex items-center gap-4 cursor-pointer group pt-2 border-t border-white/5">
                <div className="relative flex items-center justify-center">
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="peer sr-only" id="active-toggle" />
                  <div className="w-10 h-5 bg-slate-800 rounded-full border border-white/10 peer-checked:bg-emerald-500/50 peer-checked:border-emerald-400/50 transition-all"></div>
                  <div className="absolute left-1 w-3 h-3 bg-slate-400 rounded-full peer-checked:left-6 peer-checked:bg-white transition-all"></div>
                </div>
                <span className="text-xs font-bold text-slate-400 group-hover:text-white transition-colors uppercase tracking-wider">{t("auto.NodeHardwareAct_8802") || "Node Hardware Active"}</span>
             </label>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-slate-900/80 flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-3 text-xs font-black text-slate-400 hover:text-white transition-colors uppercase tracking-widest"
          >
            {t("auto.Abort_8207") || "Abort"}
          </button>
          <button 
            onClick={() => mutation.mutate(formData)}
            disabled={mutation.isPending || !formData.name || !formData.stream_url}
            className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black rounded-xl flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] disabled:opacity-50 uppercase tracking-[0.1em]"
          >
            {mutation.isPending ? "Syncing..." : <><Save className="w-4 h-4" /> {t("auto.CommitChanges_1611") || "Commit Changes"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
