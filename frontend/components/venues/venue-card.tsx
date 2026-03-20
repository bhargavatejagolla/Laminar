"use client";

import { Venue } from "@/types/venue";
import { useVenueStats } from "@/hooks/useVenueStats";
import VenueStatusBadge from "./venue-status-badge";
import VenueCapacityBar from "./venue-capacity-bar";
import { Users, Video, Activity, Globe, Trash2, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/services/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  venue: Venue;
}

export default function VenueCard({ venue }: Props) {
  const { data: stats, isLoading } = useVenueStats(venue.id);
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const riskScore = stats?.current_risk ?? venue.dynamic_risk_score ?? 0;
  const riskLevel = stats?.risk_level ?? venue.risk_level ?? undefined;
  const cap = Number(venue.capacity) || 0;
  const currentPeople = Number(stats?.current_occupancy) || 0;
  const occupancyPercent = cap > 0 ? Math.min((currentPeople / cap) * 100, 100) : 0;

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/venues/${venue.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Venue Removed", {
        description: `${venue.name} has been decommissioned from the system.`,
      });
    },
    onError: () => {
      toast.error("Failed to delete venue. It may have active cameras attached.");
      setConfirmDelete(false);
    },
  });

  return (
    <div className="group relative bg-[#081428]/70 backdrop-blur-xl border border-[#0f2440] rounded-xl p-5 transition-all duration-300 hover:border-cyan-500/25 hover:shadow-[0_0_24px_-8px_rgba(34,211,238,0.2)] flex flex-col justify-between overflow-hidden card-hover">
      
      {/* Top glint */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex flex-col gap-1 min-w-0 flex-1 pr-2">
          <h3 className="text-white text-base font-semibold tracking-wide group-hover:text-cyan-300 transition-colors truncate">
            {venue.name}
          </h3>
          <p className="text-[11px] text-slate-600 flex items-center gap-1.5 uppercase tracking-widest font-medium">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{venue.city || "—"} · {venue.country || "—"}</span>
          </p>
        </div>
        <div className="flex items-start gap-1.5 shrink-0">
          <VenueStatusBadge risk={riskScore} level={riskLevel} />

          {/* Delete button */}
          {!confirmDelete ? (
            <button
              onClick={(e) => { e.preventDefault(); setConfirmDelete(true); }}
              className="p-1.5 rounded-lg border border-transparent text-slate-700 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
              title="Delete Venue"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-2 py-1 rounded text-[10px] font-bold bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded text-[10px] font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="my-3">
        <div className="flex justify-between items-end mb-1.5 text-[11px] text-slate-500 font-medium">
          <span>Capacity</span>
          <span className="font-mono text-slate-400">
            {isLoading
              ? "…"
              : `${Math.round(currentPeople).toLocaleString()} / ${cap.toLocaleString()}`}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1 text-[9px] uppercase tracking-tighter text-slate-600 font-bold">
           <span>Warn: {venue.warning_threshold.toLocaleString()}</span>
           <span>Crit: {venue.critical_threshold.toLocaleString()}</span>
           <span className="text-cyan-500/50">{Math.round(occupancyPercent)}%</span>
        </div>
        <VenueCapacityBar
          capacity={venue.capacity}
          occupancyPercent={occupancyPercent}
          warningThreshold={cap > 0 ? (venue.warning_threshold / cap) * 100 : 70}
          criticalThreshold={cap > 0 ? (venue.critical_threshold / cap) * 100 : 90}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#0f2440] text-[11px]">
        <div className="flex items-center gap-2">
          <Video className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <div>
            <p className="text-slate-600 uppercase tracking-widest text-[9px] font-bold">Cameras</p>
            <p className="font-mono text-slate-300 font-medium">
              {isLoading ? "…" : `${stats?.active_cameras ?? 0} / ${stats?.camera_count ?? 0}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <div>
            <p className="text-slate-600 uppercase tracking-widest text-[9px] font-bold">Monitoring</p>
            <p className={`font-semibold ${stats?.monitoring_enabled ? "text-emerald-400" : "text-rose-400"}`}>
              {isLoading ? "…" : stats?.monitoring_enabled ? "ACTIVE" : "PAUSED"}
            </p>
          </div>
        </div>
      </div>

      {/* View button */}
      <Link
        href={`/venues/${venue.id}`}
        className="mt-4 flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-[#0f2440] bg-[#050f1f]/50 text-xs font-semibold text-slate-500 hover:text-cyan-300 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all duration-200 group/link"
      >
        View Venue Details
        <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}