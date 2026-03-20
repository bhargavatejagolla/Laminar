"use client";

import { Save, User, Settings, Bell, Shield, Key, Activity, Server, Cpu, Database, HardDrive, Wifi } from "lucide-react";
import { useState } from "react";
import { useSystemHealth } from "@/hooks/useSystemHealth";

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
    <div className="min-h-screen bg-transparent text-white pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.15)] flex-shrink-0">
            <Settings className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
             <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
               System Preferences
             </h1>
             <p className="text-sm font-medium text-slate-400">
               Configure global architecture, API parameters, and operator credentials.
             </p>
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-400 hover:text-cyan-300 font-semibold rounded-lg transition-all"
        >
          {isSaving ? <span className="animate-spin w-4 h-4 rounded-full border-t-2 border-cyan-400 border-r-2" /> : <Save className="w-4 h-4" />}
          {isSaving ? "Saving Config..." : "Save Configuration"}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Navigation Sidebar */}
        <div className="w-full md:w-64 space-y-2 flex-shrink-0">
          {[
            { id: "account", icon: User, label: "Operator Profile" },
            { id: "api", icon: Key, label: "API Credentials" },
            { id: "health", icon: Activity, label: "System Health" },
            { id: "alerts", icon: Bell, label: "Notification Rules" },
            { id: "security", icon: Shield, label: "Access & Roles" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors border ${
                activeTab === tab.id
                  ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[inset_4px_0_0_rgba(34,211,238,1)]"
                  : "bg-transparent border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-8 shadow-inner min-h-[500px]">
          
          {activeTab === "account" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 border-b border-slate-800 pb-4">
                <User className="w-5 h-5 text-cyan-500" /> Operator Parameters
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Callsign / Name</label>
                  <input type="text" defaultValue="Admin Overwatch" className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Clearance Level</label>
                  <input type="text" disabled defaultValue="Commander (Level 5)" className="w-full bg-[#0b1325]/50 border border-slate-800 text-slate-500 rounded-lg px-4 py-2 cursor-not-allowed" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Authentication Email</label>
                  <input type="email" defaultValue="admin@laminar.ai" className="w-full bg-[#0b1325] border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors" />
                </div>
              </div>
            </div>
          )}

          {activeTab === "api" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 border-b border-slate-800 pb-4">
                <Key className="w-5 h-5 text-cyan-500" /> Enterprise API Access
              </h2>
              <p className="text-sm text-slate-400 mb-6">Manage external integrations and API tokens for third-party systems.</p>
              
              <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-between">
                 <div>
                    <h3 className="font-semibold text-white mb-1">Production Webhook Key</h3>
                    <p className="text-xs font-mono text-slate-500">lmr_prod_898492048992_xxxx</p>
                 </div>
                 <button className="px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded hover:bg-rose-500 hover:text-white transition-colors">Revoke</button>
              </div>

              <button className="w-full py-3 border border-dashed border-slate-600 rounded-lg text-slate-400 font-medium hover:text-cyan-400 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all">
                + Generate New Secret Token
              </button>
            </div>
          )}

          {activeTab === "health" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 border-b border-slate-800 pb-4">
                <Activity className="w-5 h-5 text-cyan-500" /> System Telemetry
              </h2>
              
              {isHealthLoading ? (
                 <div className="flex justify-center py-12"><div className="w-8 h-8 border-t-2 border-cyan-500 rounded-full animate-spin"></div></div>
              ) : healthData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#0b1325] border border-slate-700 p-4 rounded-xl flex flex-col items-center justify-center gap-2">
                       <Cpu className="w-6 h-6 text-indigo-400" />
                       <span className="text-2xl font-mono font-bold">{healthData.metrics.cpu_usage}%</span>
                       <span className="text-[10px] text-slate-500 uppercase tracking-widest">CPU Load</span>
                    </div>
                    <div className="bg-[#0b1325] border border-slate-700 p-4 rounded-xl flex flex-col items-center justify-center gap-2">
                       <HardDrive className="w-6 h-6 text-emerald-400" />
                       <span className="text-2xl font-mono font-bold">{healthData.metrics.memory_usage}%</span>
                       <span className="text-[10px] text-slate-500 uppercase tracking-widest">Memory</span>
                    </div>
                    <div className="bg-[#0b1325] border border-slate-700 p-4 rounded-xl flex flex-col items-center justify-center gap-2">
                       <Database className="w-6 h-6 text-amber-400" />
                       <span className="text-sm font-mono font-bold text-center capitalize">{healthData.components.database}</span>
                       <span className="text-[10px] text-slate-500 uppercase tracking-widest">DB Status</span>
                    </div>
                    <div className="bg-[#0b1325] border border-slate-700 p-4 rounded-xl flex flex-col items-center justify-center gap-2">
                       <Server className="w-6 h-6 text-cyan-400" />
                       <span className="text-sm font-mono font-bold">{healthData.components.scheduler_running ? 'Running' : 'Offline'}</span>
                       <span className="text-[10px] text-slate-500 uppercase tracking-widest">Scheduler</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="bg-[#0b1325] border border-slate-800 p-5 rounded-lg">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
                          <Wifi className="w-4 h-4" /> Core Microservices
                        </h4>
                        <ul className="space-y-3">
                           <li className="flex justify-between items-center text-sm">
                             <span className="text-slate-300">Active Cameras</span>
                             <span className="font-mono text-cyan-400">{healthData.metrics.total_cameras}</span>
                           </li>
                           <li className="flex justify-between items-center text-sm">
                             <span className="text-slate-300">Vision Workers</span>
                             <span className="font-mono text-indigo-400">{healthData.components.vision_workers}</span>
                           </li>
                           <li className="flex justify-between items-center text-sm">
                             <span className="text-slate-300">Overall Diagnostic</span>
                             <span className={`font-mono capitalize ${healthData.status === 'healthy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                               {healthData.status}
                             </span>
                           </li>
                        </ul>
                     </div>
                     <div className="bg-[#0b1325] border border-slate-800 p-5 rounded-lg">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Traffic</h4>
                        <ul className="space-y-3">
                           <li className="flex justify-between items-center text-sm">
                             <span className="text-slate-300">Network RX</span>
                             <span className="font-mono text-slate-100">{healthData.metrics.network_rx}</span>
                           </li>
                           <li className="flex justify-between items-center text-sm">
                             <span className="text-slate-300">Network TX</span>
                             <span className="font-mono text-slate-100">{healthData.metrics.network_tx}</span>
                           </li>
                           <li className="flex justify-between items-center text-sm">
                             <span className="text-slate-300">Last Metric Sync</span>
                             <span className="font-mono text-xs">{healthData.metrics.last_minute_metric ? new Date(healthData.metrics.last_minute_metric).toLocaleTimeString() : 'N/A'}</span>
                           </li>
                        </ul>
                     </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 text-center py-10">Diagnostic Data Unavailable</div>
              )}
            </div>
          )}

          {/* Fallback for other tabs */}
          {["alerts", "security"].includes(activeTab) && (
            <div className="flex flex-col items-center justify-center h-[300px] text-slate-500 animate-in fade-in duration-300">
              <div className="w-16 h-16 mb-4 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                <Shield className="w-8 h-8 text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-300 mb-2">Module Offline</h3>
              <p className="text-sm text-center max-w-sm">
                This configuration panel is locked by your current system tier. Upgrade to Enterprise for Active Directory integration.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
