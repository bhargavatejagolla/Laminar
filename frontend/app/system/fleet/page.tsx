"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Cpu, RefreshCw, CircuitBoard, Wifi, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

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
  const [fleet, setFleet] = useState<FleetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/edge/model-status`);
      const data = await res.json();
      setFleet(data);
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

  const simulateSync = async () => {
    setSimulating(true);
    const nodes = ["CAM-EDGE-001", "CAM-EDGE-002", "CAM-EDGE-003", "CAM-EDGE-004"];
    for (const node of nodes) {
      await fetch(`${API_URL}/api/v1/edge/sync-model-weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edge_node_id: node,
          local_samples: Math.floor(Math.random() * 5000) + 100,
          model_version: fleet?.global_version || "v1.0.0",
        }),
      });
    }
    await fetchStatus();
    setSimulating(false);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 text-white min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
            <CircuitBoard className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-widest uppercase">Edge Fleet Health</h1>
            <p className="text-neutral-500 tracking-wider text-sm mt-1">Federated Learning synchronisation status.</p>
          </div>
        </div>
        <button
          onClick={simulateSync}
          disabled={simulating}
          className="flex items-center space-x-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm uppercase tracking-widest"
        >
          <RefreshCw className={`h-4 w-4 ${simulating ? "animate-spin" : ""}`} />
          <span>{simulating ? "Syncing..." : "Simulate Sync"}</span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-6">
        {[
          { label: "Global Model Version", value: fleet?.global_version ?? "—", icon: <Cpu className="h-5 w-5 text-cyan-400" /> },
          { label: "Edge Nodes Registered", value: fleet?.edge_nodes_registered ?? 0, icon: <Wifi className="h-5 w-5 text-emerald-400" /> },
          {
            label: "Last Sync",
            value: fleet?.last_sync_at ? new Date(fleet.last_sync_at).toLocaleTimeString() : "Never",
            icon: <RefreshCw className="h-5 w-5 text-purple-400" />,
          },
        ].map((c) => (
          <div key={c.label} className="bg-black/40 border border-neutral-800 rounded-2xl p-6 flex items-center space-x-4">
            <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800">{c.icon}</div>
            <div>
              <p className="text-xs uppercase tracking-widest text-neutral-500">{c.label}</p>
              <p className="text-2xl font-black mt-1">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Node table */}
      <div className="bg-black/40 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 text-sm font-bold uppercase tracking-widest text-neutral-400">
          Registered Edge Nodes
        </div>
        {loading ? (
          <div className="p-12 flex justify-center">
            <CircuitBoard className="animate-pulse h-10 w-10 text-neutral-700" />
          </div>
        ) : !fleet?.fleet.length ? (
          <div className="p-12 text-center text-neutral-500">No edge nodes registered yet. Click &quot;Simulate Sync&quot;.</div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {fleet.fleet.map((node) => (
              <motion.div
                key={node.node_id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between px-6 py-4 hover:bg-neutral-900/40 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  {node.status === "syncing" ? (
                    <RefreshCw className="h-4 w-4 text-cyan-400 animate-spin shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <p className="font-mono font-bold text-white">{node.node_id}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 relative flex items-center gap-2">
                       {node.status === "syncing" && <span className="absolute -left-2 top-1.5 w-1 h-1 bg-cyan-400 rounded-full animate-ping"></span>}
                      {node.local_samples.toLocaleString()} local samples · model {node.pushed_version}
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-col justify-end items-end gap-1.5">
                  {node.status === "syncing" ? (
                    <span className="text-[9px] flex items-center gap-1.5 uppercase font-bold tracking-[0.2em] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                      FEDERATING
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase font-bold tracking-[0.2em] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
                      {node.status}
                    </span>
                  )}
                  <p className="text-[10px] font-mono text-neutral-500">
                    {new Date(node.last_sync).toLocaleTimeString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
