"use client";
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { Shield, Eye, Brain, Activity, TrendingUp, ShieldAlert, Bell, Zap, Users, MapPin, Building2, Plane, GraduationCap, ChevronDown, ChevronRight, CheckCircle, ArrowRight, Cpu, Globe, Lock, BarChart3, Radio, Target } from "lucide-react";
import TrueFocus from "@/components/ui/TrueFocus";
import { useTranslation } from "react-i18next";

/* ─── reveal helper ─── */
export function Reveal({ children, delay = 0, y = 32 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const { t } = useTranslation();
return (
    <motion.div initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

/* ─── Section label ─── */
export function SectionLabel({ children, color = "#22d3ee" }: { children: React.ReactNode; color?: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "6px 18px", borderRadius: 999, border: `1px solid ${color}25`, background: `${color}0d`, marginBottom: 24, backdropFilter: "blur(16px)" }}>
      <motion.div animate={{ scale: [1, 1.6, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.8, repeat: Infinity }} style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
      <span style={{ fontSize: "0.58rem", fontWeight: 800, color, letterSpacing: "0.22em", textTransform: "uppercase" }}>{children}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════
   SECTION 2 — LIVE AI DASHBOARD PREVIEW
══════════════════════════════════════════════ */
const dashStats = [
  { label: "Live Cameras", value: "48", unit: "feeds", color: "#22d3ee", icon: <Eye size={14} /> },
  { label: "People Detected", value: "2,847", unit: "today", color: "#10b981", icon: <Users size={14} /> },
  { label: "Active Alerts", value: "3", unit: "critical", color: "#f43f5e", icon: <ShieldAlert size={14} /> },
  { label: "Threat Score", value: "0.12", unit: "low risk", color: "#a78bfa", icon: <Target size={14} /> },
  { label: "Zone Occupancy", value: "74%", unit: "zone A", color: "#f59e0b", icon: <MapPin size={14} /> },
  { label: "ReID Matches", value: "189", unit: "this hour", color: "#38bdf8", icon: <Cpu size={14} /> },
];

export function LiveCounter({ target, duration = 2000 }: { target: number; duration?: number }) {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      start = Math.min(start + step, target);
      setCount(Math.floor(start));
      if (start >= target) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return <>{count.toLocaleString()}</>;
}

function AlertBadge({ text, color }: { text: string; color: string }) {
  const { t } = useTranslation();
  return (
    <motion.div animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.6, repeat: Infinity }}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: `${color}12`, border: `1px solid ${color}30` }}>
      <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ width: 5, height: 5, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontSize: "0.58rem", color, fontWeight: 600 }}>{text}</span>
    </motion.div>
  );
}

/* ─── AI Camera Feed Simulation ─── */
function AICameraFeed({ color = "#22d3ee" }: { color?: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#02040a", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Simulation Background — inline noise to avoid external 404 */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.1, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")", pointerEvents: "none" }} />
      
      {/* Scanline Effect */}
      <motion.div 
        animate={{ y: ["0%", "100%"] }} 
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        style={{ position: "absolute", left: 0, right: 0, height: "1px", background: `linear-gradient(90deg,transparent,${color},transparent)`, zIndex: 1, pointerEvents: "none", opacity: 0.4 }}
      />

      {/* Grid Pattern */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${color}15 1px, transparent 0)`, backgroundSize: "24px 24px", opacity: 0.2 }} />

      {/* Advanced Scanning Visuals (No Rectangles) */}
      <div style={{ position: "absolute", inset: 0, padding: 20 }}>
        {/* Scanning Vertex 1 */}
        <motion.div
          animate={{ x: [20, 160, 20], y: [40, 140, 40] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute" }}
        >
          <div style={{ position: "relative" }}>
            <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }} style={{ width: 40, height: 40, borderRadius: "50%", background: `${color}15`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 4, height: 4, borderRadius: "50%", background: color }} />
            <div style={{ position: "absolute", top: -20, left: 0, color, fontSize: "0.5rem", fontWeight: 900, whiteSpace: "nowrap", letterSpacing: "0.15em" }}>ID_PRSN [X-902]</div>
          </div>
        </motion.div>

        {/* Scanning Vertex 2 */}
        <motion.div
          animate={{ x: [220, 80, 220], y: [100, 20, 100] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          style={{ position: "absolute" }}
        >
          <div style={{ position: "relative" }}>
            <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2.5, repeat: Infinity }} style={{ width: 30, height: 30, borderRadius: "50%", background: `${color}12`, border: `1px solid ${color}20`, display: "flex", alignItems: "center", justifyContent: "center" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 3, height: 3, borderRadius: "50%", background: color }} />
            <div style={{ position: "absolute", bottom: -20, left: 0, color, fontSize: "0.5rem", fontWeight: 900, whiteSpace: "nowrap", letterSpacing: "0.15em" }}>ID_OBJ [O-771]</div>
          </div>
        </motion.div>

        {/* Dynamic Vector Lines */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.4 }}>
          <motion.line
            animate={{ x1: [40, 180, 40], y1: [60, 160, 60], x2: [200, 50, 200], y2: [120, 40, 120] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            stroke={color} strokeWidth="1" strokeDasharray="6 6"
          />
        </svg>

        {/* Global HUD elements */}
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ color, fontSize: "0.5rem", fontWeight: 900, letterSpacing: "0.2em", opacity: 0.8 }}>SYSTEM_MODE: SCAN</div>
          <div style={{ color: "#fff", fontSize: "0.45rem", fontWeight: 700 }}>CAM_01 // LIVE_STREAM</div>
        </div>
        
        <div style={{ position: "absolute", bottom: 16, left: 16, borderLeft: `2px solid ${color}`, paddingLeft: 8 }}>
          <div style={{ color, fontSize: "0.5rem", fontWeight: 900, letterSpacing: "0.1em", marginBottom: 2 }}>SYNC_0.02ms</div>
          <motion.div animate={{ scaleX: [0, 1, 0] }} transition={{ duration: 4, repeat: Infinity }} style={{ height: 2, width: 80, background: color, transformOrigin: "left" }} />
        </div>
      </div>
    </div>
  );
}

export function DashboardPreview() {
  const { t } = useTranslation();

  const [activeZone, setActiveZone] = useState(0);
  const zones = ["Zone A — Main Entrance", "Zone B — Corridor", "Zone C — Parking", "Zone D — Restricted"];
  const zoneColors = ["#22d3ee", "#10b981", "#f59e0b", "#f43f5e"];

  return (
    <section id="solutions" style={{ padding: "120px 24px", maxWidth: 1320, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <Reveal><SectionLabel color="#22d3ee">{t("auto.LiveIntelligenc_4760") || "Live Intelligence Dashboard"}</SectionLabel></Reveal>
        <Reveal delay={0.08}>
          <div style={{ fontSize: "clamp(36px,6vw,64px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.05em", lineHeight: 1.0, marginBottom: 24, display: "flex", justifyContent: "center" }}>
            <TrueFocus
              sentence="See Everything. Miss Nothing."
              manualMode={false}
              blurAmount={10}
              borderColor="#22d3ee"
              glowColor="rgba(34,211,238,0.6)"
              animationDuration={0.8}
              pauseBetweenAnimations={1.5}
            />
          </div>
        </Reveal>
        <Reveal delay={0.14}><p style={{ color: "#94a3b8", fontSize: "1.15rem", maxWidth: 600, margin: "0 auto", lineHeight: 1.7, fontWeight: 500 }}>A unified command interface giving security teams real-time omniscience across every monitored zone — on any device, anywhere.</p></Reveal>
      </div>

      <Reveal delay={0.1}>
        <div style={{ 
            background: "linear-gradient(165deg,rgba(10,15,35,0.94),rgba(5,7,20,0.98))", 
            border: "1px solid rgba(255,255,255,0.08)", 
            borderRadius: 40, 
            padding: 48, 
            backdropFilter: "blur(16px) saturate(240%)", 
            boxShadow: "0 60px 140px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.05)", 
            position: "relative", 
            overflow: "hidden" 
        }}>
          {/* Top accent glow */}
          <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: "linear-gradient(90deg,transparent,rgba(34,211,238,0.4),transparent)" }} />

          {/* Stat cards row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 32 }}>
            {dashStats.map((s, i) => (
              <motion.div key={i} whileHover={{ y: -5, borderColor: `${s.color}60`, background: "rgba(255,255,255,0.03)" }}
                style={{ padding: "20px 24px", borderRadius: 20, background: "rgba(255,255,255,0.015)", border: `1px solid ${s.color}20`, position: "relative", overflow: "hidden", cursor: "default", transition: "all 0.4s ease" }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: 70, height: 70, background: `radial-gradient(circle at top right,${s.color}15,transparent 70%)` }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, color: s.color }}>
                  <span style={{ opacity: 0.8 }}>{s.icon}</span>
                  <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em" }}>{s.label}</span>
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>{s.value}</div>
                <div style={{ fontSize: "0.6rem", color: "#64748b", marginTop: 4, fontWeight: 700 }}>{s.unit}</div>
                <motion.div animate={{ scaleX: [0, 1, 0] }} transition={{ duration: 4 + i * 0.5, repeat: Infinity, ease: "easeInOut" }}
                  style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.color},transparent)` }} />
              </motion.div>
            ))}
          </div>

          {/* Dashboard content grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            {/* Left Col: Zone Stats & Mini Charts */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 24, padding: 24, border: "1px solid rgba(255,255,255,0.05)", height: "100%" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {zones.map((z, i) => (
                    <motion.button key={i} onClick={() => setActiveZone(i)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${activeZone === i ? zoneColors[i] : "rgba(255,255,255,0.06)"}`, background: activeZone === i ? `${zoneColors[i]}20` : "rgba(255,255,255,0.02)", color: activeZone === i ? zoneColors[i] : "#64748b", fontSize: "0.58rem", fontWeight: 800, cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.3s" }}>
                      {z.split("—")[0].trim()}
                    </motion.button>
                  ))}
                </div>
                <AnimatePresence mode="wait">
                  <motion.div key={activeZone} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                    <div style={{ color: "#fff", fontWeight: 800, fontSize: "0.95rem", marginBottom: 12, letterSpacing: "-0.01em" }}>{zones[activeZone]}</div>
                    <div style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${[74, 45, 92, 18][activeZone]}%` }} transition={{ duration: 1.2, ease: "easeOut" }}
                        style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg,${zoneColors[activeZone]},${zoneColors[activeZone]}80)` }} />
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#94a3b8", display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                      <span>{t("auto.OccupancyEffici_2841") || "Occupancy Efficiency"}</span>
                      <span style={{ color: zoneColors[activeZone], fontWeight: 800 }}>{[74, 45, 92, 18][activeZone]}%</span>
                    </div>
                    {/* Activity Chart */}
                    <div style={{ position: "relative", height: 100, width: "100%" }}>
                       <svg viewBox="0 0 200 60" style={{ width: "100%", height: "100%" }}>
                        <defs>
                          <linearGradient id={`grad${activeZone}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={zoneColors[activeZone]} stopOpacity="0.4" />
                            <stop offset="100%" stopColor={zoneColors[activeZone]} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <motion.path
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 2, ease: "easeInOut" }}
                          d="M0,45 Q20,40 40,30 T80,35 T120,15 T160,25 L200,10"
                          fill="none"
                          stroke={zoneColors[activeZone]}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M0,45 Q20,40 40,30 T80,35 T120,15 T160,25 L200,10 L200,60 L0,60 Z"
                          fill={`url(#grad${activeZone})`}
                        />
                      </svg>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Middle Col: Feed & Alerts */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 24, padding: 24, border: "1px solid rgba(255,255,255,0.05)", height: "260px" }}>
                 <AICameraFeed color={zoneColors[activeZone]} />
              </div>
              
              <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 24, padding: 24, border: "1px solid rgba(244,63,94,0.1)", flex: 1 }}>
                <div style={{ color: "#f43f5e", fontSize: "0.65rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                  <motion.div animate={{ scale: [1,1.5,1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.8, repeat: Infinity }} style={{ width: 8, height: 8, borderRadius: "50%", background: "#f43f5e", boxShadow: "0 0 10px #f43f5e" }} /> {t("auto.LIVEINTELLIGENC_2836") || "LIVE INTELLIGENCE FEED"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { msg: "Loitering detected — Zone C", color: "#f59e0b", time: "5s ago" },
                    { msg: "Crowd surge — Main Entrance", color: "#f43f5e", time: "18s ago" },
                    { msg: "ReID match — Suspect #A112", color: "#a78bfa", time: "42s ago" },
                    { msg: "Zone D breach attempted", color: "#f43f5e", time: "1m ago" },
                    { msg: "Visitor peak — 340/hr", color: "#22d3ee", time: "2m ago" },
                  ].map((a, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: a.color, boxShadow: `0 0 8px ${a.color}`, flexShrink: 0 }} />
                        <span style={{ fontSize: "0.7rem", color: "#e2e8f0", fontWeight: 700 }}>{a.msg}</span>
                      </div>
                      <span style={{ fontSize: "0.55rem", color: "#475569", fontWeight: 800 }}>{a.time}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>


            {/* Right Col: Advanced Analytics */}
            <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 24, padding: 24, border: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: 20 }}>
               <div style={{ color: "#fff", fontSize: "0.65rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", display: "flex", alignItems: "center", gap: 8 }}>
                  <TrendingUp size={14} color="#10b981" /> {t("auto.REALTIMEANALYTI_8897") || "REAL-TIME ANALYTICS"}
               </div>
               
               {/* Mini charts or data points */}
               <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                 {[
                   { l: "Detection Accuracy", v: "99.8%", c: "#10b981" },
                   { l: "Processing Latency", v: "14ms", c: "#22d3ee" },
                   { l: "Active Feeds", v: "48/48", c: "#22d3ee" },
                   { l: "Node Health", v: "STABLE", c: "#10b981" }
                 ].map((d, i) => (
                   <div key={i} style={{ padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.6rem", color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>{d.l}</span>
                      <span style={{ fontSize: "0.75rem", color: d.c, fontWeight: 900 }}>{d.v}</span>
                   </div>
                 ))}
               </div>

               <div style={{ flex: 1, position: "relative", minHeight: 120, background: "rgba(34,211,238,0.03)", borderRadius: 16, border: "1px dotted rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    style={{ position: "absolute", width: "150%", height: "150%", background: "conic-gradient(from 180deg at 50% 50%, transparent 0%, rgba(34,211,238,0.05) 50%, transparent 100%)" }}
                  />
                  <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#fff" }}>0.01s</div>
                    <div style={{ fontSize: "0.5rem", color: "#22d3ee", fontWeight: 800 }}>{t("auto.INFERENCEGAP_2441") || "INFERENCE GAP"}</div>
                  </div>
               </div>
            </div>

          </div>

          {/* Bottom Explore Button */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
            <motion.button whileHover={{ scale: 1.05, background: "rgba(34,211,238,0.15)" }} whileTap={{ scale: 0.95 }}
              style={{ padding: "14px 32px", borderRadius: 999, border: "1px solid rgba(34,211,238,0.3)", background: "rgba(34,211,238,0.05)", color: "#22d3ee", fontWeight: 800, fontSize: "0.75rem", letterSpacing: "0.12em", cursor: "pointer", transition: "all 0.3s" }}>
              {t("auto.EXPLOREFULLDASH_3723") || "EXPLORE FULL DASHBOARD"}
            </motion.button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}


/* ══════════════════════════════════════════════
   SECTION 3 — FEATURE CARDS
══════════════════════════════════════════════ */
const featureCards = [
  { icon: <Eye size={20} />, title: "Real-Time Detection", desc: "Hardware-accelerated YOLO models perform sub-100ms detection and tracking with 98%+ accuracy across any camera feed.", color: "#22d3ee", rgb: "34,211,238" },
  { icon: <Cpu size={20} />, title: "Re-Identification", desc: "Cross-camera person tracking using deep metric learning — follow individuals across your entire venue seamlessly.", color: "#3b82f6", rgb: "59,130,246" },
  { icon: <Users size={20} />, title: "Crowd Intelligence", desc: "Real-time density maps, flow vectors, and anomaly triggers that evolve with crowd dynamics in sub-second intervals.", color: "#a78bfa", rgb: "167,139,250" },
  { icon: <BarChart3 size={20} />, title: "Heatmap Analytics", desc: "Spatial occupancy heatmaps revealing traffic patterns, dwell clusters, and blind spots across every monitored zone.", color: "#10b981", rgb: "16,185,129" },
  { icon: <Bell size={20} />, title: "Smart Alerts", desc: "Multi-channel alert dispatch — WebSocket, SMS, email — with configurable thresholds and escalation chains.", color: "#f59e0b", rgb: "245,158,11" },
  { icon: <Globe size={20} />, title: "Admin Dashboard", desc: "Mission-control UI with live feeds, analytics, role-based access, and SLA compliance tracking built for enterprise.", color: "#38bdf8", rgb: "56,189,248" },
  { icon: <TrendingUp size={20} />, title: "Predictive Monitoring", desc: "LSTM models forecasting crowd surges 60 minutes ahead with 94% accuracy, enabling pre-emptive intervention.", color: "#f43f5e", rgb: "244,63,94" },
  { icon: <Lock size={20} />, title: "Security Insights", desc: "Behavioral anomaly scoring, perimeter breach detection, and zero-trust access logging in one unified interface.", color: "#22d3ee", rgb: "34,211,238" },
];

export function FeaturesSection() {
  const { t } = useTranslation();
  const primaryFeatures = featureCards.slice(0, 3);
  const secondaryFeatures = featureCards.slice(3, 8);

  return (
    <section id="features" style={{ padding: "120px 24px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 72 }}>
        <Reveal><SectionLabel color="#a78bfa">{t("auto.CoreCapabilitie_3512") || "Core Capabilities"}</SectionLabel></Reveal>
        <Reveal delay={0.08}><h2 style={{ fontSize: "clamp(32px,5vw,56px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", marginBottom: 20 }}>
          {t("auto.Everythingyoune_4534") || "Everything you need."} <span style={{ background: "linear-gradient(135deg,#a78bfa,#38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{t("auto.Intelligenceyou_7329") || "Intelligence you trust."}</span>
        </h2></Reveal>
        <Reveal delay={0.14}><p style={{ color: "#94a3b8", fontSize: "1.1rem", maxWidth: 540, margin: "0 auto", fontWeight: 500 }}>{t("auto.Eightdimensions_1981") || "Eight dimensions of AI-native security, unified in a single high-performance platform."}</p></Reveal>
      </div>

      {/* Primary Feature Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, marginBottom: 32 }}>
        {primaryFeatures.map((f, i) => (
          <Reveal key={i} delay={i * 0.1}>
            <motion.div whileHover={{ y: -8, borderColor: `rgba(${f.rgb},0.4)`, boxShadow: `0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(${f.rgb},0.2)` }}
              style={{ padding: "56px 40px", borderRadius: 36, background: "rgba(1,4,16,0.6)", border: `1px solid rgba(255,255,255,0.05)`, backdropFilter: "blur(16px) saturate(200%)", position: "relative", overflow: "hidden", height: "100%", transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)", cursor: "default" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at top right,rgba(${f.rgb},0.1),transparent 70%)` }} />
              
              <motion.div whileHover={{ scale: 1.1, rotate: 6 }}
                style={{ width: 52, height: 52, borderRadius: 14, background: `rgba(${f.rgb},0.08)`, border: `1px solid rgba(${f.rgb},0.2)`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 36, color: f.color }}>
                {React.cloneElement(f.icon as React.ReactElement<any>, { size: 22, strokeWidth: 2.5 })}
              </motion.div>
              <h3 style={{ color: "#fff", fontWeight: 800, fontSize: "1.25rem", marginBottom: 16, letterSpacing: "-0.01em" }}>{f.title}</h3>
              <p style={{ color: "#64748b", fontSize: "0.92rem", lineHeight: 1.8, fontWeight: 500 }}>{f.desc}</p>
            </motion.div>
          </Reveal>
        ))}
      </div>

      {/* Secondary Feature Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
        {secondaryFeatures.map((f, i) => (
          <Reveal key={i} delay={(i + 4) * 0.08}>
            <motion.div whileHover={{ y: -4, borderColor: `rgba(${f.rgb},0.3)`, background: "rgba(255,255,255,0.02)" }}
              style={{ padding: "28px 30px", borderRadius: 24, background: "rgba(255,255,255,0.01)", border: `1px solid rgba(255,255,255,0.04)`, display: "flex", gap: 18, alignItems: "flex-start", transition: "all 0.4s ease" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `rgba(${f.rgb},0.08)`, display: "flex", alignItems: "center", justifyContent: "center", color: f.color, flexShrink: 0 }}>
                {React.cloneElement(f.icon as React.ReactElement<any>, { size: 18 })}
              </div>
              <div>
                <h4 style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", marginBottom: 8 }}>{f.title}</h4>
                <p style={{ color: "#475569", fontSize: "0.82rem", lineHeight: 1.6, fontWeight: 500 }}>{f.desc}</p>
              </div>
            </motion.div>
          </Reveal>
        ))}
      </div>

    </section>
  );
}


/* ══════════════════════════════════════════════
   SECTION 4 — HOW IT WORKS
══════════════════════════════════════════════ */
const steps = [
  { n: "01", title: "Connect Your Infrastructure", desc: "Plug in any IP, RTSP, USB or legacy camera feeds in minutes. Zero vendor lock-in, unlimited streams.", color: "#22d3ee", icon: <Radio size={22} /> },
  { n: "02", title: "AI Processes Every Frame", desc: "Real-time YOLO detection, re-identification, crowd density analysis, and behavioral anomaly scoring — continuously.", color: "#3b82f6", icon: <Cpu size={22} /> },
  { n: "03", title: "Insights Surface Instantly", desc: "Zone heatmaps, occupancy metrics, predictive surge warnings, and suspicious activity flags appear on your dashboard.", color: "#a78bfa", icon: <BarChart3 size={22} /> },
  { n: "04", title: "Automated Alert Dispatch", desc: "Multi-channel notifications trigger before thresholds are breached — SMS, WebSocket, email — with full audit trails.", color: "#10b981", icon: <Bell size={22} /> },
];

export function HowItWorksSection() {
  const { t } = useTranslation();
  return (
    <section id="process" style={{ padding: "120px 24px", maxWidth: 1320, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <Reveal><SectionLabel color="#10b981">{t("auto.Process_9277") || "Process"}</SectionLabel></Reveal>
        <Reveal delay={0.08}><h2 style={{ fontSize: "clamp(32px,5vw,56px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", marginBottom: 20 }}>
          {t("auto.Fromcamerato_7052") || "From camera to"} <span style={{ color: "#10b981", textShadow: "0 0 30px rgba(16,185,129,0.4)" }}>{t("auto.intelligence_9613") || "intelligence"}</span> {t("auto.in4steps_9716") || "in 4 steps"}
        </h2></Reveal>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, position: "relative" }}>
        {/* Connector Line Background */}
        <div style={{ position: "absolute", top: "80px", left: "12.5%", right: "12.5%", height: "1px", background: "rgba(255,255,255,0.05)", zIndex: 0 }} />
        
        {steps.map((s, i) => (
          <Reveal key={i} delay={i * 0.12}>
            <div style={{ padding: "20px 40px", position: "relative", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
              {/* Connector dot signal */}
              {i < steps.length - 1 && (
                <motion.div 
                  animate={{ left: ["0%", "100%"], opacity: [0, 1, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: i * 0.5 }}
                  style={{ position: "absolute", top: "79.5px", right: "-50%", width: "100%", height: "2px", background: `linear-gradient(90deg,transparent,${s.color},transparent)`, zIndex: 1 }}
                />
              )}
              
              <motion.div whileHover={{ scale: 1.1 }} 
                style={{ width: 80, height: 80, borderRadius: 28, background: "rgba(1,4,16,0.9)", border: `1px solid ${s.color}60`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 40, position: "relative", zIndex: 2, boxShadow: `0 0 40px ${s.color}20` }}>
                {s.icon}
                <div style={{ position: "absolute", top: -8, right: -8, background: s.color, color: "#000", fontSize: "0.55rem", fontWeight: 900, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #000" }}>{s.n}</div>
              </motion.div>

              <h3 style={{ color: "#fff", fontWeight: 800, fontSize: "1.1rem", marginBottom: 16, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{s.title}</h3>
              <p style={{ color: "#475569", fontSize: "0.85rem", lineHeight: 1.7, fontWeight: 500, maxWidth: 240 }}>{s.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>

    </section>
  );
}


/* ══════════════════════════════════════════════
   SECTION 5 — USE CASES
══════════════════════════════════════════════ */
const useCases = [
  { icon: <Building2 size={22} />, name: "Shopping Malls", desc: "Footfall heatmaps, queue management, theft detection, and peak-hour surge alerts across every retail zone.", color: "#22d3ee" },
  { icon: <Plane size={22} />, name: "Airports & Transit", desc: "Crowd flow optimization, restricted area monitoring, VIP tracking, and emergency evacuation orchestration.", color: "#f59e0b" },
  { icon: <GraduationCap size={22} />, name: "Campuses", desc: "After-hours perimeter alerts, visitor flow analytics, secure zone enforcement, and behavioral outlier detection.", color: "#10b981" },
  { icon: <Globe size={22} />, name: "Smart Cities", desc: "City-wide footfall intelligence, event crowd management, and proactive public safety threat response.", color: "#3b82f6" },
  { icon: <Users size={22} />, name: "Enterprise Offices", desc: "Workspace occupancy optimization, badge-free access insights, and insider threat behavioral baselines.", color: "#a78bfa" },
  { icon: <Shield size={22} />, name: "Security Operations", desc: "24/7 SOC integration, automated incident logging, real-time re-identification, and evidence-grade video analytics.", color: "#f43f5e" },
];

export function UseCasesSection() {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <section id="use-cases" style={{ padding: "120px 24px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 72 }}>
        <Reveal><SectionLabel color="#f59e0b">{t("auto.UseCases_6253") || "Use Cases"}</SectionLabel></Reveal>
        <Reveal delay={0.08}><h2 style={{ fontSize: "clamp(32px,5vw,56px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", marginBottom: 20 }}>
          {t("auto.Intelligencefor_7026") || "Intelligence for"} <span style={{ background: "linear-gradient(135deg,#f59e0b,#f43f5e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{t("auto.everyenvironmen_7087") || "every environment"}</span>
        </h2></Reveal>
        <Reveal delay={0.14}><p style={{ color: "#94a3b8", fontSize: "1.1rem", maxWidth: 520, margin: "0 auto", fontWeight: 500 }}>{t("auto.Laminarscalesac_7941") || "Laminar scales across any physical infrastructure, delivering actionable insights in seconds."}</p></Reveal>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 24 }}>
        {useCases.map((u, i) => (
          <Reveal key={i} delay={i * 0.08}>
            <motion.div onHoverStart={() => setHovered(i)} onHoverEnd={() => setHovered(null)} whileHover={{ y: -8, boxShadow: `0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px ${u.color}40` }}
              style={{ padding: "48px 40px", borderRadius: 32, border: `1px solid ${hovered === i ? u.color + "50" : "rgba(255,255,255,0.06)"}`, background: hovered === i ? `${u.color}0a` : "rgba(8,12,32,0.65)", backdropFilter: "blur(16px) saturate(240%)", transition: "all 0.5s ease", cursor: "default", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: hovered === i ? `linear-gradient(90deg,transparent,${u.color}60,transparent)` : "transparent", transition: "all 0.5s" }} />
              <div style={{ width: 64, height: 64, borderRadius: 20, background: `${u.color}15`, border: `1px solid ${u.color}30`, display: "flex", alignItems: "center", justifyContent: "center", color: u.color, marginBottom: 28, boxShadow: `0 0 30px ${u.color}15`, transition: "all 0.4s" }}>
                {React.cloneElement(u.icon as React.ReactElement<any>, { size: 28, strokeWidth: 2.5 })}
              </div>

              <h3 style={{ color: "#fff", fontWeight: 800, fontSize: "1.25rem", marginBottom: 14, letterSpacing: "-0.01em" }}>{u.name}</h3>
              <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.8, fontWeight: 500 }}>{u.desc}</p>
              <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 8, color: u.color, fontSize: "0.65rem", fontWeight: 900, letterSpacing: "0.15em", textTransform: "uppercase", opacity: hovered === i ? 1 : 0, transform: hovered === i ? "translateX(0)" : "translateX(-10px)", transition: "all 0.4s" }}>
                {t("auto.CASESTUDY_5943") || "CASE STUDY"} <ArrowRight size={14} />
              </div>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}


/* ══════════════════════════════════════════════
   SECTION 6 — TESTIMONIALS
══════════════════════════════════════════════ */
const testimonials = [
  { quote: "LAMINAR gave our security operations a 3x improvement in incident response times. The real-time re-identification across 200+ cameras is simply astonishing.", name: "Priya Mehta", role: "Head of Security, Nexus Mall Group", avatar: "PM", color: "#22d3ee" },
  { quote: "We deployed LAMINAR across our airport terminal in under a week. The predictive surge detection has literally prevented two crowd stampede scenarios.", name: "David Chen", role: "Director of Operations, GlobalAir", avatar: "DC", color: "#a78bfa" },
  { quote: "The heatmap analytics and zone intelligence have completely transformed how we understand and manage footfall in our smart city pilot.", name: "Sarah Okonkwo", role: "CTO, MetroCity Initiative", avatar: "SO", color: "#10b981" },
];

export function TestimonialsSection() {
  const { t } = useTranslation();
  return (
    <section style={{ padding: "120px 24px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <Reveal><SectionLabel color="#a78bfa">{t("auto.SuccessStories_2464") || "Success Stories"}</SectionLabel></Reveal>
        <Reveal delay={0.08}><h2 style={{ fontSize: "clamp(32px,5vw,56px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>
          {t("auto.Trustedbythe_5115") || "Trusted by the"} <span style={{ color: "#a78bfa", textShadow: "0 0 40px rgba(167,139,250,0.5)" }}>world's sharpest</span> {t("auto.teams_9523") || "teams"}
        </h2></Reveal>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 32 }}>
        {testimonials.map((t, i) => (
          <Reveal key={i} delay={i * 0.15}>
            <motion.div whileHover={{ y: -12, boxShadow: `0 50px 100px rgba(0,0,0,0.8),0 0 0 1px ${t.color}40` }}
              style={{ padding: "52px 44px", borderRadius: 40, background: "linear-gradient(145deg,rgba(10,14,40,0.95),rgba(5,8,28,0.98))", border: `1px solid rgba(255,255,255,0.08)`, backdropFilter: "blur(16px) saturate(240%)", position: "relative", overflow: "hidden", transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${t.color}50,transparent)` }} />
              <div style={{ fontSize: "3.5rem", color: t.color, fontWeight: 900, lineHeight: 1, marginBottom: 24, opacity: 0.3, fontFamily: "serif", position: "absolute", top: 40, right: 40 }}>“</div>
              <p style={{ color: "#f8fafc", fontSize: "1.1rem", lineHeight: 1.85, marginBottom: 40, fontWeight: 500, position: "relative", zIndex: 1 }}>{t.quote}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${t.color}15`, border: `2px solid ${t.color}40`, display: "flex", alignItems: "center", justifyContent: "center", color: t.color, fontWeight: 900, fontSize: "1rem", boxShadow: `0 0 25px ${t.color}25` }}>{t.avatar}</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.01em" }}>{t.name}</div>
                  <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: 4, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" }}>{t.role}</div>
                </div>
              </div>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}


/* ══════════════════════════════════════════════
   SECTION 7 — PRICING
══════════════════════════════════════════════ */
const plans = [
  { name: "Sentinel", price: "299", period: "/mo", desc: "Perfect for small venues and pilot deployments.", color: "#38bdf8", features: ["Up to 10 camera feeds", "Real-time detection", "Smart alerts", "Basic analytics", "Email support"] },
  { name: "Guardian", price: "899", period: "/mo", desc: "Enterprise-grade intelligence for serious security teams.", color: "#a78bfa", features: ["Up to 100 camera feeds", "Re-identification system", "Heatmap analytics", "Predictive monitoring", "Priority SLA support", "API access"], highlight: true },
  { name: "Apex", price: "Custom", period: "", desc: "Unlimited scale. Dedicated infrastructure. White-glove onboarding.", color: "#10b981", features: ["Unlimited feeds", "Custom AI model training", "On-premise deployment", "Dedicated success manager", "99.99% SLA", "SOC 2 compliance"] },
];

export function PricingSection() {
  const { t } = useTranslation();
  const [hoveredPlan, setHoveredPlan] = useState<number | null>(null);
  return (
    <section id="pricing" style={{ padding: "120px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <Reveal><SectionLabel color="#10b981">{t("auto.PricingPlans_7151") || "Pricing Plans"}</SectionLabel></Reveal>
        <Reveal delay={0.08}><h2 style={{ fontSize: "clamp(32px,5vw,56px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", marginBottom: 20 }}>
          {t("auto.Intelligencetha_2609") || "Intelligence that"} <span style={{ color: "#10b981", textShadow: "0 0 30px rgba(16,185,129,0.4)" }}>{t("auto.scaleswithyou_9028") || "scales with you"}</span>
        </h2></Reveal>
        <Reveal delay={0.14}><p style={{ color: "#94a3b8", fontSize: "1.1rem", maxWidth: 500, margin: "0 auto", fontWeight: 500 }}>{t("auto.Choosethelevelo_2268") || "Choose the level of intelligence your infrastructure requires. No hidden costs."}</p></Reveal>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 32 }}>
        {plans.map((p, i) => (
          <Reveal key={i} delay={i * 0.12}>
            <motion.div onHoverStart={() => setHoveredPlan(i)} onHoverEnd={() => setHoveredPlan(null)} whileHover={{ y: -16, scale: 1.02 }}
              style={{ 
                padding: "64px 44px", borderRadius: 44, 
                background: p.highlight ? `linear-gradient(165deg,rgba(167,139,250,0.12),rgba(59,130,246,0.06))` : "rgba(1,4,16,0.6)", 
                border: `1px solid ${p.highlight ? p.color + "60" : "rgba(255,255,255,0.06)"}`, 
                backdropFilter: "blur(16px) saturate(200%)", 
                position: "relative", overflow: "hidden", 
                transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)", 
                height: "100%", 
                boxShadow: p.highlight ? `0 60px 140px rgba(167,139,250,0.15)` : "0 40px 100px rgba(0,0,0,0.8)" 
              }}>
              {p.highlight && (
                <div style={{ position: "absolute", top: 32, right: 32, padding: "8px 20px", borderRadius: 999, background: `linear-gradient(135deg,${p.color},#6366f1)`, color: "#000", fontSize: "0.62rem", fontWeight: 900, letterSpacing: "0.15em" }}>{t("auto.BESTVALUE_3143") || "BEST VALUE"}</div>
              )}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${p.color}60,transparent)` }} />
              {p.highlight && <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 80% 60% at 50% 0%,${p.color}15,transparent)`, pointerEvents: "none" }} />}
              
              <div style={{ color: p.color, fontSize: "0.65rem", fontWeight: 900, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 20 }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 16 }}>
                <span style={{ fontSize: p.price === "Custom" ? "2.5rem" : "3.8rem", fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "-0.04em" }}>{p.price === "Custom" ? "" : "$"}{p.price}</span>
                <span style={{ color: "#475569", fontSize: "0.95rem", marginBottom: 8, fontWeight: 700 }}>{p.period}</span>
              </div>
              <p style={{ color: "#64748b", fontSize: "0.92rem", marginBottom: 44, lineHeight: 1.7, fontWeight: 500 }}>{p.desc}</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 56 }}>
                {p.features.map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${p.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CheckCircle size={10} color={p.color} strokeWidth={3} />
                    </div>
                    <span style={{ color: "#94a3b8", fontSize: "0.9rem", fontWeight: 500 }}>{f}</span>
                  </div>
                ))}
              </div>
              
              <motion.button whileHover={{ scale: 1.02, background: p.highlight ? `linear-gradient(135deg,${p.color},#6366f1)` : `${p.color}15` }} whileTap={{ scale: 0.98 }}
                style={{ width: "100%", padding: "20px 0", borderRadius: 22, border: `1px solid ${p.color}${p.highlight ? "00" : "40"}`, background: p.highlight ? `linear-gradient(135deg,${p.color},#818cf8)` : "transparent", color: p.highlight ? "#000" : p.color, fontWeight: 900, fontSize: "0.8rem", letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.4s", boxShadow: p.highlight ? `0 20px 40px ${p.color}30` : "none" }}>
                {p.price === "Custom" ? "Contact Sales" : "Start Deployment"} <ArrowRight size={14} strokeWidth={3} />
              </motion.button>
            </motion.div>
          </Reveal>
        ))}
      </div>

    </section>
  );
}


/* ══════════════════════════════════════════════
   SECTION 8 — FAQ
══════════════════════════════════════════════ */
const faqs = [
  { q: "How quickly can we deploy LAMINAR?", a: "Most deployments go live within 24–72 hours. Our onboarding team handles integration with your existing camera infrastructure, and the AI calibrates to your environment automatically within the first hour." },
  { q: "Does LAMINAR work with existing cameras?", a: "Yes. LAMINAR is camera-agnostic and supports IP, RTSP, USB, ONVIF, and legacy camera protocols. You don't need to replace any hardware." },
  { q: "How accurate is the re-identification system?", a: "Our deep metric learning ReID system achieves 96.4% accuracy in controlled environments and 91.2% in challenging real-world multi-camera scenarios — well above industry benchmarks." },
  { q: "Is the data stored on my infrastructure or in the cloud?", a: "Both options are available. Apex plan customers get on-premise deployment. Guardian and Sentinel plans use our SOC 2 certified cloud infrastructure with end-to-end encryption." },
  { q: "What happens if the AI model makes an error?", a: "Every detection comes with a confidence score. Low-confidence events are flagged for human review. Our system is designed to assist, not replace, human security judgment." },
];

export function FAQSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="docs" style={{ padding: "120px 24px", maxWidth: 840, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <Reveal><SectionLabel color="#38bdf8">{t("auto.Documentation_6626") || "Documentation"}</SectionLabel></Reveal>
        <Reveal delay={0.08}><h2 style={{ fontSize: "clamp(36px,5vw,64px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>{t("auto.Common_9694") || "Common"} <span style={{ color: "#38bdf8" }}>{t("auto.questions_4082") || "questions"}</span></h2></Reveal>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {faqs.map((f, i) => (
          <Reveal key={i} delay={i * 0.08}>
            <motion.div whileHover={{ borderColor: "rgba(34,211,238,0.4)", background: "rgba(8,12,35,0.85)" }}
              style={{ borderRadius: 24, border: `1px solid ${open === i ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.08)"}`, background: open === i ? "rgba(34,211,238,0.08)" : "rgba(8,12,32,0.7)", backdropFilter: "blur(16px) saturate(240%)", overflow: "hidden", transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", padding: "28px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.15rem", paddingRight: 24, letterSpacing: "-0.02em" }}>{f.q}</span>
                <motion.div animate={{ rotate: open === i ? 180 : 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                  <ChevronDown size={22} color={open === i ? "#22d3ee" : "#475569"} strokeWidth={2.5} />
                </motion.div>
              </button>
              <AnimatePresence>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: "easeInOut" }}>
                    <div style={{ padding: "0 40px 32px", color: "#94a3b8", fontSize: "1rem", lineHeight: 1.8, fontWeight: 500, maxWidth: "90%" }}>{f.a}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}


/* ══════════════════════════════════════════════
   SECTION 9 — FINAL CTA
══════════════════════════════════════════════ */
export function FinalCTA({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const { t } = useTranslation();
  return (
    <section style={{ padding: "100px 24px 180px" }}>
      <Reveal>
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center", position: "relative", padding: "120px 60px", borderRadius: 56, background: "linear-gradient(165deg,rgba(10,15,40,0.95),rgba(5,7,20,1))", border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", boxShadow: "0 80px 160px rgba(0,0,0,0.95), inset 0 1px 1px rgba(255,255,255,0.06)" }}>
          {/* Animated border beam effect */}
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            style={{ position: "absolute", inset: -2, borderRadius: 56, padding: 3, background: "conic-gradient(from 0deg,transparent 60%,rgba(34,211,238,1) 80%,rgba(167,139,250,1) 100%)", WebkitMask: "linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" }} />
          
          <div style={{ position: "absolute", top: "-50%", left: "50%", transform: "translateX(-50%)", width: 800, height: 600, background: "radial-gradient(ellipse,rgba(34,211,238,0.15),transparent 70%)", filter: "blur(16px)" }} />
          
          <div style={{ position: "relative", zIndex: 2 }}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
              style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "10px 28px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", marginBottom: 48, backdropFilter: "blur(16px)" }}>
              <motion.div animate={{ scale: [1, 1.8, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 15px #22d3ee" }} />
              <span style={{ fontSize: "0.6rem", color: "#94a3b8", fontWeight: 900, letterSpacing: "0.3em" }}>{t("auto.GENESISV20READY_5472") || "GENESIS V2.0 READY FOR DEPLOYMENT"}</span>
            </motion.div>
            
            <h2 style={{ fontSize: "clamp(48px,9vw,96px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.06em", lineHeight: 0.95, marginBottom: 40, textShadow: "0 20px 50px rgba(0,0,0,0.6)" }}>
              {t("auto.SeeBeyond_9589") || "See Beyond"}<br />
              <span style={{ backgroundImage: "linear-gradient(135deg,#22d3ee,#818cf8,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 40px rgba(34,211,238,0.3))" }}>{t("auto.Surveillance_1264") || "Surveillance."}</span>
            </h2>

            
            <p style={{ color: "#64748b", fontSize: "1.25rem", lineHeight: 1.8, maxWidth: 640, margin: "0 auto 72px", fontWeight: 500 }}>{t("auto.Infrastructurew_2522") || "Infrastructure-wide intelligence. Real-time ReID. Predictive anomaly detection. Everything you need to secure the future."}</p>
            
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
              <motion.button onClick={onGetStarted} whileHover={{ y: -8, scale: 1.03, boxShadow: "0 0 80px rgba(34,211,238,0.5),0 15px 40px rgba(0,0,0,0.4)" }} whileTap={{ scale: 0.96 }}
                style={{ padding: "24px 64px", borderRadius: 999, background: "#22d3ee", color: "#000", fontWeight: 900, fontSize: "0.85rem", letterSpacing: "0.15em", textTransform: "uppercase", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, position: "relative", overflow: "hidden", transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)" }}>
                <Zap size={18} strokeWidth={3} /> {t("auto.STARTDEPLOYMENT_1687") || "START DEPLOYMENT"} <ArrowRight size={18} strokeWidth={3} />
              </motion.button>
              <motion.button onClick={onLogin} whileHover={{ y: -8, scale: 1.03, borderColor: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} whileTap={{ scale: 0.96 }}
                style={{ padding: "24px 64px", borderRadius: 999, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", backdropFilter: "blur(16px)", transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)" }}>
                {t("auto.CLIENTPORTAL_1504") || "CLIENT PORTAL"}
              </motion.button>
            </div>
          </div>

        </div>
      </Reveal>
    </section>
  );
}

