from datetime import datetime, timedelta
import httpx
from app.core.logging import get_logger

logger = get_logger(__name__)


class WeatherService:

    CACHE_TTL_SECONDS = 600  # 10 minutes cache
    _cache = {}

    async def get_weather_context(self, latitude: float, longitude: float):
        """
        Returns:
        {
            temperature,
            rain,
            weather_code,
            condition,
            source
        }
        """

        key = f"{latitude}:{longitude}"
        now = datetime.utcnow()

        # 1️⃣ Cache check
        if key in self._cache:
            cached = self._cache[key]
            if (now - cached["timestamp"]).total_seconds() < self.CACHE_TTL_SECONDS:
                return cached["data"]

        try:
            url = (
                "https://api.open-meteo.com/v1/forecast"
                f"?latitude={latitude}"
                f"&longitude={longitude}"
                "&current=temperature_2m,precipitation,weathercode"
            )

            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(url)

            if response.status_code == 200:
                data = response.json()
                current = data.get("current", {})

                weather_data = {
                    "temperature": current.get("temperature_2m"),
                    "rain": current.get("precipitation", 0),
                    "weather_code": current.get("weathercode"),
                    "condition": self._interpret_weather(
                        current.get("temperature_2m"),
                        current.get("precipitation", 0)
                    ),
                    "source": "api",
                }

                self._cache[key] = {
                    "timestamp": now,
                    "data": weather_data,
                }

                return weather_data

        except Exception as e:
            logger.warning("Weather API failed", extra={"error": str(e)})

        # 2️⃣ CSV fallback
        try:
            import os, csv
            if os.path.exists("weather.csv"):
                with open("weather.csv", newline="", encoding="utf-8") as csvfile:
                    reader = csv.DictReader(csvfile)
                    row = next(reader, None)
                    if row:
                        temp = float(row.get("temperature", 25.0))
                        rain = float(row.get("rain", 0.0))
                        weather_code = int(row.get("weather_code", 0))
                        
                        weather_data = {
                            "temperature": temp,
                            "rain": rain,
                            "weather_code": weather_code,
                            "condition": self._interpret_weather(temp, rain),
                            "source": "csv",
                        }
                        
                        self._cache[key] = {
                            "timestamp": now,
                            "data": weather_data,
                        }
                        return weather_data
        except Exception as fallback_e:
            logger.error("Weather CSV fallback failed", extra={"error": str(fallback_e)})

        # 3️⃣ Synthetic High-Fidelity Fallback (Laminar Standard)
        try:
            # Generate deterministic but drifting synthetic weather based on coords + time
            import math
            h = now.hour + (now.minute / 60.0)
            
            # Simple diurnal temperature cycle (min at 4am, max at 4pm)
            temp_base = 25.0
            temp_swing = 10.0 * math.sin((h - 9) * math.pi / 12)
            
            # Use coordinates to jitter the base temp slightly
            jitter = (math.sin(latitude * 100) + math.cos(longitude * 100)) * 2.0
            temp = round(temp_base + temp_swing + jitter, 1)
            
            # Synthetic condition based on jitter
            if jitter > 1.5: condition = "partly_cloudy"
            elif jitter < -1.5: condition = "clear"
            else: condition = "nominal"
            
            weather_data = {
                "temperature": temp,
                "rain": 0.0,
                "weather_code": 0,
                "condition": condition,
                "source": "synthetic_drift",
            }
            
            self._cache[key] = {
                "timestamp": now,
                "data": weather_data,
            }
            return weather_data
        except:
            return None

    def _interpret_weather(self, temp, rain):
        if rain and rain > 5:
            return "heavy_rain"
        if rain and rain > 0:
            return "light_rain"
        if temp and temp > 35:
            return "extreme_heat"
        if temp and temp < 10:
            return "cold"
        return "normal"
