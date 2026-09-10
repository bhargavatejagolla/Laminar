"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const RoadCommandGisCore = dynamic(
  () => import("./RoadCommandGisCore"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[350px] bg-[#080810] flex flex-col items-center justify-center border border-white/10 rounded-2xl gap-3">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
        <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
          Mounting GIS Tactical Vector Layer…
        </span>
      </div>
    ),
  }
);

export function RoadCommandGisMap(props: any) {
  return <RoadCommandGisCore {...props} />;
}
