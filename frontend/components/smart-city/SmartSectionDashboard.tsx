"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Car, AlertTriangle, Zap, Activity, BrainCircuit, Users, Upload, Thermometer, Video, FileText, Download, Globe, RotateCw, ShieldCheck, Shield, X, Maximize2, Minimize2 } from "lucide-react";
import { api } from "@/services/api";
import Link from "next/link";
import { useTranslation } from "react-i18next";

const SECTION_ICONS: Record<string, React.ElementType> = {
  parking: Car,
  traffic: Activity,
  incident: AlertTriangle,
  people: Users,
  kinetic: BrainCircuit,
  greenwave: Zap,
  liability: ShieldCheck,
  guardian: Shield,
  hub: Globe,
};

import { useParkingInsights, useTrafficInsights, useKineticInsights, useKineticEvents, useIncidentAlerts } from "@/hooks/useTelemetry";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import SplashCursor from "@/components/react-bits/SplashCursor";
import ElectricBorder from "@/components/react-bits/ElectricBorder";
import Loading from "@/app/loading";

function ServiceCard({ title, description, icon: Icon, href, stats, theme }: { title: string; description: string; icon: any; href: string; stats: any; theme: any }) {
  const { t } = useTranslation();

  return (
    <ElectricBorder
      color={theme.primary === 'cyan' ? '#22d3ee' : theme.primary === 'rose' ? '#fb7185' : theme.primary === 'red' ? '#f87171' : '#818cf8'}
      speed={1}
      chaos={0.1}
      borderRadius={24}
      className="h-full"
      style={{}}
    >
      <Link href={href} className="block h-full">
        <div className={`rounded-[24px] bg-[#0c0c14]/80 backdrop-blur-sm overflow-hidden flex flex-col relative group h-full min-h-[300px] transition-all duration-500`}>
          <div className="p-8 flex flex-col h-full gap-6">
            <div className="flex justify-between items-start">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-colors ${theme.iconBg}`}>
                <Icon className={`w-8 h-8 ${theme.textClass}`} />
              </div>
              <div className={`px-4 py-1.5 rounded-full text-[10px] font-mono font-bold tracking-widest ${theme.headerBadge} flex items-center gap-2`}>
                <div className={`w-1.5 h-1.5 rounded-full ${theme.headerBadgeDot}`} />
                ACTIVE_NODE
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-black uppercase tracking-tight mb-2 text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-white/40 transition-all">
                {title}
              </h3>
              <p className="text-slate-400 text-sm font-medium leading-relaxed group-hover:text-slate-300 transition-colors">
                {description}
              </p>
            </div>

            <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] font-mono">{t("auto.RealtimeTelemet_4132") || "Real-time Telemetry"}</span>
                <div className="flex items-center gap-4 mt-2">
                  {stats && Object.entries(stats).map(([label, value]: [string, any]) => (
                    <div key={label} className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{label}</span>
                      <span className="text-lg font-black text-white font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="opacity-40 group-hover:opacity-100 transition-all duration-700 transform group-hover:translate-x-2">
                <ArrowLeft className="w-6 h-6 rotate-180 text-white" />
              </div>
            </div>
          </div>

          {/* Subtle Background Animation */}
          <div className="absolute bottom-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <BrainCircuit className={`w-24 h-24 ${theme.textClass} animate-pulse`} />
          </div>
        </div>
      </Link>
    </ElectricBorder>
  );
}

// Reusable Camera Card Component
function CameraFeedCard({ camera, sectionType, insights, showHeatmap }: { camera: any; sectionType: string; insights: any; showHeatmap?: boolean }) {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isStatic = camera.static_mode_enabled;
  // Map each section to its correct MJPEG stream endpoint
  const streamUrl = () => {
    if (sectionType === "parking") return `/api/v1/parking/stream/${camera.id}`;
    if (sectionType === "people") return `/api/v1/dwell/stream/${camera.id}`;
    if (sectionType === "kinetic") return `/api/v1/kinetic/stream/${camera.id}`;
    if (sectionType === "liability") return `/api/v1/kinetic/stream/${camera.id}`;
    if (sectionType === "greenwave") return `/api/v1/greenwave/stream/${camera.id}`;
    if (sectionType === "guardian") return `/api/v1/guardian/stream/${camera.id}`;
    // traffic and incident both use the TrafficWorker stream
    return `/api/v1/traffic/stream/${camera.id}`;
  };
  const baseFeed = isStatic ? camera.static_image_url : streamUrl();
  const heatmapFeed = `/api/v1/parking/heatmap/${camera.id}`;
  const feedUrl = showHeatmap ? heatmapFeed : baseFeed;

  const theme = THEMES[sectionType] || THEMES.parking;

  return (
    <div className={isFullscreen ? `fixed inset-4 z-[9999] rounded-3xl border border-white/10 bg-[#0c0c14] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] transition-all duration-500` : `rounded-2xl border border-white/5 bg-[#0c0c14] overflow-hidden flex flex-col relative group h-full min-h-[380px] shadow-2xl transition-all duration-500 ${theme.cardHover}`}>
      <div className="absolute top-5 left-5 z-20 flex gap-2 items-center">
        <div className={`bg-black/60 backdrop-blur-xl border border-white/10 px-3.5 py-1.5 rounded-full text-[10px] font-mono font-bold tracking-[0.15em] ${theme.textClass} flex items-center gap-2 shadow-2xl border-t-white/20`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isStatic ? 'bg-amber-400' : theme.pulseLive}`} />
          {camera.name.toUpperCase()}
        </div>
        {isStatic && (
          <div className="bg-amber-500/10 backdrop-blur-md border border-amber-500/20 px-3 py-1.5 rounded-full text-[9px] font-mono font-black tracking-widest text-amber-500/90 flex items-center gap-2 uppercase">
            {t("auto.STATIC_5899") || "STATIC"}
          </div>
        )}
      </div>

      <div className="absolute top-5 right-5 z-20 flex gap-2">
        <div className="bg-black/40 backdrop-blur-md px-2 py-1 rounded text-[9px] font-mono text-slate-500 border border-white/5 uppercase flex items-center">
          {isStatic ? 'SIM' : 'LIVE'} · {camera.stream_type || 'RTSP'}
        </div>
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsFullscreen(!isFullscreen); }} 
          className="bg-black/40 backdrop-blur-md p-1.5 rounded text-slate-500 border border-white/5 hover:text-white transition-colors cursor-pointer"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className={`flex-1 bg-[#050508] relative overflow-hidden group-hover:scale-[1.01] transition-transform duration-1000 ease-out w-full rounded-2xl ${isFullscreen ? 'min-h-[80vh]' : 'aspect-video'}`}>
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 bg-[length:30px_30px]" />

        <img
          src={feedUrl || "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwNTA1MDgiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0iIzIyMiIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxMiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+U1RSRUFNIE9GRkxJTkU8L3RleHQ+PC9zdmc+"}
          alt={`${camera.name} Feed`}
          className={`absolute inset-0 w-full h-full object-cover bg-black transition-all duration-1000 ease-in-out ${isStatic ? 'opacity-70 saturate-[0.8] contrast-[1.2]' : 'opacity-90 saturate-[1.2] contrast-[1.1]'} group-hover:saturate-100 group-hover:opacity-100`}
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwNTA1MDgiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0iIzQ0NCIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxMiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SE9TVEVEX1RSQU5TTUlTU0lPTl9XRVM8L3RleHQ+PC9zdmc+";
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c14] via-[#0c0c14]/10 to-transparent opacity-80 pointer-events-none" />

        {!isStatic && (
          <div className={`absolute inset-x-0 top-0 h-[2px] animate-scan-y z-10 ${theme.scanLine}`} />
        )}

        {/* Corner Accents */}
        <div className={`absolute top-4 left-4 w-4 h-4 border-l-2 border-t-2 rounded-tl-sm pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${theme.cornerAccent}`} />
        <div className={`absolute top-4 right-4 w-4 h-4 border-r-2 border-t-2 rounded-tr-sm pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${theme.cornerAccent}`} />
        <div className={`absolute bottom-4 left-4 w-4 h-4 border-l-2 border-b-2 rounded-bl-sm pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${theme.cornerAccent}`} />
        <div className={`absolute bottom-4 right-4 w-4 h-4 border-r-2 border-b-2 rounded-br-sm pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${theme.cornerAccent}`} />
      </div>

      <div className="h-28 bg-[#0c0c14] p-5 relative flex items-center justify-between border-t border-white/5">
        <div className="flex flex-col gap-1 w-1/3">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] font-mono">{t('smartCity.engineProtocol')}</span>
          <span className="text-[11px] text-slate-300 font-semibold tracking-wide flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isStatic ? 'bg-slate-500' : theme.pulseSecondary}`} />
            {isStatic ? t('smartCity.simulatedInsights') : t('smartCity.liveAiTelemetry')}
          </span>
          {/* Mock SVG Sparkline representing active trend */}
          <div className="mt-3 opacity-60">
            <svg width="80" height="15" viewBox="0 0 80 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 12 Q 10 5, 20 8 T 40 4 T 60 10 T 80 2" stroke={`currentColor`} className={theme.textClass} strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        </div>

        {insights && (
          <div className="flex items-center gap-6">
            {sectionType === "parking" && (
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-[9px] ${theme.textClass} font-bold uppercase tracking-widest mb-0.5`}>{t('smartCity.occupancy')}</div>
                    <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">
                      {insights.overall?.occupancy_pct || 0}<span className="text-xs text-slate-500 ml-0.5">%</span>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner transition-colors ${theme.iconBg}`}>
                    <Car className={`w-6 h-6 ${theme.textClass}`} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-[9px] text-emerald-400 font-bold uppercase tracking-widest mb-0.5`}>{t("auto.Available_2179") || "Available"}</div>
                    <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">
                      {insights.overall?.total_available || 0}<span className="text-[10px] text-slate-500 ml-1">{t("auto.spots_6538") || "spots"}</span>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner bg-emerald-500/10 border border-emerald-500/20`}>
                    <Car className={`w-6 h-6 text-emerald-400`} />
                  </div>
                </div>
              </div>
            )}

            {sectionType === "traffic" && (
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-[9px] ${theme.textClass} font-bold uppercase tracking-widest mb-0.5`}>{t('smartCity.density')}</div>
                    <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">
                      {Math.round((insights.metrics?.density || 0) * 100)}<span className="text-xs text-slate-500 ml-0.5">%</span>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner transition-colors ${theme.iconBg}`}>
                    <Activity className={`w-6 h-6 ${theme.textClass}`} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-[9px] text-amber-400 font-bold uppercase tracking-widest mb-0.5`}>{t("auto.Velocity_3970") || "Velocity"}</div>
                    <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">
                      {Math.round(insights.signals?.[camera.id]?.avg_velocity || 0)}<span className="text-[10px] text-slate-500 ml-0.5">px/s</span>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner bg-amber-500/10 border border-amber-500/20`}>
                    <Zap className={`w-6 h-6 text-amber-400`} />
                  </div>
                </div>
              </div>
            )}

            {sectionType === "people" && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={`text-[9px] ${theme.textClass} font-bold uppercase tracking-widest mb-0.5`}>{t('smartCity.flowRate')}</div>
                  <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">
                    {insights.flow?.entries || 0}<span className="text-xs text-slate-500 ml-0.5">/min</span>
                  </div>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner transition-colors ${theme.iconBg}`}>
                  <Users className={`w-6 h-6 ${theme.textClass}`} />
                </div>
              </div>
            )}

            {sectionType === "incident" && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={`text-[9px] ${theme.textClass} font-bold uppercase tracking-widest mb-0.5`}>{t('smartCity.activeRisk')}</div>
                  <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">
                    {insights.risk_level || "LOW"}
                  </div>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner transition-colors ${theme.iconBg}`}>
                  <AlertTriangle className={`w-6 h-6 ${theme.textClass}`} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Dynamic Theme Mapper
const THEMES: Record<string, any> = {
  parking: {
    primary: "cyan",
    secondary: "emerald",
    bgClass: "from-cyan-950/40 to-[#0c0c14]",
    borderClass: "border-cyan-500/20",
    textClass: "text-cyan-400",
    glowClass: "bg-cyan-500/5",
    cardHover: "hover:border-cyan-500/40 hover:shadow-[0_0_40px_rgba(6,182,212,0.15)]",
    pulseLive: "bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]",
    scanLine: "bg-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.6)]",
    cornerAccent: "border-cyan-500/40",
    pulseSecondary: "bg-emerald-500 animate-pulse",
    iconBg: "bg-cyan-500/10 border-cyan-500/20 group-hover:bg-cyan-500/20",
    headerIconBg: "bg-cyan-500/10",
    headerBadge: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.1)]",
    headerBadgeDot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
    spinner: "border-cyan-500/20 border-t-cyan-500",
    barFill: "from-cyan-400 via-cyan-500 to-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]",
    textSecondary: "text-emerald-400",
    barCell: "bg-cyan-500/20",
  },
  traffic: {
    primary: "rose",
    secondary: "amber",
    bgClass: "from-rose-950/40 to-[#0c0c14]",
    borderClass: "border-rose-500/20",
    textClass: "text-rose-400",
    glowClass: "bg-rose-500/5",
    cardHover: "hover:border-rose-500/40 hover:shadow-[0_0_40px_rgba(244,63,94,0.15)]",
    pulseLive: "bg-rose-400 animate-pulse shadow-[0_0_10px_rgba(251,113,133,0.5)]",
    scanLine: "bg-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.6)]",
    cornerAccent: "border-rose-500/40",
    pulseSecondary: "bg-amber-500 animate-pulse",
    iconBg: "bg-rose-500/10 border-rose-500/20 group-hover:bg-rose-500/20",
    headerIconBg: "bg-rose-500/10",
    headerBadge: "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.1)]",
    headerBadgeDot: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]",
    spinner: "border-rose-500/20 border-t-rose-500",
    barFill: "from-rose-400 via-rose-500 to-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]",
    textSecondary: "text-amber-400",
    barCell: "bg-rose-500/20",
  },
  incident: {
    primary: "red",
    secondary: "orange",
    bgClass: "from-red-950/40 to-[#0c0c14]",
    borderClass: "border-red-500/20",
    textClass: "text-red-400",
    glowClass: "bg-red-500/5",
    cardHover: "hover:border-red-500/40 hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]",
    pulseLive: "bg-red-400 animate-pulse shadow-[0_0_10px_rgba(248,113,113,0.5)]",
    scanLine: "bg-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.6)]",
    cornerAccent: "border-red-500/40",
    pulseSecondary: "bg-orange-500 animate-pulse",
    iconBg: "bg-red-500/10 border-red-500/20 group-hover:bg-red-500/20",
    headerIconBg: "bg-red-500/10",
    headerBadge: "bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.1)]",
    headerBadgeDot: "bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]",
    spinner: "border-red-500/20 border-t-red-500",
    barFill: "from-red-400 via-red-500 to-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]",
    textSecondary: "text-orange-400",
    barCell: "bg-red-500/20",
  },
  people: {
    primary: "indigo",
    secondary: "violet",
    bgClass: "from-indigo-950/40 to-[#0c0c14]",
    borderClass: "border-indigo-500/20",
    textClass: "text-indigo-400",
    glowClass: "bg-indigo-500/5",
    cardHover: "hover:border-indigo-500/40 hover:shadow-[0_0_40px_rgba(99,102,241,0.15)]",
    pulseLive: "bg-indigo-400 animate-pulse shadow-[0_0_10px_rgba(129,140,248,0.5)]",
    scanLine: "bg-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.6)]",
    cornerAccent: "border-indigo-500/40",
    pulseSecondary: "bg-violet-500 animate-pulse",
    iconBg: "bg-indigo-500/10 border-indigo-500/20 group-hover:bg-indigo-500/20",
    headerIconBg: "bg-indigo-500/10",
    headerBadge: "bg-violet-500/10 border-violet-500/30 text-violet-400 shadow-[0_0_30px_rgba(139,92,246,0.1)]",
    headerBadgeDot: "bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]",
    spinner: "border-indigo-500/20 border-t-indigo-500",
    barFill: "from-indigo-400 via-indigo-500 to-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.4)]",
    textSecondary: "text-violet-400",
    barCell: "bg-indigo-500/20",
  },
  kinetic: {
    primary: "indigo",
    secondary: "fuchsia",
    bgClass: "from-indigo-950/40 to-[#0c0c14]",
    borderClass: "border-indigo-500/20",
    textClass: "text-indigo-400",
    glowClass: "bg-indigo-500/5",
    cardHover: "hover:border-indigo-500/40 hover:shadow-[0_0_40px_rgba(99,102,241,0.15)]",
    pulseLive: "bg-indigo-400 animate-pulse shadow-[0_0_10px_rgba(129,140,248,0.5)]",
    scanLine: "bg-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.6)]",
    cornerAccent: "border-indigo-500/40",
    pulseSecondary: "bg-fuchsia-500 animate-pulse",
    iconBg: "bg-indigo-500/10 border-indigo-500/20 group-hover:bg-indigo-500/20",
    headerIconBg: "bg-indigo-500/10",
    headerBadge: "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400 shadow-[0_0_30px_rgba(217,70,239,0.1)]",
    headerBadgeDot: "bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.8)]",
    spinner: "border-indigo-500/20 border-t-indigo-500",
    barFill: "from-indigo-400 via-indigo-500 to-fuchsia-500 shadow-[0_0_15px_rgba(217,70,239,0.4)]",
    textSecondary: "text-fuchsia-400",
    barCell: "bg-indigo-500/20",
  },
  greenwave: {
    primary: "emerald",
    secondary: "lime",
    bgClass: "from-emerald-950/40 to-[#0c0c14]",
    borderClass: "border-emerald-500/20",
    textClass: "text-emerald-400",
    glowClass: "bg-emerald-500/5",
    cardHover: "hover:border-emerald-500/40 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)]",
    pulseLive: "bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]",
    scanLine: "bg-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.6)]",
    cornerAccent: "border-emerald-500/40",
    pulseSecondary: "bg-lime-500 animate-pulse",
    iconBg: "bg-emerald-500/10 border-emerald-500/20 group-hover:bg-emerald-500/20",
    headerIconBg: "bg-emerald-500/10",
    headerBadge: "bg-lime-500/10 border-lime-500/30 text-lime-400 shadow-[0_0_30px_rgba(132,204,22,0.1)]",
    headerBadgeDot: "bg-lime-400 shadow-[0_0_10px_rgba(163,230,53,0.8)]",
    spinner: "border-emerald-500/20 border-t-emerald-500",
    barFill: "from-emerald-400 via-emerald-500 to-lime-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]",
    textSecondary: "text-lime-400",
    barCell: "bg-emerald-500/20",
  },
  liability: {
    primary: "amber",
    secondary: "orange",
    bgClass: "from-amber-950/40 to-[#0c0c14]",
    borderClass: "border-amber-500/20",
    textClass: "text-amber-400",
    glowClass: "bg-amber-500/5",
    cardHover: "hover:border-amber-500/40 hover:shadow-[0_0_40px_rgba(245,158,11,0.15)]",
    pulseLive: "bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.5)]",
    scanLine: "bg-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.6)]",
    cornerAccent: "border-amber-500/40",
    pulseSecondary: "bg-orange-500 animate-pulse",
    iconBg: "bg-amber-500/10 border-amber-500/20 group-hover:bg-amber-500/20",
    headerIconBg: "bg-amber-500/10",
    headerBadge: "bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.1)]",
    headerBadgeDot: "bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]",
    spinner: "border-amber-500/20 border-t-amber-500",
    barFill: "from-amber-400 via-amber-500 to-orange-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]",
    textSecondary: "text-orange-400",
    barCell: "bg-amber-500/20",
  },
  guardian: {
    primary: "cyan",
    secondary: "blue",
    bgClass: "from-blue-950/40 to-[#0c0c14]",
    borderClass: "border-blue-500/20",
    textClass: "text-blue-400",
    glowClass: "bg-blue-500/5",
    cardHover: "hover:border-blue-500/40 hover:shadow-[0_0_40px_rgba(59,130,246,0.15)]",
    pulseLive: "bg-blue-400 animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.5)]",
    scanLine: "bg-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.6)]",
    cornerAccent: "border-cyan-500/40",
    pulseSecondary: "bg-cyan-500 animate-pulse",
    iconBg: "bg-blue-500/10 border-blue-500/20 group-hover:bg-blue-500/20",
    headerIconBg: "bg-blue-500/10",
    headerBadge: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.1)]",
    headerBadgeDot: "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]",
    spinner: "border-blue-500/20 border-t-blue-500",
    barFill: "from-cyan-400 via-blue-500 to-indigo-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]",
    textSecondary: "text-cyan-400",
    barCell: "bg-blue-500/20",
  },
  hub: {
    primary: "cyan",
    secondary: "indigo",
    bgClass: "from-slate-900/40 to-[#0a0a0f]",
    borderClass: "border-white/10",
    textClass: "text-white",
    glowClass: "bg-white/5",
    cardHover: "hover:border-white/20 hover:shadow-[0_0_40px_rgba(255,255,255,0.05)]",
    pulseLive: "bg-white animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.5)]",
    scanLine: "bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.3)]",
    cornerAccent: "border-white/30",
    pulseSecondary: "bg-cyan-500 animate-pulse",
    iconBg: "bg-white/5 border-white/10 group-hover:bg-white/10",
    headerIconBg: "bg-white/10",
    headerBadge: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.1)]",
    headerBadgeDot: "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]",
    spinner: "border-white/10 border-t-white",
    barFill: "from-cyan-400 via-indigo-500 to-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.3)]",
    textSecondary: "text-indigo-400",
    barCell: "bg-white/5",
  }
};

export function SmartSectionDashboard({ sectionType, title }: { sectionType: string; title: string }) {
  const { t } = useTranslation();
  const Icon = (SECTION_ICONS[sectionType] ?? Activity) as any;
  const theme = THEMES[sectionType] || THEMES.parking;

  const [venues, setVenues] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [aggregateStats, setAggregateStats] = useState({ capacity: 0, occupancy: 0 });
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [detectionEvents, setDetectionEvents] = useState<any[]>([]);
  const [occupancyHistory, setOccupancyHistory] = useState<number[]>(Array(20).fill(0));
  const [activeKineticCameraId, setActiveKineticCameraId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const kineticEventsHook = useKineticEvents();

  // Hook telemetry depending on section type
  const kineticInsightsHook = useKineticInsights();
  const parkingInsights = useParkingInsights();
  const trafficInsights = useTrafficInsights();
  const incidentInsights = useIncidentAlerts();
  
  const currentInsights = sectionType === 'parking' ? parkingInsights.insights :
    sectionType === 'kinetic' ? kineticInsightsHook.insights :
      sectionType === 'hub' ? { ...parkingInsights.insights, traffic: trafficInsights.insights, incidents: incidentInsights.alerts } :
        trafficInsights.insights;
  const { setVenue } = useActiveVenue();

  // Poll detection events for parking
  useEffect(() => {
    if (sectionType !== 'parking') return;
    const fetchEvents = async () => {
      try {
        const res = await api.get('/parking/events/recent?limit=15');
        if (res.data?.events) setDetectionEvents(res.data.events);
      } catch { }
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 2000);
    return () => clearInterval(interval);
  }, [sectionType]);

  // Track occupancy history for sparkline
  useEffect(() => {
    if (sectionType !== 'parking' || !currentInsights) return;
    const occ = currentInsights?.overall?.occupied ?? currentInsights?.occupied_spots ?? 0;
    setOccupancyHistory(prev => [...prev.slice(1), occ]);
  }, [currentInsights, sectionType]);

  const [lastNotifiedLevel, setLastNotifiedLevel] = useState<number>(0);

  // Frontend local threshold notification
  useEffect(() => {
    if (sectionType === 'parking' && currentInsights && currentInsights.overall) {
      const occ = currentInsights.overall.occupancy_pct;

      let level = 0;
      if (occ >= 100) level = 100;
      else if (occ >= 75) level = 75;
      else if (occ >= 50) level = 50;

      if (level > lastNotifiedLevel) {
        setLastNotifiedLevel(level);
        toast.warning(`Dispatching Alert: Facility ${level}% Full`, { description: "Sending priority SMS to management..." });

        fetch("/api/v1/parking/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `[LAMINAR] Tactical Alert: Facility reached ${level}% capacity. ${currentInsights.suggestion || ''}`
          })
        });
      }
    }
  }, [currentInsights, lastNotifiedLevel, sectionType]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [venuesRes, camerasRes] = await Promise.all([
          api.get('/venues'),
          api.get('/cameras')
        ]);

        const allVenues = Array.isArray(venuesRes.data) ? venuesRes.data : [];
        const rawCameras = Array.isArray(camerasRes.data) ? camerasRes.data : [];
        const allCameras = rawCameras.filter((c: any) => c.is_active !== false);

        // Strict domain match or name heuristic, except for hub
        const sectionVenues = sectionType === 'hub' ? allVenues : allVenues.filter((v: any) => 
          (v.venue_type && v.venue_type.toLowerCase() === sectionType.toLowerCase()) || 
          (v.name && v.name.toLowerCase().includes(sectionType.toLowerCase()))
        );
        
        let sectionCameras = allCameras;
        if (sectionType !== 'hub') {
            const sectionVenueIds = new Set(sectionVenues.map((v: any) => v.id));
            sectionCameras = allCameras.filter((c: any) => sectionVenueIds.has(c.venue_id));
            
            // If no venues matched, fallback to cameras with matching name
            if (sectionCameras.length === 0) {
                sectionCameras = allCameras.filter((c:any) => c.name.toLowerCase().includes(sectionType.toLowerCase()));
            }
        }

        setVenues(sectionVenues);
        setCameras(sectionCameras);

        // Fetch live stats for capacity aggregation
        if (sectionVenues.length > 0) {
          const statsResults = await Promise.allSettled(
            sectionVenues.map((v: any) => api.get(`/venues/${v.id}/stats`).then(r => r.data))
          );
          let totalCap = 0;
          let totalOcc = 0;
          statsResults.forEach((result: any) => {
            if (result.status === 'fulfilled' && result.value) {
              totalCap += result.value.capacity || 0;
              totalOcc += result.value.current_occupancy || 0;
            }
          });
          setAggregateStats({ capacity: totalCap, occupancy: totalOcc });
        }

        // Auto-sync active venue context for the mesh
        if (sectionVenues.length > 0) {
          setVenue(sectionVenues[0].id);
        }
      } catch (e) {
        console.error("Failed to load smart section data", e);
      } finally {
        setLoadingInitial(false);
      }
    }
    fetchData();
  }, [sectionType]);

  if (loadingInitial) {
    return <Loading />;
  }

  return (
    <div className="w-full min-h-screen bg-[#0a0a10] text-white p-8 flex flex-col gap-8 custom-scrollbar overflow-y-auto relative isolate">
      {sectionType === 'hub' && (
        <SplashCursor
          DENSITY_DISSIPATION={3.5}
          VELOCITY_DISSIPATION={2}
          PRESSURE={0.1}
          CURL={3}
          SPLAT_RADIUS={0.2}
          SPLAT_FORCE={6000}
          COLOR_UPDATE_SPEED={10}
          SHADING={true}
          RAINBOW_MODE={false}
          COLOR="#A855F7"
          TRANSPARENT={true}
        />
      )}

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <Link href="/venues" className="flex items-center gap-2 group">
            <div className="p-3 bg-white/5 group-hover:bg-white/10 rounded-2xl border border-white/10 transition-all shadow-lg group-active:scale-95">
              <ArrowLeft className="text-slate-400 group-hover:text-white w-6 h-6" />
            </div>
            <span className="text-slate-500 font-bold uppercase tracking-widest text-xs group-hover:text-white transition-colors whitespace-pre-line">{t('smartCity.backToVenues')}</span>
          </Link>

          <div className="h-10 w-[1px] bg-white/10 mx-2" />

          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className={`p-2 ${theme.headerIconBg} rounded-lg`}>
                <Icon className={`${theme.textClass} w-5 h-5`} />
              </div>
              <span className={`${theme.textClass}/60 font-mono text-[10px] font-black tracking-[0.3em] uppercase`}>{t("auto.TacticalNodeOve_8323") || "Tactical Node Override"}</span>
            </div>
            <h1 className="text-3xl font-black font-heading tracking-tight uppercase leading-tight">
              {t("auto.LAMINAR_5446") || "LAMINAR"} <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/40">{title}</span> {t("auto.intelligence_3662") || "intelligence"}
            </h1>
            <p className="text-slate-500 text-xs mt-1 font-medium tracking-wide uppercase">Real-time smart {sectionType} guidance & tactical routing engine v2.1</p>
          </div>
        </div>
        <div className="flex gap-3">
          {sectionType === "parking" && (
            <>
              {/* Heatmap Toggle */}
              <button
                onClick={() => setShowHeatmap(p => !p)}
                className={`px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase ${showHeatmap
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
              >
                <Thermometer className="w-4 h-4" />
                {t('smartCity.heatmap')}
              </button>

              {/* Record 10s Video */}
              <button
                onClick={async () => {
                  const t = toast.loading('Recording 10s capture...');
                  try {
                    const res = await fetch('/api/v1/parking/snapshot/video', { method: 'GET', headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
                    if (!res.ok) throw new Error();
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'parking_capture.mp4'; a.click();
                    toast.success('Video downloaded!', { id: t });
                  } catch { toast.error('Recording failed', { id: t }); }
                }}
                className="px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border border-white/10 text-slate-400 hover:bg-white/5 transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase"
              >
                <Video className="w-4 h-4" />
                {t('smartCity.record10s')}
              </button>

              {/* PDF Report */}
              <button
                onClick={async () => {
                  const t = toast.loading('Generating report...');
                  try {
                    const res = await fetch('/api/v1/parking/report/pdf', { method: 'GET', headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
                    if (!res.ok) throw new Error();
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = blob.type === 'application/pdf' ? 'parking_report.pdf' : 'parking_report.csv'; a.click();
                    toast.success('Report downloaded!', { id: t });
                  } catch { toast.error('Report failed', { id: t }); }
                }}
                className="px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border border-white/10 text-slate-400 hover:bg-white/5 transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase"
              >
                <FileText className="w-4 h-4" />
                {t('smartCity.exportPdf')}
              </button>

              {/* Inject AI Frame — Parking */}
              <label className={`cursor-pointer px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border ${theme.borderClass} ${theme.glowClass} ${theme.textClass} hover:bg-white/5 transition-all shadow-lg`}>
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-mono font-black tracking-[0.2em] uppercase mt-0.5">{t('smartCity.injectFrame')}</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;

                  const camId = cameras[0]?.id;
                  const vId = venues[0]?.id;
                  if (!camId) {
                    toast.error("No active camera node detected for injection.");
                    return;
                  }

                  const uploadFile = async (file: File) => {
                    const formData = new FormData();
                    formData.append("file", file);
                    const queryArgs = new URLSearchParams();
                    queryArgs.append("camera_id", camId);
                    if (vId) queryArgs.append("venue_id", vId);

                    return api.post(`/parking/upload?${queryArgs.toString()}`, formData, {
                      headers: { "Content-Type": "multipart/form-data" }
                    });
                  };

                  if (files.length === 1) {
                    const loadingToast = toast.loading("Injecting parking frame to neural network...");
                    try {
                      const res = await uploadFile(files[0]);
                      if (res.status === 200) {
                        toast.success("Frame processed successfully!", { id: loadingToast });
                      } else {
                        toast.error("Failed to process frame.", { id: loadingToast });
                      }
                    } catch (err) {
                      toast.error("Error communicating with AI core.", { id: loadingToast });
                    }
                  } else {
                    toast.info(`Injecting ${files.length} parking frames...`);
                    let successCount = 0;
                    for (const file of files) {
                      try {
                        const res = await uploadFile(file);
                        if (res.status === 200) successCount++;
                      } catch { }
                    }
                    toast.success(`Batch complete: ${successCount}/${files.length} frames analyzed.`);
                  }
                }} />
              </label>

              {/* Clear Injected Frame */}
              <button
                onClick={async () => {
                  const camId = cameras[0]?.id;
                  const t = toast.loading('Clearing injected frame...');
                  try {
                    const url = camId ? `/api/v1/parking/reset-frame?camera_id=${camId}` : '/api/v1/parking/reset-frame';
                    await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
                    toast.success('Frame cleared. Feed restored.', { id: t });
                  } catch { toast.error('Failed to clear frame.', { id: t }); }
                }}
                className="px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase"
              >
                <span>✕</span>
                {t('smartCity.removeFrame')}
              </button>
            </>
          )}

          {sectionType === "traffic" && (
            <>
              {/* Inject AI Frame/Video — Traffic */}
              <label className={`cursor-pointer px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border ${theme.borderClass} ${theme.glowClass} ${theme.textClass} hover:bg-white/5 transition-all shadow-lg`}>
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-mono font-black tracking-[0.2em] uppercase mt-0.5">{t('smartCity.injectMedia')}</span>
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;

                  const uploadFile = async (file: File) => {
                    const formData = new FormData();
                    formData.append("file", file);
                    return api.post("/traffic/upload", formData, {
                      headers: { "Content-Type": "multipart/form-data" }
                    });
                  };

                  if (files.length === 1) {
                    const loadingToast = toast.loading("Analyzing traffic media...");
                    try {
                      const res = await uploadFile(files[0]);
                      if (res.status === 200) {
                        toast.success(`Analysis complete! Detected ${res.data?.summary?.vehicle_count ?? 0} vehicles.`, { id: loadingToast });
                      } else {
                        toast.error("Failed to analyze media.", { id: loadingToast });
                      }
                    } catch (err) {
                      toast.error("Error communicating with AI core.", { id: loadingToast });
                    }
                  } else {
                    toast.info(`Importing ${files.length} traffic sources...`);
                    let totalVehicles = 0;
                    for (const file of files) {
                      try {
                        const res = await uploadFile(file);
                        if (res.status === 200) totalVehicles += res.data?.summary?.vehicle_count ?? 0;
                      } catch { }
                    }
                    toast.success(`Batch complete: total of ${totalVehicles} vehicles detected.`);
                  }
                }} />
              </label>

              {/* PDF Report */}
              <button
                onClick={async () => {
                  const t = toast.loading('Generating traffic report...');
                  try {
                    const res = await fetch('/api/v1/traffic/report/pdf', { method: 'GET', headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
                    if (!res.ok) throw new Error();
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'traffic_report.pdf'; a.click();
                    toast.success('Report downloaded!', { id: t });
                  } catch { toast.error('Report failed', { id: t }); }
                }}
                className="px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border border-white/10 text-slate-400 hover:bg-white/5 transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase"
              >
                <FileText className="w-4 h-4" />
                {t('smartCity.exportPdf')}
              </button>
            </>
          )}

          {sectionType === "people" && (
            <>
              {/* Inject AI Frame — People (uses new dwell upload endpoint) */}
              <label className={`cursor-pointer px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border ${theme.borderClass} ${theme.glowClass} ${theme.textClass} hover:bg-white/5 transition-all shadow-lg`}>
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-mono font-black tracking-[0.2em] uppercase mt-0.5">{t('smartCity.injectFrame')}</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  const camId = cameras[0]?.id;
                  if (!camId) {
                    toast.error("No active camera node detected for injection.");
                    return;
                  }

                  const uploadFile = async (file: File) => {
                    const formData = new FormData();
                    formData.append("file", file);
                    return api.post(`/dwell/upload?camera_id=${camId}`, formData, {
                      headers: { "Content-Type": "multipart/form-data" }
                    });
                  };

                  if (files.length === 1) {
                    const loadingToast = toast.loading("Injecting crowd frame...");
                    try {
                      const res = await uploadFile(files[0]);
                      toast.success(res.data?.message || "Frame injected!", { id: loadingToast });
                    } catch { toast.error("Failed to process frame.", { id: loadingToast }); }
                  } else {
                    toast.info(`Injecting ${files.length} crowd frames...`);
                    let count = 0;
                    for (const f of files) {
                      try {
                        const res = await uploadFile(f);
                        if (res.status === 200) count++;
                      } catch { }
                    }
                    toast.success(`Batch complete: ${count} frames analyzed.`);
                  }
                }} />
              </label>
            </>
          )}

          {sectionType === "hub" && (
            <button
              onClick={async () => {
                const t = toast.loading('Resetting all tactical feeds...');
                try {
                  await Promise.allSettled([
                    api.post('/parking/reset-frame'),
                    api.post('/traffic/reset'),
                    api.post('/incident/reset')
                  ]);
                  toast.success('All feeds synchronized.', { id: t });
                } catch { toast.error('Partial reset failed.', { id: t }); }
              }}
              className="px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase"
            >
              <RotateCw className="w-4 h-4" />
              {t("auto.ResetAllNodes_3042") || "Reset All Nodes"}
            </button>
          )}

          {sectionType === "incident" && (
            <>
              {/* Inject AI Media — Incident */}
              <label className={`cursor-pointer px-4 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all shadow-lg`}>
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-mono font-black tracking-[0.2em] uppercase mt-0.5">{t("auto.InjectTacticalH_1983") || "Inject Tactical Hit"}</span>
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;

                  const uploadFile = async (file: File) => {
                    const formData = new FormData();
                    formData.append("file", file);
                    return api.post("/incident/upload", formData, {
                      headers: { "Content-Type": "multipart/form-data" }
                    });
                  };

                  if (files.length === 1) {
                    const lt = toast.loading("Injecting tactical hit...");
                    try {
                      const res = await uploadFile(files[0]);
                      toast.success(res.data?.message || "Incident data synchronized.", { id: lt });
                    } catch { toast.error("Injection failed.", { id: lt }); }
                  } else {
                    toast.info(`Processing ${files.length} tactical hits...`);
                    let count = 0;
                    for (const f of files) {
                      try {
                        const res = await uploadFile(f);
                        if (res.status === 200) count++;
                      } catch { }
                    }
                    toast.success(`Batch complete: ${count} incident vectors synchronized.`);
                  }
                }} />
              </label>

              {/* PDF Report */}
              <button
                onClick={async () => {
                  const t = toast.loading('Generating incident report...');
                  try {
                    const res = await fetch('/api/v1/incident/report/pdf', { method: 'GET', headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
                    if (!res.ok) throw new Error();
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'incident_report.pdf'; a.click();
                    toast.success('Report downloaded!', { id: t });
                  } catch { toast.error('Report failed', { id: t }); }
                }}
                className="px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border border-white/10 text-slate-400 hover:bg-white/5 transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase"
              >
                <FileText className="w-4 h-4" />
                {t('smartCity.exportPdf')}
              </button>
            </>
          )}

          {sectionType === "kinetic" && (
            <>
              {/* Inject AI Media — Kinetic */}
              <label className={`cursor-pointer px-4 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-md border ${theme.borderClass} ${theme.glowClass} ${theme.textClass} hover:bg-white/5 transition-all shadow-lg`}>
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-mono font-black tracking-[0.2em] uppercase mt-0.5">{t("auto.InjectKineticMe_1829") || "Inject Kinetic Media"}</span>
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  const camId = activeKineticCameraId || cameras[0]?.id;
                  if (!camId) {
                    toast.error("No active camera node detected for injection.");
                    return;
                  }

                  const uploadFile = async (file: File) => {
                    const formData = new FormData();
                    formData.append("file", file);
                    return api.post(`/kinetic/upload?camera_id=${camId}`, formData, {
                      headers: { "Content-Type": "multipart/form-data" }
                    });
                  };

                  if (files.length === 1) {
                    const lt = toast.loading("Injecting kinetic media...");
                    try {
                      await uploadFile(files[0]);
                      toast.success("Kinetic analysis started.", { id: lt });
                    } catch { toast.error("Injection failed.", { id: lt }); }
                  }
                }} />
              </label>
              
              {/* Clear Kinetic Media */}
              <button 
                onClick={async () => {
                  const camId = activeKineticCameraId || cameras[0]?.id;
                  if (!camId) return;
                  const lt = toast.loading("Clearing injected media...");
                  try {
                    await api.post(`/kinetic/clear-media/${camId}`);
                    toast.success("Live feed resumed.", { id: lt });
                  } catch { toast.error("Failed to clear media.", { id: lt }); }
                }} 
                className={`px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border ${theme.borderClass} text-slate-400 hover:bg-white/5 transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase`}
              >
                <X className="w-4 h-4" />
                <span className="mt-0.5">{t("auto.ClearMedia_2349") || "Clear Media"}</span>
              </button>
            </>
          )}
          <div className={`px-5 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-md border ${theme.headerBadge}`}>
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${theme.headerBadgeDot}`} />
            <span className={`text-[10px] font-mono font-black tracking-[0.2em] uppercase`}>{t('smartCity.systemOnline')}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-8 mt-4 items-start flex-col xl:flex-row">

        <div className={`w-full flex-[2] grid gap-6 ${sectionType === 'hub' ? 'grid-cols-1 lg:grid-cols-2' : cameras.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} ${cameras.length >= 4 ? 'xl:grid-cols-2' : ''}`}>

          {sectionType === 'hub' && (
            <>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                <ServiceCard
                  title={t("auto.ParkingIntellig_9835") || "Parking Intelligence"}
                  description="Optimize stall occupancy and predict peak demand with AI neural vision."
                  icon={Car}
                  href="/smart-parking"
                  theme={THEMES.parking}
                  stats={{
                    "Occupancy": `${currentInsights?.overall?.occupancy_pct || 0}%`,
                    "Available": currentInsights?.overall?.total_available || 0
                  }}
                />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
                <ServiceCard
                  title={t("auto.TrafficFlow_9654") || "Traffic Flow"}
                  description="Real-time vehicle counting and velocity vector analysis for urban throughput."
                  icon={Activity}
                  href="/smart-traffic"
                  theme={THEMES.traffic}
                  stats={{
                    "Density": `${currentInsights?.traffic?.overall?.congested_zones > 0 ? "HIGH" : "OPTIMAL"}`,
                    "Incidents": currentInsights?.traffic?.overall?.total_vehicles || 0
                  }}
                />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
                <ServiceCard
                  title={t("auto.CrowdDynamics_4664") || "Crowd Dynamics"}
                  description="Heatmap generation and entry/exit auditing for high-traffic facility zones."
                  icon={Users}
                  href="/venues"
                  theme={THEMES.people}
                  stats={{
                    "Flow": `${currentInsights?.flow?.entries || 0}/min`,
                    "Status": "OPTIMAL"
                  }}
                />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
                <ServiceCard
                  title={t("auto.TacticalAlerts_854") || "Tactical Alerts"}
                  description="Automated risk score calculation and emergency dispatch protocols."
                  icon={AlertTriangle}
                  href="/smart-incidents"
                  theme={THEMES.incident}
                  stats={{
                    "Risk": currentInsights?.incidents?.length > 0 ? "HIGH" : "LOW",
                    "Alerts": `${currentInsights?.incidents?.length || 0} ACTIVE`
                  }}
                />
              </motion.div>
            </>
          )}

          {sectionType !== 'hub' && cameras.length === 0 && (
            <div className="col-span-full py-32 flex flex-col items-center justify-center bg-white/5 rounded-3xl border border-white/5 border-dashed relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <AlertTriangle className="w-16 h-16 text-slate-700 mb-6 group-hover:text-slate-500 transition-colors" />
              <h3 className="text-2xl font-black text-slate-400 uppercase tracking-widest">No {title} Nodes Detected</h3>
              <p className="text-slate-600 mt-3 text-sm font-medium tracking-wide uppercase max-w-sm text-center leading-relaxed">
                Deploy Edge infrastructure into venues tagged as "{sectionType}" to enable local intelligence protocols.
              </p>
            </div>
          )}

          {sectionType === 'kinetic' && cameras.length > 0 && (
            <div className="col-span-full mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono">{t("auto.SelectCamera_9328") || "Select Camera"}</span>
                <select 
                  className={`bg-black/50 border ${theme.borderClass} ${theme.textClass} text-xs font-mono rounded-xl px-4 py-2 outline-none focus:border-${theme.primary}-500/50 transition-colors`}
                  value={activeKineticCameraId || cameras[0]?.id || ''}
                  onChange={(e) => setActiveKineticCameraId(e.target.value)}
                >
                  {cameras.map(cam => (
                    <option key={cam.id} value={cam.id}>{cam.name} (Live Node)</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border ${theme.borderClass} ${theme.textClass} hover:bg-white/5 transition-all`}
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
              </button>
            </div>
          )}

          {sectionType !== 'hub' && cameras.map(cam => {
            const currentKineticCameraId = activeKineticCameraId || cameras[0]?.id;
            if (sectionType === 'kinetic' && cam.id !== currentKineticCameraId) return null;
            return (
              <motion.div key={cam.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }} className={isFullscreen ? 'fixed inset-0 z-50 bg-[#0a0a10] p-8' : ''}>
                {isFullscreen && (
                  <button 
                    onClick={() => setIsFullscreen(false)}
                    className="absolute top-12 right-12 z-50 bg-rose-500/10 text-rose-500 border border-rose-500/20 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-rose-500/20"
                  >
                    {t("auto.CloseFullscreen_8785") || "Close Fullscreen"}
                  </button>
                )}
                <CameraFeedCard camera={cam} sectionType={sectionType} insights={currentInsights} showHeatmap={showHeatmap} />
              </motion.div>
            )
          })}

        </div>

        {/* Right Insights Sidebar */}
        <div className="w-full flex-[1] min-w-[350px] flex flex-col gap-6">
          {/* Total Capacity Aggregation */}
          {sectionType !== 'kinetic' && (
            <div className={`bg-gradient-to-br ${theme.bgClass} ${theme.borderClass} border rounded-3xl p-6 relative overflow-hidden backdrop-blur-md shadow-2xl`}>
              <div className={`absolute top-0 right-0 w-32 h-32 ${theme.glowClass} rounded-full blur-3xl -mr-16 -mt-16`} />
              <p className={`${theme.textClass} font-bold text-[10px] uppercase tracking-[0.3em] mb-6 font-mono`}>{t('smartCity.infrastructureLoad')}</p>
  
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">{t('smartCity.activeCapacity')}</span>
                  <span className="text-white font-black font-mono text-lg">{(() => {
                    if (currentInsights?.overall?.occupancy_pct !== undefined) return Math.round(currentInsights.overall.occupancy_pct);
                    if (currentInsights?.metrics?.density !== undefined) return Math.round(currentInsights.metrics.density * 100);
                    if (aggregateStats.capacity > 0) return Math.round((aggregateStats.occupancy / aggregateStats.capacity) * 100);
                    return 0;
                  })()}%</span>
                </div>
                <div className="w-full bg-white/5 h-3 rounded-full overflow-hidden relative shadow-inner border border-white/5">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${theme.barFill} transition-all duration-1000`}
                    style={{
                      width: `${Math.min((() => {
                        if (currentInsights?.overall?.occupancy_pct !== undefined) return Math.round(currentInsights.overall.occupancy_pct);
                        if (currentInsights?.metrics?.density !== undefined) return Math.round(currentInsights.metrics.density * 100);
                        if (aggregateStats.capacity > 0) return Math.round((aggregateStats.occupancy / aggregateStats.capacity) * 100);
                        return 0;
                      })(), 100)}%`
                    }}
                  />
                </div>
              </div>
  
              <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-white/5">
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 font-mono">{t("auto.Venues_9902") || "Venues"}</p>
                  <p className="text-xl font-black text-white font-mono leading-none">{venues.length}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 font-mono">{t("auto.EdgeNodes_7901") || "Edge Nodes"}</p>
                  <p className={`text-xl font-black font-mono leading-none ${theme.textSecondary}`}>{cameras.length}</p>
                </div>
              </div>
            </div>
          )}

          {/* Kinetic Intelligence Panel (SOS 3.0) */}
          {sectionType === "kinetic" && (
            <div className={`bg-[#12121a]/80 backdrop-blur-xl border ${theme.borderClass} rounded-3xl p-6 relative shadow-[0_0_40px_rgba(99,102,241,0.03)] border-t-${theme.primary}-500/40 flex flex-col gap-6`}>
              <div className="flex items-center justify-between">
                <p className={`${theme.textClass} font-bold text-[10px] uppercase tracking-[0.3em] font-mono`}>{t("auto.KineticIntellig_817") || "Kinetic Intelligence v3"}</p>
                {(() => {
                  const active = currentInsights?.fusion_state?.sos_activated;
                  return active 
                    ? <span className="text-[9px] font-mono font-black px-2 py-1 rounded-full border text-rose-400 bg-rose-500/10 border-rose-500/30 animate-pulse">{t("auto.SOSACTIVATED_9666") || "SOS ACTIVATED"}</span>
                    : <span className="text-[9px] font-mono font-black px-2 py-1 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/30">{t("auto.MONITORING_8416") || "MONITORING"}</span>;
                })()}
              </div>

              {/* Confidence Fusion Gauge */}
              <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                <div className="flex justify-between items-end mb-3">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono">{t("auto.ConfidenceFusio_3809") || "Confidence Fusion Score"}</span>
                  <span className={`font-black font-mono text-xl leading-none ${currentInsights?.fusion_state?.fusion_score > 70 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {currentInsights?.fusion_state?.fusion_score || 0}%
                  </span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden relative shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${currentInsights?.fusion_state?.fusion_score > 70 ? 'bg-gradient-to-r from-rose-600 to-rose-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
                    style={{ width: `${Math.min(currentInsights?.fusion_state?.fusion_score || 0, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-3 px-1 text-[8px] font-mono text-slate-500">
                  <span className={currentInsights?.fusion_state?.sos_conf > 30 ? 'text-indigo-400 font-bold' : ''}>{t("auto.GESTURE_98") || "GESTURE"}</span>
                  <span className={currentInsights?.fusion_state?.audio_conf > 30 ? 'text-indigo-400 font-bold' : ''}>{t("auto.AUDIO_6434") || "AUDIO"}</span>
                  <span className={currentInsights?.fusion_state?.fall_conf > 30 ? 'text-indigo-400 font-bold' : ''}>{t("auto.FALL_3391") || "FALL"}</span>
                  <span className={currentInsights?.fusion_state?.motion_conf > 30 ? 'text-indigo-400 font-bold' : ''}>{t("auto.PANIC_6957") || "PANIC"}</span>
                </div>
              </div>

              {/* Local Randy AI Summary */}
              <div className="bg-indigo-900/10 rounded-2xl p-4 border border-indigo-500/20 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50" />
                <div className="flex items-center gap-2 mb-3">
                  <BrainCircuit className="w-4 h-4 text-indigo-400" />
                  <span className="text-[10px] font-mono font-bold text-indigo-300 uppercase tracking-widest">{t("auto.RandyAISummary_9579") || "Randy AI Summary"}</span>
                </div>
                <pre className="text-[11px] font-mono text-indigo-100/80 whitespace-pre-wrap leading-relaxed">
                  {currentInsights?.fusion_state?.randy_summary || "System optimal. No emergency signals detected."}
                </pre>
              </div>

              {/* Emergency Timeline */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className={`${theme.textClass} font-bold text-[10px] uppercase tracking-[0.3em] font-mono`}>{t("auto.EmergencyTimeli_1679") || "Emergency Timeline"}</p>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${theme.pulseSecondary}`} />
                    <span className={`text-[9px] ${theme.textClass}/70 font-mono`}>{t("auto.LIVE_112") || "LIVE"}</span>
                  </div>
                </div>
                
                {(!currentInsights?.fusion_state?.timeline || currentInsights.fusion_state.timeline.length === 0) ? (
                  <p className="text-slate-600 text-[10px] font-mono py-2 italic border-l-2 border-white/5 pl-3">{t("auto.Noactiveevents_8885") || "No active events."}</p>
                ) : (
                  <div className="space-y-3 pl-2">
                    {currentInsights.fusion_state.timeline.map((ev: any, i: number) => (
                      <div key={i} className="flex gap-3 items-start relative">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 absolute -left-1 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                        <div className="flex flex-col pl-4 border-l border-indigo-500/20">
                          <span className="text-[9px] text-slate-500 font-mono leading-none mb-1">{ev.timestamp}</span>
                          <span className="text-[11px] text-slate-300 font-mono font-medium">{ev.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Parking Intelligence Panel */}
          {sectionType === "parking" && (
            <div className="bg-[#12121a]/80 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-6 relative shadow-[0_0_40px_rgba(16,185,129,0.03)] border-t-emerald-500/40">
              <div className="flex items-center justify-between mb-4">
                <p className="text-emerald-400 font-bold text-[10px] uppercase tracking-[0.3em] font-mono">{t('smartCity.parkingIntelligence')}</p>
                {/* Status Badge */}
                {(() => {
                  const occ = currentInsights?.overall?.occupied ?? currentInsights?.occupied_spots ?? 0;
                  const total = currentInsights?.overall?.capacity ?? currentInsights?.total_slots ?? 50;
                  const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
                  const status = pct > 80 ? t('smartCity.critical') : pct > 50 ? t('smartCity.busy') : t('smartCity.safe');
                  const col = pct > 80 ? 'text-red-400 bg-red-500/10 border-red-500/30' : pct > 50 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                  return <span className={`text-[9px] font-mono font-black px-2 py-1 rounded-full border ${col}`}>{status}</span>;
                })()}
              </div>

              {/* Occupancy sparkline */}
              <div className="flex items-end gap-0.5 h-10 mb-4">
                {occupancyHistory.map((v, i) => {
                  const max = Math.max(...occupancyHistory, 1);
                  const h = Math.round((v / max) * 100);
                  return <div key={i} className="flex-1 rounded-t-sm bg-emerald-500/40" style={{ height: `${h}%` }} />;
                })}
              </div>
              <p className="text-[9px] text-slate-500 uppercase font-mono tracking-widest mb-4">{t('smartCity.vehicleCountHistory')}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-2xl p-3">
                  <p className="text-[9px] text-slate-500 uppercase font-mono mb-1">{t("auto.Detected_217") || "Detected"}</p>
                  <p className="text-xl font-black font-mono text-white">{currentInsights?.overall?.occupied ?? currentInsights?.occupied_spots ?? 0}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-3">
                  <p className="text-[9px] text-slate-500 uppercase font-mono mb-1">{t("auto.Available_2179") || "Available"}</p>
                  <p className="text-xl font-black font-mono text-emerald-400">{currentInsights?.overall?.total_available ?? Math.max(0, (currentInsights?.total_slots ?? 50) - (currentInsights?.occupied_spots ?? 0))}</p>
                </div>
              </div>
            </div>
          )}

          {/* Intelligent Slot Visualization - only if backend has zone data */}
          {sectionType === "parking" && currentInsights?.zones && (
            <div className="bg-[#12121a]/80 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-6 relative shadow-[0_0_40px_rgba(16,185,129,0.03)]">
              <p className="text-emerald-400 font-bold text-[10px] uppercase tracking-[0.3em] mb-4 font-mono">{t('smartCity.parkingZoneMatrix')}</p>
              <div className="space-y-4">
                {Object.entries(currentInsights.zones).map(([zoneId, zone]: [string, any]) => (
                  <div key={zoneId} className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 uppercase font-bold tracking-widest">Zone {zoneId.toUpperCase()}</span>
                      <span className="text-white font-black font-mono">{zone.available}/{zone.capacity} <span className="text-slate-500 text-[10px] font-sans">{t("auto.available_5242") || "available"}</span></span>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden flex gap-0.5">
                      {[...Array(Math.min(20, zone.capacity > 0 ? 20 : 1))].map((_, i) => {
                        const isOccupied = i < Math.floor((zone.occupancy_pct / 100) * 20);
                        return (
                          <div key={i} className={`flex-1 h-full rounded-sm ${isOccupied ? 'bg-rose-500/50' : 'bg-emerald-400'}`} />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Detection Log */}
          {sectionType === "parking" && (
            <div className="bg-[#12121a]/80 backdrop-blur-xl border border-cyan-500/20 rounded-3xl p-6 relative shadow-[0_0_40px_rgba(6,182,212,0.03)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-cyan-400 font-bold text-[10px] uppercase tracking-[0.3em] font-mono">{t('smartCity.liveDetectionLog')}</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[9px] text-cyan-400/70 font-mono">{t('smartCity.live')}</span>
                </div>
              </div>
              {detectionEvents.length === 0 ? (
                <p className="text-slate-600 text-xs font-mono text-center py-4">{t("auto.Nodetectionsyet_2295") || "No detections yet. Inject a frame or activate camera."}</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {detectionEvents.slice(0, 15).map((ev, i) => (
                    <div key={ev.id ?? i} className="flex items-center justify-between text-[10px] font-mono bg-white/3 hover:bg-white/5 rounded-xl px-3 py-2 transition-colors border border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        <span className="text-slate-300 uppercase font-bold">{ev.type}</span>
                      </div>
                      <span className="text-cyan-400 font-black">{ev.confidence}%</span>
                      <span className="text-slate-600">{ev.position}</span>
                      <span className="text-slate-700">{ev.timestamp?.slice(11, 19)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live Decision Panel */}
          {currentInsights && sectionType !== 'kinetic' && (
            <div className="bg-[#12121a]/80 backdrop-blur-xl border border-fuchsia-500/20 rounded-3xl p-6 relative shadow-[0_0_40px_rgba(217,70,239,0.03)] border-t-fuchsia-500/40">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-fuchsia-500/20 p-2 rounded-xl">
                  <BrainCircuit className="w-5 h-5 text-fuchsia-400" />
                </div>
                <div>
                  <h3 className="font-black text-fuchsia-100 tracking-[0.1em] text-xs uppercase">{t("auto.DecisionEngine_1355") || "Decision Engine"}</h3>
                  <span className="text-[9px] text-fuchsia-500/60 font-mono font-bold tracking-widest uppercase">{t("auto.AutonomousPhase_3203") || "Autonomous Phase"}</span>
                </div>
              </div>
              <div className="relative">
                <div className="absolute -left-3 top-0 bottom-0 w-1 bg-gradient-to-b from-fuchsia-500/40 to-transparent rounded-full" />
                <p className="text-fuchsia-200/90 font-mono text-xs leading-relaxed pl-2">
                  {currentInsights?.suggestion || "System online. Multi-source spatial intelligence active. Routing optimized for current environmental load."}
                </p>
              </div>
            </div>
          )}

          {/* System Health Summary */}
          {sectionType !== 'kinetic' && (
            <div className="bg-white/5 border border-white/5 rounded-3xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{t('smartCity.syncState')}</span>
                <span className={`text-[10px] font-black font-mono ${theme.textSecondary}`}>0.4ms {t('smartCity.latency')}</span>
              </div>
              <div className="h-12 flex gap-1 items-end">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-sm ${theme.barCell}`}
                    style={{ height: `${Math.random() * 80 + 20}%` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
