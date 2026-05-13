from typing import Dict, Any, List

class ParkingInsightsEngine:
    """ Generates predictions, congestion alerts, and intelligence routing (e.g. Laminar Intelligence Layer) """
    
    def generate_insights(self, slot_states: Dict[str, bool], zones_config: Dict[str, List[str]]) -> Dict[str, Any]:
        """
        Produce top-tier intelligent analytics based on current slot state.
        zones_config maps zone_name -> list of slot_ids in that zone.
        """
        zone_metrics = {}
        total_slots = 0
        total_occupied = 0

        for zone_name, slots in zones_config.items():
            zone_capacity = len(slots)
            zone_occ = sum(1 for s in slots if slot_states.get(s, False))
            
            total_slots += zone_capacity
            total_occupied += zone_occ
            
            occupancy_pct = (zone_occ / zone_capacity * 100) if zone_capacity > 0 else 0
            
            # Predict status
            status = "LOW"
            if occupancy_pct > 85:
                status = "CRITICAL"
            elif occupancy_pct > 70:
                status = "HIGH"
            elif occupancy_pct > 40:
                status = "MEDIUM"

            zone_metrics[zone_name] = {
                "capacity": zone_capacity,
                "occupied": zone_occ,
                "available": zone_capacity - zone_occ,
                "occupancy_pct": round(occupancy_pct, 1),
                "status": status
            }

        # Determine recommendations based on LAMINAR intelligence
        overall_pct = (total_occupied / total_slots * 100) if total_slots > 0 else 0
        
        # Find the most congested zone
        sorted_zones = sorted(zone_metrics.items(), key=lambda x: x[1]['occupancy_pct'], reverse=True)
        most_congested = sorted_zones[0] if sorted_zones else None
        
        # Find the most available zone
        most_available = sorted_zones[-1] if sorted_zones else None
        
        alerts = []
        suggestion = "Normal operations. Traffic is flowing smoothly."
        
        if overall_pct > 90:
            alerts.append("FACILITY CRITICAL: Facility nearing maximum capacity.")
            suggestion = "Consider activating overflow parking."
        elif most_congested and most_congested[1]['status'] in ["HIGH", "CRITICAL"]:
            alerts.append(f"Zone {most_congested[0]} is nearing full capacity ({most_congested[1]['occupancy_pct']}%).")
            if most_available and most_available[1]['status'] in ["LOW", "MEDIUM"]:
                suggestion = f"Redirect incoming vehicles to Zone {most_available[0]} ({most_available[1]['available']} spots open)."

        return {
            "overall": {
                "total_slots": total_slots,
                "total_available": total_slots - total_occupied,
                "occupancy_pct": round(overall_pct, 1)
            },
            "zones": zone_metrics,
            "alerts": alerts,
            "suggestion": suggestion,
            "prediction": "Traffic expected to plateau in ~15 mins" if overall_pct > 80 else "Normal influx expected."
        }

parking_insights_engine = ParkingInsightsEngine()
