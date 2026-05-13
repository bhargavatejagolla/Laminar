"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert, Clock, Eye, Loader2, Camera, Download } from "lucide-react";
import { acknowledgeAlert, resolveAlert } from "@/services/alert.service";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getToken } from "@/services/auth";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const [ackLoading, setAckLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const token = getToken();
  const BACKEND = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/v1$/, '');

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
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      className={`
      group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300
      bg-gradient-to-br from-[#081428]/90 to-[#040a12]/95 backdrop-blur-2xl
      ${cfg.borderClass}
    `}>
      {/* Dynamic Cyber strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.stripClass} rounded-l-2xl z-20`} />
      
      {/* Animated Top border highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

      {/* Ambient Radial glow */}
      <div className={`absolute -left-12 -top-12 w-32 h-32 rounded-full blur-[50px] ${cfg.glowClass} pointer-events-none z-0`} />

      <div className="relative z-10 pl-3 flex flex-col h-full">
        {/* Superior Header row */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-black/40 border ${cfg.borderClass} shadow-inner`}>
              {isCritical ? (
                <ShieldAlert className="w-5 h-5 text-rose-400 animate-[pulse_1.5s_ease-in-out_infinite]" />
              ) : (
                <AlertTriangle className={`w-5 h-5 ${cfg.textClass}`} />
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-[0.15em] ${cfg.badgeClass}`}>
                  {cfg.label}
                </span>
                {alert.status === "acknowledged" && (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-slate-800/60 border border-slate-700/50 text-slate-300 flex items-center gap-1 shadow-inner">
                    <Eye className="w-3 h-3" /> {t("auto.SEEN_6769") || "SEEN"}
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

        {/* Intelligence Module */}
        <div className="bg-[#020b16]/60 rounded-xl border border-[#1e3a5f]/40 p-4 mb-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between mb-3 border-b border-[#1e3a5f]/50 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t("auto.VenueMatrix_1706") || "Venue Matrix"}</span>
                  <span className="text-xs font-mono font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)] bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">{alert.venue_id?.slice(0, 8) ?? "GLOBAL_NET"}</span>
                </div>
              
              {alert.predicted_level && alert.predicted_level !== rawSeverity && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-fuchsia-500/10 border border-fuchsia-500/30 shadow-[0_0_10px_rgba(217,70,239,0.15)]">
                  <span className="text-[9px] font-black text-fuchsia-500 uppercase tracking-widest">{t("auto.Predicts_2609") || "Predicts"}</span>
                  <span className="text-[10px] font-bold text-fuchsia-300 uppercase">{alert.predicted_level}</span>
                </div>
              )}
            </div>

            {alert.message && (
              <p className="text-sm font-medium text-slate-200 leading-relaxed mb-3">{alert.message}</p>
            )}
            
            {(alert.explanation || alert.extra_data?.reason || alert.extra_data?.explanation) && (
              <div className="space-y-3">
                {alert.extra_data?.alert_type && (
                   <span className="inline-block px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-black tracking-widest uppercase border border-indigo-500/20 shadow-inner">
                     {alert.extra_data.alert_type.replace(/_/g, ' ')}
                   </span>
                )}
                
                <div className="relative group/reason">
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-cyan-500/50 shadow-[0_0_8px_rgba(34,211,238,0.6)]"></div>
                  <div className="bg-gradient-to-r from-cyan-950/40 to-transparent pl-4 py-2 pr-2 text-[11px] text-slate-300 leading-relaxed rounded-r border-y border-r border-[#1e3a5f]/20">
                    <span className="text-cyan-400 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1v-1.27c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2Z"/><path d="M9 16v-1a3 3 0 0 1 6 0v1"/></svg>
                      {t("auto.IntelligenceRea_3909") || "Intelligence Reason"}
                    </span>
                    {alert.extra_data?.reason || alert.explanation || alert.extra_data?.explanation}
                  </div>
                </div>

                {alert.extra_data?.xai_factors && alert.extra_data.xai_factors.length > 0 && (
                  <div className="bg-black/40 p-3 rounded-lg border border-cyan-900/30">
                    <details className="group/xai text-[10px]">
                      <summary className="cursor-pointer text-cyan-500/70 font-black uppercase tracking-widest flex items-center gap-1.5 hover:text-cyan-400 transition-colors select-none">
                        <Eye className="w-3.5 h-3.5 group-open/xai:text-cyan-400" /> Neural Exegesis (XAI)
                      </summary>
                      <ul className="mt-2.5 space-y-2 list-disc pl-5 text-slate-400 border-t border-white/5 pt-2.5 font-mono text-[9px] tracking-wide">
                        {alert.extra_data.xai_factors.map((factor: string, i: number) => (
                           <li key={i}>{factor}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}
                
                {alert.extra_data?.recommended_action && (
                  <div className="relative overflow-hidden rounded border border-emerald-500/30 bg-emerald-950/20 p-3 mt-2 shadow-[inset_0_0_15px_rgba(16,185,129,0.05)]">
                    <div className="absolute top-0 right-0 p-1">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(16,185,129,1)]"></div>
                    </div>
                    <strong className="text-emerald-400 flex items-center gap-1.5 mb-1.5 uppercase tracking-widest text-[10px] font-black">
                      {t("auto.RecommendedActi_6991") || "Recommended Action"}
                    </strong>
                    <span className="text-[11px] text-emerald-100/90 font-medium">{alert.extra_data.recommended_action}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Evidence Block */}
        {(alert.snapshot_url || alert.clip_url) && (
          <div className="bg-[#020b16]/80 rounded-xl border border-[#1e3a5f]/50 p-3 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-cyan-500/10 rounded">
                   <Camera className="w-3 h-3 text-cyan-400" />
                </div>
                <span className="text-[10px] text-slate-300 uppercase tracking-widest font-bold">{t("auto.EvidenceCapture_5503") || "Evidence Capture"}</span>
              </div>
              
              {alert.clip_url && (
                <a
                  href={(() => {
                    const urlPath = alert.download_url || alert.clip_url;
                    const cleanPath = urlPath.startsWith('http') ? urlPath : `${BACKEND}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
                    return `${cleanPath}${cleanPath.includes('?') ? '&' : '?'}token=${token ? encodeURIComponent(token) : ''}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500 hover:text-white transition-all shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                  download={`evidence_${alert.id}.mp4`}
                >
                  <Download className="w-3 h-3" /> {t("auto.GetIntel_4627") || "Get Intel"}
                </a>
              )}
            </div>

            {alert.snapshot_url && (
              <div className="relative group/snap overflow-hidden rounded border border-white/10">
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover/snap:opacity-100 z-10"></div>
                <img
                  src={alert.snapshot_url.startsWith('http') ? alert.snapshot_url : `${BACKEND}${alert.snapshot_url}`}
                  alt="Alert Snapshot"
                  className="w-full h-auto max-h-[300px] object-contain bg-black/40 opacity-90 group-hover/snap:opacity-100 transition-opacity duration-500"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/snap:opacity-100 transition-opacity duration-300 pointer-events-none flex items-end p-2">
                   <span className="text-[9px] text-white font-mono tracking-widest uppercase">{t("auto.TargetLockVisua_2300") || "Target Lock Visualized"}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-3 mt-auto pt-2">
          {alert.status !== "acknowledged" && alert.status !== "resolved" && (
            <button
              onClick={handleAck}
              disabled={ackLoading}
              className="flex-1 group flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-widest font-black rounded-lg border border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 transition-all disabled:opacity-30 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform"></div>
              {ackLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="relative z-10">{t("auto.Acknowledge_7155") || "Acknowledge"}</span>
            </button>
          )}

          {alert.status !== "resolved" && (
            <button
              onClick={handleResolve}
              disabled={resolveLoading}
              className="flex-1 group flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-widest font-black rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-slate-900 transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)] disabled:opacity-30 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-emerald-400 translate-y-full group-hover:translate-y-0 transition-transform"></div>
              {resolveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin relative z-10" /> : <CheckCircle2 className="w-3.5 h-3.5 relative z-10" />}
              <span className="relative z-10">{t("auto.ClearEvent_7872") || "Clear Event"}</span>
            </button>
          )}

          {alert.status === "resolved" && (
            <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg border border-emerald-900/50 bg-emerald-950/30 text-emerald-600/80">
              <CheckCircle2 className="w-4 h-4" />
              {t("auto.ConditionResolv_736") || "Condition Resolved"}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}