"use client"

import { useAlerts } from "@/hooks/useAlerts"
import { AlertCircle, Camera, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next";

export default function CameraHealthBanner() {
  const { t } = useTranslation();

  const { cameraAlerts } = useAlerts()
  const [closedIds, setClosedIds] = useState<string[]>([])

  const activeAlerts = cameraAlerts.filter((a: any) => !closedIds.includes(a.id))

  if (activeAlerts.length === 0) return null

  return (
    <div className="z-[40] w-full bg-slate-900/50 backdrop-blur-md border-b border-yellow-500/20">
      <AnimatePresence>
        {activeAlerts.map((alert: any) => (
          <motion.div
            key={alert.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 flex items-center justify-between gap-4 bg-yellow-500/10 border-b border-yellow-500/10">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-yellow-500/20 rounded-lg">
                  <Camera className="w-4 h-4 text-yellow-500" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-sm font-bold text-yellow-500 uppercase tracking-wider">
                    {alert.extra_data?.issue_label || "Camera Issue"}
                  </span>
                  <span className="text-sm text-slate-300">
                    {alert.extra_data?.camera_name || "Unknown Camera"} — {alert.message || "Technical anomaly detected"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link 
                  href="/cameras" 
                  className="text-xs font-semibold text-yellow-500 hover:text-yellow-400 underline underline-offset-4 transition-colors"
                >
                  {t("auto.InspectCamera_2820") || "Inspect Camera"}
                </Link>
                <button 
                  onClick={() => setClosedIds(prev => [...prev, alert.id])}
                  className="p-1 hover:bg-white/5 rounded-md transition-colors text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
