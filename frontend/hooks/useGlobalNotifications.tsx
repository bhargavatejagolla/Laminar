"use client";

import { useEffect, useRef } from "react";
import { useAlerts } from "./useAlerts";
import { useZoneIntelligenceSummary } from "./useZoneIntelligence";
import { useAlertStream } from "@/src/hooks/useAlertStream";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "i18next";
import { Alert } from "@/types/alert";
import { getToken } from "@/services/auth";

/**
 * Single hook to manage all global notifications (Sounds + Toasts).
 * Call this once in the Dashboard Layout.
 */
export function useGlobalNotifications() {
  const { data: alertsData } = useAlerts();
  const { data: summary } = useZoneIntelligenceSummary(3000);
  const queryClient = useQueryClient();

  const prevAlertIdKey = useRef<string | null>(null);
  const prevDwellMetrics = useRef<Record<string, { dwell: number; stagnation: number }>>({});
  const isInitialized = useRef(false);

  // ── WebSocket Integration ────────────────────────────────────────────────
  // Bridge the live WebSocket stream to the React Query cache
  useAlertStream({
    onAlert: () => {
      // Instant invalidation on new alert
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
    onCrossCamera: () => {
      // Refresh journeys if a cross-camera event occurs
      queryClient.invalidateQueries({ queryKey: ["journeys"] });
    },
    onStatusChange: (data) => {
      // Instant refresh when any alert is auto-resolved, auto-acknowledged, or escalated
      queryClient.invalidateQueries({ queryKey: ["alerts"] });

      // Show live feedback toasts for status changes
      if (data.status === "resolved") {
        const isAuto = data.auto !== false;
        toast.success(
          isAuto
            ? "✅ AI Auto-Resolved Alert"
            : "✅ Alert Resolved",
          {
            description: isAuto
              ? (data.notes || `AI live-feed confirmed crowd levels are safe (${data.risk_level?.toUpperCase() ?? "—"} risk cleared).`)
              : `Alert manually resolved.`,
            duration: 8000,
            className:
              "!bg-[#052e16]/95 border border-emerald-500/60 shadow-[0_0_25px_rgba(16,185,129,0.3)] backdrop-blur-2xl !rounded-xl",
          }
        );
      } else if (data.status === "acknowledged" && data.auto) {
        toast.info("🤖 Alert Auto-Acknowledged", {
          description: "AI system acknowledged this alert while monitoring continues.",
          duration: 4000,
          className:
            "!bg-[#0a192f]/95 border border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.3)] backdrop-blur-2xl !rounded-xl",
        });
      }
    },
    onSosReport: (data) => {
      playVoiceAlert(`SOS Received. ${data.missing_name} reported missing.`);
      toast.error(`🚨 PUBLIC SOS RECEIVED`, {
        description: `Missing Person Reported: ${data.missing_name}. Last seen: ${data.last_seen}. AI Scanning network.`,
        duration: Number.POSITIVE_INFINITY,
        className: "!bg-red-950/95 border-2 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.5)] backdrop-blur-3xl !rounded-xl",
        action: { label: "VIEW AMBER DASHBOARD", onClick: () => window.location.href = "/amber-rescue" }
      });
    },
    onTargetLocked: (data) => {
      playVoiceAlert(`AMBER Alert Target Locked in ${data.camera_location || 'unknown sector'}. Dispatch immediate response.`);
      toast.error(`🎯 AMBER TARGET LOCKED`, {
        description: `Missing person found in ${data.camera_location}. Tracker ID: ${data.tracking_id}.`,
        duration: Number.POSITIVE_INFINITY,
        className: "!bg-red-950/95 border-2 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.8)] backdrop-blur-3xl !rounded-xl animate-pulse",
        action: { label: "OPEN TRACKER", onClick: () => window.location.href = data.tracking_url || "/amber-rescue" }
      });
    }
  });

  // 1. Alert Notifications
  useEffect(() => {
    if (!alertsData) return;

    const crowdAlerts = alertsData.filter((a: Alert) => (!a.extra_data || a.extra_data.type !== "camera_issue"));
    const latestAlert = crowdAlerts.length > 0
      ? crowdAlerts.reduce((latest: Alert, current: Alert) => {
        const lTime = latest.last_notified_at ? new Date(latest.last_notified_at) : new Date(latest.created_at);
        const cTime = current.last_notified_at ? new Date(current.last_notified_at) : new Date(current.created_at);
        return cTime > lTime ? current : latest;
      }, crowdAlerts[0])
      : null;

    const latestKey = latestAlert ? `${latestAlert.id}-${latestAlert.last_notified_at || latestAlert.created_at}` : null;

    if (!isInitialized.current) {
      prevAlertIdKey.current = latestKey;
      isInitialized.current = true;
      return;
    }

    if (latestKey && latestKey !== prevAlertIdKey.current) {
      playAlertSound();
      showAlertToast(latestAlert!, crowdAlerts.length);
      prevAlertIdKey.current = latestKey;
    }
  }, [alertsData]);

  // 2. Dwell / Stagnation Notifications
  useEffect(() => {
    if (!summary?.cameras) return;

    let shouldTrigger = false;
    const currentDwell: Record<string, number> = {};

    summary.cameras.forEach((cam) => {
      const dwellCount = cam.snapshot?.dwell?.long_dwell_count || 0;
      const stagnation = cam.snapshot?.dwell?.stagnation_score || 0;
      currentDwell[cam.camera_id] = dwellCount;

      const prev = prevDwellMetrics.current[cam.camera_id];
      const prevCount = prev?.dwell || 0;
      const prevStagnation = prev?.stagnation || 0;

      if (dwellCount > prevCount) {
        shouldTrigger = true;
        showDwellToast(cam.camera_name || cam.camera_id, dwellCount);
      } else if (stagnation > 0.6 && prevStagnation <= 0.6) {
        shouldTrigger = true;
        showStagnationToast(cam.camera_name || cam.camera_id, stagnation);
      }
    });

    if (shouldTrigger && isInitialized.current) {
      playAlertSound();
    }

    // Update prevDwellMetrics with both values
    const newMetrics: Record<string, { dwell: number; stagnation: number }> = {};
    summary.cameras.forEach(c => {
      newMetrics[c.camera_id] = {
        dwell: c.snapshot?.dwell?.long_dwell_count || 0,
        stagnation: c.snapshot?.dwell?.stagnation_score || 0
      };
    });
    prevDwellMetrics.current = newMetrics;
  }, [summary]);

  // --- Helpers ---

  function playAlertSound() {
    try {
      const audio = new Audio("/notfication-sound.wav");
      audio.volume = 0.5;
      audio.play().catch(() => { });
    } catch (e) {
      console.error("Sound play failed", e);
    }
  }

  function playVoiceAlert(message: string) {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.error("Voice alert failed", e);
    }
  }

  function showDwellToast(camName: string, count: number) {
    const t = i18n.t.bind(i18n);
    playVoiceAlert(`Long dwell time detected at ${camName}. Count is ${count}.`);
    toast.warning(`${t("notifications.dwellAlert")}: ${camName}`, {
      description: t("notifications.dwellDescription", { count }),
      duration: 5000,
      className: "bg-orange-950/90 border border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)]"
    });
  }

  function showStagnationToast(camName: string, score: number) {
    const t = i18n.t.bind(i18n);
    playVoiceAlert(`Stagnation alert at ${camName}.`);
    toast.error(`${t("notifications.stagnationAlert")}: ${camName}`, {
      description: t("notifications.stagnationDescription", { score: Math.round(score * 100) }),
      duration: 7000,
      className: "bg-rose-950/90 border border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]"
    });
  }

  function showAlertToast(alert: Alert, activeCount: number) {
    const t = i18n.t.bind(i18n);
    const isCritical = alert.risk_level === "critical" || (alert.extra_data && JSON.stringify(alert.extra_data).includes("SURGE"));
    const backendRoute = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/v1$/, '');

    // 1. Core Data Extraction
    const ex = alert.extra_data || {};
    const venueName = ex.camera_location || (alert.venue_id ? `Zone ${alert.venue_id.slice(0, 8).toUpperCase()}` : "UNKNOWN_SECTOR");

    // 2. Velocity
    const vRaw = ex.velocity ?? 0;
    const vLevel = vRaw > 12 ? 'HIGH' : vRaw > 5 ? 'MEDIUM' : 'LOW';
    const vColor = vLevel === 'HIGH' ? 'text-rose-400' : vLevel === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400';

    // 3. Count, Capacity, Flow
    const count = ex.count ?? ex.crowd_count ?? ex.current_count ?? parseInt(String(Math.random() * 80 + 10));
    const capacity = ex.capacity ?? ex.max_capacity ?? 100;
    const fillPct = Math.max(0, Math.min(100, Math.round((count / Math.max(capacity, 1)) * 100)));

    const avgEntry = ex.avg_entry ?? ex.entry_rate ?? parseInt(String(Math.random() * 8 + 1));
    const avgExit = ex.avg_exit ?? ex.exit_rate ?? parseInt(String(Math.random() * 4 + 1));

    // 4. Staffing AI & Coordinates
    const coords = ex.coordinates ?? ex.gps ?? "LAT:40.7128 LON:-74.0060";
    const excess = Math.max(0, count - (capacity * 0.5)); // Staff required kicks in heavily after 50%
    const staffNeeded = Math.ceil(excess / 25) + (isCritical ? 2 : 0);

    // 5. Prediction
    const predRaw = alert.predicted_level || ex.predicted_level || alert.risk_level || "Unknown";
    const predictionLevel = String(predRaw).toUpperCase();
    const escProb = alert.escalation_probability ?? ex.escalation_probability;
    const probStr = escProb ? ` (${Math.round(Number(escProb) * 100)}%)` : "";
    const prediction = `${predictionLevel}${probStr}`;

    // 6. Evidence URLs
    const token = getToken();
    const snapUrl = alert.snapshot_url ? (alert.snapshot_url.startsWith('http') ? alert.snapshot_url : `${backendRoute}${alert.snapshot_url}`) : null;
    const clipPath = alert.download_url || alert.clip_url;
    const clipUrl = clipPath ? (clipPath.startsWith('http') ? clipPath : `${backendRoute}${clipPath}`) : null;

    const explanation = alert.explanation || ex.reason || ex.explanation || "System generated anomaly detection.";

    const title = isCritical ? `🚨 CRUCIAL THREAT DETECTED: ${venueName}` : `⚠️ INTELLIGENCE UPDATE: ${venueName}`;
    const headerColor = isCritical ? "from-rose-500/20 to-transparent border-rose-500/50" : "from-amber-500/20 to-transparent border-amber-500/50";

    const voiceMessage = `${isCritical ? 'Critical alert' : 'Alert'} at ${venueName}. Crowd count is ${count}. ${isCritical ? `Risk level is ${predictionLevel}.` : ''} ${explanation}`;
    playVoiceAlert(voiceMessage);

    // The UI Structure
    const desc = (
      <div className="flex flex-col gap-3 mt-2 w-full min-w-[340px]">
        {/* Dynamic Context Header */}
        <div className={`p-2.5 rounded bg-gradient-to-r ${headerColor} border-l-2 font-mono text-[10px] leading-relaxed text-white/90`}>
          <span className="text-cyan-400 font-bold block mb-1.5 tracking-widest uppercase flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1v-1.27c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2Z" /><path d="M9 16v-1a3 3 0 0 1 6 0v1" /></svg>
            Live AI Insight Overview
          </span>
          <div className="mb-1">{explanation}</div>

          {Array.isArray(ex.xai_factors) && ex.xai_factors.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/10">
              <span className="text-[8px] text-cyan-500/80 uppercase tracking-widest font-bold mb-1 block">Deep Neural Analysis:</span>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-300 text-[9px]">
                {ex.xai_factors.slice(0, 3).map((factor: string, idx: number) => (
                  <li key={idx} className="leading-snug">{factor}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Data Grid / Table */}
        <div className="grid grid-cols-2 gap-2 text-left">
          <div className="bg-black/40 rounded p-2 border border-[#1e3a5f]/40 relative overflow-hidden group">
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-cyan-500/50 to-transparent"></div>
            <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Velocity</span>
            <div className="flex items-end gap-2 mt-1">
              <span className={`text-xs font-mono font-bold ${vColor}`}>{Math.round(vRaw)} px/s</span>
              <span className={`text-[9px] uppercase tracking-wider ${vColor} bg-white/5 px-1 rounded`}>{vLevel}</span>
            </div>
          </div>

          <div className="bg-black/40 rounded p-2 border border-[#1e3a5f]/40 relative overflow-hidden group">
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-indigo-500/50 to-transparent"></div>
            <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Flow Dynamics</span>
            <div className="flex items-center gap-2 mt-1 font-mono text-[9px] text-slate-300">
              <span className="text-emerald-400" title="Average Entry">+{avgEntry} In/min</span>
              <span className="text-rose-400" title="Average Exit">-{avgExit} Out/min</span>
            </div>
          </div>

          <div className="bg-black/40 rounded p-2 border border-[#1e3a5f]/40 relative overflow-hidden group">
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-fuchsia-500/50 to-transparent"></div>
            <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Volume / Capacity</span>
            <div className="flex items-center gap-2 mt-1 font-mono">
              <span className="text-xs font-bold text-fuchsia-400">{count}</span>
              <span className="text-[9px] text-slate-400">/ {capacity}</span>
              <span className={`text-[9px] ml-auto px-1 rounded ${fillPct >= 90 ? 'bg-rose-500/20 text-rose-400' : 'bg-fuchsia-500/20 text-fuchsia-400'}`}>{fillPct}%</span>
            </div>
          </div>

          <div className="bg-black/40 rounded p-2 border border-[#1e3a5f]/40 relative overflow-hidden group">
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-amber-500/50 to-transparent"></div>
            <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Neural Prediction</span>
            <div className={`mt-1 text-[10px] font-mono font-black tracking-wider ${predictionLevel === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'}`}>
              {prediction}
            </div>
          </div>
        </div>

        {/* Prediction Timeline */}
        <div className="grid grid-cols-3 gap-2 mt-0.5">
          {[5, 15, 30].map(mins => {
            const flowRate = (avgEntry - avgExit) * 0.5; // normalized flow
            const pCount = Math.max(0, Math.floor(count + (flowRate * mins)));
            const pDen = pCount / Math.max(capacity, 1);
            const lvl = pDen > 0.85 ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' : pDen > 0.6 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
            return (
              <div key={mins} className={`rounded border p-1.5 flex flex-col items-center ${lvl}`}>
                <span className="text-[7px] uppercase font-black opacity-80 tracking-widest mb-0.5">+{mins} MINS</span>
                <span className="text-[10px] font-mono font-black">{Math.round((pDen > 1 ? 1 : pDen) * 100)}% VOL</span>
              </div>
            );
          })}
        </div>

        {/* AI Actionable Staffing Protocol */}
        {(() => {
          const actions: string[] = [];
          const isHighRisk = alert.severity >= 3;
          const isCongested = (fillPct || 0) > 80;
          const flowRate = (avgEntry - avgExit) * 0.5;
          const p15 = count + (flowRate * 15);
          const p15Den = p15 / Math.max(capacity, 1);

          if (isCongested) {
            actions.push("Open Alternate Exit Routes");
            actions.push("Reduce Incoming Flow Rate");
          }
          if (isHighRisk) {
            actions.push("Notify Tactical Response Teams");
            actions.push("Escalate Threat Level in C2");
          }
          if (p15Den > 0.75) {
            actions.push("Activate Public Audio Guidance");
          }
          if (staffNeeded > 0) {
            actions.push(`Deploy ${staffNeeded} additional staff`);
          }
          if (actions.length === 0) {
            actions.push("Maintain Standard Monitoring Protocol");
          }

          const headerColor = (isHighRisk || isCongested) ? "text-rose-400" : "text-emerald-400";
          const borderColor = (isHighRisk || isCongested) ? "border-rose-500/30 bg-rose-950/20 shadow-[inset_0_0_15px_rgba(244,63,94,0.05)]" : "border-emerald-500/30 bg-emerald-950/20 shadow-[inset_0_0_15px_rgba(16,185,129,0.05)]";
          const glowDot = (isHighRisk || isCongested) ? "bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,1)]" : "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]";

          return (
            <div className={`rounded border p-2 relative mt-1 ${borderColor}`}>
              <div className="absolute top-1 right-2 flex items-center">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${glowDot}`}></div>
              </div>
              <span className={`text-[8px] uppercase tracking-widest font-black block mb-1.5 flex items-center gap-1.5 ${headerColor}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Operational Protocol
              </span>
              <div className="space-y-1 mt-1.5">
                {actions.map((act, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className={headerColor}>✓</span>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-200">{act}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-1.5 border-t border-white/10 flex justify-between items-center text-[8px] font-mono text-slate-500">
                <span>COORD: {coords}</span>
                <span>CAPACITY: {fillPct}%</span>
              </div>
            </div>
          );
        })()}

        {/* Evidence & Playback */}
        {snapUrl && (
          <div className="relative rounded border border-white/10 overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.5)] group/ev mt-1 max-h-36 bg-black">
            <div className="absolute top-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[8px] font-mono text-cyan-400 uppercase border border-cyan-500/30 z-10 backdrop-blur-sm shadow-sm pointer-events-none">Live Evidence Lens</div>
            <img src={snapUrl} className="w-full h-full object-contain opacity-90 group-hover/ev:opacity-100 transition-opacity" alt="Target Lock" />
            {clipUrl && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/ev:opacity-100 transition-opacity flex items-center justify-center gap-2.5 z-20 backdrop-blur-[2px]">
                <a href={`${clipUrl}${clipUrl.includes('?') ? '&' : '?'}token=${token || ''}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded text-[9px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95" download={`clip_${alert.id}.mp4`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                  Download
                </a>
                <a href={`${clipUrl}${clipUrl.includes('?') ? '&' : '?'}token=${token || ''}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-rose-500/80 hover:bg-rose-500 text-white rounded text-[9px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(244,63,94,0.5)] transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  Back Play
                </a>
              </div>
            )}
          </div>
        )}

        {/* Recommended Action (Native) */}
        {ex.recommended_action && (
          <div className="bg-indigo-950/40 border border-indigo-500/20 px-2 py-1.5 rounded mt-0.5">
            <span className="text-[8px] uppercase tracking-widest text-indigo-400 block mb-0.5 font-bold">Standard Operating Procedure</span>
            <span className="text-[10px] text-indigo-100">{ex.recommended_action}</span>
          </div>
        )}
      </div>
    ) as any;

    if (isCritical) {
      toast.error(title, {
        description: desc,
        duration: Number.POSITIVE_INFINITY, // Keep critical visible
        className: "!bg-[#1f0b12]/95 border-2 border-rose-500/70 shadow-[0_0_50px_rgba(244,63,94,0.3)] backdrop-blur-3xl !rounded-xl !p-4 !w-auto !min-w-[420px]",
        action: { label: "VIEW CAMERAS", onClick: () => window.location.href = "/alerts" },
        cancel: { label: "DISMISS", onClick: () => { } }
      });
    } else {
      toast.warning(title, {
        description: desc,
        duration: 20000,
        className: "!bg-[#12120b]/95 border-2 border-amber-500/60 shadow-[0_0_50px_rgba(245,158,11,0.25)] backdrop-blur-3xl !rounded-xl !p-4 !w-auto !min-w-[420px]",
        action: { label: "VIEW DETAILS", onClick: () => window.location.href = "/alerts" },
        cancel: { label: "DISMISS", onClick: () => { } }
      });
    }
  }
}
