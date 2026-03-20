"use client"

interface Props {
  risk?: number
  level?: string
}

export default function VenueStatusBadge({ risk = 0, level }: Props) {

  let label = "LOW"
  let color = "bg-green-500/20 text-green-400 border-green-500/30"

  if (level) {
    const l = level.toLowerCase()
    if (l === "critical" || l === "exceeded") {
      label = "CRITICAL"
      color = "bg-red-500/20 text-red-400 border-red-500/30"
    }
    else if (l === "high" || l === "warning") {
      label = "HIGH"
      color = "bg-orange-500/20 text-orange-400 border-orange-500/30"
    }
    else if (l === "medium") {
      label = "MEDIUM"
      color = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    }
    else if (l === "unknown") {
      label = "UNKNOWN"
      color = "bg-slate-500/20 text-slate-400 border-slate-500/30"
    }
  } else {
    // Fallback to percentage risk
    if (risk >= 75) {
      label = "CRITICAL"
      color = "bg-red-500/20 text-red-400 border-red-500/30"
    } 
    else if (risk >= 50) {
      label = "HIGH"
      color = "bg-orange-500/20 text-orange-400 border-orange-500/30"
    } 
    else if (risk >= 25) {
      label = "MEDIUM"
      color = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    }
  }

  return (
    <span
      className={`px-3 py-1 text-xs font-semibold rounded-md border ${color} transition-all`}
    >
      {label}
    </span>
  )
}