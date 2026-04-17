"use client";

import AlertPanel from "@/components/alerts/alert-panel";
import { ShieldAlert, Search, Filter, History, Activity } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

export default function AlertsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 relative">

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 mt-4"
      >
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-[15px] animate-pulse" />
            <div className="p-3 bg-cyan-950/40 backdrop-blur-md border border-cyan-500/40 rounded-2xl relative z-10 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
              <ShieldAlert className="w-8 h-8 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black tracking-[0.08em] uppercase text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]">
                {t("alerts.title")}
              </h1>
              <span className="px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                LIVE
              </span>
            </div>
            <p className="text-sm font-bold text-slate-400 tracking-widest uppercase">
              {t("alerts.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 backdrop-blur-md mr-1">
            <button 
              onClick={() => setActiveTab("live")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === "live" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400 hover:text-white"}`}>
              <Activity className="w-4 h-4" /> Live
            </button>
            <button 
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === "history" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400 hover:text-white"}`}>
              <History className="w-4 h-4" /> History
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t("alerts.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 text-sm rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-cyan-500/60 transition-colors w-64 text-slate-200 placeholder:text-slate-600 backdrop-blur-md"
            />
          </div>
          <button className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:border-cyan-500/30 transition-all whitespace-nowrap backdrop-blur-md">
            <Filter className="w-4 h-4" /> {t("alerts.filter")}
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-panel border-white/10 rounded-3xl p-5 shadow-[inset_0_0_30px_rgba(255,255,255,0.01)]"
      >
        <AlertPanel filter={activeTab} />
      </motion.div>
    </div>
  );
}
