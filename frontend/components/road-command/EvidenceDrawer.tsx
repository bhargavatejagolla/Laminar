"use client";

import { useState } from "react";
import { X, ShieldAlert, CheckCircle2, AlertTriangle, Clock, MapPin, Video, Eye, ArrowUpRight, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";

interface Props {
  event: any;
  onClose: () => void;
  onUpdate?: () => void;
}

export function EvidenceDrawer({ event, onClose, onUpdate }: Props) {
  const [acting, setActing] = useState(false);

  if (!event) return null;

  const isCritical = event.severity === "critical";
  const isHigh = event.severity === "high";

  const handleAcknowledge = async () => {
    setActing(true);
    const toastId = toast.loading("Recording operator acknowledgement…");
    try {
      await api.post(`/events/${event.event_id}/acknowledge`);
      toast.success("Event acknowledged by Command Operator", { id: toastId });
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast.error(`Acknowledgement failed: ${err.message}`, { id: toastId });
    } finally {
      setActing(false);
    }
  };

  const handleResolve = async () => {
    setActing(true);
    const toastId = toast.loading("Marking event as resolved…");
    try {
      await api.post(`/events/${event.event_id}/resolve`);
      toast.success("Event status updated to RESOLVED", { id: toastId });
      if (onUpdate) onUpdate();
      onClose();
    } catch (err: any) {
      toast.error(`Resolve failed: ${err.message}`, { id: toastId });
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#0a0d16] border-l border-white/10 h-full flex flex-col shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-start justify-between bg-black/40 sticky top-0 z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider border ${
                isCritical
                  ? "bg-rose-500/10 border-rose-500/40 text-rose-400"
                  : isHigh
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                  : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
              }`}>
                {event.severity} · {event.domain}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10 text-slate-400 uppercase">
                Status: {event.state}
              </span>
            </div>
            <h2 className="text-lg font-black text-white uppercase tracking-wide">
              {event.title}
            </h2>
            <p className="text-xs font-mono text-slate-400">
              Event ID: <strong className="text-cyan-400">{event.event_id}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 text-xs font-mono">
          {/* Description Box */}
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Operational Context</span>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">{event.description}</p>
          </div>

          {/* "Why?" Explainability Module */}
          <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase text-[10px] tracking-widest">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Intelligence Explainability ("Why was this detected?")</span>
            </div>
            <div className="space-y-1.5 text-slate-300 text-[11px] bg-black/40 p-3 rounded-xl border border-white/5">
              {event.explanation?.reason && (
                <p><strong>Rationale:</strong> {event.explanation.reason}</p>
              )}
              {event.explanation?.rule && (
                <p><strong>Trigger Rule:</strong> {event.explanation.rule}</p>
              )}
              {event.explanation?.threshold && (
                <p><strong>Configured Venue Threshold:</strong> {event.explanation.threshold}</p>
              )}
              {event.explanation?.observed_count !== undefined && (
                <p><strong>Observed Volume:</strong> {event.explanation.observed_count} vehicles</p>
              )}
              <p><strong>Perception Confidence:</strong> {Math.round((event.confidence || 0.9) * 100)}% verified</p>
            </div>
          </div>

          {/* Visual Evidence Snapshot */}
          {(event.evidence?.frame_url || event.evidence?.screenshot_url || event.evidence?.snapshot_url) && (
            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Visual Evidence Capture</span>
                <span className="text-[9px] text-cyan-400 font-mono">Forensic Frame</span>
              </div>
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black max-h-60 flex items-center justify-center">
                <img
                  src={event.evidence.frame_url || event.evidence.screenshot_url || event.evidence.snapshot_url}
                  alt="Incident Evidence Snapshot"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Location & Spatial Provenance (Two-Level Distinction) */}
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Location & Spatial Provenance</span>
              {event.location?.location_source === "CAMERA_CALIBRATED" ? (
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 font-bold text-[9px]">
                  LEVEL 2: CALIBRATED ROAD PLANE
                </span>
              ) : event.location?.location_source === "CAMERA_CONFIG" ? (
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 font-bold text-[9px]">
                  LEVEL 1: OBSERVER GPS
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-bold text-[9px]">
                  {event.location?.location_source || "VENUE_CONFIG"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Venue Context</span>
                <span className="text-white font-bold">{event.venue_name || "Regional Network"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Edge Camera / Source</span>
                <span className="text-cyan-300 font-bold">{event.camera_name || event.camera_id || "Corridor Source"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">GPS Coordinates</span>
                <span className="text-slate-300 font-mono">
                  {event.location?.latitude && event.location?.longitude
                    ? `${Number(event.location.latitude).toFixed(5)}, ${Number(event.location.longitude).toFixed(5)}`
                    : "No Pin Datum (Video Forensic)"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Coordinate Provenance</span>
                <span className="text-slate-300 font-mono">
                  {event.location?.location_source || "VENUE_CONFIG"}
                </span>
              </div>
            </div>
          </div>

          {/* Evidence Data & Kinematics */}
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Kinematic & Sensor Evidence</span>
            <div className="space-y-2 text-[11px]">
              {event.evidence?.track_ids && event.evidence.track_ids.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Tracked Units Involved:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {event.evidence.track_ids.map((tid: any) => (
                      <span key={tid} className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold">
                        Unit #{tid}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {event.evidence?.timestamp_seconds !== undefined && (
                <div>
                  <span className="text-slate-500">Footage Time Index:</span>{" "}
                  <strong className="text-white font-mono">{event.evidence.timestamp_seconds}s</strong>
                </div>
              )}
              {event.evidence?.signals && (
                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 space-y-1">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block mb-1">Convergence Signals:</span>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>Sudden Decel: <strong>{event.evidence.signals.sudden_deceleration ?? "N/A"}</strong></div>
                    <div>Trajectory Angle: <strong>{event.evidence.signals.convergence ?? "N/A"}</strong></div>
                    <div>Contact Geometry: <strong>{event.evidence.signals.contact_geometry ?? "N/A"}</strong></div>
                    <div>Post-Event Stall: <strong>{event.evidence.signals.post_event_stall ?? "N/A"}</strong></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Model Governance & Dispatch Delivery State */}
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Model Governance & Notification Delivery</span>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Perception Model</span>
                <span className="text-cyan-300 font-bold">{event.model_name || "YOLO11 Nano + ByteTrack (Frozen)"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Model Version</span>
                <span className="text-slate-300 font-mono">{event.model_version || "1.0.0"}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-white/5 space-y-1 text-[10px]">
              <span className="text-slate-500 uppercase block text-[9px]">Notification State Machine:</span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                  In-App: <strong className="text-emerald-400">{event.delivery_status?.in_app || "DELIVERED"}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                  Email: <strong className={event.delivery_status?.email === "DELIVERED" ? "text-emerald-400" : "text-slate-400"}>{event.delivery_status?.email || "NOT_CONFIGURED"}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                  SMS: <strong className={event.delivery_status?.sms === "DELIVERED" ? "text-emerald-400" : "text-amber-400"}>{event.delivery_status?.sms || "NOT_CONFIGURED (Simulation Mode)"}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Audit Trail */}
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2 text-[10px]">
            <span className="text-slate-500 uppercase tracking-widest font-bold">Operational Audit Trail</span>
            <div className="space-y-1 text-slate-400">
              <div>Detected: <span className="text-slate-200">{event.timestamp}</span></div>
              {event.acknowledged_at && (
                <div>Acknowledged: <span className="text-cyan-300">{event.acknowledged_at} (by {event.acknowledged_by || "Operator"})</span></div>
              )}
              {event.resolved_at && (
                <div>Resolved: <span className="text-emerald-400">{event.resolved_at}</span></div>
              )}
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-6 border-t border-white/10 bg-black/60 flex items-center justify-between gap-3 sticky bottom-0">
          <button
            onClick={handleAcknowledge}
            disabled={acting || event.state === "acknowledged" || event.state === "resolved"}
            className="flex-1 py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white disabled:opacity-40 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            {event.state === "acknowledged" ? "Acknowledged" : "Acknowledge"}
          </button>
          <button
            onClick={handleResolve}
            disabled={acting || event.state === "resolved"}
            className="flex-1 py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-xs bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
          >
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            {event.state === "resolved" ? "Resolved" : "Resolve Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
