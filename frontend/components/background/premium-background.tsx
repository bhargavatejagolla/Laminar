"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/*
 * LAMINAR — ULTRA-HD 8K TELESCOPE BACKGROUND ENGINE
 * Architecture per page:
 *   LANDING   → 8K Cinematic Spiral Galaxy + Telescope Lens overlay + Deep Parallax
 *   LOGIN     → Pillar Nebula  + warm star clusters + 1 distant planet
 *   REGISTER  → Globular Cluster + blue-white star swarm
 */

// ─── PHOTOREALISTIC PLANET RENDERER ─────────────────────────────────────────
function drawRealisticPlanet(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  baseCol: string,
  litCol: string,
  rimCol: string,
  bandCol?: string
) {
  const lx = x - r * 0.45;
  const ly = y - r * 0.40;

  const sphere = ctx.createRadialGradient(lx, ly, 0, x, y, r);
  sphere.addColorStop(0,    "rgba(" + litCol + ", 1)");
  sphere.addColorStop(0.3,  "rgba(" + litCol + ", 0.85)");
  sphere.addColorStop(0.65, "rgba(" + baseCol + ", 1)");
  sphere.addColorStop(0.88, "rgba(" + baseCol + ", 0.9)");
  sphere.addColorStop(1,    "rgba(0,0,0,1)");

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = sphere;
  ctx.fill();

  if (bandCol) {
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.25;
    for (let b = -2; b <= 3; b++) {
      const by = y + b * r * 0.28;
      const bh = r * 0.09;
      const bandGrad = ctx.createLinearGradient(x - r, by, x + r, by + bh);
      bandGrad.addColorStop(0, "rgba(" + bandCol + ",0)");
      bandGrad.addColorStop(0.3, "rgba(" + bandCol + ",0.9)");
      bandGrad.addColorStop(0.7, "rgba(" + bandCol + ",0.9)");
      bandGrad.addColorStop(1, "rgba(" + bandCol + ",0)");
      ctx.beginPath();
      ctx.ellipse(x, by + bh / 2, r * 0.98, bh, 0, 0, Math.PI * 2);
      ctx.fillStyle = bandGrad;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  const shadow = ctx.createRadialGradient(x + r * 0.4, y + r * 0.35, r * 0.1, x + r * 0.3, y + r * 0.25, r * 1.1);
  shadow.addColorStop(0,   "rgba(0,0,0,0)");
  shadow.addColorStop(0.6, "rgba(0,0,0,0.3)");
  shadow.addColorStop(1,   "rgba(0,0,0,0.95)");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = shadow;
  ctx.fill();

  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.8;
  const rim = ctx.createRadialGradient(lx - r * 0.1, ly - r * 0.1, r * 0.7, lx, ly, r * 1.35);
  rim.addColorStop(0,   "rgba(" + rimCol + ",0)");
  rim.addColorStop(0.6, "rgba(" + rimCol + ",0.15)");
  rim.addColorStop(0.85,"rgba(" + rimCol + ",0.35)");
  rim.addColorStop(1,   "rgba(" + rimCol + ",0)");
  ctx.beginPath();
  ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  ctx.restore();
}

// ─── CANVAS OVERLAY ──────────────────────────────────────────────────────────
interface SpaceCanvasProps {
  pageType: "landing" | "login" | "register";
}

function SpaceCanvas({ pageType }: SpaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let time = 0;
    let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

    type Star = {
      x: number; y: number; r: number; alpha: number; col: string;
      tw: number; phase: number; px: number; py: number; depth: number;
    };
    type Planet = {
      bx: number; by: number; x: number; y: number; r: number;
      base: string; lit: string; rim: string; band?: string;
      phase: number; speed: number;
    };
    type Comet = {
      x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
    };

    let stars: Star[] = [];
    let planets: Planet[] = [];
    let comets: Comet[] = [];

    const init = () => {
      const W = canvas.width;
      const H = canvas.height;
      stars = [];
      planets = [];
      comets = [];

      const count = pageType === "landing" ? 1800 : pageType === "login" ? 900 : 700;

      for (let i = 0; i < count; i++) {
        const rand = Math.random();
        let col = "255,255,255";
        if (rand < 0.10) col = "180,210,255";
        else if (rand < 0.18) col = "255,245,225";
        else if (rand < 0.25) col = "255,225,180";
        else if (rand < 0.30) col = "255,195,150";
        else if (rand < 0.34) col = "255,165,120";

        const u = Math.random();
        let r: number;
        if (u > 0.995) r = 2.2 + Math.random() * 1.2;
        else if (u > 0.97) r = 1.2 + Math.random() * 0.8;
        else if (u > 0.80) r = 0.5 + Math.random() * 0.4;
        else r = 0.05 + Math.random() * 0.3;

        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r,
          alpha: Math.random() * 0.85 + 0.15,
          col,
          tw: Math.random() * 0.008 + 0.002,
          phase: Math.random() * Math.PI * 2,
          px: (Math.random() - 0.5) * 0.3,
          py: (Math.random() - 0.5) * 0.3,
          depth: Math.random() * 2 + 0.5,
        });
      }

      if (pageType === "landing") {
        planets.push({
          bx: W * 0.12, by: H * 0.18, x: W * 0.12, y: H * 0.18,
          r: 110, base: "10,14,28", lit:  "35,60,110", rim:  "60,130,255", band: "16,28,50",
          phase: 0, speed: 0.0002,
        });
        planets.push({
          bx: W * 0.85, by: H * 0.85, x: W * 0.85, y: H * 0.85,
          r: 75, base: "30,15,10", lit:  "80,45,25", rim:  "255,140,50",
          phase: 1.5, speed: 0.0003,
        });
      }
    };

    const animate = () => {
      time++;
      const W = canvas.width;
      const H = canvas.height;
      const CX = W / 2;
      const CY = H / 2;

      ctx.clearRect(0, 0, W, H);

      // Randomly spawn comets (shooting stars)
      if (Math.random() < 0.015 && pageType === "landing") {
        comets.push({
          x: Math.random() * W,
          y: Math.random() * (H / 2),
          vx: 15 + Math.random() * 15,
          vy: 5 + Math.random() * 10,
          life: 0,
          maxLife: 60 + Math.random() * 40,
        });
      }

      if (pageType === "landing") {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const neb1 = ctx.createRadialGradient(W * 0.3 + Math.sin(time*0.0005)*80, H * 0.4, 0, W * 0.3, H * 0.4, W * 0.7);
        neb1.addColorStop(0, "rgba(40,30,120,0.12)");
        neb1.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = neb1;
        ctx.fillRect(0,0,W,H);
        
        const neb2 = ctx.createRadialGradient(W * 0.7 - Math.cos(time*0.0007)*60, H * 0.6, 0, W * 0.7, H * 0.6, W * 0.6);
        neb2.addColorStop(0, "rgba(90,20,80,0.08)");
        neb2.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = neb2;
        ctx.fillRect(0,0,W,H);
        ctx.restore();
      }

      // Parallax derived from mouse center distance
      // Using an eased approach instead of exact mouse to simulate massive scale
      const mox = (mouse.x - CX) * 0.0015;
      const moy = (mouse.y - CY) * 0.0015;

      for (const s of stars) {
        const tw = 0.8 + Math.sin(time * s.tw + s.phase) * 0.2;
        // Depth-based parallax: stars closer feature more shift
        const sx = s.x - mox * s.px * 120 * s.depth;
        const sy = s.y - moy * s.py * 120 * s.depth;
        const a = Math.min(s.alpha * tw, 1);

        if (s.r < 0.6) {
          ctx.fillStyle = "rgba(" + s.col + "," + a + ")";
          ctx.fillRect(Math.floor(sx), Math.floor(sy), s.r * 2, s.r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(" + s.col + "," + a + ")";
          ctx.fill();
        }

        if (s.r > 2.0) {
          const spikeLen = s.r * 18;
          const spikeAlpha = a * 0.7;
          ctx.save();
          ctx.globalAlpha = spikeAlpha;
          ctx.strokeStyle = "rgba(" + s.col + ",1)";
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(sx - spikeLen, sy);
          ctx.lineTo(sx + spikeLen, sy);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx, sy - spikeLen);
          ctx.lineTo(sx, sy + spikeLen);
          ctx.stroke();
          
          ctx.globalAlpha = spikeAlpha * 0.5;
          ctx.lineWidth = 0.4;
          const d = spikeLen * 0.65;
          ctx.beginPath();
          ctx.moveTo(sx - d, sy - d);
          ctx.lineTo(sx + d, sy + d);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx + d, sy - d);
          ctx.lineTo(sx - d, sy + d);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.globalCompositeOperation = "screen";
          const bloom = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.r * 8);
          bloom.addColorStop(0, "rgba(" + s.col + "," + (a * 0.8) + ")");
          bloom.addColorStop(0.2, "rgba(" + s.col + "," + (a * 0.3) + ")");
          bloom.addColorStop(1, "rgba(" + s.col + ",0)");
          ctx.beginPath();
          ctx.arc(sx, sy, s.r * 8, 0, Math.PI * 2);
          ctx.fillStyle = bloom;
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
          ctx.restore();
        }
      }

      for (const p of planets) {
        p.phase += p.speed;
        p.x = p.bx + Math.sin(p.phase) * 12 - mox * 40;
        p.y = p.by + Math.cos(p.phase * 0.67) * 8 - moy * 40;
        drawRealisticPlanet(ctx, p.x, p.y, p.r, p.base, p.lit, p.rim, p.band);
      }

      // Draw Comets
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.x += c.vx;
        c.y += c.vy;
        c.life++;

        const alpha = Math.max(0, 1 - (c.life / c.maxLife));
        const trailGrad = ctx.createLinearGradient(c.x, c.y, c.x - c.vx * 3, c.y - c.vy * 3);
        trailGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        trailGrad.addColorStop(1, `rgba(100, 200, 255, 0)`);

        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x - c.vx * 3, c.y - c.vy * 3);
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(c.x, c.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();

        if (c.life >= c.maxLife) {
          comets.splice(i, 1);
        }
      }
      ctx.restore();

      animId = requestAnimationFrame(animate);
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };
    resize();
    window.addEventListener("resize", resize);
    animId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, [pageType]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 3, pointerEvents: "none" }}
    />
  );
}

// ─── PAGE-SPECIFIC IMAGE CONFIGS ─────────────────────────────────────────────
const PAGE_CONFIG = {
  landing: {
    img: "/galaxy.png",
    filter: "brightness(1.2) saturate(1.8) contrast(1.3) hue-rotate(-2deg)",
    opacity: 1, // Full opacity for 8K pop
    baseSize: "180%", // Will be scaled by Framer Motion
    imgTop: "-40%",
    imgLeft: "-40%",
    rotateDur: "400s", // Very slow cinematic turn
    vignette: "radial-gradient(ellipse 65% 55% at 50% 50%, transparent 5%, rgba(0,0,2,0.85) 100%)",
  },
  login: {
    img: "/nebula.png",
    filter: "brightness(0.95) saturate(1.3) contrast(1.1)",
    opacity: 0.9,
    baseSize: "160%",
    imgTop: "-30%",
    imgLeft: "-30%",
    rotateDur: "800s",
    vignette: "radial-gradient(ellipse 65% 60% at 50% 50%, transparent 10%, rgba(2,1,4,0.75) 100%)",
  },
  register: {
    img: "/cluster.png",
    filter: "brightness(0.85) saturate(1.1) contrast(1.2)",
    opacity: 0.88,
    baseSize: "150%",
    imgTop: "-25%",
    imgLeft: "-25%",
    rotateDur: "600s",
    vignette: "radial-gradient(ellipse 60% 55% at 50% 50%, transparent 10%, rgba(1,1,5,0.8) 100%)",
  },
};

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export default function PremiumBackground() {
  const pathname = usePathname() || "/";

  let pageType: "landing" | "login" | "register" = "landing";
  if (pathname.includes("/login")) pageType = "login";
  else if (pathname.includes("/register")) pageType = "register";

  const cfg = PAGE_CONFIG[pageType];

  // ── Mouse Tracking for Deep Parallax ──
  const mouseX = useMotionValue(typeof window !== "undefined" ? window.innerWidth / 2 : 0);
  const mouseY = useMotionValue(typeof window !== "undefined" ? window.innerHeight / 2 : 0);

  const springConfig = { stiffness: 40, damping: 25 };
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  // Parallax shifts: the background moves inverted to the mouse.
  const bgShiftX = useTransform(springX, [0, typeof window !== "undefined" ? window.innerWidth : 1000], [40, -40]);
  const bgShiftY = useTransform(springY, [0, typeof window !== "undefined" ? window.innerHeight : 1000], [40, -40]);

  // Lens flare/glare shifts with the mouse
  const glareShiftX = useTransform(springX, [0, typeof window !== "undefined" ? window.innerWidth : 1000], [-80, 80]);
  const glareShiftY = useTransform(springY, [0, typeof window !== "undefined" ? window.innerHeight : 1000], [-80, 80]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", background: "#000002" }}>

      {/* ── LAYER 0: Photorealistic Astronomy Image (Animated & Parallaxed) ── */}
      <motion.div
        initial={pageType === "landing" ? { scale: 2.2, filter: "blur(30px)", opacity: 0 } : {}}
        animate={pageType === "landing" ? { scale: 1, filter: "blur(0px)", opacity: cfg.opacity } : {}}
        transition={{ duration: 4.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "absolute",
          width: cfg.baseSize,
          height: cfg.baseSize,
          top: cfg.imgTop,
          left: cfg.imgLeft,
          x: bgShiftX,
          y: bgShiftY,
          opacity: cfg.opacity,
          filter: cfg.filter,
          zIndex: 1,
          pointerEvents: "none",
          mixBlendMode: "screen",
        }}
      >
        <div style={{
          width: "100%", height: "100%",
          animation: "galaxyRotate " + cfg.rotateDur + " linear infinite",
          backgroundImage: "url('" + cfg.img + "')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          imageRendering: "high-quality" as any,
        }} />
      </motion.div>

      {/* ── LAYER 0.5: Cinematic Core Glow Pulse ── */}
      {pageType === "landing" && (
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 50% 50%, rgba(255,240,245,0.4) 0%, rgba(200,100,255,0.15) 15%, transparent 50%)",
            filter: "blur(60px)",
            mixBlendMode: "screen",
            zIndex: 1.5,
            pointerEvents: "none",
            x: useTransform(springX, [0, 1000], [20, -20]),
            y: useTransform(springY, [0, 1000], [20, -20]),
          }}
        />
      )}

      {/* ── LAYER 1: Deep Space Vignette mask before stars ── */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 75% 65% at 50% 50%, transparent 10%, rgba(0,0,2,0.4) 100%)",
          zIndex: 2, pointerEvents: "none",
        }}
      />

      {/* ── LAYER 2: 8K Stars + Planets (Canvas) ── */}
      <SpaceCanvas pageType={pageType} />

      {/* ── LAYER 3: Lens Optics & Chromatic Aberration ── */}
      {pageType === "landing" && (
        <>
          {/* Glass Reflection Glare */}
          <motion.div
            style={{
              position: "absolute", inset: "-20%",
              background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 40%)",
              zIndex: 4, pointerEvents: "none",
              mixBlendMode: "screen",
              x: glareShiftX,
              y: glareShiftY,
            }}
          />
          {/* Chromatic Edge Ring */}
          <div
            style={{
              position: "absolute", inset: 0,
              boxShadow: "inset 0 0 100px rgba(0, 0, 0, 0.9), inset 0 0 20px rgba(255, 0, 0, 0.1), inset 0 0 20px rgba(0, 0, 255, 0.1)",
              zIndex: 5, pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* ── LAYER 4: Final Outer Vignette ── */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: cfg.vignette,
          zIndex: 6, pointerEvents: "none",
          mixBlendMode: "multiply"
        }}
      />

      <style>{`
        @keyframes galaxyRotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
