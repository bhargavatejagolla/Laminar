"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Activity, ShieldAlert, Crosshair, AlertTriangle, ChevronRight, Zap, Radar, Gauge, CheckCircle2, Wifi, WifiOff, ArrowLeft } from "lucide-react";
import { useAlerts } from "@/hooks/useAlerts";
import { useVenues } from "@/hooks/useVenues";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { api } from "@/services/api";
import { useAlertStream } from "@/src/hooks/useAlertStream";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

// A dynamic wave background component
const WaveBackground = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 mix-blend-screen z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-20">
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(244,63,94,0.15)_0%,transparent_50%)] animate-pulse" style={{ animationDuration: '4s' }} />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(244,63,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(244,63,94,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_80%,transparent_100%)]"></div>
    </div>
);

const MetricGauge = ({ label, value, unit, color = "rose", percent = 50 }: { label: string, value: string | number, unit: string, color?: string, percent?: number }) => {
    // Add jitter to numeric values
    const [displayValue, setDisplayValue] = useState<string | number>(value);

    useEffect(() => {
        if (typeof value === 'string' && value === '—') {
            setDisplayValue(value);
            return;
        }
        if (typeof value === 'string' && value === 'OFF') {
            setDisplayValue(value);
            return;
        }

        const numValue = Number(value);
        if (isNaN(numValue) || numValue === 0) {
            setDisplayValue(value);
            return;
        }

        const interval = setInterval(() => {
            // +/- 0.5% jitter
            const jitter = numValue * 0.005 * (Math.random() - 0.5);
            let nextVal = numValue + jitter;

            // Format to match original decimal places
            const strVal = String(value);
            if (strVal.includes('.')) {
                const decimals = strVal.split('.')[1].length;
                setDisplayValue(nextVal.toFixed(decimals));
            } else {
                setDisplayValue(Math.round(nextVal));
            }
        }, 150 + Math.random() * 200);

        return () => clearInterval(interval);
    }, [value]);

    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            className={`flex flex-col items-center justify-center p-3 border border-${color}-500/20 bg-white/5 rounded-xl relative overflow-hidden group shadow-[inset_0_0_10px_rgba(255,255,255,0.02)] hover:shadow-[inset_0_0_20px_rgba(255,255,255,0.05)] transition-all`}
        >
            <motion.div
                className={`absolute bottom-0 left-0 h-1 shadow-[0_0_10px_currentColor]`}
                style={{ backgroundColor: `var(--${color}-500)`, color: `var(--${color}-500)` }}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
            <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-black mb-1.5 group-hover:text-amber-400 transition-colors">{label}</span>
            <div className="flex items-baseline gap-1 relative z-10">
                <span
                    className={`text-xl font-black font-heading tracking-tighter drop-shadow-md`}
                    style={{ color: `var(--${color}-400)` }}
                >
                    {displayValue}
                </span>
                <span className={`text-[9px] font-bold uppercase`} style={{ color: `var(--${color}-500)` }}>{unit}</span>
            </div>
        </motion.div>
    );
};

export default function SurgeMonitorPage() {
    const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useAlerts();
    const router = useRouter();
    const { data: venues, isLoading: venuesLoading } = useVenues();
    const queryClient = useQueryClient();
    const [selectedVenueId, setSelectedVenueId] = useState("");
    const [simulatedTime, setSimulatedTime] = useState<Date>(new Date());
    const [mounted, setMounted] = useState(false);
    const [cameraMetrics, setCameraMetrics] = useState<Record<string, any>>({});
    const [history, setHistory] = useState<any[]>([]);
    const { t } = useTranslation();

    // ── WebSocket Live Feed ──────────────────────────────────────────────────
    // Replaces the old 5s REST polling. All updates are instant via WS push.
    const { connectionState } = useAlertStream({
        onAlert: () => {
            // New alert fired — refresh alerts instantly
            queryClient.invalidateQueries({ queryKey: ["alerts"] });
        },
        onStatusChange: () => {
            // Alert resolved/acknowledged — refresh instantly
            queryClient.invalidateQueries({ queryKey: ["alerts"] });
        },
        onMetricUpdate: (metric) => {
            // Live metric data pushed from backend — update camera panel instantly
            const cameraId = metric.camera_id as string | undefined;
            if (!cameraId) return;

            // Filter by selected venue if one is chosen
            if (selectedVenueId && metric.venue_id !== selectedVenueId) return;

            setCameraMetrics(prev => ({
                ...prev,
                [cameraId]: {
                    ...prev[cameraId],
                    ...metric,
                    // Normalise: backend broadcasts 'count'; REST API returns 'person_count'
                    // Store both so all downstream code works regardless of source
                    person_count: (metric as any).count ?? (metric as any).person_count ?? prev[cameraId]?.person_count ?? 0,
                    entries: (metric as any).entries ?? prev[cameraId]?.entries ?? 0,
                    exits: (metric as any).exits ?? prev[cameraId]?.exits ?? 0,
                    is_online: true,
                }
            }));

            // Build history from live WS data
            setHistory(prev => {
                const now = new Date();
                const timeLabel = now.toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
                const risk = (metric.risk_score as number) || (metric.latest_risk_score as number) || (metric as any).dynamic_risk_score || 0;
                // Prefer `count` (live WS field) then REST fallbacks
                const people = (metric as any).count ?? (metric.person_count as number) ?? (metric.avg_count as number) ?? (metric.occupancy_count as number) ?? 0;
                const p = [...prev, { time: timeLabel, risk, people }];
                return p.length > 20 ? p.slice(p.length - 20) : p;
            });
        },
    });

    const isLive = connectionState === "connected";

    // ── Initial load + fallback polling (60s, only when WS is down) ───────────
    const fetchMetrics = useCallback(async () => {
        try {
            const endpoint = selectedVenueId
                ? `/camera-intelligence/metrics/${selectedVenueId}`
                : `/camera-intelligence/metrics`;
            const res = await api.get(endpoint);
            const data = res.data;
            if (data.cameras) {
                // Normalize: REST response may have `count` instead of `person_count`
                const normalized: Record<string, any> = {};
                Object.entries(data.cameras).forEach(([camId, cam]: [string, any]) => {
                    normalized[camId] = {
                        ...cam,
                        person_count: cam.count ?? cam.person_count ?? cam.occupancy_count ?? 0,
                    };
                });
                setCameraMetrics(normalized);
                const now = new Date();
                const timeLabel = now.toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
                const cams = Object.values(normalized);
                const avgRisk = cams.length ? cams.reduce((acc: number, c: any) => acc + (c.latest_risk_score || 0), 0) / cams.length : 0;
                const totalPeople = cams.reduce((acc: number, c: any) => acc + (c.person_count || 0), 0);
                setHistory(prev => {
                    const p = [...prev, { time: timeLabel, risk: avgRisk, people: totalPeople }];
                    return p.length > 20 ? p.slice(p.length - 20) : p;
                });
            }
        } catch {
            // silently ignore
        }
    }, [selectedVenueId]);

    useEffect(() => {
        let destroyed = false;
        // Always do an initial fetch for immediate data
        fetchMetrics();

        // Fallback poll — only runs at 60s intervals if WS is not live
        const interval = setInterval(() => {
            if (!destroyed && !isLive) fetchMetrics();
        }, 60_000);

        return () => {
            destroyed = true;
            clearInterval(interval);
        };
    }, [selectedVenueId, fetchMetrics, isLive]);

    // Real-time clock
    useEffect(() => {
        setMounted(true);
        const timer = setInterval(() => setSimulatedTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Map live camera metrics to the active surge vectors UI directly, bypassing DB polling
    const surgeAlerts = useMemo(() => {
        return Object.values(cameraMetrics)
            .filter((metric: any) => metric.is_online !== false)
            .map((metric: any) => {
                const kineticRisk = (metric.risk_score as number) || Math.min(100, Math.floor((metric.velocity * 1.5) + (metric.variance * 0.1) + Math.abs(metric.acceleration * 2)));

                return {
                    id: metric.camera_id || "unknown",
                    created_at: metric.timestamp || new Date().toISOString(),
                    venue_id: metric.venue_id,
                    venue: { name: `NODE ${metric.camera_id?.substring(0, 6)}` },
                    extra_data: {
                        velocity: metric.velocity || 0.0,
                        direction_variance: metric.variance || metric.direction_variance || 0.0,
                        acceleration: metric.acceleration || 0.0,
                        recommended_action: kineticRisk > 80 ? "Extreme flow divergence. Neural systems recommend immediate tactical response." : "Abnormal structural kinetics flagged. Keep personnel on standby.",
                    },
                    severity: kineticRisk,
                };
            });
    }, [cameraMetrics]);

    const displayAlerts = selectedVenueId
        ? surgeAlerts.filter((a: any) => a.venue_id === selectedVenueId)
        : surgeAlerts;

    const totalActiveSurges = displayAlerts.length;

    return (
        <div className="min-h-screen bg-transparent text-white pb-12 relative overflow-hidden font-sans" style={{ '--rose-400': '#fb7185', '--rose-500': '#f43f5e', '--emerald-400': '#34d399', '--emerald-500': '#10b981', '--slate-400': '#94a3b8', '--slate-500': '#64748b' } as React.CSSProperties}>
            <WaveBackground />

            {/* Top Navigation / Dashboard Info Strip */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-rose-600 via-rose-400 to-rose-600 z-50 shadow-[0_0_15px_rgba(244,63,94,0.5)]"></div>

            <div className="relative z-10 px-6 pt-8 max-w-7xl mx-auto">
                {/* Header section with Cyberpunk neon aesthetic */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 mt-2">
                    <div className="flex items-start gap-5">
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="group flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/40 rounded-xl transition-all duration-300 flex-shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(244,63,94,0.1)] self-start mt-1"
                            aria-label={t("auto.Goback_9246") || "Go back"}
                        >
                            <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-rose-400 transition-colors group-hover:-translate-x-0.5 transition-transform duration-200" />
                        </button>
                        <div className="relative">
                            <div className="absolute inset-0 bg-rose-500/20 rounded-2xl blur-[20px] animate-pulse"></div>
                            <div className="p-3 bg-rose-950/40 backdrop-blur-md border border-rose-500/40 rounded-2xl relative z-10 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
                                <Radar className="w-8 h-8 text-rose-500 animate-[spin_4s_linear_infinite]" />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-4 mb-2">
                                <h1 className="text-3xl font-black tracking-[0.1em] font-heading uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                                    {t("surge.title") || "Surge Overseer"}
                                </h1>
                                <span className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-[inset_0_0_10px_rgba(244,63,94,0.1)]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
                                    {t("surge.live") || "LIVE FEED"}
                                </span>
                                {/* WebSocket connection status indicator */}
                                <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 border transition-all ${isLive
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
                                    }`}>
                                    {isLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                                    {isLive ? (t("surge.wsLive") || "WS LIVE") : connectionState.toUpperCase()}
                                </span>
                            </div>
                            <p className="text-sm font-bold text-slate-400 tracking-widest uppercase">
                                {t("surge.subtitle") || "Real-time Crowd Anomaly Tracker"}
                            </p>
                            <div className="font-mono text-[10px] text-rose-500 font-bold uppercase mt-2 flex items-center gap-2 tracking-widest bg-rose-500/5 px-2 py-1 rounded border border-rose-500/20 w-fit">
                                <Activity className="w-3 h-3" />
                                <span>SYS_TIME: <span className="text-white ml-1">{mounted ? simulatedTime.toISOString().split('T')[1].split('.')[0] : "--:--:--"}Z</span></span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 glass-panel border-rose-500/20 px-4 py-2 rounded-xl group relative overflow-hidden">
                        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="pl-2 pr-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1.5 drop-shadow-sm">{t("surge.zoneLock") || "Zone Coordinates"}</span>
                            <div className="relative group/select">
                                <select
                                    value={selectedVenueId}
                                    onChange={(e) => setSelectedVenueId(e.target.value)}
                                    className="w-48 bg-transparent text-sm font-mono font-bold tracking-widest uppercase text-white focus:outline-none appearance-none cursor-pointer"
                                >
                                    <option value="" className="bg-black text-white">{t("auto.GLOBALMATRIX_2903") || "GLOBAL.MATRIX"}</option>
                                    {Array.isArray(venues) && venues.map(v => (
                                        <option key={v.id} value={v.id} className="bg-black text-white">ZONE.{v.name.toUpperCase()}</option>
                                    ))}
                                </select>
                                <Crosshair className="w-4 h-4 text-rose-500 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within/select:rotate-90 transition-transform" />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Surge Intelligence & Response Grid */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10"
                >
                    {/* Status Panel */}
                    <div className="glass-panel border-rose-500/20 rounded-3xl p-6 lg:p-8 shadow-[inset_0_0_30px_rgba(244,63,94,0.02)] relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 blur-[80px] rounded-full pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>

                        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                            <div className="flex items-center gap-6 w-full md:w-auto">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${totalActiveSurges > 0 ? "border-rose-500 bg-rose-500/20 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse" : "border-emerald-500 bg-emerald-500/10 text-emerald-400"}`}>
                                    <ShieldAlert className="w-8 h-8 drop-shadow-md" />
                                </div>
                                <div>
                                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{t("surge.gridStatusBase") || "Grid Status Base"}</h2>
                                    <div className="flex items-center gap-3">
                                        <div className={`px-4 py-1.5 rounded-lg border text-sm font-black font-mono tracking-widest ${totalActiveSurges > 0 ? "bg-rose-500/20 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)] border-rose-500/50" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}>
                                            {totalActiveSurges > 0 ? (t("surge.criticalVectors_other", { count: totalActiveSurges }) || `CRITICAL [${totalActiveSurges} VECTORS]`) : (t("surge.nominal") || "NOMINAL")}
                                        </div>
                                        <div className="px-3 py-1.5 rounded-lg font-black text-[10px] tracking-[0.2em] border bg-indigo-500/10 text-indigo-400 border-indigo-500/30 flex items-center gap-2 uppercase">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
                                            {t("surge.autoDispatch") || "AUTO-DISPATCH"}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full md:w-1/2 bg-black/40 p-5 rounded-2xl border border-white/5 space-y-2 relative overflow-hidden shadow-inner">
                                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-rose-600"></div>
                                <p className="text-[11px] text-slate-400 leading-relaxed font-mono uppercase tracking-widest">
                                    <span className="text-white font-bold opacity-30 select-none mr-2">{'>'}</span> {t("surge.neuralFlow") || "Neural flow matrix monitoring dense centroids."}<br />
                                    <span className="text-white font-bold opacity-30 select-none mr-2">{'>'}</span> {t("surge.highVelocity") || "High-velocity divergence triggers surge protocols."}<br />
                                    <span className="text-white font-bold opacity-30 select-none mr-2">{'>'}</span> <span className="text-rose-400 font-bold">{t("surge.realtimeAlerts") || "Real-time alerts broadcast to all security nodes."}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Tactical Response Panel */}
                    <div className="glass-panel border-sky-500/20 rounded-3xl p-6 lg:p-8 shadow-[inset_0_0_30px_rgba(14,165,233,0.02)] relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 blur-[80px] rounded-full pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 w-full">
                            <div className="flex-1 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-sky-400" />
                                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t("surge.deploymentProtocol") || "Deployment Protocol"}</h2>
                                </div>
                                <div>
                                    {/* Dynamically compute staffing from selected venue's staffing_config */}
                                    {(() => {
                                        const selectedVenue = Array.isArray(venues) ? venues.find((v: any) => v.id === selectedVenueId) : null;
                                        const liveMetrics = Object.values(cameraMetrics);
                                        const totalPeople = liveMetrics.reduce((acc: number, c: any) => acc + (c.person_count || c.occupancy_count || 0), 0);
                                        const venueCap = selectedVenue?.capacity || 1;

                                        const critThresh = selectedVenue?.critical_threshold || venueCap * 0.9;
                                        const warnThresh = selectedVenue?.warning_threshold || venueCap * 0.7;

                                        let riskKey = "low";
                                        if (totalPeople >= critThresh) riskKey = "critical";
                                        else if (totalPeople >= warnThresh) riskKey = "high";
                                        else if (totalPeople >= warnThresh * 0.5) riskKey = "medium";

                                        const staffingConfig = selectedVenue?.staffing_config;
                                        let requiredStaff = staffingConfig?.[riskKey];

                                        if (!requiredStaff && totalPeople > 0) {
                                            if (totalPeople >= critThresh) {
                                                requiredStaff = Math.max(5, Math.floor(totalPeople / 40));
                                            } else if (totalPeople >= warnThresh) {
                                                requiredStaff = Math.max(3, Math.floor(totalPeople / 60));
                                            } else {
                                                requiredStaff = Math.max(1, Math.floor(totalPeople / 100));
                                            }
                                        } else if (!requiredStaff) {
                                            requiredStaff = (totalActiveSurges > 0 ? totalActiveSurges * 2 + 3 : null);
                                        }

                                        return (
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="text-2xl font-black text-white tracking-widest">{t("surge.staffReq") || "STAFF_REQ:"}</span>
                                                <span className="text-3xl font-black text-sky-400 drop-shadow-[0_0_10px_rgba(14,165,233,0.4)]">
                                                    {requiredStaff !== null ? requiredStaff : (t("surge.standby") || "STANDBY")}
                                                </span>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${riskKey === "critical" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                                                        riskKey === "high" ? "text-orange-400 border-orange-500/30 bg-orange-500/10" :
                                                            riskKey === "medium" ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                                                                "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                                    }`}>{riskKey.toUpperCase()}</span>
                                            </div>
                                        );
                                    })()}
                                    <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest flex items-center gap-2">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                        {t("surge.staffingConfig") || "Staffing from venue threat-level configuration"}
                                    </p>
                                </div>

                                {/* NEW: Tactical Timeline */}
                                <div className="pt-4 border-t border-white/5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{t("surge.executionPath") || "Execution Path"}</span>
                                        <span className="text-[8px] font-mono text-sky-400">T-0: {mounted ? simulatedTime.toISOString().split('T')[1].split('.')[0] : "--:--:--"}Z</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1 flex flex-col gap-1">
                                            <div className="h-1 bg-sky-500 rounded-full shadow-[0_0_8px_rgba(14,165,233,0.4)]" />
                                            <span className="text-[7px] font-black text-white uppercase tracking-tighter">{t("surge.nowDeploy") || "NOW: Deploy"}</span>
                                        </div>
                                        <div className="flex-1 flex flex-col gap-1 opacity-40">
                                            <div className="h-1 bg-white/10 rounded-full" />
                                            <span className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter">{t("surge.t2Pivot") || "T+2M: Pivot"}</span>
                                        </div>
                                        <div className="flex-1 flex flex-col gap-1 opacity-20">
                                            <div className="h-1 bg-white/10 rounded-full" />
                                            <span className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter">{t("surge.t5Secure") || "T+5M: Secure"}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="h-32 w-[1px] bg-white/10 hidden md:block" />
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center justify-between text-[11px] font-mono">
                                    <span className="text-slate-500">{t("surge.zoneDensity") || "ZONE_DENSITY"}</span>
                                    {history.length > 0 ? (
                                        <span className="text-sky-400 font-bold">{(history[history.length - 1].people / 100).toFixed(2)}/mÂ²</span>
                                    ) : (
                                        <span className="text-sky-400 font-bold">0.00/mÂ²</span>
                                    )}
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${history.length > 0 ? Math.min(100, history[history.length - 1].people) : 0}%` }} className="h-full bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.6)]" />
                                </div>
                                <div className="flex items-center justify-between text-[11px] font-mono">
                                    <span className="text-slate-500">{t("surge.riskProbability") || "RISK_PROBABILITY"}</span>
                                    {history.length > 0 ? (
                                        <span className="text-rose-400 font-bold">{Math.round(history[history.length - 1].risk)}%</span>
                                    ) : (
                                        <span className="text-rose-400 font-bold">0%</span>
                                    )}
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${history.length > 0 ? Math.min(100, Math.round(history[history.length - 1].risk)) : 0}%` }} className="h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]" />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-rose-500/20 pb-4">
                        <h3 className="text-lg font-black flex items-center gap-3 text-white uppercase tracking-[0.15em] drop-shadow-md">
                            <Zap className="w-5 h-5 text-rose-500" /> {t("surge.activeSurgeVectors") || "Active Surge Vectors"}
                        </h3>
                    </div>

                    {Object.keys(cameraMetrics).length === 0 && !isLive ? (
                        <div className="w-full h-48 flex flex-col items-center justify-center glass-panel border border-white/5 rounded-3xl relative overflow-hidden group">
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(244,63,94,0.15)_0%,transparent_50%)] animate-pulse" style={{ animationDuration: '3s' }}></div>
                            <div className="relative p-6 bg-rose-950/40 backdrop-blur-md border border-rose-500/30 rounded-2xl shadow-[0_0_30px_rgba(244,63,94,0.15)] mb-4 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/10 before:to-transparent before:pointer-events-none before:rounded-2xl flex items-center justify-center">
                                <Radar className="w-12 h-12 text-rose-400 animate-[spin_3s_linear_infinite]" />
                            </div>
                            <span className="text-rose-400 font-black text-[10px] tracking-[0.2em] uppercase animate-pulse drop-shadow-md">{t("surge.initializingFlowMatrix") || "Initializing Flow Matrix..."}</span>
                        </div>
                    ) : displayAlerts.length === 0 ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                            <div className="w-full h-32 flex items-center justify-between px-8 border border-emerald-500/30 rounded-3xl glass-panel relative overflow-hidden group shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(16,185,129,0.1)_0%,transparent_100%)] pointer-events-none group-hover:scale-110 transition-transform duration-1000"></div>
                                <div className="flex items-center gap-6 relative z-10">
                                    <div className="p-4 bg-emerald-950/50 border border-emerald-500/30 rounded-2xl shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                        <Activity className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <div>
                                        <h4 className="text-emerald-400 font-black uppercase tracking-widest mb-1 text-lg drop-shadow-md">{t("surge.zeroAbnormal") || "Zero Abnormal Velocity Detected"}</h4>
                                        <p className="text-[10px] text-emerald-500/80 font-mono tracking-widest uppercase font-bold">{t("surge.continuousOptical") || "Continuous optical flow monitoring is active across all configured matrices."}</p>
                                    </div>
                                </div>
                                <div className="text-right relative z-10 glass-card px-4 py-2 border-emerald-500/20">
                                    <div className="text-[9px] text-slate-500 uppercase tracking-[0.2em] font-black mb-1">{t("surge.opticalFlowBaseline") || "Optical Flow Baseline"}</div>
                                    <div className="text-2xl font-mono text-emerald-400 font-bold drop-shadow-sm">{t("surge.liveUpper") || "LIVE"}</div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            layout
                            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                        >
                            <AnimatePresence>
                                {displayAlerts.map((alert: any, i: number) => {
                                    const v = alert.extra_data?.velocity?.toFixed(1) || "0.0";
                                    const d = alert.extra_data?.direction_variance?.toFixed(2) || "0.00";
                                    const a = alert.extra_data?.acceleration?.toFixed(2) || "0.00";
                                    const percentV = Math.min(100, (Number(v) / 30) * 100);

                                    return (
                                        <motion.div
                                            key={alert.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.9, x: -20 }}
                                            whileHover={{ y: -5 }}
                                            className="relative group glass-panel border border-rose-500/30 rounded-3xl overflow-hidden hover:border-rose-400 transition-all duration-400 shadow-[inset_0_0_20px_rgba(244,63,94,0.02)] hover:shadow-[0_15px_40px_rgba(244,63,94,0.15)] flex flex-col justify-between"
                                        >
                                            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-rose-500 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500"></div>

                                            <div className="absolute -top-10 -right-10 w-32 h-32 blur-[40px] opacity-10 bg-rose-500 group-hover:opacity-20 transition-opacity duration-700 pointer-events-none z-0"></div>

                                            <div className="relative z-10 p-6 flex flex-col h-full">
                                                <div className="flex flex-col mb-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <motion.div
                                                            animate={{ opacity: [1, 0.7, 1] }}
                                                            transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                                                            className="px-2.5 py-1 rounded bg-rose-500/20 text-[9px] font-black text-rose-400 uppercase tracking-[0.2em] shadow-[0_0_10px_rgba(244,63,94,0.3)] border border-rose-500/40"
                                                        >
                                                            CRITICAL_SURGE
                                                        </motion.div>
                                                        <span className="text-[9px] text-slate-500 font-mono font-bold tracking-widest uppercase bg-white/5 border border-white/5 px-2 py-1 rounded-lg">
                                                            {t("surge.vTrack") || "V_TRACK:"} <span className="text-white">{alert.id.substring(0, 8)}</span>
                                                        </span>
                                                    </div>
                                                    <h4 className="text-xl font-black text-white tracking-widest uppercase drop-shadow-md">{alert.venue?.name || "GRID_SECTOR_NULL"}</h4>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shadow-[0_0_8px_rgba(244,63,94,1)]" />
                                                        <span className="text-[10px] text-rose-400 font-mono uppercase font-bold tracking-widest">
                                                            {t("surge.recorded") || "Recorded"} <span className="text-white ml-1">{new Date(alert.created_at).toLocaleTimeString('en-US', { hour12: false })}</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-3 mb-5">
                                                    <MetricGauge label={t("surge.velocity") || "Velocity"} value={v} unit="px/s" percent={percentV} />
                                                    <MetricGauge label={t("surge.variance") || "Variance"} value={d} unit="rad" percent={Math.min(100, Number(d) * 100)} />
                                                    <MetricGauge label={t("surge.accel") || "Accel"} value={a} unit="px/sÂ²" percent={Math.min(100, Number(a) * 15)} />
                                                </div>

                                                <div className="p-4 bg-black/60 border border-white/5 rounded-xl relative overflow-hidden group-hover:border-rose-500/30 transition-all shadow-inner mt-auto">
                                                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                                                    <p className="text-[11px] text-slate-400 font-mono leading-relaxed pl-2 line-clamp-2">
                                                        <span className="text-rose-400 font-bold opacity-80 mr-1">ACTION:</span>{alert.extra_data?.recommended_action || (t("surge.divergentCrowdDetected", "Divergent crowd flow detected. Neural models suggest immediate tactical intervention."))}
                                                    </p>
                                                </div>

                                                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 relative z-10">
                                                    <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 group-hover:bg-rose-500/5 group-hover:border-rose-500/20 transition-colors">
                                                        <Gauge className="w-4 h-4 text-rose-500" />
                                                        <span className="text-[10px] font-mono font-black text-rose-400 uppercase tracking-widest">{t("surge.index") || "INDEX:"} <span className="text-white text-sm tracking-normal ml-1">{alert.severity}</span></span>
                                                    </div>
                                                    <motion.button
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        className="text-[10px] font-black text-black uppercase tracking-widest bg-rose-500 hover:bg-rose-400 px-5 py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(244,63,94,0.4)] flex items-center gap-2 group/btn"
                                                    >
                                                        {t("surge.engageUpper") || "ENGAGE"} <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                                    </motion.button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </AnimatePresence>
                        </motion.div>
                    )}

                    {/* Advanced Live Graphing Display */}
                    {history.length > 0 && displayAlerts.length === 0 && (
                        <div className="w-full h-48 border border-slate-800 rounded-3xl overflow-hidden glass-panel relative group shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] mb-8">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.6} />
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" hide />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(5,5,5,0.85)', borderColor: 'rgba(255,255,255,0.1)', fontSize: '11px', borderRadius: '12px', backdropFilter: 'blur(12px)', textTransform: 'uppercase', fontWeight: 900 }}
                                        itemStyle={{ color: '#f8fafc', fontWeight: 900, fontFamily: 'var(--font-heading)' }}
                                        labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                                    />
                                    <Area type="monotone" dataKey="risk" stroke="#f43f5e" fillOpacity={1} fill="url(#colorRisk)" strokeWidth={3} isAnimationActive={false} activeDot={{ r: 6, fill: '#f43f5e', stroke: '#000', strokeWidth: 2 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                            <div className="absolute top-5 left-6 text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                                {t("surge.liveMatrixRisk") || "Live Matrix Risk Average"}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        <AnimatePresence mode="popLayout">
                            {Object.entries(cameraMetrics).length > 0 ? (
                                Object.entries(cameraMetrics).map(([camId, metric]: [string, any], idx) => {
                                    const isOnline = metric.is_online !== false;
                                    const statusColor = isOnline ? "emerald" : "rose";
                                    const statusLabel = isOnline ? "LIVE FEED" : "OFFLINE";
                                    const healthStatus = metric.health_status || "unknown";

                                    return (
                                        <motion.div
                                            key={camId}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: idx * 0.1 }}
                                            className={`relative glass-panel rounded-3xl p-6 overflow-hidden transition-colors shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] group flex flex-col justify-between ${isOnline ? "hover:border-emerald-500/40 hover:shadow-[0_15px_40px_rgba(16,185,129,0.1)]" : "border-rose-500/20 opacity-80"
                                                }`}
                                        >
                                            <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-${statusColor}-500/50 to-transparent opacity-50 group-hover:opacity-100 transition-opacity`}></div>
                                            <div className="flex flex-col mb-5 relative z-10">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black bg-${statusColor}-500/10 text-${statusColor}-400 border border-${statusColor}-500/30 uppercase tracking-[0.2em] flex items-center gap-1.5 shadow-[inset_0_0_10px_rgba(16,185,129,0.1)]`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full bg-${statusColor}-400 ${isOnline ? "animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" : ""}`}></span>
                                                        {statusLabel}
                                                    </div>
                                                    <span className="text-[9px] text-slate-500 font-mono tracking-widest uppercase font-bold bg-white/5 border border-white/5 px-2 py-1 rounded-lg">
                                                        ID: <span className="text-white">{camId.substring(0, 8)}</span>
                                                    </span>
                                                </div>
                                                <h4 className="text-2xl font-black text-white tracking-widest mt-1 truncate uppercase drop-shadow-md">{metric.camera_name || `CAM_${camId.substring(0, 4)}`}</h4>
                                                {!isOnline && (
                                                    <div className="flex items-center gap-1.5 mt-2">
                                                        <AlertTriangle className="w-3 h-3 text-rose-500" />
                                                        <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">{healthStatus.replace('_', ' ')}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className={`grid grid-cols-2 gap-3 relative z-10 mb-3 ${!isOnline ? "grayscale opacity-[0.4]" : ""}`}>
                                                <MetricGauge
                                                    label={t("auto.People_9483") || "People"}
                                                    value={isOnline ? (metric.person_count || 0) : "—"}
                                                    unit="live"
                                                    percent={isOnline ? Math.min(100, (metric.person_count || 0) * 5) : 0}
                                                    color={statusColor}
                                                />
                                                <MetricGauge
                                                    label={t("surge.velocity") || "Velocity"}
                                                    value={isOnline ? (metric.velocity || 0).toFixed(1) : "—"}
                                                    unit="px/s"
                                                    percent={isOnline ? Math.min(100, ((metric.velocity || 0) / 40) * 100) : 0}
                                                    color={statusColor}
                                                />
                                                <MetricGauge
                                                    label={t("alerts.riskLevel") || "Risk"}
                                                    value={isOnline ? Math.min(100, Math.floor(((metric.velocity || 0) * 1.5) + ((metric.variance || 0) * 0.1))).toString() : "OFF"}
                                                    unit="idx"
                                                    percent={isOnline ? Math.min(100, Math.floor(((metric.velocity || 0) * 1.5) + ((metric.variance || 0) * 0.1))) : 0}
                                                    color={((metric.velocity || 0) > 15 || (metric.variance || 0) > 200) ? "rose" : statusColor}
                                                />
                                                <MetricGauge
                                                    label={t("surge.variance") || "Variance"}
                                                    value={isOnline ? (metric.variance || 0).toFixed(1) : "—"}
                                                    unit="rad"
                                                    percent={isOnline ? Math.min(100, (metric.variance || 0) / 4) : 0}
                                                    color={statusColor}
                                                />
                                            </div>
                                            {/* Entry / Exit live counters */}
                                            {isOnline && (
                                                <div className="flex items-center gap-3 relative z-10 mt-1 border-t border-white/5 pt-3">
                                                    <div className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl py-1.5 px-2">
                                                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">↓ {t("surge.in") || "IN"}</span>
                                                        <span className="text-sm font-black font-mono text-emerald-400">{metric.entries ?? 0}</span>
                                                    </div>
                                                    <div className="flex-1 flex items-center justify-center gap-1.5 bg-rose-500/5 border border-rose-500/20 rounded-xl py-1.5 px-2">
                                                        <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest">↑ {t("surge.out") || "OUT"}</span>
                                                        <span className="text-sm font-black font-mono text-rose-400">{metric.exits ?? 0}</span>
                                                    </div>
                                                    <div className="flex-1 flex items-center justify-center gap-1.5 bg-sky-500/5 border border-sky-500/20 rounded-xl py-1.5 px-2">
                                                        <span className="text-[8px] font-black text-sky-500 uppercase tracking-widest">{t("surge.net") || "NET"}</span>
                                                        <span className={`text-sm font-black font-mono ${((metric.entries ?? 0) - (metric.exits ?? 0)) >= 0 ? "text-sky-400" : "text-amber-400"}`}>
                                                            {(metric.entries ?? 0) - (metric.exits ?? 0)}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="col-span-full py-16 flex flex-col items-center justify-center glass-panel border border-dashed border-white/10 rounded-3xl"
                                >
                                    <Radar className="w-12 h-12 mb-5 opacity-20 text-slate-500" />
                                    <h4 className="text-sm font-black uppercase tracking-[0.2em] mb-2 text-white">{t("surge.awaitingSensorMatrix") || "Awaiting Sensor Matrix"}</h4>
                                    <p className="text-xs font-mono opacity-50 text-slate-400">{t("surge.noLiveCamera") || "No live camera metrics detected for the selected zone."}</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                </div>
            </div>
        </div>
    );
}

