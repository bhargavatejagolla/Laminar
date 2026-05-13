"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/* ─────────────────────────────────────────────────────────────────────────────
   Layer 1 – Neural-network particle canvas (Interactive)
───────────────────────────────────────────────────────────────────────────── */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let W = 0, H = 0;
    let time = 0;

    const BASE_PARTICLE_COUNT = 25;
    const BURST_COUNT = 10;
    const CONNECT_DIST = 110;
    const MOUSE_CONNECT_DIST = 200;
    const PULSE_SPEED = 0.01;

    type Particle = {
      x: number; y: number;
      vx: number; vy: number;
      r: number;
      phase: number;
      life: number;
      isBase: boolean;
    };

    let particles: Particle[] = [];
    let mouse = { x: -1000, y: -1000 };

    const createParticle = (x: number, y: number, isBase = false): Particle => ({
      x, y,
      vx: (Math.random() - 0.5) * (isBase ? 0.4 : 5.0),
      vy: (Math.random() - 0.5) * (isBase ? 0.4 : 5.0),
      r: Math.random() * (isBase ? 2 : 2.5) + 0.5,
      phase: Math.random() * Math.PI * 2,
      life: 1.0,
      isBase
    });

    const init = () => {
      const prevW = W;
      const prevH = H;
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;

      // If already initialized, just scale particles to fit new size instead of resetting
      if (particles.length > 0) {
        for (const p of particles) {
          p.x = (p.x / (prevW || W)) * W;
          p.y = (p.y / (prevH || H)) * H;
        }
      } else {
        particles = Array.from({ length: BASE_PARTICLE_COUNT }, () => 
          createParticle(Math.random() * W, Math.random() * H, true)
        );
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Create burst
      for (let i = 0; i < BURST_COUNT; i++) {
        particles.push(createParticle(e.clientX, e.clientY, false));
      }
      // Performance cap: Remove oldest non-base particles if count is too high
      if (particles.length > 400) {
        let baseCount = 0;
        particles = particles.filter(p => {
          if (p.isBase) {
            baseCount++;
            return true;
          }
          // Only keep newest temporary particles
          return false; 
        }).concat(particles.filter(p => !p.isBase).slice(-300));
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      time += 0.015;

      // Filtering and Update
      particles = particles.filter(p => p.isBase || p.life > 0.01);

      // Swaying displacement (Up and Down breathing effect)
      const swayAmplitude = 25;
      const swayY = Math.sin(time * 0.5) * swayAmplitude;

      // Vertical Scanline Effect (pulse that sweeps right)
      const scanX = (time * 120) % (W + 400) - 200;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.phase += PULSE_SPEED;
        
        if (!p.isBase) {
          p.life -= 0.0003; 
          p.vx *= 0.99;    
          p.vy *= 0.99;
        }

        // Wrap around
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;

        // Mouse attraction
        if (p.isBase) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 300) {
            p.x += dx * 0.01;
            p.y += dy * 0.01;
          }
        }
      }

      // Draw Edges
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        const ay = a.y + swayY; // Apply sway for rendering only

        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const by = b.y + swayY;
          const dx = a.x - b.x, dy = ay - by;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < CONNECT_DIST) {
            const minLife = Math.min(a.life, b.life);
            // Scan boost: connections glow more when scanline passes
            const scanDist = Math.abs(a.x - scanX);
            const scanBoost = scanDist < 100 ? (1 - scanDist / 100) * 0.8 : 0;
            
            const alpha = (1 - dist / CONNECT_DIST) * (0.45 + scanBoost) * minLife;
            
            ctx.strokeStyle = (i + j) % 3 !== 0 ? `rgba(50,150,255,${alpha})` : `rgba(30,80,255,${alpha})`;
            ctx.lineWidth = a.isBase ? 0.6 : 1.2;
            ctx.beginPath();
            ctx.moveTo(a.x, ay);
            ctx.lineTo(b.x, by);
            ctx.stroke();
          }
        }
        
        // Edge to mouse
        const mdx = a.x - mouse.x;
        const mdy = ay - mouse.y;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mDist < MOUSE_CONNECT_DIST) {
          const alpha = (1 - mDist / MOUSE_CONNECT_DIST) * 0.6 * a.life;
          ctx.strokeStyle = `rgba(130, 190, 255, ${alpha})`;
          ctx.lineWidth = a.isBase ? 1.0 : 2.0;
          ctx.beginPath();
          ctx.moveTo(a.x, ay);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      // Draw Nodes
      for (const p of particles) {
        const py = p.y + swayY;
        const scanDist = Math.abs(p.x - scanX);
        const scanPulse = scanDist < 150 ? (1 - scanDist / 150) * 1.5 : 1;
        
        const pulse = (0.6 + 0.4 * Math.sin(p.phase * 2)) * p.life * scanPulse;
        const glowSize = p.isBase ? 5 : 8;
        const radialGlow = ctx.createRadialGradient(p.x, py, 0, p.x, py, p.r * glowSize);
        
        radialGlow.addColorStop(0, `rgba(100, 200, 255, ${1.2 * pulse})`);
        radialGlow.addColorStop(0.4, `rgba(30, 80, 255, ${0.8 * pulse})`);
        radialGlow.addColorStop(1, "rgba(0,0,0,0)");
        
        ctx.fillStyle = radialGlow;
        ctx.beginPath();
        ctx.arc(p.x, py, p.r * glowSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * pulse})`;
        ctx.beginPath();
        ctx.arc(p.x, py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    init();
    draw();

    window.addEventListener("mousemove", handleMouseMove);
    // Use capture phase to ensure we get clicks even over interactive UI components
    window.addEventListener("mousedown", handleMouseDown, { capture: true });
    window.addEventListener("resize", init);
    
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown, { capture: true });
      window.removeEventListener("resize", init);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.8,
      }}
    />
  );
}

function PerspectiveGrid() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%) rotateX(72deg)",
          transformOrigin: "bottom center",
          width: "260%",
          height: "100%",
          backgroundImage: `
            linear-gradient(rgba(14,165,233,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(14,165,233,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "100px 100px",
          animation: "gridScroll 10s linear infinite",
          maskImage: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

function DecorativeCircuits() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", opacity: 0.8 }}>
      <svg width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="circ-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(80,180,255,1)" />
            <stop offset="100%" stopColor="rgba(30,80,255,0.2)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {/* Abstract circuit lines */}
        <motion.path
          d="M0,100 L100,100 L150,50 L400,50"
          stroke="url(#circ-grad)"
          strokeWidth="2"
          filter="url(#glow)"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ 
            pathLength: 1, 
            opacity: [0.7, 1, 0.8, 1, 0.9],
          }}
          transition={{ 
            pathLength: { duration: 4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
            opacity: { duration: 0.2, repeat: Infinity, repeatType: "mirror" }
          }}
        />
        <motion.path
          d="M100,0 L100,200 L200,300 L600,300"
          stroke="url(#circ-grad)"
          strokeWidth="2"
          filter="url(#glow)"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ 
            pathLength: 1, 
            opacity: [0.6, 0.9, 0.7, 1, 0.8],
          }}
          transition={{ 
            pathLength: { duration: 6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 1 },
            opacity: { duration: 0.3, repeat: Infinity, repeatType: "mirror", delay: 0.5 }
          }}
        />
        <motion.path
          d="M1000 200 L900 200 L850 300 L700 300"
          stroke="url(#circ-grad)"
          strokeWidth="2"
          filter="url(#glow)"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 2 }}
        />
        {/* Floating geometric bits */}
        <rect x="150" y="150" width="20" height="20" stroke="rgba(80,180,255,0.5)" fill="none" transform="rotate(45 150 150)" />
        <rect x="850" y="750" width="40" height="40" stroke="rgba(80,180,255,0.4)" fill="none" transform="rotate(22 850 750)" />
        <circle cx="200" cy="800" r="30" stroke="rgba(30,80,255,0.3)" fill="none" />
      </svg>
    </div>
  );
}

function AuroraBlobs() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "-20%", left: "-10%",
          width: "60vw", height: "60vw",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(30,80,255,0.12) 0%, transparent 70%)",
          filter: "blur(100px)",
          animation: "blobFloat1 35s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-10%", right: "-5%",
          width: "50vw", height: "50vw",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(30,80,255,0.06) 0%, transparent 70%)",
          filter: "blur(120px)",
          animation: "blobFloat2 40s ease-in-out infinite",
        }}
      />
    </div>
  );
}

const GlobalStyles = () => (
  <style>{`
    @keyframes gridScroll {
      from { background-position: 0 0; }
      to   { background-position: 0 100px; }
    }
    @keyframes blobFloat1 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      50%       { transform: translate(3%, 3%) scale(1.1); }
    }
    @keyframes blobFloat2 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      50%       { transform: translate(-3%, -3%) scale(1.05); }
    }
  `}</style>
);

export default function OnboardingBackground() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 overflow-hidden bg-black"
    >
      <GlobalStyles />
      <AuroraBlobs />
      <PerspectiveGrid />
      <DecorativeCircuits />
      <ParticleCanvas />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 100%)`,
        }}
      />
    </div>
  );
}
