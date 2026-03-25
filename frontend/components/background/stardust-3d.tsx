"use client";

import { useEffect, useRef } from 'react';

export default function Stardust3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const numStars = 600; // Dense high-quality starfield
    const stars: { x: number, y: number, z: number, o: number, size: number }[] = [];
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * width - width / 2,
        y: Math.random() * height - height / 2,
        z: Math.random() * width,
        o: 0.1 + Math.random() * 0.9,
        size: 0.5 + Math.random() * 1.5,
      });
    }

    let animationId: number;
    let cx = width / 2;
    let cy = height / 2;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      // Speed of entering space
      const speed = 2.5;

      for (let i = 0; i < numStars; i++) {
        const s = stars[i];
        s.z -= speed;

        // Reset if passed screen
        if (s.z <= 0) {
          s.z = width;
          s.x = Math.random() * width - cx;
          s.y = Math.random() * height - cy;
        }

        const k = 140.0 / s.z;
        const px = s.x * k + cx;
        const py = s.y * k + cy;

        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          const size = (1 - s.z / width) * 5 * s.size;
          const opacity = (1 - s.z / width) * s.o;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, 2 * Math.PI);
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.fill();
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      cx = width / 2;
      cy = height / 2;
    };

    window.addEventListener('resize', handleResize);
    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1, // Sits exactly between the background image and content
        pointerEvents: 'none',
        opacity: 0.8,
      }}
    />
  );
}
