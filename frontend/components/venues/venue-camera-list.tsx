"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Activity, Video, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";

interface Camera {
  id: string;
  name: string;
  stream_type: string;
  fps: number;
  is_active: boolean;
}

export default function VenueCameraList({ venueId }: { venueId: string }) {
  const { data: cameras, isLoading } = useQuery<Camera[]>({
    queryKey: ["cameras", venueId],
    queryFn: async () => {
      const res = await api.get(`/cameras?venue_id=${venueId}`);
      return res.data;
    }
  });

  if (isLoading) {
    return <div className="h-24 bg-slate-800/30 rounded-xl animate-pulse"></div>;
  }

  if (!cameras || cameras.length === 0) {
    return (
      <div className="p-6 text-center border border-dashed border-slate-700/50 rounded-xl bg-slate-800/20">
        <Video className="w-6 h-6 text-slate-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-400">No cameras connected to this sector.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cameras.map((camera: any) => (
        <div key={camera.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#0f172a] hover:border-cyan-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded bg-slate-800 flex-shrink-0 ${camera.is_active ? "text-cyan-400" : "text-slate-500"}`}>
               <Video className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
               <span className="text-sm font-semibold text-slate-200">{camera.name}</span>
               <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">{camera.stream_type} • {camera.fps} FPS</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {camera.is_active ? (
               <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-500/20 text-[10px] font-semibold text-emerald-400 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active
               </div>
            ) : (
               <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-rose-500/20 text-[10px] font-semibold text-rose-400 uppercase">
                  <WifiOff className="w-3 h-3" /> Offline
               </div>
            )}
            <Link href={`/cameras/${camera.id}`} className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
              View Feed
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
