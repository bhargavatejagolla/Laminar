"""
Laminar - Geofence Zone Alert Service
---------------------------------------
Triggers alerts when detected crowds extend outside configured geographic boundaries.

Uses shapely for geometric containment checks — free, zero ML required.

Configuration:
  Venue zones store geofences as JSON polygons in Venue.model_metadata:
  {
    "geofences": [
      {
        "id": "main-gate",
        "name": "Main Gate Zone",
        "polygon": [[x1,y1], [x2,y2], [x3,y3], ...],   # Pixel coordinates
        "max_density": 50,   # Max persons allowed in zone
        "alert_on_breach": true
      }
    ]
  }

Integration: stream_worker.py calls check_geofences() after each detection frame.
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from uuid import UUID

from app.core.logging import get_logger

logger = get_logger(__name__)


class GeofenceService:
    """
    Pixel-coordinate geofence containment checks using shapely Polygons.
    Fires alert events when crowds breach configured zones.
    """

    def __init__(self):
        self._shapely_available = self._check_shapely()

    def _check_shapely(self) -> bool:
        try:
            from shapely.geometry import Polygon, Point
            return True
        except ImportError:
            logger.warning("shapely not installed — geofencing disabled. Run: pip install shapely")
            return False

    def check_geofences(
        self,
        detections: List[Dict[str, Any]],
        geofences: List[Dict[str, Any]],
        camera_id: str,
        venue_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Check if any detected persons are outside defined geofences.

        Args:
            detections: List of {x1, y1, x2, y2, confidence} dicts from YOLO
            geofences: List of geofence configs from venue.model_metadata["geofences"]
            camera_id: Camera identifier
            venue_id: Venue identifier

        Returns:
            List of breach events (empty = no breach)
        """
        if not self._shapely_available or not geofences or not detections:
            return []

        try:
            from shapely.geometry import Polygon, Point

            breach_events = []

            for gf in geofences:
                if not gf.get("alert_on_breach", True):
                    continue

                polygon_coords = gf.get("polygon", [])
                if len(polygon_coords) < 3:
                    continue

                try:
                    zone_polygon = Polygon(polygon_coords)
                    if not zone_polygon.is_valid:
                        zone_polygon = zone_polygon.buffer(0)  # Fix invalid geometry
                except Exception as e:
                    logger.warning(f"GeofenceService: Invalid polygon for zone {gf.get('id')}: {e}")
                    continue

                # Count persons outside the geofence
                outside_count = 0
                inside_count = 0
                outside_positions = []

                for det in detections:
                    # Use center-bottom of bounding box as person position
                    cx = (det.get("x1", 0) + det.get("x2", 0)) / 2
                    cy = det.get("y2", 0)  # Bottom of bbox = feet position
                    point = Point(cx, cy)

                    if zone_polygon.contains(point) or zone_polygon.boundary.distance(point) < 5:
                        inside_count += 1
                    else:
                        outside_count += 1
                        outside_positions.append((round(cx), round(cy)))

                # Check density breach
                max_density = gf.get("max_density")
                density_breach = (
                    max_density and inside_count > max_density
                )

                if outside_count > 0 or density_breach:
                    breach_events.append({
                        "type": "geofence_breach",
                        "zone_id": gf.get("id", "unknown"),
                        "zone_name": gf.get("name", "Unknown Zone"),
                        "camera_id": camera_id,
                        "venue_id": venue_id,
                        "outside_count": outside_count,
                        "inside_count": inside_count,
                        "max_density": max_density,
                        "density_breach": density_breach,
                        "outside_positions": outside_positions[:10],  # Limit for storage
                        "severity": self._compute_breach_severity(outside_count, inside_count, max_density),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

            return breach_events

        except Exception as e:
            logger.error(f"GeofenceService.check_geofences error: {e}")
            return []

    def _compute_breach_severity(
        self,
        outside: int,
        inside: int,
        max_density: Optional[int],
    ) -> str:
        """Compute breach severity level."""
        if outside == 0 and max_density and inside > max_density * 1.5:
            return "critical"
        elif outside > 10 or (max_density and inside > max_density * 1.2):
            return "high"
        elif outside > 5 or (max_density and inside > max_density):
            return "medium"
        return "low"

    def validate_geofence_config(
        self,
        geofences: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Validate a list of geofence configurations.
        Call this when saving venue metadata.
        """
        if not self._shapely_available:
            return {"valid": True, "warnings": ["shapely not installed — geofencing disabled"]}

        from shapely.geometry import Polygon

        errors = []
        warnings = []
        valid_count = 0

        for gf in geofences:
            gf_id = gf.get("id", "unknown")
            coords = gf.get("polygon", [])

            if len(coords) < 3:
                errors.append(f"Zone '{gf_id}': polygon must have at least 3 points")
                continue

            try:
                poly = Polygon(coords)
                if not poly.is_valid:
                    warnings.append(f"Zone '{gf_id}': polygon has self-intersections — auto-fixed")
                valid_count += 1
            except Exception as e:
                errors.append(f"Zone '{gf_id}': invalid geometry — {e}")

        return {
            "valid": len(errors) == 0,
            "valid_zones": valid_count,
            "errors": errors,
            "warnings": warnings,
        }

    def get_zone_status(
        self,
        venue_metadata: Dict[str, Any],
        current_counts: Dict[str, int],
    ) -> List[Dict[str, Any]]:
        """
        Get current status of all geofence zones for dashboard display.

        Args:
            venue_metadata: Venue.model_metadata dict
            current_counts: {zone_id: person_count} from current frame

        Returns:
            List of zone status objects
        """
        geofences = venue_metadata.get("geofences", [])
        statuses = []

        for gf in geofences:
            zone_id = gf.get("id", "unknown")
            count = current_counts.get(zone_id, 0)
            max_density = gf.get("max_density")

            utilization = (count / max_density * 100) if max_density and max_density > 0 else None

            if utilization is None:
                status = "monitoring"
            elif utilization >= 100:
                status = "critical"
            elif utilization >= 80:
                status = "warning"
            else:
                status = "normal"

            statuses.append({
                "zone_id": zone_id,
                "zone_name": gf.get("name", zone_id),
                "current_count": count,
                "max_density": max_density,
                "utilization_pct": round(utilization, 1) if utilization is not None else None,
                "status": status,
            })

        return statuses


# ─── Singleton ─────────────────────────────────────────────────────────────────
geofence_service = GeofenceService()
