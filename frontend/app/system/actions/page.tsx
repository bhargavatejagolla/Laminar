"use client";

import React, { useState, useEffect } from 'react';
import { 
  Settings, Plus, Trash2, Zap, Webhook, Mail, Smartphone, 
  ShieldCheck, Activity, Fingerprint, History, 
  AlertCircle, CheckCircle2, ShieldAlert, Cpu, Info, BookOpen, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from "@/services/api";
import { format } from 'date-fns';
import { useTranslation } from "react-i18next";

interface ActionLog {
  id: string;
  timestamp: string;
  status: string;
  details: string;
}

interface ActionRule {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  action_target: string;
  is_active: boolean;
  is_dry_run: boolean;
  priority_level: string;
  history_logs?: ActionLog[];
}

export default function AutomationsPage() {
  const { t } = useTranslation();

  const [rules, setRules] = useState<ActionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBioGuard, setShowBioGuard] = useState<string | null>(null); // rule id for biometric check
  const [bioScanning, setBioScanning] = useState(false);
  const [activeHelp, setActiveHelp] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  // Operator Intelligence Content
  const helpContent: Record<string, string> = {
    designation: "Unique mnemonic for this protocol. Standard format: [PHASE]-[ACTION]-[ID]. Used for telemetry identification.",
    trigger: "Defines the logic threshold for automated execution. Anomalies are detected via AI Surge Scan or Computer Vision events.",
    payload: "The external effect triggered. Supports REST Webhooks (JSON), MQTT commands, or encrypted communications.",
    priority: "Determines system resource allocation. Critical protocols bypass the secondary verification queue for zero-latency execution.",
    safety: "Safe-state execution. Logged as 'Simulated'. No external side effects (API calls/I/O) will be performed while active.",
    encryption: "The secure target destination for the action payload. Must be a verified endpoint (HTTPS/MQTTS) for production protocols."
  };

  // Form State
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('alert_created');
  const [actionType, setActionType] = useState('webhook');
  const [target, setTarget] = useState('');
  const [priority, setPriority] = useState('low');
  const [isDryRun, setIsDryRun] = useState(false);

  const fetchRules = async () => {
    try {
      const res = await api.get('/actions/');
      setRules(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
    // Poll for status updates in history logs every 5 seconds for live feel
    const interval = setInterval(fetchRules, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/actions/', {
        name,
        trigger_type: trigger,
        action_type: actionType,
        action_target: target,
        priority_level: priority,
        is_dry_run: isDryRun
      });
      setName('');
      setTarget('');
      setIsDryRun(false);
      fetchRules();
    } catch (e) {
      console.error(e);
    }
  };

  const startDeleteAuth = (id: string) => {
    setShowBioGuard(id);
    setBioScanning(true);
    // Simulate fingerprint scan
    setTimeout(() => {
      setBioScanning(false);
    }, 2500);
  };

  const confirmDelete = async () => {
    if (!showBioGuard) return;
    try {
      await api.delete(`/actions/${showBioGuard}`);
      setShowBioGuard(null);
      fetchRules();
    } catch (e) {
      console.error(e);
    }
  };

  const getPriorityColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      default: return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'webhook': return <Webhook className="h-4 w-4 text-purple-400" />;
      case 'email': return <Mail className="h-4 w-4 text-blue-400" />;
      case 'sms': return <Smartphone className="h-4 w-4 text-green-400" />;
      default: return <Zap className="h-4 w-4 text-yellow-400" />;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 text-white min-h-screen relative overflow-hidden pb-32">
      {/* Background Ambience */}
      <div className="absolute top-10 left-[10%] w-[800px] h-[400px] bg-indigo-700/10 rounded-[100%] blur-[120px] pointer-events-none -z-10" />

      {/* Global Mission Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex items-center space-x-6 relative z-10">
          <div className="relative group">
            <div className="absolute inset-0 bg-indigo-500/20 blur-[15px] group-hover:blur-[25px] transition-all rounded-full" />
            <div className="p-4 bg-indigo-950/40 rounded-2xl border border-indigo-500/40 relative z-10 shadow-[inset_0_0_20px_rgba(99,102,241,0.2)]">
              <Zap className="h-10 w-10 text-indigo-400 group-hover:text-indigo-300 transition-colors drop-shadow-[0_0_10px_rgba(99,102,241,0.6)]" />
            </div>
          </div>
          <div>
            <h1 className="text-5xl font-black tracking-tighter uppercase text-white mb-2 italic shadow-indigo-500/20 text-glow">{t("auto.MissionControl_8601") || "Mission Control"}</h1>
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,1)]"></span>
                  <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest leading-none">{t("auto.UplinkOperation_9958") || "Uplink Operational"}</span>
               </div>
               <p className="text-indigo-400/80 font-bold tracking-[0.2em] text-[10px] uppercase">{t("auto.AutomatedProtoc_3640") || "Automated Protocol Intelligence Layer"}</p>
               
               <button 
                onClick={() => setShowManual(!showManual)}
                className="ml-4 flex items-center gap-2 px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-full transition-all group/manual"
               >
                 <BookOpen className="h-3 w-3 text-indigo-400 group-hover/manual:rotate-12 transition-transform" />
                 <span className="text-[9px] font-black uppercase text-indigo-300 tracking-widest">{t("auto.OperatorManual_9445") || "Operator Manual"}</span>
               </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-white/5 p-4 rounded-2xl shadow-xl">
           <Cpu className="h-6 w-6 text-indigo-400 animate-pulse" />
           <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{t("auto.SystemLoad_8673") || "System Load"}</span>
              <div className="h-1 w-32 bg-slate-800 rounded-full mt-1 overflow-hidden">
                 <motion.div initial={{ width: 0 }} animate={{ width: '45%' }} className="h-full bg-indigo-500" />
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 relative z-10">
        {/* Create Form - Sidebar */}
        <div className="lg:col-span-1 bg-gradient-to-br from-[#081428]/90 to-[#040a12]/95 backdrop-blur-2xl border border-indigo-500/30 p-7 rounded-3xl h-fit shadow-[inset_0_0_30px_rgba(99,102,241,0.05)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-9xl font-black text-indigo-500 mix-blend-overlay group-hover:opacity-10 transition-opacity">
            +
          </div>

          <h2 className="text-xl font-black uppercase tracking-widest mb-8 flex items-center space-x-3 border-b border-indigo-500/20 pb-5">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
              <Plus className="h-4 w-4 text-emerald-400" />
            </div>
            <span>{t("auto.InitializeProto_4590") || "Initialize Protocol"}</span>
          </h2>

          <form onSubmit={handleCreate} className="space-y-6 relative z-10">
            <div className="group">
              <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center justify-between gap-2 mb-2.5">
                 <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full group-focus-within:animate-ping"></span> {t("auto.RuleDesignation_9707") || "Rule Designation"}
                 </div>
                 <button type="button" onClick={() => setActiveHelp(activeHelp === 'designation' ? null : 'designation')}>
                    <Info className={`h-3 w-3 ${activeHelp === 'designation' ? 'text-white' : 'text-indigo-500/50 hover:text-indigo-400'} transition-colors`} />
                 </button>
              </label>
              <AnimatePresence>
                {activeHelp === 'designation' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl overflow-hidden">
                    <p className="text-[10px] text-indigo-300 leading-relaxed font-medium">{helpContent.designation}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-400 focus:bg-[#081428] transition-all shadow-inner font-medium placeholder-slate-600" placeholder={t("auto.egALPHALOCKDOWN_1109") || "e.g. ALPHA-LOCKDOWN-S7"} />
            </div>
            
            <div className="group">
              <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center justify-between gap-2 mb-2.5">
                 <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> {t("auto.TriggerMatrix_3515") || "Trigger Matrix"}
                 </div>
                 <button type="button" onClick={() => setActiveHelp(activeHelp === 'trigger' ? null : 'trigger')}>
                    <Info className={`h-3 w-3 ${activeHelp === 'trigger' ? 'text-white' : 'text-indigo-500/50 hover:text-indigo-400'} transition-colors`} />
                 </button>
              </label>
              <AnimatePresence>
                {activeHelp === 'trigger' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl overflow-hidden">
                    <p className="text-[10px] text-indigo-300 leading-relaxed font-medium">{helpContent.trigger}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <select value={trigger} onChange={e => setTrigger(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-400 transition-all shadow-inner appearance-none">
                <option value="alert_created">{t("auto.ConditionNewAle_2913") || "Condition: New Alert Anomaly"}</option>
                <option value="critical_surge">{t("auto.ConditionCritic_5191") || "Condition: Critical Surge Velocity"}</option>
              </select>
            </div>
            
            <div className="group">
              <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center justify-between gap-2 mb-2.5">
                 <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> {t("auto.ActionPayload_5372") || "Action Payload"}
                 </div>
                 <button type="button" onClick={() => setActiveHelp(activeHelp === 'payload' ? null : 'payload')}>
                    <Info className={`h-3 w-3 ${activeHelp === 'payload' ? 'text-white' : 'text-indigo-500/50 hover:text-indigo-400'} transition-colors`} />
                 </button>
              </label>
              <AnimatePresence>
                {activeHelp === 'payload' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl overflow-hidden">
                    <p className="text-[10px] text-indigo-300 leading-relaxed font-medium">{helpContent.payload}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <select value={actionType} onChange={e => setActionType(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-400 transition-all shadow-inner appearance-none">
                <option value="webhook">Transmit Webhook (REST)</option>
                <option value="iot_command">{t("auto.IoTMQTTCommand_7792") || "IoT MQTT Command"}</option>
                <option value="email">{t("auto.DispatchSecureE_8098") || "Dispatch Secure Email"}</option>
                <option value="sms">{t("auto.EmergencySMSPro_2970") || "Emergency SMS Protocol"}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="group">
                <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center gap-2 mb-2.5">
                   {t("auto.Priority_5291") || "Priority"}
                </label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-white focus:outline-none focus:border-indigo-400 transition-all shadow-inner">
                  <option value="low">{t("auto.Low_8115") || "Low"}</option>
                  <option value="medium">{t("auto.Medium_6687") || "Medium"}</option>
                  <option value="critical">{t("auto.Critical_6118") || "Critical"}</option>
                </select>
              </div>
              <div className="group">
                <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center gap-2 mb-2.5">
                   {t("auto.SafetyMode_1856") || "Safety Mode"}
                </label>
                <label className="flex items-center cursor-pointer p-2 bg-[#020b16]/80 rounded-xl border border-[#1e3a5f]/50 hover:border-indigo-400 transition-colors">
                   <input type="checkbox" checked={isDryRun} onChange={e => setIsDryRun(e.target.checked)} className="mr-2" />
                   <span className="text-[10px] font-black uppercase text-slate-400">{t("auto.DryRun_3434") || "Dry Run"}</span>
                </label>
              </div>
            </div>
            
            <div className="group">
              <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center justify-between gap-2 mb-2.5">
                 <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full group-focus-within:animate-ping"></span> {t("auto.EncryptionTarge_3524") || "Encryption Target"}
                 </div>
                 <button type="button" onClick={() => setActiveHelp(activeHelp === 'encryption' ? null : 'encryption')}>
                    <Info className={`h-3 w-3 ${activeHelp === 'encryption' ? 'text-white' : 'text-indigo-500/50 hover:text-indigo-400'} transition-colors`} />
                 </button>
              </label>
              <AnimatePresence>
                {activeHelp === 'encryption' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl overflow-hidden">
                    <p className="text-[10px] text-indigo-300 leading-relaxed font-medium">{helpContent.encryption}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <input required value={target} onChange={e => setTarget(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-4 py-3.5 text-[11px] text-indigo-300 font-mono focus:outline-none focus:border-indigo-400 focus:bg-[#081428] transition-all shadow-inner placeholder-slate-600" placeholder={t("auto.httpsapitermina_3526") || "https://api.terminal.com/lock"} />
            </div>
            
            <button type="submit" className="w-full group relative overflow-hidden bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 font-black py-4 rounded-xl transition-all uppercase tracking-[0.2em] text-[11px] mt-6 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-indigo-400 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
              {t("auto.AuthorizePulse_779") || "Authorize & Pulse"}
            </button>
          </form>
        </div>

        {/* Active Protocols - Grid */}
        <div className="lg:col-span-3 flex flex-col space-y-8">
          {/* Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-slate-900/30 border border-white/5 p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-xl"><ShieldCheck className="h-6 w-6 text-indigo-400" /></div>
                <div>
                   <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black italic">{t("auto.ActiveNodes_8144") || "Active Nodes"}</p>
                   <p className="text-2xl font-black text-white leading-tight">{rules.length}</p>
                </div>
             </div>
             <div className="bg-slate-900/30 border border-white/5 p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 rounded-xl"><Activity className="h-6 w-6 text-amber-400" /></div>
                <div>
                   <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black italic">Transmissions (1H)</p>
                   <p className="text-2xl font-black text-white leading-tight">142</p>
                </div>
             </div>
             <div className="bg-slate-900/30 border border-white/5 p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-xl"><Zap className="h-6 w-6 text-emerald-400" /></div>
                <div>
                   <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black italic">{t("auto.AvgResponse_9704") || "Avg Response"}</p>
                   <p className="text-2xl font-black text-white leading-tight">48ms</p>
                </div>
             </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-black uppercase tracking-widest flex items-center space-x-3">
              <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <Settings className="h-5 w-5 text-blue-400" />
              </div>
              <span>{t("auto.ProtocolDeploym_293") || "Protocol Deployment Grid"}</span>
            </h2>

            {loading ? (
              <div className="p-32 border border-indigo-900/30 bg-[#020b16]/40 rounded-3xl flex flex-col items-center justify-center space-y-4">
                 <Zap className="animate-spin h-12 w-12 text-indigo-500" />
                 <p className="text-xs font-black tracking-[0.5em] text-indigo-400/60 uppercase">{t("auto.DecryptingRuleM_3861") || "Decrypting Rule Matrix..."}</p>
              </div>
            ) : rules.length === 0 ? (
               <div className="p-16 border border-dashed border-indigo-900/50 bg-[#020b16]/40 rounded-3xl flex flex-col items-center justify-center text-indigo-500/60 shadow-inner group">
                 <Webhook className="h-14 w-14 mb-4 opacity-50 block animate-bounce" />
                 <p className="font-bold tracking-widest uppercase text-sm group-hover:text-indigo-400 transition-colors">{t("auto.AwaitingMission_6018") || "Awaiting Mission Directives."}</p>
                 <button onClick={() => {}} className="mt-6 text-[10px] font-black underline underline-offset-4 tracking-widest opacity-80 hover:opacity-100 transition-opacity">{t("auto.INITIALIZEFIRST_9089") || "INITIALIZE FIRST PROTOCOL"}</button>
               </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AnimatePresence>
                  {rules.map(rule => (
                    <motion.div 
                      key={rule.id} 
                      initial={{ opacity: 0, y: 20 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, scale: 0.9 }} 
                      className="bg-gradient-to-br from-[#020b16] to-[#081428] border border-[#1e3a5f]/60 p-6 rounded-3xl flex flex-col group hover:border-indigo-500/50 transition-all shadow-xl relative overflow-hidden"
                    >
                      {/* Dry Run Badge */}
                      {rule.is_dry_run && (
                        <div className="absolute top-0 right-0 px-4 py-1.5 bg-indigo-500/20 text-[9px] font-black uppercase text-indigo-400 border-b border-l border-indigo-500/40 rounded-bl-xl tracking-widest backdrop-blur-md">
                           {t("auto.SafetyDryRun_3900") || "Safety: Dry Run"}
                        </div>
                      )}

                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center space-x-5">
                          <div className="p-4 bg-[#0f172a] border border-slate-700/50 rounded-2xl shadow-inner group-hover:scale-110 transition-transform relative">
                            {getIcon(rule.action_type)}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center border border-slate-700">
                               <div className={`w-2 h-2 rounded-full ${rule.is_active ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,1)]' : 'bg-slate-600'}`}></div>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <h3 className="font-black text-white tracking-wide text-xl italic group-hover:text-indigo-300 transition-colors">{rule.name}</h3>
                            <div className={`mt-2 flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-widest w-fit ${getPriorityColor(rule.priority_level)}`}>
                               {rule.priority_level} Execution
                            </div>
                          </div>
                        </div>
                        <button onClick={() => startDeleteAuth(rule.id)} className="p-3 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 rounded-xl transition-all opacity-40 group-hover:opacity-100 flex items-center gap-2">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="space-y-4">
                         <div className="bg-[#050b1a] rounded-2xl p-4 border border-white/5 space-y-3">
                            <div className="flex justify-between items-center text-[10px]">
                               <span className="text-slate-500 uppercase font-black italic">{t("auto.MatrixTrigger_1480") || "Matrix Trigger"}</span>
                               <span className="text-cyan-400 font-bold bg-cyan-500/10 px-2 rounded tracking-widest">{rule.trigger_type}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                               <span className="text-slate-500 uppercase font-black italic">{t("auto.TargetEndPoint_9155") || "Target End Point"}</span>
                               <span className="text-indigo-400 font-mono truncate max-w-[150px]">{rule.action_target}</span>
                            </div>
                         </div>

                         {/* Last 3 History Peek */}
                         <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">
                               <History className="h-3 w-3" /> {t("auto.LatestPulses_3151") || "Latest Pulses"}
                            </div>
                            {rule.history_logs?.slice(0, 3).map((log, idx) => (
                               <div key={idx} className="flex items-center justify-between px-3 py-2 bg-black/20 rounded-lg border border-white/5 text-[10px]">
                                  <div className="flex items-center gap-2">
                                     {log.status === 'success' ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : log.status === 'dry_run' ? <ShieldCheck className="h-3 w-3 text-indigo-400" /> : <AlertCircle className="h-3 w-3 text-rose-400" />}
                                     <span className="text-slate-400 font-mono italic">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                                  </div>
                                  <span className="text-slate-300 font-black italic uppercase tracking-tighter">{log.status}</span>
                               </div>
                            )) || <div className="text-[10px] text-slate-700 italic">{t("auto.Nohistoricaltra_4472") || "No historical traces found."}</div>}
                         </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Global Audit Terminal */}
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-black/80 backdrop-blur-3xl border-t border-indigo-500/30 z-[100] px-8 py-4 flex items-center justify-between overflow-hidden shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
         <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-transparent pointer-events-none" />
         
         <div className="flex items-center gap-8 relative z-10 w-full overflow-hidden">
            <div className="flex items-center gap-3 shrink-0">
               <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/40">
                  <Fingerprint className="h-5 w-5 text-indigo-400 animate-pulse" />
               </div>
               <div>
                  <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1 italic leading-none">{t("auto.SecurityUplink_5494") || "Security Uplink"}</p>
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-[0.2em] leading-none">{t("auto.StatusEncrypted_2287") || "Status: Encrypted"}</p>
               </div>
            </div>

            <div className="h-10 w-px bg-white/10 shrink-0" />

            <div className="flex-1 overflow-hidden">
               <div className="flex items-center gap-4 animate-[marquee_30s_linear_infinite] whitespace-nowrap">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-10">
                       <span className="text-[11px] font-mono text-emerald-400/80 uppercase tracking-widest"><span className="text-white">EVENT LOADED:</span> SYSTEM_CORE_READY [AUTH_SUCCESS]</span>
                       <span className="text-[11px] font-mono text-indigo-400/80 uppercase tracking-widest"><span className="text-white">TX_PULSE:</span> WEBHOOK_RELAY_SYNCED (42.062s)</span>
                       <span className="text-[11px] font-mono text-amber-400/80 uppercase tracking-widest"><span className="text-white">WARNING:</span> ANOMALY DETECTED IN SECTOR 4 [REID_PENDING]</span>
                       <span className="text-[11px] font-mono text-slate-500 uppercase tracking-widest">&gt;&gt; WAITING FOR NEXT PROTOCOL INJECTION...</span>
                    </div>
                  ))}
               </div>
            </div>

            <div className="h-10 w-px bg-white/10 shrink-0" />

            <div className="flex items-center gap-4 shrink-0 bg-slate-900/50 px-5 py-2 rounded-xl border border-white/5">
                <div className="flex flex-col text-right">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t("auto.GlobalLockout_9680") || "Global Lockout"}</p>
                   <p className="text-[10px] font-bold text-white uppercase italic">{t("auto.ActiveSecurityv_8879") || "Active Security v2.1"}</p>
                </div>
                <div className="p-2 bg-rose-500/10 rounded-full border border-rose-500/30">
                   <ShieldAlert className="h-4 w-4 text-rose-500" />
                </div>
            </div>
         </div>
      </div>

      {/* Biometric Scan Overlay */}
      <AnimatePresence>
        {showBioGuard && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-2xl">
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#050b1a] border border-indigo-500/40 p-12 rounded-3xl shadow-[0_0_80px_rgba(99,102,241,0.2)] flex flex-col items-center max-w-md w-full relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />
                
                <div className="relative mb-10 group">
                   <div className="absolute inset-0 bg-indigo-500/20 blur-[30px] animate-pulse rounded-full" />
                   <div className="w-32 h-32 bg-indigo-950/40 border-2 border-indigo-500/60 rounded-full flex items-center justify-center relative z-10 transition-transform group-hover:scale-105 duration-700">
                      <Fingerprint className={`h-16 w-16 text-indigo-400 ${bioScanning ? 'animate-pulse' : ''}`} />
                      {bioScanning && (
                         <motion.div initial={{ top: '10%' }} animate={{ top: '80%' }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="absolute left-4 right-4 h-1 bg-indigo-400 blur-[4px] z-20 shadow-[0_0_15px_rgba(99,102,241,1)]" />
                      )}
                   </div>
                </div>

                <h3 className="text-2xl font-black uppercase tracking-tighter text-white mb-2 italic">{t("auto.BiometricAuthen_2795") || "Biometric Authentication"}</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-10 text-center leading-relaxed">
                   {bioScanning ? 'Scanning Encrypted Dermis Pattern...' : 'Verification Successful. Identity Confirmed.'}
                </p>

                <div className="grid grid-cols-2 gap-4 w-full relative z-10">
                   <button onClick={() => setShowBioGuard(null)} className="py-4 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white/5 transition-colors">{t("auto.AbortMission_9903") || "Abort Mission"}</button>
                   <button disabled={bioScanning} onClick={confirmDelete} className="py-4 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed text-indigo-950 font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(99,102,241,0.4)]">{t("auto.InitializeErasu_2053") || "Initialize Erasure"}</button>
                </div>

                <div className="mt-8 text-[8px] font-mono text-slate-700 uppercase tracking-widest">Auth_Token: c842-88f2-99a1-77b2</div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Overlay */}
      <AnimatePresence>
        {showManual && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
             <motion.div 
               initial={{ y: 50, opacity: 0 }} 
               animate={{ y: 0, opacity: 1 }} 
               exit={{ y: 50, opacity: 0 }} 
               className="bg-[#050b1a] border border-indigo-500/40 w-full max-w-2xl rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden"
             >
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-indigo-500/5">
                   <div className="flex items-center gap-4">
                      <BookOpen className="h-6 w-6 text-indigo-400" />
                      <div>
                         <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">{t("auto.ProtocolOperati_7639") || "Protocol Operating Manual"}</h3>
                         <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{t("auto.StandardProcedu_772") || "Standard Procedure v4.0.12"}</p>
                      </div>
                   </div>
                   <button onClick={() => setShowManual(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                      <X className="h-6 w-6 text-slate-500" />
                   </button>
                </div>
                
                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {Object.keys(helpContent).map(key => (
                         <div key={key} className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest flex items-center gap-2">
                               <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> {key.replace('_', ' ')}
                            </h4>
                            <p className="text-xs text-slate-400 leading-relaxed font-medium">{helpContent[key]}</p>
                         </div>
                      ))}
                   </div>
                   
                   <div className="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl space-y-3">
                      <h4 className="text-[10px] font-black uppercase text-emerald-400 tracking-widest flex items-center gap-2">
                         <ShieldCheck className="h-3 w-3" /> {t("auto.MissionBestPrac_6671") || "Mission Best Practices"}
                      </h4>
                      <ul className="text-[11px] text-slate-300 space-y-2 font-medium">
                         <li className="flex items-start gap-2"><span className="text-emerald-500">01.</span> Always test new protocols in "Dry Run" mode before initializing a live pulse.</li>
                         <li className="flex items-start gap-2"><span className="text-emerald-500">02.</span> {t("auto.EnsureEncryptio_1770") || "Ensure Encryption Targets use secure HTTPS certificates."}</li>
                         <li className="flex items-start gap-2"><span className="text-emerald-500">03.</span> Use mnemonic rule names (e.g. ZONE-RED-NOTIFY) for faster audit recognition.</li>
                      </ul>
                   </div>
                </div>
                
                <div className="p-6 bg-black/40 border-t border-white/5 flex justify-end">
                   <button onClick={() => setShowManual(false)} className="px-8 py-3 bg-indigo-500 text-indigo-950 font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-indigo-400 transition-colors">{t("auto.Acknowledge_7155") || "Acknowledge"}</button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-20%); }
        }
      `}</style>
    </div>
  );
}
