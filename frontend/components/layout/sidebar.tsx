"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  MapPin,
  Video,
  BellRing,
  FileBarChart,
  Activity,
  Settings,
  BrainCircuit,
  LayoutGrid,
  X,
  Zap,
  ChevronRight,
  ShieldCheck,
  Clock,
  Target,
  RotateCw,
  CircuitBoard,
  Footprints,
  Webhook,
  Search,
  Users,
  MessageSquare,
  Car,
  Globe,
  TrafficCone,
  ShieldAlert
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useAlerts } from "@/hooks/useAlerts";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const { data: alerts, crowdAlerts } = useAlerts();
  const { isAdmin, isSuperAdmin } = useAuth();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeAlertsCount = (crowdAlerts || []).filter((a: any) => a.status !== "resolved").length;

  const NAV_SECTIONS = [
    {
      labelKey: "nav.core",
      items: [
        { nameKey: "nav.commandCenter", href: "/dashboard", icon: LayoutDashboard, show: true },
        { nameKey: "nav.venues", href: "/venues", icon: MapPin, show: isAdmin },
        { nameKey: "nav.liveMap", name: "Live Map", href: "/live-map", icon: Target, show: true },
        { nameKey: "nav.cameras", href: "/cameras", icon: Video, show: isAdmin },
        { nameKey: "nav.cameraHealth", href: "/cameras/health", icon: ShieldCheck, show: isAdmin },
      ].filter(i => i.show)
    },
    {
      labelKey: "nav.intelligence",
      items: [
        { nameKey: "nav.alerts", href: "/alerts", icon: BellRing, badgeKey: "alerts", show: true },
        { nameKey: "nav.prediction", href: "/prediction", icon: BrainCircuit, show: true },
        { nameKey: "nav.liveWall", href: "/monitor", icon: LayoutGrid, show: true },
        { nameKey: "nav.surgeMonitor", href: "/surge", icon: Activity, show: true },
        { nameKey: "nav.personWaitMonitor", href: "/person-wait-monitoring", icon: Clock, show: true },
        { nameKey: "nav.areaSurvey", href: "/dashboard/area-survey", icon: RotateCw, show: true },
      ].filter(i => i.show)
    },
    {
      labelKey: "nav.smartCity",
      label: "Smart City OS",
      items: [
        { nameKey: "nav.systemsHub", name: "Systems Hub", href: "/smart-systems", icon: Globe, show: true },
        { nameKey: "nav.smartParking", name: "Smart Parking", href: "/smart-parking", icon: Car, show: true },
        { nameKey: "nav.trafficControl", name: "Traffic Control", href: "/smart-traffic", icon: TrafficCone, show: isAdmin },
        { nameKey: "nav.incidentResponse", name: "Incident Response", href: "/smart-incidents", icon: ShieldAlert, show: isAdmin },
      ].filter(i => i.show)
    },
    {
      labelKey: "nav.aiSearch",
      items: [
        { nameKey: "nav.videoSearch", href: "/ai-search", icon: Search, show: isAdmin },
      ].filter(i => i.show)
    },
    {
      labelKey: "nav.analytics",
      items: [
        { nameKey: "nav.reports", href: "/reports", icon: FileBarChart, show: true },
        { nameKey: "nav.systemHealth", href: "/system", icon: Activity, show: isSuperAdmin },
      ].filter(i => i.show)
    },
    {
      labelKey: "nav.config",
      items: [
        { nameKey: "nav.profile", href: "/profile", icon: Settings, show: true },
        { nameKey: "nav.settings", href: "/settings", icon: Settings, show: isAdmin },
        { nameKey: "nav.accessControl", href: "/settings/access-control", icon: Users, show: isSuperAdmin },
        { nameKey: "nav.support", name: "Support", href: "/support", icon: MessageSquare, show: true },
      ].filter(i => i.show)
    },
    {
      labelKey: "nav.enterpriseAI",
      items: [
        { nameKey: "nav.automations", href: "/system/actions", icon: Webhook, show: isSuperAdmin },
        { nameKey: "nav.fleetHealth", href: "/system/fleet", icon: CircuitBoard, show: isSuperAdmin },
      ].filter(i => i.show)
    }
  ].filter(section => section.items.length > 0);

  return (
    <>
      {/* Mobile Backdrop */}
      {mounted && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-20 lg:hidden backdrop-blur-md"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-30 w-64 h-screen
        bg-[#000000]
        border-r border-white/5
        transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        flex flex-col shrink-0 overflow-hidden
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:hidden"}
      `}>

        {/* ── Brand Header ─────────────────────────── */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-white/5 shrink-0 relative overflow-hidden bg-[rgba(10,10,15,0.4)] backdrop-blur-3xl">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>

          <div className="flex items-center gap-4 z-10 w-full">
            <div className="relative flex items-center justify-center">
              {/* Outer Radar Sweep Animation */}
              <div className="absolute inset-[-4px] rounded-full border border-cyan-500/20 radar-sweep before:absolute before:inset-0 before:bg-[conic-gradient(from_0deg,transparent_75%,rgba(34,211,238,0.4)_100%)] before:rounded-full"></div>
              {/* Inner Box */}
              <div className="relative w-9 h-9 rounded-xl bg-cyan-950/50 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.3)] z-10 backdrop-blur-sm">
                <Target className="w-5 h-5 text-cyan-400" />
              </div>
            </div>

            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-white tracking-[0.2em] uppercase leading-none font-heading shadow-cyan-400/50 drop-shadow-md">
                Laminar
              </h1>
              <p className="text-[9px] text-cyan-400/80 tracking-[0.3em] uppercase mt-1 font-bold">{t("auto.AIPlatform_8627") || "AI Platform"}</p>
            </div>
          </div>

          <button
            className="lg:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors z-10 border border-white/10"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Navigation ───────────────────────────── */}
        <nav className="flex-1 py-6 px-4 overflow-y-auto custom-scrollbar space-y-8">
          {NAV_SECTIONS.map((section) => (
            <div key={section.labelKey}>
              <p className="px-3 mb-4 text-[10px] font-black text-slate-500/80 uppercase tracking-[0.25em]">
                {t(section.labelKey)}
              </p>
              <div className="space-y-2">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const badge = (item as any).badgeKey === "alerts" ? activeAlertsCount : 0;

                  return (
                    <Link
                      key={`${item.href}-${(item as any).nameKey || (item as any).name}`}
                      href={item.href}
                      onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                      className={`
                        group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 relative overflow-hidden
                        ${isActive
                          ? "bg-cyan-950/30 text-cyan-300 border border-cyan-500/30 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)]"
                          : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"
                        }
                      `}
                    >
                      {isActive && (
                        <>
                          {/* Active Indicator Bar */}
                          <div className="absolute left-0 top-2 bottom-2 w-[4px] bg-cyan-400 rounded-r-full shadow-[0_0_12px_rgba(34,211,238,1)]" />
                          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent pointer-events-none" />
                        </>
                      )}

                      <div className={`p-1.5 rounded-lg transition-colors relative z-10 ${isActive ? "bg-cyan-500/20 shadow-[0_0_10px_rgba(34,211,238,0.3)]" : "group-hover:bg-white/10"}`}>
                        <item.icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                      </div>

                      <span className="font-semibold text-sm flex-1 tracking-wider relative z-10">{(item as any).nameKey ? t((item as any).nameKey) : (item as any).name}</span>

                      {badge > 0 && (
                        <span className="relative z-10 flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-full bg-rose-500/20 border border-rose-500/50 text-rose-400 text-[10px] font-black shadow-[0_0_10px_rgba(244,63,94,0.4)] animate-pulse">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}

                      {isActive && !badge && (
                        <ChevronRight className="w-4 h-4 text-cyan-500/60 shrink-0 relative z-10" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Status Footer ─────────────────────────── */}
        <div className="p-5 border-t border-white/5 shrink-0 bg-[rgba(10,10,15,0.6)] backdrop-blur-xl relative">
          <div className="rounded-xl border border-white/5 bg-[#000000] px-4 py-3.5 overflow-hidden relative shadow-inner">
            <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent scan-line opacity-50" />

            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t("nav.system")}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400 tracking-wider uppercase">{t("nav.operational")}</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <p className="text-[10px] text-slate-500 font-mono font-bold hover:text-cyan-400 cursor-pointer transition-colors tracking-wider">{t("auto.v21_4017") || "v2.1"}</p>
                <p className="text-[9px] text-cyan-500 font-mono font-black tracking-[0.3em] mt-1 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">{t("auto.AIREADY_4174") || "AI-READY"}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
