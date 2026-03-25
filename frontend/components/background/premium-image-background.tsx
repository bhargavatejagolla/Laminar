"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

type Variant = 'landing' | 'login' | 'register';

export default function PremiumImageBackground({ imageUrl, variant }: { imageUrl: string, variant: Variant }) {
  const [mounted, setMounted] = useState(false);
  const mouseX = useMotionValue(1000);
  const mouseY = useMotionValue(500);

  // Realistic heavy damping to simulate enormous mass and slow physical camera tracking
  const springX = useSpring(mouseX, { stiffness: 10, damping: 50 });
  const springY = useSpring(mouseY, { stiffness: 10, damping: 50 });

  // 1. Base Parallax (Deep Background 8K Image)
  const bgX = useTransform(springX, [0, 2500], [8, -8]);
  const bgY = useTransform(springY, [0, 1500], [8, -8]);
  const bgRotateX = useTransform(springY, [0, 1500], [1, -1]);
  const bgRotateY = useTransform(springX, [0, 2500], [-1, 1]);

  // 2. Midground Parallax (Distant Stars)
  const mgX = useTransform(springX, [0, 2500], [30, -30]);
  const mgY = useTransform(springY, [0, 1500], [30, -30]);

  // 3. Foreground Parallax (Close Stars/Dust)
  const fgX = useTransform(springX, [0, 2500], [70, -70]);
  const fgY = useTransform(springY, [0, 1500], [70, -70]);

  // Volumetric Lighting Parallax
  const lightX = useTransform(springX, [0, 2500], [-30, 30]); // Moves inversely to camera to simulate external light source

  const [stars, setStars] = useState({ mg: '', fg: '' });

  useEffect(() => {
    setMounted(true);
    
    // Generate static hardware-accelerated CSS starfields once
    let mg = ''; let fg = '';
    for(let i=0; i<150; i++) {
        mg += `${Math.floor(Math.random()*3000)-500}px ${Math.floor(Math.random()*2000)-200}px #fff${i<149?',':''}`;
    }
    for(let i=0; i<40; i++) {
        fg += `${Math.floor(Math.random()*3000)-500}px ${Math.floor(Math.random()*2000)-200}px rgba(255, 255, 255, 0.8)${i<39?',':''}`;
    }
    setStars({ mg, fg });

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    if (typeof window !== "undefined") {
      mouseX.set(window.innerWidth / 2);
      mouseY.set(window.innerHeight / 2);
      window.addEventListener("mousemove", handleMouseMove);
      return () => window.removeEventListener("mousemove", handleMouseMove);
    }
  }, [mouseX, mouseY]);

  let animateProps: any = {};
  let transitionProps: any = {};

  if (variant === 'landing') {
    animateProps = { scale: [1, 1.15] };
    transitionProps = { duration: 180, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse", ease: "linear" };
  } else if (variant === 'login') {
    animateProps = { x: ['-1%', '1%', '-1%'] };
    transitionProps = { duration: 150, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" };
  } else if (variant === 'register') {
    // Majestic continuous slow rotation for the Black Hole background
    animateProps = { rotate: [0, 360], scale: 1.25 }; 
    transitionProps = { duration: 400, repeat: Number.POSITIVE_INFINITY, ease: "linear" };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', background: '#000', perspective: '1200px' }}>
      
      {/* ─── LAYER 1: DEEP BACKGROUND (The Raw 8K Image) ─── */}
      <motion.div
        style={{
          position: 'absolute', inset: '-5%',
          x: mounted ? bgX : 0, y: mounted ? bgY : 0,
          rotateX: mounted && variant === 'landing' ? bgRotateX : 0,
          rotateY: mounted && variant === 'landing' ? bgRotateY : 0,
          transformStyle: "preserve-3d",
        }}
      >
        <motion.div
          animate={animateProps}
          transition={transitionProps}
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url('${imageUrl}')`,
            backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
            // Deeply enhance black contrast for absolute realism without distortion
            filter: variant === 'register' ? 'brightness(0.7) contrast(1.3)' : 'contrast(1.1)', 
          }}
        />
      </motion.div>

      {/* ─── LAYER 2: 3D TRUE DEPTH PARALLAX (Landing Page Exclusives) ─── */}
      {/* This separates the flat image into a 3-dimensional volume by moving foreground stars faster than the background */}
      {variant === 'landing' && mounted && stars.mg && (
        <>
          <motion.div
            style={{ position: 'absolute', width: '2px', height: '2px', borderRadius: '50%', background: 'transparent', boxShadow: stars.mg, x: mgX, y: mgY, opacity: 0.3 }}
          />
          <motion.div
            style={{ position: 'absolute', width: '3px', height: '3px', borderRadius: '50%', background: 'transparent', boxShadow: stars.fg, x: fgX, y: fgY, filter: 'blur(1px)', opacity: 0.2 }}
          />
        </>
      )}

      {/* ─── LAYER 3: VOLUMETRIC ATMOSPHERE (Login Page) ─── */}
      {/* Simulates incredibly subtle external light casting across the galaxy gas */}
      {variant === 'login' && mounted && (
         <motion.div
           style={{
             position: 'absolute', inset: '-20%',
             background: 'radial-gradient(ellipse at 50% 100%, rgba(34, 211, 238, 0.04) 0%, transparent 60%)',
             x: lightX, // Responds inversely to mouse
             mixBlendMode: 'screen'
           }}
         />
      )}

      {/* ─── LAYER 4: EVENT HORIZON PHYSICS (Register Page) ─── */}
      {/* Constructs a scientifically-inspired Black Hole directly over the spinning 8K background */}
      {variant === 'register' && mounted && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
           {/* The Deep Void (Event Horizon) */}
           <motion.div 
             animate={{ scale: [0.98, 1.02, 0.98] }}
             transition={{ duration: 15, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
             style={{
               width: 'min(35vw, 45vh)', height: 'min(35vw, 45vh)',
               background: '#000', borderRadius: '50%',
               // Accretion disk glow and stark gravitational shadows
               boxShadow: '0 0 100px 20px rgba(0,0,0,0.95), 0 0 150px 40px rgba(230, 130, 20, 0.1), inset 0 0 40px 10px rgba(0,0,0,1)',
               x: bgX, y: bgY, // Slightly tracks with background to maintain illusion of huge scale
             }}
           >
             {/* Swirling Relativistic Plasma Ring */}
             <motion.div
               animate={{ rotate: [0, -360], opacity: [0.6, 0.9, 0.6] }}
               transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
               style={{ 
                 width: '100%', height: '100%', borderRadius: '50%', 
                 border: '2px solid rgba(255, 180, 80, 0.2)', 
                 borderTopColor: 'rgba(255, 220, 150, 0.6)', // Simulates doppler beaming
                 borderBottomColor: 'transparent',
                 filter: 'blur(4px)'
               }}
             />
           </motion.div>
        </div>
      )}

      {/* Global Vignette - Necessary for framing and UI Contrast */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 35%, rgba(2, 6, 23, 0.85) 100%)', pointerEvents: 'none', zIndex: 1 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(1, 4, 15, 0.15)', pointerEvents: 'none', zIndex: 1 }} />
    </div>
  );
}
