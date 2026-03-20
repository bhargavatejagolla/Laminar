"use client";

import { useState, useEffect, useRef } from "react";
import { register, loginWithGoogle } from "@/services/auth";
import { useRouter } from "next/navigation";
import { GoogleLogin } from '@react-oauth/google';
import { Network, ShieldCheck, ChevronLeft, Mail, Sparkles, Eye, EyeOff, UserPlus, Key, Lock, AlertCircle, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import PremiumBackground from "@/components/background/premium-background";

/* ─── Animated neural network SVG ─── */
function NeuralNetwork() {
  const nodes = [
    { cx: 12, cy: 25 }, { cx: 12, cy: 55 }, { cx: 12, cy: 75 },
    { cx: 35, cy: 15 }, { cx: 35, cy: 40 }, { cx: 35, cy: 65 }, { cx: 35, cy: 85 },
    { cx: 60, cy: 30 }, { cx: 60, cy: 52 }, { cx: 60, cy: 72 },
    { cx: 82, cy: 20 }, { cx: 82, cy: 45 }, { cx: 82, cy: 68 }, { cx: 82, cy: 85 },
    { cx: 95, cy: 35 }, { cx: 95, cy: 60 }, { cx: 95, cy: 80 },
  ];
  const edges = [
    [0,3],[0,4],[1,4],[1,5],[2,5],[2,6],
    [3,7],[3,8],[4,7],[4,8],[4,9],[5,8],[5,9],[6,9],
    [7,10],[7,11],[8,11],[8,12],[9,12],[9,13],
    [10,14],[11,14],[11,15],[12,15],[12,16],[13,16],
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', opacity: 0.12, zIndex: 1, pointerEvents: 'none' }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="0.8" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {edges.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={nodes[a].cx} y1={nodes[a].cy}
          x2={nodes[b].cx} y2={nodes[b].cy}
          stroke="#14b8a6"
          strokeWidth="0.3"
          animate={{ opacity: [0.2, 0.7, 0.2], strokeWidth: [0.2, 0.5, 0.2] }}
          transition={{ duration: 3 + (i % 4), repeat: Number.POSITIVE_INFINITY, delay: (i % 7) * 0.4, ease: 'easeInOut' }}
        />
      ))}

      {/* Nodes */}
      {nodes.map((n, i) => (
        <g key={i} filter="url(#glow)">
          <motion.circle
            cx={n.cx} cy={n.cy} r={1.2}
            fill="#14b8a6"
            animate={{ r: [0.8, 1.6, 0.8], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2 + (i % 3), repeat: Number.POSITIVE_INFINITY, delay: (i % 5) * 0.3, ease: 'easeInOut' }}
          />
          {/* Pulse ring */}
          <motion.circle
            cx={n.cx} cy={n.cy} r={2.5}
            fill="none" stroke="#14b8a6" strokeWidth="0.3"
            animate={{ r: [1.5, 4, 1.5], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.5 + (i % 4), repeat: Number.POSITIVE_INFINITY, delay: (i % 6) * 0.35, ease: 'easeOut' }}
          />
        </g>
      ))}

      {/* Traveling pulse along edges */}
      {[[0,3],[4,8],[8,12],[12,15]].map(([a, b], i) => (
        <motion.circle key={`pulse-${i}`} r={0.6} fill="#2dd4bf"
          animate={{
            cx: [nodes[a].cx, nodes[b].cx],
            cy: [nodes[a].cy, nodes[b].cy],
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: i * 0.8, ease: 'easeInOut' }}
        />
      ))}
    </svg>
  );
}

/* ─── Orbiting rings decoration around card ─── */
function OrbitRings() {
  return (
    <div style={{ position: 'absolute', inset: '-60px', zIndex: -1, pointerEvents: 'none' }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(20,184,166,0.08)' }}
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 45, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        style={{ position: 'absolute', inset: '20px', borderRadius: '50%', border: '1px dashed rgba(16,185,129,0.06)' }}
      />
      {/* Orbiting dot */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <div style={{ position: 'absolute', top: '-3px', left: '50%', width: '6px', height: '6px', borderRadius: '50%', background: '#14b8a6', boxShadow: '0 0 12px rgba(20,184,166,0.8)', transform: 'translateX(-50%)' }} />
      </motion.div>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);

  useEffect(() => {
    let s = 0;
    if (password.length >= 8) s += 25;
    if (/[a-z]/.test(password)) s += 25;
    if (/[A-Z]/.test(password)) s += 25;
    if (/[0-9]/.test(password)) s += 25;
    if (/[^a-zA-Z0-9]/.test(password)) s += 25;
    setPasswordStrength(Math.min(s, 100));
  }, [password]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 6) { setErrorMsg("Valid email and min 6-char password required."); return; }
    if (password !== confirmPassword) { setErrorMsg("Passwords do not match."); return; }
    try {
      setLoading(true); setErrorMsg("");
      await register(email, password);
      setSuccessMsg("Registration Complete. Redirecting...");
      setTimeout(() => router.push("/login"), 2200);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Registration failed.");
    } finally { setLoading(false); }
  }

  const strengthColor = passwordStrength < 50 ? '#ef4444' : passwordStrength < 75 ? '#f59e0b' : '#10b981';
  const strengthLabel = passwordStrength < 50 ? 'Weak' : passwordStrength < 75 ? 'Medium' : 'Strong';
  const strengthWidth = `${passwordStrength}%`;
  const hasMatch = confirmPassword.length > 0 && password === confirmPassword;
  const hasMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const fieldStyle = (field: string, borderOverride?: string) => ({
    width: '100%', background: 'rgba(8,14,32,0.9)',
    border: `1px solid ${borderOverride || (focusedField === field ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.06)')}`,
    borderRadius: '12px', color: '#fff', fontSize: '0.875rem',
    padding: '13px 44px 13px 40px', outline: 'none', transition: 'border-color 0.3s',
    fontFamily: 'inherit',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#020817', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: '32px 20px' }}>
      <PremiumBackground />
      <NeuralNetwork />

      {/* Diagonal scan lines */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden', opacity: 0.03 }}>
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute', left: 0, right: 0, height: '1px',
            background: 'rgba(20,184,166,1)',
            top: `${i * 5.5}%`,
          }} />
        ))}
      </div>

      {/* ─── Card ─── */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '480px' }}>
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'relative' }}
        >
          <OrbitRings />

          {/* Spinning border */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
            style={{
              position: 'absolute', inset: '-1px', borderRadius: '24px',
              background: 'conic-gradient(from 0deg, #14b8a6, #10b981, #059669, #0d9488, #14b8a6)',
              opacity: 0.4, zIndex: -1,
            }}
          />

          <div style={{
            background: 'rgba(5,10,22,0.96)',
            border: '1px solid rgba(20,184,166,0.12)',
            borderRadius: '24px', backdropFilter: 'blur(60px)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.04)',
            padding: '40px 36px',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Top glow */}
            <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(20,184,166,0.7), transparent)' }} />

            {/* Success scan overlay */}
            <AnimatePresence>
              {successMsg && (
                <motion.div
                  initial={{ top: '0%' }}
                  animate={{ top: ['0%', '100%'] }}
                  transition={{ duration: 2.2, ease: 'linear' }}
                  style={{ position: 'absolute', left: 0, right: 0, height: '3px', zIndex: 20, background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.9), transparent)', boxShadow: '0 0 20px rgba(16,185,129,0.6)', pointerEvents: 'none' }}
                />
              )}
            </AnimatePresence>

            {/* Header nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '36px' }}>
              <Link href="/">
                <motion.div whileHover={{ scale: 1.05, x: -2 }} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
                  <ChevronLeft style={{ width: 14, height: 14 }} /> Back
                </motion.div>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ color: '#14b8a6', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Sign Up</span>
                <motion.button whileHover={{ scale: 1.05 }} onClick={() => router.push("/login")}
                  style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.25)', color: '#14b8a6', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: '999px', cursor: 'pointer' }}>
                  Log In
                </motion.button>
              </div>
            </div>

            {/* Brand */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ width: '64px', height: '64px', position: 'relative', margin: '0 auto 20px' }}>
                <motion.div animate={{ rotate: -360 }} transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                  style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(20,184,166,0.35)', borderTopColor: '#14b8a6' }} />
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                  style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1px dotted rgba(16,185,129,0.2)' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Network style={{ width: 28, height: 28, color: '#14b8a6' }} strokeWidth={1.5} />
                </div>
              </div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '0.2em', color: '#fff', marginBottom: '6px' }}>
                REQUEST <span style={{ color: '#14b8a6', fontWeight: 300 }}>CLEARANCE</span>
              </h1>
              <p style={{ fontSize: '0.6rem', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.15em' }}>
                <ShieldCheck style={{ width: 11, height: 11 }} /> Laminar Intelligence Network
              </p>
            </div>

            {/* Messages */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ marginBottom: '16px', padding: '12px', borderRadius: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {errorMsg}
                </motion.div>
              )}
              {successMsg && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  style={{ marginBottom: '16px', padding: '12px', borderRadius: '12px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {successMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleRegister} style={{ background: 'rgba(4,8,20,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px', color: focusedField === 'email' ? '#14b8a6' : '#475569', transition: 'color 0.3s' }}>Assign Operator ID</label>
                <div style={{ position: 'relative' }}>
                  <Mail style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: focusedField === 'email' ? '#14b8a6' : '#334155', pointerEvents: 'none', transition: 'color 0.3s' }} />
                  <input type="email" placeholder="new.operator@laminar.ai" value={email} onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                    style={{ ...fieldStyle('email'), paddingRight: '14px' }} />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px', color: focusedField === 'password' ? '#14b8a6' : '#475569', transition: 'color 0.3s' }}>Assign Security Key</label>
                <div style={{ position: 'relative' }}>
                  <Key style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: focusedField === 'password' ? '#14b8a6' : '#334155', pointerEvents: 'none', transition: 'color 0.3s' }} />
                  <input type={showPassword ? 'text' : 'password'} placeholder="••••••••••••" value={password} onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                    style={fieldStyle('password')} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#334155', display: 'flex' }}>
                    {showPassword ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                  </button>
                </div>
                {/* Strength bar */}
                {password && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: '8px' }}>
                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.07)', borderRadius: '999px', overflow: 'hidden' }}>
                      <motion.div
                        animate={{ width: strengthWidth }}
                        transition={{ duration: 0.4 }}
                        style={{ height: '100%', borderRadius: '999px', background: strengthColor, boxShadow: `0 0 8px ${strengthColor}` }}
                      />
                    </div>
                    <p style={{ fontSize: '0.6rem', color: '#475569', marginTop: '4px' }}>
                      Strength: <span style={{ color: strengthColor, fontWeight: 700 }}>{strengthLabel}</span>
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px', color: focusedField === 'confirm' ? '#14b8a6' : '#475569', transition: 'color 0.3s' }}>Confirm Security Key</label>
                <div style={{ position: 'relative' }}>
                  <Lock style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: hasMatch ? '#10b981' : hasMismatch ? '#ef4444' : (focusedField === 'confirm' ? '#14b8a6' : '#334155'), pointerEvents: 'none', transition: 'color 0.3s' }} />
                  <input type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••••••" value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    onFocus={() => setFocusedField('confirm')} onBlur={() => setFocusedField(null)}
                    style={fieldStyle('confirm', hasMatch ? 'rgba(16,185,129,0.5)' : hasMismatch ? 'rgba(239,68,68,0.4)' : undefined)} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#334155', display: 'flex' }}>
                    {showConfirmPassword ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                  </button>
                </div>
                <AnimatePresence>
                  {confirmPassword && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      style={{ fontSize: '0.6rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', color: hasMatch ? '#34d399' : '#f87171' }}>
                      {hasMatch ? <><CheckCircle style={{ width: 10, height: 10 }} /> Secured — passwords match</> : <><AlertCircle style={{ width: 10, height: 10 }} /> Passwords do not match</>}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit */}
              <motion.button
                type="submit" disabled={loading || !!successMsg}
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
                style={{
                  width: '100%', padding: '15px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #14b8a6, #10b981)',
                  color: '#000', fontWeight: 900, fontSize: '0.72rem', letterSpacing: '0.15em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 0 30px rgba(20,184,166,0.35)',
                  opacity: loading || !!successMsg ? 0.7 : 1, marginTop: '4px',
                }}
              >
                {loading ? (
                  <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                    style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%' }} />
                    Initializing...</>
                ) : <><UserPlus style={{ width: 16, height: 16 }} /> Initialize Profile</>}
              </motion.button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: '0.6rem', color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fast Link</span>
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
              Already cleared?{' '}
              <motion.button type="button" onClick={() => router.push("/login")} whileHover={{ scale: 1.05 }}
                style={{ background: 'none', border: 'none', color: '#14b8a6', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}>
                Sign In
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
        style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(5,14,28,0.9)', border: '1px solid rgba(20,184,166,0.35)', borderRadius: '999px', padding: '12px 22px', color: '#14b8a6', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', backdropFilter: 'blur(20px)', boxShadow: '0 0 30px rgba(20,184,166,0.2)' }}
      >
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}>
          <Sparkles style={{ width: 15, height: 15 }} />
        </motion.div>
        AI Copilot
      </motion.button>
    </div>
  );
}