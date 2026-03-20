"use client";

import { useAlerts } from "@/hooks/useAlerts";
import AlertCard from "./alert-card";
import { ShieldCheck, Loader2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";

export default function AlertPanel() {
  const { data, isLoading } = useAlerts();
  const isInitialLoad = useRef(true);
  const knownAlerts = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (data) {
      if (isInitialLoad.current) {
        data.forEach((a: any) => knownAlerts.current.add(a.id));
        isInitialLoad.current = false;
        return;
      }

      let hasNewUrgent = false;
      data.forEach((a: any) => {
        if (!knownAlerts.current.has(a.id)) {
          knownAlerts.current.add(a.id);
          if (a.risk_level === 'critical' || a.risk_level === 'high') {
            hasNewUrgent = true;
          }
        }
      });

      if (hasNewUrgent) {
        const audio = new Audio('/ping.wav');
        audio.play().catch(e => console.log('Audio play prevented by browser:', e));
      }
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-[#0f172a]/50 rounded-xl border border-slate-800">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        <span className="ml-3 text-slate-400 font-medium">Scanning for anomalies...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-emerald-950/10 rounded-xl border border-emerald-900/20 text-center">
        <div className="p-3 bg-emerald-500/10 rounded-full mb-4">
          <ShieldCheck className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-emerald-400 font-semibold mb-1 tracking-wide">System Secure</h3>
        <p className="text-slate-500 text-sm max-w-sm">No active alerts detected across all monitored venues. Automated threat detection is actively running.</p>
      </div>
    );
  }

  // Smart Prioritization Sorting
  const sortedAlerts = [...data].sort((a: any, b: any) => {
    const riskWeight: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };
    const getWeight = (alert: any) => {
      if (typeof alert.severity === "number") return alert.severity;
      const val = typeof alert.severity === "string" ? alert.severity : alert.risk_level;
      return riskWeight[typeof val === "string" ? val.toLowerCase() : ""] || 2;
    };
    
    const weightA = getWeight(a);
    const weightB = getWeight(b);

    if (weightA !== weightB) {
      return weightB - weightA; // Higher weight first
    }
    
    // Secondary sort by timestamp desc
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <AnimatePresence mode="popLayout">
        {sortedAlerts.map((alert: any) => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </AnimatePresence>
    </div>
  );
}