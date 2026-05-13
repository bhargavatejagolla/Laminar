"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CinematicVideoPlayerProps {
  videos: string[];
  onComplete: () => void;
}

export default function CinematicVideoPlayer({ videos, onComplete }: CinematicVideoPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const handleEnded = (index: number) => {
    if (index === currentIndex) {
      if (currentIndex < videos.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onComplete();
      }
    }
  };

  useEffect(() => {
    const activeVideo = videoRefs.current[currentIndex];
    if (activeVideo) {
      activeVideo.play().catch(err => console.error("Playback error:", err));
    }
  }, [currentIndex]);

  return (
    <div className="fixed inset-0 bg-[#00000a] flex p-2 gap-2">
      {videos.map((src, idx) => (
        <div 
          key={idx} 
          className={`relative h-full transition-all duration-1000 ease-in-out overflow-hidden rounded-xl border border-white/5 ${
            idx === currentIndex ? "flex-[12] bg-zinc-900/20 shadow-[0_0_80px_rgba(59,130,246,0.15)]" : "flex-1 opacity-40 grayscale brightness-50"
          }`}
        >
          {/* Active Label Overlay */}
          {idx === currentIndex && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-6 left-6 z-30 flex items-center gap-3 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-blue-500/30"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[0.6rem] font-black text-blue-400 uppercase tracking-[0.3em]">
                Active Stream 0{idx + 1}
              </span>
            </motion.div>
          )}

          <video
            ref={el => { videoRefs.current[idx] = el; }}
            src={src}
            onEnded={() => handleEnded(idx)}
            muted
            playsInline
            className={`w-full h-full transition-all duration-1000 ${
              idx === currentIndex ? "object-contain bg-black" : "object-cover"
            }`}
          />

          {/* Individual Column Progress Bar */}
          <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5 z-40">
            {idx === currentIndex && (
              <motion.div 
                className="h-full bg-blue-500 shadow-[0_0_15px_#3b82f6]"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 12, ease: "linear" }}
              />
            )}
            {idx < currentIndex && <div className="h-full w-full bg-blue-500/40" />}
          </div>

          {/* Column Number (Small) */}
          {idx !== currentIndex && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <span className="text-white/10 text-xl font-black italic">
                {idx + 1}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
