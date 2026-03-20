"use client";

import { Activity, Camera, AlertTriangle, Map, Users } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

interface StatConfig {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  accentColor: string;
  glowColor: string;
  isDanger?: boolean;
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 15 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } }
}

function StatCard({ label, value, subtext, icon, accentColor, glowColor, isDanger }: StatConfig) {
  return (
    <motion.div 
      variants={itemVariants}
      className={`
        group relative overflow-hidden rounded-2xl transition-all duration-400
        glass-panel
        hover:shadow-[0_10px_40px_rgba(0,0,0,0.8)] cursor-default
        border-t border-l border-white/5 border-r-transparent border-b-transparent
      `}
      style={{
        boxShadow: `inset 0 0 20px ${glowColor}05`,
      }}
    >
      {/* Dynamic Animated Border on Hover */}
      <div 
        className="absolute inset-x-0 top-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-20"
        style={{ background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)` }}
      />
      
      {/* Ambient glow orb inside */}
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[50px] opacity-30 group-hover:opacity-70 transition-opacity duration-700 pointer-events-none z-0"
        style={{ background: glowColor }}
      />

      {/* Content wrapper */}
      <div className="relative z-10 p-5">
        
        {/* Top row */}
        <div className="flex items-start justify-between mb-4">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{label}</p>
          <div
            className="p-2 rounded-xl backdrop-blur-md transition-all duration-500 border border-white/5 group-hover:scale-110 shadow-inner"
            style={{
              background: `${glowColor}15`,
              color: accentColor,
              boxShadow: `0 0 15px ${glowColor}30 inset`
            }}
          >
            {icon}
          </div>
        </div>

        {/* Value */}
        <div className="flex items-end gap-2 mt-2">
          <span
            className="text-4xl font-black font-heading tracking-tight leading-none drop-shadow-md group-hover:drop-shadow-[0_0_15px_color-mix(in_srgb,currentColor_50%,transparent)] transition-all duration-500"
            style={{ color: isDanger ? "#f43f5e" : "#ffffff" }}
          >
            {value}
          </span>
        </div>

        {subtext && (
          <p className="text-[11px] text-slate-400 mt-3 font-medium tracking-wide flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${glowColor}` }}></span>
            {subtext}
          </p>
        )}
      </div>

      {/* Scanline Effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent scan-line pointer-events-none mix-blend-overlay"></div>
    </motion.div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

export default function DashboardStats() {
  const { data, isLoading } = useDashboardStats();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5 mb-10 mt-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 glass-panel rounded-2xl animate-pulse relative overflow-hidden" />
        ))}
      </div>
    );
  }

  const venues = data?.venues ?? 0;
  const cameras = data?.cameras ?? 0;
  const activeCameras = data?.active_cameras ?? cameras;
  const activeAlerts = data?.alerts ?? 0;
  const totalCapacity = data?.totalCapacity ?? 0;
  const systemStatus = typeof data?.systemHealth === "object"
    ? (data?.systemHealth?.status ?? "Unknown")
    : (data?.systemHealth ?? "Unknown");
  const isHealthy = systemStatus === "Healthy";

  const stats: StatConfig[] = [
    {
      label: t("stats.activeVenues") || "Active Nodes",
      value: venues,
      subtext: `${venues} ${venues !== 1 ? t("stats.locationsTracked") || "Locations Tracked" : t("stats.locationTracked") || "Location"}`,
      icon: <Map className="w-5 h-5" />,
      accentColor: "#22d3ee",
      glowColor: "#22d3ee",
    },
    {
      label: t("stats.camerasOnline") || "Sensors Online",
      value: `${activeCameras}/${cameras}`,
      subtext: cameras > 0 ? `${Math.round((activeCameras / cameras) * 100)}% ${t("stats.uptime") || "Uptime"}` : t("stats.noCameras") || "No Sensors",
      icon: <Camera className="w-5 h-5" />,
      accentColor: "#3b82f6",
      glowColor: "#3b82f6",
    },
    {
      label: t("stats.activeAlerts") || "Critical Alerts",
      value: activeAlerts,
      subtext: activeAlerts === 0 ? t("stats.allClear") || "All Clear" : `${activeAlerts} ${t("stats.pendingReview") || "Pending Review"}`,
      icon: <AlertTriangle className="w-5 h-5" />,
      accentColor: activeAlerts > 0 ? "#f43f5e" : "#10b981",
      glowColor: activeAlerts > 0 ? "#f43f5e" : "#10b981",
      isDanger: activeAlerts > 0,
    },
    {
      label: t("stats.systemStatus") || "Network Core",
      value: systemStatus,
      subtext: isHealthy ? t("stats.allServicesRunning") || "Optimal Efficiency" : t("stats.checkSystemHealth") || "Degraded State",
      icon: <Activity className="w-5 h-5" />,
      accentColor: isHealthy ? "#10b981" : "#f59e0b",
      glowColor: isHealthy ? "#10b981" : "#f59e0b",
    },
    {
      label: t("stats.totalCapacity") || "Global Capacity",
      value: totalCapacity.toLocaleString(),
      subtext: t("stats.acrossAllVenues") || "Aggregated Volume",
      icon: <Users className="w-5 h-5" />,
      accentColor: "#8b5cf6",
      glowColor: "#8b5cf6",
    },
  ];

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 lg:grid-cols-5 gap-5 mb-10 mt-6"
    >
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </motion.div>
  );
}