import { ReactNode } from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

interface Props {
  icon: ReactNode
  label: string
  value: number | string
  trend?: {
    value: number
    isPositive: boolean
  }
}

export default function StatCard({ icon, label, value, trend }: Props) {
  return (
    <div className="relative group bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-6 overflow-hidden transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_30px_-5px_rgba(34,211,238,0.15)] hover:-translate-y-1 hover:scale-[1.02]">
      
      {/* Decorative Glow Background */}
      <div className="absolute -right-10 -top-10 w-32 h-32 bg-cyan-900/20 rounded-full blur-[40px] group-hover:bg-cyan-600/20 transition-colors duration-500"></div>

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between z-10 gap-3 sm:gap-0">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <p className="text-[10px] xl:text-xs font-semibold text-slate-500 uppercase tracking-wider leading-tight">{label}</p>
          <div className="flex items-baseline gap-2 xl:gap-3 min-w-0 flex-wrap mt-0.5">
            <h3 className="text-2xl xl:text-3xl font-bold font-mono text-slate-100 tracking-tight break-words">{value}</h3>
            
            {trend && (
              <span className={twMerge(
                "text-[10px] xl:text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap",
                trend.isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
              )}>
                {trend.isPositive ? "+" : "-"}{trend.value}%
              </span>
            )}
          </div>
        </div>

        <div className="p-3.5 bg-[#020617] rounded-xl border border-slate-800 shadow-inner group-hover:border-cyan-900 group-hover:text-cyan-400 transition-colors duration-300 text-slate-400 self-start sm:self-auto shrink-0">
          {icon}
        </div>
      </div>
    </div>
  )
}