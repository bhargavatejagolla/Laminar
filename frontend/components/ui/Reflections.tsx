"use client";

import React from "react";
import { motion } from "framer-motion";

/* ─── Light Glints ─── */
const LightGlints = React.memo(function LightGlints() {
  const [mounted, setMounted] = React.useState(false);

  const glints = React.useMemo(() => Array.from({ length: 15 }).map(() => ({
    top: Math.random() * 100,
    left: Math.random() * 100,
    duration: 2 + Math.random() * 3,
    delay: Math.random() * 10,
  })), []);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {glints.map((g, i) => (
        <motion.div
          key={i}
          animate={{
            opacity: [0, 0.4, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: g.duration,
            repeat: Infinity,
            delay: g.delay,
          }}
          style={{
            position: "absolute",
            top: `${g.top}%`,
            left: `${g.left}%`,
            width: 2,
            height: 2,
            background: "#fff",
            boxShadow: "0 0 8px #fff, 0 0 15px rgba(34,211,238,0.5)",
            borderRadius: "50%",
          }}
        />
      ))}
    </div>
  );
});

/* ─── Anamorphic Streaks ─── */
const AnamorphicStreaks = React.memo(function AnamorphicStreaks() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            x: ["-100%", "100%"],
            opacity: [0, 0.12, 0],
          }}
          transition={{
            duration: 10 + i * 5,
            repeat: Infinity,
            ease: "linear",
            delay: i * 2,
          }}
          style={{
            position: "absolute",
            top: `${20 + i * 15}%`,
            left: 0,
            width: "80%",
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), rgba(34,211,238,1), rgba(255,255,255,0.4), transparent)",
            boxShadow: "0 0 15px rgba(34,211,238,0.3)",
            filter: "blur(0.5px)",
          }}
        />
      ))}
    </div>
  );
});

const Reflections = function Reflections({ mode }: { mode: 'galaxy' | 'hyperspeed' }) {
  if (mode === 'galaxy') {
    return (
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, overflow: "hidden" }}>
        <LightGlints />
        {/* Subtle deep blue/teal glows for Galaxy */}
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute",
            top: "10%",
            left: "20%",
            width: "60vw",
            height: "60vw",
            background: "radial-gradient(circle, rgba(34,211,238,0.1) 0%, transparent 70%)",
            filter: "blur(120px)",
          }}
        />
      </div>
    );
  }

  // Hyperspeed mode - clean, professional, no over-reflection, no grid
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, overflow: "hidden" }}>
      <LightGlints />
      <AnamorphicStreaks />

      {/* Subtle Cinematic Sky Glow (fills the top black void) */}
      <motion.div
        animate={{ opacity: [0.15, 0.25, 0.15] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          top: "-20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "120vw",
          height: "80vh",
          background: "radial-gradient(ellipse at 50% 20%, rgba(34,211,238,0.06) 0%, rgba(99,102,241,0.03) 40%, transparent 70%)",
          filter: "blur(80px)",
          pointerEvents: "none",
          willChange: "opacity"
        }}
      />

      {/* Deep Space Background Glow (Center-Left) */}
      <div style={{
        position: "absolute",
        top: "10%",
        left: "10%",
        width: "40vw",
        height: "40vw",
        background: "radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 60%)",
        filter: "blur(90px)",
        pointerEvents: "none"
      }} />

      {/* Subtle, professional floor reflection (no grid, no heavy circles) */}
      <motion.div
        animate={{ opacity: [0.03, 0.06, 0.03] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "45vh",
          background: "linear-gradient(to top, rgba(34,211,238,0.06) 0%, rgba(59,130,246,0.02) 40%, transparent 100%)",
          willChange: "opacity",
        }}
      />

      {/* Gentle ambient glow to prevent it from feeling too dark */}
      <div style={{
        position: "absolute",
        bottom: "-10%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "80vw",
        height: "30vh",
        background: "radial-gradient(ellipse at 50% 100%, rgba(34,211,238,0.08) 0%, transparent 70%)",
        filter: "blur(60px)",
        pointerEvents: "none"
      }} />

      {/* Barely visible ambient noise to reduce banding */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.02) 100%)",
        pointerEvents: "none"
      }} />
    </div>
  );
};

export default React.memo(Reflections);
