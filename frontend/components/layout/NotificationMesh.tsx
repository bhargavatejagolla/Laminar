"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { 
  ShieldAlert, 
  MapPin, 
  Activity, 
  TrafficCone, 
  Clock, 
  Zap,
  CheckCircle2,
  AlertTriangle,
  ParkingCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

interface MeshNotification {
  id: string;
  timestamp: string;
  domain: "traffic" | "parking" | "incident";
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  venue_id?: string;
  metadata?: any;
}

export function NotificationMesh() {
  const { t } = useTranslation();

  const [activeAlerts, setActiveAlerts] = useState<MeshNotification[]>([]);

  useEffect(() => {
    let sse: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectMesh = () => {
      sse = new EventSource("/api/v1/notifications/stream");

      sse.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === "mesh_connected") {
             console.log("Tactical Mesh Linked.");
             return;
        }

        const notification = data as MeshNotification;

        try {
          const audio = new Audio("/notfication-sound.wav");
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch (e) {}
        
        // Add to active alerts for the HUD
        setActiveAlerts(prev => [notification, ...prev].slice(0, 5));

        // Trigger Tactical Toast
        showTacticalToast(notification);
      };

      sse.onerror = () => {
          console.warn("Mesh link interrupted. Soft reconnect scheduled in 5s...");
          if (sse) sse.close();
          reconnectTimeout = setTimeout(connectMesh, 5000);
      };
    };

    connectMesh();

    return () => {
        if (sse) sse.close();
        clearTimeout(reconnectTimeout);
    };
  }, []);

  const showTacticalToast = (n: MeshNotification) => {
      const icon = n.domain === 'incident' ? <ShieldAlert className="w-4 h-4 text-rose-500" /> 
                 : n.domain === 'traffic' ? <TrafficCone className="w-4 h-4 text-amber-500" />
                 : <ParkingCircle className="w-4 h-4 text-cyan-500" />;

      toast.custom((toastId) => (
        <div className={`
          flex flex-col gap-2 p-4 min-w-[320px] bg-[#0a0a0f] border rounded-2xl shadow-2xl backdrop-blur-xl
          ${n.priority === 'CRITICAL' ? 'border-rose-500/50 shadow-rose-500/10' : 'border-white/10'}
        `}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${n.priority === 'CRITICAL' ? 'bg-rose-500' : 'bg-amber-500'}`} />
              <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase font-mono">Mesh_Broadcast</span>
            </div>
            <span className="text-[8px] text-white/20 font-mono italic">{new Date(n.timestamp).toLocaleTimeString()}</span>
          </div>

          <div className="flex items-start gap-3">
             <div className={`p-2.5 rounded-xl ${n.priority === 'CRITICAL' ? 'bg-rose-500/10' : 'bg-white/5'}`}>
                {icon}
             </div>
             <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                    {n.type} 
                    {n.priority === 'CRITICAL' && <div className="px-1.5 py-0.5 bg-rose-500 text-[8px] font-black rounded uppercase">{t("auto.Alert_5041") || "Alert"}</div>}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed italic line-clamp-2">"{n.description}"</p>
             </div>
          </div>
          
          <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/5">
             <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                <MapPin className="w-3 h-3 text-rose-500/50" />
                {n.venue_id ? "SECTOR_7_CENTRAL" : "GLOBAL_STRATUM"}
             </div>
             <button 
               onClick={() => toast.dismiss(toastId)}
               className="text-[9px] font-black uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors"
             >
                {t("auto.Acknowledge_6781") || "Acknowledge"}
             </button>
          </div>
        </div>
      ), { duration: 8000 });
  };

  if (activeAlerts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-8 z-[100] w-72 pointer-events-none hidden xl:block">
       <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-2 mb-1">
             <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-cyan-400 animate-pulse" />
                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">{t("auto.NeuralLinkActiv_5696") || "Neural Link Active"}</span>
             </div>
             <span className="text-[8px] text-slate-600 font-mono uppercase tracking-widest">v5.0_Mesh</span>
          </div>
          
          <AnimatePresence initial={false}>
            {activeAlerts.map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-[#050b14]/80 backdrop-blur-md border border-white/5 p-3 rounded-xl border-l-2 border-l-cyan-500/50 relative group overflow-hidden"
              >
                 <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                       <Radio className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="min-w-0">
                       <p className="text-[10px] font-bold text-white/80 uppercase truncate">{alert.type}</p>
                       <p className="text-[8px] text-slate-500 font-mono truncate">{alert.description}</p>
                    </div>
                 </div>
                 <div className="absolute top-0 right-0 p-2">
                    <div className="w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]" />
                 </div>
              </motion.div>
            ))}
          </AnimatePresence>
       </div>
    </div>
  );
}

function Radio({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>
    );
}
