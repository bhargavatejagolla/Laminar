"use client"

import { useEffect, useState } from "react"
import { Clock, Users, ArrowRight, Activity, Zap } from "lucide-react"
import { useTranslation } from "react-i18next"
import { api } from "@/services/api"

export default function QueueWaitTimeCard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { t } = useTranslation()

  // Hardcode primary venue ID for dashboard demo purposes,
  // or normally we would pass this via props / context.
  const VENUE_ID = "00000000-0000-0000-0000-000000000001" 

  useEffect(() => {
    const fetchEstimate = async () => {
      try {
        const res = await api.get(`/venues/${VENUE_ID}/queue-estimate`)
        setData(res.data)
        setError(false)
      } catch (e) {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchEstimate()
    
    // Poll every 10 seconds (Backend caches for 60s anyway)
    const interval = setInterval(fetchEstimate, 10000)
    return () => clearInterval(interval)
  }, [VENUE_ID])


  if (error) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 w-full flex items-center justify-center animate-pulse">
        <p className="text-slate-500 text-sm">{t("queue.unavailable")}</p>
      </div>
    )
  }

  // Visual severity indicators based on wait time
  let statusColor = "text-emerald-400"
  let bgGlow = "shadow-[0_0_15px_rgba(52,211,153,0.15)] bg-emerald-500/10 border-emerald-500/20"
  let statusText = "Smooth Flow"

  if (data) {
    if (data.wait_time_minutes > 15) {
      statusColor = "text-rose-400"
      bgGlow = "shadow-[0_0_15px_rgba(244,63,94,0.15)] bg-rose-500/10 border-rose-500/20"
      statusText = t("queue.heavyDelay")
    } else if (data.wait_time_minutes > 5) {
      statusColor = "text-amber-400"
      bgGlow = "shadow-[0_0_15px_rgba(251,191,36,0.15)] bg-amber-500/10 border-amber-500/20"
      statusText = t("queue.moderateQueue")
    } else {
      statusText = t("queue.smoothFlow")
    }
  }


  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative group">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-800/10 to-transparent pointer-events-none" />
      
      <div className="p-5 flex flex-col h-full justify-between relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg border ${bgGlow}`}>
               <Clock className={`w-5 h-5 ${statusColor}`} />
            </div>
            <h3 className="font-semibold text-slate-200 tracking-wide">{t("queue.queueEstimate")}</h3>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700">
             <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusColor.replace('text-', 'bg-')} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColor.replace('text-', 'bg-')}`}></span>
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{t("queue.live")}</span>
          </div>
        </div>

        {/* Content */}
        {loading && !data ? (
          <div className="flex-1 flex items-center justify-center py-6">
            <Activity className="w-6 h-6 text-cyan-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* Main Time Display */}
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white tracking-tight">{data?.wait_time_minutes || 0}</span>
              <span className="text-lg font-medium text-slate-400">{t("queue.minWait")}</span>
            </div>
            
            <p className={`text-sm font-semibold uppercase tracking-wider ${statusColor}`}>
              {statusText}
            </p>

            {/* Sub Metrics */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-medium mb-1">{t("queue.inQueue")}</span>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold">{data?.queue_length || 0}</span>
                </div>
              </div>
              
              <ArrowRight className="w-4 h-4 text-slate-600" />
              
              <div className="flex flex-col items-end">
                <span className="text-xs text-slate-500 font-medium mb-1">{t("queue.processRate")}</span>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span className="font-bold">{data?.service_rate || 40}</span>
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] text-slate-500">/min</span>
                </div>
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  )
}
