"use client";

/** PremiumBackground — pure CSS animated aurora mesh, no canvas, no random values */
export default function PremiumBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden', background: '#020817' }}>

      {/* ─── Deep star layer via CSS box-shadow trick ─── */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.6 }}>
        <div className="stars-sm" />
        <div className="stars-md" />
        <div className="stars-lg" />
      </div>

      {/* ─── Aurora blob 1 — cyan ─── */}
      <div className="aurora-blob aurora-cyan" />

      {/* ─── Aurora blob 2 — blue ─── */}
      <div className="aurora-blob aurora-blue" />

      {/* ─── Aurora blob 3 — purple ─── */}
      <div className="aurora-blob aurora-purple" />

      {/* ─── Aurora blob 4 — teal accent ─── */}
      <div className="aurora-blob aurora-teal" />

      {/* ─── Animated grid ─── */}
      <div className="grid-overlay" />

      {/* ─── Sweep line ─── */}
      <div className="sweep-line" />

      <style>{`
        /* Stars — generated via CSS gradient stops */
        .stars-sm {
          position: absolute; inset: 0;
          background-image:
            radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.7) 0%, transparent 100%),
            radial-gradient(1px 1px at 20% 42%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 35% 8%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 50% 25%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 65% 55%, rgba(255,255,255,0.7) 0%, transparent 100%),
            radial-gradient(1px 1px at 78% 12%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 88% 38%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 5% 70%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 42% 80%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 93% 68%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 15% 90%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 72% 85%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 55% 95%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 82% 45%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 47% 35%, rgba(200,220,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 23% 22%, rgba(200,220,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 60% 72%, rgba(200,220,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 90% 20%, rgba(200,220,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 3% 48%, rgba(200,220,255,0.5) 0%, transparent 100%);
          animation: twinkle-sm 6s ease-in-out infinite alternate;
        }
        .stars-md {
          position: absolute; inset: 0;
          background-image:
            radial-gradient(1.5px 1.5px at 18% 33%, rgba(255,255,255,0.8) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 40% 18%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 70% 30%, rgba(255,255,255,0.8) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 85% 60%, rgba(255,255,255,0.7) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 25% 75%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 55% 50%, rgba(200,230,255,0.7) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 95% 82%, rgba(200,230,255,0.6) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 8% 88%, rgba(200,230,255,0.5) 0%, transparent 100%);
          animation: twinkle-md 9s ease-in-out infinite alternate;
        }
        .stars-lg {
          position: absolute; inset: 0;
          background-image:
            radial-gradient(2px 2px at 30% 40%, rgba(255,255,255,0.9) 0%, transparent 100%),
            radial-gradient(2px 2px at 60% 15%, rgba(255,255,255,0.8) 0%, transparent 100%),
            radial-gradient(2px 2px at 80% 75%, rgba(140,200,255,0.9) 0%, transparent 100%),
            radial-gradient(2px 2px at 12% 55%, rgba(140,200,255,0.8) 0%, transparent 100%),
            radial-gradient(2px 2px at 48% 87%, rgba(180,160,255,0.8) 0%, transparent 100%);
          animation: twinkle-lg 12s ease-in-out infinite alternate;
        }
        @keyframes twinkle-sm {
          0% { opacity: 0.4; transform: scale(1); }
          100% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes twinkle-md {
          0% { opacity: 0.5; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.03); }
        }
        @keyframes twinkle-lg {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.7; }
        }

        /* Aurora blobs */
        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          animation: drift 25s ease-in-out infinite alternate;
        }
        .aurora-cyan {
          width: 700px; height: 600px;
          top: -200px; right: -100px;
          background: radial-gradient(ellipse, rgba(6,182,212,0.18) 0%, rgba(34,211,238,0.08) 40%, transparent 70%);
          animation-duration: 22s;
        }
        .aurora-blue {
          width: 800px; height: 700px;
          top: -300px; left: -200px;
          background: radial-gradient(ellipse, rgba(59,130,246,0.15) 0%, rgba(99,102,241,0.08) 40%, transparent 70%);
          animation-duration: 28s;
          animation-direction: alternate-reverse;
        }
        .aurora-purple {
          width: 600px; height: 500px;
          bottom: -150px; left: 30%;
          background: radial-gradient(ellipse, rgba(139,92,246,0.15) 0%, rgba(168,85,247,0.07) 40%, transparent 70%);
          animation-duration: 35s;
        }
        .aurora-teal {
          width: 500px; height: 400px;
          bottom: 20%; right: 10%;
          background: radial-gradient(ellipse, rgba(20,184,166,0.12) 0%, transparent 70%);
          animation-duration: 20s;
          animation-direction: alternate-reverse;
        }
        @keyframes drift {
          0%   { transform: translate(0,  0)   scale(1);    opacity: 0.7; }
          33%  { transform: translate(40px, -30px) scale(1.1); opacity: 1; }
          66%  { transform: translate(-20px, 20px) scale(0.95); opacity: 0.8; }
          100% { transform: translate(30px, 40px) scale(1.05);  opacity: 0.9; }
        }

        /* Grid */
        .grid-overlay {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          opacity: 0.7;
          mask-image: radial-gradient(ellipse at 50% 50%, black 20%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse at 50% 50%, black 20%, transparent 80%);
        }

        /* Scan sweep line */
        .sweep-line {
          position: absolute;
          left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.6) 50%, transparent 100%);
          animation: sweep 8s ease-in-out infinite;
          box-shadow: 0 0 20px rgba(34,211,238,0.4);
        }
        @keyframes sweep {
          0%   { top: -2px; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
