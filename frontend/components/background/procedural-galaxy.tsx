"use client";

import React, { useRef, useMemo, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  SHADER A — Living 8K Galaxy base (gentle depth + vortex)
// ─────────────────────────────────────────────────────────────

const galaxyVert = `
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uMouseX;
  uniform float uMouseY;
  void main() {
    vUv = uv;
    vec4 tex = texture2D(uTexture, uv);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    vec3 pos = position;
    pos.z += pow(lum, 3.0) * 1.5;
    float d = lum * 0.3;
    pos.x += uMouseX * d;
    pos.y += uMouseY * d;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const galaxyFrag = `
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uTime;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    float t = mod(uTime, 628.318);
    vec2 c = vec2(0.5);
    vec2 off = vUv - c;
    float dist = length(off);

    // Swirl logic with distance-based intensity
    float safeZone = smoothstep(0.04, 0.12, dist);
    float swirl = smoothstep(0.48, 0.0, dist) * safeZone;
    float a = t * 0.025 * swirl;
    float s = sin(a); float co = cos(a);
    vec2 uv = c + mat2(co,-s,s,co) * off;

    vec4 col = texture2D(uTexture, uv);
    
    // === 8K SIMULATION: High-frequency stardust grain ===
    float grain = hash(vUv * 1200.0 + t * 0.05);
    float grainMask = smoothstep(0.1, 0.9, col.r + col.g + col.b);
    col.rgb += grain * 0.04 * grainMask;

    float lum = dot(col.rgb, vec3(0.299,0.587,0.114));
    float twinkle = (lum > 0.65) ? sin(t*4.0 + dist*70.0)*0.3+0.75 : 1.0;
    float vig = smoothstep(0.98,0.42,dist);
    
    gl_FragColor = vec4(col.rgb * twinkle * vig, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────
//  SHADER B — Galactic Core Bloom
// ─────────────────────────────────────────────────────────────

const coreVert = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const coreFrag = `
  varying vec2 vUv;
  uniform float uTime;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main(){
    float t = mod(uTime, 62.83);
    vec2 uv = vUv - 0.5;
    float d = length(uv);
    
    // Gravitational swirl/distortion near core
    float angle = atan(uv.y, uv.x);
    float strength = smoothstep(0.25, 0.0, d);
    float distort = angle + t * 0.4 * strength;
    vec2 dUv = vec2(cos(distort), sin(distort)) * d;

    // Structured core — looks like a dense star cluster
    float core  = exp(-d * 22.0) * 1.5;
    float halo1 = exp(-d *  6.0) * 0.6;
    float halo2 = exp(-d *  2.2) * 0.25;
    
    // Accretion disk "noise"
    float diskNoise = hash(dUv * 85.0 + t*0.2) * smoothstep(0.18, 0.08, d) * 0.2;
    
    float pulse = sin(t * 1.2) * 0.05 + 0.95;
    float flare = pow(max(0.0, sin(angle*4.0 + t*0.5)), 12.0) * exp(-d*8.0) * 0.35;
    
    float hole = smoothstep(0.015, 0.16, d); // Wider hole for better text backdrop
    float total = (core * hole + halo1 + halo2 + diskNoise + flare) * pulse * 0.48; // Lower intensity
    
    vec3 cWhite = vec3(1.0, 0.99, 0.95);
    vec3 cGold  = vec3(1.0, 0.65, 0.25);
    vec3 cDeep  = vec3(0.45, 0.05, 0.35);
    
    float m1 = smoothstep(0.01, 0.2, d);
    float m2 = smoothstep(0.05, 0.6, d);
    vec3 col = mix(mix(cWhite, cGold, m1), cDeep, m2);
    
    // Tint flares
    col = mix(col, vec3(0.8, 0.9, 1.0), flare * 1.4);
    
    // === CLAMP AND TONE PREP ===
    // Prevents "breaking" edges by ensuring values stay within safe HDR range
    vec3 finalColor = clamp(col * total * 0.9, 0.0, 1.0);
    float finalAlpha = clamp(total * 0.75, 0.0, 1.0);
    
    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

// ─────────────────────────────────────────────────────────────
//  SHADER C — Diffraction Spikes (full-screen quad)
// ─────────────────────────────────────────────────────────────

const spikeVert = `varying vec2 vPos; void main(){vPos=position.xy;gl_Position=vec4(position.xy,0.0,1.0);}`;
const spikeFrag = `
  varying vec2 vPos;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uAspect;
  void main(){
    // Wrap time to prevent precision loss
    float t = mod(uTime, 62.83);
    vec2 uv = vPos * 0.5 + 0.5;
    vec4 base = texture2D(uTexture, uv);
    float lum = dot(base.rgb,vec3(0.299,0.587,0.114));
    float mask = smoothstep(0.62,0.96,lum);
    if(mask < 0.001) discard;
    vec2 p = vPos;
    p.x *= uAspect;
    float h = smoothstep(0.28,0.0,abs(p.x)) * smoothstep(0.0032,0.0,abs(p.y));
    float v = smoothstep(0.20,0.0,abs(p.y)) * smoothstep(0.0032,0.0,abs(p.x));
    float d1 = smoothstep(0.12,0.0,length(p)) * smoothstep(0.005,0.0,abs(p.x-p.y));
    float d2 = smoothstep(0.12,0.0,length(p)) * smoothstep(0.005,0.0,abs(p.x+p.y));
    float spike = max(max(h,v), max(d1,d2)*0.6);
    float fade = 1.0-smoothstep(0.0,0.22,length(p));
    vec3 sc = mix(vec3(0.45,0.55,1.0),vec3(1.0,0.96,0.8),fade);
    float pulse = sin(t*1.8)*0.12+0.88;
    gl_FragColor = vec4(sc, spike*mask*pulse*0.8);
  }
`;

// ─────────────────────────────────────────────────────────────
//  SHADER D — Flowing Nebula
// ─────────────────────────────────────────────────────────────

const nebulaFrag = `
  varying vec2 vUv;
  uniform float uTime;

  float hash(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}
  float n(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
  float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<7;i++){v+=a*n(p);p=p*2.1+vec2(1.7,9.2);a*=0.5;}return v;}

  void main(){
    float t = mod(uTime, 314.159);
    vec2 uv = vUv;
    vec2 c = vec2(0.5);
    float dist = length(uv - c);
    
    // Enhanced multi-speed flow
    vec2 flow1 = vec2(t * 0.012, t * 0.009);
    vec2 flow2 = vec2(-t * 0.008, t * 0.015);
    
    float n1 = fbm(uv * 2.5 + flow1);
    float n2 = fbm(uv * 1.8 - flow2 + vec2(4.1, 2.3));
    float n3 = fbm(uv * 4.0 + flow1 * 1.6 + vec2(9.8, 5.6));
    
    // More complex color interpolation
    vec3 col1 = vec3(0.40, 0.06, 0.85) * pow(n1, 1.8);  // Vibrant violet
    vec3 col2 = vec3(0.05, 0.15, 0.70) * pow(n2, 2.2);  // Rich ocean blue
    vec3 col3 = vec3(1.00, 0.35, 0.60) * pow(n3, 3.5) * 0.45; // Pink highlight
    vec3 col4 = vec3(0.15, 0.65, 0.90) * pow(n1 * n2, 2.8) * 0.3; // Cyan wisps
    
    vec3 nc = col1 + col2 + col3 + col4;
    
    // "Breathing" core mask
    float pulse = sin(t * 0.18) * 0.12 + 0.88;
    float mask = smoothstep(0.85, 0.05, dist) * 0.42;
    
    gl_FragColor = vec4(nc * pulse, mask);
  }
`;
const nebulaVert = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Living 8K Galaxy
// ─────────────────────────────────────────────────────────────

function LivingGalaxy() {
  const texture = useTexture("/landing-bg.png");
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  // Scale to fill even ultra-wide screens — multiply by 1.6 on width
  const w = Math.max(viewport.width, viewport.height * 1.78) * 1.5;
  const h = Math.max(viewport.height, viewport.width * 0.6) * 1.3;

  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uTime:    { value: 0 },
    uMouseX:  { value: 0 },
    uMouseY:  { value: 0 },
  }), [texture]);

  useFrame((state, delta) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value += delta;
    const { x, y } = state.pointer;
    matRef.current.uniforms.uMouseX.value = THREE.MathUtils.lerp(matRef.current.uniforms.uMouseX.value, x, 0.04);
    matRef.current.uniforms.uMouseY.value = THREE.MathUtils.lerp(matRef.current.uniforms.uMouseY.value, y, 0.04);
  });

  return (
    <mesh position={[0, 0, -6]}>
      <planeGeometry args={[w, h, 128, 128]} />
      <shaderMaterial ref={matRef} vertexShader={galaxyVert} fragmentShader={galaxyFrag} uniforms={uniforms} depthWrite={false} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Galactic Core Bloom
// ─────────────────────────────────────────────────────────────

function GalacticCore() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((_s, delta) => { if (matRef.current) matRef.current.uniforms.uTime.value += delta; });
  /* Make the core plane bigger so the wide halo always covers the centre */
  return (
    <mesh position={[0, 0, -1.5]}>
      <planeGeometry args={[18, 18]} />
      <shaderMaterial ref={matRef} vertexShader={coreVert} fragmentShader={coreFrag} uniforms={uniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Nebula Cloud Overlay
// ─────────────────────────────────────────────────────────────

function NebulaOverlay() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();
  // Scale nebula to fill corners too
  const nW = viewport.width * 2.2;
  const nH = viewport.height * 2.2;
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((_s, delta) => { if (matRef.current) matRef.current.uniforms.uTime.value += delta; });
  return (
    <mesh position={[0, 0, -2.5]}>
      <planeGeometry args={[nW, nH]} />
      <shaderMaterial ref={matRef} vertexShader={nebulaVert} fragmentShader={nebulaFrag} uniforms={uniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Star Diffraction Spikes
// ─────────────────────────────────────────────────────────────

function StarSpikes({ texture }: { texture: THREE.Texture }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();
  const uniforms = useMemo(() => ({ uTexture: { value: texture }, uTime: { value: 0 }, uAspect: { value: size.width / size.height } }), [texture, size]);
  useFrame((_s, delta) => { if (matRef.current) matRef.current.uniforms.uTime.value += delta; });
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,-1,0,1,1,0,-1,1,0]), 3));
    return g;
  }, []);
  return (
    <mesh geometry={geom}>
      <shaderMaterial ref={matRef} vertexShader={spikeVert} fragmentShader={spikeFrag} uniforms={uniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Shooting Comets / Meteor Streaks
// ─────────────────────────────────────────────────────────────

function ShootingComets() {
  const count = 8;
  const matsRef = useRef<(THREE.ShaderMaterial | null)[]>([]);
  const timersRef = useRef<number[]>(Array.from({ length: count }, () => Math.random() * 12));

  const cometVert = `
    varying vec2 vUv;
    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `;
  const cometFrag = `
    varying vec2 vUv;
    uniform float uProgress;
    uniform vec3 uColor;
    void main(){
      float head = smoothstep(1.0,0.95,vUv.x) * smoothstep(0.0,0.4,vUv.x);
      float trail = smoothstep(0.0, uProgress, vUv.x) * pow(1.0-vUv.x, 2.0);
      float width = smoothstep(0.5,0.0,abs(vUv.y-0.5));
      float glow = (head * 0.8 + trail * 0.3) * width;
      gl_FragColor = vec4(uColor * glow, glow);
    }
  `;

  const comets = useMemo(() => Array.from({ length: count }, (_, i) => ({
    startX: (Math.random() - 0.5) * 38,
    startY: (Math.random() - 0.5) * 22,
    angle: (Math.random() * 0.4 - 0.6) * Math.PI,
    length: 4 + Math.random() * 5,
    speed: 0.8 + Math.random() * 0.6,
    interval: 6 + Math.random() * 10,
    color: new THREE.Color().setHSL(0.55 + Math.random() * 0.15, 1, 0.9),
  })), []);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const uniformsArr = useMemo(() => comets.map(c => ({
    uProgress: { value: 0 },
    uColor: { value: c.color },
  })), [comets]);

  useFrame((_s, delta) => {
    timersRef.current = timersRef.current.map((t, i) => {
      const interval = comets[i].interval;
      const newT = t + delta;
      if (newT > interval) { return 0; }
      const progress = newT / (interval * 0.15);
      if (uniformsArr[i]) uniformsArr[i].uProgress.value = Math.min(progress, 1.0);
      const mesh = meshRefs.current[i];
      if (mesh) {
        const p = Math.min(newT / (interval * 0.12), 1.0);
        const comet = comets[i];
        mesh.position.x = comet.startX + Math.cos(comet.angle) * p * 25;
        mesh.position.y = comet.startY + Math.sin(comet.angle) * p * 25;
        mesh.visible = newT < interval * 0.16;
      }
      return newT;
    });
  });

  return (
    <>
      {comets.map((c, i) => (
        <mesh
          key={i}
          ref={el => { meshRefs.current[i] = el; }}
          position={[c.startX, c.startY, -1]}
          rotation={[0, 0, c.angle]}
        >
          <planeGeometry args={[c.length, 0.06, 1, 1]} />
          <shaderMaterial
            ref={(el: THREE.ShaderMaterial | null) => { matsRef.current[i] = el; if (el) el.uniforms = uniformsArr[i]; }}
            vertexShader={cometVert}
            fragmentShader={cometFrag}
            uniforms={uniformsArr[i]}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Asteroid Belt (orbiting rocky debris)
// ─────────────────────────────────────────────────────────────

function AsteroidBelt() {
  const groupRef = useRef<THREE.Group>(null);
  const count = 1800;

  const { positions, scales, colors, speeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const scl = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const spd = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Orbital ring: radius 11-17, slight inclination
      const r = 11 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const inclination = (Math.random() - 0.5) * 1.5;
      pos[i * 3]     = Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.sin(theta) * r * 0.25 + inclination; // flattened orbit
      pos[i * 3 + 2] = Math.sin(theta) * r * 0.15 + (Math.random() - 0.5) * 2;

      scl[i] = Math.random() * 1.6 + 0.3;
      spd[i] = (0.005 + Math.random() * 0.012) * (Math.random() > 0.5 ? 1 : -1);

      // Rocky grey-brown colors with occasional orange/blue specks
      const t = Math.random();
      if (t < 0.1) { col[i*3]=0.9; col[i*3+1]=0.5; col[i*3+2]=0.2; }        // orange mineral
      else if (t < 0.18) { col[i*3]=0.3; col[i*3+1]=0.4; col[i*3+2]=0.8; }  // blue ice
      else {
        const g = Math.random() * 0.3 + 0.3;
        col[i*3] = g + 0.05; col[i*3+1] = g; col[i*3+2] = g - 0.05;          // grey rock
      }
    }
    return { positions: pos, scales: scl, colors: col, speeds: spd };
  }, []);

  const beltVert = `
    attribute float aScale;
    varying vec3 vColor;
    void main(){
      vColor = color;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aScale * (18.0 / -mv.z);
    }
  `;
  const beltFrag = `
    varying vec3 vColor;
    void main(){
      float d = distance(gl_PointCoord, vec2(0.5));
      if(d > 0.5) discard;
      // Rocky look: not perfectly round, darken center slightly
      float edge = smoothstep(0.5,0.35,d);
      float inner = smoothstep(0.15,0.0,d)*0.25;
      float shape = edge - inner;
      gl_FragColor = vec4(vColor * shape, shape * 0.9);
    }
  `;

  const anglesRef = useRef(Array.from({ length: count }, (_, i) => Math.atan2(positions[i * 3 + 1], positions[i * 3])));
  const posRef = useRef<THREE.BufferAttribute | null>(null);

  useFrame((state, delta) => {
    if (!groupRef.current || !posRef.current) return;
    groupRef.current.rotation.y += delta * 0.003; // very slow belt rotation
    const { x, y } = state.pointer;
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, y * -0.15, 0.03);
    groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, x * 0.1, 0.03);

    // Individual asteroid orbital motion
    for (let i = 0; i < count; i++) {
      anglesRef.current[i] += speeds[i] * delta * 0.3;  // individual asteroid orbits much slower
      const a = anglesRef.current[i];
      const r = Math.sqrt(positions[i*3]**2 + positions[i*3+2]**2);
      posRef.current.array[i*3]     = Math.cos(a) * r;
      posRef.current.array[i*3 + 2] = Math.sin(a) * r;
    }
    posRef.current.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute ref={posRef} attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color"  args={[colors, 3]} />
          <bufferAttribute attach="attributes-aScale" args={[scales, 1]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={beltVert}
          fragmentShader={beltFrag}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </points>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Volumetric Dust (deep parallax)
// ─────────────────────────────────────────────────────────────

function VolumetricDust() {
  const ref = useRef<THREE.Points>(null);
  const count = 6000;

  const { positions, scales, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const scl = new Float32Array(count);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (Math.random()-0.5)*100;  // very wide to fill all sides and bottom
      pos[i*3+1] = (Math.random()-0.5)*90;
      pos[i*3+2] = (Math.random()-0.5)*35;
      scl[i] = Math.random() * 2.0 + 0.3;
      const t = Math.random();
      if (t < 0.35) { col[i*3]=1.0; col[i*3+1]=0.96; col[i*3+2]=0.85; }     // warm white
      else if (t < 0.65) { col[i*3]=0.35; col[i*3+1]=0.45; col[i*3+2]=1.0; } // blue
      else { col[i*3]=0.65; col[i*3+1]=0.18; col[i*3+2]=0.95; }               // purple
    }
    return { positions: pos, scales: scl, colors: col };
  }, []);

  const dVert = `
    attribute float aScale;
    varying vec3 vColor;
    void main(){
      vColor = color;
      vec4 mv = modelViewMatrix*vec4(position,1.0);
      gl_Position = projectionMatrix*mv;
      gl_PointSize = aScale*(28.0/-mv.z);
    }
  `;
  const dFrag = `
    varying vec3 vColor;
    void main(){
      float d = distance(gl_PointCoord,vec2(0.5));
      if(d>0.5) discard;
      float s = pow(1.0-d*2.0,3.0);
      gl_FragColor = vec4(vColor, s*0.45);
    }
  `;

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.008;   // much slower dust rotation
    ref.current.rotation.z -= delta * 0.003;
    const {x,y} = state.pointer;
    ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, x*-2.5, 0.02);
    ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, y*-2.5, 0.02);
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color"    args={[colors,    3]} />
        <bufferAttribute attach="attributes-aScale"   args={[scales,    1]} />
      </bufferGeometry>
      <shaderMaterial vertexShader={dVert} fragmentShader={dFrag} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Realistic Planet (cratered, banded, atmospheric)
// ─────────────────────────────────────────────────────────────

const planetVS = `
  varying vec3 vNorm;
  varying vec3 vViewPos;
  varying vec2 vUv2;
  void main(){
    vNorm = normalize(normalMatrix * normal);
    vViewPos = (modelViewMatrix * vec4(position,1.0)).xyz;
    vUv2 = uv;
    gl_Position = projectionMatrix * vec4(vViewPos, 1.0);
  }
`;

function makePlanetMat(baseColor: string, rimColor: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(baseColor) },
      uRim:  { value: new THREE.Color(rimColor)  },
      uTime: { value: 0 },
    },
    vertexShader: planetVS,
    fragmentShader: `
      uniform vec3 uBase;
      uniform vec3 uRim;
      uniform float uTime;
      varying vec3 vNorm;
      varying vec3 vViewPos;
      varying vec2 vUv2;

      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.545);}
      float n(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
      float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.07+vec2(1.7,9.2);a*=0.5;}return v;}

      float crater(vec2 uv, vec2 c, float r){float d=length(uv-c);return smoothstep(r,r*0.3,d)*smoothstep(r*1.1,r,d)*(1.0-smoothstep(r*0.3,0.0,d)*0.5);}

      void main(){
        vec3 viewDir = normalize(-vViewPos);
        vec3 lightDir = normalize(vec3(0.55, 0.3, 1.0));
        float diff = max(dot(vNorm, lightDir), 0.04);
        float rim  = pow(1.0 - max(dot(viewDir,vNorm),0.0), 3.2);

        // Surface FBM bands (gas giant style)
        float bands  = fbm(vec2(vUv2.x*6.0+uTime*0.015, vUv2.y*3.5))*0.18;
        float clouds = fbm(vec2(vUv2.x*9.0-uTime*0.02,  vUv2.y*5.0+uTime*0.008))*0.12;

        // Craters (static fake craters using fixed UVs)
        float c1 = crater(vUv2, vec2(0.25,0.45), 0.07)*0.5;
        float c2 = crater(vUv2, vec2(0.65,0.35), 0.04)*0.4;
        float c3 = crater(vUv2, vec2(0.55,0.70), 0.05)*0.45;
        float totalCrater = c1+c2+c3;

        // Day/night terminator
        float term = smoothstep(-0.08, 0.28, dot(vNorm, lightDir));

        vec3 lit   = uBase * (diff + bands + clouds - totalCrater*0.2);
        vec3 dark  = uBase * 0.03;
        vec3 surf  = mix(dark, lit, term);
        vec3 col   = surf + uRim * rim * 2.2;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function makeAtmMat(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      varying vec3 vNorm; varying vec3 vViewPos;
      void main(){ vNorm=normalize(normalMatrix*normal); vViewPos=(modelViewMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*vec4(vViewPos,1.0); }
    `,
    fragmentShader: `
      uniform vec3 uColor; varying vec3 vNorm; varying vec3 vViewPos;
      void main(){
        vec3 vd=normalize(-vViewPos);
        float rim=pow(1.0-max(dot(vd,vNorm),0.0),2.8);
        gl_FragColor=vec4(uColor,rim*0.75);
      }
    `,
    transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

function Planet({
  position, size, baseColor, rimColor, atmosphereColor, hasRing
}: {
  position: [number, number, number];
  size: number;
  baseColor: string;
  rimColor: string;
  atmosphereColor: string;
  hasRing?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const planetMat = useMemo(() => makePlanetMat(baseColor, rimColor), [baseColor, rimColor]);
  const atmMat = useMemo(() => makeAtmMat(atmosphereColor), [atmosphereColor]);

  useFrame((_s, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.035;
    if (planetMat.uniforms.uTime) planetMat.uniforms.uTime.value += delta;
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh material={planetMat}><sphereGeometry args={[size, 96, 96]} /></mesh>
      <mesh material={atmMat}><sphereGeometry args={[size * 1.07, 64, 64]} /></mesh>
      {/* Wide outer glow */}
      <mesh>
        <sphereGeometry args={[size * 1.22, 40, 40]} />
        <meshBasicMaterial color={atmosphereColor} transparent opacity={0.04} side={THREE.BackSide} />
      </mesh>
      {hasRing && (
        <>
          <mesh rotation={[Math.PI / 2.8, 0.15, 0.1]}>
            <ringGeometry args={[size * 1.38, size * 2.5, 128]} />
            <meshBasicMaterial color={rimColor} transparent opacity={0.28} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[Math.PI / 2.8, 0.15, 0.1]}>
            <ringGeometry args={[size * 1.65, size * 1.98, 128]} />
            <meshBasicMaterial color="#000320" transparent opacity={0.40} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[Math.PI / 2.8, 0.15, 0.1]}>
            <ringGeometry args={[size * 1.3, size * 1.42, 128]} />
            <meshBasicMaterial color={rimColor} transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Deep Space Background (fullscreen — fills every pixel)
// ─────────────────────────────────────────────────────────────

function DeepSpaceBackground() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_s, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta;
  });

  const vert = `varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = vec4(position.xy, 0.999, 1.0); }`;
  const frag = `
    varying vec2 vPos;
    uniform float uTime;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

    float noise(vec2 p){
      vec2 i = floor(p); vec2 f = fract(p);
      vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
    }
    float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.1+vec2(1.7,9.2);a*=0.5;} return v; }

    void main(){
      vec2 uv = vPos * 0.5 + 0.5;
      // Wrap time to prevent ALL precision issues over long sessions
      float t = mod(uTime, 628.318);

      // === BASE: very dark deep navy ===
      vec3 bg = mix(
        vec3(0.006, 0.001, 0.022),
        vec3(0.010, 0.003, 0.032),
        uv.y
      );

      // === SUBTLE MILKY WAY DUST BAND ===
      float band = fbm(vec2(uv.x*1.6, uv.y*0.8 + t*0.002));
      float diagDist = abs((uv.x - 0.5) - (uv.y - 0.5)*0.75);
      float mwMask = smoothstep(0.45, 0.0, diagDist) * 0.3;
      bg += vec3(0.04, 0.01, 0.12) * band * mwMask;

      // === CORNER FILLS — match the subtle blue-purple of the galaxy photo edges ===
      // These should blend seamlessly, not pop as bright blobs
      float tl = length(uv - vec2(0.0, 1.0));
      bg += vec3(0.025, 0.005, 0.065) * exp(-tl*1.8) * (fbm(uv*2.5)*0.4+0.3);

      float tr = length(uv - vec2(1.0, 1.0));
      bg += vec3(0.010, 0.008, 0.055) * exp(-tr*2.0) * (fbm(uv*2.2+vec2(3.0))*0.3+0.2);

      float bl = length(uv - vec2(0.0, 0.0));
      bg += vec3(0.015, 0.005, 0.045) * exp(-bl*1.6) * (fbm(uv*2.8+vec2(6.0))*0.4+0.3);

      float br = length(uv - vec2(1.0, 0.0));
      bg += vec3(0.018, 0.010, 0.060) * exp(-br*1.8) * (fbm(uv*3.0+vec2(5.0))*0.3+0.3);

      // === REALISTIC STAR FIELD — natural density and brightness ===
      // Tiny background stars (very dim) — use wrapped time
      for(int i = 0; i < 5; i++){
        float fi = float(i) * 1.618;
        vec2 cell = floor(uv * (90.0 + fi*25.0));
        vec2 h2 = vec2(hash(cell+fi), hash(cell+fi+vec2(33.0)));
        float brightness = pow(hash(cell+fi+vec2(77.0)), 6.5);
        float twinkle = sin(t*(0.5+h2.x*1.2) + h2.y*6.28) * 0.2 + 0.8;  // bounded t
        float d = length(fract(uv*(90.0+fi*25.0)) - vec2(0.5));
        float glow = exp(-d*25.0) * brightness * twinkle * 1.8;
        vec3 sc = mix(vec3(0.95,0.95,1.0), vec3(0.75,0.85,1.0), h2.x*0.4);
        bg += sc * glow;
      }

      // Sparse bright stars with diffraction spikes — use bounded t
      vec2 bigCell = floor(uv * 15.0);
      float bigH = hash(bigCell + 99.0);
      if(bigH > 0.82){
        vec2 bPos = vec2(hash(bigCell+11.0), hash(bigCell+22.0));
        float bd = length(fract(uv*15.0) - bPos);
        float bTwink = sin(t*0.9 + bigH*6.28)*0.2+0.8;  // bounded
        float bs = exp(-bd*40.0)*pow(bigH,2.0)*bTwink * 3.0;
        bg += vec3(1.0,0.97,0.92) * bs;
        float hSpike = exp(-abs(fract(uv.x*15.0)-bPos.x)*80.0)*exp(-abs(fract(uv.y*15.0)-bPos.y)*600.0);
        float vSpike = exp(-abs(fract(uv.y*15.0)-bPos.y)*80.0)*exp(-abs(fract(uv.x*15.0)-bPos.x)*600.0);
        bg += vec3(0.6,0.7,1.0)*(hSpike+vSpike)*bigH*bTwink*0.3;
      }

      // Clamp so we don't clip but can accumulate naturally
      bg = min(bg, vec3(0.4));
      gl_FragColor = vec4(bg, 1.0);
    }
  `;

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      -1,-1,0, 1,-1,0, 1,1,0,  -1,-1,0, 1,1,0, -1,1,0
    ]), 3));
    return g;
  }, []);

  return (
    <mesh geometry={geom} renderOrder={-100}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Scene (orchestrates everything)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  COMPONENT — Ambient Space Sound
// ─────────────────────────────────────────────────────────────

function AmbientSpaceSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isStartedRef = useRef(false);

  const sources = useMemo(() => [
    "/space-ambient.mp3", 
    "https://images-assets.nasa.gov/audio/Space_Sounds/Space_Sounds~orig.mp3",
    "https://archive.org/download/DeepSpaceAmbientDrone/DeepSpaceAmbientDrone.mp3"
  ], []);

  // Web Audio Fallback: Low-frequency "Interstellar Drone"
  const startSynthFallback = (ctx: AudioContext) => {
    console.log("🌌 [GalaxySound] Initializing Web Audio synth fallback...");
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const lpf = ctx.createBiquadFilter();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(45, ctx.currentTime);
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(45.5, ctx.currentTime);

    lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(400, ctx.currentTime);
    lpf.Q.setValueAtTime(8, ctx.currentTime);

    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.08, ctx.currentTime);
    lfoGain.gain.setValueAtTime(150, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(lpf.frequency);
    
    osc1.connect(lpf);
    osc2.connect(lpf);
    lpf.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 3);

    osc1.start();
    osc2.start();
    lfo.start();

    // Store nodes for cleanup
    (ctx as any)._nodes = [osc1, osc2, lfo, gain, lpf, lfoGain];
    
    console.log("🌌 [GalaxySound] Synth fallback active.");
  };

  const tryPlaySource = async (index: number, ctx: AudioContext): Promise<boolean> => {
    if (index >= sources.length) return false;

    return new Promise((resolve) => {
      console.log(`🌌 [GalaxySound] Attempting Source ${index + 1}: ${sources[index]}`);
      const audio = new Audio(sources[index]);
      audio.loop = true;
      audio.volume = 0.5;
      if (sources[index].startsWith("http")) audio.crossOrigin = "anonymous";

      const cleanup = () => {
        audio.oncanplaythrough = null;
        audio.onerror = null;
      };

      audio.oncanplaythrough = () => {
        audio.play()
          .then(() => {
            console.log(`🌌 [GalaxySound] SUCCESS! Source ${index + 1} playing.`);
            audioRef.current = audio;
            cleanup();
            resolve(true);
          })
          .catch((err) => {
            console.warn(`🌌 [GalaxySound] Playback failed for Source ${index + 1}:`, err);
            cleanup();
            resolve(false);
          });
      };

      audio.onerror = () => {
        console.warn(`🌌 [GalaxySound] Source ${index + 1} failed to load.`);
        cleanup();
        resolve(false);
      };

      // Firefox/Chrome might need a timeout or explicit load if they are aggressive with blocking
      audio.load();
    });
  };

  const handleInteraction = async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    
    console.log("🌌 [GalaxySound] User interaction detected. Initializing audio chain...");
    
    // 1. Create AudioContext (standard for all modern audio tasks)
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // 2. Try sources sequentially
    let success = false;
    for (let i = 0; i < sources.length; i++) {
      success = await tryPlaySource(i, ctx);
      if (success) break;
    }

    // 3. Final Fallback: Web Audio Synth
    if (!success) {
      startSynthFallback(ctx);
    }

    // Cleanup listeners
    window.removeEventListener("click", handleInteraction);
    window.removeEventListener("keydown", handleInteraction);
    window.removeEventListener("touchstart", handleInteraction);
  };

  useEffect(() => {
    window.addEventListener("click", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
      
      console.log("🌌 [GalaxySound] Unmounting: Cleaning up audio...");

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
        audioRef.current = null;
      }
      
      if (audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        
        // Stop any oscillators attached to fallback
        if ((ctx as any)._nodes) {
          (ctx as any)._nodes.forEach((node: any) => {
            try {
              if (node.stop) node.stop();
              node.disconnect();
            } catch (e) {}
          });
        }

        ctx.close().then(() => {
          console.log("🌌 [GalaxySound] AudioContext closed.");
        }).catch(err => {
          console.warn("🌌 [GalaxySound] Error closing AudioContext:", err);
        });
        audioCtxRef.current = null;
      }
    };
  }, [sources]);

  return null;
}

function Scene() {
  const texture = useTexture("/landing-bg.png");
  return (
    <>
      {/* 0. Fullscreen procedural deep space — fills EVERY pixel including corners */}
      <DeepSpaceBackground />

      {/* 8K base */}
      <LivingGalaxy />

      {/* Bright pulsing galactic center */}
      <GalacticCore />

      {/* Procedural nebula wisps */}
      <NebulaOverlay />

      {/* Diffraction star spikes */}
      <StarSpikes texture={texture} />

      {/* Volumetric dust parallax */}
      <VolumetricDust />

      {/* Shooting comets / meteors */}
      <ShootingComets />

      {/* Orbiting asteroid belt */}
      <AsteroidBelt />

      {/* Purple crescent planet — top left */}
      <Planet
        position={[-8.5, 6.0, 0.5]}
        size={1.25}
        baseColor="#1a0038"
        rimColor="#dd77ff"
        atmosphereColor="#aa33ee"
      />

      {/* Large blue gas giant with rings — bottom right */}
      <Planet
        position={[9.2, -5.8, 1.5]}
        size={2.5}
        baseColor="#000d40"
        rimColor="#55aaff"
        atmosphereColor="#1133cc"
        hasRing
      />

      {/* Lights: subtler core + purple & blue accent */}
      <pointLight position={[0, 0, 4]}   intensity={45}  color="#ffddaa" distance={50} decay={2.2} />
      <pointLight position={[-6, 4, -2]} intensity={35}  color="#cc33ff" distance={28} decay={2} />
      <pointLight position={[6, -4, -2]} intensity={35}  color="#3377ff" distance={28} decay={2} />
      <ambientLight intensity={0.12} color="#220044" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────

export default function ProceduralGalaxy() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 0, overflow: "hidden",
      /* Transparent — the rich space background comes from html in globals.css */
    }}>
      <AmbientSpaceSound />
      <Canvas
        camera={{ position: [0, 0, 10], fov: 48, near: 0.01, far: 250 }}
        gl={{ 
          antialias: true, 
          alpha: true, 
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.85
        }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>

      {/* Soft edge darkening — corners only, sides stay purple-blue */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 90% 75% at 50% 50%, transparent 50%, rgba(0,0,10,0.60) 100%)",
        zIndex: 5,
      }} />
    </div>
  );
}
