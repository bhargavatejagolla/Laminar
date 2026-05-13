"use client";

import { useAlerts } from "@/hooks/useAlerts";
import AlertCard from "./alert-card";
import { ShieldCheck, Loader2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export default function AlertPanel({ filter = "live" }: { filter?: "live" | "history" | "all" } = {}) {
  const { t } = useTranslation();

  const { data, crowdAlerts, cameraAlerts, isLoading } = useAlerts();
  const isInitialLoad = useRef(true);
  const knownAlerts = useRef<Set<string>>(new Set());

  // Combine both types for a master list
  let allAlerts = [...(crowdAlerts || []), ...(cameraAlerts || [])];
  
  if (filter === "live") {
      allAlerts = allAlerts.filter(a => a.status !== "resolved");
  } else if (filter === "history") {
      allAlerts = allAlerts.filter(a => a.status === "resolved");
  }

  useEffect(() => {
    if (allAlerts.length > 0) {
      if (isInitialLoad.current) {
        allAlerts.forEach((a: any) => knownAlerts.current.add(a.id));
        isInitialLoad.current = false;
        return;
      }

      let hasNewUrgent = false;
      allAlerts.forEach((a: any) => {
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
  }, [allAlerts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-[#0f172a]/50 rounded-xl border border-slate-800">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        <span className="ml-3 text-slate-400 font-medium">{t("auto.Scanningforanom_6324") || "Scanning for anomalies..."}</span>
      </div>
    );
  }

  if (allAlerts.length === 0) {
    if (filter === "history") {
      return (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/40 rounded-xl border border-slate-800 text-center">
          <h3 className="text-slate-400 font-semibold mb-1 tracking-wide">{t("auto.BlankHistory_5267") || "Blank History"}</h3>
          <p className="text-slate-500 text-sm max-w-sm">{t("auto.Therearenoresol_8411") || "There are no resolved alerts existing in the telemetry memory index right now."}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-emerald-950/10 rounded-xl border border-emerald-900/20 text-center">
        <div className="p-3 bg-emerald-500/10 rounded-full mb-4">
          <ShieldCheck className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-emerald-400 font-semibold mb-1 tracking-wide">{t("auto.SystemSecure_5792") || "System Secure"}</h3>
        <p className="text-slate-500 text-sm max-w-sm">{t("auto.Noactivealertsd_6578") || "No active alerts detected across all monitored venues. Automated threat detection is actively running."}</p>
      </div>
    );
  }

  // Smart Prioritization Sorting
  const sortedAlerts = [...allAlerts].sort((a: any, b: any) => {
    const riskWeight: Record<string, number> = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      camera_issue: 4, // Hardware issues are generally high priority
    };
    
    const getWeight = (alert: any) => {
      // Prioritize by actual severity score if available
      if (typeof alert.severity === "number") return alert.severity;
      
      const extra = alert.extra_data || {};
      const type = extra.type || extra.alert_type;
      
      if (type === "camera_issue") return riskWeight.camera_issue;

      const level = alert.risk_level || "medium";
      return riskWeight[level.toLowerCase()] || 3;
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
