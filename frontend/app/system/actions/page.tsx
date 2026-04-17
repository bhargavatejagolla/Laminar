"use client";

import React, { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, Zap, Webhook, Mail, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from "@/services/api";

interface ActionRule {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  action_target: string;
  is_active: boolean;
}

export default function AutomationsPage() {
  const [rules, setRules] = useState<ActionRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('alert_created');
  const [actionType, setActionType] = useState('webhook');
  const [target, setTarget] = useState('');

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
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/actions/', {
        name,
        trigger_type: trigger,
        action_type: actionType,
        action_target: target
      });
      setName('');
      setTarget('');
      fetchRules();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/actions/${id}`);
      fetchRules();
    } catch (e) {
      console.error(e);
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
    <div className="p-8 max-w-6xl mx-auto space-y-8 text-white min-h-screen relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-10 left-[10%] w-[600px] h-[300px] bg-indigo-700/10 rounded-[100%] blur-[100px] pointer-events-none -z-10" />

      <div className="flex items-center space-x-5 mb-10 relative z-10">
        <div className="relative group">
           <div className="absolute inset-0 bg-indigo-500/20 blur-[15px] group-hover:blur-[25px] transition-all rounded-full" />
           <div className="p-4 bg-indigo-950/40 rounded-2xl border border-indigo-500/40 relative z-10 shadow-[inset_0_0_20px_rgba(99,102,241,0.2)]">
             <Zap className="h-8 w-8 text-indigo-400 group-hover:text-indigo-300 transition-colors drop-shadow-[0_0_10px_rgba(99,102,241,0.6)]" />
           </div>
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-[0.05em] uppercase text-white mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">Automated Actions</h1>
          <p className="text-indigo-400/80 font-bold tracking-widest text-xs uppercase">Target Acquisition & Automated Response Protocols</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
        {/* Create Form */}
        <div className="md:col-span-1 bg-gradient-to-br from-[#081428]/90 to-[#040a12]/95 backdrop-blur-2xl border border-indigo-500/30 p-7 rounded-3xl h-fit shadow-[inset_0_0_30px_rgba(99,102,241,0.05)] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-9xl font-black text-indigo-500 mix-blend-overlay">
            +
          </div>

          <h2 className="text-xl font-black uppercase tracking-widest mb-6 flex items-center space-x-3 border-b border-indigo-500/20 pb-4">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
              <Plus className="h-4 w-4 text-emerald-400" />
            </div>
            <span>Create Rule</span>
          </h2>

          <form onSubmit={handleCreate} className="space-y-5 relative z-10">
            <div className="group">
              <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center gap-2 mb-2">
                 <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full group-focus-within:animate-ping"></span> Rule Name
              </label>
              <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-400 focus:bg-[#081428] transition-all shadow-inner font-medium placeholder-slate-600" placeholder="e.g. Lockdown Sector 7" />
            </div>
            
            <div className="group">
              <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center gap-2 mb-2">
                 <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> Trigger Event
              </label>
              <select value={trigger} onChange={e => setTrigger(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-400 transition-all shadow-inner appearance-none">
                <option value="alert_created">When a New Alert is Created</option>
                <option value="critical_surge">When Crowd Surge becomes Critical</option>
              </select>
            </div>
            
            <div className="group">
              <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center gap-2 mb-2">
                 <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> Action Payload
              </label>
              <select value={actionType} onChange={e => setActionType(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-400 transition-all shadow-inner appearance-none">
                <option value="webhook">Webhook (HTTP POST)</option>
                <option value="iot_command">IoT MQTT Command</option>
                <option value="email">Dispatch Email Protocol</option>
              </select>
            </div>
            
            <div className="group">
              <label className="block text-[10px] uppercase text-indigo-400 font-black tracking-widest flex items-center gap-2 mb-2">
                 <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full group-focus-within:animate-ping"></span> Target Destination
              </label>
              <input required value={target} onChange={e => setTarget(e.target.value)} className="w-full bg-[#020b16]/80 border border-[#1e3a5f]/50 rounded-xl px-4 py-3 text-sm text-indigo-300 font-mono focus:outline-none focus:border-indigo-400 focus:bg-[#081428] transition-all shadow-inner placeholder-slate-600" placeholder="https://api.access.com/lock" />
            </div>
            
            <button type="submit" className="w-full group relative overflow-hidden bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 font-black py-4 rounded-xl transition-all uppercase tracking-[0.2em] text-[11px] mt-6 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-indigo-400 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
              Initialize Automation
            </button>
          </form>
        </div>

        {/* Existing Rules */}
        <div className="md:col-span-2 space-y-5">
          <h2 className="text-xl font-black uppercase tracking-widest mb-6 flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <Settings className="h-5 w-5 text-blue-400" />
            </div>
            <span>Active Protocols</span>
          </h2>
          {loading ? (
            <div className="p-16 border border-indigo-900/30 bg-[#020b16]/40 rounded-3xl flex justify-center"><Zap className="animate-pulse h-10 w-10 text-indigo-500/50" /></div>
          ) : rules.length === 0 ? (
             <div className="p-16 border border-dashed border-indigo-900/50 bg-[#020b16]/40 rounded-3xl flex flex-col items-center justify-center text-indigo-500/60 shadow-inner">
               <Webhook className="h-14 w-14 mb-4 opacity-50 block" />
               <p className="font-medium tracking-widest uppercase text-sm">No protocols initialized.</p>
             </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {rules.map(rule => (
                  <motion.div key={rule.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-gradient-to-r from-[#020b16]/90 to-[#081428]/90 backdrop-blur-md border border-[#1e3a5f]/60 p-6 rounded-2xl flex items-center justify-between group hover:border-indigo-500/50 transition-all shadow-md">
                    <div className="flex items-center space-x-5">
                      <div className="p-3 bg-[#0f172a] border border-slate-700 rounded-xl shadow-inner group-hover:scale-110 transition-transform">
                        {getIcon(rule.action_type)}
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-black text-white tracking-wide text-lg drop-shadow-md">{rule.name}</h3>
                        <div className="flex items-center space-x-4 mt-1.5 bg-[#0a1122] p-2 rounded-lg border border-white/5 w-fit">
                          <span className="uppercase tracking-[0.15em] text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">{rule.trigger_type}</span>
                          <span className="text-slate-600">→</span>
                          <span className="font-mono text-indigo-300 text-xs max-w-[250px] truncate">{rule.action_target}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-6">
                      <div className="flex items-center space-x-2 bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                         <span className={`h-2.5 w-2.5 rounded-full ${rule.is_active ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-rose-600'}`}></span>
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{rule.is_active ? 'Active' : 'Offline'}</span>
                      </div>
                      <button onClick={() => handleDelete(rule.id)} className="p-2.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 rounded-xl transition-all opacity-40 group-hover:opacity-100">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
