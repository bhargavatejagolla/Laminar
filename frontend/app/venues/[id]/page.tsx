"use client";

import { use, useState } from "react";
import { useVenues } from "@/hooks/useVenues";
import { useVenueStats } from "@/hooks/useVenueStats";
import { useQueueEstimate } from "@/hooks/useQueueEstimate";
import { useCrowdTrends } from "@/hooks/useCrowdTrends";
import { useResourcePlanning } from "@/hooks/useResourcePlanning";
import PredictionGraph from "@/components/venues/prediction-graph";
import { Activity, MapPin, Users, AlertTriangle, ShieldCheck, ChevronLeft, Plus, Clock, TrendingUp, LineChart, UserCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import VenueCapacityBar from "@/components/venues/venue-capacity-bar";
import VenueCameraList from "@/components/venues/venue-camera-list";
import AddCameraModal from "@/components/venues/add-camera-modal";
import EditVenueModal from "@/components/venues/edit-venue-modal";
import IntelligencePanel from "@/components/intelligence/IntelligencePanel";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import SplashCursor from "@/components/react-bits/SplashCursor";

export default function VenueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useTranslation();

  // Properly unwrap the Next.js 15 page params
  const unwrappedParams = use(params);
  const venueId = unwrappedParams.id;

  const [isAddCameraOpen, setIsAddCameraOpen] = useState(false);
  const [isEditVenueOpen, setIsEditVenueOpen] = useState(false);

  const { data: venues } = useVenues();
  const venue = venues?.find((v) => v.id === venueId);
  const { data: stats, isLoading: statsLoading } = useVenueStats(venueId);
  const { data: queueEstimate, isLoading: queueLoading } = useQueueEstimate(venueId);
  const { data: crowdTrends, isLoading: trendsLoading } = useCrowdTrends(venueId);
  const { data: resourcePlan, isLoading: resourceLoading } = useResourcePlanning(venueId);

  if (!venue) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
        <Activity className="w-8 h-8 animate-spin mb-4 text-cyan-500" />
        <p>{t("auto.Linkingdirectly_3621") || "Linking directly to venue matrix..."}</p>
      </div>
    );
  }

  const riskScore = stats?.current_risk ?? venue.dynamic_risk_score ?? 0;
  const currentCount = Number(stats?.current_occupancy) || 0;
  const isHighRisk = currentCount >= venue.critical_threshold;

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 relative z-10">
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-40">
        <SplashCursor />
      </div>
      {/* Back navigation & Header */}
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors mb-6 group">
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          {t("auto.BacktoCommandCe_7679") || "Back to Command Center"}
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.15)] flex-shrink-0 mt-1">
              <MapPin className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
                {venue.name}
                {isHighRisk ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400 uppercase tracking-widest">
                    <AlertTriangle className="w-3.5 h-3.5" /> {t("auto.Critical_6118") || "Critical"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                    <ShieldCheck className="w-3.5 h-3.5" /> {t("auto.Secure_6383") || "Secure"}
                  </span>
                )}
              </h1>
              <p className="text-sm font-medium text-slate-400 flex items-center gap-2">
                {venue.city}, {venue.country} • ID: <span className="font-mono text-slate-500">{venue.id.slice(0, 8)}...</span>
              </p>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-6 px-5 py-3 rounded-xl bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">{t("auto.LiveOccupancy_8979") || "Live Occupancy"}</span>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <span className="text-lg font-bold font-mono text-white tracking-tight">{(stats?.current_occupancy ?? 0)}</span>
                <span className="text-xs text-slate-500">/ {venue.capacity}</span>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">{t("auto.ThreatLevel_8749") || "Threat Level"}</span>
              <span className={`text-lg font-bold font-mono tracking-tight ${isHighRisk ? "text-rose-400" : "text-emerald-400"}`}>
                {currentCount} PPL
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 self-end md:self-auto">
            <Link
              href={`/smart-traffic?venue_id=${venueId}`}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-bold text-amber-500 transition-all group"
            >
              <Activity className="w-4 h-4" />
              {t("auto.InboundTraffic_9793") || "Inbound Traffic"}
            </Link>
            <Link
              href={`/smart-incidents?venue_id=${venueId}`}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg text-xs font-bold text-rose-500 transition-all group"
            >
              <ShieldAlert className="w-4 h-4" />
              {t("auto.ActiveIncidentH_8645") || "Active Incident Hub"}
            </Link>
            <button
              onClick={() => setIsEditVenueOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 transition-all group"
            >
              <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform" />
              {t("auto.ConfigureVenue_6751") || "Configure Venue"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

        {/* Main Content Area (Graph + Detailed Stats) */}
        <div className="lg:col-span-2 space-y-6 lg:space-y-8">

          {/* Queue Estimator Widget */}
          <section className="bg-gradient-to-br from-[#0f172a]/90 to-[#1e1b4b]/90 backdrop-blur-xl border border-indigo-500/30 rounded-xl p-6 shadow-[0_0_20px_rgba(99,102,241,0.1)] relative overflow-hidden group hover:border-indigo-400/50 transition-colors">
            {/* Background design elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/20 transition-colors"></div>

            <h3 className="text-lg font-semibold tracking-wide text-white mb-6 flex items-center gap-2 relative z-10">
              <Clock className="w-5 h-5 text-indigo-400" /> {t("auto.EstimatedWaitin_7961") || "Estimated Waiting Time"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
              {/* Main Wait Time */}
              <div className="flex flex-col justify-center bg-black/40 p-4 rounded-xl border border-white/5">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">{t("auto.LiveForecast_7783") || "Live Forecast"}</span>
                {queueLoading ? (
                  <span className="text-2xl font-black font-mono text-indigo-400 animate-pulse">{t("auto.Calculating_9732") || "Calculating..."}</span>
                ) : (
                  <span className="text-3xl font-black font-mono text-indigo-400 tracking-tighter">
                    {queueEstimate?.estimated_wait_time || "N/A"}
                  </span>
                )}
              </div>

              {/* Queue Length */}
              <div className="flex flex-col justify-center bg-black/40 p-4 rounded-xl border border-white/5">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 flex items-center gap-1"><Users className="w-3 h-3 text-emerald-400" /> {t("auto.InQueue_7544") || "In Queue"}</span>
                {queueLoading ? (
                  <span className="text-xl font-bold font-mono text-slate-300">...</span>
                ) : (
                  <span className="text-2xl font-bold font-mono text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                    {queueEstimate?.queue_length || 0} <span className="text-sm font-sans text-slate-500 font-medium ml-1 tracking-normal">{t("auto.persons_7091") || "persons"}</span>
                  </span>
                )}
              </div>

              {/* Service Rate */}
              <div className="flex flex-col justify-center bg-black/40 p-4 rounded-xl border border-white/5">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-amber-400" /> {t("auto.Throughput_4981") || "Throughput"}</span>
                {queueLoading ? (
                  <span className="text-xl font-bold font-mono text-slate-300">...</span>
                ) : (
                  <span className="text-2xl font-bold font-mono text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">
                    {queueEstimate?.service_rate || 0} <span className="text-sm font-sans text-slate-500 font-medium ml-1 tracking-normal">{t("auto.permin_1971") || "per min"}</span>
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* AI Graph Module */}
          <section>
            <PredictionGraph venueId={venueId} />
          </section>

          {/* Current Capacity Progress */}
          <section className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold tracking-wide text-white mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" /> {t("auto.LiveTrafficLoad_9756") || "Live Traffic Load"}
            </h3>
            <div className="mb-2 flex justify-between text-sm font-medium text-slate-400">
              <span>{t("auto.CurrentUsagevsT_9489") || "Current Usage vs Total Capacity"}</span>
              <span className="font-mono text-white">{venue.capacity && venue.capacity > 0 ? Math.round((currentCount / venue.capacity) * 100) : 0}% Utilized</span>
            </div>
            <div className="h-4">
              <VenueCapacityBar
                capacity={venue.capacity || 100}
                occupancyPercent={venue.capacity && venue.capacity > 0 ? (currentCount / venue.capacity) * 100 : 0}
                warningThreshold={venue.capacity && venue.capacity > 0 ? (venue.warning_threshold / venue.capacity) * 100 : 70}
                criticalThreshold={venue.capacity && venue.capacity > 0 ? (venue.critical_threshold / venue.capacity) * 100 : 90}
              />
            </div>
          </section>
        </div>

        {/* Sidebar Intel */}
        <div className="space-y-6 lg:space-y-8">

          {/* Info Module */}
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-6 shadow-inner">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">{t("auto.IntelBrief_7832") || "Intel Brief"}</h3>

            <ul className="space-y-4">
              <li className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">{t("auto.VenueConstruct_2531") || "Venue Construct"}</span>
                <span className="text-sm font-medium text-slate-200 capitalize">{(venue.venue_type || 'Unknown').replace('_', ' ')}</span>
              </li>
              <li className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">{t("auto.TotalDeployable_8245") || "Total Deployable Capacity"}</span>
                <span className="text-sm font-medium font-mono text-cyan-400">{venue.capacity.toLocaleString()}</span>
              </li>
              <li className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">{t("auto.CamerasSynced_5976") || "Cameras Synced"}</span>
                <span className="text-sm font-medium text-slate-200">{statsLoading ? "..." : `${stats?.active_cameras ?? 0} active / ${stats?.camera_count ?? 0} total`}</span>
              </li>
            </ul>
          </div>

          {/* Resource Optimizer Module */}
          <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/80 backdrop-blur-xl border border-indigo-500/30 rounded-xl p-6 shadow-inner relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/20 transition-colors"></div>
            <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <UserCheck className="w-4 h-4" /> {t("auto.ResourcePlannin_5108") || "Resource Planning"}
            </h3>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">{t("auto.RecommendedStaf_4394") || "Recommended Staffing"}</span>
                {(() => {
                  const cap = venue.capacity || 1;
                  const critPct = (venue.critical_threshold / cap) * 100;
                  const warnPct = (venue.warning_threshold / cap) * 100;
                  const occupancyPct = (currentCount / cap) * 100;
                  let riskKey = "low";
                  if (occupancyPct >= critPct) riskKey = "critical";
                  else if (occupancyPct >= warnPct) riskKey = "high";
                  else if (occupancyPct >= warnPct * 0.5) riskKey = "medium";
                  const staffConfig = (venue as any).staffing_config;
                  const dynamicStaff = staffConfig?.[riskKey];
                  const displayStaff = dynamicStaff ?? resourcePlan?.recommended_staff ?? 0;
                  return (
                    <span className="text-2xl font-bold font-mono text-white">
                      {resourceLoading ? "..." : displayStaff} <span className="text-sm font-sans text-slate-500 font-medium ml-1">{t("auto.personnel_2759") || "personnel"}</span>
                      {staffConfig && <span className={`ml-2 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${riskKey === "critical" ? "text-red-400 bg-red-500/10" :
                        riskKey === "high" ? "text-orange-400 bg-orange-500/10" :
                          riskKey === "medium" ? "text-amber-400 bg-amber-500/10" :
                            "text-emerald-400 bg-emerald-500/10"
                        }`}>{riskKey}</span>}
                    </span>
                  );
                })()}
              </div>
              <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                <Users className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
          </div>

          {/* Trend Analytics Module */}
          <div className="bg-gradient-to-br from-fuchsia-900/30 to-slate-900/80 backdrop-blur-xl border border-fuchsia-500/30 rounded-xl p-6 shadow-inner relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-fuchsia-500/20 transition-colors"></div>
            <h3 className="text-xs font-semibold text-fuchsia-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <LineChart className="w-4 h-4" /> {t("auto.CrowdTrendsToda_2987") || "Crowd Trends Today"}
            </h3>
            <div className="grid grid-cols-2 gap-4 border-t border-fuchsia-500/20 pt-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">{t("auto.PeakTime_7281") || "Peak Time"}</span>
                <span className="text-lg font-bold font-mono text-white">
                  {trendsLoading ? "..." : (crowdTrends?.peak_time || "N/A")}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">{t("auto.MaxCrowd_7872") || "Max Crowd"}</span>
                <span className="text-lg font-bold font-mono text-white">
                  {trendsLoading ? "..." : (crowdTrends?.max_crowd || 0)}
                </span>
              </div>
            </div>
          </div>
          {/* Laminar AI Intelligence Engine Panel */}
          <IntelligencePanel venueId={venueId} />

          {/* Camera Module */}
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-6 shadow-inner flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{t("auto.ConnectedNodes_995") || "Connected Nodes"}</h3>
              <button onClick={() => setIsAddCameraOpen(true)} className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 uppercase tracking-widest hover:text-cyan-300 transition-colors bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20">
                <Plus className="w-3 h-3" /> {t("auto.AddNode_6788") || "Add Node"}
              </button>
            </div>
            <VenueCameraList venueId={venueId} />
          </div>

        </div>

      </div>

      <AddCameraModal venueId={venueId} isOpen={isAddCameraOpen} onClose={() => setIsAddCameraOpen(false)} />
      <EditVenueModal venue={venue} isOpen={isEditVenueOpen} onClose={() => setIsEditVenueOpen(false)} />
    </div>
  );
}
