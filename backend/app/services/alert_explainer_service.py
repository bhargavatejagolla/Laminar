"""
Laminar - Alert Explainer Service (v2 - Context-Rich, Non-Blocking)
---------------------------------------------------------------------

Generates human-readable explanations for alerts with REAL venue/capacity
context. Uses:

1. INSTANT rule-based explanation written to alert immediately (< 1ms)
2. AI-enhanced version attempted in background via AIFallbackProvider
3. If AI returns text, overwrites the rule-based one
4. Timeout: 20s max — never blocks alert pipeline

Key fix: Pulls venue name + capacity + occupancy from DB to make the
explanation meaningful (e.g. "1 out of 2 people (50%)" not just "CRITICAL").
"""

import asyncio
import logging
from typing import Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.crowd_alert import CrowdAlert
from app.models.venue import Venue
from app.core.logging import get_logger
from app.core.repository import Repository

logger = get_logger(__name__)


class AlertExplainerService:
    """Context-rich alert explanation, instant rule-based + async AI upgrade."""

    # In-memory cache to avoid re-generating identical explanations
    _cache: Dict[str, str] = {}
    _cache_max_size = 100

    def __init__(self):
        self.alert_repo = Repository[CrowdAlert](CrowdAlert)
        self.venue_repo = Repository[Venue](Venue)

    def _get_cache_key(self, decision: Dict[str, Any]) -> str:
        venue_id = str(decision.get("venue_id", ""))
        level = str(decision.get("current_level", ""))
        occupancy = str(round(decision.get("occupancy_percent") or 0, 0))
        return f"{venue_id}:{level}:{occupancy}"

    # ── Instant Rule-Based Explanation ────────────────────────────────────────

    def _build_instant_explanation(
        self,
        decision: Dict[str, Any],
        venue: Optional[Venue] = None,
    ) -> str:
        """
        Immediate, context-rich rule-based explanation.
        Uses venue capacity + occupancy for realistic messaging.
        """
        level = decision.get("current_level", "unknown")
        occupancy = decision.get("occupancy_percent") or 0
        trend = decision.get("trend", "stable")
        rate = decision.get("growth_rate") or 0

        venue_name = venue.name if venue else decision.get("venue_name", "this venue")
        capacity = getattr(venue, "capacity", None) or 0
        current_count = round(occupancy * capacity / 100) if capacity else "?"

        occ_str = (
            f"{current_count} out of {capacity} people ({occupancy:.0f}% capacity)"
            if capacity
            else f"{occupancy:.0f}% occupancy"
        )

        crit_threshold = getattr(venue, "critical_threshold", 800) if venue else 800
        warn_threshold = getattr(venue, "warning_threshold", 500) if venue else 500

        trend_map = {
            "increasing": "and is rising",
            "rapidly_increasing": "and is rising rapidly",
            "decreasing": "and is improving",
            "volatile": "with volatile fluctuations",
            "stable": "",
        }
        trend_str = trend_map.get(trend, "")

        staffing_cfg = getattr(venue, "staffing_config", {}) or {}
        required_staff = staffing_cfg.get(level)
        staff_str = f" Recommended Staffing: {required_staff} personnel." if required_staff else ""

        if level == "critical":
            return (
                f"🚨 {venue_name} has reached critical crowd density with {occ_str} "
                f"{trend_str}. This exceeds the critical threshold of {crit_threshold} persons."
                f"{(' Crowd is growing at ' + str(abs(rate)) + ' ppl/min — rapid action required.') if rate > 5 else ' Immediate crowd control action is required.'}"
                f"{staff_str}"
            )
        elif level == "high":
            return (
                f"⚠️ {venue_name} is at high-risk density with {occ_str} "
                f"{trend_str}. Approaching the critical threshold of {crit_threshold} persons."
                f"{(' Rate of change: ' + str(rate) + ' ppl/min.') if rate else ''} Monitor closely.{staff_str}"
            )
        elif level == "medium":
            return (
                f"📊 {venue_name} shows elevated crowd levels at {occ_str} "
                f"{trend_str}. Above the warning threshold of {warn_threshold} persons. Standard monitoring in effect.{staff_str}"
            )
        else:
            return (
                f"✅ {venue_name} is within normal crowd density at {occ_str}. No immediate action required.{staff_str}"
            )

    # ── AI Prompt Builder ─────────────────────────────────────────────────────

    def _build_ai_prompt(
        self,
        decision: Dict[str, Any],
        venue: Optional[Venue] = None,
    ) -> str:
        """Rich prompt that gives the AI full context."""
        level = decision.get("current_level", "unknown")
        occupancy = decision.get("occupancy_percent") or 0
        trend = decision.get("trend", "stable")
        rate = decision.get("growth_rate") or 0
        recommended = decision.get("recommended_action", "Monitor venue.")

        venue_name = venue.name if venue else decision.get("venue_name", "Unknown Venue")
        capacity = getattr(venue, "capacity", None) or "unknown"
        current_count = round(occupancy * (capacity if isinstance(capacity, int) else 0) / 100) if isinstance(capacity, int) else "?"
        crit_threshold = getattr(venue, "critical_threshold", 800) if venue else 800
        warn_threshold = getattr(venue, "warning_threshold", 500) if venue else 500

        predicted_level = decision.get("predicted_level", "N/A")
        escalation_prob = decision.get("escalation_probability", 0)

        staffing_cfg = getattr(venue, "staffing_config", {}) or {}
        required_staff = staffing_cfg.get(level, "N/A")

        return f"""You are a professional crowd safety analyst for the Laminar AI platform.

Write a 1-2 sentence alert explanation for security staff. Be specific, factual, and direct.
Do NOT start with "The alert indicates". Use concrete numbers.

VENUE: {venue_name}
CAPACITY: {capacity} people total
CURRENT OCCUPANCY: {current_count} people ({occupancy:.1f}%)
RISK LEVEL: {level.upper()}
REQUIRED STAFFING: {required_staff} personnel
WARNING THRESHOLD: {warn_threshold} persons  CRITICAL THRESHOLD: {crit_threshold} persons
CROWD TREND: {trend}
RATE OF CHANGE: {rate:+.1f} people/min
PREDICTED NEXT LEVEL: {predicted_level} (escalation probability: {escalation_prob:.0%})
RECOMMENDED ACTION: {recommended}

Alert Explanation:"""

    # ── Main Entry ────────────────────────────────────────────────────────────

    async def generate_explanation(
        self,
        session: AsyncSession,
        alert_id: UUID,
        decision: Dict[str, Any],
    ) -> None:
        """
        Two-phase explanation:
        1. Write instant rule-based explanation immediately
        2. Try AI-enhanced version (max 20s), replace if succeeded
        """
        # Fetch venue for context
        venue_id_str = decision.get("venue_id")
        venue = None
        if venue_id_str:
            try:
                from uuid import UUID as _UUID
                venue = await self.venue_repo.get_by_id(session, _UUID(venue_id_str))
            except Exception:
                pass

        cache_key = self._get_cache_key(decision)

        # Phase 1: Instant rule-based (always written, < 1ms)
        if cache_key in self._cache:
            instant_expl = self._cache[cache_key]
            logger.debug("Using cached explanation for alert", extra={"alert_id": str(alert_id)})
        else:
            instant_expl = self._build_instant_explanation(decision, venue)

        await self._update_alert(session, alert_id, instant_expl)

        # Phase 2: Try AI upgrade (non-blocking, background)
        asyncio.create_task(
            self._ai_upgrade(session, alert_id, decision, venue, cache_key, instant_expl)
        )

    async def _ai_upgrade(
        self,
        session: AsyncSession,
        alert_id: UUID,
        decision: Dict[str, Any],
        venue: Optional[Venue],
        cache_key: str,
        fallback_expl: str,
    ) -> None:
        """Try to get AI-enhanced explanation and write it back."""
        try:
            from app.services.ai_service import get_ai_service
            from app.core.database import db_manager

            ai_service = get_ai_service()
            decision_with_context = decision.copy()
            if venue:
                decision_with_context["venue_name"] = venue.name
                decision_with_context["capacity"] = venue.capacity
            
            # Send the structured dictionary to our router instead of raw string
            ai_resp_tuple = await asyncio.wait_for(
                ai_service.generate_alert(decision_with_context, return_provider_name=True),
                timeout=22.0,
            )
            
            # Unpack response if return_provider_name enabled
            ai_data = ai_resp_tuple[0] if isinstance(ai_resp_tuple, tuple) else ai_resp_tuple
            
            # Format JSON response into a strong explanation string
            if ai_data and isinstance(ai_data, dict):
                ai_expl = f"🚨 {ai_data.get('alert', '')} Reason: {ai_data.get('reason', '')} Action: {ai_data.get('action', '')}".strip()

            if ai_expl and len(ai_expl.strip()) > 20:
                # Cache the AI result
                if len(self._cache) >= self._cache_max_size:
                    self._cache.pop(next(iter(self._cache)))
                self._cache[cache_key] = ai_expl.strip()

                # Write back to DB with fresh session (avoid using expired session)
                async with db_manager.session() as fresh_session:
                    await self._update_alert(fresh_session, alert_id, ai_expl.strip())
                    logger.info("AI explanation applied", extra={"alert_id": str(alert_id)})
            else:
                # Cache the rule-based so next time is instant
                self._cache[cache_key] = fallback_expl
        except asyncio.TimeoutError:
            logger.warning("AI explanation timed out — keeping rule-based", extra={"alert_id": str(alert_id)})
            self._cache[cache_key] = fallback_expl
        except Exception as e:
            logger.error(f"AI upgrade failed: {e}", extra={"alert_id": str(alert_id)})
            self._cache[cache_key] = fallback_expl

    async def _update_alert(
        self,
        session: AsyncSession,
        alert_id: UUID,
        explanation: str,
    ) -> None:
        """Update the CrowdAlert record with the explanation."""
        try:
            alert = await self.alert_repo.get_by_id(session, alert_id)
            if alert:
                alert.explanation = explanation
                await session.commit()
        except Exception as e:
            logger.error(f"Failed to update alert explanation: {e}")
