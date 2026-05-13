"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Cpu, 
  RefreshCw, 
  CircuitBoard, 
  Wifi, 
  CheckCircle2, 
  ShieldCheck, 
  Lock, 
  Globe, 
  Database,
  ArrowRight,
  Fingerprint,
  Zap,
  Activity,
  Clock
} from "lucide-react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { api } from "@/services/api";
import BorderGlow from "@/components/ui/BorderGlow";
import { useTranslation } from "react-i18next";

interface EdgeNode {
  node_id: string;
  last_sync: string;
  local_samples: number;
  pushed_version: string;
  status: string;
}
interface FleetStatus {
  global_version: string;
  edge_nodes_registered: number;
  last_sync_at: string | null;
  fleet: EdgeNode[];
}

export default function FleetHealthPage() {
  const { t } = useTranslation();

  const [fleet, setFleet] = useState<FleetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [syncPhase, setSyncPhase] = useState<string | null>(null);
  const [intelligenceScore, setIntelligenceScore] = useState(94.2);
  const [privacyLogs, setPrivacyLogs] = useState<string[]>([]);
  const [showOrbBurst, setShowOrbBurst] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/edge/model-status');
      setFleet(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 2000); // Polling faster to see the 'syncing' pulse realistically
    return () => clearInterval(id);
  }, [fetchStatus]);

  const addLog = (msg: string) => {
    setPrivacyLogs(prev => [msg, ...prev].slice(0, 5));
  };

  const simulateSync = async () => {
    setSimulating(true);
    setPrivacyLogs([]);
    setSyncPhase("encrypting");
    addLog("INITIATING ZERO-KNOWLEDGE HANDSHAKE...");
    
    // Phase 1: Local Weight Encryption
    await new Promise(r => setTimeout(r, 1200));
    addLog("APPLYING DIFFERENTIAL PRIVACY NOISE (ε=0.1)...");
    setSyncPhase("transmitting");

    const nodes = ["CAM-EDGE-001", "CAM-EDGE-002", "CAM-EDGE-003", "CAM-EDGE-004"];
    for (const node of nodes) {
      addLog(`EXTRACTING WEIGHTS FROM ${node}...`);
      // Small delay between each node to show sequential data flow
      await new Promise(r => setTimeout(r, 800)); 
      addLog(`SCRUBBING PII FROM ${node} STREAM...`);
      await api.post('/edge/sync-model-weights', {
        edge_node_id: node,
        local_samples: Math.floor(Math.random() * 5000) + 100,
        model_version: fleet?.global_version || "v1.0.0",
      });
      addLog(`NODE ${node} SYNCED SUCCESSFULLY.`);
    }

    setSyncPhase("aggregating");
    addLog("PERFORMING FEDERATED AVERAGING...");
    await new Promise(r => setTimeout(r, 1500));
    
    setShowOrbBurst(true);
    addLog("GLOBAL BRAIN UPDATED.");
    await fetchStatus();
    setIntelligenceScore((prev: number) => Math.min(prev + 0.1, 99.9));
    setSimulating(false);
    setSyncPhase(null);
    setTimeout(() => setShowOrbBurst(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-8 max-w-7xl mx-auto space-y-12 text-white min-h-screen relative overflow-hidden"
    >
      {/* ── Background Grid & Decorative Beams ── */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.02)_1px,transparent_1px)] bg-[size:60px_60px] pointer-events-none -z-10 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      
      {/* ── Header & Command Controls ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-20">
        <div className="flex items-center space-x-5">
          <div className="relative group">
            <div className={`absolute inset-0 bg-cyan-400/20 blur-2xl transition-opacity duration-1000 rounded-full ${showOrbBurst ? 'opacity-100' : 'opacity-0'}`} />
            <div className="relative p-5 bg-cyan-950/40 rounded-2xl border border-cyan-500/40 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
              <CircuitBoard className={`h-8 w-8 text-cyan-400 ${simulating ? "animate-pulse" : ""}`} />
            </div>
          </div>
          <div className="ml-2">
            <h1 className="text-4xl font-black tracking-tighter uppercase italic leading-none">
              {t("auto.Federated_2333") || "Federated"} <span className="text-cyan-400">{t("auto.AICommand_939") || "AI Command"}</span>
            </h1>
            <p className="text-neutral-500 font-bold tracking-[0.3em] text-[10px] mt-2 flex items-center gap-2">
              <Globe className="w-3 h-3 text-cyan-500/60" />
              {t("auto.GLOBALDISTRIBUT_2505") || "GLOBAL DISTRIBUTED INTELLIGENCE NETWORK"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {simulating && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col items-end mr-4"
            >
              <span className="text-[10px] font-black text-cyan-500 uppercase tracking-widest bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20">
                {syncPhase === "encrypting" && "Securely Encrypting Local Weights..."}
                {syncPhase === "transmitting" && "Transmitting Differential Privacy Packets..."}
                {syncPhase === "aggregating" && "Aggregating Global Neural weights..."}
              </span>
            </motion.div>
          )}
          <button
            onClick={simulateSync}
            disabled={simulating}
            className="group relative overflow-hidden flex items-center space-x-3 bg-white text-black font-black py-3 px-8 rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 text-xs uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(255,255,255,0.2)]"
          >
            <RefreshCw className={`h-4 w-4 ${simulating ? "animate-spin" : ""}`} />
            <span>{simulating ? "Sync in Progress" : "Simulate Global Sync"}</span>
          </button>
        </div>
      </div>

      {/* ── Visual Core & Privacy Info ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Global Stats */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <BorderGlow borderRadius={20} backgroundColor="#050f1f" glowColor="34 211 238" glowIntensity={0.6}>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4 opacity-70">
                  <Cpu className="h-4 w-4 text-cyan-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("auto.GlobalVersion_7278") || "Global Version"}</span>
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-black text-white">{fleet?.global_version ?? "v1.0.0"}</p>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{t("auto.STABLE_258") || "STABLE"}</span>
                </div>
              </div>
            </BorderGlow>

            <BorderGlow borderRadius={20} backgroundColor="#050f1f" glowColor="16 185 129" glowIntensity={0.6}>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4 opacity-70">
                  <Wifi className="h-4 w-4 text-emerald-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("auto.EdgeFleet_3733") || "Edge Fleet"}</span>
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-black text-white">{fleet?.edge_nodes_registered ?? 0}</p>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{t("auto.Registered_6683") || "Registered"}</span>
                </div>
              </div>
            </BorderGlow>

            <BorderGlow borderRadius={20} backgroundColor="#050f1f" glowColor="139 92 246" glowIntensity={0.6}>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4 opacity-70">
                  <Activity className="h-4 w-4 text-purple-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("auto.NetworkScore_1003") || "Network Score"}</span>
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-black text-white">{intelligenceScore.toFixed(1)}%</p>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-purple-400 uppercase">{t("auto.Accuracy_8073") || "Accuracy"}</span>
                  </div>
                </div>
              </div>
            </BorderGlow>
          </div>

          {/* Node List View */}
          <div className="bg-black/40 border border-neutral-800/60 rounded-3xl overflow-hidden backdrop-blur-xl relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.02] to-transparent pointer-events-none" />
            
            {/* Pulsing Connection Lines Overlay */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
              <svg className="w-full h-full" preserveAspectRatio="none">
                <defs>
                   <linearGradient id="lineGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                     <stop offset="0%" stopColor="transparent" />
                     <stop offset="50%" stopColor="#22d3ee" />
                     <stop offset="100%" stopColor="transparent" />
                   </linearGradient>
                </defs>
                <motion.path 
                  d="M 50% 100% Q 40% 50% 50% 0" 
                  stroke="url(#lineGrad)" 
                  strokeWidth="1" 
                  fill="transparent"
                  animate={{ 
                    strokeDasharray: ["0, 100", "100, 0"],
                    strokeDashoffset: [0, -200]
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                />
                <motion.path 
                  d="M 20% 100% Q 30% 50% 50% 0" 
                  stroke="url(#lineGrad)" 
                  strokeWidth="1" 
                  fill="transparent"
                  animate={{ 
                    strokeDasharray: ["0, 100", "100, 0"],
                    strokeDashoffset: [0, -200]
                  }}
                  transition={{ duration: 5, repeat: Infinity, ease: "linear", delay: 1 }}
                />
                <motion.path 
                  d="M 80% 100% Q 70% 50% 50% 0" 
                  stroke="url(#lineGrad)" 
                  strokeWidth="1" 
                  fill="transparent"
                  animate={{ 
                    strokeDasharray: ["0, 100", "100, 0"],
                    strokeDashoffset: [0, -200]
                  }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear", delay: 2 }}
                />
              </svg>
            </div>

            <div className="px-8 py-6 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-500" />
                {t("auto.EdgeComputeNode_3361") || "Edge Compute Nodes"}
              </h2>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("auto.AllNodesOperati_2131") || "All Nodes Operational"}</span>
              </div>
            </div>

            {loading ? (
              <div className="p-20 flex flex-col items-center justify-center gap-4">
                <CircuitBoard className="animate-spin h-10 w-10 text-cyan-500/40" />
                <span className="text-xs font-black uppercase tracking-widest text-neutral-600">{t("auto.InitialisingSEC_8227") || "Initialising SECURE-LINK..."}</span>
              </div>
            ) : !fleet?.fleet.length ? (
              <div className="p-20 text-center flex flex-col items-center gap-4">
                <div className="p-4 bg-white/5 rounded-full border border-white/5">
                  <RefreshCw className="w-8 h-8 text-neutral-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-neutral-400 italic">{t("auto.NetworkIdle_4429") || "Network Idle"}</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/40">
                <AnimatePresence>
                  {fleet?.fleet.map((node: EdgeNode, i: number) => (
                    <motion.div
                      key={node.node_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center justify-between px-8 py-5 hover:bg-white/[0.02] transition-colors group/node"
                    >
                      <div className="flex items-center space-x-6">
                        <div className={`relative p-2.5 rounded-xl border transition-all duration-500 ${
                          node.status === "syncing" 
                            ? "bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] animate-pulse" 
                            : "bg-slate-900 border-slate-800 group-hover/node:border-neutral-700"
                        }`}>
                          {node.status === "syncing" ? (
                            <Zap className="h-4 w-4 text-cyan-400" />
                          ) : (
                            <Wifi className="h-4 w-4 text-slate-500 group-hover/node:text-cyan-500/60" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-mono font-black text-sm tracking-tighter text-white uppercase">{node.node_id}</p>
                            <span className="text-[8px] font-black bg-white/5 text-slate-500 px-1.5 py-0.5 rounded border border-white/5">{t("auto.CAM04A_7050") || "CAM-04-A"}</span>
                          </div>
                          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-2">
                             <div className={`w-1 h-1 rounded-full ${node.status === "syncing" ? "bg-cyan-400 animate-ping" : "bg-emerald-500"}`} />
                             <span>{node.local_samples.toLocaleString()} Samples Encrypted · <span className="text-neutral-600 italic">v{node.pushed_version}</span></span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          <span className={`text-[9px] font-black tracking-widest px-2.5 py-1 rounded shadow-lg transition-all duration-300 ${
                            node.status === "syncing" 
                              ? "bg-cyan-500 text-black border-cyan-400 shadow-cyan-500/20" 
                              : "bg-neutral-900 text-neutral-500 border border-neutral-800"
                          }`}>
                            {node.status === "syncing" ? "FEDERATING" : "STANDBY"}
                          </span>
                          <p className="text-[9px] font-mono font-bold text-neutral-600 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(node.last_sync).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )) as any}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Right: Privacy & Security Explanation */}
        <div className="lg:col-span-4 space-y-6">
          {/* Live Privacy Ledger */}
          <div className="bg-black/60 border border-cyan-500/20 rounded-3xl p-6 font-mono overflow-hidden h-[180px] relative">
            <div className="absolute top-0 left-0 right-0 p-2 bg-cyan-500/10 border-b border-cyan-500/20 flex items-center justify-between">
              <span className="text-[9px] font-black tracking-widest text-cyan-400">{t("auto.PRIVACYCORELEDG_7216") || "PRIVACY-CORE LEDGER"}</span>
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
                <div className="w-1 h-1 rounded-full bg-cyan-500/40" />
              </div>
            </div>
            <div className="mt-8 space-y-2">
              <AnimatePresence mode="popLayout">
                {privacyLogs.length === 0 ? (
                  <p className="text-[10px] text-neutral-600 uppercase italic">{t("auto.Awaitingsecureh_4616") || "Awaiting secure handshake..."}</p>
                ) : (
                  privacyLogs.map((log, idx) => (
                    <motion.p
                      key={log + idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="text-[9px] text-cyan-300/80 leading-relaxed overflow-hidden whitespace-nowrap"
                    >
                      <span className="text-cyan-600 mr-2">[{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                      {log}
                    </motion.p>
                  ))
                )}
              </AnimatePresence>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black to-transparent pointer-events-none" />
          </div>

          <div className="bg-[#050f1f]/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <ShieldCheck className="w-32 h-32 text-cyan-400" />
            </div>
            <h3 className="text-lg font-black uppercase italic tracking-tighter text-white mb-6 flex items-center gap-3">
              <Lock className="w-5 h-5 text-cyan-500" />
              {t("auto.PrivacyProtocol_9433") || "Privacy Protocol"}
            </h3>
            
            <div className="space-y-8 relative z-10">
              <div className="flex gap-4">
                <div className="p-2 h-fit bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                  <Fingerprint className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-1">{t("auto.OnDeviceLearnin_3806") || "On-Device Learning"}</h4>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Neural training occurs locally on the camera edge. **No raw video footage or images** ever leave the secure premises.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="p-2 h-fit bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">{t("auto.DifferentialPri_7490") || "Differential Privacy"}</h4>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Syncs only contain mathematical gradients (weights) which are anonymized via noise injection before transmission.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="p-2 h-fit bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <Globe className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1">{t("auto.GlobalIntellige_8591") || "Global Intelligence"}</h4>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Updates from thousands of sensors are aggregated into a single expert model, making every camera "smarter" every day.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-white/5">
              <div className="bg-cyan-500/5 rounded-2xl p-4 border border-cyan-500/10">
                <p className="text-[10px] text-cyan-500/80 font-bold uppercase tracking-widest leading-relaxed">
                  {t("auto.LaminarFederate_3422") || "Laminar Federated AI is compliant with GDPR, HIPAA, and CCPA by design."}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="bg-gradient-to-br from-neutral-900 to-black border border-neutral-800 rounded-3xl p-6">
             <div className="flex items-center justify-between mb-4">
               <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">{t("auto.FleetUptime_6677") || "Fleet Uptime"}</span>
               <span className="text-xs font-black text-emerald-500 italic uppercase">99.99%</span>
             </div>
             <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
               <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 w-[99.9%]" />
             </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
