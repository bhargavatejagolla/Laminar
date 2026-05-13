import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';
import './GradientBlinds.css';

const MAX_COLORS = 8;
const hexToRGB = (hex: string) => {
  const c = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return [r, g, b];
};
const prepStops = (stops: string[]) => {
  const base = (stops && stops.length ? stops : ['#FF9FFC', '#5227FF']).slice(0, MAX_COLORS);
  if (base.length === 1) base.push(base[0]);
  while (base.length < MAX_COLORS) base.push(base[base.length - 1]);
  const arr = [];
  for (let i = 0; i < MAX_COLORS; i++) arr.push(hexToRGB(base[i]));
  const count = Math.max(2, Math.min(MAX_COLORS, stops?.length ?? 2));
  return { arr, count };
};

interface GradientBlindsProps {
  className?: string;
  dpr?: number;
  paused?: boolean;
  gradientColors: string[];
  angle?: number;
  noise?: number;
  blindCount?: number;
  blindMinWidth?: number;
  mouseDampening?: number;
  mirrorGradient?: boolean;
  spotlightRadius?: number;
  spotlightSoftness?: number;
  spotlightOpacity?: number;
  distortAmount?: number;
  shineDirection?: 'left' | 'right';
  mixBlendMode?: any;
}

const GradientBlinds = ({
  className = '',
  dpr,
  paused = false,
  gradientColors,
  angle = 0,
  noise = 0.3,
  blindCount = 16,
  blindMinWidth = 60,
  mouseDampening = 0.15,
  mirrorGradient = false,
  spotlightRadius = 0.5,
  spotlightSoftness = 1,
  spotlightOpacity = 1,
  distortAmount = 0,
  shineDirection = 'left',
  mixBlendMode = 'lighten'
}: GradientBlindsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const programRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const mouseTargetRef = useRef<[number, number]>([0, 0]);
  const lastTimeRef = useRef<number>(0);
  const firstResizeRef = useRef<boolean>(true);
  const uniformsRef = useRef<any>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({
      dpr: dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
      alpha: true,
      antialias: true
    });
    rendererRef.current = renderer;
    const gl = renderer.gl;
    const canvas = gl.canvas;

    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const vertex = `
      attribute vec2 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fragment = `
      precision mediump float;
      uniform vec3  iResolution;
      uniform vec2  iMouse;
      uniform float iTime;
      uniform float uAngle;
      uniform float uNoise;
      uniform float uBlindCount;
      uniform float uSpotlightRadius;
      uniform float uSpotlightOpacity;
      uniform float uMirror;
      uniform float uDistort;
      uniform float uShineFlip;
      uniform vec3  uColor0, uColor1, uColor2, uColor3, uColor4, uColor5, uColor6, uColor7;
      uniform int   uColorCount;
      varying vec2  vUv;

      float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
      vec2 rotate2D(vec2 p, float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c) * p; }

      vec3 getGradientColor(float t){
        float tt = clamp(t, 0.0, 1.0);
        float scaled = tt * float(uColorCount - 1);
        float seg = floor(scaled);
        float f = fract(scaled);
        if (seg < 1.0) return mix(uColor0, uColor1, f);
        if (seg < 2.0) return mix(uColor1, uColor2, f);
        if (seg < 3.0) return mix(uColor2, uColor3, f);
        if (seg < 4.0) return mix(uColor3, uColor4, f);
        if (seg < 5.0) return mix(uColor4, uColor5, f);
        if (seg < 6.0) return mix(uColor5, uColor6, f);
        return mix(uColor6, uColor7, f);
      }

      void main() {
        vec2 uv0 = vUv;
        float aspect = iResolution.x / iResolution.y;
        vec2 p = uv0 * 2.0 - 1.0;
        p.x *= aspect;
        vec2 pr = rotate2D(p, uAngle);
        pr.x /= aspect;
        vec2 uv = pr * 0.5 + 0.5;

        vec2 uvMod = clamp(uv, 0.0, 1.0);
        if (uDistort > 0.0) {
          float w = 0.01 * uDistort;
          uvMod.x += sin(uvMod.y * 6.0) * w;
          uvMod.y += cos(uvMod.x * 6.0) * w;
          uvMod = clamp(uvMod, 0.0, 1.0);
        }

        float t = (uMirror > 0.5) ? 1.0 - abs(1.0 - 2.0 * fract(uvMod.x)) : uvMod.x;
        vec3 base = getGradientColor(t);

        vec2 mouseOffset = iMouse.xy / iResolution.xy;
        float d = length(uv0 - mouseOffset);
        
        // MOODY DARK LIGHTING
        float spot = smoothstep(max(uSpotlightRadius, 0.01), 0.0, d) * (uSpotlightOpacity * 0.35);

        float stripe = fract(uvMod.x * uBlindCount);
        if (uShineFlip > 0.5) stripe = 1.0 - stripe;

        // Darker composition for Mission Control aesthetic
        vec3 col = (vec3(spot) * 0.4 + base) * 0.65 - vec3(stripe * 0.07);
        col += (rand(uv0 + iTime) - 0.5) * (uNoise * 0.2);

        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `;

    const { arr: colorArr, count: colorCount } = prepStops(gradientColors);
    const uniforms = {
      iResolution: { value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1] },
      iMouse: { value: [0, 0] },
      iTime: { value: 0 },
      uAngle: { value: (angle * Math.PI) / 180 },
      uNoise: { value: noise },
      uBlindCount: { value: Math.max(1, blindCount) },
      uSpotlightRadius: { value: spotlightRadius },
      uSpotlightOpacity: { value: spotlightOpacity },
      uMirror: { value: mirrorGradient ? 1 : 0 },
      uDistort: { value: distortAmount },
      uShineFlip: { value: shineDirection === 'right' ? 1 : 0 },
      uColor0: { value: colorArr[0] },
      uColor1: { value: colorArr[1] },
      uColor2: { value: colorArr[2] },
      uColor3: { value: colorArr[3] },
      uColor4: { value: colorArr[4] },
      uColor5: { value: colorArr[5] },
      uColor6: { value: colorArr[6] },
      uColor7: { value: colorArr[7] },
      uColorCount: { value: colorCount }
    };
    uniformsRef.current = uniforms;

    const program = new Program(gl, { vertex, fragment, uniforms });
    programRef.current = program;
    const geometry = new Triangle(gl);
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      if (uniformsRef.current) {
        uniformsRef.current.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1];
        const maxByMinWidth = (blindMinWidth && blindMinWidth > 0) ? Math.max(1, Math.floor(rect.width / blindMinWidth)) : 999;
        uniformsRef.current.uBlindCount.value = Math.max(1, Math.min(blindCount, maxByMinWidth));
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scale = renderer.dpr || 1;
      mouseTargetRef.current = [(e.clientX - rect.left) * scale, (rect.height - (e.clientY - rect.top)) * scale];
    };
    window.addEventListener('pointermove', onPointerMove);

    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (uniformsRef.current) {
        uniformsRef.current.iTime.value = t * 0.001;
        if (mouseDampening > 0) {
          const dt = (t - (lastTimeRef.current || t)) / 1000;
          lastTimeRef.current = t;
          const factor = Math.min(1.0, 1.0 - Math.exp(-dt / Math.max(1e-4, mouseDampening)));
          const cur = uniformsRef.current.iMouse.value;
          cur[0] += (mouseTargetRef.current[0] - cur[0]) * factor;
          cur[1] += (mouseTargetRef.current[1] - cur[1]) * factor;
        } else {
          uniformsRef.current.iMouse.value = [...mouseTargetRef.current];
          lastTimeRef.current = t;
        }
      }
      if (!paused) renderer.render({ scene: mesh });
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('pointermove', onPointerMove);
      ro.disconnect();
      if (canvas.parentElement === container) container.removeChild(canvas);
      // OGL cleanup: let GC handle the renderer, it has no .dispose()
    };
  }, [dpr]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    const { arr: colorArr, count: colorCount } = prepStops(gradientColors);
    u.uAngle.value = (angle * Math.PI) / 180;
    u.uNoise.value = noise;
    u.uBlindCount.value = Math.max(1, blindCount);
    u.uSpotlightRadius.value = spotlightRadius;
    u.uSpotlightOpacity.value = spotlightOpacity;
    u.uMirror.value = mirrorGradient ? 1 : 0;
    u.uDistort.value = distortAmount;
    u.uShineFlip.value = shineDirection === 'right' ? 1 : 0;
    u.uColor0.value = colorArr[0];
    u.uColor1.value = colorArr[1];
    u.uColor2.value = colorArr[2];
    u.uColor3.value = colorArr[3];
    u.uColor4.value = colorArr[4];
    u.uColor5.value = colorArr[5];
    u.uColor6.value = colorArr[6];
    u.uColor7.value = colorArr[7];
    u.uColorCount.value = colorCount;
  }, [gradientColors, angle, noise, blindCount, blindMinWidth, mirrorGradient, spotlightRadius, spotlightSoftness, spotlightOpacity, distortAmount, shineDirection]);

  return <div ref={containerRef} className={`gradient-blinds-container ${className}`} style={{ ...(mixBlendMode && { mixBlendMode }) }} />;
};

export default GradientBlinds;
