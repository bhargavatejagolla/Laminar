"use client";

import { Save, User, Settings, Bell, Shield, Key, Activity, Server, Cpu, Database, HardDrive, Wifi, Users } from "lucide-react";
import { useState } from "react";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import Link from "next/link";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("account");
  const [isSaving, setIsSaving] = useState(false);
  const { data: healthData, isLoading: isHealthLoading } = useSystemHealth();

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setIsSaving(false);
  };

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-[20%] w-[800px] h-[300px] bg-cyan-700/10 rounded-[100%] blur-[120px] pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10 relative z-10 px-2 mt-4">
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="absolute inset-0 bg-cyan-500/20 blur-[15px] group-hover:blur-[25px] transition-all rounded-full" />
            <div className="p-3.5 bg-cyan-950/40 border border-cyan-500/40 rounded-2xl relative z-10 shadow-[inset_0_0_20px_rgba(34,211,238,0.2)]">
              <Settings className="w-8 h-8 text-cyan-400 group-hover:rotate-90 transition-transform duration-700" />
            </div>
          </div>
          <div>
             <h1 className="text-4xl font-black tracking-[0.05em] uppercase text-white mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
               System Preferences
             </h1>
             <p className="text-sm font-bold text-slate-400 tracking-widest uppercase">
               Global Architecture & Operations
             </p>
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="group relative flex items-center gap-2 px-8 py-3 bg-cyan-500/10 hover:bg-cyan-400/20 text-cyan-400 font-black rounded-xl transition-all border border-cyan-500/30 overflow-hidden uppercase tracking-widest text-sm"
        >
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-400 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          {isSaving ? <span className="animate-spin w-4 h-4 rounded-full border-t-2 border-cyan-400 border-r-2" /> : <Save className="w-5 h-5" />}
          {isSaving ? "Syncing..." : "Update Config"}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8 relative z-10">
        {/* Superior Navigation Sidebar */}
        <div className="w-full md:w-72 space-y-3 flex-shrink-0">
          {[
            { id: "account", icon: User, label: "Operator Profile", href: null },
            { id: "api", icon: Key, label: "API Credentials", href: null },
            { id: "health", icon: Activity, label: "System Health", href: null },
            { id: "alerts", icon: Bell, label: "Notification Rules", href: null },
            { id: "security", icon: Users, label: "Access Control", href: "/settings/access-control" },
          ].map((tab) =>
            tab.href ? (
              <Link key={tab.id} href={tab.href}
                className="group relative w-full flex items-center gap-3 px-5 py-4 text-[13px] font-black uppercase tracking-widest rounded-xl transition-all border border-transparent bg-[#081428]/40 hover:bg-[#081428]/80 hover:border-slate-700/50 text-slate-400 hover:text-slate-200">
                <tab.icon className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />{tab.label}
              </Link>
            ) : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-5 py-4 text-[13px] font-black uppercase tracking-widest rounded-xl transition-all border ${
                  activeTab === tab.id
                    ? "bg-cyan-950/40 border-cyan-500/50 text-cyan-400 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)] relative overflow-hidden"
                    : "bg-[#081428]/40 border-transparent text-slate-400 hover:bg-[#081428]/80 hover:border-slate-700/50 hover:text-slate-200"
                }`}
              >
                {activeTab === tab.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]" />}
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-cyan-400' : 'text-slate-500'}`} />
                {tab.label}
              </button>
            )
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-gradient-to-br from-[#081428]/90 to-[#040a12]/95 backdrop-blur-2xl border border-slate-700/40 rounded-2xl p-8 shadow-[inset_0_0_50px_rgba(34,211,238,0.03)] min-h-[500px] relative overflow-hidden">
          
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none text-[150px] leading-none font-black text-cyan-500/20 mix-blend-overlay">
            {activeTab.toUpperCase().substring(0, 3)}
          </div>
          
          {activeTab === "account" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 relative z-10">
              <h2 className="text-2xl font-black tracking-widest uppercase mb-8 flex items-center gap-3 border-b border-cyan-500/20 pb-4">
                <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
                   <User className="w-5 h-5 text-cyan-400" />
                </div>
                Operator Parameters
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3 group">
                  <label className="text-[10px] uppercase tracking-widest text-cyan-500/80 font-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full group-focus-within:animate-ping"></span> Callsign / Name
                  </label>
                  <input type="text" defaultValue="Admin Overwatch" className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-cyan-400 focus:bg-[#081428] transition-all shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] font-medium" />
                </div>
                <div className="space-y-3 opacity-80 cursor-not-allowed">
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Clearance Level</label>
                  <input type="text" disabled defaultValue="Commander (Level 5)" className="w-full bg-black/40 border border-slate-800 text-slate-500 font-mono rounded-lg px-4 py-3 cursor-not-allowed" />
                </div>
                <div className="space-y-3 md:col-span-2 group">
                  <label className="text-[10px] uppercase tracking-widest text-cyan-500/80 font-black flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full group-focus-within:animate-ping"></span> Authentication Email
                  </label>
                  <input type="email" defaultValue="admin@laminar.ai" className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-cyan-400 focus:bg-[#081428] transition-all shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] font-mono" />
                </div>
              </div>
            </div>
          )}

          {activeTab === "api" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 relative z-10">
              <h2 className="text-2xl font-black tracking-widest uppercase mb-6 flex items-center gap-3 border-b border-indigo-500/20 pb-4">
                <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/30">
                   <Key className="w-5 h-5 text-indigo-400" />
                </div>
                Enterprise API Access
              </h2>
              <p className="text-sm text-slate-400 tracking-wide mb-8 border-l-2 border-indigo-500/50 pl-3">
                Manage external integrations and API tokens for automated ingestion systems.
              </p>
              
              <div className="p-5 bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl flex items-center justify-between group hover:border-indigo-500/50 transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                 <div>
                    <h3 className="font-bold text-slate-200 mb-1.5 uppercase tracking-widest text-xs flex items-center gap-2">
                       <Shield className="w-3.5 h-3.5 text-indigo-400" /> Production Webhook Key
                    </h3>
                    <p className="text-sm font-mono text-indigo-400/80 bg-indigo-950/30 px-3 py-1 rounded inline-block">lmr_prod_898492048992_xxxx</p>
                 </div>
                 <button className="px-4 py-2 text-[10px] font-black tracking-widest uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-lg hover:bg-rose-500 hover:text-white transition-all shadow-[0_0_15px_rgba(244,63,94,0.1)]">Revoke Access</button>
              </div>

              <button className="w-full py-4 border border-dashed border-indigo-500/30 rounded-xl text-indigo-400 font-bold tracking-widest uppercase text-xs hover:border-indigo-400 hover:bg-indigo-500/10 transition-all flex justify-center items-center gap-2">
                <span className="text-lg">+</span> Generate Secure Token
              </button>
            </div>
          )}

          {activeTab === "health" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 relative z-10">
              <h2 className="text-2xl font-black tracking-widest uppercase mb-6 flex items-center gap-3 border-b border-rose-500/20 pb-4">
                <div className="p-2 bg-rose-500/10 rounded-lg border border-rose-500/30">
                   <Activity className="w-5 h-5 text-rose-400" />
                </div>
                System Telemetry
              </h2>
              
              {isHealthLoading ? (
                 <div className="flex justify-center py-20">
                   <div className="relative flex items-center justify-center">
                     <div className="w-16 h-16 border-t-2 border-b-2 border-rose-500 rounded-full animate-spin"></div>
                     <div className="absolute inset-0 border-l-2 border-r-2 border-cyan-500 rounded-full animate-spin direction-reverse shadow-[0_0_15px_rgba(34,211,238,0.5)]"></div>
                     <Activity className="w-6 h-6 text-rose-400 absolute animate-pulse" />
                   </div>
                 </div>
              ) : healthData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <div className="group bg-[#020b16]/80 flex-col items-center justify-center gap-2 border border-[#1e3a5f]/50 p-5 rounded-xl flex hover:border-indigo-500/50 transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                       <Cpu className="w-7 h-7 text-indigo-400 group-hover:scale-110 transition-transform duration-300" />
                       <span className="text-3xl font-mono font-black text-white">{healthData.metrics.cpu_usage}%</span>
                       <span className="text-[9px] text-indigo-400 uppercase tracking-[0.2em] font-black bg-indigo-500/10 px-2 py-0.5 rounded">CPU Load</span>
                    </div>
                    <div className="group bg-[#020b16]/80 flex-col items-center justify-center gap-2 border border-[#1e3a5f]/50 p-5 rounded-xl flex hover:border-emerald-500/50 transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                       <HardDrive className="w-7 h-7 text-emerald-400 group-hover:scale-110 transition-transform duration-300" />
                       <span className="text-3xl font-mono font-black text-white">{healthData.metrics.memory_usage}%</span>
                       <span className="text-[9px] text-emerald-400 uppercase tracking-[0.2em] font-black bg-emerald-500/10 px-2 py-0.5 rounded">Memory</span>
                    </div>
                    <div className="group bg-[#020b16]/80 flex-col items-center justify-center gap-2 border border-[#1e3a5f]/50 p-5 rounded-xl flex hover:border-amber-500/50 transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                       <Database className="w-7 h-7 text-amber-400 group-hover:scale-110 transition-transform duration-300" />
                       <span className="text-lg font-mono font-black text-white uppercase tracking-wider truncate w-full text-center">{healthData.components.database}</span>
                       <span className="text-[9px] text-amber-400 uppercase tracking-[0.2em] font-black bg-amber-500/10 px-2 py-0.5 rounded">DB Status</span>
                    </div>
                    <div className="group bg-[#020b16]/80 flex-col items-center justify-center gap-2 border border-[#1e3a5f]/50 p-5 rounded-xl flex hover:border-cyan-500/50 transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
                       <div className={`absolute top-0 right-0 w-2 h-2 m-2 rounded-full ${healthData.components.scheduler_running ? 'bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,1)]' : 'bg-rose-500'} `}></div>
                       <Server className={`w-7 h-7 ${healthData.components.scheduler_running ? 'text-cyan-400 group-hover:scale-110 transition-transform duration-300' : 'text-slate-600'}`} />
                       <span className={`text-lg font-mono font-black uppercase tracking-wider ${healthData.components.scheduler_running ? 'text-white' : 'text-slate-500'}`}>{healthData.components.scheduler_running ? 'Running' : 'Offline'}</span>
                       <span className="text-[9px] text-cyan-400 uppercase tracking-[0.2em] font-black bg-cyan-500/10 px-2 py-0.5 rounded">Scheduler</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                     <div className="bg-[#020b16]/60 border border-[#1e3a5f]/40 p-6 rounded-xl shadow-[inset_0_0_20px_rgba(0,0,0,0.3)]">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-[#1e3a5f]/50 pb-3 mb-5 flex items-center gap-2">
                          <Wifi className="w-4 h-4 text-slate-400" /> Core Microservices
                        </h4>
                        <ul className="space-y-4">
                           <li className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                             <span className="text-slate-400 font-medium">Active Cameras</span>
                             <span className="font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(34,211,238,0.1)]">{healthData.metrics.total_cameras}</span>
                           </li>
                           <li className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                             <span className="text-slate-400 font-medium">Vision Workers</span>
                             <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(99,102,241,0.1)]">{healthData.components.vision_workers}</span>
                           </li>
                           <li className="flex justify-between items-center text-sm pt-1">
                             <span className="text-slate-400 font-medium tracking-wide">Overall Diagnostic</span>
                             <span className={`font-mono font-black uppercase tracking-wider px-2.5 py-1 rounded-md border ${healthData.status === 'healthy' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]' : 'text-rose-400 border-rose-500/30 bg-rose-500/10'}`}>
                               {healthData.status}
                             </span>
                           </li>
                        </ul>
                     </div>
                     <div className="bg-[#020b16]/60 border border-[#1e3a5f]/40 p-6 rounded-xl shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[50px] -z-10"></div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-[#1e3a5f]/50 pb-3 mb-5 flex items-center gap-2">
                           <Activity className="w-4 h-4 text-slate-400" /> Matrix Traffic
                        </h4>
                        <ul className="space-y-4">
                           <li className="flex justify-between items-center text-sm border-b border-white/5 pb-2 group">
                             <span className="text-slate-400 font-medium group-hover:text-amber-400 transition-colors">Network RX</span>
                             <span className="font-mono font-bold text-slate-200">{healthData.metrics.network_rx}</span>
                           </li>
                           <li className="flex justify-between items-center text-sm border-b border-white/5 pb-2 group">
                             <span className="text-slate-400 font-medium group-hover:text-amber-400 transition-colors">Network TX</span>
                             <span className="font-mono font-bold text-slate-200">{healthData.metrics.network_tx}</span>
                           </li>
                           <li className="flex justify-between items-center text-sm pt-1">
                             <span className="text-slate-400 font-medium">Last Sync</span>
                             <span className="font-mono text-xs font-bold text-amber-500/80 bg-amber-500/10 px-2 py-1 rounded">{healthData.metrics.last_minute_metric ? new Date(healthData.metrics.last_minute_metric).toLocaleTimeString() : 'N/A'}</span>
                           </li>
                        </ul>
                     </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 text-center py-16 font-mono text-sm tracking-widest uppercase border border-dashed border-slate-700/50 rounded-xl bg-black/20">Diagnostic Payload Unavailable</div>
              )}
            </div>
          )}

          {/* Fallback for other tabs */}
          {["alerts"].includes(activeTab) && (
            <div className="flex flex-col items-center justify-center h-[400px] animate-in fade-in zoom-in-95 duration-500 relative">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/20 via-transparent to-transparent pointer-events-none"></div>
              
              <div className="relative group mb-6">
                 <div className="absolute inset-0 bg-rose-500/20 blur-xl group-hover:blur-2xl transition-all rounded-full pointer-events-none"></div>
                 <div className="w-20 h-20 rounded-2xl bg-[#020b16] border border-rose-500/30 flex items-center justify-center shadow-[inset_0_0_20px_rgba(244,63,94,0.1)] relative z-10 rotate-3 group-hover:rotate-6 transition-transform">
                   <Bell className="w-10 h-10 text-rose-400 group-hover:scale-110 transition-transform duration-500" />
                 </div>
              </div>
              
              <h3 className="text-2xl font-black tracking-widest uppercase text-white mb-3">Module Offline</h3>
              
              <div className="text-sm text-center max-w-sm text-slate-400 font-medium leading-relaxed bg-[#020b16]/50 p-4 border border-rose-500/10 rounded-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500/50"></div>
                This configuration panel is locked by your current system tier. Upgrade to <span className="text-cyan-400 font-bold">Laminar Enterprise</span> for full Access.
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
