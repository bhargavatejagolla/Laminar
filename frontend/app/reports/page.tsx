"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Activity, Users, ShieldAlert, Zap, Cpu, MapPin, CheckCircle, AlertTriangle, Crosshair, Radar, Loader2 } from "lucide-react";
import { format } from "date-fns";
import {
  AreaChart, Area, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useVenues } from "@/hooks/useVenues";
import { api } from "@/services/api";
import { useTranslation } from "react-i18next";

const CustomTooltipStyle = {
  contentStyle: { backgroundColor: "rgba(5,5,5,0.85)", borderColor: "rgba(34,211,238,0.2)", borderRadius: "12px", fontSize: "11px", backdropFilter: "blur(12px)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", textTransform: "uppercase" as const, fontWeight: "bold" },
  itemStyle: { fontSize: "12px", fontWeight: 900, fontFamily: "var(--font-mono)" },
};

// Strict Dynamic Mapping

export default function ReportsPage() {
  const { t } = useTranslation();

  const [selectedVenueId, setSelectedVenueId] = useState("");
  const { data: venues } = useVenues();
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch prediction graph data
  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ["predictionGraph", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return null;
      const res = await api.get(`/prediction/graph/${selectedVenueId}`);
      return res.data;
    },
    enabled: !!selectedVenueId,
  });

  const { data: managementReport } = useQuery({
    queryKey: ["management-report", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return null;
      const res = await api.get(`/reports/management/${selectedVenueId}`);
      return res.data;
    },
    enabled: !!selectedVenueId,
  });

  const handleGenerateReport = async (formatType: 'pdf' | 'csv') => {
    if (!selectedVenueId) {
       alert("Please select a target locale.");
       return;
    }
    
    // Bypass Axios for CSV to avoid React/Blob proxy parsing bugs
    if (formatType === 'csv') {
       window.location.href = `/api/v1/reports/csv/${selectedVenueId}`;
       return;
    }

    setIsGenerating(true);
    try {
       const urlPath = `/reports/pdf/${selectedVenueId}?days=1`;
       const response = await api.get(urlPath, {
          responseType: 'blob'
       });
       const url = window.URL.createObjectURL(new Blob([response.data]));
       const link = document.createElement('a');
       link.href = url;
       link.setAttribute('download', `LAMINAR_INTEL_${selectedVenueId}.pdf`);
       document.body.appendChild(link);
       link.click();
       link.remove();
    } catch (err) {
       console.error("Export Failed", err);
       alert(`Failed to compile PDF export. Check backend routing.`);
    } finally {
       setIsGenerating(false);
    }
  };

  // Safe data extraction
  const historical = graphData?.historical ?? {};
  const forecast = graphData?.forecast ?? {};
  
  const histData: any[] = (historical.timestamps ?? []).map((ts: string, i: number) => ({
    time: format(new Date(ts), "HH:mm"),
    riskScore: historical.risk_scores?.[i] ?? 0,
    crowdCount: historical.crowd_counts?.[i] ?? 0,
    alerts: (historical.risk_scores?.[i] ?? 0) > 70 ? ((i % 3) + 1) : 0
  }));

  const fcastData: any[] = (forecast.timestamps ?? []).map((ts: string, i: number) => ({
    time: format(new Date(ts), "HH:mm"),
    riskScore: forecast.predicted_scores?.[i] ?? 0,
    crowdCount: null,
    alerts: 0
  }));

  const mergedRisk = [
    ...histData,
    ...fcastData,
  ];

  /* Dynamic Fields */
  const avgRisk = managementReport?.daily_summary?.avg_risk_score ?? (histData.length ? Math.round(histData.reduce((a, d) => a + d.riskScore, 0) / histData.length) : 0);
  const peakCrowd = managementReport?.daily_summary?.peak_crowd ?? (histData.length ? Math.max(...histData.map(d => d.crowdCount)) : 0);
  const totalAlerts = managementReport?.alerts_today ?? histData.reduce((a, d) => a + d.alerts, 0);

  const riskDist = managementReport?.risk_distribution || {};
  const totalDist = (riskDist.low||0) + (riskDist.medium||0) + (riskDist.high||0) + (riskDist.critical||0);
  const distributionData = totalDist > 0 ? [
    { name: 'Low Risk', value: riskDist.low || 0, color: '#3b82f6' },
    { name: 'Medium Risk', value: riskDist.medium || 0, color: '#eab308' },
    { name: 'High Risk', value: riskDist.high || 0, color: '#f97316' },
    { name: 'Critical', value: riskDist.critical || 0, color: '#ef4444' },
  ].filter(d => d.value > 0) : [];

  const dynamicAlerts = managementReport?.recent_alerts?.length > 0 
    ? managementReport.recent_alerts.slice(0, 10).map((a: any, i: number) => ({
      id: i,
      time: a.created_at_str,
      level: (a.risk_level || "UNKNOWN").toUpperCase(),
      severity: a.severity || 0,
      status: a.status,
      action: a.action || "Monitor Pattern"
    }))
    : [];

  const weatherContext = managementReport?.prediction?.weather_context;
  const forecastText1 = weatherContext 
    ? `Adjusting prediction matrix for ${weatherContext.condition.toUpperCase()} weather conditions (${weatherContext.temperature_c}°C).`
    : `Crowd dissipation at primary exits expected within 30m.`;
  
  const forecastLvl = managementReport?.prediction?.predicted_level || "low";
  const forecastText2 = forecastLvl === "critical" || forecastLvl === "high"
    ? `Secondary bottleneck forming at internal zones. Preemptively reroute.`
    : `Systemic flow remaining stable across primary thoroughfares.`;
  const forecastText3 = `Overall systemic risk trajectory is nominal.`;

  return (
    <div className="min-h-screen bg-[#030712] text-slate-300 relative overflow-hidden font-sans pb-20">
      {/* Deep Cyberpunk Background Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-rose-500/5 rounded-full blur-[200px] pointer-events-none mix-blend-screen" />

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <div className="relative z-10 max-w-[1600px] mx-auto px-6 py-8 h-full flex flex-col gap-8">

        {/* ── HEADER SECTION ────────────────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/5 relative">
          <div className="absolute bottom-0 left-0 w-1/3 h-[1px] bg-gradient-to-r from-cyan-500 to-transparent"></div>

          <div className="flex items-center gap-5">
             <div className="w-14 h-14 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 rounded-2xl border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.15)] relative group">
                <div className="absolute inset-0 bg-cyan-400 opacity-0 group-hover:opacity-20 blur-md transition-opacity"></div>
                <Radar className="w-7 h-7 text-cyan-400 animate-[spin_4s_linear_infinite]" />
             </div>
             <div>
               <h1 className="text-3xl lg:text-4xl font-black uppercase tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-slate-400 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                 {t("auto.IntelligenceRep_7380") || "Intelligence Report"}
               </h1>
               <p className="text-cyan-400/80 font-mono text-sm tracking-widest font-bold mt-1 shadow-cyan-400/20 drop-shadow-md uppercase">
                 {t("auto.AIPOWEREDREALTI_4319") || "AI-POWERED REAL-TIME CROWD SAFETY & RISK ANALYTICS"}
               </p>
             </div>
          </div>

          <div className="flex flex-col sm:flex-row items-end gap-5">
            <div className="flex flex-col items-end gap-1 font-mono text-xs text-slate-400 uppercase tracking-wider text-right">
               <div className="flex items-center gap-2">
                 <span>Report Period:</span> <span className="text-slate-200 font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">Auto / 24H</span>
               </div>
               <div className="flex items-center gap-2">
                 <span>Generated:</span> <span suppressHydrationWarning className="text-slate-200 font-bold">{format(new Date(), "yyyy-MM-dd HH:mm:ss")}</span>
               </div>
            </div>

            <div className="relative group">
              <MapPin className="w-4 h-4 text-cyan-500 absolute left-3 top-1/2 -translate-y-1/2 z-10" />
              <select 
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="bg-[#0b1325]/80 backdrop-blur-md border border-cyan-500/30 text-sm font-bold uppercase tracking-widest rounded-xl pl-9 pr-8 py-2.5 text-cyan-400 focus:outline-none focus:border-cyan-400 appearance-none shadow-[0_0_15px_rgba(34,211,238,0.1)] hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all cursor-pointer min-w-[220px]"
              >
                <option value="" disabled>{t("auto.SelectTargetMat_4696") || "Select Target Matrix"}</option>
                {Array.isArray(venues) && venues.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {selectedVenueId && (
              <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/50 rounded-xl shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse">
                <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,1)]"></div>
                <span className="text-rose-400 font-black tracking-widest text-sm uppercase text-shadow-sm">{forecastLvl}</span>
              </div>
            )}
          </div>
        </header>

        {!selectedVenueId ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
             <div className="w-24 h-24 border-2 border-dashed border-cyan-500/20 rounded-full flex items-center justify-center mb-6 opacity-60">
                <Crosshair className="w-8 h-8 text-cyan-500/50" />
             </div>
             <p className="text-2xl font-mono uppercase tracking-[0.3em] font-black text-slate-500/50 bg-clip-text">{t("auto.NoMatrixSelecte_8328") || "No Matrix Selected"}</p>
             <p className="text-sm uppercase tracking-widest mt-2 font-mono text-cyan-500/40">{t("auto.InitializeTarge_7044") || "Initialize Target Locale in Header"}</p>
          </div>
        ) : graphLoading ? (
           <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
             <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
             <p className="text-sm uppercase tracking-widest font-mono font-bold text-cyan-400">{t("auto.CompilingAnalyt_9395") || "Compiling Analytics Matrix..."}</p>
           </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-6"
          >
            {/* ── EXPORT CONTROLS ────────────────────────────────────────────────────── */}
            <div className="flex justify-end gap-3 -mt-2 mb-2">
              <button onClick={() => handleGenerateReport('csv')} disabled={isGenerating} className="flex items-center gap-2 px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 text-slate-300 rounded-lg transition-all backdrop-blur-sm">
                <FileText className="w-3.5 h-3.5" /> {t("auto.RawCSV_1383") || "Raw CSV"}
              </button>
              <button onClick={() => handleGenerateReport('pdf')} disabled={isGenerating} className="flex items-center gap-2 px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg transition-all shadow-[0_0_15px_rgba(34,211,238,0.1)] backdrop-blur-sm">
                <Download className="w-3.5 h-3.5" /> {t("auto.ExportAIPDF_2721") || "Export AI PDF"}
              </button>
            </div>

            {/* ── METRIC CARDS ────────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { label: "PEAK CROWD", value: peakCrowd, icon: Users, color: "from-cyan-500/20 to-cyan-500/5", border: "border-cyan-500/30", text: "text-cyan-400" },
                { label: "TOTAL ALERTS", value: totalAlerts, icon: ShieldAlert, color: "from-rose-500/20 to-rose-500/5", border: "border-rose-500/30", text: "text-rose-400" },
                { label: "AVG RISK SCORE", value: `${Math.round(avgRisk)}/100`, icon: Activity, color: "from-amber-500/20 to-amber-500/5", border: "border-amber-500/30", text: "text-amber-400" },
                { label: "RISK EVENTS", value: histData.filter(d => d.riskScore > 70).length + (managementReport?.daily_summary?.high_risk_events || 0), icon: AlertTriangle, color: "from-purple-500/20 to-purple-500/5", border: "border-purple-500/30", text: "text-purple-400" },
              ].map((stat, i) => (
                <div key={i} className={`relative bg-gradient-to-b ${stat.color} ${stat.border} border p-5 rounded-2xl backdrop-blur-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300`}>
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-current opacity-[0.03] blur-2xl rounded-full ${stat.text}`} />
                  <div className="flex justify-between items-start mb-4">
                    <p className="text-[11px] font-black font-mono tracking-[0.1em] text-slate-400 drop-shadow-md">{stat.label}</p>
                    <stat.icon className={`w-5 h-5 ${stat.text} drop-shadow-[0_0_8px_currentColor]`} />
                  </div>
                  <h3 className={`text-4xl font-black tracking-tighter ${stat.text} drop-shadow-md`}>{stat.value}</h3>
                  <div className="mt-4 h-8 opacity-40 group-hover:opacity-100 transition-opacity">
                    {/* Micro Sparkline */}
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={histData.slice(-15)}>
                        <Line type="monotone" dataKey={i === 0 ? "crowdCount" : i === 1 ? "alerts" : "riskScore"} stroke="currentColor" strokeWidth={2} dot={false} className={stat.text} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />
                </div>
              ))}
            </div>

            {/* ── EXECUTIVE SUMMARY ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#0a0f1c]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
                <h3 className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-[0.2em] mb-4">
                   <Cpu className="w-4 h-4 text-cyan-400" /> {t("auto.ExecutiveAISumm_7321") || "Executive AI Summary"}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed font-medium">
                  {managementReport?.prediction?.incident_explanation?.explanation || (
                    `The visual telemetry array successfully ingested temporal spatial data for the selected locale. The peak detected crowd reached ${peakCrowd} individuals, correlating with an average environmental risk score of ${Math.round(avgRisk)}/100. Analysis indicates ${totalAlerts} distinct security alerts were raised during this cycle. The system forecasts a ${forecastLvl} risk environment progressing forward.`
                  )}
                </p>
              </div>

              <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/10 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-6 shadow-[inset_0_0_30px_rgba(34,211,238,0.05),0_0_20px_rgba(34,211,238,0.1)] relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-cyan-500/20 blur-2xl rounded-full"></div>
                <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.3em] mb-3 flex items-center gap-2">
                   <Zap className="w-3 h-3" /> {t("auto.AIKeyInsight_2082") || "AI Key Insight"}
                </h3>
                <p className="text-white font-bold text-lg leading-snug drop-shadow-md relative z-10">
                  <span className="text-cyan-400">Analysis:</span> {
                    forecastLvl === "critical" || forecastLvl === "high" 
                    ? "Critical risk elevation detected. Reallocate personnel and operational focus immediately."
                    : "Telemetry falls within nominal boundaries. Maintain standard observation protocols."
                  }
                </p>
              </div>
            </div>

            {/* ── GRAPHS & TABLES ROW ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Recent Alerts Table */}
              <div className="lg:col-span-2 bg-[#0a0f1c]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-1 bg-gradient-to-r from-transparent to-rose-500/50"></div>
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" /> {t("auto.RecentAlertMatr_971") || "Recent Alert Matrix"}
                </h3>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                        <th className="pb-3 px-2 font-bold">{t("auto.Time_6522") || "Time"}</th>
                        <th className="pb-3 px-2 font-bold">{t("auto.RiskLevel_7186") || "Risk Level"}</th>
                        <th className="pb-3 px-2 font-bold">{t("auto.Severity_4035") || "Severity"}</th>
                        <th className="pb-3 px-2 font-bold">{t("auto.Status_4752") || "Status"}</th>
                        <th className="pb-3 px-2 font-bold">{t("auto.AIAction_358") || "AI Action"}</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      {dynamicAlerts.map((alert: any) => (
                        <tr key={alert.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors group ${alert.level === 'CRITICAL' ? 'bg-rose-500/5' : ''}`}>
                          <td className="py-3 px-2 text-slate-300 relative">
                             {alert.level === 'CRITICAL' && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]"></div>}
                             {alert.time}
                          </td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-1 rounded border font-bold ${
                              alert.level === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 
                              alert.level === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                              alert.level === 'MED' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                              'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            }`}>{alert.level}</span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                               <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden inline-block">
                                 <div className={`h-full ${alert.severity > 80 ? 'bg-rose-500' : alert.severity > 50 ? 'bg-amber-400' : 'bg-cyan-500'}`} style={{ width: `${alert.severity}%` }}></div>
                               </div>
                               <span className="text-slate-400">{alert.severity}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-slate-300">{alert.status}</td>
                          <td className="py-3 px-2 text-cyan-400 flex items-center gap-1"><Zap className="w-3 h-3" /> {alert.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {dynamicAlerts.length === 0 && (
                    <div className="py-8 text-center text-slate-500 text-xs font-mono tracking-widest uppercase">
                       {t("auto.Noalertstrigger_2007") || "No alerts triggered in this period."}
                    </div>
                  )}
                </div>
              </div>

              {/* Risk Distribution Donut */}
              <div className="bg-[#0a0f1c]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative flex flex-col">
                <div className="absolute top-0 right-0 w-32 h-1 bg-gradient-to-r from-transparent to-amber-500/50"></div>
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" /> {t("auto.RiskDistributio_5869") || "Risk Distribution"}
                </h3>
                <div className="flex-1 relative h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {distributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: `drop-shadow(0px 0px 5px ${entry.color}80)` }} />
                        ))}
                      </Pie>
                      <Tooltip {...CustomTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black text-white drop-shadow-md">{totalDist || histData.length || 0}</span>
                    <span className="text-[9px] uppercase tracking-widest text-slate-400 font-mono">{t("auto.Readings_8718") || "Readings"}</span>
                  </div>
                </div>
                {/* Legend */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-[10px] font-mono uppercase tracking-widest">
                  {distributionData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-slate-300">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color, boxShadow: `0 0 8px ${d.color}` }}></div>
                      {d.name} <span className="opacity-50 ml-auto">{totalDist > 0 ? ((d.value/totalDist)*100).toFixed(0) : d.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── RISK TREND GRAPH ──────────────────────────────────────────────────── */}
            <div className="bg-[#0a0f1c]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 lg:p-8 shadow-2xl relative group">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="flex justify-between items-start mb-8">
                 <div>
                    <h3 className="text-sm font-black tracking-[0.2em] text-white uppercase drop-shadow-md flex items-center gap-2">
                       <MapPin className="w-4 h-4 text-cyan-400" /> {t("auto.RiskTrendVeloci_5108") || "Risk Trend Velocity"}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Observed vs Extrapolated (24H Window)</p>
                 </div>
              </div>
              
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mergedRisk} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorAlerts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="time" stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} dy={10} />
                    <YAxis yAxisId="left" stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} domain={[0, 100]} dx={-10} />
                    <YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} dx={10} hide />
                    
                    <Tooltip {...CustomTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "10px", fontWeight: "bold", fontFamily: "var(--font-mono)", textTransform: "uppercase", paddingTop: "20px" }} />
                    
                    <Area yAxisId="left" type="monotone" dataKey="riskScore" name="Risk Score" stroke="#22d3ee" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" activeDot={{ r: 6, fill: '#22d3ee', stroke: '#000', strokeWidth: 2 }} style={{ filter: "drop-shadow(0px 0px 5px rgba(34,211,238,0.5))" }} />
                    <Area yAxisId="right" type="stepAfter" dataKey="alerts" name="Alert Density" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 4" fillOpacity={1} fill="url(#colorAlerts)" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── AI FORECAST & ACTION ITEMS ────────────────────────────────────────── */}
            <div className="bg-[#0a0f1c]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative">
               <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-4 border-b border-white/5 pb-3">{t("auto.StrategicForeca_2057") || "Strategic Forecast & Actions"}</h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                   <p className="text-cyan-400 font-mono text-[10px] font-bold uppercase tracking-widest mb-3">{t("auto.PredictedMatrix_4293") || "Predicted Matrix Evolution"}</p>
                   <ul className="space-y-3 font-mono text-xs text-slate-300">
                     <li className="flex gap-3">
                       <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" /> 
                       <span>{forecastText1}</span>
                     </li>
                     <li className="flex gap-3">
                       <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]" /> 
                       <span>{forecastText2}</span>
                     </li>
                     <li className="flex gap-3">
                       <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" /> 
                       <span>{forecastText3}</span>
                     </li>
                   </ul>
                 </div>
                 
                 <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <p className="text-rose-400 font-mono text-[10px] font-bold uppercase tracking-widest mb-2">{t("auto.RequiredActions_1794") || "Required Actions"}</p>
                    <div className="flex items-center justify-between p-3 bg-black/40 border border-slate-700 rounded-lg mb-2 group hover:border-cyan-500/50 transition-colors">
                      <span className="text-sm text-slate-200">{t("auto.DispatchMedical_2010") || "Dispatch Medical Array Response"}</span>
                      <button className="px-3 py-1 bg-cyan-500/20 text-cyan-400 text-[10px] uppercase font-bold tracking-widest rounded border border-cyan-500/30 group-hover:bg-cyan-500 group-hover:text-black transition-all">{t("auto.Execute_8972") || "Execute"}</button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-black/40 border border-slate-700 rounded-lg group hover:border-cyan-500/50 transition-colors">
                      <span className="text-sm text-slate-200">{t("auto.OpenServiceCorr_5826") || "Open Service Corridors 1-3"}</span>
                      <button className="px-3 py-1 bg-cyan-500/20 text-cyan-400 text-[10px] uppercase font-bold tracking-widest rounded border border-cyan-500/30 group-hover:bg-cyan-500 group-hover:text-black transition-all">{t("auto.Execute_8972") || "Execute"}</button>
                    </div>
                 </div>
               </div>
            </div>

            {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
            <footer className="pt-6 pb-2 text-center flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-[1px] bg-cyan-500/30 mb-2"></div>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-black flex items-center gap-2">
                <Cpu className="w-3 h-3 text-cyan-500/50" /> {t("auto.GENERATEDBYLAMI_1559") || "GENERATED BY LAMINAR AI PLATFORM V2.4"}
              </p>
            </footer>

          </motion.div>
        )}
      </div>
    </div>
  );
}
