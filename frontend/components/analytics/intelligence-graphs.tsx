"use client";

import { useEffect, useState, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useZoneIntelligenceSummary, CameraIntelligenceEntry } from "@/hooks/useZoneIntelligence";
import { Activity, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TimelinePoint {
  time: string;
  [cameraKey: string]: number | string; // dynamic per-camera keys + "time"
}

// Color palette for up to 8 cameras
const COLORS = [
  "#0ea5e9", // sky
  "#a78bfa", // violet
  "#f97316", // orange
  "#34d399", // emerald
  "#f43f5e", // rose
  "#fbbf24", // amber
  "#22d3ee", // cyan
  "#e879f9", // fuchsia
];

function safeCamKey(cam: CameraIntelligenceEntry, idx: number) {
  return cam.camera_name ? cam.camera_name.slice(0, 10) : `CAM-${idx}`;
}

export default function IntelligenceGraphs() {
  const { t } = useTranslation();

  const { data } = useZoneIntelligenceSummary();
  const [history, setHistory] = useState<TimelinePoint[]>([]);
  const [camKeys, setCamKeys] = useState<string[]>([]);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentData = dataRef.current;
      if (!currentData || !currentData.cameras || currentData.cameras.length === 0) return;

      const now = new Date();
      const timeLabel = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      const point: TimelinePoint = { time: timeLabel };
      const keys: string[] = [];

      currentData.cameras.forEach((c: CameraIntelligenceEntry, idx: number) => {
        const key = safeCamKey(c, idx);
        keys.push(key);
        // Include data for all cameras — warming_up and offline show 0 density
        const density = c.snapshot?.density?.current ?? 0;
        point[key] = density;
      });

      setCamKeys(keys);

      setHistory((prev) => {
        const next = [...prev, point];
        return next.length > 40 ? next.slice(next.length - 40) : next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const firstActive = data?.cameras.find((c: CameraIntelligenceEntry) => c.status === "active");
  const currentTrend = firstActive?.snapshot?.density?.trend ?? "stable";
  const hasAnyCameras = (data?.cameras.length ?? 0) > 0;

  return (
    <div className="bg-[#050f1f]/80 backdrop-blur-xl border border-cyan-500/20 rounded-2xl p-5 overflow-hidden relative shadow-[0_0_20px_rgba(34,211,238,0.1)]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-30" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/30">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-white font-bold tracking-widest uppercase text-sm">{t("auto.AggregatedOpera_7058") || "Aggregated Operations Trend"}</h2>
            <p className="text-[10px] text-indigo-500 tracking-widest uppercase font-mono">
              {data?.cameras.length ? `${data.cameras.length} Camera(s) · Live Timeline` : "Live Timeline Analytics"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              currentTrend === "increasing"
                ? "bg-rose-500"
                : currentTrend === "decreasing"
                ? "bg-emerald-500"
                : "bg-amber-500"
            } animate-pulse`}
          />
          <span className="text-xs tracking-widest font-bold uppercase text-slate-400">{currentTrend}</span>
        </div>
      </div>

      <div className="h-[220px] mt-4 w-full">
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                {camKeys.map((key, i) => (
                  <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fill: "#64748b", fontSize: 9 }}
                tickMargin={8}
                stroke="#334155"
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }} stroke="#334155" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(5, 15, 31, 0.95)",
                  borderColor: "rgba(14, 165, 233, 0.3)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  color: "#fff",
                }}
              />
              {camKeys.length > 1 && (
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "10px", color: "#94a3b8", paddingTop: "4px" }}
                />
              )}
              {camKeys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#grad-${i})`}
                  isAnimationActive={false}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : !hasAnyCameras ? (
          <div className="h-full w-full flex items-center justify-center border-t border-white/5">
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <Activity className="w-5 h-5 opacity-50" />
              <span className="text-[10px] tracking-widest font-bold uppercase">{t("auto.NoActiveTelemet_6928") || "No Active Telemetry Streams"}</span>
            </div>
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center border-t border-white/5">
            <div className="flex items-center gap-2 text-slate-500">
              <Activity className="w-4 h-4 animate-pulse" />
              <span className="text-xs tracking-widest font-bold uppercase">
                {data?.cameras.length === 0
                  ? "No cameras configured..."
                  : "Collecting first telemetry snapshot..."}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
