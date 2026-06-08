"use client";

import { motion } from "framer-motion";
import { Camera, Zap, BarChart2, AlertTriangle, Map, FileText, UserCheck, Settings, Shield, Activity, Radio, Droplets, Globe, CheckCircle } from "lucide-react";

const sections = [
  {
    icon: <Shield size={20} />,
    color: "blue",
    title: "Guardian Route",
    desc: "AI Protection Network with autonomous threat tracking and dynamic safety routing.",
  },
  {
    icon: <Activity size={20} />,
    color: "red",
    title: "Kinetic SOS",
    desc: "Zero-shot behavioral threat analysis that detects panic and distress gestures instantly.",
  },
  {
    icon: <Radio size={20} />,
    color: "purple",
    title: "Resonance Engine",
    desc: "Eulerian Structural Analysis. Predicts structural failure via micro-vibrations.",
  },
  {
    icon: <Droplets size={20} />,
    color: "blueLight",
    title: "Liquid Threat",
    desc: "Urban Flood Intelligence with autonomous route intervention and water segmentation.",
  },
  {
    icon: <Globe size={20} />,
    color: "yellow",
    title: "AI Green Wave",
    desc: "Autonomous emergency traffic intelligence. Clears roads before emergency vehicles arrive.",
  },
  {
    icon: <Map size={20} />,
    color: "indigo",
    title: "4D Spatial Engine",
    desc: "Visualizes real-time structural load, crowd density, and flow in immersive 3D space.",
  },
  {
    icon: <Zap size={20} />,
    color: "blueDark",
    title: "AEGIS Protocol",
    desc: "Autonomous Emergency Guidance System orchestrating drones and civilians for medical events.",
  },
  {
    icon: <CheckCircle size={20} />,
    color: "slate",
    title: "Liability Defense",
    desc: "Immutable incident documentation, automated audits, and enterprise risk intelligence.",
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
