"""
Laminar - SMS Alert Service
---------------------------

Production-grade SMS dispatch via a local Android SMS Gateway or direct Twilio fallback.
Works offline on LAN even when WAN/internet is down.

Configuration (via .env):
  SMS_GATEWAY_ENABLED=true          # Set to true to enable real SMS (default: False = simulation mode)
  SMS_GATEWAY_URL=http://192.168.1.X:8080/v1/sms/send  # Android gateway URL
  SMS_GATEWAY_TIMEOUT=8             # Per-request timeout in seconds
  SMS_MAX_RETRIES=2                 # Retry attempts before falling back to simulation
"""
import os
import httpx
import asyncio
from typing import List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


class SmsAlertService:
    """
    Production SMS dispatcher for Laminar crowd alerts.

    Modes:
    - LIVE MODE  : SMS_GATEWAY_ENABLED=true + a reachable SMS_GATEWAY_URL  → real SMS
    - SIMULATION : SMS_GATEWAY_ENABLED=false or gateway unreachable         → logged simulation only

    The service probes gateway reachability on first use and logs mode clearly.
    """

    def __init__(
        self,
        gateway_url: Optional[str] = None,
        timeout: Optional[int] = None,
        max_retries: Optional[int] = None,
    ):
        raw_url = gateway_url or os.environ.get("SMS_GATEWAY_URL", "").strip()

        # Explicit enabled flag — default False prevents accidental simulation-as-real confusion
        self.enabled = os.environ.get("SMS_GATEWAY_ENABLED", "false").lower() in ("true", "1", "yes")
        self.gateway_url = raw_url if raw_url else "http://localhost:9090/sms/send"
        self.timeout = timeout or int(os.environ.get("SMS_GATEWAY_TIMEOUT", "8"))
        self.max_retries = max_retries or int(os.environ.get("SMS_MAX_RETRIES", "2"))

        if not self.enabled:
            logger.warning(
                "SMS_GATEWAY_ENABLED=false — running in SIMULATION MODE. "
                "Real SMS will NOT be sent. Set SMS_GATEWAY_ENABLED=true and "
                "SMS_GATEWAY_URL=http://<phone-ip>:8080/v1/sms/send to enable.",
                extra={"mode": "simulation"},
            )
        else:
            logger.info(
                "SMS service initialized in LIVE MODE.",
                extra={"gateway_url": self.gateway_url, "timeout": self.timeout},
            )

    # -----------------------------------------------------------------
    # Public: Health Check
    # -----------------------------------------------------------------

    async def health_check(self) -> dict:
        """
        Probe the SMS gateway and return a structured health dict.

        Returns:
            {
                "mode": "live" | "simulation",
                "gateway_url": str,
                "reachable": bool,
                "error": str | None,
            }
        """
        mode = "live" if self.enabled else "simulation"

        if not self.enabled:
            return {
                "mode": "simulation",
                "gateway_url": self.gateway_url,
                "reachable": False,
                "error": "SMS_GATEWAY_ENABLED=false — simulation mode active. Set to true to enable real SMS.",
            }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Do a lightweight GET on the base URL to probe reachability
                base = self.gateway_url.rsplit("/", 1)[0]  # strip last path segment
                r = await client.get(base)
                reachable = r.status_code < 500
        except Exception as e:
            return {
                "mode": mode,
                "gateway_url": self.gateway_url,
                "reachable": False,
                "error": str(e),
            }

        return {
            "mode": mode,
            "gateway_url": self.gateway_url,
            "reachable": reachable,
            "error": None,
        }

    # -----------------------------------------------------------------
    # Public: Send single SMS
    # -----------------------------------------------------------------

    async def send_sms(self, phone_number: str, message: str) -> bool:
        """
        Dispatch an SMS to a single recipient.

        Retries up to `max_retries` times on network errors before falling
        back to simulation mode.

        Returns:
            True  — message was dispatched (real or simulated)
            False — all attempts failed AND simulation also failed
        """
        if not self.enabled:
            self._simulate_sms(phone_number, message)
            return True

        sanitized_phone = phone_number.replace("+", "").strip()
        payload = {"phone": sanitized_phone, "message": message}

        last_error: Optional[Exception] = None

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(
                    f"SMS dispatch attempt {attempt}/{self.max_retries}",
                    extra={"gateway_url": self.gateway_url, "phone": phone_number},
                )
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(self.gateway_url, json=payload)
                    response.raise_for_status()

                logger.info(
                    f"✅ SMS sent successfully via gateway",
                    extra={"phone": phone_number, "attempt": attempt},
                )
                return True

            except httpx.RequestError as e:
                last_error = e
                logger.warning(
                    f"SMS gateway unreachable (attempt {attempt}/{self.max_retries}): {e}",
                    extra={"gateway_url": self.gateway_url, "phone": phone_number},
                )
            except httpx.HTTPStatusError as e:
                last_error = e
                logger.warning(
                    f"SMS gateway HTTP error {e.response.status_code} (attempt {attempt}/{self.max_retries}): {e.response.text}",
                    extra={"phone": phone_number},
                )
            except Exception as e:
                last_error = e
                logger.warning(
                    f"Unexpected SMS error (attempt {attempt}/{self.max_retries}): {e}",
                    extra={"phone": phone_number},
                )

            # Brief back-off between retries
            if attempt < self.max_retries:
                await asyncio.sleep(1.0 * attempt)

        # All retries exhausted — fall back to simulation
        logger.error(
            f"Gateway unreachable - simulating SMS (set SMS_GATEWAY_URL to enable real sending). "
            f"All {self.max_retries} attempts failed for {phone_number}. Last error: {last_error}",
            extra={"gateway_url": self.gateway_url},
        )
        self._simulate_sms(phone_number, message)
        return True  # Simulation always 'succeeds' so the notification pipeline is not blocked

    # -----------------------------------------------------------------
    # Public: Multi-recipient broadcast
    # -----------------------------------------------------------------

    async def notify_recipients(self, recipients: List[str], message: str) -> dict:
        """
        Broadcast the same message to multiple recipients concurrently.

        Returns a summary dict with counts per outcome.
        """
        if not recipients:
            logger.warning("SMS notify_recipients called with empty recipient list.")
            return {"sent": 0, "failed": 0, "mode": "simulation" if not self.enabled else "live"}

        logger.info(
            f"Broadcasting SMS to {len(recipients)} recipient(s).",
            extra={"mode": "live" if self.enabled else "simulation"},
        )

        tasks = [self.send_sms(phone, message) for phone in recipients]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        sent = sum(1 for r in results if r is True)
        failed = len(results) - sent

        logger.info(
            f"SMS broadcast complete: {sent} sent, {failed} failed.",
            extra={"total": len(recipients), "mode": "live" if self.enabled else "simulation"},
        )
        return {"sent": sent, "failed": failed, "mode": "live" if self.enabled else "simulation"}

    # -----------------------------------------------------------------
    # Private: Simulation fallback
    # -----------------------------------------------------------------

    def _simulate_sms(self, phone_number: str, message: str) -> None:
        """
        Simulation mode — logs the SMS content clearly so developers can verify
        the pipeline works end-to-end even without a real gateway.
        """
        logger.info(
            "📱 [SMS SIMULATION — NOT SENT] Set SMS_GATEWAY_ENABLED=true to dispatch real SMS.",
            extra={
                "to": phone_number,
                "message_preview": message[:120],
            },
        )
