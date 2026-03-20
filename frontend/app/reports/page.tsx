"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Calendar, Filter, FileBarChart, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import AnalyticsCharts from "@/components/reports/analytics-charts";
import { useVenues } from "@/hooks/useVenues";
import { api } from "@/services/api";

export default function ReportsPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState("daily");
  const [selectedVenueId, setSelectedVenueId] = useState("");
  
  const { data: venues } = useVenues();

  const { data: managementReport, isLoading: reportLoading } = useQuery({
    queryKey: ["management-report", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return null;
      const res = await api.get(`/reports/management/${selectedVenueId}`);
      return res.data;
    },
    enabled: !!selectedVenueId,
  });

  const handleGenerateReport = async () => {
    if (!selectedVenueId) {
       alert("Please select a target locale to compile the report.");
       return;
    }
    
    setIsGenerating(true);
    try {
       // Hit the backend for real CSV stream
       const response = await api.get(`/reports/csv/${selectedVenueId}`, {
          responseType: 'blob' // Important for file downloads
       });
       
       // Forge DOM element to execute automated file transfer
       const url = window.URL.createObjectURL(new Blob([response.data]));
       const link = document.createElement('a');
       link.href = url;
       link.setAttribute('download', `intel_report_${selectedVenueId}_${format(new Date(), 'yyyyMMdd')}.csv`);
       document.body.appendChild(link);
       link.click();
       link.remove();
       
    } catch (err) {
       console.error("Transmission Intercepted", err);
       alert("Failed to compile CSV metrics. Ensure sufficient historical data exists.");
    } finally {
       setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-white pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.15)] flex-shrink-0">
            <FileBarChart className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
             <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
               Intelligence Reports
             </h1>
             <p className="text-sm font-medium text-slate-400">
               Generate aggregate analytics and compliance exports for all monitored locales.
             </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
        
        {/* Report Generation Configuration */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold tracking-wide flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
              <Filter className="w-5 h-5 text-cyan-500" /> Report Parameters
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Report Type Selector */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Time Horizon</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setReportType("daily")}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                      reportType === "daily" 
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.1)]" 
                      : "bg-[#0b1325] border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    24 Hours
                  </button>
                  <button 
                    onClick={() => setReportType("weekly")}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                      reportType === "weekly" 
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.1)]" 
                      : "bg-[#0b1325] border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    7 Days
                  </button>
                  <button 
                    onClick={() => setReportType("monthly")}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                      reportType === "monthly" 
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.1)]" 
                      : "bg-[#0b1325] border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    30 Days
                  </button>
                </div>
              </div>

              {/* Target Venue */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Target Locale</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-cyan-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select 
                    value={selectedVenueId}
                    onChange={(e) => setSelectedVenueId(e.target.value)}
                    className="w-full bg-[#0b1325] border border-slate-700 text-sm rounded-lg pl-9 pr-4 py-2 text-white focus:outline-none focus:border-cyan-500 appearance-none"
                  >
                    <option value="" disabled>Select a Venue Matrix</option>
                    {Array.isArray(venues) && venues.map(v => (
                       <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Data Scope */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Data Inclusions</label>
                <div className="space-y-2">
                   <label className="flex items-center gap-3 p-2 rounded-lg border border-slate-800 bg-[#0b1325] cursor-pointer hover:border-slate-700">
                     <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50" />
                     <span className="text-sm font-medium text-slate-300">Predictive Flow Analysis</span>
                   </label>
                   <label className="flex items-center gap-3 p-2 rounded-lg border border-slate-800 bg-[#0b1325] cursor-pointer hover:border-slate-700">
                     <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50" />
                     <span className="text-sm font-medium text-slate-300">Security Incidence Log</span>
                   </label>
                </div>
              </div>
            </div>

            <button
               onClick={handleGenerateReport}
               disabled={isGenerating}
               className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(34,211,238,0.2)] hover:shadow-[0_0_30px_rgba(34,211,238,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
               {isGenerating ? (
                 <>
                   <Loader2 className="w-5 h-5 animate-spin" /> Compiling Report Matrix...
                 </>
               ) : (
                 <>
                   <Download className="w-5 h-5" /> Execute Download Sequence
                 </>
               )}
            </button>
          </div>
        </div>

        {/* Recent Report Logs */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold tracking-wide flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
              <FileText className="w-5 h-5 text-slate-400" /> Executive Summaries
            </h2>
            
            <div className="space-y-3">
              {!selectedVenueId ? (
                <div className="text-sm text-slate-500 text-center py-4">Select a venue to view reports</div>
              ) : reportLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-cyan-500 animate-spin" /></div>
              ) : managementReport ? (
                <div className="group flex flex-col p-4 rounded-lg border border-slate-800 bg-[#0b1325] hover:border-cyan-500/30 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-800 rounded text-slate-400 group-hover:text-cyan-400 transition-colors">
                         <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                         <span className="text-sm font-medium text-slate-200">Daily Management Report</span>
                         <span className="text-[10px] text-slate-500 uppercase tracking-widest">{format(new Date(managementReport.report_generated_at), "dd MMM yyyy HH:mm")}</span>
                      </div>
                    </div>
                    <button onClick={handleGenerateReport} className="p-2 hover:bg-slate-800 rounded-lg text-cyan-400 transition-colors">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                     <div className="bg-[#0f172a] p-2 rounded border border-slate-800">
                       <p className="text-slate-500 mb-1">Peak Crowd</p>
                       <p className="font-mono text-slate-300">{managementReport.daily_summary?.peak_crowd ?? 0}</p>
                     </div>
                     <div className="bg-[#0f172a] p-2 rounded border border-slate-800">
                       <p className="text-slate-500 mb-1">Total Alerts</p>
                       <p className="font-mono text-rose-400">{managementReport.alerts_today ?? 0}</p>
                     </div>
                     <div className="bg-[#0f172a] p-2 rounded border border-slate-800 col-span-2 flex justify-between items-center">
                       <span className="text-slate-500">Predicted Risk</span>
                       <span className="font-mono text-amber-400 capitalize">{managementReport.prediction?.predicted_level || "Nominal"}</span>
                     </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 text-center py-4">No recent intelligence available for this locale.</div>
              )}
            </div>
          </div>
        </div>

      </div>

      <AnalyticsCharts venueId={selectedVenueId} />
    </div>
  );
}
