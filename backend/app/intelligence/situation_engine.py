"""
LAMINAR - Situation Engine
--------------------------

Understands "Why is it happening?" by analyzing the World Model.
Maps incidents to downstream impacts and upstream congestion.
"""

from typing import Dict, Any, List
from app.core.world_model import WORLD_MODEL

class SituationEngine:
    def analyze(self) -> Dict[str, Any]:
        reality = WORLD_MODEL.get_current_reality()
        
        situation = {
            "causal_chains": [],
            "network_status": "NORMAL",
            "critical_nodes": []
        }

        # Look for incidents
        incidents = reality.get("active_incidents", [])
        if not incidents:
            # Check for pure volume congestion
            for seg_id, seg_data in reality["segments"].items():
                if seg_data["status"] == "CONGESTED":
                    situation["causal_chains"].append({
                        "id": f"SIT-{seg_id}",
                        "cause": "High volume",
                        "impact": f"{seg_data['name']} is congested",
                        "severity": "MEDIUM",
                        "affected_segments": [seg_id]
                    })
                    situation["critical_nodes"].append(seg_id)
            return situation

        # Analyze incidents
        situation["network_status"] = "CRITICAL"
        
        for inc in incidents:
            seg_id = inc["segment"]
            seg_data = reality["segments"].get(seg_id, {})
            
            # Predict propagation
            upstream_segs = WORLD_MODEL.segments[seg_id].upstream_nodes if seg_id in WORLD_MODEL.segments else []
            
            q_len = seg_data.get('queue_length_m', 0)
            
            chain = {
                "id": f"SIT-INC-{seg_id}",
                "cause": inc["type"],
                "impact": f"Lane blocked on {seg_data.get('name', seg_id)}",
                "severity": inc["impact_severity"],
                "metrics": {
                    "queue_added_m": q_len,
                    "speed_reduction": "40%" if q_len > 0 else "0%"
                },
                "affected_segments": [seg_id] + upstream_segs
            }
            situation["causal_chains"].append(chain)
            situation["critical_nodes"].append(seg_id)
            
        return situation

SITUATION_ENGINE = SituationEngine()
