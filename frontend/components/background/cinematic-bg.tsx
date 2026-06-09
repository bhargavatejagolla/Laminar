"use client";

import React from "react";
import { motion } from "framer-motion";
/* ═══════════════════════════════════════════════════════════════
   LAYER 1: Galaxy WebGL star field — the true hero
═══════════════════════════════════════════════════════════════ */
function GalaxyLayer() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      {/* Pure black base */}
      <div style={{ position: "absolute", inset: 0, background: "#000000" }} />

      {/* Galaxy WebGL Removed for Performance */}
      <div style={{ position: "absolute", inset: 0 }}>
      </div>

      {/* Very subtle top fade so navbar glass reads clearly */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "15vh",
        background: "linear-gradient(to bottom,rgba(0,0,0,0.35),transparent)",
        pointerEvents: "none",
      }} />

      {/* Edge vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 110% 110% at 50% 50%,transparent 38%,rgba(0,0,0,0.55) 100%)",
        pointerEvents: "none",
      }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAYER 2: Ambient color nebulae — tinted depth (CPU-only, will-change)
═══════════════════════════════════════════════════════════════ */
function AmbientNebula() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }}>
      <motion.div
        animate={{ x: [0, 45, -30, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 38, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", top: "-10%", left: "-6%",
          width: "50vw", height: "50vw", borderRadius: "50%",
          background: "radial-gradient(circle,rgba(34,211,238,0.03) 0%,transparent 70%)",
          filter: "blur(50px)", willChange: "transform",
        }}
      />
      <motion.div
        animate={{ x: [0, -45, 30, 0], y: [0, 40, -22, 0] }}
        transition={{ duration: 50, repeat: Infinity, ease: "easeInOut", delay: 12 }}
        style={{
          position: "absolute", bottom: "-15%", right: "-10%",
          width: "60vw", height: "60vw", borderRadius: "50%",
          background: "radial-gradient(circle,rgba(99,102,241,0.035) 0%,transparent 65%)",
          filter: "blur(60px)", willChange: "transform",
        }}
      />
    </div>
  );
}

/* ─── Main Export ─── */
export function CinematicBackground() {
  return (
    <>
      <GalaxyLayer />
      <AmbientNebula />
    </>
  );
}
