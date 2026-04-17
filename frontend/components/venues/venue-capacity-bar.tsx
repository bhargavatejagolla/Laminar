"use client"

import { useMemo, useEffect, useState } from "react"

interface Props {
  capacity: number
  occupancyPercent?: number | null
  warningThreshold?: number
  criticalThreshold?: number
}

export default function VenueCapacityBar({
  capacity,
  occupancyPercent = 0,
  warningThreshold = 70,
  criticalThreshold = 90
}: Props) {

  const percent = useMemo(() => {
    return Math.min(Math.round(occupancyPercent ?? 0), 100)
  }, [occupancyPercent])

  // Skip animation on first mount so the bar fills instantly (not slowly from 0%)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const { barColor, bgGlow, statusLabel, statusColor } = useMemo(() => {
    if (percent >= criticalThreshold) return {
      barColor: "bg-red-500",
      bgGlow: "shadow-[0_0_8px_rgba(239,68,68,0.7)]",
      statusLabel: "CRITICAL",
      statusColor: "text-red-400"
    }
    if (percent >= warningThreshold) return {
      barColor: "bg-orange-500",
      bgGlow: "shadow-[0_0_8px_rgba(249,115,22,0.6)]",
      statusLabel: "HIGH",
      statusColor: "text-orange-400"
    }
    if (percent >= warningThreshold * 0.5) return {
      barColor: "bg-amber-400",
      bgGlow: "",
      statusLabel: "MEDIUM",
      statusColor: "text-amber-400"
    }
    if (percent > 0) return {
      barColor: "bg-emerald-500",
      bgGlow: "",
      statusLabel: "LOW",
      statusColor: "text-emerald-400"
    }
    return {
      barColor: "bg-slate-600",
      bgGlow: "",
      statusLabel: "EMPTY",
      statusColor: "text-slate-500"
    }
  }, [percent, warningThreshold, criticalThreshold])

  return (
    <div className="w-full">
      <div className="w-full h-2 bg-slate-800 rounded-md relative" style={{ overflow: "visible" }}>
        {/* Warning threshold marker */}
        {warningThreshold < 100 && (
          <div
            className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-amber-500/70 z-10 rounded-full"
            style={{ left: `min(${warningThreshold}%, calc(100% - 2px))` }}
          />
        )}
        {/* Critical threshold marker */}
        {criticalThreshold < 100 && (
          <div
            className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-red-500/70 z-10 rounded-full"
            style={{ left: `min(${criticalThreshold}%, calc(100% - 2px))` }}
          />
        )}
        <div
          className={`h-full rounded-md ${barColor} ${bgGlow} ${mounted ? "transition-[width] duration-300 ease-out" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <span className={`text-[8px] font-black uppercase tracking-widest ${statusColor}`}>{statusLabel}</span>
        <span className="text-[8px] font-mono text-slate-600">{percent}% used</span>
      </div>
    </div>
  )
}