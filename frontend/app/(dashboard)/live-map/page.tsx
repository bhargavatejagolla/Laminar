"use client";

import { useMemo } from "react";
import Sidebar from "@/components/layout/sidebar";
import { IntelligenceMap } from "@/components/map/IntelligenceMap";
import { Globe2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export default function LiveMapPage() {
  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const res = await api.get("/venues");
      return res.data;
    },
    refetchInterval: 5000,
  });

  return (
    <div className="flex h-screen bg-[#020617] text-slate-300 relative w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative bg-black text-white">
        {/* Core Map Component */}
        <div className="flex-1 w-full h-full relative isolate">
            <IntelligenceMap venues={venues} />
        </div>
      </div>
    </div>
  );
}
