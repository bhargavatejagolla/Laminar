"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const IntelligenceMapCore = dynamic(() => import("./IntelligenceMapCore"), {
  ssr: false,
  loading: function MapLoading() {
    const { t } = useTranslation();
    return (
    <div className="flex w-full h-screen flex-col items-center justify-center bg-[#020617] relative overflow-hidden">
       {/* Decorative Background */}
       <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.02)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20"></div>
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.05)_0%,transparent_70%)]"></div>
       
       <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse"></div>
            <div className="w-16 h-16 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin relative z-10"></div>
            <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-cyan-400 animate-pulse" />
          </div>
          <h2 className="text-sm font-black text-white uppercase tracking-[0.4em] mb-2 drop-shadow-lg">{t("auto.InitializingInt_9572") || "Initializing Intelligence Matrix"}</h2>
          <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase opacity-60">{t("auto.SynchronizingGl_2626") || "Synchronizing Global Spatial Data..."}</p>
       </div>

       {/* Loading Progress Decorative Bar */}
       <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-64 h-[2px] bg-white/5 overflow-hidden rounded-full">
          <div className="h-full bg-cyan-500/50 w-1/3 animate-[slideRight_2s_infinite_linear]"></div>
       </div>
    </div>
    );
  },
});

interface IntelligenceMapProps {
  venues?: any[];
}

export function IntelligenceMap(props: IntelligenceMapProps) {
  const { t } = useTranslation();
return <IntelligenceMapCore {...props} />;
}
