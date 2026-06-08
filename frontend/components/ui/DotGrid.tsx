'use client';
import { useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';

import './DotGrid.css';

const throttle = (func: any, limit: number) => {
  let lastCall = 0;
  return function (this: any, ...args: any[]) {
    const now = performance.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func.apply(this, args);
    }
  };
};

function hexToRgb(hex: string) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16)
  };
}

const DotGrid = ({
  dotSize = 16,
  gap = 32,
  baseColor = '#5227FF',
  activeColor = '#5227FF',
  proximity = 150,
  speedTrigger = 100,
  shockRadius = 250,
  shockStrength = 5,
  maxSpeed = 5000,
  resistance = 750,
  returnDuration = 1.5,
  className = '',
  style = {}
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<any[]>([]);
  const pointerRef = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    lastTime: 0,
    lastX: 0,
    lastY: 0
  });

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

  const circlePath = useMemo(() => {
    if (typeof window === 'undefined' || !(window as any).Path2D) return null;
    const p = new (window as any).Path2D();
    p.arc(0, 0, dotSize / 2, 0, Math.PI * 2);
    return p;
  }, [dotSize]);

  const buildGrid = useCallback(() => {
    const wrap = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const cols = Math.ceil(rect.width / gap) + 1;
    const rows = Math.ceil(rect.height / gap) + 1;
    
    dotsRef.current = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dotsRef.current.push({
          cx: c * gap,
          cy: r * gap,
          xOffset: 0,
          yOffset: 0,
          colorP: 0,
          _inertiaApplied: false
        });
      }
    }
  }, [gap]);

  useEffect(() => {
    buildGrid();
    window.addEventListener('resize', buildGrid);
    return () => window.removeEventListener('resize', buildGrid);
  }, [buildGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !circlePath) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ptr = pointerRef.current;

      for (const dot of dotsRef.current) {
        const dx = dot.cx - ptr.x;
        const dy = dot.cy - ptr.y;
        const dist = Math.hypot(dx, dy);

        let targetColorP = 0;
        if (dist < proximity) {
          const falloff = 1 - dist / proximity;
          targetColorP = falloff * Math.min(1, ptr.speed / speedTrigger);
        }

        dot.colorP += (targetColorP - dot.colorP) * 0.1;

        const r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * dot.colorP);
        const g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * dot.colorP);
        const b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * dot.colorP);

        ctx.save();
        ctx.translate(dot.cx + dot.xOffset, dot.cy + dot.yOffset);
        ctx.fillStyle = \gb(\, \, \)\;
        ctx.fill(circlePath);
        ctx.restore();
      }
    };

    gsap.ticker.add(render);
    return () => gsap.ticker.remove(render);
  }, [circlePath, proximity, speedTrigger, baseRgb, activeRgb]);

  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;

    const onMove = (e: MouseEvent) => {
      const rect = wrap.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      
      const ptr = pointerRef.current;
      const now = performance.now();
      const dt = Math.max(1, now - ptr.lastTime);
      
      ptr.vx = (nx - ptr.lastX) / dt;
      ptr.vy = (ny - ptr.lastY) / dt;
      ptr.speed = Math.min(maxSpeed, Math.hypot(ptr.vx, ptr.vy) * 1000);
      
      ptr.lastX = nx;
      ptr.lastY = ny;
      ptr.lastTime = now;
      ptr.x = nx;
      ptr.y = ny;
    };

    const onClick = (e: MouseEvent) => {
      const rect = wrap.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
        if (dist < shockRadius) {
          gsap.killTweensOf(dot);
          const falloff = Math.max(0, 1 - dist / shockRadius);
          const pushX = (dot.cx - cx) * shockStrength * falloff;
          const pushY = (dot.cy - cy) * shockStrength * falloff;
          
          // Using standard spring instead of InertiaPlugin to avoid dependency issues
          gsap.to(dot, {
            xOffset: pushX,
            yOffset: pushY,
            duration: 0.2,
            ease: "power2.out",
            onComplete: () => {
              gsap.to(dot, {
                xOffset: 0,
                yOffset: 0,
                duration: returnDuration,
                ease: "elastic.out(1, 0.5)"
              });
            }
          });
        }
      }
    };

    const throttledMove = throttle(onMove, 50);
    window.addEventListener('mousemove', throttledMove, { passive: true });
    window.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('mousemove', throttledMove);
      window.removeEventListener('click', onClick);
    };
  }, [maxSpeed, speedTrigger, proximity, resistance, returnDuration, shockRadius, shockStrength]);

  return (
    <section className={\dot-grid \\} style={style}>
      <div ref={wrapperRef} className="dot-grid__wrap">
        <canvas ref={canvasRef} className="dot-grid__canvas" />
      </div>
    </section>
  );
};

export default DotGrid;
