from datetime import datetime,timezone
import csv
import os
import httpx
from app.core.logging import get_logger

logger = get_logger(__name__)


class HolidayService:

    _cache = {}
    CACHE_TTL_SECONDS = 86400  # Cache for 24 hours (holidays don't change intra-day)
    CSV_PATH = "holidays.csv"

    async def is_today_holiday(self) -> dict | None:
        """
        Returns:
        {
            "is_holiday": bool,
            "name": str | None,
            "type": str | None,
            "source": "api" | "csv" | None
        }
        or None if not a holiday
        """
        current_utc_datetime = datetime.now(timezone.utc)
        today = current_utc_datetime.date()
        year = today.year

        cache_key = f"{year}-{today}"
        
        # 0️⃣ Cache Check
        if cache_key in self._cache:
            cached_data = self._cache[cache_key]
            if (current_utc_datetime - cached_data["timestamp"]).total_seconds() < self.CACHE_TTL_SECONDS:
                return cached_data["data"]

        # 1️⃣ Try API
        try:
            url = f"https://date.nager.at/api/v3/PublicHolidays/{2026}/IN"

            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(url)

            if response.status_code == 200:
                holidays = response.json()

                for holiday in holidays:
                    if holiday.get("date") == str(today):
                        result = {
                            "is_holiday": True,
                            "name": holiday.get("localName") or holiday.get("name"),
                            "type": "Public",
                            "source": "api",
                        }
                        self._cache[cache_key] = {"timestamp": current_utc_datetime, "data": result}
                        return result

                # Not a public holiday via API, but might be a festival in CSV.
                # Do NOT cache None here, let it fall through to CSV check.
                pass

        except Exception as e:
            logger.warning(
                "Holiday API failed",
                extra={"error": str(e)}
            )

        # 2️⃣ CSV fallback
        try:
            if os.path.exists(self.CSV_PATH):
                with open(self.CSV_PATH, newline="", encoding="utf-8") as csvfile:
                    reader = csv.DictReader(csvfile)
                    for row in reader:
                        if row["date"] == str(today):
                            return {
                                "is_holiday": True,
                                "name": row["name"],
                                "type": row.get("type", "Public"),
                                "source": "csv",
                            }
        except Exception as e:
            logger.error(
                "Holiday CSV fallback failed",
                extra={"error": str(e)}
            )

        # Cache negative result with "Temporal Stability" metadata
        stability_result = {
            "is_holiday": False,
            "name": "Temporal Stability",
            "type": "Standard",
            "source": "calibration"
        }
        self._cache[cache_key] = {"timestamp": current_utc_datetime, "data": stability_result}
        return stability_result
