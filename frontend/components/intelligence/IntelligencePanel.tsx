"use client";

/**
 * IntelligencePanel - Laminar AI Intelligence Engine Component
 * 
 * Displays a structured operational intelligence report for a venue.
 * Powered by Randy AI with real-time crowd intelligence.
 * 
 * Shows:
 *  - Situation Analysis
 *  - Observed Trends (multi-camera correlation)
 *  - Risk Assessment
 *  - Predicted Outcome
 *  - Recommended Actions
 */

import { useVenueIntelligence } from "@/hooks/useIntelligence";
import {
  Brain,
  AlertTriangle,
  TrendingUp,
  Target,
  ShieldCheck,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  venueId: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-rose-500/10 border-rose-500/30 text-rose-400",
  high: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  medium: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  low: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-rose-500 animate-pulse",
  high: "bg-orange-500 animate-pulse",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

export default function IntelligencePanel({ venueId }: Props) {
  const { t } = useTranslation();

  const { data, isLoading, isFetching, refetch } = useVenueIntelligence(venueId);
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-gradient-to-br from-[#0a0f1e]/90 to-[#0d1a35]/90 backdrop-blur-xl border border-violet-500/30 rounded-xl overflow-hidden relative group hover:border-violet-400/50 transition-colors">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-violet-500/15 transition-colors" />

      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 rounded-lg border border-violet-500/20">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              {t("auto.LaminarAIIntell_5039") || "Laminar AI Intelligence Engine"}
            </h3>
            <p className="text-[10px] text-violet-400/70 font-mono uppercase tracking-widest">
              {data?.generated_by || "Initializing..."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isLoading && (
            <RefreshCw className="w-3.5 h-3.5 text-violet-400 animate-spin" />
          )}
          {data && (
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${SEVERITY_STYLES[data.severity] || SEVERITY_STYLES.low}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[data.severity] || SEVERITY_DOT.low}`} />
              {data.severity}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Collapsible Body */}
      {expanded && (
        <div className="px-4 pb-5 space-y-4 relative z-10">
          {isLoading ? (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Brain className="w-5 h-5 text-violet-400 animate-pulse" />
              <span className="text-sm text-slate-400 font-mono">{t("auto.Analyzingsurvei_8782") || "Analyzing surveillance intelligence..."}</span>
            </div>
          ) : data ? (
            <>
              {/* Situation Analysis */}
              <Section
                icon={<Target className="w-4 h-4 text-cyan-400" />}
                label={t("auto.SituationAnalys_8851") || "Situation Analysis"}
                content={data.situation_analysis}
                borderColor="border-cyan-500/20"
              />

              {/* Observed Trends */}
              <Section
                icon={<TrendingUp className="w-4 h-4 text-indigo-400" />}
                label={t("auto.ObservedTrends_1082") || "Observed Trends"}
                content={data.observed_trends}
                borderColor="border-indigo-500/20"
              />

              {/* Risk Assessment */}
              <Section
                icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
                label={`Risk Assessment [${data.severity.toUpperCase()}]`}
                content={data.risk_assessment}
                borderColor="border-amber-500/20"
              />

              {/* Predicted Outcome */}
              <Section
                icon={<Zap className="w-4 h-4 text-fuchsia-400" />}
                label={t("auto.PredictedOutcom_2041") || "Predicted Outcome"}
                content={data.predicted_outcome}
                borderColor="border-fuchsia-500/20"
              />

              {/* Recommended Actions */}
              <div className="bg-black/30 rounded-lg border border-emerald-500/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                    {t("auto.RecommendedActi_6227") || "Recommended Actions"}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {data.recommended_actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[9px] shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Cross-Camera Insights */}
              {data.cross_camera_insights && (
                <div className="bg-black/30 rounded-lg border border-slate-700/50 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Brain className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {t("auto.MultiCameraCorr_113") || "Multi-Camera Correlation"}
                    </span>
                  </div>
                  <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
                    {data.cross_camera_insights}
                  </pre>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 text-[9px] text-slate-600 font-mono">
                <span>Confidence: {data.confidence.toUpperCase()}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); refetch(); }}
                  className="flex items-center gap-1 hover:text-violet-400 transition-colors"
                >
                  <RefreshCw className="w-2.5 h-2.5" /> Refresh ({data.timestamp})
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500 text-center py-4">
              {t("auto.Nointelligenced_1500") || "No intelligence data available. Check system connectivity."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function Section({
  icon,
  label,
  content,
  borderColor,
}: {
  icon: React.ReactNode;
  label: string;
  content: string;
  borderColor: string;
}) {
  return (
    <div className={`bg-black/30 rounded-lg border ${borderColor} p-3`}>
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </span>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">{content}</p>
    </div>
  );
}
