"use client";

import { useState, useEffect, useRef } from "react";
import { register, loginWithGoogle } from "@/services/auth";
import { useRouter } from "next/navigation";
import { GoogleLogin } from '@react-oauth/google';
import { ChevronLeft, Mail, Eye, EyeOff, Key, Lock, AlertCircle, CheckCircle, UserPlus, Shield, User } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import Link from "next/link";
import Orb from "@/components/ui/Orb";
import { GridScan } from "@/components/ui/GridScan";
import { useTranslation } from "react-i18next";

/* ══════════════════════════════════════════════════════════
   ORB BACKGROUND — Shader-based interactive orb
══════════════════════════════════════════════════════════ */
function OrbBackground() {
  const { t } = useTranslation();
return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <Orb
        hue={160}
        hoverIntensity={1.5}
        rotateOnHover
        backgroundColor="#000000"
      />
    </motion.div>
  );
}

function GridScanBackground() {
  const { t } = useTranslation();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <GridScan
        sensitivity={0.55}
        lineThickness={1}
        linesColor="#062d22"
        gridScale={0.15}
        scanColor="#00e6a0"
        scanOpacity={0.35}
        enablePost
        bloomIntensity={0.6}
        chromaticAberration={0.002}
        noiseIntensity={0.01}
        scanDuration={2.5}
        scanDelay={1.5}
      />
    </motion.div>
  );
}

function BackgroundToggle({ mode, setMode }: { mode: 'orb' | 'scan', setMode: (m: 'orb' | 'scan') => void }) {
  return (
    <div className="fixed top-6 right-6 md:top-6 md:right-6 bottom-6 md:bottom-auto left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 z-[100] flex gap-2 bg-[rgba(2,10,24,0.6)] p-1 rounded-xl border border-[rgba(0,230,160,0.15)] backdrop-blur-xl">
      {(['orb', 'scan'] as const).map((m) => (
        <motion.button key={m} onClick={() => setMode(m)}
          whileHover={{ scale: 1.05, background: mode === m ? "rgba(0,230,160,0.2)" : "rgba(255,255,255,0.05)" }}
          whileTap={{ scale: 0.95 }}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: mode === m ? "rgba(0,230,160,0.18)" : "transparent", color: mode === m ? "#fff" : "#64748b", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", transition: "all 0.2s" }}>
          {m}
        </motion.button>
      ))}
    </div>
  );
}

// FilmGrain removed — replaced by CSSGrain above (zero CPU cost)

/* ══════════════════════════════════════════════════════════
   DNA HELIX LOGO — unique vs login's Zap icon
══════════════════════════════════════════════════════════ */
function DNALogo() {
  const { t } = useTranslation();
  return (
    <div style={{ width: 80, height: 80, position: "relative", margin: "0 auto 28px" }}>
      {/* Outer ring slow pulse */}
      <motion.div
        animate={{ rotate: 360, scale: [1, 1.05, 1] }}
        transition={{ rotate: { duration: 20, repeat: Infinity, ease: "linear" }, scale: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
        style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: "1px solid transparent",
          borderTopColor: "#00e6a0",
          borderRightColor: "rgba(0,230,160,0.3)",
          borderBottomColor: "transparent",
          borderLeftColor: "rgba(0,230,160,0.15)",
        }}
      />
      {/* Mid ring counter + dashed */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", inset: 9, borderRadius: "50%",
          border: "1px dashed rgba(0,200,200,0.3)",
          borderTopColor: "#00c8c8",
        }}
      />
      {/* Inner glow pulse */}
      <motion.div
        animate={{ scale: [0.75, 1.08, 0.75], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", inset: 20, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,230,160,0.55) 0%, rgba(0,200,150,0.2) 60%, transparent 100%)",
        }}
      />
      {/* Center icon: shield */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div
          animate={{
            filter: [
              "drop-shadow(0 0 4px rgba(0,230,160,0.6))",
              "drop-shadow(0 0 16px rgba(0,255,180,1))",
              "drop-shadow(0 0 4px rgba(0,230,160,0.6))",
            ],
          }}
          transition={{ duration: 2.2, repeat: Infinity }}
        >
          <Shield size={22} color="#00e6a0" strokeWidth={1.5} />
        </motion.div>
      </div>
      {/* Orbiting dot: emerald */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        style={{ position: "absolute", inset: 0 }}
      >
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 6, height: 6, borderRadius: "50%",
          background: "#00e6a0",
          boxShadow: "0 0 10px #00e6a0, 0 0 20px #00e6a080",
        }} />
      </motion.div>
      {/* Opposite dot: teal */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        style={{ position: "absolute", inset: 9 }}
      >
        <div style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: 4, height: 4, borderRadius: "50%",
          background: "#00c8c8",
          boxShadow: "0 0 8px #00c8c8",
        }} />
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PASSWORD STRENGTH VISUALIZER
══════════════════════════════════════════════════════════ */
function StrengthBar({ strength }: { strength: number }) {
  const { t } = useTranslation();
  const segments = [25, 50, 75, 100];
  const label = strength < 40 ? "Weak" : strength < 70 ? "Moderate" : strength < 95 ? "Strong" : "Fortress";
  const color = strength < 40 ? "#ef4444" : strength < 70 ? "#f59e0b" : strength < 95 ? "#00e6a0" : "#00ffcc";
  const glow = strength < 40 ? "rgba(239,68,68,0.4)" : strength < 70 ? "rgba(245,158,11,0.4)" : "rgba(0,230,160,0.5)";

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: "10px" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "6px" }}>
        {segments.map((seg, i) => (
          <motion.div key={i}
            animate={{ opacity: strength >= seg ? 1 : 0.12 }}
            transition={{ duration: 0.3 }}
            style={{
              flex: 1, height: "3px", borderRadius: "999px",
              background: strength >= seg ? color : "rgba(255,255,255,0.1)",
              boxShadow: strength >= seg ? `0 0 6px ${glow}` : "none",
              transition: "background 0.4s",
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: "0.58rem", color: "#334155" }}>
        Encryption strength:{" "}
        <span style={{ color, fontWeight: 800 }}>{label}</span>
      </p>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   SUCCESS PARTICLE BURST
══════════════════════════════════════════════════════════ */
function SuccessBurst({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="burst"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "absolute", inset: 0, borderRadius: "30px", pointerEvents: "none", zIndex: 40, overflow: "hidden" }}
        >
          {/* Green scan line */}
          <motion.div
            initial={{ top: 0 }}
            animate={{ top: "100%" }}
            transition={{ duration: 1.8, ease: "linear" }}
            style={{
              position: "absolute", left: 0, right: 0, height: "2px",
              background: "linear-gradient(90deg, transparent, rgba(0,230,160,0.8), rgba(0,255,200,1), rgba(0,230,160,0.8), transparent)",
              boxShadow: "0 0 20px rgba(0,230,160,0.9), 0 0 50px rgba(0,230,160,0.4)",
            }}
          />
          {/* Emerald flash */}
          <motion.div
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse at center, rgba(0,230,160,0.12) 0%, transparent 70%)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════════════════════════
   HOLOGRAPHIC SHIMMER
══════════════════════════════════════════════════════════ */
function HoloShimmer({ mousePos }: { mousePos: { x: number; y: number } | null }) {
  const { t } = useTranslation();
  if (!mousePos) return null;
  return (
    <div style={{
      position: "absolute", inset: 0, borderRadius: "30px", pointerEvents: "none", zIndex: 5,
      background: `radial-gradient(circle 260px at ${mousePos.x}px ${mousePos.y}px,
        rgba(0,230,160,0.04) 0%, rgba(0,200,200,0.025) 40%, transparent 70%)`,
    }} />
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN REGISTER PAGE
══════════════════════════════════════════════════════════ */
export default function RegisterPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [cardHoverPos, setCardHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [bgMode, setBgMode] = useState<'orb' | 'scan'>('orb');
  const cardRef = useRef<HTMLDivElement>(null);

  // 3D tilt
  const rawTiltX = useMotionValue(0);
  const rawTiltY = useMotionValue(0);
  const tiltX = useSpring(rawTiltX, { stiffness: 90, damping: 22 });
  const tiltY = useSpring(rawTiltY, { stiffness: 90, damping: 22 });
  const rotateX = useTransform(tiltY, [-1, 1], [7, -7]);
  const rotateY = useTransform(tiltX, [-1, 1], [-7, 7]);

  // Cursor spotlight
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const sX = useSpring(mouseX, { stiffness: 65, damping: 18 });
  const sY = useSpring(mouseY, { stiffness: 65, damping: 18 });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        const proximity = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 0.45);
        rawTiltX.set(dx * proximity);
        rawTiltY.set(dy * proximity);
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          setCardHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        } else {
          setCardHoverPos(null);
        }
      }
    };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, [mouseX, mouseY, rawTiltX, rawTiltY]);

  useEffect(() => {
    let s = 0;
    if (password.length >= 8) s += 25;
    if (/[a-z]/.test(password)) s += 20;
    if (/[A-Z]/.test(password)) s += 20;
    if (/[0-9]/.test(password)) s += 20;
    if (/[^a-zA-Z0-9]/.test(password)) s += 15;
    setPasswordStrength(Math.min(s, 100));
  }, [password]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 6) { setErrorMsg("Valid email and min 6-char password required."); return; }
    if (password !== confirmPassword) { setErrorMsg("Passwords do not match."); return; }
    try {
      setLoading(true); setErrorMsg("");
      await register(email, password, fullName.trim() || undefined);
      setSuccessMsg(true);
      setTimeout(() => router.push(`/verify-email?email=${encodeURIComponent(email)}`), 2400);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Registration failed.");
    } finally { setLoading(false); }
  }

  const hasMatch = confirmPassword.length > 0 && password === confirmPassword;
  const hasMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  // Field accent color
  const ACCENT = "#00e6a0";
  const ACCENT_DIM = "rgba(0,230,160,";
  const fieldBorder = (field: string, override?: string) =>
    override || (focusedField === field ? `${ACCENT_DIM}0.55)` : "rgba(0,230,160,0.1)");
  const fieldGlow = (field: string) =>
    focusedField === field ? `0 0 0 1px ${ACCENT_DIM}0.5), 0 0 22px ${ACCENT_DIM}0.1)` : `0 0 0 0px ${ACCENT_DIM}0)`;

  return (
    <div className="auth-page" style={{
      minHeight: "100vh",
      background: "#00030c",
      color: "#e2e8f0",
      fontFamily: "'General Sans', 'Inter', sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
      padding: "32px 20px",
    }}>
      <AnimatePresence mode="wait">
        {bgMode === 'orb' ? <OrbBackground key="orb" /> : <GridScanBackground key="scan" />}
      </AnimatePresence>
      <BackgroundToggle mode={bgMode} setMode={setBgMode} />


      {/* ── Cursor spotlight — emerald ── */}
      <motion.div
        style={{
          position: "fixed", zIndex: 3, pointerEvents: "none",
          width: 650, height: 650, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,220,140,0.05) 0%, transparent 60%)",
          x: sX, y: sY, translateX: "-50%", translateY: "-50%",
        } as any}
      />

      {/* ── Hex grid vignette overlay ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 30%, rgba(0,3,12,0.7) 100%)",
      }} />

      {/* ── 3D Tilt card ── */}
      <motion.div
        initial={{ opacity: 0, y: 70, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "490px",
          perspective: "1100px",
          padding: "0 16px", // Added responsiveness
        }}
      >
        <motion.div
          ref={cardRef}
          style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        >
          {/* Spinning conic border — emerald/teal/gold palette */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            style={{
              position: "absolute", inset: "-1.5px", borderRadius: "30px", zIndex: -1,
              background: "conic-gradient(from 0deg, #003d28, #00e6a0, #00c8c8, #ffd54f, #00e6a0, #003d28)",
              opacity: 0.75,
            }}
          />
          {/* Glow halo */}
          <motion.div
            animate={{ opacity: [0.2, 0.65, 0.2], scale: [1, 1.05, 1] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute", inset: "-30px", borderRadius: "55px", zIndex: -2,
              background: "radial-gradient(ellipse at center, rgba(0,230,160,0.16) 0%, rgba(0,200,200,0.07) 50%, transparent 80%)",
              filter: "blur(22px)",
            }}
          />

          {/* Card body */}
          <div className="bg-[rgba(2,7,20,0.97)] border border-[rgba(0,230,160,0.09)] rounded-[30px] backdrop-blur-[80px] shadow-[0_70px_140px_rgba(0,0,0,0.97),0_0_0_1px_rgba(0,230,160,0.05),inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(0,230,160,0.03)] p-8 md:p-12 relative overflow-hidden">
            {/* Success burst overlay */}
            <SuccessBurst active={successMsg} />

            {/* Holographic shimmer */}
            <HoloShimmer mousePos={cardHoverPos} />

            {/* Top glow bar — emerald */}
            <div style={{
              position: "absolute", top: 0, left: "8%", right: "8%", height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(0,230,160,0.45), rgba(0,255,200,0.7), rgba(0,230,160,0.45), transparent)",
            }} />

            {/* Inner top ambient glow */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "130px",
              background: "linear-gradient(to bottom, rgba(0,200,140,0.035) 0%, transparent 100%)",
              pointerEvents: "none",
            }} />

            {/* 4 corner accent dots — alternate emerald+gold */}
            {([
              { top: 16, right: 16, c: ACCENT },
              { top: 16, left: 16, c: "#ffd54f" },
              { bottom: 16, right: 16, c: "#ffd54f" },
              { bottom: 16, left: 16, c: ACCENT },
            ] as any[]).map((pos, i) => (
              <motion.div key={i}
                animate={{ opacity: [0.15, 1, 0.15], scale: [0.7, 1.3, 0.7] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.6 }}
                style={{
                  position: "absolute",
                  ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
                  ...(pos.right !== undefined ? { right: pos.right } : { left: pos.left }),
                  width: 4, height: 4, borderRadius: "50%",
                  background: pos.c,
                  boxShadow: `0 0 8px ${pos.c}`,
                }}
              />
            ))}

            {/* ── Header nav ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "40px" }}>
              <Link href="/">
                <motion.div
                  whileHover={{ x: -3, color: "#e2e8f0" }}
                  style={{ display: "flex", alignItems: "center", gap: "6px", color: "#334155", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer", transition: "color 0.2s" }}
                >
                  <ChevronLeft style={{ width: 13, height: 13 }} /> {t("auto.Back_4922") || "Back"}
                </motion.div>
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Live indicator */}
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.56rem", fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.14em" }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.6, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ width: 5, height: 5, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 10px ${ACCENT}` }}
                  />
                  {t("auto.Open_3586") || "Open"}
                </motion.div>
                <motion.button
                  whileHover={{ scale: 1.05, borderColor: "rgba(0,230,160,0.7)", boxShadow: "0 0 20px rgba(0,230,160,0.2)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push("/login")}
                  style={{
                    background: "rgba(0,230,160,0.06)", border: "1px solid rgba(0,230,160,0.2)",
                    color: "#00e6a0", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase",
                    padding: "7px 18px", borderRadius: "999px", cursor: "pointer", transition: "all 0.25s",
                    fontFamily: "inherit",
                  }}
                >
                  {t("auto.SignIn_2060") || "Sign In"}
                </motion.button>
              </div>
            </div>

            {/* ── Logo + Brand ── */}
            <div style={{ textAlign: "center", marginBottom: "38px" }}>
              <DNALogo />
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{
                  fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.16em", color: "#fff", marginBottom: "8px",
                  fontFamily: "'General Sans', 'Inter', sans-serif",
                }}
              >
                REQUEST{" "}
                <span style={{
                  background: "linear-gradient(135deg, #00e6a0, #00c8c8, #ffd54f)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  fontWeight: 300,
                }}>{t("auto.CLEARANCE_1633") || "CLEARANCE"}</span>
              </motion.h1>
              <p style={{
                fontSize: "0.6rem", color: "#1e3a30", display: "flex", alignItems: "center",
                justifyContent: "center", gap: "8px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.18em",
              }}>
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#0a3d28", boxShadow: "0 0 8px rgba(0,230,160,0.3)" }}
                />
                {t("auto.LaminarIntellig_5057") || "Laminar Intelligence Network"}
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2.5, repeat: Infinity, delay: 1.25 }}
                  style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#0a3d28", boxShadow: "0 0 8px rgba(0,230,160,0.3)" }}
                />
              </p>
            </div>

            {/* ── Messages ── */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={{
                    marginBottom: "18px", padding: "12px 16px", borderRadius: "14px",
                    background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
                    color: "#f87171", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "10px",
                  }}
                >
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {errorMsg}
                </motion.div>
              )}
              {successMsg && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    marginBottom: "18px", padding: "12px 16px", borderRadius: "14px",
                    background: "rgba(0,230,160,0.08)", border: "1px solid rgba(0,230,160,0.25)",
                    color: ACCENT, fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "10px",
                  }}
                >
                  <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {t("auto.Profileinitiali_4953") || "Profile initialized. Redirecting to mission control..."}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Form ── */}
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  background: "rgba(2, 8, 22, 0.88)",
                  border: "1px solid rgba(0,230,160,0.08)",
                  borderRadius: "20px", padding: "26px",
                  display: "flex", flexDirection: "column", gap: "20px",
                  position: "relative", overflow: "hidden",
                }}
              >
                {/* Inner form top glow */}
                <div style={{
                  position: "absolute", top: 0, left: "20%", right: "20%", height: "1px",
                  background: "linear-gradient(90deg, transparent, rgba(0,230,160,0.12), transparent)",
                  pointerEvents: "none",
                }} />

                {/* ── Full Name ── */}
                <div>
                  <label style={{
                    display: "block", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase",
                    letterSpacing: "0.18em", marginBottom: "9px",
                    color: focusedField === "name" ? ACCENT : "#1a3a2a",
                    transition: "color 0.35s",
                  }}>{t("auto.OperatorName_6855") || "Operator Name"}</label>
                  <div style={{ position: "relative" }}>
                    <User style={{
                      position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)",
                      width: 14, height: 14, color: focusedField === "name" ? ACCENT : "#1a3a2a",
                      transition: "color 0.35s", pointerEvents: "none",
                    }} />
                    <motion.input
                      type="text"
                      placeholder="Your full name"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      onFocus={() => setFocusedField("name")}
                      onBlur={() => setFocusedField(null)}
                      animate={{ boxShadow: fieldGlow("name") }}
                      style={{
                        width: "100%", background: "rgba(2, 8, 22, 0.92)",
                        border: `1px solid ${fieldBorder("name")}`,
                        borderRadius: "13px", color: "#e2e8f0", fontSize: "0.875rem",
                        padding: "14px 15px 14px 44px", outline: "none",
                        transition: "border-color 0.35s", fontFamily: "inherit",
                      }}
                    />
                  </div>
                </div>

                {/* ── Assign Operator ID (Email) ── */}
                <div>
                  <label style={{
                    display: "block", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase",
                    letterSpacing: "0.18em", marginBottom: "9px",
                    color: focusedField === "email" ? ACCENT : "#1a3a2a",
                    transition: "color 0.35s",
                  }}>{t("auto.AssignOperatorI_983") || "Assign Operator ID"}</label>
                  <div style={{ position: "relative" }}>
                    <Mail style={{
                      position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)",
                      width: 14, height: 14, color: focusedField === "email" ? ACCENT : "#1a3a2a",
                      transition: "color 0.35s", pointerEvents: "none",
                    }} />
                    <motion.input
                      type="email"
                      placeholder="new.operator@laminar.ai"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onFocus={() => setFocusedField("email")}
                      onBlur={() => setFocusedField(null)}
                      animate={{ boxShadow: fieldGlow("email") }}
                      style={{
                        width: "100%", background: "rgba(2, 8, 22, 0.92)",
                        border: `1px solid ${fieldBorder("email")}`,
                        borderRadius: "13px", color: "#e2e8f0", fontSize: "0.875rem",
                        padding: "14px 15px 14px 44px", outline: "none",
                        transition: "border-color 0.35s", fontFamily: "inherit",
                      }}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label style={{
                    display: "block", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase",
                    letterSpacing: "0.18em", marginBottom: "9px",
                    color: focusedField === "password" ? ACCENT : "#1a3a2a",
                    transition: "color 0.35s",
                  }}>{t("auto.AssignSecurityK_1809") || "Assign Security Key"}</label>
                  <div style={{ position: "relative" }}>
                    <Key style={{
                      position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)",
                      width: 14, height: 14, color: focusedField === "password" ? ACCENT : "#1a3a2a",
                      transition: "color 0.35s", pointerEvents: "none",
                    }} />
                    <motion.input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      animate={{ boxShadow: fieldGlow("password") }}
                      style={{
                        width: "100%", background: "rgba(2, 8, 22, 0.92)",
                        border: `1px solid ${fieldBorder("password")}`,
                        borderRadius: "13px", color: "#e2e8f0", fontSize: "0.875rem",
                        padding: "14px 46px 14px 44px", outline: "none",
                        transition: "border-color 0.35s", fontFamily: "inherit",
                      }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#1a3a2a", display: "flex",
                    }}>
                      {showPassword ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                    </button>
                  </div>
                  {password && <StrengthBar strength={passwordStrength} />}
                </div>

                {/* Confirm password */}
                <div>
                  <label style={{
                    display: "block", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase",
                    letterSpacing: "0.18em", marginBottom: "9px",
                    color: focusedField === "confirm" ? ACCENT : "#1a3a2a",
                    transition: "color 0.35s",
                  }}>{t("auto.ConfirmSecurity_6439") || "Confirm Security Key"}</label>
                  <div style={{ position: "relative" }}>
                    <Lock style={{
                      position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)",
                      width: 14, height: 14,
                      color: hasMatch ? ACCENT : hasMismatch ? "#ef4444" : (focusedField === "confirm" ? ACCENT : "#1a3a2a"),
                      transition: "color 0.35s", pointerEvents: "none",
                    }} />
                    <motion.input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      onFocus={() => setFocusedField("confirm")}
                      onBlur={() => setFocusedField(null)}
                      animate={{
                        boxShadow: hasMatch
                          ? `0 0 0 1px rgba(0,230,160,0.6), 0 0 20px rgba(0,230,160,0.12)`
                          : hasMismatch
                          ? `0 0 0 1px rgba(239,68,68,0.5), 0 0 16px rgba(239,68,68,0.08)`
                          : fieldGlow("confirm"),
                      }}
                      style={{
                        width: "100%", background: "rgba(2, 8, 22, 0.92)",
                        border: `1px solid ${
                          hasMatch ? "rgba(0,230,160,0.55)"
                          : hasMismatch ? "rgba(239,68,68,0.45)"
                          : fieldBorder("confirm")
                        }`,
                        borderRadius: "13px", color: "#e2e8f0", fontSize: "0.875rem",
                        padding: "14px 46px 14px 44px", outline: "none",
                        transition: "border-color 0.35s", fontFamily: "inherit",
                      }}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#1a3a2a", display: "flex",
                    }}>
                      {showConfirmPassword ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                    </button>
                  </div>
                  <AnimatePresence>
                    {confirmPassword && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        style={{ fontSize: "0.58rem", marginTop: "7px", display: "flex", alignItems: "center", gap: "5px", color: hasMatch ? ACCENT : "#f87171" }}
                      >
                        {hasMatch
                          ? <><CheckCircle style={{ width: 10, height: 10 }} /> Secured — keys match</>
                          : <><AlertCircle style={{ width: 10, height: 10 }} /> {t("auto.Keysdonotmatch_4914") || "Keys do not match"}</>}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={loading || successMsg}
                  whileHover={!loading && !successMsg ? {
                    y: -2,
                    boxShadow: "0 0 60px rgba(0,230,160,0.55), 0 0 120px rgba(0,200,200,0.25)",
                  } : {}}
                  whileTap={{ scale: 0.97 }}
                  animate={successMsg ? { boxShadow: ["0 0 30px rgba(0,230,160,0.5)", "0 0 80px rgba(0,230,160,0.9)", "0 0 30px rgba(0,230,160,0.5)"] } : {}}
                  transition={successMsg ? { duration: 0.6, repeat: Infinity } : {}}
                  style={{
                    width: "100%", padding: "16px", borderRadius: "14px", border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg, #006644 0%, #00e6a0 50%, #00c8c8 100%)",
                    color: "#000", fontWeight: 900, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "9px",
                    boxShadow: "0 0 40px rgba(0,230,160,0.38), 0 6px 24px rgba(0,0,0,0.5)",
                    opacity: loading || successMsg ? 0.8 : 1, marginTop: "6px",
                    position: "relative", overflow: "hidden", fontFamily: "inherit",
                    transition: "opacity 0.2s",
                  }}
                >
                  {/* Shimmer sweep */}
                  <motion.div
                    animate={{ x: ["-200%", "200%"] }}
                    transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
                    style={{
                      position: "absolute", inset: 0, pointerEvents: "none",
                      background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)",
                    }}
                  />
                  {loading ? (
                    <>
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                        style={{ width: 14, height: 14, border: "2px solid rgba(0,0,0,0.3)", borderTopColor: "#000", borderRadius: "50%" }}
                      />
                      {t("auto.Initializing_2741") || "Initializing..."}
                    </>
                  ) : successMsg ? (
                    <><CheckCircle style={{ width: 15, height: 15 }} /> {t("auto.ProfileInitiali_4016") || "Profile Initialized"}</>
                  ) : (
                    <><UserPlus style={{ width: 15, height: 15 }} /> {t("auto.InitializeProfi_3371") || "Initialize Profile"}</>
                  )}
                </motion.button>
              </motion.div>
            </form>

            {/* ── Divider ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "22px 0" }}>
              <div style={{ flex: 1, height: "1px", background: "linear-gradient(to right, transparent, rgba(0,230,160,0.1))" }} />
              <span style={{ fontSize: "0.56rem", color: "#0d2a1e", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                {t("auto.orcontinuewith_260") || "or continue with"}
              </span>
              <div style={{ flex: 1, height: "1px", background: "linear-gradient(to left, transparent, rgba(0,230,160,0.1))" }} />
            </div>

            {/* ── Google ── */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <GoogleLogin
                onSuccess={async (cr) => {
                  try {
                    setLoading(true);
                    if (cr.credential) { await loginWithGoogle(cr.credential); router.push("/dashboard"); }
                  } catch (err: any) { setErrorMsg(err.response?.data?.detail || "OAuth failed."); setLoading(false); }
                }}
                onError={() => setErrorMsg("OAuth failed.")}
                theme="filled_black" shape="rectangular" size="large" text="continue_with"
              />
            </div>

            {/* ── Footer ── */}
            <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#0d2a1e", marginTop: "24px" }}>
              Already cleared?{" "}
              <motion.button
                type="button"
                onClick={() => router.push("/login")}
                whileHover={{ scale: 1.05, color: "#00ffcc" }}
                style={{ background: "none", border: "none", color: ACCENT, fontWeight: 700, cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}
              >
                Sign In →
              </motion.button>
            </p>

            {/* ── Status badges ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
              style={{
                marginTop: "26px", paddingTop: "18px",
                borderTop: "1px solid rgba(0,230,160,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "18px",
              }}
            >
              {["End-to-End", "GDPR Safe", "SOC 2"].map((label, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.85 }}
                    style={{ width: 4, height: 4, borderRadius: "50%", background: "#0a3d28", boxShadow: "0 0 6px rgba(0,230,160,0.4)" }}
                  />
                  <span style={{ fontSize: "0.52rem", color: "#0d2a1e", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    {label}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      <style>{`
        input::placeholder { color: #0d2a1e; }
        input::-webkit-autofill {
          -webkit-box-shadow: 0 0 0 100px rgba(2, 8, 22, 0.95) inset !important;
          -webkit-text-fill-color: #e2e8f0 !important;
        }
      `}</style>
    </div>
  );
}