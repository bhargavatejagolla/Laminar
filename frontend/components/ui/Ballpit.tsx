import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* ══════════════════════════════════════════════════════════
   THREE.JS ENGINE HELPER (ROBUST EDITION)
══════════════════════════════════════════════════════════ */
class ThreeEngine {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  size = { width: 0, height: 0, wWidth: 0, wHeight: 0, ratio: 0, pixelRatio: 0 };
  clock = new THREE.Clock();
  time = { elapsed: 0, delta: 0 };
  isDisposed = false;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private isIntersecting = false;
  private isAnimating = false;

  onBeforeRender = (time: { elapsed: number; delta: number }) => {};
  onAfterResize = (size: any) => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.scene = new THREE.Scene();
    
    // Most compatible initialization
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      powerPreference: 'high-performance',
      antialias: true,
      alpha: true
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    
    this.initObservers();
    this.resize();
  }

  private initObservers() {
    window.addEventListener('resize', () => this.resize());
    if (this.canvas.parentNode) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas.parentNode as Element);
    }
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.isIntersecting = entries[0].isIntersecting;
      this.isIntersecting ? this.start() : this.stop();
    });
    this.intersectionObserver.observe(this.canvas);
    document.addEventListener('visibilitychange', () => {
      if (this.isIntersecting) document.hidden ? this.stop() : this.start();
    });
  }

  resize() {
    const parent = this.canvas.parentNode as HTMLElement;
    if (!parent) return;
    this.size.width = parent.offsetWidth;
    this.size.height = parent.offsetHeight;
    if (this.size.height === 0) return;
    this.size.ratio = this.size.width / this.size.height;
    this.camera.aspect = this.size.ratio;
    this.camera.updateProjectionMatrix();
    const fovRad = (this.camera.fov * Math.PI) / 180;
    this.size.wHeight = 2 * Math.tan(fovRad / 2) * this.camera.position.length();
    this.size.wWidth = this.size.wHeight * this.camera.aspect;
    this.renderer.setSize(this.size.width, this.size.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.onAfterResize(this.size);
  }

  start() {
    if (this.isAnimating) return;
    this.isAnimating = true;
    const animate = () => {
      if (this.isDisposed) return;
      this.rafId = requestAnimationFrame(animate);
      this.time.delta = this.clock.getDelta();
      this.time.elapsed += this.time.delta;
      this.onBeforeRender(this.time);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.isAnimating = false;
  }

  dispose() {
    this.isDisposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.scene.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
          else obj.material.dispose();
        }
      }
    });
    this.renderer.dispose();
  }
}

class BallPhysics {
  config: any;
  positionData: Float32Array;
  velocityData: Float32Array;
  sizeData: Float32Array;
  center = new THREE.Vector3();
  initialPositionData: Float32Array;

  constructor(config: any) {
    this.config = config;
    this.positionData = new Float32Array(3 * config.count);
    this.initialPositionData = new Float32Array(3 * config.count);
    this.velocityData = new Float32Array(3 * config.count);
    this.sizeData = new Float32Array(config.count);
    this.init();
  }

  init() {
    for (let i = 0; i < this.config.count; i++) {
      const b = i * 3;
      // Start them scattered on the floor
      this.positionData[b] = (Math.random() - 0.5) * 2 * this.config.maxX;
      // Spread them vertically a bit but mostly on the floor
      this.positionData[b + 1] = -this.config.maxY + this.sizeData[i] + Math.random() * 2.0; 
      this.positionData[b + 2] = (Math.random() - 0.5) * 2 * this.config.maxZ;

      this.sizeData[i] = THREE.MathUtils.randFloat(this.config.minSize, this.config.maxSize);
      // Give them some initial variety in velocity
      this.velocityData[b] = (Math.random() - 0.5) * 0.1;
      this.velocityData[b + 1] = (Math.random() - 0.5) * 0.1;
      this.velocityData[b + 2] = (Math.random() - 0.5) * 0.1;
    }
  }

  update(time: { delta: number }) {
    const { config, positionData: pos, velocityData: vel, sizeData: size } = this;
    const mousePos = this.center;
    const attractionRadius = 6.0; // Reduced for more localized interaction
    const attractionStrength = 0.05; // Lowered to prevent "magnetic sticking"
    const repulsionRadius = 1.0; // Pushes away if too close to mouse
    const repulsionStrength = 0.1;

    const dt = Math.min(time.delta, 0.032); // Cap delta to avoid physics explosions

    for (let i = 0; i < config.count; i++) {
      const b = i * 3;
      const v = new THREE.Vector3().fromArray(vel, b);
      const p = new THREE.Vector3().fromArray(pos, b);

      // 1. Mouse Interaction
      if (config.controlSphere0) {
        const distToMouse = p.distanceTo(mousePos);
        if (distToMouse < attractionRadius && distToMouse > repulsionRadius) {
          const force = (1.0 - distToMouse / attractionRadius) * attractionStrength;
          const dir = new THREE.Vector3().subVectors(mousePos, p).normalize();
          v.add(dir.multiplyScalar(force));
        } else if (distToMouse <= repulsionRadius) {
          // Repel if too close to avoid sticking
          const force = (1.0 - distToMouse / repulsionRadius) * repulsionStrength;
          const dir = new THREE.Vector3().subVectors(p, mousePos).normalize();
          v.add(dir.multiplyScalar(force));
        }
      }

      // 2. Inter-ball collisions (Elastic)
      for (let j = i + 1; j < config.count; j++) {
        const b2 = j * 3;
        const p2 = new THREE.Vector3().fromArray(pos, b2);
        const dist = p.distanceTo(p2);
        const minDist = size[i] + size[j];

        if (dist < minDist) {
          // Collision detected
          const normal = new THREE.Vector3().subVectors(p, p2).normalize();
          const overlap = minDist - dist;
          
          // Resolve overlap (separate balls)
          const move = normal.clone().multiplyScalar(overlap * 0.5);
          p.add(move);
          p2.sub(move);
          
          // Resolve velocity (simple elastic collision)
          const v2 = new THREE.Vector3().fromArray(vel, b2);
          const relativeVelocity = new THREE.Vector3().subVectors(v, v2);
          const velocityAlongNormal = relativeVelocity.dot(normal);

          if (velocityAlongNormal < 0) {
            const restitution = 0.75;
            const impulseStrength = -(1 + restitution) * velocityAlongNormal;
            const impulse = normal.clone().multiplyScalar(impulseStrength * 0.5);
            v.add(impulse);
            v2.sub(impulse);
            v2.toArray(vel, b2);
          }
          p2.toArray(pos, b2);
        }
      }

      // 3. Environment Physics
      v.y -= dt * config.gravity; 
      v.multiplyScalar(config.friction);
      
      p.add(v);

      // Boundaries (Floor and Walls)
      const bounce = config.wallBounce;
      if (p.x + size[i] > config.maxX) { p.x = config.maxX - size[i]; v.x = -Math.abs(v.x) * bounce; }
      if (p.x - size[i] < -config.maxX) { p.x = -config.maxX + size[i]; v.x = Math.abs(v.x) * bounce; }
      
      if (p.y - size[i] < -config.maxY) { 
        p.y = -config.maxY + size[i]; 
        v.y = Math.abs(v.y) * bounce; 
        v.x *= 0.9; // Extra friction on floor
        v.z *= 0.9;
      }
      if (p.y + size[i] > config.maxY) { p.y = config.maxY - size[i]; v.y = -Math.abs(v.y) * bounce; }
      
      if (p.z + size[i] > config.maxZ) { p.z = config.maxZ - size[i]; v.z = -Math.abs(v.z) * bounce; }
      if (p.z - size[i] < -config.maxZ) { p.z = -config.maxZ + size[i]; v.z = Math.abs(v.z) * bounce; }
      
      p.toArray(pos, b);
      v.toArray(vel, b);
    }
  }
}

const DEFAULT_CONFIG = {
  count: 120, // Slightly fewer for better performance with collisions
  colors: ['#22d3ee', '#818cf8', '#2dd4bf'],
  ambientColor: '#ffffff',
  ambientIntensity: 0.5,
  lightIntensity: 250,
  minSize: 0.2, // Slightly larger for better visibility of collisions
  maxSize: 0.5,
  size0: 0.5,
  gravity: 1.2, // Stronger gravity for more "weight"
  friction: 0.97, // Slightly more friction
  wallBounce: 0.5, // Less bouncy for realism
  maxX: 12,
  maxY: 12,
  maxZ: 5,
  followCursor: true
};

const Ballpit: React.FC<any> = ({ className = '', ...props }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ThreeEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const config = { ...DEFAULT_CONFIG, ...props };
    let engine: ThreeEngine;
    try {
      engine = new ThreeEngine(canvas);
      engineRef.current = engine;
    } catch (e) {
      console.error("Ballpit: ThreeEngine init failed", e);
      return;
    }

    engine.camera.position.set(0, 0, 20);
    engine.camera.lookAt(0, 0, 0);

    const pmrem = new THREE.PMREMGenerator(engine.renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment()).texture;
    
    const physics = new BallPhysics(config);
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    
    // NATIVE PHYSICS MATERIAL - ZERO CUSTOM SHADERS = ZERO SHADER ERRORS
    const material = new THREE.MeshPhysicalMaterial({
      envMap: envTexture,
      metalness: 0.05,
      roughness: 0.05,
      transmission: 0.95,
      thickness: 1.5,
      ior: 1.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      attenuationDistance: 0.5,
      attenuationColor: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 1.0,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, config.count);
    engine.scene.add(mesh);
    engine.scene.add(new THREE.AmbientLight(config.ambientColor, config.ambientIntensity));
    
    const pointLight = new THREE.PointLight(config.colors[0], config.lightIntensity, 60);
    engine.scene.add(pointLight);

    const instancer = new THREE.Object3D();
    const colors = config.colors.map((c: string) => new THREE.Color(c));
    for (let i = 0; i < config.count; i++) mesh.setColorAt(i, colors[i % colors.length]);
    mesh.instanceColor!.needsUpdate = true;

    engine.onBeforeRender = (time) => {
      physics.update(time);
      for (let i = 0; i < config.count; i++) {
        instancer.position.fromArray(physics.positionData, i * 3);
        instancer.scale.setScalar(i === 0 && !config.followCursor ? 0.001 : physics.sizeData[i]);
        instancer.updateMatrix();
        mesh.setMatrixAt(i, instancer.matrix);
        if (i === 0) pointLight.position.copy(instancer.position);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectPoint = new THREE.Vector3();

    const handleMouseMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nPos = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(nPos, engine.camera);
      raycaster.ray.intersectPlane(plane, intersectPoint);
      physics.center.copy(intersectPoint);
      physics.config.controlSphere0 = true;
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerleave', () => physics.config.controlSphere0 = false);
    
    engine.start();
    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      engine.dispose();
    };
  }, [props]);

  return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: '100%' }} />;
};

export default Ballpit;
