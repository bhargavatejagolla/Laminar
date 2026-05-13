"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export default function Loading() {
  const { t } = useTranslation();

  const [fill, setFill] = useState(0);

  useEffect(() => {
    let start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = (elapsed % 3000) / 3000; 
      setFill(progress * 100);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050b14]/80 backdrop-blur-xl">
      <div className="relative flex items-center justify-center">
        {/* Outer glowing pulsing circle */}
        <div className="absolute w-32 h-32 rounded-full border border-cyan-500/20 animate-[spin_4s_linear_infinite]" />
        <div className="absolute w-40 h-40 rounded-full border-t border-indigo-500/30 animate-[spin_3s_linear_infinite_reverse]" />
        
        {/* Center Shield Container */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          
          {/* Base transparent outline (SVG) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-800 drop-shadow-md absolute"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>

          {/* Filled SVG with Clip Path for internal fill effect */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* 
              We use the fill mask. 
              Fill level 0% -> height 0.
              Fill level 100% -> height full.
            */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              className="text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]"
            >
              <defs>
                <clipPath id="shield-fill-clip">
                  <rect x="0" y={24 - (24 * fill) / 100} width="24" height={(24 * fill) / 100} />
                </clipPath>
                <linearGradient id="shieldGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#4f46e5" />
                </linearGradient>
              </defs>
              <path 
                d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" 
                fill="url(#shieldGrad)" 
                clipPath="url(#shield-fill-clip)"
              />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Loading Text */}
      <div className="mt-16 flex flex-col items-center">
         <motion.h2 
           initial={{ opacity: 0, y: 5 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.5 }}
           className="text-xl font-bold font-mono tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]"
         >
           {t("auto.LAMINARAI_7739") || "LAMINAR AI"}
         </motion.h2>
         <motion.p 
           animate={{ opacity: [0.3, 1, 0.3] }}
           transition={{ duration: 2, repeat: Infinity }}
           className="text-xs text-cyan-500/80 font-mono tracking-[0.2em] mt-3 uppercase font-semibold"
         >
           {t("auto.EstablishingUpl_3331") || "Establishing Uplink..."}
         </motion.p>
      </div>
    </div>
  );
}
