import { useState, useEffect } from "react";
import { X, Video, Plus, ShieldCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useVenues } from "@/hooks/useVenues";
import { useTranslation } from "react-i18next";

interface Props {
  venueId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function AddCameraModal({ venueId, isOpen, onClose }: Props) {
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const { data: venues } = useVenues();
  const [selectedVenueId, setSelectedVenueId] = useState(venueId || "");
  
  useEffect(() => {
    if (venueId) setSelectedVenueId(venueId);
  }, [venueId]);
  const [formData, setFormData] = useState({
    name: "",
    stream_url: "0",
    stream_type: "device",
    fps: 15,
    resolution_width: 1920,
    resolution_height: 1080,
    is_active: true,
    monitoring_enabled: true,
    tracking_enabled: true,
    location_description: "",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        venue_id: selectedVenueId,
      };
      const res = await api.post("/cameras", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras", venueId] });
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      onClose();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-700/60 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-cyan-400" /> {t("auto.ConnectVideoSou_313") || "Connect Video Source"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t("auto.NodeName_9376") || "Node Name"}</label>
            <input 
              type="text" 
              placeholder={t("auto.egMainLobbyCam_7377") || "e.g. Main Lobby Cam"}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Location Description (Optional)</label>
            <input 
              type="text" 
              placeholder={t("auto.egNearthemainen_4707") || "e.g. Near the main entrance, North side"}
              value={formData.location_description}
              onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
              className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          
          {!venueId && (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t("auto.TargetVenue_2550") || "Target Venue"}</label>
              <select 
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 appearance-none"
              >
                <option value="" disabled>{t("auto.SelectVenue_7914") || "Select Venue..."}</option>
                {Array.isArray(venues) && venues.map((v) => (
                   <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Stream URI (RTSP / HTTP / HLS / ID)</label>
            <input 
              type="text" 
              placeholder={
                formData.stream_type === "device" ? "e.g., 0 for local webcam" : 
                formData.stream_type === "browser" ? "Automatically handled via Dashboard" :
                formData.stream_type === "http" ? "e.g., http://ip:port/mjpeg or https://..." :
                "e.g., rtsp://username:password@ip:port/stream"
              }
              value={formData.stream_url}
              disabled={formData.stream_type === "browser"}
              onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
              className={`w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-500 ${
                formData.stream_type === "browser"
                  ? "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed"
                  : "bg-[#0b1325] text-white border-slate-700"
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t("auto.StreamType_3011") || "Stream Type"}</label>
              <select 
                value={formData.stream_type}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    stream_type: val,
                    stream_url: val === "device" ? "0" : val === "browser" ? "browser-upload" : ""
                  });
                }}
                className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 appearance-none"
              >
                <option value="device">Server's Local USB Webcam</option>
                <option value="browser">{t("auto.LiveBrowserWebc_179") || "Live Browser Webcam"}</option>
                <option value="rtsp">CCTV Stream (RTSP)</option>
                <option value="http">{t("auto.HTTPVideo_6890") || "HTTP Video"}</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t("auto.TargetFPS_4660") || "Target FPS"}</label>
              <input 
                type="number" 
                value={formData.fps}
                min="1"
                max="120"
                onChange={(e) => setFormData({ ...formData, fps: Math.min(120, parseInt(e.target.value) || 15) })}
                className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
              <p className="text-[10px] text-cyan-500/50 mt-1 uppercase font-bold tracking-tighter">{t("auto.Supportshighspe_3725") || "Supports high-speed 120 FPS ingestion"}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t("auto.ResWidth_3742") || "Res Width"}</label>
              <input 
                type="number" 
                value={formData.resolution_width}
                onChange={(e) => setFormData({ ...formData, resolution_width: parseInt(e.target.value) || 1920 })}
                className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t("auto.ResHeight_883") || "Res Height"}</label>
              <input 
                type="number" 
                value={formData.resolution_height}
                onChange={(e) => setFormData({ ...formData, resolution_height: parseInt(e.target.value) || 1080 })}
                className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 bg-slate-800/20 p-4 rounded-lg border border-slate-800">
             <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="accent-cyan-500 w-4 h-4" />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{t("auto.NodeHardwareAct_8802") || "Node Hardware Active"}</span>
             </label>
             <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={formData.monitoring_enabled} onChange={e => setFormData({...formData, monitoring_enabled: e.target.checked})} className="accent-cyan-500 w-4 h-4" />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Run Inference Pipeline (AI Vision)</span>
             </label>
             <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={formData.tracking_enabled} onChange={e => setFormData({...formData, tracking_enabled: e.target.checked})} className="accent-cyan-500 w-4 h-4" />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Deep Tracking Enabled (Re-ID)</span>
             </label>
          </div>
          
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg flex items-start gap-3 mt-4 text-emerald-400 text-sm">
            <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{t("auto.IntelligencePip_472") || "Intelligence Pipeline, Real-time Monitoring, and Deep Tracking statuses will bind immediately to this Node."}</p>
          </div>
        </div>

        <div className="p-5 border-t border-slate-800 bg-[#0b1325] flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            {t("auto.Cancel_9092") || "Cancel"}
          </button>
          <button 
            onClick={() => mutation.mutate(formData)}
            disabled={mutation.isPending || !formData.name || !formData.stream_url || !selectedVenueId}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? "Connecting..." : <><Plus className="w-4 h-4" /> {t("auto.LinkNode_6206") || "Link Node"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
