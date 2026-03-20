"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import PremiumBackground from "@/components/background/premium-background";
import { Shield, ChevronRight, ArrowRight, Eye, Brain, Video, Activity, TrendingUp, ShieldAlert, Bell, ServerCrash, Sparkles } from "lucide-react";

/* ─── Animated counter hook ─── */
function useCounter(target: number, duration = 2000, delay = 0) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  useEffect(() => {
    if (!started) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, target, duration]);
  return count;
}

/* ─── Typewriter hook ─── */
function useTypewriter(words: string[], speed = 80, pause = 2000) {
  const [displayed, setDisplayed] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const word = words[wordIdx];
    if (!deleting && charIdx < word.length) {
      const t = setTimeout(() => setCharIdx(c => c + 1), speed);
      return () => clearTimeout(t);
    }
    if (!deleting && charIdx === word.length) {
      const t = setTimeout(() => setDeleting(true), pause);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx > 0) {
      const t = setTimeout(() => setCharIdx(c => c - 1), speed / 2);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx === 0) {
      setDeleting(false);
      setWordIdx(i => (i + 1) % words.length);
    }
  }, [charIdx, deleting, wordIdx, words, speed, pause]);
  useEffect(() => {
    setDisplayed(words[wordIdx].slice(0, charIdx));
  }, [charIdx, wordIdx, words]);
  return displayed;
}

/* ─── Magnetic button hook ─── */
function MagneticButton({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });
  const handleMove = (e: React.MouseEvent) => {
    const btn = ref.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.25);
    y.set((e.clientY - cy) * 0.25);
  };
  const handleLeave = () => { x.set(0); y.set(0); };
  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ ...style, x: springX, y: springY }}
      whileTap={{ scale: 0.94 }}
    >
      {children}
    </motion.button>
  );
}

/* ─── 3D Tilt card hook ─── */
function TiltCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRX = useSpring(rotateX, { stiffness: 200, damping: 20 });
  const springRY = useSpring(rotateY, { stiffness: 200, damping: 20 });
  const handleMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 14);
    rotateX.set((0.5 - py) * 14);
  };
  const handleLeave = () => { rotateX.set(0); rotateY.set(0); };
  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ ...style, rotateX: springRX, rotateY: springRY, transformStyle: 'preserve-3d', perspective: '800px' }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Stat item with counter ─── */
function StatItem({ prefix = '', target, suffix = '', label, delay }: { prefix?: string; target: number; suffix?: string; label: string; delay: number }) {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const count = useCounter(inView ? target : 0, 2000, delay);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000 + 0.8, duration: 0.6 }}
      whileHover={{ scale: 1.08 }}
      style={{ textAlign: 'center', position: 'relative' }}
    >
      <div style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 900, color: '#fff', marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>
        {prefix}{count}{suffix}
      </div>
      <div style={{ fontSize: '0.6rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</div>
    </motion.div>
  );
}

const features = [
  { icon: <Video className="w-6 h-6" />, title: "Agnostic Integration", description: "Seamlessly ingest feeds from IP, RTSP, USB, or legacy cameras with zero vendor lock-in.", color: "#22d3ee", rgb: "34,211,238" },
  { icon: <Activity className="w-6 h-6" />, title: "Real-Time Detection", description: "Hardware-accelerated YOLO models performing counting and tracking with uncompromised precision.", color: "#10b981", rgb: "16,185,129" },
  { icon: <TrendingUp className="w-6 h-6" />, title: "Predictive Forecasting", description: "Advanced LSTM pipelines modeling crowd dynamics to predict surges 60 minutes ahead.", color: "#a78bfa", rgb: "167,139,250" },
  { icon: <ShieldAlert className="w-6 h-6" />, title: "Dynamic Risk Scoring", description: "Multivariate risk engine evaluating density, velocity, and environmental variables.", color: "#f59e0b", rgb: "245,158,11" },
  { icon: <Bell className="w-6 h-6" />, title: "Omnichannel Alerts", description: "Low-latency WebSocket delivery, cascading SMS dispatch for immediate hazard response.", color: "#f43f5e", rgb: "244,63,94" },
  { icon: <ServerCrash className="w-6 h-6" />, title: "Failsafe Topology", description: "Circuit breakers and auto-healing ensuring the intelligence platform never goes dark.", color: "#22d3ee", rgb: "34,211,238" },
];

export default function LandingPage() {
  const router = useRouter();
  const typeText = useTypewriter(["Crowd Risk", "Safety Systems", "Threat Detection", "Mass Surveillance"], 70, 2500);

  return (
    <div style={{ minHeight: '100vh', background: '#020817', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", overflowX: 'hidden' }}>
      <PremiumBackground />

      <div style={{ position: 'relative', zIndex: 10 }}>

        {/* ─── NAVBAR ─── */}
        <motion.nav
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 48px', maxWidth: '1400px', margin: '0 auto',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <motion.div
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            whileHover={{ scale: 1.04 }}
            onClick={() => router.push("/")}
          >
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 15, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}>
              <Shield style={{ width: 20, height: 20, color: '#22d3ee' }} />
            </motion.div>
            <span style={{ color: '#fff', fontWeight: 900, letterSpacing: '0.25em', fontSize: '0.8rem' }}>LAMINAR</span>
          </motion.div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            {['Features', 'Architecture', 'Pricing'].map((item) => (
              <motion.span
                key={item}
                whileHover={{ color: '#fff' }}
                style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', cursor: 'pointer' }}
              >
                {item}
              </motion.span>
            ))}
            <motion.button
              whileHover={{ color: '#fff' }}
              onClick={() => router.push("/login")}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Sign In
            </motion.button>
            <MagneticButton
              onClick={() => router.push("/register")}
              style={{
                background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(59,130,246,0.15))',
                border: '1px solid rgba(34,211,238,0.4)',
                color: '#22d3ee', fontWeight: 700, fontSize: '0.7rem',
                letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                padding: '9px 20px', borderRadius: '999px',
              }}
            >
              Get Started →
            </MagneticButton>
          </div>
        </motion.nav>

        {/* ─── HERO ─── */}
        <main style={{ textAlign: 'center', padding: '80px 24px 60px', maxWidth: '1100px', margin: '0 auto' }}>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '6px 16px', borderRadius: '999px',
              border: '1px solid rgba(34,211,238,0.2)',
              background: 'rgba(34,211,238,0.06)',
              marginBottom: '52px', backdropFilter: 'blur(12px)'
            }}
          >
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', display: 'inline-block' }}
            />
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', color: '#22d3ee', textTransform: 'uppercase' }}>
              Production Grade Intelligence
            </span>
          </motion.div>

          {/* Headline with typewriter */}
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            style={{ fontSize: 'clamp(48px, 9vw, 100px)', fontWeight: 900, lineHeight: 1.02, letterSpacing: '-0.03em', color: '#fff', marginBottom: '32px' }}
          >
            AI-Powered
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #60a5fa 0%, #22d3ee 40%, #a78bfa 80%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              display: 'inline-block', minWidth: '4px',
              filter: 'drop-shadow(0 0 50px rgba(34,211,238,0.4))',
            }}>
              {typeText}
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Number.POSITIVE_INFINITY }}
                style={{ display: 'inline-block', width: '3px', height: '0.9em', background: '#22d3ee', marginLeft: '3px', verticalAlign: 'middle', borderRadius: '2px' }}
              />
            </span>
            <br />
            Intelligence
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.7 }}
            style={{ fontSize: '1.05rem', color: '#64748b', maxWidth: '600px', margin: '0 auto 48px', lineHeight: 1.75, fontWeight: 400 }}
          >
            Universal camera-agnostic platform transforming any CCTV network into a
            proactive crowd safety system with real-time detection and forecasting.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.6 }}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '80px' }}
          >
            <MagneticButton
              onClick={() => router.push("/register")}
              style={{
                background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                color: '#000', fontWeight: 900, fontSize: '0.72rem',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '16px 36px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                boxShadow: '0 0 40px rgba(34,211,238,0.5), 0 4px 20px rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'center', gap: '8px',
                position: 'relative', overflow: 'hidden',
              }}
            >
              Deploy Intelligence <ChevronRight style={{ width: 16, height: 16 }} />
            </MagneticButton>
            <MagneticButton
              onClick={() => router.push("/dashboard")}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '16px 36px', borderRadius: '999px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', backdropFilter: 'blur(12px)',
              }}
            >
              <Eye style={{ width: 16, height: 16 }} /> View Demo
            </MagneticButton>
          </motion.div>

          {/* ─── Animated Stats ─── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '1px', maxWidth: '680px', margin: '0 auto',
              background: 'rgba(255,255,255,0.06)', borderRadius: '20px', overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <StatItem prefix="" target={999} suffix=".9%" label="Accuracy" delay={100} />
            <StatItem prefix="<" target={50} suffix="ms" label="Latency" delay={200} />
            <StatItem prefix="" target={10} suffix="K+" label="Cameras" delay={300} />
            <StatItem prefix="" target={24} suffix="/7" label="Uptime" delay={400} />
          </motion.div>

          {/* Glowing divider */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 1.2, duration: 1.2 }}
            style={{
              height: '1px', marginTop: '80px',
              background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.4), transparent)',
              boxShadow: '0 0 16px rgba(34,211,238,0.2)',
            }}
          />
        </main>

        {/* ─── FEATURES GRID ─── */}
        <section style={{ padding: '80px 48px', maxWidth: '1200px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
            style={{ textAlign: 'center', marginBottom: '64px' }}
          >
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', marginBottom: '16px' }}>
              Architected for <span style={{ color: '#22d3ee' }}>Resilience</span>
            </h2>
            <p style={{ color: '#475569', maxWidth: '520px', margin: '0 auto', fontSize: '1rem', lineHeight: 1.65 }}>
              Mission-critical infrastructure demanding zero downtime and infinite scalability.
            </p>
          </motion.div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {features.map((f, i) => (
              <TiltCard key={i} style={{ borderRadius: '20px' }}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: (i % 3) * 0.12, duration: 0.6 }}
                  style={{
                    background: 'rgba(8,12,28,0.7)',
                    border: `1px solid rgba(${f.rgb}, 0.12)`,
                    borderRadius: '20px', padding: '32px',
                    backdropFilter: 'blur(20px)',
                    position: 'relative', overflow: 'hidden', height: '100%',
                    cursor: 'default',
                    transition: 'border-color 0.3s, box-shadow 0.3s',
                  }}
                  whileHover={{
                    borderColor: `rgba(${f.rgb}, 0.35)`,
                    boxShadow: `0 20px 60px rgba(${f.rgb}, 0.08), 0 0 0 1px rgba(${f.rgb}, 0.15)`,
                  }}
                >
                  {/* Gradient corner glow */}
                  <div style={{
                    position: 'absolute', top: 0, right: 0, width: '120px', height: '120px',
                    background: `radial-gradient(circle at top right, rgba(${f.rgb}, 0.1), transparent 70%)`,
                    pointerEvents: 'none',
                  }} />

                  {/* Icon with ring */}
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px',
                      background: `rgba(${f.rgb}, 0.1)`,
                      border: `1px solid rgba(${f.rgb}, 0.25)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: '20px', color: f.color,
                      boxShadow: `0 0 20px rgba(${f.rgb}, 0.15)`,
                    }}
                  >
                    {f.icon}
                  </motion.div>

                  <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1rem', marginBottom: '10px', letterSpacing: '-0.01em' }}>{f.title}</h3>
                  <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.7 }}>{f.description}</p>

                  {/* Bottom accent on hover */}
                  <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    whileHover={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px',
                      background: `linear-gradient(90deg, transparent, ${f.color}, transparent)`,
                      transformOrigin: 'left',
                    }}
                  />
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </section>

        {/* ─── ANIMATED PIPELINE ─── */}
        <section style={{ padding: '60px 48px 80px', maxWidth: '960px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            style={{ textAlign: 'center', marginBottom: '56px' }}
          >
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>
              N-Tier{' '}
              <span style={{ background: 'linear-gradient(135deg, #60a5fa, #22d3ee, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Intelligence Pipeline
              </span>
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            style={{
              background: 'rgba(8,12,28,0.8)', border: '1px solid rgba(34,211,238,0.1)',
              borderRadius: '28px', padding: '48px 40px',
              backdropFilter: 'blur(30px)',
              boxShadow: '0 0 80px rgba(34,211,238,0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', flexWrap: 'nowrap' }}>
              {[
                { icon: <Video style={{ width: 28, height: 28 }} />, label: 'Edge Nodes', sub: 'Video Ingestion', color: '#22d3ee', rgb: '34,211,238', shape: 'square' },
                null,
                { icon: <Brain style={{ width: 32, height: 32 }} />, label: 'AI Core', sub: 'YOLO + LSTM', color: '#a78bfa', rgb: '167,139,250', shape: 'circle' },
                null,
                { icon: <ShieldAlert style={{ width: 28, height: 28 }} />, label: 'Dispatch', sub: 'Alert Matrix', color: '#f43f5e', rgb: '244,63,94', shape: 'square' },
              ].map((item, i) => {
                if (!item) {
                  const flowColor = i === 1 ? '#22d3ee' : '#a78bfa';
                  return (
                    <div key={i} style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.05)', position: 'relative', minWidth: '60px', overflow: 'hidden' }}>
                      {[0, 1, 2].map((j) => (
                        <motion.div
                          key={j}
                          animate={{ x: ['-100%', '400%'] }}
                          transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: 'linear', delay: j * 0.6 }}
                          style={{
                            position: 'absolute', top: 0, bottom: 0, width: '30%',
                            background: `linear-gradient(90deg, transparent, ${flowColor}, transparent)`
                          }}
                        />
                      ))}
                    </div>
                  );
                }
                return (
                  <motion.div
                    key={i}
                    whileHover={{ scale: 1.1, y: -6 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', flex: '0 0 auto' }}
                  >
                    <motion.div
                      animate={{ boxShadow: [`0 0 20px rgba(${item.rgb},0.3)`, `0 0 40px rgba(${item.rgb},0.6)`, `0 0 20px rgba(${item.rgb},0.3)`] }}
                      transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                      style={{
                        width: item.shape === 'circle' ? '80px' : '68px',
                        height: item.shape === 'circle' ? '80px' : '68px',
                        borderRadius: item.shape === 'circle' ? '50%' : '18px',
                        background: `rgba(${item.rgb}, 0.08)`,
                        border: `1px solid rgba(${item.rgb}, 0.35)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: item.color,
                      }}
                    >
                      {item.icon}
                    </motion.div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</p>
                      <p style={{ color: '#475569', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '3px', fontWeight: 600 }}>{item.sub}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </section>

        {/* ─── CTA ─── */}
        <section style={{ padding: '60px 24px 120px' }}>
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9 }}
            style={{
              maxWidth: '860px', margin: '0 auto', textAlign: 'center',
              background: 'rgba(8,12,28,0.85)',
              border: '1px solid transparent',
              backgroundClip: 'padding-box',
              borderRadius: '40px', padding: '80px 48px',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* Animated conic border */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '40px', padding: '1px', zIndex: -1,
              background: 'conic-gradient(from 0deg, #22d3ee, #3b82f6, #a78bfa, #22d3ee)',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }} />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 5, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
              style={{
                position: 'absolute', inset: '-1px', borderRadius: '40px', padding: '1px', zIndex: 0,
                background: 'conic-gradient(from var(--angle, 0deg), #22d3ee 0%, #3b82f6 25%, #a78bfa 50%, #f43f5e 75%, #22d3ee 100%)',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                opacity: 0.5,
              }}
            />

            {/* Inner glow */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '600px', height: '300px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(34,211,238,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '999px', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '28px' }}
              >
                Early Access Program
              </motion.span>

              <h2 style={{ fontSize: 'clamp(32px, 5vw, 64px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '24px' }}>
                Initialize Your{' '}
                <span style={{ background: 'linear-gradient(135deg, #60a5fa, #22d3ee, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  Security Matrix.
                </span>
              </h2>

              <p style={{ color: '#475569', fontSize: '1rem', lineHeight: 1.7, maxWidth: '480px', margin: '0 auto 40px' }}>
                Connect your infrastructure. Activate predictive intelligence in under 15 minutes.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
                <MagneticButton onClick={() => router.push("/register")} style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', color: '#000', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 36px', borderRadius: '999px', border: 'none', cursor: 'pointer', boxShadow: '0 0 40px rgba(34,211,238,0.4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Deploy System <ArrowRight style={{ width: 18, height: 18 }} />
                </MagneticButton>
                <MagneticButton onClick={() => router.push("/login")} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 36px', borderRadius: '999px', cursor: 'pointer', backdropFilter: 'blur(12px)' }}>
                  Access Portal
                </MagneticButton>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ─── FOOTER ─── */}
        <footer style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '28px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield style={{ width: 16, height: 16, color: '#22d3ee' }} />
            <span style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Laminar</span>
          </div>
          <p style={{ color: '#334155', fontSize: '0.72rem' }}>© {new Date().getFullYear()} Laminar Intelligence. All rights reserved.</p>
        </footer>

        {/* ─── AI Copilot FAB ─── */}
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.5, type: "spring", stiffness: 200 }}
          whileHover={{ scale: 1.08, y: -2 }}
          whileTap={{ scale: 0.94 }}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 50,
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(8,16,36,0.9)',
            border: '1px solid rgba(34,211,238,0.35)',
            borderRadius: '999px', padding: '12px 22px',
            color: '#22d3ee', fontWeight: 700, fontSize: '0.7rem',
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 0 30px rgba(34,211,238,0.2), 0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}>
            <Sparkles style={{ width: 15, height: 15 }} />
          </motion.div>
          AI Copilot
        </motion.button>
      </div>
    </div>
  );
}