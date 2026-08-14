"""
LAMINAR - Prediction Engine
---------------------------

Answers "What will happen next?"
Simulates impact based on current situations.
"""

from typing import Dict, Any, List
from app.intelligence.situation_engine import SITUATION_ENGINE
from app.core.world_model import WORLD_MODEL

class PredictionEngine:
    def predict(self) -> Dict[str, Any]:
        situation = SITUATION_ENGINE.analyze()
        
        predictions = {
            "situations": situation,
            "forecasts": []
        }

        for chain in situation.get("causal_chains", []):
            cause = chain["cause"]
            affected = chain["affected_segments"]
            
            if cause == "Accident" or cause == "Fire":
                # Extrapolate congestion
                delay_min = len(affected) * 4 # roughly 4 min delay per congested segment
                
                predictions["forecasts"].append({
                    "related_situation_id": chain["id"],
                    "impact_type": "TRAFFIC_DELAY",
                    "description": f"Severe congestion likely to reach upstream nodes in ~{min(10, len(affected)*2)} minutes.",
                    "eta_impact_min": delay_min,
                    "target": "Emergency Response Routes"
                })
                
                # Predict parking overflow if this affects access to a zone
                for z_id, z in WORLD_MODEL.parking_zones.items():
                    if any(seg in z.connected_segments for seg in affected):
                        predictions["forecasts"].append({
                            "related_situation_id": chain["id"],
                            "impact_type": "PARKING_SHIFT",
                            "description": f"Access to {z.name} restricted. Demand will shift to alternatives.",
                            "eta_impact_min": 0,
                            "target": z_id
                        })
            
            elif cause == "High volume":
                predictions["forecasts"].append({
                    "related_situation_id": chain["id"],
                    "impact_type": "TRAFFIC_BUILDUP",
                    "description": "Queue forming, expected to dissipate in 15 minutes if inflow reduces.",
                    "eta_impact_min": 2,
                    "target": "General Commute"
                })

        return predictions

PREDICTION_ENGINE = PredictionEngine()
