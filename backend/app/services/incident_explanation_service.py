from typing import Dict, Any, List
from datetime import datetime, timezone
import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)


class IncidentExplanationService:
    """
    Generates human-readable explanations for crowd predictions.

    Designed for:
    - Authorities
    - Security teams
    - Management dashboards
    """

    async def generate_explanation(
        self,
        predicted_level: str,
        predicted_score: float,
        escalation_probability: float,
        slope: float,
        holiday_context: Dict[str, Any] | None,
        weather_context: Dict[str, Any] | None,
        event_type: str | None,
        warning_threshold: float = 50.0,
        critical_threshold: float = 80.0,
    ) -> Dict[str, Any]:

        explanations: List[str] = []
        recommendations: List[str] = []

        # ------------------------------------------------------
        # Trend explanation (Relative to warning threshold)
        # ------------------------------------------------------
        # 5% of warning threshold per minute is "strong"
        # 1% of warning threshold per minute is "moderate"
        strong_slope = warning_threshold * 0.05
        moderate_slope = warning_threshold * 0.01

        if slope > strong_slope:
            explanations.append("Crowd levels are increasing rapidly.")
        elif slope > moderate_slope:
            explanations.append("Crowd levels show a moderate upward trend.")
        elif slope < -strong_slope:
            explanations.append("Crowd levels are decreasing quickly.")
        elif slope < -moderate_slope:
            explanations.append("Crowd levels show a mild downward trend.")
        else:
            explanations.append("Crowd levels appear stable.")

        # ------------------------------------------------------
        # Risk explanation
        # ------------------------------------------------------

        if predicted_level == "critical":
            explanations.append(
                f"Critical occupancy predicted (exceeding {int(critical_threshold)} limit). Immediate intervention required."
            )
            recommendations.append("Deploy emergency crowd control personnel.")

        elif predicted_level == "high":
            explanations.append(
                f"High crowd density predicted near {int(warning_threshold)} threshold."
            )
            recommendations.append(
                "Increase monitoring and deploy additional staff.")

        elif predicted_level == "medium":
            explanations.append(
                "Moderate crowd activity detected."
            )
            recommendations.append("Continue monitoring the area.")

        else:
            explanations.append("Crowd activity currently low.")

        # ------------------------------------------------------
        # Escalation probability
        # ------------------------------------------------------

        if escalation_probability > 0.7:
            explanations.append(
                "There is a high probability of crowd escalation."
            )
            recommendations.append(
                "Prepare crowd flow management strategies."
            )

        # ------------------------------------------------------
        # Holiday context
        # ------------------------------------------------------

        if holiday_context:
            explanations.append(
                f"Today is {holiday_context.get('name', 'a holiday')}, which may increase public activity."
            )

        # ------------------------------------------------------
        # Weather context
        # ------------------------------------------------------

        if weather_context:
            condition = weather_context.get("condition")

            if condition == "heavy_rain":
                explanations.append(
                    "Heavy rain conditions may shift crowds toward sheltered areas."
                )

            elif condition == "extreme_heat":
                explanations.append(
                    "Extreme heat may increase indoor crowd gathering."
                )

        # ------------------------------------------------------
        # Event context
        # ------------------------------------------------------

        if event_type:
            explanations.append(
                f"Special event detected nearby ({event_type})."
            )
            recommendations.append(
                "Deploy temporary crowd management barriers."
            )

        # ------------------------------------------------------
        # Build final explanation (Fallback or Base logic)
        # ------------------------------------------------------

        base_explanation = " ".join(explanations)
        final_explanation = base_explanation

        # ------------------------------------------------------
        # Add LLM dynamic generation using AI Fallback Provider
        # ------------------------------------------------------
        try:
            prompt = f"""You are an expert AI security and crowd intelligence system for the Laminar Platform. 
Your task is to generate a concise, human-readable 2-3 sentence strategic explanation and actionable recommendation.
Venue Context: Warning Threshold is {warning_threshold}, Critical Threshold is {critical_threshold}.
Current Data: Predicted Risk Level is {predicted_level.upper()}, Risk Score is {predicted_score:.1f}/100, trend slope is {slope:.2f} pax/min, and escalation probability is {escalation_probability*100:.1f}%. 
Heuristic Context: {base_explanation}
Instruction: Write exactly 2-3 sentences. Focus heavily on actionable, real-world instructions for security operations teams based on the context (weather, holidays, events). Do NOT use generic AI filler like "Based on the data". Do NOT respond with greetings."""
            
            from app.services.ai_provider_service import ai_provider
            llm_text = await ai_provider.generate_response(prompt, timeout=5.0)
            if llm_text:
                final_explanation = llm_text
        except Exception as e:
            logger.debug(f"LLM explanation generation failed, using fallback: {e}")

        return {
            "explanation": final_explanation,
            "recommendations": recommendations,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def generate_insufficient_data_explanation(self) -> Dict[str, Any]:
        """Return a standard explanation when there is insufficient historical data."""
        return {
            "explanation": "Insufficient historical crowd data to generate a prediction. Predictions require at least 5 minutes of camera data.",
            "recommendations": [
                "Ensure cameras are active and crowd detection is running.",
                "Wait a few minutes for the system to collect baseline data.",
            ],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
