"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  motion, useMotionValue, useSpring, AnimatePresence, useScroll, useTransform,
} from "framer-motion";
import {
  Shield, ChevronRight, Eye, Zap, Sparkles, Activity, Brain,
  ShieldAlert, TrendingUp, Bell, ArrowRight, Cpu,
} from "lucide-react";
import {
  DashboardPreview, FeaturesSection, HowItWorksSection,
  UseCasesSection, TestimonialsSection, PricingSection, FAQSection, FinalCTA,
  Reveal, SectionLabel, LiveCounter,
} from "@/components/landing/sections";

import Orb from "@/components/ui/Orb";
import BlurText from "@/components/ui/BlurText";
import GooeyNav from "@/components/ui/GooeyNav";
import Hyperspeed from "@/components/ui/Hyperspeed";
import Reflections from "@/components/ui/Reflections";
import BorderGlow from "@/components/ui/BorderGlow";
import PillNav from "@/components/ui/PillNav";
import LightPillar from "@/components/ui/LightPillar";

/* ══════════════════════════════════════════════════════
   CURSOR SPOTLIGHT — follows mouse with premium glow
══════════════════════════════════════════════════════ */
function CursorSpotlight() {
  const { t } = useTranslation();
  const mx = useMotionValue(-400);
  const my = useMotionValue(-400);
  const sx = mx;
  const sy = my;

  useEffect(() => {
    const h = (e: MouseEvent) => { mx.set(e.clientX); my.set(e.clientY); };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, [mx, my]);

  return (
    <>
      {/* Small professional neutral dot — 6px */}
      <motion.div
        style={{
          position: "fixed", zIndex: 4, pointerEvents: "none",
          width: 6, height: 6, borderRadius: "50%",
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 0 4px rgba(255,255,255,0.5)",
          x: sx, y: sy, translateX: "-50%", translateY: "-50%",
        } as any}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════
   MAGNETIC BUTTON — premium with sweep + magnetic pull
══════════════════════════════════════════════════════ */
function MagBtn({
  children, onClick, primary = false, className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  className?: string;
}) {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 250, damping: 22 });
  const sy = useSpring(my, { stiffness: 250, damping: 22 });
  const [hovered, setHovered] = useState(false);

  const handle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    mx.set(dx * 0.28); my.set(dy * 0.28);
  };

  return (
    <motion.button
      onMouseMove={handle}
      onMouseLeave={() => { mx.set(0); my.set(0); setHovered(false); }}
      onMouseEnter={() => setHovered(true)}
      onClick={onClick}
      style={{
        x: sx, y: sy,
        padding: primary ? "14px 38px" : "13px 30px",
        borderRadius: 999,
        border: primary ? "1px solid rgba(34,211,238,0.4)" : "1px solid rgba(255,255,255,0.12)",
        background: primary
          ? "linear-gradient(135deg,rgba(34,211,238,1) 0%,rgba(99,102,241,1) 50%,rgba(59,130,246,1) 100%)"
          : "rgba(255,255,255,0.02)",
        color: primary ? "#000d1a" : "#e2e8f0",
        fontWeight: primary ? 800 : 700,
        fontSize: "0.7rem",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        cursor: "pointer",
        backdropFilter: primary ? "none" : "blur(16px) saturate(200%)",
        WebkitBackdropFilter: primary ? "none" : "blur(16px) saturate(200%)",
        boxShadow: primary
          ? "0 0 40px rgba(34,211,238,0.3), 0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)"
          : "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", gap: 10,
        position: "relative", overflow: "hidden",
        WebkitFontSmoothing: "antialiased",
        transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
      } as any}
      whileHover={primary
        ? { scale: 1.02, boxShadow: "0 0 60px rgba(34,211,238,0.5), 0 14px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.45)", y: -2 }
        : { borderColor: "rgba(34,211,238,0.3)", background: "rgba(255,255,255,0.08)", y: -2 }
      }
      whileTap={{ scale: 0.97 }}
    >
      {primary && (
        <motion.div
          animate={{ x: ["-200%", "200%"] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)",
            pointerEvents: "none",
          }}
        />
      )}
      {children}
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════════
   TYPEWRITER — cinematic word cycling
══════════════════════════════════════════════════════ */
function Typewriter({ words }: { words: string[] }) {
  const { t } = useTranslation();
  const [wi, setWi] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const cur = words[wi];
    const timeout = setTimeout(() => {
      if (!deleting && text.length < cur.length) {
        setText(cur.slice(0, text.length + 1));
      } else if (!deleting && text.length === cur.length) {
        setTimeout(() => setDeleting(true), 2400);
      } else if (deleting && text.length > 0) {
        setText(cur.slice(0, text.length - 1));
      } else {
        setDeleting(false);
        setWi((wi + 1) % words.length);
      }
    }, deleting ? 42 : 72);
    return () => clearTimeout(timeout);
  }, [text, deleting, wi, words]);

  return (
    <span style={{
      background: "linear-gradient(135deg,#60a5fa 0%,#22d3ee 40%,#a78bfa 80%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      filter: "drop-shadow(0 0 30px rgba(34,211,238,0.4))",
      display: "inline-block",
    }}>
      {text}
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.7, repeat: Infinity }}
        style={{
          display: "inline-block", width: 3, height: "0.85em",
          background: "#22d3ee", marginLeft: 4, verticalAlign: "middle",
          borderRadius: 2, boxShadow: "0 0 8px #22d3ee",
          WebkitTextFillColor: "initial",
        }}
      />
    </span>
  );
}

/* ─── LENS FLARE ─── */
function LensFlare() {
  const { t } = useTranslation();
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 25 });
  const sy = useSpring(my, { stiffness: 60, damping: 25 });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      // Move flare opposite to mouse for parallax effect
      mx.set((e.clientX - window.innerWidth / 2) * -0.15);
      my.set((e.clientY - window.innerHeight / 2) * -0.15);
    };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, [mx, my]);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, overflow: "hidden" }}>
      <motion.div style={{ x: sx, y: sy, position: "absolute", top: "40%", left: "40%" }}>
        {/* Core flare */}
        <div style={{ width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)", filter: "blur(16px)" }} />
        {/* Secondary rings */}
        <div style={{ position: "absolute", top: "120%", left: "120%", width: 100, height: 100, borderRadius: "50%", border: "1px solid rgba(167,139,250,0.04)", background: "rgba(167,139,250,0.02)" }} />
        <div style={{ position: "absolute", top: "180%", left: "180%", width: 60, height: 60, borderRadius: "50%", border: "1px solid rgba(34,211,238,0.03)", background: "rgba(34,211,238,0.01)" }} />
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   GLASS HUD CARD — luxury floating card component
══════════════════════════════════════════════════════ */
function GlassHUDCard({
  style, children, glowColor = "34,211,238",
}: {
  style?: React.CSSProperties;
  children: React.ReactNode;
  glowColor?: string;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{
        duration: 5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      style={{
        position: "absolute",
        zIndex: 10,
        ...style,
      }}
    >
      <BorderGlow
        glowColor="180 80 80" // Refined slate/cyan glow
        glowIntensity={0.8}
        glowRadius={30}
        edgeSensitivity={20}
        borderRadius={14}
        backgroundColor="rgba(8,12,30,0.92)"
        colors={['rgba(34,211,238,0.4)', 'rgba(99,102,241,0.4)', 'rgba(255,255,255,0.2)']}
      >
        <div style={{
          padding: "13px 16px",
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          position: "relative",
          isolation: "isolate",
          overflow: "hidden", // Contain shimmer
          borderRadius: 14,
        }}>
          {/* Shimmer Effect */}
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 4, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(115deg, transparent, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%, transparent)",
              pointerEvents: "none", zIndex: 3
            }}
          />
          {/* Inner top white shimmer */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg,transparent 5%,rgba(255,255,255,0.18) 40%,rgba(${glowColor},0.22) 60%,transparent 95%)`,
            pointerEvents: "none",
            zIndex: 2
          }} />
          {children}
        </div>
      </BorderGlow>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   LIVE NEURAL HUD — hero floating intelligence cards
══════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════
   LIVE NEURAL HUD — hero floating intelligence cards
   Powered by real-time telemetry
══════════════════════════════════════════════════════ */
import { useSystemIntelligence } from "@/hooks/useIntelligence";
import { useAlerts } from "@/hooks/useAlerts";
import { useTranslation } from "react-i18next";


/* ══════════════════════════════════════════════════════
   THREAT TICKER — scrolling live events banner
══════════════════════════════════════════════════════ */
// ThreatTicker is now defined below with live data integration.

/* ══════════════════════════════════════════════════════
   NAVBAR — ultra-minimal futuristic premium navbar
══════════════════════════════════════════════════════ */
function Navbar({ router, mounted }: { router: ReturnType<typeof useRouter>; mounted: boolean }) {
  const { t } = useTranslation();
  const pathname = usePathname();

  // Prevent hydration mismatch by using static text or suppressing warning
  const brandText = mounted ? (t("auto.LAMINAR_2701") || "LAMINAR") : "LAMINAR";
  const intelligenceText = mounted ? (t("auto.INTELLIGENCE_844") || "INTELLIGENCE") : "INTELLIGENCE";
  const loginText = mounted ? (t("auto.LOGIN_7203") || "LOG IN") : "LOG IN";
  const deployText = mounted ? (t("auto.DEPLOY_3240") || "DEPLOY") : "DEPLOY";

  return (
    <div style={{
      position: "fixed",
      top: 20,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 100,
      width: "100%",
      maxWidth: 1400,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 40px",
      pointerEvents: "none"
    }}>
      {/* Brand Title (Left) */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        onClick={() => {
          if (pathname === '/') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            router.push("/");
          }
        }}
        style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", pointerEvents: "auto" }}
      >
        <div style={{ position: "relative" }}>
          <motion.div
            animate={{ filter: ["drop-shadow(0 0 5px rgba(34,211,238,0.4))", "drop-shadow(0 0 15px rgba(34,211,238,0.8))", "drop-shadow(0 0 5px rgba(34,211,238,0.4))"] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Shield style={{ width: 22, height: 22, color: "#22d3ee" }} />
          </motion.div>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            style={{ position: "absolute", inset: -6, pointerEvents: "none" }}
          >
            <div style={{
              position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
              width: 3.5, height: 3.5, borderRadius: "50%", background: "#22d3ee",
              boxShadow: "0 0 10px #22d3ee",
            }} />
          </motion.div>
        </div>
        <div className="hidden lg:block">
          <span style={{ color: "#fff", fontWeight: 900, letterSpacing: "0.40em", fontSize: "0.9rem", textShadow: "0 0 15px rgba(34,211,238,0.3)" }}>{brandText}</span>
          <span style={{ color: "#475569", fontSize: "0.5rem", letterSpacing: "0.20em", fontWeight: 800, marginLeft: 8 }}>{intelligenceText}</span>
        </div>
      </motion.div>

      {/* Center PillNav */}
      <div style={{ pointerEvents: "auto" }}>
        <PillNav
          logoComponent={<Zap size={20} color="#22d3ee" />}
          items={[
            { label: "Features", href: "#features" },
            { label: "Solutions", href: "#solutions" },
            { label: "Pricing", href: "#pricing" },
            { label: "Docs", href: "#docs" }
          ]}
          activeHref={pathname}
          baseColor="rgba(1, 4, 16, 0.85)"
          pillColor="#22d3ee"
          hoveredPillTextColor="#000"
          pillTextColor="#94a3b8"
        />
      </div>

      {/* Action Buttons (Right) */}
      <div style={{ display: "flex", alignItems: "center", gap: 32, pointerEvents: "auto" }}>
        <motion.button
          whileHover={{ color: "#fff", scale: 1.05 }}
          onClick={() => router.push("/login")}
          style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.15em", cursor: "pointer", transition: "all 0.3s" }}
        >
          {loginText}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05, background: "rgba(34,211,238,1)", boxShadow: "0 0 35px rgba(34,211,238,0.4)" }}
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push("/register")}
          className="hidden sm:flex"
          style={{
            background: "rgba(34,211,238,0.9)",
            color: "#000",
            padding: "10px 24px",
            borderRadius: 999,
            fontWeight: 900,
            fontSize: "0.65rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 8px 25px rgba(34,211,238,0.15)",
            border: "none"
          }}
        >
          {deployText}
          <ChevronRight size={13} strokeWidth={3} />
        </motion.button>
      </div>
    </div>
  );
}



/* ══════════════════════════════════════════════════════
   STATS GRID
══════════════════════════════════════════════════════ */
function StatsGrid() {
  const { t } = useTranslation();
  const { data: systemData } = useSystemIntelligence();

  const stats = [
    { value: "98", suffix: "%", label: "AI Accuracy" },
    { value: "<100", suffix: "ms", label: "Response" },
    { value: systemData?.total_venues?.toString() || "0", suffix: "", label: "Active Venues" },
    { value: "99.9", suffix: "%", label: "System Uptime" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.1 }}
      className="grid grid-cols-2 lg:grid-cols-4 gap-0 max-w-[720px] w-full overflow-hidden bg-[rgba(1,4,16,0.65)] rounded-[32px] border border-[rgba(255,255,255,0.04)] shadow-[0_30px_100px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.03)] relative z-[5] mt-16 backdrop-blur-[20px]"
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: 32, padding: 1, background: "linear-gradient(to bottom right, rgba(255,255,255,0.08), transparent, rgba(34,211,238,0.04))", maskImage: "linear-gradient(black, black) content-box, linear-gradient(black, black)", maskComposite: "exclude", pointerEvents: "none" }} />
      {stats.map((s, i) => (
        <motion.div
          key={i}
          whileHover={{ background: "rgba(34,211,238,0.03)" }}
          style={{
            padding: "32px 24px", textAlign: "center",
            borderRight: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none",
            transition: "background 0.4s",
            position: "relative",
          }}
        >
          <div style={{ fontSize: "2rem", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1 }}>
            {s.value}<span style={{ fontSize: "0.9rem", color: "#22d3ee", fontWeight: 800, marginLeft: 2 }}>{s.suffix}</span>
          </div>
          <div style={{ fontSize: "0.55rem", color: "#475569", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", marginTop: 10 }}>{s.label}</div>
        </motion.div>
      ))}
    </motion.div>
  );
}


/* ══════════════════════════════════════════════════════
   TRUST LOGOS
══════════════════════════════════════════════════════ */
// logos constant removed.

function TrustSection() {
  const { t } = useTranslation();
  const companies = ["Lockheed Martin", "General Dynamics", "Northrop Grumman", "Raytheon", "Palantir", "SpaceX", "L3Harris", "Boeing", "Airbus"];
  return (
    <section id="trusted-by" style={{ padding: "120px 24px 60px", textAlign: "center", position: "relative", zIndex: 1 }}>
      <Reveal>
        <p style={{ color: "#475569", fontSize: "0.55rem", fontWeight: 900, letterSpacing: "0.25em", marginBottom: 60, textTransform: "uppercase", opacity: 0.8 }}>
          {t("auto.TRUSTEDBYLEADER_1198") || "TRUSTED BY LEADERS IN"} <span style={{ color: "#fff" }}>{t("auto.GLOBALSECURITY_2821") || "GLOBAL SECURITY"}</span> & <span style={{ color: "#fff" }}>{t("auto.DEFENSE_5038") || "DEFENSE"}</span>
        </p>
        <div style={{ overflow: "hidden", position: "relative", width: "100%", maxWidth: "100vw", margin: "0 auto", padding: "20px 0" }}>
          {/* Fading edges marquee mask */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "15%", background: "linear-gradient(90deg, #000 0%, transparent 100%)", zIndex: 2, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "15%", background: "linear-gradient(-90deg, #000 0%, transparent 100%)", zIndex: 2, pointerEvents: "none" }} />

          <motion.div
            animate={{ x: [0, -1200] }}
            transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
            style={{ display: "flex", gap: "80px", whiteSpace: "nowrap", width: "max-content" }}
          >
            {[...companies, ...companies, ...companies].map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, opacity: 0.35, transition: "all 0.4s", cursor: "default" }}>
                <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#22d3ee" }}>
                  <Shield size={18} strokeWidth={2.5} />
                </div>
                <span style={{ color: "#fff", fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-0.04em", filter: "drop-shadow(0 0 10px rgba(0,0,0,0.5))" }}>{c}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </Reveal>
    </section>
  );
}


/* ══════════════════════════════════════════════════════
   GLOBAL ATMOSPHERIC REFLECTIONS
══════════════════════════════════════════════════════ */
function GlobalReflections() {
  const { t } = useTranslation();
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {/* Dynamic atmospheric light patches */}
      <motion.div
        animate={{
          x: ["-10%", "10%", "-5%"],
          y: ["-10%", "5%", "-10%"],
          opacity: [0.15, 0.25, 0.15]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", top: "-20%", left: "-20%", width: "80%", height: "80%",
          background: "radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)",
          filter: "blur(16px)",
          willChange: "transform, opacity",
          transform: "translateZ(0)",
        }}
      />
      <motion.div
        animate={{
          x: ["10%", "-10%", "5%"],
          y: ["10%", "-5%", "10%"],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        style={{
          position: "absolute", bottom: "-20%", right: "-20%", width: "70%", height: "70%",
          background: "radial-gradient(circle, rgba(167,139,250,0.1) 0%, transparent 70%)",
          filter: "blur(16px)",
          willChange: "transform, opacity",
          transform: "translateZ(0)",
        }}
      />
      {/* Light streak covering page */}
      <motion.div
        animate={{
          rotate: [15, 20, 15],
          x: ["-100%", "100%"]
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", top: "20%", left: 0, width: "150%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
          zIndex: 0,
          willChange: "transform",
        }}
      />
      {/* Glass grain / Noise texture — inline to avoid external 404 */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.015, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")", pointerEvents: "none", transform: "translateZ(0)" }} />
    </div>
  );
}


/* ══════════════════════════════════════════════════════
   FOOTER
══════════════════════════════════════════════════════ */
function Footer() {
  const { t } = useTranslation();
  return (
    <footer style={{
      borderTop: "1px solid rgba(34,211,238,0.05)",
      padding: "36px 56px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 20,
      maxWidth: 1440, margin: "0 auto",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Shield style={{ width: 14, height: 14, color: "#22d3ee" }} />
        <span style={{ color: "#f8fafc", fontWeight: 900, fontSize: "0.72rem", letterSpacing: "0.2em" }}>{t("auto.LAMINAR_2701") || "LAMINAR"}</span>
        <span style={{ color: "#334155", fontSize: "0.46rem", letterSpacing: "0.14em", fontWeight: 600 }}>{t("auto.AIINTELLIGENCE_0") || "AI INTELLIGENCE"}</span>
      </div>
      <div style={{ display: "flex", gap: 36 }}>
        {["Privacy", "Terms", "Docs", "Status", "Blog"].map(l => (
          <motion.span
            key={l}
            whileHover={{ color: "#22d3ee", y: -1 }}
            style={{ color: "#475569", fontSize: "0.65rem", fontWeight: 500, cursor: "pointer", transition: "color 0.2s" }}
          >
            {l}
          </motion.span>
        ))}
      </div>
      <p style={{ color: "#334155", fontSize: "0.65rem" }}>© {new Date().getFullYear()} Laminar Intelligence Inc.</p>
    </footer>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════ */
export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [bgMode, setBgMode] = useState<"hyperspeed" | "lightpillar">("hyperspeed");
  useEffect(() => {
    setMounted(true);
  }, []);

  const { t } = useTranslation();
  const router = useRouter();
  const { scrollY } = useScroll();
  const heroParallax = useTransform(scrollY, [0, 600], [0, -80]);

  const hyperspeedOptions = useMemo(() => ({
    onSpeedUp: () => { },
    onSlowDown: () => { },
    distortion: 'turbulentDistortion',
    length: 500,
    roadWidth: 26,     // Doubled width to fill the screen
    islandWidth: 6,
    lanesPerRoad: 6,   // More lanes for a wider tunnel
    fov: 95,
    fovSpeedUp: 140,
    speedUp: 3.5,
    carLightsFade: 0.45,
    totalSideLightSticks: 60,
    lightPairsPerRoadWay: 120, // More traffic to fill the space
    shoulderLinesWidthPercentage: 0.05,
    brokenLinesWidthPercentage: 0.1,
    brokenLinesLengthPercentage: 0.5,
    lightStickWidth: [0.1, 0.4],
    lightStickHeight: [1.3, 1.8],
    movingAwaySpeed: [90, 120],
    movingCloserSpeed: [-160, -220],
    carLightsLength: [500 * 0.05, 500 * 0.2],
    carLightsRadius: [0.05, 0.14],
    carWidthPercentage: [0.3, 0.5],
    carShiftX: [-0.6, 0.6],
    carFloorSeparation: [0.1, 3],
    colors: {
      roadColor: 0x030408,
      islandColor: 0x060810,
      background: 0x000000,
      shoulderLines: 0x0a0a0f,
      brokenLines: 0x0a0a0f,
      leftCars: [0x22d3ee, 0x6366f1, 0x3b82f6],
      rightCars: [0xf43f5e, 0xa78bfa, 0x3b82f6],
      sticks: 0x3b82f6,
    }
  }), []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000000",
      color: "#f0f4f8",
      fontFamily: "'General Sans','Inter',sans-serif",
      overflowX: "hidden",
    }}>
      {/* ── Global reflections ── */}
      <GlobalReflections />

      {/* ── Cursor spotlight ── */}
      <CursorSpotlight />


      {/* ── Cinematic background system ── */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={bgMode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          style={{ position: "fixed", inset: 0, zIndex: 0, transform: "translateZ(0)", willChange: "transform" }}
        >
          {bgMode === "hyperspeed" ? (
            <Hyperspeed effectOptions={hyperspeedOptions} />
          ) : (
            <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
              <LightPillar
                topColor="#5227FF"
                bottomColor="#FF9FFC"
                intensity={1}
                rotationSpeed={0.8}
                glowAmount={0.002}
                pillarWidth={3}
                pillarHeight={0.4}
                noiseIntensity={0.5}
                pillarRotation={25}
                interactive={true}
                mixBlendMode="screen"
                quality="high"
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <Reflections mode="hyperspeed" />

      {/* ── Background Toggle ── */}
      <motion.div 
        initial={{ y: 50, x: "-50%", opacity: 0 }}
        animate={{ y: 0, x: "-50%", opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 200, damping: 20 }}
        style={{ position: "fixed", bottom: 40, left: "50%", zIndex: 100000 }}
      >
        <div style={{ display: "flex", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(24px)", padding: 6, borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", gap: 6, boxShadow: "0 20px 40px rgba(0,0,0,0.6), inset 0 0 20px rgba(255,255,255,0.05)" }}>
          <button 
            onClick={() => setBgMode("hyperspeed")}
            style={{ 
              padding: "8px 24px", 
              borderRadius: 999, 
              background: bgMode === "hyperspeed" ? "rgba(34,211,238,0.2)" : "transparent",
              color: bgMode === "hyperspeed" ? "#22d3ee" : "#94a3b8",
              fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
              border: bgMode === "hyperspeed" ? "1px solid rgba(34,211,238,0.3)" : "1px solid transparent",
              transition: "all 0.3s", cursor: "pointer"
            }}
          >
            Hyperspeed
          </button>
          <button 
            onClick={() => setBgMode("lightpillar")}
            style={{ 
              padding: "8px 24px", 
              borderRadius: 999, 
              background: bgMode === "lightpillar" ? "rgba(34,211,238,0.2)" : "transparent",
              color: bgMode === "lightpillar" ? "#22d3ee" : "#94a3b8",
              fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
              border: bgMode === "lightpillar" ? "1px solid rgba(34,211,238,0.3)" : "1px solid transparent",
              transition: "all 0.3s", cursor: "pointer"
            }}
          >
            Light Pillar
          </button>
        </div>
      </motion.div>

      {/* ── Page content ── */}
      <div style={{ position: "relative", zIndex: 10 }}>
        <Navbar router={router} mounted={mounted} />


        {/* ═══════ HERO SECTION ═══════ */}
        <motion.main
          style={{
            maxWidth: 1440, margin: "0 auto",
            padding: "100px 5% 60px",
            position: "relative",
            minHeight: "92vh",
            display: "flex", alignItems: "center",
            y: heroParallax,
          }}
        >
          {/* Removed Hero Focal Orb to prevent dark overlapping circle */}

          {/* Removed speculative HUD to restore minimal hero density */}

          <div className="w-full max-w-7xl mx-auto px-6 md:px-10 relative z-10">
            <div className="max-w-3xl relative z-2">
              {/* ── Live badge ── */}
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "5px 16px 5px 5px",
                  borderRadius: 999,
                  border: "1px solid rgba(34,211,238,0.15)",
                  background: "rgba(1,5,20,0.65)",
                  backdropFilter: "blur(16px)",
                  marginBottom: 36,
                  position: "relative", overflow: "hidden",
                }}
              >
                <motion.div
                  animate={{ x: ["-200%", "200%"] }}
                  transition={{ duration: 4, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
                  style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(90deg,transparent,rgba(34,211,238,0.08),transparent)",
                    pointerEvents: "none",
                  }}
                />
                <span style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  background: "rgba(34,211,238,0.12)",
                  fontSize: "0.52rem", fontWeight: 800, color: "#22d3ee",
                  letterSpacing: "0.16em", textTransform: "uppercase",
                }}>
                  {t("auto.AISECURITY_1110") || "AI SECURITY"}
                </span>
                <motion.span
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.3, 0.8] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  style={{ width: 5, height: 5, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 10px #22d3ee", display: "inline-block" }}
                />
                <span style={{ fontSize: "0.52rem", fontWeight: 600, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {t("auto.REALTIMEINTELLI_918") || "REAL-TIME INTELLIGENCE"}
                </span>
              </motion.div>

              <div style={{ marginBottom: 28 }}>
                <BlurText
                  text="Intelligence Beyond"
                  delay={80}
                  animateBy="words"
                  direction="top"
                  className="hero-headline text-4xl md:text-6xl lg:text-8xl"
                />
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0, duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontSize: "clamp(42px, 10vw, 110px)",
                    fontWeight: 900,
                    lineHeight: 0.88,
                    letterSpacing: "-0.065em",
                    color: "#ffffff",
                    textShadow: "0 20px 60px rgba(0,0,0,0.6)",
                    marginTop: -4,
                  }}
                >
                  <Typewriter words={["Intelligence", "Prediction", "Resonance", "Autonomy"]} />
                </motion.div>
              </div>

              {/* ── Subtext ── */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.9 }}
                style={{
                  fontSize: "clamp(0.9rem, 2vw, 1.05rem)",
                  color: "#b0bec5",
                  maxWidth: 560, lineHeight: 1.75, marginBottom: 48,
                }}
              >
                Kinetic SOS behavioral tracking, AEGIS protocol deployment, Resonance structural health monitoring,
                and AI Green Wave traffic intelligence —{" "}
                <span style={{ color: "#ffffff", fontWeight: 600 }}>{t("auto.poweredbynextge_2611") || "powered by next-gen AI"}</span>.
              </motion.p>

              {/* ── CTA Buttons ── */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.7 }}
                className="flex flex-wrap gap-4 mb-16"
              >
                <MagBtn primary onClick={() => router.push("/register")}>
                  <Zap size={14} /> {t("auto.DeployIntellige_4320") || "Deploy Intelligence"} <ChevronRight size={13} />
                </MagBtn>
                <MagBtn onClick={() => router.push("/dashboard")}>
                  <Eye size={14} /> {t("auto.ViewLiveDemo_455") || "View Live Demo"}
                </MagBtn>
              </motion.div>

              {/* ── Stats ── */}
              <div className="mb-10">
                <StatsGrid />
              </div>

            </div>
          </div>
        </motion.main>



        {/* ── All Sections ── */}
        <TrustSection />
        <DashboardPreview />
        <FeaturesSection />
        <HowItWorksSection />
        <UseCasesSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <FinalCTA
          onGetStarted={() => router.push("/register")}
          onLogin={() => router.push("/login")}
        />
        <Footer />
      </div>

    </div>
  );
}