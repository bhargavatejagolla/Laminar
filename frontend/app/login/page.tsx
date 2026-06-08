"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from '@react-oauth/google';
import { login, loginWithGoogle } from "@/services/auth";
import { ChevronLeft, Mail, Eye, EyeOff, Key, AlertCircle, Fingerprint, Zap } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import Link from "next/link";
import Orb from "@/components/ui/Orb";
import GradientBlinds from "@/components/ui/GradientBlinds";
import { useTranslation } from "react-i18next";

/* ══════════════════════════════════════════════════════════
   ORB BACKGROUND — Shader-based interactive orb
══════════════════════════════════════════════════════════ */
function OrbBackground() {
  const { t } = useTranslation();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <Orb
        hue={0}
        hoverIntensity={1.5}
        rotateOnHover
        backgroundColor="#000000"
      />
    </motion.div>
  );
}

function BlindsBackground() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <GradientBlinds
        gradientColors={['#0f172a', '#1e293b', '#000000', '#1e1b4b']}
        angle={20}
        noise={0.4}
        blindCount={20}
        blindMinWidth={40}
        spotlightRadius={0.7}
        spotlightSoftness={0.8}
        spotlightOpacity={0.6}
        mouseDampening={0.1}
        distortAmount={0.2}
        shineDirection="left"
        mixBlendMode="lighten"
      />
    </motion.div>
  );
}

function BackgroundToggle({ mode, setMode }: { mode: 'orb' | 'blinds', setMode: (m: 'orb' | 'blinds') => void }) {
  return (
    <div className="fixed top-6 right-6 md:top-6 md:right-6 bottom-6 md:bottom-auto left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 z-[100] flex gap-2 bg-[rgba(10,15,35,0.6)] p-1 rounded-xl border border-[rgba(80,140,255,0.15)] backdrop-blur-xl">
      {(['orb', 'blinds'] as const).map((m) => (
        <motion.button key={m} onClick={() => setMode(m)}
          whileHover={{ scale: 1.05, background: mode === m ? "rgba(80,140,255,0.2)" : "rgba(255,255,255,0.05)" }}
          whileTap={{ scale: 0.95 }}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: mode === m ? "rgba(80,140,255,0.18)" : "transparent", color: mode === m ? "#fff" : "#64748b", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", transition: "all 0.2s" }}>
          {m}
        </motion.button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   GLITCH TEXT
══════════════════════════════════════════════════════════ */
function GlitchText({ text, accent }: { text: string; accent?: string }) {
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    const i = setInterval(() => { setGlitch(true); setTimeout(() => setGlitch(false), 180 + Math.random() * 160); }, 4500 + Math.random() * 3000);
    return () => clearInterval(i);
  }, []);
  return (
    <h1 style={{ fontSize: "1.65rem", fontWeight: 800, letterSpacing: "0.18em", color: "#fff", marginBottom: "8px", position: "relative", display: "inline-block", fontFamily: "'General Sans','Inter',sans-serif" }}>
      <span style={{ position: "relative" }}>
        {text}
        {glitch && <><span style={{ position: "absolute", left: "2px", top: 0, color: "#ff0055", clipPath: "inset(20% 0 60% 0)", opacity: 0.75 }}>{text}</span><span style={{ position: "absolute", left: "-2px", top: 0, color: "#00ffff", clipPath: "inset(60% 0 10% 0)", opacity: 0.75 }}>{text}</span></>}
      </span>
      {accent && <span style={{ background: "linear-gradient(135deg,#4f8fff,#7c5cff,#ff5cee)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", fontWeight: 300, marginLeft: "0.3em" }}>{accent}</span>}
    </h1>
  );
}

/* ══════════════════════════════════════════════════════════
   NEURAL LOGO
══════════════════════════════════════════════════════════ */
function NeuralLogo() {
  return (
    <div style={{ width: 80, height: 80, position: "relative", margin: "0 auto 28px" }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid transparent", borderTopColor: "#4f8fff", borderRightColor: "rgba(79,143,255,0.3)" }} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", inset: 9, borderRadius: "50%", border: "1px solid transparent", borderBottomColor: "#9c5cff", borderLeftColor: "rgba(156,92,255,0.3)" }} />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 16, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", inset: 18, borderRadius: "50%", border: "1px solid rgba(0,200,255,0.2)", borderTopColor: "rgba(0,200,255,0.6)" }} />
      <motion.div animate={{ scale: [0.8, 1.1, 0.8], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2.2, repeat: Infinity }} style={{ position: "absolute", inset: 22, borderRadius: "50%", background: "radial-gradient(circle,rgba(79,143,255,0.5) 0%,rgba(120,80,255,0.2) 60%,transparent 100%)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={{ filter: ["drop-shadow(0 0 4px rgba(79,143,255,0.6))","drop-shadow(0 0 14px rgba(120,80,255,0.9))","drop-shadow(0 0 4px rgba(79,143,255,0.6))"] }} transition={{ duration: 2, repeat: Infinity }}><Zap size={22} color="#4f8fff" /></motion.div>
      </div>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", top: 1, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: "50%", background: "#4f8fff", boxShadow: "0 0 10px #4f8fff,0 0 20px #4f8fff80" }} />
      </motion.div>
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", inset: 9 }}>
        <div style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: "#9c5cff", boxShadow: "0 0 6px #9c5cff" }} />
      </motion.div>
    </div>
  );
}

function ScanLine({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && <motion.div key="scan" initial={{ top: 0, opacity: 1 }} animate={{ top: "100%" }} exit={{ opacity: 0 }} transition={{ duration: 1.1, ease: "linear" }}
        style={{ position: "absolute", left: 0, right: 0, height: "2px", zIndex: 30, pointerEvents: "none", background: "linear-gradient(90deg,transparent,rgba(80,140,255,0.8) 20%,rgba(170,220,255,1) 50%,rgba(80,140,255,0.8) 80%,transparent)", boxShadow: "0 0 18px rgba(80,140,255,0.9),0 0 40px rgba(80,140,255,0.4)" }} />}
    </AnimatePresence>
  );
}

function HoloShimmer({ mousePos }: { mousePos: { x: number; y: number } | null }) {
  if (!mousePos) return null;
  return <div style={{ position: "absolute", inset: 0, borderRadius: "30px", pointerEvents: "none", zIndex: 5, background: `radial-gradient(circle 240px at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.038) 0%, rgba(100,180,255,0.02) 40%, transparent 70%)` }} />;
}

/* ══════════════════════════════════════════════════════════
   MAIN LOGIN PAGE
══════════════════════════════════════════════════════════ */
export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [cardHoverPos, setCardHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [bgMode, setBgMode] = useState<'orb' | 'blinds'>('orb');
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0), mouseY = useMotionValue(0);
  const sX = useSpring(mouseX, { stiffness: 70, damping: 18 });
  const sY = useSpring(mouseY, { stiffness: 70, damping: 18 });
  const rawTiltX = useMotionValue(0), rawTiltY = useMotionValue(0);
  const tiltX = useSpring(rawTiltX, { stiffness: 100, damping: 25 });
  const tiltY = useSpring(rawTiltY, { stiffness: 100, damping: 25 });
  const rotateX = useTransform(tiltY, [-1, 1], [8, -8]);
  const rotateY = useTransform(tiltX, [-1, 1], [-8, 8]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      mouseX.set(e.clientX); mouseY.set(e.clientY);
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        const prox = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 0.4);
        rawTiltX.set(dx * prox); rawTiltY.set(dy * prox);
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) setCardHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        else setCardHoverPos(null);
      }
    };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, [mouseX, mouseY, rawTiltX, rawTiltY]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setErrorMsg("Email and password are required."); return; }
    setScanActive(true);
    setTimeout(async () => {
      try { 
        setLoading(true); 
        setErrorMsg(""); 
        const res = await login(email, password); 
        
        if (res?.verification_required) {
          router.push(`/verify-email?email=${encodeURIComponent(res.email || email)}`);
          return;
        }

        router.push("/onboarding"); 
      }
      catch (err: any) { setErrorMsg(err.response?.data?.detail || "Authentication failed."); setScanActive(false); }
      finally { setLoading(false); }
    }, 1200);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#00000f", color: "#e2e8f0", fontFamily: "'General Sans','Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
      <AnimatePresence mode="wait">
        {bgMode === 'orb' ? <OrbBackground key="orb" /> : <BlindsBackground key="blinds" />}
      </AnimatePresence>
      <BackgroundToggle mode={bgMode} setMode={setBgMode} />

      {/* Cursor spotlight */}
      <motion.div style={{ position: "fixed", zIndex: 3, pointerEvents: "none", width: 650, height: 650, borderRadius: "50%", background: "radial-gradient(circle,rgba(80,140,255,0.07) 0%,transparent 60%)", x: sX, y: sY, translateX: "-50%", translateY: "-50%" } as any} />

      {/* 3D tilting card */}
      <motion.div initial={{ opacity: 0, y: 60, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[480px] px-4" style={{ perspective: "1000px" }}>
        <motion.div ref={cardRef} style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            style={{ position: "absolute", inset: "-1.5px", borderRadius: "30px", zIndex: -1, background: "conic-gradient(from 0deg,#0a1535,#4f8fff,#9c5cff,#ff5cee,#4f8fff,#0a1535)", opacity: 0.8 }} />
          <motion.div animate={{ opacity: [0.25, 0.65, 0.25], scale: [1, 1.04, 1] }} transition={{ duration: 4, repeat: Infinity }}
            style={{ position: "absolute", inset: "-28px", borderRadius: "50px", zIndex: -2, background: "radial-gradient(ellipse at center,rgba(79,143,255,0.22) 0%,rgba(120,80,255,0.1) 50%,transparent 80%)", filter: "blur(20px)" }} />

          <div className="bg-[rgba(3,5,18,0.97)] border border-[rgba(80,140,255,0.12)] rounded-[30px] backdrop-blur-[60px] shadow-[0_70px_140px_rgba(0,0,0,0.97),0_0_0_1px_rgba(80,140,255,0.06),inset_0_1px_0_rgba(255,255,255,0.05)] p-8 md:p-12 relative overflow-hidden">
            <HoloShimmer mousePos={cardHoverPos} />
            <div style={{ position: "absolute", top: 0, left: "8%", right: "8%", height: "1px", background: "linear-gradient(90deg,transparent,rgba(79,143,255,0.6),rgba(180,160,255,0.9),rgba(79,143,255,0.6),transparent)" }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "130px", background: "linear-gradient(to bottom,rgba(60,100,255,0.05) 0%,transparent 100%)", pointerEvents: "none" }} />
            <ScanLine active={scanActive} />

            {([{ top: 16, right: 16 }, { top: 16, left: 16 }, { bottom: 16, right: 16 }, { bottom: 16, left: 16 }] as Record<string, number>[]).map((pos, i) => (
              <motion.div key={i} animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.55 }}
                style={{ position: "absolute", ...pos, width: 4, height: 4, borderRadius: "50%", background: i % 2 === 0 ? "#4f8fff" : "#9c5cff", boxShadow: `0 0 8px ${i % 2 === 0 ? "#4f8fff" : "#9c5cff"}` }} />
            ))}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "40px" }}>
              <Link href="/"><motion.div whileHover={{ x: -3, color: "#e2e8f0" }} style={{ display: "flex", alignItems: "center", gap: "6px", color: "#334155", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer", transition: "color 0.2s" }}><ChevronLeft style={{ width: 13, height: 13 }} /> {t("auto.Back_4922") || "Back"}</motion.div></Link>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.56rem", fontWeight: 700, color: "#4f8fff", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                  <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: 5, height: 5, borderRadius: "50%", background: "#4f8fff", boxShadow: "0 0 10px #4f8fff" }} /> {t("auto.Secure_6383") || "Secure"}
                </motion.div>
                <motion.button whileHover={{ scale: 1.05, borderColor: "rgba(80,140,255,0.7)", boxShadow: "0 0 20px rgba(80,140,255,0.2)" }} whileTap={{ scale: 0.97 }} onClick={() => router.push("/register")}
                  style={{ background: "rgba(80,140,255,0.07)", border: "1px solid rgba(80,140,255,0.22)", color: "#7aabff", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", padding: "7px 18px", borderRadius: "999px", cursor: "pointer", transition: "all 0.25s", fontFamily: "inherit" }}>{t("auto.Register_3958") || "Register"}</motion.button>
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <NeuralLogo />
              <GlitchText text="LAMINAR" accent="ACCESS" />
              <p style={{ fontSize: "0.6rem", color: "#1e2d4a", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.18em", marginTop: "6px" }}>
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2.5, repeat: Infinity }} style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#1e3a6b", boxShadow: "0 0 8px #4f8fff40" }} />
                {t("auto.AIOperationsPor_9401") || "AI Operations Portal"}
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2.5, repeat: Infinity, delay: 1.25 }} style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#1e3a6b", boxShadow: "0 0 8px #4f8fff40" }} />
              </p>
            </div>

            <AnimatePresence>
              {errorMsg && <motion.div initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                style={{ marginBottom: "18px", padding: "12px 16px", borderRadius: "14px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "10px" }}>
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {errorMsg}
              </motion.div>}
            </AnimatePresence>

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={{ background: "rgba(6,9,24,0.9)", border: "1px solid rgba(80,140,255,0.1)", borderRadius: "20px", padding: "26px", display: "flex", flexDirection: "column", gap: "20px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "1px", background: "linear-gradient(90deg,transparent,rgba(80,140,255,0.18),transparent)", pointerEvents: "none" }} />

                {/* Email */}
                <div>
                  <label style={{ display: "block", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: "9px", color: focusedField === "email" ? "#6aabff" : "#2d3f5a", transition: "color 0.35s" }}>{t("auto.OperatorID_5484") || "Operator ID"}</label>
                  <div style={{ position: "relative" }}>
                    <Mail style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: focusedField === "email" ? "#5a9fff" : "#2d3f5a", transition: "color 0.35s", pointerEvents: "none" }} />
                    <motion.input type="email" placeholder={t("auto.operatorlaminar_7295") || "operator@laminar.ai"} value={email} onChange={e => setEmail(e.target.value)} onFocus={() => setFocusedField("email")} onBlur={() => setFocusedField(null)}
                      animate={{ boxShadow: focusedField === "email" ? "0 0 0 1px rgba(80,140,255,0.55),0 0 22px rgba(80,140,255,0.12)" : "0 0 0 0px rgba(80,140,255,0)" }}
                      style={{ width: "100%", background: "rgba(6,9,28,0.9)", border: `1px solid ${focusedField === "email" ? "rgba(80,140,255,0.55)" : "rgba(80,140,255,0.1)"}`, borderRadius: "13px", color: "#e2e8f0", fontSize: "0.875rem", padding: "14px 15px 14px 42px", outline: "none", transition: "border-color 0.35s", fontFamily: "inherit" }} />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "9px" }}>
                    <label style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: focusedField === "password" ? "#6aabff" : "#2d3f5a", transition: "color 0.35s" }}>{t("auto.AuthKey_8910") || "Auth Key"}</label>
                    <motion.span whileHover={{ color: "#5a9fff" }} style={{ fontSize: "0.58rem", color: "#243044", cursor: "pointer", fontWeight: 700 }}>{t("auto.Forgot_1358") || "Forgot?"}</motion.span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <Key style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: focusedField === "password" ? "#5a9fff" : "#2d3f5a", transition: "color 0.35s", pointerEvents: "none" }} />
                    <motion.input type={showPassword ? "text" : "password"} placeholder="••••••••••••" value={password} onChange={e => setPassword(e.target.value)} onFocus={() => setFocusedField("password")} onBlur={() => setFocusedField(null)}
                      animate={{ boxShadow: focusedField === "password" ? "0 0 0 1px rgba(80,140,255,0.55),0 0 22px rgba(80,140,255,0.12)" : "0 0 0 0px rgba(80,140,255,0)" }}
                      style={{ width: "100%", background: "rgba(6,9,28,0.9)", border: `1px solid ${focusedField === "password" ? "rgba(80,140,255,0.55)" : "rgba(80,140,255,0.1)"}`, borderRadius: "13px", color: "#e2e8f0", fontSize: "0.875rem", padding: "14px 46px 14px 42px", outline: "none", transition: "border-color 0.35s", fontFamily: "inherit" }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#2d3f5a", display: "flex" }}>
                      {showPassword ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <motion.button type="submit" disabled={loading || scanActive}
                  whileHover={!loading && !scanActive ? { y: -2, boxShadow: "0 0 60px rgba(80,140,255,0.6),0 0 120px rgba(120,80,255,0.3)" } : {}}
                  whileTap={{ scale: 0.97 }}
                  animate={scanActive ? { boxShadow: ["0 0 30px rgba(80,140,255,0.5)","0 0 80px rgba(120,80,255,0.9)","0 0 30px rgba(80,140,255,0.5)"] } : {}}
                  transition={scanActive ? { duration: 0.6, repeat: Infinity } : {}}
                  style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", cursor: "pointer", background: "linear-gradient(135deg,#1a50e8 0%,#4f8fff 45%,#9c5cff 100%)", color: "#fff", fontWeight: 800, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: "9px", boxShadow: "0 0 40px rgba(80,140,255,0.4),0 6px 24px rgba(0,0,0,0.5)", opacity: loading ? 0.75 : 1, marginTop: "6px", position: "relative", overflow: "hidden", fontFamily: "inherit", transition: "opacity 0.2s" }}>
                  <motion.div animate={{ x: ["-200%","200%"] }} transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }} style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)" }} />
                  {loading ? (<><motion.div animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%" }} />{t("auto.Authenticating_2806") || "Authenticating..."}</>)
                    : scanActive ? (<><Fingerprint style={{ width: 15, height: 15 }} /> {t("auto.Scanning_4915") || "Scanning..."}</>)
                    : (<><Fingerprint style={{ width: 15, height: 15 }} /> {t("auto.InitializeSessi_3507") || "Initialize Session"}</>)}
                </motion.button>
              </motion.div>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "22px 0" }}>
              <div style={{ flex: 1, height: "1px", background: "linear-gradient(to right,transparent,rgba(80,140,255,0.14))" }} />
              <span style={{ fontSize: "0.56rem", color: "#1e2d44", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em" }}>{t("auto.orcontinuewith_260") || "or continue with"}</span>
              <div style={{ flex: 1, height: "1px", background: "linear-gradient(to left,transparent,rgba(80,140,255,0.14))" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <GoogleLogin 
                onSuccess={async (cr) => { 
                  try { 
                    setLoading(true); 
                    if (cr.credential) { 
                      const res = await loginWithGoogle(cr.credential); 
                      console.log("Laminar Auth (Google):", res);
                      
                      if (res?.verification_required) {
                        const target = `/verify-email?email=${encodeURIComponent(res.email || "")}`;
                        console.log("Verification required. Redirecting to:", target);
                        router.push(target);
                        return;
                      }

                      console.log("Login successful. Redirecting to onboarding.");
                      router.push("/onboarding"); 
                    } 
                  } catch (err: any) { 
                    console.error("Laminar Auth Error:", err);
                    setErrorMsg(err.response?.data?.detail || "OAuth failed."); 
                    setLoading(false); 
                  } 
                }} 
                onError={() => setErrorMsg("OAuth failed.")} 
                theme="filled_black" 
                shape="rectangular" 
                size="large" 
                text="continue_with" 
              />
            </div>

            <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#1e2d44", marginTop: "24px" }}>
              New operator?{" "}<motion.button type="button" onClick={() => router.push("/register")} whileHover={{ scale: 1.05, color: "#7aabff" }} style={{ background: "none", border: "none", color: "#4f8fff", fontWeight: 700, cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>Request Access →</motion.button>
            </p>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} style={{ marginTop: "26px", paddingTop: "18px", borderTop: "1px solid rgba(80,140,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", gap: "18px" }}>
              {["256-bit AES","OAuth 2.0","Zero Trust"].map((label, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.75 }} style={{ width: 4, height: 4, borderRadius: "50%", background: "#1a3568", boxShadow: "0 0 6px #4f8fff50" }} />
                  <span style={{ fontSize: "0.52rem", color: "#1e2d44", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
      <style>{`input::placeholder{color:#1e2d44}input::-webkit-autofill{-webkit-box-shadow:0 0 0 100px rgba(6,9,28,0.95) inset !important;-webkit-text-fill-color:#e2e8f0 !important}`}</style>
    </div>
  );
}