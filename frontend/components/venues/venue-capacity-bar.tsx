"use client"

import { useMemo } from "react"

interface Props {
  capacity: number
  occupancyPercent?: number | null  // actual occupancy %: (current_people/capacity)*100
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

  const color = useMemo(() => {
    if (percent >= criticalThreshold) return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
    if (percent >= warningThreshold) return "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"
    if (percent > 0) return "bg-cyan-500"
    return "bg-slate-600"
  }, [percent, warningThreshold, criticalThreshold])

  return (
    <div className="w-full">
      {/* Bar Container */}
      <div className="w-full h-2 bg-slate-800 rounded-md overflow-hidden">
        {/* Animated Bar */}
        <div
          className={`h-full ${color} transition-all duration-700`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}