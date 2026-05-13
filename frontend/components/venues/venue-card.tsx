"use client";

import { Venue } from "@/types/venue";
import { useVenueStats } from "@/hooks/useVenueStats";
import VenueStatusBadge from "./venue-status-badge";
import VenueCapacityBar from "./venue-capacity-bar";
import { Users, Video, Activity, Globe, Trash2, ArrowRight, Loader2, Settings, Car, Flame, ShieldAlert, Zap } from "lucide-react";
import Link from "next/link";
import { api } from "@/services/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  venue: Venue;
  onEdit?: () => void;
}

export default function VenueCard({ venue, onEdit }: Props) {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useVenueStats(venue.id);
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cap = Number(venue.capacity) || 0;
  const currentOccupancy = Math.round(Number(stats?.current_occupancy) || 0);
  const occupancyPercent = cap > 0 ? Math.min((currentOccupancy / cap) * 100, 100) : 0;

  // Derive risk level from occupancy vs thresholds so badge matches capacity bar
  const warnPct = cap > 0 ? (venue.warning_threshold / cap) * 100 : 70;
  const critPct = cap > 0 ? (venue.critical_threshold / cap) * 100 : 90;
  const computedRiskLevel =
    occupancyPercent >= critPct ? "critical" :
      occupancyPercent >= warnPct ? "high" :
        occupancyPercent >= warnPct * 0.5 ? "medium" : "low";

  // Use computed risk (from live occupancy) – always matches the capacity bar
  const riskScore = stats?.current_risk ?? venue.dynamic_risk_score ?? 0;
  const riskLevel = computedRiskLevel;

  const domainMap: Record<string, { icon: any, label: string, color: string }> = {
    people: { icon: Users, label: t("domains.people") || "People Intelligence", color: "text-blue-400" },
    parking: { icon: Car, label: t("domains.parking") || "Smart Parking", color: "text-emerald-400" },
    traffic: { icon: Activity, label: t("domains.traffic") || "Traffic Intelligence", color: "text-cyan-400" },
    incident: { icon: Flame, label: t("domains.incident") || "Incident Intel", color: "text-rose-400" },
  };

  const domain = domainMap[venue.venue_type || "people"] || domainMap.people;

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
          <div className="flex items-center gap-2 text-slate-600">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate text-[11px] font-medium uppercase tracking-widest leading-none">
              {venue.city || "—"} · {venue.country || "—"}
            </span>
            <span className="mx-1 text-slate-800">•</span>
            <div className={`flex items-center gap-1 ${domain.color} text-[10px] font-extrabold uppercase tracking-tighter`}>
              <domain.icon className="w-3 h-3" />
              {domain.label}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-1.5 shrink-0">
          <VenueStatusBadge risk={riskScore} level={riskLevel} />

          {/* Edit & Delete button */}
          {!confirmDelete ? (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.preventDefault(); onEdit && onEdit(); }}
                className="p-1.5 rounded-lg border border-transparent text-slate-700 hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/10 transition-all duration-200"
                title={t("venues.editVenue") || "Edit Venue"}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); setConfirmDelete(true); }}
                className="p-1.5 rounded-lg border border-transparent text-slate-700 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all duration-200"
                title={t("venues.deleteVenueText") || "Delete Venue"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-2 py-1 rounded text-[10px] font-bold bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : (t("venues.yes") || "Yes")}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded text-[10px] font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                {t("venues.no") || "No"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="my-3">
        <div className="flex justify-between items-end mb-1.5 text-[11px] text-slate-500 font-medium">
          <span>{venue.venue_type === 'parking' ? (t("venues.slotAvailability") || 'Slot Availability') : venue.venue_type === 'traffic' ? (t("venues.vehicleDensity") || 'Vehicle Density') : (t("venues.capacity") || "Capacity")}</span>
          <span className="font-mono text-slate-400">
            {isLoading
              ? "…"
              : `${Math.round(currentOccupancy).toLocaleString()} / ${cap.toLocaleString()}`}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1 text-[9px] uppercase tracking-tighter text-slate-600 font-bold">
          <span>{t("venues.warn") || "WARN"}: {venue.warning_threshold.toLocaleString()}</span>
          <span>{t("venues.crit") || "CRIT"}: {venue.critical_threshold.toLocaleString()}</span>
          <span className="text-cyan-500/50">{Math.round(occupancyPercent)}%</span>
        </div>
        <VenueCapacityBar
          capacity={venue.capacity}
          occupancyPercent={occupancyPercent}
          warningThreshold={cap > 0 ? (venue.warning_threshold / cap) * 100 : 70}
          criticalThreshold={cap > 0 ? (venue.critical_threshold / cap) * 100 : 90}
        />
      </div>

      {/* Domain Specific Actions */}
      <div className="flex gap-2 mb-4 pt-1">
        {(venue.venue_type === 'traffic' || venue.venue_type === 'incident') ? (
          <Link
            href={`/smart-traffic?venue_id=${venue.id}`}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg border border-cyan-500/10 bg-cyan-500/5 text-[10px] font-black text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/30 transition-all uppercase tracking-widest"
          >
            <Activity className="w-3 h-3" /> {t("domains.traffic") || "Traffic Intelligence"}
          </Link>
        ) : venue.venue_type === 'parking' ? (
          <Link
            href={`/smart-parking?venue_id=${venue.id}`}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg border border-emerald-500/10 bg-emerald-500/5 text-[10px] font-black text-emerald-500 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all uppercase tracking-widest"
          >
            <Car className="w-3 h-3" /> {t("domains.parking") || "Smart Parking"}
          </Link>
        ) : (
          <Link
            href={`/venues/${venue.id}`}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg border border-blue-500/10 bg-blue-500/5 text-[10px] font-black text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/30 transition-all uppercase tracking-widest"
          >
            <Users className="w-3 h-3" /> {t("domains.systemConsole") || "System Console"}
          </Link>
        )}
      </div>

      {/* View button */}
      <Link
        href={`/venues/${venue.id}`}
        className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-[#0f2440] bg-[#050f1f]/50 text-xs font-semibold text-slate-500 hover:text-cyan-300 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all duration-200 group/link"
      >
        {t("venues.viewVenueDetails") || "View Venue Details"}
        <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}