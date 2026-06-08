"use client";

import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import { useAlerts } from "@/hooks/useAlerts";
import { Menu, Bell, LogOut, Shield, Wifi, Zap, X, AlertOctagon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import LanguageSwitcher from "./language-switcher";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { NotificationBell } from "./NotificationBell";

export default function Navbar() {
  const { t } = useTranslation();

  const { user, logout } = useAuth();
  const { toggleSidebar } = useAppStore();
  const { data: alerts, crowdAlerts } = useAlerts();
  const [time, setTime] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const tick = () => {
      setTime(new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const activeAlertsCount = (crowdAlerts || []).filter((a: any) => a.status !== "resolved").length;
  const criticalCount = (crowdAlerts || []).filter((a: any) => a.risk_level === "critical" && a.status !== "resolved").length;

  const userDisplayName = user?.email ? user.email.split("@")[0] : "Admin";

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const handleLogoutClick = () => {
    setIsLogoutModalOpen(true);
  };

  const confirmLogout = () => {
    setIsLogoutModalOpen(false);
    logout();
  };

  const cancelLogout = () => {
    setIsLogoutModalOpen(false);
  };

  return (
    <header className="h-20 bg-[rgba(10,10,15,0.7)] backdrop-blur-3xl border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-[100] sticky top-0 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
      
      {/* Decorative Top Glow */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent pointer-events-none"></div>

      {/* Left: hamburger + live clock */}
      <div className="flex items-center gap-6">
        <button 
          onClick={toggleSidebar}
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-all duration-300 focus:outline-none border border-transparent hover:border-cyan-500/30"
          title={t("auto.ToggleSidebar_4486") || "Toggle Sidebar"}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* System clock / Status */}
        <div className="hidden lg:flex items-center gap-3 font-mono text-xs font-bold px-4 py-2 rounded-xl bg-black/50 border border-white/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]">
          <div className="relative flex h-3 w-3 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]"></span>
          </div>
          <span className="text-emerald-400 tracking-[0.2em] font-black uppercase">{t("auto.LiveLink_9234") || "Live Link"}</span>
          <span className="text-white/20 font-normal">/</span>
          <span className="text-cyan-100 tracking-[0.1em]">{mounted ? time : "--:--:--"}</span>
        </div>
      </div>

      {/* Center: Brand name (Hidden on mobile) */}
      <div className="hidden lg:flex items-center gap-3 text-sm font-black tracking-[0.3em] text-cyan-500/50 uppercase select-none relative group">
        <div className="absolute -inset-4 bg-cyan-500/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="relative p-1.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
          <Zap className="w-4 h-4 text-cyan-400 pulse-glow" />
        </div>
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-300 to-slate-500 group-hover:from-cyan-100 group-hover:to-cyan-400 transition-all duration-500">
          {t("auto.GlobalOperation_9415") || "Global Operations"}
        </span>
      </div>

      {/* Right: language switcher + alerts + user */}
      <div className="flex items-center gap-4">

        {/* 🌐 Language Switcher */}
        <div className="relative z-[110] flex items-center gap-2">
          <LanguageSwitcher />
        </div>

        <div className="h-8 w-px bg-white/10 mx-1 rounded-full" />

        {/* Tactical Mesh Notification Bell */}
        <NotificationBell />

        {/* Crowd Alert Bell (links to /alerts) */}
        <Link href="/alerts" className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all duration-300 group border border-transparent hover:border-white/20" title={t("auto.CrowdAlerts_5587") || "Crowd Alerts"}>
          <Shield className={`w-5 h-5 transition-colors ${activeAlertsCount > 0 ? "text-rose-400 group-hover:text-rose-300" : "group-hover:text-cyan-400"}`} />
          {activeAlertsCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[24px] h-[24px] flex items-center justify-center rounded-full bg-rose-500 text-[11px] font-black text-white border-[3px] border-[#000000] shadow-[0_0_15px_rgba(244,63,94,0.8)]">
              {activeAlertsCount > 99 ? "99+" : activeAlertsCount}
            </span>
          )}
        </Link>

        {/* Critical warning pill */}
        {criticalCount > 0 && (
          <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-950/40 border border-rose-500/50 text-xs text-rose-400 font-black tracking-wider uppercase shadow-[0_0_20px_rgba(244,63,94,0.2)]">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,1)]" />
            {criticalCount} Critical
          </div>
        )}

        <div className="h-8 w-px bg-white/10 mx-1 rounded-full" />

        {/* User pill */}
        <Link href="/profile" className="flex items-center gap-3 bg-black/40 border border-white/10 py-1.5 px-2 rounded-full hover:border-cyan-500/50 hover:bg-cyan-950/20 transition-all cursor-pointer group shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]">
          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 shadow-[0_0_15px_rgba(34,211,238,0.4)] group-hover:scale-105 transition-transform border-2 border-cyan-500/30">
            {user?.profile_picture ? (
              <img
                src={user.profile_picture.startsWith('http') ? user.profile_picture : `${(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/v1$/, '')}${user.profile_picture}`}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent) {
                    parent.classList.add("bg-gradient-to-br", "from-cyan-400", "to-indigo-600", "flex", "items-center", "justify-center", "text-[12px]", "font-black", "text-black", "uppercase");
                    parent.textContent = userDisplayName.charAt(0);
                  }
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-[12px] font-black text-black uppercase">
                {userDisplayName.charAt(0)}
              </div>
            )}
          </div>
          <span className="text-sm font-bold tracking-wide text-slate-300 group-hover:text-cyan-100 transition-colors hidden sm:block max-w-[120px] truncate pr-3">
            {userDisplayName}
          </span>
        </Link>

        {/* Logout */}
        <button 
          onClick={handleLogoutClick}
          className="p-2.5 ml-1 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-all duration-300 border border-transparent hover:border-rose-500/30"
          title={t("auto.Signout_6150") || "Sign out"}
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Premium Centered Logout Modal */}
      {mounted && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isLogoutModalOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9998] pointer-events-auto"
                onClick={cancelLogout}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.90, x: "-50%", y: "-40%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.90, x: "-50%", y: "-40%" }}
                transition={{ type: "spring", duration: 0.5, bounce: 0.4 }}
                className="fixed top-1/2 left-1/2 w-[90%] max-w-md bg-gradient-to-b from-[#11111a] to-[#0a0a0f] border-2 border-white/10 rounded-3xl shadow-[0_0_80px_rgba(244,63,94,0.15)] overflow-hidden z-[9999] pointer-events-auto flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(244,63,94,0.08)_0%,transparent_70%)] pointer-events-none" />
                
                <div className="relative z-10 flex flex-col items-center w-full">
                  <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
                    <AlertOctagon className="w-8 h-8 text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
                  </div>
                  
                  <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em] font-heading mb-3 drop-shadow-md">
                    {t("auto.TerminateSessio_4291") || "Terminate Session"}
                  </h3>
                  
                  <p className="text-sm font-medium text-slate-300 leading-relaxed mb-8 max-w-[280px]">
                    {t("auto.Securelydisconn_7319") || "Securely disconnect from the Laminar AI Platform? Active monitoring alerts will pause."}
                  </p>
                  
                  <div className="flex w-full gap-4 mt-2">
                    <button
                      onClick={cancelLogout}
                      className="flex-1 py-3.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm font-bold uppercase tracking-[0.15em] transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] focus:ring-2 ring-white/20 outline-none"
                    >
                      {t("auto.Cancel_9092") || "Cancel"}
                    </button>
                    <button
                      onClick={confirmLogout}
                      className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 border border-rose-400/50 text-white text-sm font-black uppercase tracking-[0.15em] shadow-[0_0_20px_rgba(244,63,94,0.5)] hover:shadow-[0_0_30px_rgba(244,63,94,0.8)] transition-all flex items-center justify-center gap-2 focus:ring-2 ring-rose-500/50 outline-none"
                    >
                      <LogOut className="w-5 h-5 drop-shadow-md" />
                      {t("auto.SignOut_5123") || "Sign Out"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>, 
        document.body
      )}
    </header>
  );
}
