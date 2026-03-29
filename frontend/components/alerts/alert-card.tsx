"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert, Clock, Eye, Loader2, Camera, Download } from "lucide-react";
import { acknowledgeAlert, resolveAlert } from "@/services/alert.service";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  alert: any;
}

const SEVERITY_CONFIG: Record<string, {
  label: string;
  badgeClass: string;
  borderClass: string;
  glowClass: string;
  stripClass: string;
  textClass: string;
}> = {
  critical: {
    label: "CRITICAL",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/40",
    borderClass: "border-rose-500/25 hover:border-rose-500/50",
    glowClass: "bg-rose-600/20",
    stripClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]",
    textClass: "text-rose-400",
  },
  high: {
    label: "HIGH",
    badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/40",
    borderClass: "border-orange-500/25 hover:border-orange-500/50",
    glowClass: "bg-orange-600/20",
    stripClass: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
    textClass: "text-orange-400",
  },
  medium: {
    label: "MEDIUM",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/40",
    borderClass: "border-amber-500/25 hover:border-amber-500/50",
    glowClass: "bg-amber-600/20",
    stripClass: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
    textClass: "text-amber-400",
  },
  low: {
    label: "LOW",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    borderClass: "border-emerald-500/25 hover:border-emerald-500/50",
    glowClass: "bg-emerald-600/20",
    stripClass: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
    textClass: "text-emerald-400",
  },
};

export default function AlertCard({ alert }: Props) {
  const queryClient = useQueryClient();
  const [ackLoading, setAckLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);

  const rawSeverity = (alert.risk_level ?? alert.severity ?? "medium").toLowerCase();
  const cfg = SEVERITY_CONFIG[rawSeverity] ?? SEVERITY_CONFIG["medium"];

  async function handleAck() {
    setAckLoading(true);
    try {
      await acknowledgeAlert(alert.id);
      // Invalidate alerts query so the panel updates in real-time
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.info("Alert Acknowledged", {
        description: `Alert ${alert.id.slice(0, 8)} logged by operator.`,
      });
    } catch {
      toast.error("Failed to acknowledge alert");
    } finally {
      setAckLoading(false);
    }
  }

  async function handleResolve() {
    setResolveLoading(true);
    try {
      await resolveAlert(alert.id);
      // Invalidate both alerts and dashboard stats
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Threat Resolved", {
        description: `Alert cleared for venue ${alert.venue_id?.slice(0, 8) ?? "unknown"}.`,
        icon: "✅",
      });
    } catch {
      toast.error("Failed to resolve alert");
    } finally {
      setResolveLoading(false);
    }
  }

  const createdAt = alert.created_at ? new Date(alert.created_at) : new Date();
  const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true });
  const isCritical = rawSeverity === "critical";

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`
      group relative overflow-hidden rounded-xl border p-4 transition-colors cursor-default
      bg-[#081428]/70 backdrop-blur-xl
      ${cfg.borderClass}
      hover:shadow-lg
    `}>
      {/* Left severity strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${cfg.stripClass}`} />

      {/* Ambient glow */}
      <div className={`absolute -left-8 -top-8 w-20 h-20 rounded-full blur-3xl ${cfg.glowClass} opacity-50 pointer-events-none`} />

      <div className="relative z-10 pl-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {isCritical ? (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
            ) : (
              <AlertTriangle className={`w-4 h-4 ${cfg.textClass} shrink-0`} />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`badge border ${cfg.badgeClass}`}>
                  {cfg.label}
                </span>
                {alert.status === "acknowledged" && (
                  <span className="badge bg-slate-700/60 border-slate-600/40 text-slate-400">
                    <Eye className="w-2.5 h-2.5" />
                    SEEN
                  </span>
                )}
              </div>
            </div>
          </div>

        {/* Timestamp */}
          <div className="flex items-center gap-1 text-[10px] text-slate-600 font-mono shrink-0">
            <Clock className="w-3 h-3" />
            <span title={format(createdAt, "PPpp")}>{timeAgo}</span>
          </div>
        </div>

        {/* Venue info & Model Predictions */}
        <div className="bg-[#020c1a]/80 rounded border border-[#0f2440] p-2 mb-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider">Venue</span>
                <span className="text-[11px] font-mono text-cyan-400 truncate max-w-[100px]">{alert.venue_id?.slice(0, 8) ?? "N/A"}…</span>
              </div>
              
              {alert.predicted_level && alert.predicted_level !== rawSeverity && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                  <span className="text-[8px] text-purple-400 font-mono uppercase tracking-wider">Predicts</span>
                  <span className="text-[9px] font-bold text-purple-300 uppercase">{alert.predicted_level}</span>
                </div>
              )}
            </div>

            {alert.message && (
              <p className="text-[11px] text-slate-400 leading-snug mt-1 line-clamp-2">{alert.message}</p>
            )}
            
            {(alert.explanation || alert.extra_data?.reason || alert.extra_data?.explanation) && (
              <div className="mt-1.5 border-t border-[#1e3a5f] pt-1.5">
                {alert.extra_data?.alert_type && (
                   <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-bold tracking-widest uppercase mb-1.5 border border-indigo-500/30">
                     {alert.extra_data.alert_type.replace(/_/g, ' ')}
                   </span>
                )}
                <p className="text-[10px] text-slate-300 leading-snug bg-[#0a192f]/50 p-2 rounded-md">
                  <span className="text-cyan-400 font-semibold mb-1 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1v-1.27c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2Z"/><path d="M9 16v-1a3 3 0 0 1 6 0v1"/></svg>
                    Intelligence Reason
                  </span>
                  {alert.extra_data?.reason || alert.explanation || alert.extra_data?.explanation}
                </p>
                {alert.extra_data?.xai_factors && alert.extra_data.xai_factors.length > 0 && (
                  <div className="mt-2 bg-[#020c1a]/50 p-2 rounded-md border border-cyan-500/10">
                    <details className="group/xai text-[9px]">
                      <summary className="cursor-pointer text-cyan-500/80 font-bold uppercase tracking-widest flex items-center gap-1 hover:text-cyan-400 transition-colors select-none">
                        <Eye className="w-3 h-3 group-open/xai:text-cyan-400" /> Explainable AI (Why?)
                      </summary>
                      <ul className="mt-2 space-y-1.5 list-disc pl-4 text-slate-400 opacity-80 border-t border-white/5 pt-2">
                        {alert.extra_data.xai_factors.map((factor: string, i: number) => (
                           <li key={i}>{factor}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}
                {alert.extra_data?.recommended_action && (
                  <p className="text-[10px] text-emerald-300 leading-snug bg-emerald-950/30 p-2 mt-1 rounded-md border border-emerald-900/50">
                    <strong className="text-emerald-400 block mb-0.5 uppercase tracking-wider text-[9px]">Recommended Action:</strong>
                    {alert.extra_data.recommended_action}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 📸 Evidence Snapshot + Clip */}
        {(alert.snapshot_url || alert.clip_url) && (
          <div className="bg-[#020c1a]/80 rounded border border-[#0f2440] p-2 mb-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Camera className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] text-cyan-500 uppercase tracking-wider font-semibold">Evidence Capture</span>
            </div>

            {alert.snapshot_url && (
              <div className="relative group/snap mb-2">
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || ""}${alert.snapshot_url}`}
                  alt="Alert Snapshot"
                  className="w-full rounded-md border border-slate-700/60 object-cover max-h-36 transition-all duration-300 group-hover/snap:max-h-full"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/snap:opacity-100 transition-opacity bg-black/40 rounded-md pointer-events-none">
                  <span className="text-[10px] text-white font-medium bg-black/60 px-2 py-1 rounded">Click to expand</span>
                </div>
              </div>
            )}

            {alert.clip_url && (
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || ""}${alert.download_url || alert.clip_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded border border-violet-600/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all w-fit"
                download
              >
                <Download className="w-3 h-3" />
                Download 10s Clip
              </a>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {alert.status !== "acknowledged" && alert.status !== "resolved" && (
            <button
              onClick={handleAck}
              disabled={ackLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold rounded border border-slate-700 bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-50"
            >
              {ackLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
              Ack
            </button>
          )}

          {alert.status !== "resolved" && (
            <button
              onClick={handleResolve}
              disabled={resolveLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold rounded border border-emerald-600/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:border-emerald-500 hover:text-slate-900 transition-all shadow-sm disabled:opacity-50"
            >
              {resolveLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Resolve
            </button>
          )}

          {alert.status === "resolved" && (
            <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md border border-emerald-900/30 bg-emerald-900/10 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />
              Resolved
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}