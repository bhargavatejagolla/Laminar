import httpx
from datetime import datetime,timezone
from app.core.logging import get_logger

logger = get_logger(__name__)


class GeocodingService:

    CACHE_TTL_SECONDS = 86400  # 24 hours
    _cache = {}

    async def get_coordinates(self, city: str, country: str):
        """
        Returns:
        (latitude, longitude) or (None, None)
        """

        key = f"{city}:{country}"
        now = datetime.now(timezone.utc)
        # 1️⃣ Cache check
        if key in self._cache:
            cached = self._cache[key]
            if (now - cached["timestamp"]).total_seconds() < self.CACHE_TTL_SECONDS:
                return cached["lat"], cached["lon"]

        try:
            url = (
                "https://nominatim.openstreetmap.org/search"
                f"?city={city}"
                f"&country={country}"
                "&format=json"
                "&limit=1"
            )

            headers = {
                "User-Agent": "LaminarCrowdSystem/1.0"
            }

            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(url, headers=headers)

            if response.status_code == 200:
                data = response.json()

                if data:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])

                    self._cache[key] = {
                        "timestamp": now,
                        "lat": lat,
                        "lon": lon,
                    }

                    return lat, lon

        except Exception as e:
            logger.warning(
                "Geocoding failed",
                extra={"error": str(e)}
            )

        return None, None
