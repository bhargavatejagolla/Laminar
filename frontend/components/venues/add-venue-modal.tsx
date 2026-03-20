import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { toast } from "sonner";
import { Plus, X, Building, Users, AlertTriangle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddVenueModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();

  const defaultForm = {
    name: "",
    city: "",
    country: "",
    capacity: 1000,
    warning_threshold: 700,
    critical_threshold: 900,
    venue_type: "Stadium",
    staffing_config: {
      low: 5,
      medium: 10,
      high: 20,
      critical: 50
    }
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
      setFormData(defaultForm); // Reset form
      onClose();
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === "string"
        ? detail
        : Array.isArray(detail)
        ? detail.map((d: any) => d.msg || d).join(", ")
        : "Failed to create venue. Check your role or try again.";
      toast.error(msg);
    },
  });

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
             <h2 className="text-lg font-bold text-white tracking-wide">Register New Venue</h2>
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
                <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">City</label>
                <input 
                  type="text"
                  placeholder="Neo Tokyo"
                  className="w-full bg-[#020617] border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Country</label>
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
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Venue Construct</label>
              <select 
                className="w-full bg-[#020617] border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                value={formData.venue_type}
                onChange={(e) => setFormData({ ...formData, venue_type: e.target.value })}
              >
                <option value="Stadium">Stadium</option>
                <option value="Mall">Shopping Mall</option>
                <option value="Concert">Concert Hall</option>
                <option value="Transit">Transit Hub</option>
                <option value="Street">City Street / Plaza</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-800 space-y-4">
               <h3 className="text-sm font-semibold text-cyan-500 flex items-center gap-2">
                 <Users className="w-4 h-4" /> Capacity Logistics
               </h3>
               
               <div className="space-y-2">
                 <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Maximum Fire Capacity</label>
                 <input 
                   type="number"
                   min="1"
                   className="w-full bg-[#020617] border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                   value={formData.capacity}
                   onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                 />
                 <p className="text-[10px] text-slate-500 font-mono">Total allowed physical entities deployed in sector.</p>
               </div>

               <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-amber-500 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Warning Threshold (Persons)</label>
                    <input 
                      type="number"
                      min="1"
                      className="w-full bg-[#020617] border border-amber-900/40 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500 transition-colors"
                      value={formData.warning_threshold}
                      onChange={(e) => setFormData({ ...formData, warning_threshold: parseInt(e.target.value) || 0 })}
                    />
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      ≈ {formData.capacity > 0 ? Math.round((formData.warning_threshold / formData.capacity) * 100) : 0}% of capacity
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-rose-500 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Critical Threshold (Persons)</label>
                    <input 
                      type="number"
                      min="1"
                      className="w-full bg-[#020617] border border-rose-900/40 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-rose-500 transition-colors"
                      value={formData.critical_threshold}
                      onChange={(e) => setFormData({ ...formData, critical_threshold: parseInt(e.target.value) || 0 })}
                    />
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      ≈ {formData.capacity > 0 ? Math.round((formData.critical_threshold / formData.capacity) * 100) : 0}% of capacity
                    </div>
                  </div>
               </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 space-y-4">
               <h3 className="text-sm font-semibold text-cyan-500 flex items-center gap-2">
                 <Users className="w-4 h-4" /> Manual Staffing Requirements (Personnel Count)
               </h3>
               <p className="text-[10px] text-slate-500 font-mono mb-2">Configure expected staffing based on live threat levels.</p>

               <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Low</label>
                    <input 
                      type="number" min="0"
                      className="w-full bg-[#020617] border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                      value={formData.staffing_config.low}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        staffing_config: { ...formData.staffing_config, low: parseInt(e.target.value) || 0 } 
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Medium</label>
                    <input 
                      type="number" min="0"
                      className="w-full bg-[#020617] border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                      value={formData.staffing_config.medium}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        staffing_config: { ...formData.staffing_config, medium: parseInt(e.target.value) || 0 } 
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-amber-500 font-semibold">High</label>
                    <input 
                      type="number" min="0"
                      className="w-full bg-[#020617] border border-amber-900/40 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-amber-500 transition-colors text-sm"
                      value={formData.staffing_config.high}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        staffing_config: { ...formData.staffing_config, high: parseInt(e.target.value) || 0 } 
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-rose-500 font-semibold">Critical</label>
                    <input 
                      type="number" min="0"
                      className="w-full bg-[#020617] border border-rose-900/40 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-rose-500 transition-colors text-sm"
                      value={formData.staffing_config.critical}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        staffing_config: { ...formData.staffing_config, critical: parseInt(e.target.value) || 0 } 
                      })}
                    />
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
            Cancel
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
