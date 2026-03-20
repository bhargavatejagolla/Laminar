"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from '@react-oauth/google';
import { login, loginWithGoogle } from "@/services/auth";
import { Activity, ShieldCheck, ChevronLeft, Mail, Sparkles, Eye, EyeOff, Key, AlertCircle, Fingerprint } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import Link from "next/link";
import PremiumBackground from "@/components/background/premium-background";

/* ─── Radar sweep canvas ─── */
function RadarSweep() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let angle = 0;
    let animId: number;
    const blips: { x: number; y: number; age: number; r: number }[] = [
      { x: 0.35, y: 0.3, age: 0, r: 3 },
      { x: 0.65, y: 0.55, age: Math.PI * 0.8, r: 2 },
      { x: 0.2, y: 0.65, age: Math.PI * 1.4, r: 2.5 },
      { x: 0.75, y: 0.25, age: Math.PI * 1.8, r: 2 },
      { x: 0.5, y: 0.45, age: Math.PI * 0.4, r: 3 },
    ];
    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.42;

      ctx.clearRect(0, 0, W, H);

      // Concentric rings
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R / 4) * i, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34,211,238,${0.06 + i * 0.02})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Cross-hair lines
      ctx.beginPath();
      ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
      ctx.strokeStyle = 'rgba(34,211,238,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Sweep gradient
      const grad = (ctx as any).createConicGradient
        ? (ctx as any).createConicGradient(angle, cx, cy)
        : null;
      if (grad) {
        grad.addColorStop(0, 'rgba(34,211,238,0)');
        grad.addColorStop(1, 'rgba(34,211,238,0.15)');
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      } else {
        // Fallback: simple sweep wedge
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, angle - 1.2, angle);
        ctx.closePath();
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, 'rgba(34,211,238,0.0)');
        g.addColorStop(1, 'rgba(34,211,238,0.12)');
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Sweep leading line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
      ctx.strokeStyle = 'rgba(34,211,238,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Blips
      blips.forEach(b => {
        const angDiff = ((angle - b.age) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (angDiff < Math.PI * 2) {
          const alpha = Math.max(0, 1 - angDiff / (Math.PI * 2));
          const bx = cx + (b.x - 0.5) * 2 * R * 0.8;
          const by = cy + (b.y - 0.5) * 2 * R * 0.8;
          ctx.beginPath();
          ctx.arc(bx, by, b.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(34,211,238,${alpha * 0.9})`;
          ctx.fill();
          // Halo
          ctx.beginPath();
          ctx.arc(bx, by, b.r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(34,211,238,${alpha * 0.3})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      angle += 0.015;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={400} height={400}
      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.18, pointerEvents: 'none' }}
    />
  );
}

/* ─── Floating hex grid decoration ─── */
function HexGrid() {
  const hexes = Array.from({ length: 18 }, (_, i) => ({
    x: ((i * 137.508) % 100),
    y: ((i * 97.3) % 100),
    size: 8 + (i % 4) * 4,
    delay: (i % 6) * 0.4,
    duration: 6 + (i % 4),
    opacity: 0.04 + (i % 3) * 0.03,
  }));
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {hexes.map((h, i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -15, 0], rotate: [0, 60, 0], opacity: [h.opacity, h.opacity * 2.5, h.opacity] }}
          transition={{ duration: h.duration, repeat: Number.POSITIVE_INFINITY, delay: h.delay, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            left: `${h.x}%`, top: `${h.y}%`,
            width: h.size, height: h.size,
            background: 'none',
            border: '1px solid rgba(34,211,238,0.5)',
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          }}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);

  // Cursor spotlight
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const sX = useSpring(mouseX, { stiffness: 100, damping: 25 });
  const sY = useSpring(mouseY, { stiffness: 100, damping: 25 });
  useEffect(() => {
    const h = (e: MouseEvent) => { mouseX.set(e.clientX); mouseY.set(e.clientY); };
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, [mouseX, mouseY]);

  async function handleStandardLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setErrorMsg("Email and password are required."); return; }
    setScanActive(true);
    setTimeout(async () => {
      try {
        setLoading(true); setErrorMsg("");
        await login(email, password);
        router.push("/dashboard");
      } catch (err: any) {
        setErrorMsg(err.response?.data?.detail || "Authentication sequence failed.");
        setScanActive(false);
      } finally { setLoading(false); }
    }, 1200);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#020817', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      <PremiumBackground />
      <HexGrid />

      {/* Cursor spotlight */}
      <motion.div style={{
        position: 'fixed', zIndex: 1, pointerEvents: 'none', width: '500px', height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)',
        x: useTransform(sX, v => v - 250),
        y: useTransform(sY, v => v - 250),
      } as any} />

      {/* Radar background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
        <RadarSweep />
      </div>

      {/* ─── Card ─── */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '460px', margin: '0 20px' }}>
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'relative' }}
        >
          {/* Spinning holographic border */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
            style={{
              position: 'absolute', inset: '-1px', borderRadius: '24px',
              background: 'conic-gradient(from 0deg, #22d3ee, #3b82f6, #a78bfa, #f43f5e, #22d3ee)',
              opacity: 0.5, zIndex: -1,
            }}
          />
          {/* Static card body */}
          <div style={{
            background: 'rgba(6,10,24,0.95)',
            border: '1px solid rgba(34,211,238,0.12)',
            borderRadius: '24px',
            backdropFilter: 'blur(60px)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
            padding: '40px 36px 36px',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Biometric scan overlay */}
            <AnimatePresence>
              {scanActive && (
                <motion.div
                  initial={{ top: '-4px' }}
                  animate={{ top: ['0%', '100%'] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1, ease: 'linear' }}
                  style={{
                    position: 'absolute', left: 0, right: 0, height: '4px', zIndex: 20,
                    background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.9), transparent)',
                    boxShadow: '0 0 20px rgba(34,211,238,0.6)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </AnimatePresence>

            {/* Top glow bars */}
            <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.6), transparent)' }} />

            {/* Header nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '36px' }}>
              <Link href="/">
                <motion.div whileHover={{ scale: 1.05, x: -2 }} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
                  <ChevronLeft style={{ width: 14, height: 14 }} /> Back
                </motion.div>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ color: '#22d3ee', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Log In</span>
                <motion.button whileHover={{ scale: 1.05 }} onClick={() => router.push("/register")}
                  style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: '#22d3ee', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: '999px', cursor: 'pointer' }}>
                  Register
                </motion.button>
              </div>
            </div>

            {/* Brand */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <motion.div
                className="relative mx-auto mb-5"
                style={{ width: '64px', height: '64px', position: 'relative', margin: '0 auto 20px' }}
              >
                {/* Rotating rings */}
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                  style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(34,211,238,0.3)', borderTopColor: '#22d3ee' }} />
                <motion.div animate={{ rotate: -360 }} transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                  style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '1px solid rgba(34,211,238,0.15)', borderBottomColor: '#3b82f6' }} />
                {/* Center icon */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity style={{ width: 28, height: 28, color: '#22d3ee' }} strokeWidth={1.5} />
                </div>
              </motion.div>

              <h1 style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '0.2em', color: '#fff', marginBottom: '6px' }}>
                LAMINAR <span style={{ color: '#22d3ee', fontWeight: 300 }}>CONTROL</span>
              </h1>
              <p style={{ fontSize: '0.6rem', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.15em' }}>
                <ShieldCheck style={{ width: 11, height: 11, color: '#334155' }} /> Restricted Operator Access
              </p>
            </div>

            {/* Error */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ marginBottom: '16px', padding: '12px', borderRadius: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleStandardLogin} style={{ background: 'rgba(4,8,20,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px', color: focusedField === 'email' ? '#22d3ee' : '#475569', transition: 'color 0.3s' }}>
                  Operator ID
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: focusedField === 'email' ? '#22d3ee' : '#334155', transition: 'color 0.3s', pointerEvents: 'none' }} />
                  <motion.input
                    type="email" placeholder="administrator@laminar.ai"
                    value={email} onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                    animate={{ boxShadow: focusedField === 'email' ? '0 0 0 1px rgba(34,211,238,0.5), 0 0 20px rgba(34,211,238,0.1)' : '0 0 0 0px rgba(34,211,238,0)' }}
                    style={{
                      width: '100%', background: 'rgba(8,14,32,0.9)',
                      border: `1px solid ${focusedField === 'email' ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '12px', color: '#fff', fontSize: '0.875rem',
                      padding: '13px 14px 13px 40px', outline: 'none', transition: 'border-color 0.3s',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px', color: focusedField === 'password' ? '#22d3ee' : '#475569', transition: 'color 0.3s' }}>
                  Auth Key
                </label>
                <div style={{ position: 'relative' }}>
                  <Key style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: focusedField === 'password' ? '#22d3ee' : '#334155', transition: 'color 0.3s', pointerEvents: 'none' }} />
                  <motion.input
                    type={showPassword ? 'text' : 'password'} placeholder="••••••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                    animate={{ boxShadow: focusedField === 'password' ? '0 0 0 1px rgba(34,211,238,0.5), 0 0 20px rgba(34,211,238,0.1)' : '0 0 0 0px rgba(34,211,238,0)' }}
                    style={{
                      width: '100%', background: 'rgba(8,14,32,0.9)',
                      border: `1px solid ${focusedField === 'password' ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '12px', color: '#fff', fontSize: '0.875rem',
                      padding: '13px 44px 13px 40px', outline: 'none', transition: 'border-color 0.3s',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#334155', display: 'flex', alignItems: 'center' }}>
                    {showPassword ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <motion.button
                type="submit" disabled={loading || scanActive}
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
                animate={scanActive ? { boxShadow: ['0 0 20px rgba(34,211,238,0.3)', '0 0 60px rgba(34,211,238,0.7)', '0 0 20px rgba(34,211,238,0.3)'] } : {}}
                transition={scanActive ? { duration: 0.8, repeat: Number.POSITIVE_INFINITY } : {}}
                style={{
                  width: '100%', padding: '15px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                  color: '#000', fontWeight: 900, fontSize: '0.72rem', letterSpacing: '0.15em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 0 30px rgba(34,211,238,0.35)',
                  opacity: loading ? 0.7 : 1, marginTop: '4px',
                }}
              >
                {loading ? (
                  <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                    style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%' }} />
                    Authenticating...</>
                ) : scanActive ? (
                  <><Fingerprint style={{ width: 16, height: 16 }} /> Scanning Biometrics...</>
                ) : (
                  <><Fingerprint style={{ width: 16, height: 16 }} /> Initialize Session</>
                )}
              </motion.button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: '0.6rem', color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Secure Link</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {/* Google */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
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

            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#334155', marginTop: '20px' }}>
              New operator?{' '}
              <motion.button type="button" onClick={() => router.push("/register")} whileHover={{ scale: 1.05 }}
                style={{ background: 'none', border: 'none', color: '#22d3ee', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}>
                Request Access
              </motion.button>
            </p>
          </div>
        </motion.div>
      </div>

      {/* AI Copilot FAB */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 200 }}
        whileHover={{ scale: 1.08, y: -2 }} whileTap={{ scale: 0.94 }}
        style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(8,16,36,0.9)', border: '1px solid rgba(34,211,238,0.35)', borderRadius: '999px', padding: '12px 22px', color: '#22d3ee', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', backdropFilter: 'blur(20px)', boxShadow: '0 0 30px rgba(34,211,238,0.2)' }}
      >
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}>
          <Sparkles style={{ width: 15, height: 15 }} />
        </motion.div>
        AI Copilot
      </motion.button>
    </div>
  );
}

/* workaround for missing useTransform import */
function useTransform(val: any, fn: (v: number) => number) {
  const out = useMotionValue(0);
  useEffect(() => {
    return val.on('change', (v: number) => out.set(fn(v)));
  }, [val, fn, out]);
  return out;
}