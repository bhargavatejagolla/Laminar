"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/* ─── Animated counter hook ─── */
export function useCounter(target: number, duration = 2000, delay = 0) {
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
      setCount(Math.floor((1 - Math.pow(1 - progress, 3)) * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, target, duration]);
  return count;
}

/* ─── Typewriter hook ─── */
export function useTypewriter(words: string[], speed = 80, pause = 2000) {
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
    if (deleting && charIdx === 0) { setDeleting(false); setWordIdx(i => (i + 1) % words.length); }
  }, [charIdx, deleting, wordIdx, words, speed, pause]);
  useEffect(() => { setDisplayed(words[wordIdx].slice(0, charIdx)); }, [charIdx, wordIdx, words]);
  return displayed;
}

/* ─── Magnetic button ─── */
export function MagneticButton({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });
  const handleMove = (e: React.MouseEvent) => {
    const btn = ref.current; if (!btn) return;
    const rect = btn.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * 0.25);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.25);
  };
  const handleLeave = () => { x.set(0); y.set(0); };
  return (
    <motion.button ref={ref} onClick={onClick} onMouseMove={handleMove} onMouseLeave={handleLeave}
      style={{ ...style, x: springX, y: springY }} whileTap={{ scale: 0.94 }}>
      {children}
    </motion.button>
  );
}

/* ─── 3D Tilt card ─── */
export function TiltCard({ children, style, ambientColor = "34,211,238" }: {
  children: React.ReactNode; style?: React.CSSProperties; ambientColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRX = useSpring(rotateX, { stiffness: 200, damping: 20 });
  const springRY = useSpring(rotateY, { stiffness: 200, damping: 20 });
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 });

  const handleMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 16);
    rotateX.set((0.5 - py) * 16);
    setGlowPos({ x: px * 100, y: py * 100 });
  };
  const handleLeave = () => { rotateX.set(0); rotateY.set(0); setGlowPos({ x: 50, y: 50 }); };

  return (
    <motion.div ref={ref} onMouseMove={handleMove} onMouseLeave={handleLeave}
      style={{
        ...style, rotateX: springRX, rotateY: springRY,
        transformStyle: 'preserve-3d', perspective: '900px',
        position: 'relative',
      }}>
      {/* Environmental light reflection */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', zIndex: 1,
        background: `radial-gradient(circle at ${glowPos.x}% ${glowPos.y}%, rgba(${ambientColor},0.14), transparent 60%)`,
        transition: 'background 0.08s',
      }} />
      {children}
    </motion.div>
  );
}

/* ─── Custom cosmic cursor ─── */
export function CosmicCursor() {
  const [mounted, setMounted] = useState(false);
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const trailX = useSpring(cursorX, { stiffness: 100, damping: 22 });
  const trailY = useSpring(cursorY, { stiffness: 100, damping: 22 });
  const [clicking, setClicking] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    setMounted(true);
    const move = (e: MouseEvent) => { cursorX.set(e.clientX); cursorY.set(e.clientY); };
    const down = () => setClicking(true);
    const up = () => setClicking(false);
    const overInteractive = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      setHovering(!!(el.closest('button') || el.closest('a') || el.closest('[role=button]')));
    };
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mousemove', overInteractive, { passive: true });
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousemove', overInteractive);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
    };
  }, [cursorX, cursorY]);

  if (!mounted) return null;
  return (
    <>
      {/* Outer ring */}
      <motion.div style={{
        position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9999,
        x: trailX, y: trailY, translateX: '-50%', translateY: '-50%',
      }}>
        <motion.div
          animate={{
            scale: clicking ? 0.5 : hovering ? 1.7 : 1,
            opacity: clicking ? 0.5 : 1,
            borderColor: hovering ? 'rgba(167,139,250,0.9)' : 'rgba(34,211,238,0.7)',
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{
            width: 38, height: 38, borderRadius: '50%',
            border: '1.5px solid rgba(34,211,238,0.7)',
            boxShadow: hovering ? '0 0 20px rgba(167,139,250,0.4)' : '0 0 14px rgba(34,211,238,0.3)',
          }} />
      </motion.div>
      {/* Inner dot */}
      <motion.div style={{
        position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9999,
        x: cursorX, y: cursorY, translateX: '-50%', translateY: '-50%',
      }}>
        <motion.div
          animate={{ scale: clicking ? 2.5 : hovering ? 0.4 : 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: hovering ? 'rgba(167,139,250,1)' : 'rgba(34,211,238,1)',
            boxShadow: hovering ? '0 0 12px rgba(167,139,250,0.9)' : '0 0 12px rgba(34,211,238,0.9)',
          }} />
      </motion.div>
    </>
  );
}

/* ─── Cosmic depth atmosphere ─── */
export function CosmicAtmosphere() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}>
      {/* Primary cosmic light source — top right */}
      <div style={{
        position: 'absolute', top: '-15%', right: '-8%',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle at 40% 40%, rgba(34,150,238,0.16) 0%, rgba(34,80,200,0.06) 40%, transparent 70%)',
        filter: 'blur(50px)',
      }} />

      {/* Left nebula glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '-15%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />

      {/* Center radial vignette for depth */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 70% at 50% 45%, transparent 35%, rgba(0,0,10,0.6) 100%)',
      }} />

      {/* Bottom silence */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '220px',
        background: 'linear-gradient(to top, rgba(0,0,6,0.75), transparent)',
      }} />

      {/* Side vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(0,0,6,0.5) 0%, transparent 12%, transparent 88%, rgba(0,0,6,0.5) 100%)',
      }} />

      {/* Fine scan-line texture */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.012) 2px, rgba(0,0,0,0.012) 4px)',
        mixBlendMode: 'multiply',
      }} />
    </div>
  );
}

/* ─── Floating cosmic micro-dust ─── */
export function CosmicDust() {
  const [mounted, setMounted] = useState(false);
  const [particles] = useState(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      duration: 20 + Math.random() * 50,
      delay: Math.random() * 25,
      size: 0.5 + Math.random() * 2,
      opacity: 0.04 + Math.random() * 0.14,
      color: i % 4 === 0 ? '34,211,238' : i % 4 === 1 ? '139,92,246' : i % 4 === 2 ? '59,130,246' : '255,255,255',
      drift: (Math.random() * 6 - 3).toFixed(1),
    }))
  );
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'hidden' }}>
      {particles.map(p => (
        <motion.div key={p.id}
          animate={{
            y: ['110vh', '-10vh'],
            x: [`${p.x}vw`, `${parseFloat(p.drift) + p.x}vw`],
            opacity: [0, p.opacity, p.opacity, 0],
          }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'linear' }}
          style={{
            position: 'absolute', bottom: '-5vh', left: `${p.x}vw`,
            width: p.size, height: p.size * 4, borderRadius: '50%',
            background: `rgba(${p.color}, 0.85)`,
            filter: `blur(${p.size * 0.4}px)`,
          }} />
      ))}
    </div>
  );
}

/* ─── Stat item ─── */
export function StatItem({ prefix = '', target, suffix = '', label, delay }: {
  prefix?: string; target: number; suffix?: string; label: string; delay: number;
}) {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const count = useCounter(inView ? target : 0, 2200, delay);
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000 + 0.8, duration: 0.6 }}
      whileHover={{ scale: 1.1, y: -2 }}
      style={{ textAlign: 'center', padding: '26px 16px', position: 'relative', cursor: 'default' }}>
      {/* Scan line on hover */}
      <motion.div
        initial={{ scaleX: 0 }} whileHover={{ scaleX: 1 }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.5), transparent)', transformOrigin: 'center' }}
      />
      <div style={{ fontSize: 'clamp(24px, 3.2vw, 38px)', fontWeight: 900, color: '#fff', marginBottom: '5px', fontVariantNumeric: 'tabular-nums', fontFamily: "'Space Grotesk', 'Outfit', sans-serif", textShadow: '0 0 30px rgba(34,211,238,0.3)' }}>
        {prefix}{count}{suffix}
      </div>
      <div style={{ fontSize: '0.58rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{label}</div>
    </motion.div>
  );
}

/* ─── Interactive Neural Network Canvas ─── */
export function NeuralCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    const NODE_COUNT = 80;
    const CONNECTION_DIST = 160;

    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 1.2 + Math.random() * 2,
      color: Math.random() > 0.6 ? '34,211,238' : Math.random() > 0.5 ? '139,92,246' : '59,130,246',
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const onMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMouse, { passive: true });

    let t = 0;
    const draw = () => {
      t++;
      ctx.clearRect(0, 0, W, H);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const ATTRACT_RADIUS = 180;

      for (const n of nodes) {
        const dx = mx - n.x;
        const dy = my - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ATTRACT_RADIUS && dist > 0) {
          const force = (1 - dist / ATTRACT_RADIUS) * 0.06;
          n.vx += dx / dist * force;
          n.vy += dy / dist * force;
        }
        n.vx *= 0.97;
        n.vy *= 0.97;
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0) n.x = W;
        if (n.x > W) n.x = 0;
        if (n.y < 0) n.y = H;
        if (n.y > H) n.y = 0;
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECTION_DIST) {
            const alpha = (1 - d / CONNECTION_DIST) * 0.18;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(34,211,238,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.018 + n.pulsePhase);
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5);
        glow.addColorStop(0, `rgba(${n.color},${0.7 * pulse})`);
        glow.addColorStop(1, `rgba(${n.color},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 4, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${n.color},${0.5 + 0.5 * pulse})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouse);
    };
  }, []);

  return (
    <canvas ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 3, pointerEvents: 'none', opacity: 0.5 }} />
  );
}

/* ─── Live Threat Data Ticker ─── */
const TICKER_ITEMS = [
  "⬛ NODE_12 · Crowd density spike +340% · ALERT",
  "🟢 SECTOR_A · All systems nominal",
  "⬛ ZONE_7 · Velocity anomaly detected · TRACKING",
  "🟢 AI_CORE · YOLO inference 98.2% confidence",
  "⬛ GATE_3 · Counter threshold exceeded · DISPATCH",
  "🟢 LSTM_MODEL · 60-min surge forecast · STABLE",
  "⬛ EDGE_NODE_5 · Frame skip corrected · NOMINAL",
  "🟢 SYSTEM · Uptime 99.9% · ALL GREEN",
];

export function ThreatTicker() {
  const [offset, setOffset] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    let pos = 0;
    const speed = 0.5;
    const step = () => {
      const el = contentRef.current;
      if (el) {
        pos += speed;
        const half = el.scrollWidth / 2;
        if (pos >= half) pos = 0;
        el.style.transform = `translateX(-${pos}px)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tickerText = [...TICKER_ITEMS, ...TICKER_ITEMS].join('  ·  ');

  return (
    <div style={{
      overflow: 'hidden',
      borderTop: '1px solid rgba(34,211,238,0.08)',
      borderBottom: '1px solid rgba(34,211,238,0.08)',
      background: 'rgba(2,4,18,0.7)',
      backdropFilter: 'blur(20px)',
      padding: '9px 0',
      position: 'relative',
    }}>
      {/* Left fade */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '80px', background: 'linear-gradient(to right, rgba(2,4,18,0.95), transparent)', zIndex: 1 }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '80px', background: 'linear-gradient(to left, rgba(2,4,18,0.95), transparent)', zIndex: 1 }} />

      <div ref={contentRef} style={{ display: 'flex', gap: '0', whiteSpace: 'nowrap', willChange: 'transform' }}>
        <span style={{ fontFamily: "'Space Grotesk', monospace", fontSize: '0.6rem', fontWeight: 600, color: '#1e4060', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {tickerText}
        </span>
      </div>
    </div>
  );
}
