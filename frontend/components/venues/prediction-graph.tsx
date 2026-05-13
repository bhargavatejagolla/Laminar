"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { usePredictionGraph } from "@/hooks/usePredictionGraph";
import { Loader2, TrendingUp, AlertTriangle, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

interface Props {
  venueId: string;
}

// Custom tooltip for the graph
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-lg p-3 shadow-2xl text-xs font-mono">
      <p className="text-slate-400 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-300">{entry.name}:</span>
          <span className="font-bold" style={{ color: entry.color }}>
            {typeof entry.value === "number" ? entry.value.toFixed(1) : entry.value}
            {entry.name.includes("Prob") ? "%" : entry.name.includes("Risk") ? "" : ""}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function PredictionGraph({ venueId }: Props) {
  const { t } = useTranslation();

  const { data, isLoading, error } = usePredictionGraph(venueId);

  // Merge historical + forecast into one unified chart dataset
  const chartData = useMemo(() => {
    if (!data) return [];

    const points: Record<string, any>[] = [];

    // Historical data points
    const hist = data.historical;
    if (hist?.timestamps?.length) {
      hist.timestamps.forEach((ts: string, i: number) => {
        points.push({
          time: format(parseISO(ts), "HH:mm"),
          riskScore: hist.risk_scores?.[i] ?? null,
          crowdCount: hist.crowd_counts?.[i] ?? null,
          occupancy: hist.occupancy_percents?.[i] ?? null,
          _type: "historical",
        });
      });
    }

    // Forecast data points
    const fc = data.forecast;
    if (fc?.timestamps?.length) {
      fc.timestamps.forEach((ts: string, i: number) => {
        points.push({
          time: format(parseISO(ts), "HH:mm"),
          forecastRisk: fc.predicted_scores?.[i] ?? null,
          upperBand: fc.upper_band?.[i] ?? null,
          lowerBand: fc.lower_band?.[i] ?? null,
          escalationProb: fc.escalation_probs?.[i] != null
            ? +(fc.escalation_probs[i] * 100).toFixed(1)
            : null,
          _type: "forecast",
        });
      });
    }

    return points;
  }, [data]);

  // Separate escalation-only curve for the bottom chart
  const escalationData = useMemo(() => {
    if (!data?.escalation?.timestamps?.length) return [];
    return data.escalation.timestamps.map((ts: string, i: number) => ({
      time: format(parseISO(ts), "HH:mm"),
      probability: +(data.escalation.probabilities[i] * 100).toFixed(1),
    }));
  }, [data]);

  const isHistoricalEmpty = !data?.historical?.timestamps?.length;

  if (isLoading) {
    return (
      <div className="h-[360px] w-full flex flex-col items-center justify-center bg-[#0f172a]/50 border border-slate-800 rounded-xl relative overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-pulse" />
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-400 tracking-wider">{t("auto.CALCULATINGFORE_6279") || "CALCULATING FORECAST MODEL..."}</p>
      </div>
    );
  }

  if (error || isHistoricalEmpty) {
    return (
      <div className="h-[360px] w-full flex flex-col items-center justify-center bg-[#0f172a]/30 border border-slate-800/50 rounded-xl border-dashed gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm text-slate-400 text-center max-w-xs">
          {t("auto.Waitingforfirst_3440") || "Waiting for first crowd detection frame to build prediction model."}
        </p>
        <p className="text-xs text-slate-600 font-mono">
          {t("auto.Livedatawillapp_301") || "Live data will appear automatically once the camera detects activity."}
        </p>
      </div>
    );
  }

  const confidence = data?.meta?.confidence ?? 0;
  const peak = data?.meta?.predictive_peak ?? 0;
  const historicalCount = data?.meta?.historical_count ?? 0;

  return (
    <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-xl p-5 hover:border-cyan-500/30 transition-all duration-300 shadow-inner space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-semibold tracking-wide text-white">{t("auto.RiskEscalationF_5530") || "Risk & Escalation Forecast"}</h3>
          <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded-full font-mono">
            {t("auto.LIVE_4994") || "LIVE"}
          </span>
        </div>
        <div className="text-xs font-mono text-slate-500 bg-slate-900 border border-slate-800 px-3 py-1 rounded">
          {data?.generated_at ? format(parseISO(data.generated_at), "HH:mm:ss") : "—"}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2.5 text-center">
          <p className="text-xs text-slate-500 mb-1">{t("auto.AIConfidence_1843") || "AI Confidence"}</p>
          <p className="text-sm font-bold font-mono text-cyan-400">{(confidence * 100).toFixed(0)}%</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2.5 text-center">
          <p className="text-xs text-slate-500 mb-1">{t("auto.PeakForecast_698") || "Peak Forecast"}</p>
          <p className="text-sm font-bold font-mono text-amber-400">{peak.toFixed(1)}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2.5 text-center">
          <p className="text-xs text-slate-500 mb-1">{t("auto.DataPoints_6870") || "Data Points"}</p>
          <p className="text-sm font-bold font-mono text-emerald-400">{historicalCount}</p>
        </div>
      </div>

      {/* Main Risk + Forecast Chart */}
      <div>
        <p className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wider">{t("auto.RiskScoreOverTi_3290") || "Risk Score Over Time"}</p>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#475569", fontSize: 10 }}
                dy={8}
                interval="preserveStartEnd"
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              {/* Reference line between historical and forecast */}
              <Area
                type="monotone"
                dataKey="riskScore"
                name="Historical Risk"
                stroke="#22d3ee"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#histGrad)"
                dot={false}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="forecastRisk"
                name="Forecast Risk"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="5 3"
                fillOpacity={1}
                fill="url(#fcGrad)"
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="upperBand"
                name="Max Forecast"
                stroke="#f43f5e"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                connectNulls={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="lowerBand"
                name="Min Forecast"
                stroke="#10b981"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                connectNulls={false}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Escalation Probability Chart */}
      {escalationData.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Escalation Probability (Next {data?.meta?.horizon_minutes ?? 15} min)</p>
          </div>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={escalationData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="escalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  dy={8}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />
                <Area
                  type="monotone"
                  dataKey="probability"
                  name="Escalation Prob"
                  stroke="#f43f5e"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#escalGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: "#f43f5e" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center gap-4 flex-wrap text-xs font-medium text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 bg-cyan-400 rounded" />
          {t("auto.Historical_982") || "Historical"}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 border-t-2 border-dashed border-amber-400" />
          {t("auto.Forecast_1217") || "Forecast"}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 bg-rose-400 rounded" />
          {t("auto.EscalationProb_2758") || "Escalation Prob"}
        </div>
        <div className="ml-auto text-xs text-slate-600 font-mono">
          Model: {data?.meta?.model_used?.toUpperCase() ?? "—"}
        </div>
      </div>
    </div>
  );
}
