"use client";

import { useEffect, useRef, useState } from "react";
import { Video, VideoOff, Wifi, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  cameraId: string;
}

export default function BrowserBroadcaster({ cameraId }: Props) {
  const { t } = useTranslation();

  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSecureContext, setIsSecureContext] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<number | null>(null);
  const isBroadcastingRef = useRef(false);

  const startBroadcast = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setIsBroadcasting(true);
      isBroadcastingRef.current = true;
      toast.success("Broadcast started!");
      
      const uploadUrl = `/api/v1/vision/upload/${cameraId}`;
      
      const captureFrame = async () => {
        if (!isBroadcastingRef.current) return;
        
        try {
          if (videoRef.current && canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
              const targetWidth = videoRef.current.videoWidth || 640;
              const targetHeight = videoRef.current.videoHeight || 480;
              if (canvasRef.current.width !== targetWidth) {
                canvasRef.current.width = targetWidth;
                canvasRef.current.height = targetHeight;
              }
              ctx.drawImage(videoRef.current, 0, 0);
              
              const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.6);
              
              await fetch(uploadUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: dataUrl })
              });
            }
          }
        } catch (uploadErr) {
           console.error("Frame upload failed:", uploadErr);
        }
        
        if (isBroadcastingRef.current) {
          loopRef.current = window.setTimeout(captureFrame, 150); // ~7-10 fps
        }
      };
      
      captureFrame();

    } catch (err: any) {
      setError(err.message || "Failed to access camera");
      toast.error("Could not start broadcast stream");
    }
  };

  const stopBroadcast = () => {
    isBroadcastingRef.current = false;
    setIsBroadcasting(false);
    if (loopRef.current) clearTimeout(loopRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsBroadcasting(false);
  };

  useEffect(() => {
    setIsSecureContext(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
    return () => {
      stopBroadcast();
    };
  }, []);

  return (
    <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-indigo-400 flex items-center gap-2">
          {isBroadcasting ? <Wifi className="w-4 h-4 animate-pulse text-emerald-400" /> : <Video className="w-4 h-4" />}
          Live Browser Broadcast
        </h3>
        {isBroadcasting ? (
          <button 
            onClick={stopBroadcast}
            className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold text-xs rounded uppercase tracking-wider hover:bg-rose-500/30 transition-colors"
          >
            <VideoOff className="w-3 h-3" /> {t("auto.StopBroadcast_9969") || "Stop Broadcast"}
          </button>
        ) : (
          <button 
            onClick={startBroadcast}
            disabled={!isSecureContext}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold text-xs rounded uppercase tracking-wider hover:bg-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Video className="w-3 h-3" /> {t("auto.StartBroadcast_7089") || "Start Broadcast"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            {t("auto.Thiscameranodei_5157") || "This camera node is configured to receive a direct upload from your browser. Clicking"} <strong>{t("auto.StartBroadcast_7089") || "Start Broadcast"}</strong> will turn on your device's webcam and immediately push frames 
            to the AI backend for YOLO analysis and dwell tracking.
          </p>
          {!isSecureContext && (
            <div className="flex flex-col gap-1 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 text-xs mt-2 mb-2">
              <span className="flex items-center gap-1 font-bold"><AlertTriangle className="w-3 h-3" /> {t("auto.SecurityPolicyB_1457") || "Security Policy Blocked"}</span>
              {t("auto.Browserwebcamac_2147") || "Browser webcam access requires a secure connection. Because you are accessing this server over an insecure HTTP network IP, the browser has blocked camera permissions. To broadcast remotely, you must access the platform via HTTPS using Ngrok!"}
            </div>
          )}
          {error && (
            <div className="flex flex-col gap-1 p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-xs mt-2">
              <span className="flex items-center gap-1 font-bold"><AlertTriangle className="w-3 h-3" /> {t("auto.Error_4064") || "Error"}</span>
              {error}
            </div>
          )}
        </div>
        
        <div className="relative aspect-video bg-black rounded-lg border border-slate-800 overflow-hidden group">
          {/* Hidden canvas used for frame extraction */}
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Video preview */}
          <video 
            ref={videoRef} 
            muted 
            playsInline
            className={`w-full h-full object-cover transition-opacity ${isBroadcasting ? "opacity-100" : "opacity-0"}`}
          />
          
          {!isBroadcasting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <VideoOff className="w-8 h-8 text-slate-600 mb-2" />
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">{t("auto.PreviewOffline_7288") || "Preview Offline"}</span>
            </div>
          )}
          {isBroadcasting && (
             <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.3)] border border-emerald-500/30 text-[9px] font-bold text-emerald-400 tracking-widest uppercase">
               <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> {t("auto.LiveUplink_2666") || "Live Uplink"}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
