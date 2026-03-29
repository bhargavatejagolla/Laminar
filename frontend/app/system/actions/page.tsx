"use client";

import React, { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, Zap, Webhook, Mail, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

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
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_URL}/api/v1/actions/`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" }
      });
      const data = await res.json();
      // Safely unwrap: API may return array, {items: []}, or an error object
      const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      setRules(list);
    } catch (e) {
      console.error(e);
      setRules([]);
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
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      await fetch(`${API_URL}/api/v1/actions/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          name,
          trigger_type: trigger,
          action_type: actionType,
          action_target: target
        })
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
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      await fetch(`${API_URL}/api/v1/actions/${id}`, { 
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : "" }
      });
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
    <div className="p-8 max-w-6xl mx-auto space-y-8 text-white min-h-screen">
      <div className="flex items-center space-x-4 mb-8">
        <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/30">
          <Zap className="h-6 w-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-widest uppercase">Automated Actions</h1>
          <p className="text-neutral-500 tracking-wider text-sm mt-1">Configure physical and digital responses to events.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Create Form */}
        <div className="md:col-span-1 bg-black/40 border border-neutral-800 p-6 rounded-2xl h-fit">
          <h2 className="text-lg font-bold mb-4 flex items-center space-x-2">
            <Plus className="h-4 w-4 text-emerald-400" />
            <span>Create Rule</span>
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs uppercase text-neutral-500 mb-1">Rule Name</label>
              <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-black border border-neutral-800 rounded p-2 text-sm" placeholder="Lock Main Doors" />
            </div>
            <div>
              <label className="block text-xs uppercase text-neutral-500 mb-1">Trigger Event</label>
              <select value={trigger} onChange={e => setTrigger(e.target.value)} className="w-full bg-black border border-neutral-800 rounded p-2 text-sm">
                <option value="alert_created">When a New Alert is Created</option>
                <option value="critical_surge">When Crowd Surge becomes Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase text-neutral-500 mb-1">Action Type</label>
              <select value={actionType} onChange={e => setActionType(e.target.value)} className="w-full bg-black border border-neutral-800 rounded p-2 text-sm">
                <option value="webhook">Webhook (HTTP POST)</option>
                <option value="iot_command">IoT MQTT Command</option>
                <option value="email">Send Email</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase text-neutral-500 mb-1">Target</label>
              <input required value={target} onChange={e => setTarget(e.target.value)} className="w-full bg-black border border-neutral-800 rounded p-2 text-sm font-mono" placeholder="https://api.access.com/lock" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded transition-colors uppercase tracking-widest text-xs mt-4">
              Add Automation
            </button>
          </form>
        </div>

        {/* Existing Rules */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-lg font-bold mb-4 flex items-center space-x-2">
            <Settings className="h-4 w-4 text-blue-400" />
            <span>Active Automations</span>
          </h2>
          {loading ? (
            <div className="p-10 border border-neutral-800 rounded-2xl flex justify-center"><Zap className="animate-pulse h-8 w-8 text-neutral-700" /></div>
          ) : rules.length === 0 ? (
             <div className="p-10 border border-dashed border-neutral-800 rounded-2xl flex flex-col items-center justify-center text-neutral-500">
               <Webhook className="h-10 w-10 mb-2 opacity-50" />
               <p>No automations defined yet.</p>
             </div>
          ) : (
            <AnimatePresence>
              {rules.map(rule => (
                <motion.div key={rule.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-black/40 border border-neutral-800 p-5 rounded-xl flex items-center justify-between group hover:border-indigo-500/30 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg">
                      {getIcon(rule.action_type)}
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{rule.name}</h3>
                      <div className="flex items-center space-x-3 text-xs text-neutral-500 mt-1">
                        <span className="uppercase tracking-widest text-cyan-500">{rule.trigger_type}</span>
                        <span>→</span>
                        <span className="font-mono text-neutral-400 max-w-[200px] truncate">{rule.action_target}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                       <span className={`h-2 w-2 rounded-full ${rule.is_active ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-neutral-600'}`}></span>
                       <span className="text-xs uppercase tracking-widest text-neutral-500">{rule.is_active ? 'Active' : 'Disabled'}</span>
                    </div>
                    <button onClick={() => handleDelete(rule.id)} className="p-2 text-neutral-600 hover:text-red-400 hover:bg-neutral-900 rounded-md transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
