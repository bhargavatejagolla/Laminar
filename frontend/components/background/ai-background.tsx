"use client";

import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

export default function AIBackground() {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (!init) {
    return <div className="fixed inset-0 -z-30 w-full h-full bg-[#020617]"></div>;
  }

  return (
    <div className="fixed inset-0 -z-30 w-full h-full overflow-hidden">
      <Particles
        id="tsparticles"
        options={{
          fullScreen: { enable: false },
          background: {
            color: "transparent",
          },
          fpsLimit: 120,
          particles: {
            number: {
              value: 700, // Very high density for realism
              density: {
                enable: true,
                width: 1920,
                height: 1080,
              },
            },
            color: {
              value: ["#ffffff", "#f8fafc", "#f0f9ff", "#e0e7ff", "#fffbez"], // Very subtle variations of white, star blue/yellow
            },
            shape: {
              type: "circle",
            },
            opacity: {
              value: { min: 0.05, max: 0.9 },
              animation: {
                enable: true,
                speed: 0.2, // Very slow twinkling
                sync: false,
              },
            },
            size: {
              value: { min: 0.1, max: 2.0 }, // Much smaller sizes for distant stars
              animation: {
                enable: true,
                speed: 0.5,
                sync: false,
              },
            },
            links: {
              enable: false, // Pure starfield
            },
            move: {
              enable: true,
              speed: 0.05, // Almost imperceptible slow drift
              direction: "right", 
              random: true,
              straight: false,
              outModes: {
                default: "out",
              },
            },
          },
          interactivity: {
            events: {
              onHover: {
                enable: true,
                mode: ["repulse"],
              },
              onClick: {
                enable: true,
                mode: "push",
              },
              resize: { enable: true },
            },
            modes: {
              repulse: {
                distance: 100,
                duration: 2,
                speed: 0.5
              },
              push: {
                quantity: 4,
              },
            },
          },
          detectRetina: true,
        }}
        className="w-full h-full opacity-60 mix-blend-screen"
      />
    </div>
  );
}