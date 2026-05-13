import httpx
from datetime import datetime, timezone
from app.core.logging import get_logger

logger = get_logger(__name__)


class GeocodingService:

    CACHE_TTL_SECONDS = 86400  # 24 hours
    _cache = {}

    async def get_coordinates(self, city: str, country: str, venue_name: str = ""):
        """
        Returns (latitude, longitude) or (None, None).

        Strategy:
        1. If a venue_name is provided, try a free-text Nominatim search
           for "venue_name, city, country" to pin the exact POI
           (works for temples, markets, schools, stations, etc.)
        2. Fall back to city+country geocoding if the POI search fails.
        """
        headers = {"User-Agent": "LaminarCrowdSystem/1.0"}
        now = datetime.now(timezone.utc)

        # ── 1️⃣  Full-text POI search (most precise) ──────────────────────────
        if venue_name:
            query = f"{venue_name}, {city}, {country}"
            key = query.lower().strip()

            if key in self._cache:
                cached = self._cache[key]
                if (now - cached["timestamp"]).total_seconds() < self.CACHE_TTL_SECONDS:
                    return cached["lat"], cached["lon"]

            try:
                async with httpx.AsyncClient(timeout=8) as client:
                    response = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params={
                            "q": query,
                            "format": "json",
                            "addressdetails": "1",
                            "limit": "1",
                        },
                        headers=headers,
                    )

                if response.status_code == 200:
                    data = response.json()
                    if data:
                        lat = float(data[0]["lat"])
                        lon = float(data[0]["lon"])
                        self._cache[key] = {"timestamp": now, "lat": lat, "lon": lon}
                        logger.info(
                            "Geocoded POI precisely",
                            extra={"query": query, "lat": lat, "lon": lon},
                        )
                        return lat, lon
            except Exception as e:
                logger.warning("POI geocoding failed", extra={"error": str(e)})

        # ── 2️⃣  Fallback: city + country ─────────────────────────────────────
        city_key = f"{city}:{country}".lower()
        if city_key in self._cache:
            cached = self._cache[city_key]
            if (now - cached["timestamp"]).total_seconds() < self.CACHE_TTL_SECONDS:
                return cached["lat"], cached["lon"]

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={
                        "city": city,
                        "country": country,
                        "format": "json",
                        "limit": "1",
                    },
                    headers=headers,
                )

            if response.status_code == 200:
                data = response.json()
                if data:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    self._cache[city_key] = {"timestamp": now, "lat": lat, "lon": lon}
                    return lat, lon

        except Exception as e:
            logger.warning("City geocoding failed", extra={"error": str(e)})

        return None, None
