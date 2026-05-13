"use client";

import { motion } from "framer-motion";
import { Camera, Zap, BarChart2, AlertTriangle, Map, FileText, UserCheck, Settings } from "lucide-react";

const sections = [
  {
    icon: <Camera size={20} />,
    color: "blue",
    title: "Monitoring",
    desc: "View live camera feeds, track individuals, and observe real-time activity across zones.",
  },
  {
    icon: <Zap size={20} />,
    color: "yellow",
    title: "Surge Monitor",
    desc: "Detect abnormal movement patterns like sudden rush, panic, or instability using velocity analysis.",
  },
  {
    icon: <BarChart2 size={20} />,
    color: "blueLight",
    title: "Prediction Engine",
    desc: "Forecast crowd risk based on current trends and identify potential congestion pre-emptively.",
  },
  {
    icon: <AlertTriangle size={20} />,
    color: "red",
    title: "Alerts Center",
    desc: "Receive real-time alerts with clear reasons, risk levels, and recommended actions.",
  },
  {
    icon: <Map size={20} />,
    color: "indigo",
    title: "Command Map",
    desc: "Monitor multiple locations and camera nodes in a centralized geographical view.",
  },
  {
    icon: <FileText size={20} />,
    color: "purple",
    title: "Reports",
    desc: "Generate AI-powered reports with insights on crowd behavior and system performance.",
  },
  {
    icon: <UserCheck size={20} />,
    color: "blueDark",
    title: "Tracking (Re-ID)",
    desc: "Track individuals across cameras and analyze movement paths without duplication.",
  },
  {
    icon: <Settings size={20} />,
    color: "slate",
    title: "Settings",
    desc: "Configure thresholds, manage users, and control system behavior boundaries.",
  },
];

const colorMap: Record<string, string> = {
  blue: "text-blue-400 group-hover:text-blue-300",
  yellow: "text-yellow-400 group-hover:text-yellow-300",
  blueLight: "text-blue-200 group-hover:text-blue-100",
  red: "text-red-400 group-hover:text-red-300",
  indigo: "text-indigo-400 group-hover:text-indigo-300",
  purple: "text-purple-400 group-hover:text-purple-300",
  blueDark: "text-blue-600 group-hover:text-blue-500",
  slate: "text-slate-400 group-hover:text-slate-300",
};

const bgMap: Record<string, string> = {
  blue: "group-hover:bg-blue-500/10",
  yellow: "group-hover:bg-yellow-500/10",
  blueLight: "group-hover:bg-blue-300/10",
  red: "group-hover:bg-red-500/10",
  indigo: "group-hover:bg-indigo-500/10",
  purple: "group-hover:bg-purple-500/10",
  blueDark: "group-hover:bg-blue-700/10",
  slate: "group-hover:bg-slate-500/10",
};

export default function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8 mb-16">
      {sections.map((sec, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 + 0.2 }}
          whileHover={{ y: -4, scale: 1.02 }}
          className="group relative bg-[#0a0f23]/40 border border-white/5 hover:border-blue-500/30 transition-all duration-300 rounded-2xl p-6 flex flex-col gap-4 backdrop-blur-xl shadow-lg ring-1 ring-white/10"
        >
          {/* Subtle Hover Glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />

          <div className="flex items-center gap-4 relative z-10">
            <div className={`p-2.5 bg-white/5 rounded-xl transition-colors duration-300 ${colorMap[sec.color]} ${bgMap[sec.color]}`}>
              <motion.div
                whileHover={{ rotate: 15, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                {sec.icon}
              </motion.div>
            </div>
            <h3 className="text-[0.8rem] font-black tracking-[0.1em] uppercase text-white group-hover:text-blue-400 transition-colors">
              {sec.title}
            </h3>
          </div>
          <p className="text-[0.75rem] text-slate-400 font-medium leading-relaxed group-hover:text-slate-300 transition-colors relative z-10">
            {sec.desc}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
