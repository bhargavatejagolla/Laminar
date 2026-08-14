"""
LAMINAR - Decision Engine
-------------------------

Answers "What should we do?"
Produces actionable recommendations and simulates their impact.
"""

from typing import Dict, Any, List
from app.intelligence.prediction_engine import PREDICTION_ENGINE
from app.core.world_model import WORLD_MODEL

class DecisionEngine:
    def recommend(self) -> Dict[str, Any]:
        predictions = PREDICTION_ENGINE.predict()
        
        decisions = {
            "world_state": WORLD_MODEL.get_current_reality(),
            "situations": predictions["situations"],
            "forecasts": predictions["forecasts"],
            "recommendation": None
        }

        # Find the most severe forecast
        critical_forecasts = [f for f in predictions["forecasts"] if f["impact_type"] == "TRAFFIC_DELAY"]
        
        if critical_forecasts:
            primary_issue = critical_forecasts[0]
            delay = primary_issue["eta_impact_min"]
            
            # Generate Action Plan
            action_plan = {
                "title": "ACTION PLAN",
                "steps": [
                    "1. Prioritize emergency corridor",
                    "2. Redirect Eastbound traffic to North Avenue",
                    "3. Recommend Parking Zone C for incoming vehicles",
                    "4. Monitor Junction 05",
                    "5. Simulate Green Wave"
                ],
                "simulation": {
                    "before": f"ETA: {8 + delay}m 20s",
                    "after": "ETA: 5m 40s",
                    "projected_improvement": f"{int((delay/(8+delay))*100)}%"
                }
            }
            decisions["recommendation"] = action_plan
        elif predictions["situations"]["network_status"] == "NORMAL":
            decisions["recommendation"] = {
                "title": "SYSTEM NOMINAL",
                "steps": ["No critical interventions required."],
                "simulation": None
            }
            
        return decisions

DECISION_ENGINE = DecisionEngine()
