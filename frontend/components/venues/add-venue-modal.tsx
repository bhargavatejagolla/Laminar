"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { toast } from "sonner";
import { Plus, X, Building, Users, AlertTriangle, CloudLightning, Car, Activity, Flame, ShieldCheck, BrainCircuit, Zap, Shield } from "lucide-react";
import { MapPicker } from "@/components/map/MapPicker";
import { useTranslation } from "react-i18next";
import { useVenues } from "@/hooks/useVenues";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddVenueModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: venues = [] } = useVenues();

  const defaultForm = {
    name: "",
    location: "",
    city: "",
    country: "",
    capacity: 1000,
    warning_threshold: 700,
    critical_threshold: 900,
    venue_type: "people",
    staffing_config: { low: 5, medium: 10, high: 20, critical: 50 },
    model_metadata: { surge_rate: 5.0, velocity_threshold: 15.0 },
    latitude: 17.3850,
    longitude: 78.4867,
  };

  const [formData, setFormData] = useState(defaultForm);

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await api.post("/venues", data);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Venue registered successfully.");
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      setFormData(defaultForm);
      onClose();
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d: any) => d.msg || d).join(", ")
            : "Failed to create venue. Check your role or try again.";
      toast.error(msg);
    },
  });

  const getDomainLabels = (type: string) => {
    switch (type) {
      case "parking":
        return {
          capacity: "Total Available Slots",
          threshold: "Slots",
          unit: "Vehicles",
          density: "Occupancy Rate"
        };
      case "traffic":
        return {
          capacity: "Road & Incident Flux",
          threshold: "Metrics",
          unit: "Entities",
          density: "Traffic & Threat Rate"
        };
      default:
        return {
          capacity: "Maximum Fire Capacity",
          threshold: "Persons",
          unit: "People",
          density: "Crowd Surge Rate"
        };
    }
  };

  const labels = getDomainLabels(formData.venue_type);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-cyan-500/30 rounded-xl w-full max-w-lg shadow-[0_0_40px_rgba(34,211,238,0.1)] overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#0b1325]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg">
              <Building className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-wide">{t("auto.RegisterNewVenu_5031") || "Register New Venue"}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="space-y-4">

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Venue Designation / Name</label>
              <input
                autoFocus
                type="text"
                placeholder="e.g. Sector 7 G - Main Hall"
                className="w-full bg-[#020617] border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-slate-600"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t("auto.City_5999") || "City"}</label>
                <input
                  type="text"
                  placeholder="Neo Tokyo"
                  className="w-full bg-[#020617] border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t("auto.Country_5749") || "Country"}</label>
                <input
                  type="text"
                  placeholder="JP"
                  className="w-full bg-[#020617] border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Geo-Coordinate Link (Live Map)</label>
              <div className="w-full relative rounded-xl border border-slate-700/50 overflow-hidden bg-[#020617] h-[350px]">
                <MapPicker
                  initialLat={formData.latitude}
                  initialLng={formData.longitude}
                  venues={venues}
                  onLocationSelect={(lat, lng, address, city, country) => {
                    setFormData({ ...formData, latitude: lat, longitude: lng, city: city || formData.city, country: country || formData.country, location: address });
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-500 font-mono">Current Coordinates: [{formData.latitude?.toFixed(6)}, {formData.longitude?.toFixed(6)}]</p>
              <div className="flex items-center gap-2 mt-1 px-2 py-1 rounded bg-cyan-500/5 border border-cyan-500/20 w-fit">
                <CloudLightning className="w-3 h-3 text-cyan-400 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-tighter text-cyan-300">Geo-Telemetry & Climate Sync Active</span>
              </div>
              <p className="text-[9px] text-slate-600 italic leading-none mt-1">Linked to Prediction Engine for live weather & temperature ingestion.</p>
            </div>

            <div className="space-y-4">
              <label className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-2 block">Laminar AI Domain (Processing Engine)</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "people", label: "People Intelligence", icon: Users, color: "text-blue-400", desc: "Crowd, Security & Flow" },
                  { id: "parking", label: "Smart Parking", icon: Car, color: "text-emerald-400", desc: "Vehicles & Occupancy" },
                  { id: "traffic", label: "Traffic Intelligence", icon: Activity, color: "text-amber-400", desc: "Traffic & Incident Tracking" },
                  { id: "kinetic", label: "Kinetic SOS", icon: BrainCircuit, color: "text-indigo-400", desc: "Behavioral Intel" },
                  { id: "guardian", label: "Guardian Route", icon: Shield, color: "text-blue-400", desc: "AI Escort Tracker" },
                  { id: "greenwave", label: "AI Green Wave", icon: Zap, color: "text-emerald-400", desc: "Traffic Signal Preemption" },
                  { id: "liability", label: "Liability Defense", icon: ShieldCheck, color: "text-rose-400", desc: "Predictive Triage" },
                ].map((domain) => (
                  <button
                    key={domain.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, venue_type: domain.id })}
                    className={`flex flex-col items-start p-3 rounded-xl border transition-all duration-200 text-left group ${formData.venue_type === domain.id
                      ? "bg-cyan-500/10 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.1)]"
                      : "bg-[#020617] border-slate-700 hover:border-slate-500"
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <domain.icon className={`w-4 h-4 ${formData.venue_type === domain.id ? "text-cyan-400" : domain.color}`} />
                      <span className={`text-xs font-bold ${formData.venue_type === domain.id ? "text-white" : "text-slate-400"}`}>{domain.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">{domain.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Capacity */}
            <div className="mt-6 pt-4 border-t border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold text-cyan-500 flex items-center gap-2">
                <Users className="w-4 h-4" /> {labels.capacity} Logistics
              </h3>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{labels.capacity}</label>
                <input
                  type="number" min="1"
                  className="w-full bg-[#020617] border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                />
                <p className="text-[10px] text-slate-500 font-mono">{t("auto.Totalallowedphy_1207") || `Total allowed ${labels.unit.toLowerCase()} deployed in sector.`}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-amber-500 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Warning Threshold ({labels.threshold})</label>
                  <input
                    type="number" min="1"
                    className="w-full bg-[#020617] border border-amber-900/40 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500 transition-colors"
                    value={formData.warning_threshold}
                    onChange={(e) => setFormData({ ...formData, warning_threshold: parseInt(e.target.value) || 0 })}
                  />
                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                    {String.fromCharCode(8776)} {formData.capacity > 0 ? Math.round((formData.warning_threshold / formData.capacity) * 100) : 0}% of capacity
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-rose-500 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Critical Threshold ({labels.threshold})</label>
                  <input
                    type="number" min="1"
                    className="w-full bg-[#020617] border border-rose-900/40 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-rose-500 transition-colors"
                    value={formData.critical_threshold}
                    onChange={(e) => setFormData({ ...formData, critical_threshold: parseInt(e.target.value) || 0 })}
                  />
                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                    {String.fromCharCode(8776)} {formData.capacity > 0 ? Math.round((formData.critical_threshold / formData.capacity) * 100) : 0}% of capacity
                  </div>
                </div>
              </div>
            </div>

            {/* Staffing */}
            <div className="mt-6 pt-4 border-t border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold text-cyan-500 flex items-center gap-2">
                <Users className="w-4 h-4" /> Manual Staffing Requirements (Personnel Count)
              </h3>
              <p className="text-[10px] text-slate-500 font-mono mb-2">{t("auto.Configureexpect_963") || "Configure expected staffing based on live threat levels."}</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{t("auto.Low_8115") || "Low"}</label>
                  <input type="number" min="0"
                    className="w-full bg-[#020617] border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                    value={formData.staffing_config.low}
                    onChange={(e) => setFormData({ ...formData, staffing_config: { ...formData.staffing_config, low: parseInt(e.target.value) || 0 } })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{t("auto.Medium_6687") || "Medium"}</label>
                  <input type="number" min="0"
                    className="w-full bg-[#020617] border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                    value={formData.staffing_config.medium}
                    onChange={(e) => setFormData({ ...formData, staffing_config: { ...formData.staffing_config, medium: parseInt(e.target.value) || 0 } })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-amber-500 font-semibold">{t("auto.High_288") || "High"}</label>
                  <input type="number" min="0"
                    className="w-full bg-[#020617] border border-amber-900/40 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-amber-500 transition-colors text-sm"
                    value={formData.staffing_config.high}
                    onChange={(e) => setFormData({ ...formData, staffing_config: { ...formData.staffing_config, high: parseInt(e.target.value) || 0 } })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-rose-500 font-semibold">{t("auto.Critical_6118") || "Critical"}</label>
                  <input type="number" min="0"
                    className="w-full bg-[#020617] border border-rose-900/40 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-rose-500 transition-colors text-sm"
                    value={formData.staffing_config.critical}
                    onChange={(e) => setFormData({ ...formData, staffing_config: { ...formData.staffing_config, critical: parseInt(e.target.value) || 0 } })}
                  />
                </div>
              </div>
            </div>

            {/* AI Dynamic Settings */}
            <div className="mt-6 pt-4 border-t border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold text-cyan-500 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> AI Dynamic Response Settings
              </h3>
              <p className="text-[10px] text-slate-500 font-mono mb-2">Override AI trigger thresholds specific to this venue layout.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-amber-500 font-semibold">{labels.density} ({labels.unit}/min)</label>
                  <input type="number" step="0.5" min="0"
                    className="w-full bg-[#020617] border border-amber-900/40 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500 transition-colors text-sm"
                    value={formData.model_metadata.surge_rate}
                    onChange={(e) => setFormData({ ...formData, model_metadata: { ...formData.model_metadata, surge_rate: parseFloat(e.target.value) || 5.0 } })}
                  />
                  <p className="text-[10px] text-slate-500 font-mono">Growth above this rate/min triggers an alert. Default: 5.0</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-rose-500 font-semibold">Panic/Hazard Velocity Limit (px/sec)</label>
                  <input type="number" step="1" min="0"
                    className="w-full bg-[#020617] border border-rose-900/40 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-500 transition-colors text-sm"
                    value={formData.model_metadata.velocity_threshold}
                    onChange={(e) => setFormData({ ...formData, model_metadata: { ...formData.model_metadata, velocity_threshold: parseFloat(e.target.value) || 15.0 } })}
                  />
                  <p className="text-[10px] text-slate-500 font-mono">Movement speed above this triggers an immediate threat detection.</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0b1325] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-transparent"
          >
            {t("auto.Cancel_9092") || "Cancel"}
          </button>
          <button
            onClick={() => mutation.mutate(formData)}
            disabled={mutation.isPending || !formData.name}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? (
              <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Initialize Venue
          </button>
        </div>

      </div>
    </div>
  );
}
