"""
Laminar - Explainable AI (XAI) Service
----------------------------------------
Produces structured natural-language explanations for every risk decision.

No new packages required — purely rule-based Python logic operating on
the existing RiskEngineService decision dict.

Architecture Position:
  RiskEngineService.evaluate_metric() → XAIService.explain(decision) → explanation dict

Returns:
  {
    "summary": "HIGH RISK during peak hours — sustained crowd growth",
    "factors": [
      {"label": "Crowd count", "value": "142 people", "impact": "+3.2"},
      {"label": "Peak hour multiplier", "value": "1.3×", "impact": "+1.8"},
      {"label": "Rapid growth rate", "value": "+18%/min", "impact": "+2.0"},
      {"label": "Prior alerts today", "value": "3", "impact": "+1.5"},
    ],
    "risk_drivers": ["Overcrowding risk", "Peak hour pressure"],
    "mitigating_factors": ["No panic events detected"],
    "confidence": "high"
  }
"""

from typing import Dict, Any, List, Optional
from app.core.logging import get_logger

logger = get_logger(__name__)


class XAIService:
    """
    Rule-based Explainable AI engine for Laminar risk decisions.
    Converts numeric decision fields into human-readable factor breakdowns.
    Pure Python — no ML dependencies.
    """

    # ── Impact thresholds ─────────────────────────────────────────────────────

    RISK_COLORS = {
        "low": "🟢",
        "medium": "🟡",
        "high": "🟠",
        "critical": "🔴",
        "unknown": "⚪",
    }

    def explain(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        """
        Produce an XAI explanation from a RiskEngineService decision dict.

        Args:
            decision: Output of RiskEngineService.evaluate_metric()

        Returns:
            explanation dict with factors, summary, drivers, mitigators
        """
        try:
            factors = []
            risk_drivers = []
            mitigating_factors = []
            confidence = "high"

            risk_level = decision.get("current_level", "unknown")
            severity = decision.get("severity", 0)
            trend = decision.get("trend", "stable")
            time_factor = decision.get("time_factor", 1.0)
            occupancy_pct = decision.get("occupancy_percent") or 0
            growth_rate = decision.get("growth_rate") or 0
            risk_score = decision.get("risk_score") or 0
            predicted_level = decision.get("predicted_level")
            escalation_prob = decision.get("escalation_probability", 0)
            early_warning = decision.get("early_warning_triggered", False)
            transition = decision.get("transition", "stable")

            # ── Factor 1: Crowd count / Occupancy ────────────────────────────
            occ_impact = round(min(occupancy_pct / 10, 5.0), 1)
            if occupancy_pct > 0:
                factors.append({
                    "label": "Current occupancy",
                    "value": f"{occupancy_pct:.1f}% of capacity",
                    "impact": f"+{occ_impact}" if risk_level not in ["low"] else f"+{occ_impact}",
                    "category": "occupancy",
                })
                if occupancy_pct >= 85:
                    risk_drivers.append("Venue near or over capacity")
                elif occupancy_pct >= 60:
                    risk_drivers.append("Occupancy approaching warning level")

            # ── Factor 2: Growth rate ─────────────────────────────────────────
            if growth_rate and abs(growth_rate) > 1:
                growth_impact = round(min(abs(growth_rate) / 5, 2.0), 1)
                direction = "+" if growth_rate > 0 else "-"
                factors.append({
                    "label": "Crowd growth rate",
                    "value": f"{direction}{abs(growth_rate):.1f}%/min",
                    "impact": f"+{growth_impact}" if growth_rate > 0 else f"-{growth_impact}",
                    "category": "dynamics",
                })
                if growth_rate > 10:
                    risk_drivers.append("Rapid crowd influx detected")
                elif growth_rate < -5:
                    mitigating_factors.append("Crowd dispersing quickly")

            # ── Factor 3: Time-of-day factor ──────────────────────────────────
            if time_factor != 1.0:
                time_impact = round(abs(time_factor - 1.0) * 3, 1)
                if time_factor > 1.0:
                    factors.append({
                        "label": "Peak hour multiplier",
                        "value": f"{time_factor:.1f}×",
                        "impact": f"+{time_impact}",
                        "category": "temporal",
                    })
                    risk_drivers.append("Peak hours increase crowd pressure")
                else:
                    factors.append({
                        "label": "Off-peak reduction",
                        "value": f"{time_factor:.1f}×",
                        "impact": f"-{time_impact}",
                        "category": "temporal",
                    })
                    mitigating_factors.append("Off-peak hours reduce risk")

            # ── Factor 4: Trend ───────────────────────────────────────────────
            trend_impacts = {
                "rapidly_increasing": ("+2.0", "Rapid escalation trend"),
                "increasing": ("+1.0", "Upward crowd trend"),
                "stable": ("+0.0", None),
                "decreasing": ("-0.5", None),
                "rapidly_decreasing": ("-1.5", None),
            }
            trend_impact, trend_driver = trend_impacts.get(trend, ("+0.0", None))
            if trend != "stable":
                factors.append({
                    "label": "Risk trend",
                    "value": trend.replace("_", " ").title(),
                    "impact": trend_impact,
                    "category": "dynamics",
                })
            if trend_driver:
                risk_drivers.append(trend_driver)
            if trend in ["decreasing", "rapidly_decreasing"]:
                mitigating_factors.append("Situation de-escalating")

            # ── Factor 5: Predictive signal ───────────────────────────────────
            if predicted_level and escalation_prob > 0.4:
                pred_impact = round(escalation_prob * 2, 1)
                factors.append({
                    "label": "AI escalation forecast",
                    "value": f"{predicted_level.upper()} predicted ({escalation_prob*100:.0f}% confidence)",
                    "impact": f"+{pred_impact}",
                    "category": "predictive",
                })
                if early_warning:
                    risk_drivers.append(f"AI predicts escalation to {predicted_level} level")

            # ── Factor 6: Transition state ────────────────────────────────────
            if transition == "escalated":
                factors.append({
                    "label": "State transition",
                    "value": f"Escalated from {decision.get('previous_level', 'lower')} level",
                    "impact": "+1.5",
                    "category": "state",
                })
                risk_drivers.append("Risk level has escalated from previous state")
            elif transition == "deescalated":
                mitigating_factors.append("Risk level has decreased from previous state")

            # ── Severity ────────────────────────────────────────────────────
            if severity:
                factors.append({
                    "label": "Overall severity",
                    "value": f"{severity}/10",
                    "impact": f"+{severity:.0f}",
                    "category": "composite",
                })

            # ── Generate summary ───────────────────────────────────────────
            icon = self.RISK_COLORS.get(risk_level, "⚪")
            summary = self._build_summary(
                icon, risk_level, trend, time_factor, early_warning, escalation_prob
            )

            # If no factors computed (edge case)
            if not factors:
                factors.append({
                    "label": "Risk assessment",
                    "value": f"{risk_level.upper()} based on system evaluation",
                    "impact": "+0.0",
                    "category": "composite",
                })
                confidence = "low"

            return {
                "summary": summary,
                "factors": factors,
                "risk_drivers": risk_drivers or ["Standard crowd conditions"],
                "mitigating_factors": mitigating_factors or ["No significant mitigating factors"],
                "confidence": confidence,
                "risk_level": risk_level,
                "severity": severity,
            }

        except Exception as e:
            logger.error(f"XAIService.explain failed: {e}")
            return {
                "summary": "Explanation unavailable",
                "factors": [],
                "risk_drivers": [],
                "mitigating_factors": [],
                "confidence": "error",
            }

    def _build_summary(
        self,
        icon: str,
        risk_level: str,
        trend: str,
        time_factor: float,
        early_warning: bool,
        escalation_prob: float,
    ) -> str:
        parts = [f"{icon} {risk_level.upper()} RISK"]

        if early_warning:
            parts.append("⚠️ AI early warning active")

        if trend == "rapidly_increasing":
            parts.append("rapidly escalating crowd")
        elif trend == "increasing":
            parts.append("growing crowd trend")
        elif trend == "rapidly_decreasing":
            parts.append("crowd dispersing quickly")

        if time_factor > 1.2:
            parts.append("during peak hours")
        elif time_factor < 0.8:
            parts.append("during off-peak hours")

        if escalation_prob >= 0.7:
            parts.append(f"— {escalation_prob*100:.0f}% escalation probability")

        return " — ".join(parts[:3])  # Keep summary concise
