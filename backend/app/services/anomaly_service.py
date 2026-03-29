"""
Laminar - Anomaly Detection Service (Isolation Forest)
-------------------------------------------------------
Uses scikit-learn's IsolationForest to detect statistically unusual
crowd patterns without manual threshold tuning.

Architecture Position:
  CrowdMetric → RiskEngineService → [AnomalyService] → decision dict

Key Properties:
  - Per-venue model trained on last 7 days of minute-bucket CrowdMetrics
  - Model cached in memory per venue (re-trains weekly via scheduler)
  - Returns anomaly_score (float 0-1) and is_anomaly (bool) — ADDITIVE metadata
  - Gracefully degrades when insufficient data (< 50 samples)
  - Does NOT modify the existing should_alert logic — purely additive

Scoring:
  IsolationForest returns scores in range (-1, 0]:
    -1  = highly anomalous
     0  = borderline
  We normalize to [0, 1] where 1 = most anomalous.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.crowd_metric import CrowdMetric
from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── In-memory model cache ─────────────────────────────────────────────────────
# { venue_id_str: (model, trained_at, feature_mean, feature_std) }
_model_cache: Dict[str, Tuple[Any, datetime, Any, Any]] = {}
_RETRAIN_INTERVAL_HOURS = 168  # 7 days
_MIN_SAMPLES = 50  # Min data points needed to train


class AnomalyService:
    """
    Isolation Forest-based anomaly detector for crowd metrics.
    Additive to the existing rule-based risk engine.
    """

    # ── Feature extraction ────────────────────────────────────────────────────

    def _extract_features(self, metric: "CrowdMetric"):
        """Extract numeric features from a CrowdMetric for anomaly scoring."""
        import numpy as np
        return np.array([
            float(metric.avg_count or 0),
            float(metric.max_count or 0),
            float(metric.growth_rate_percent or 0),
            float(metric.dynamic_risk_score or 0),
            float(metric.bucket_start.hour if metric.bucket_start else 12),
            float(metric.bucket_start.weekday() if metric.bucket_start else 0),
        ], dtype=np.float32)

    # ── Training ──────────────────────────────────────────────────────────────

    async def _train_model(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Optional[Any]:
        """
        Train an IsolationForest on last 7 days of CrowdMetrics for the venue.
        Returns (model, mean, std) or None if insufficient data.
        """
        try:
            import numpy as np
            from sklearn.ensemble import IsolationForest
            from sklearn.preprocessing import StandardScaler

            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            stmt = (
                select(CrowdMetric)
                .where(CrowdMetric.venue_id == venue_id)
                .where(CrowdMetric.bucket_type == "minute")
                .where(CrowdMetric.bucket_start >= seven_days_ago)
                .order_by(desc(CrowdMetric.bucket_start))
                .limit(10000)
            )
            result = await session.execute(stmt)
            metrics = result.scalars().all()

            if len(metrics) < _MIN_SAMPLES:
                logger.info(
                    f"AnomalyService: Not enough data for venue {venue_id} "
                    f"({len(metrics)} samples, need {_MIN_SAMPLES})"
                )
                return None

            # Build feature matrix
            X = np.stack([self._extract_features(m) for m in metrics])

            # Normalize features
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            # Train IsolationForest
            # contamination=0.05 → expect ~5% of data to be anomalous
            model = IsolationForest(
                n_estimators=100,
                contamination=0.05,
                random_state=42,
                n_jobs=1,  # Limit CPU usage
            )
            model.fit(X_scaled)

            logger.info(
                f"AnomalyService: Trained model for venue {venue_id} "
                f"on {len(metrics)} samples"
            )
            return (model, scaler)

        except ImportError:
            logger.warning("scikit-learn not installed — anomaly detection disabled. Run: pip install scikit-learn")
            return None
        except Exception as e:
            logger.error(f"AnomalyService: Training failed for venue {venue_id}: {e}")
            return None

    # ── Cache management ──────────────────────────────────────────────────────

    async def _get_or_train_model(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Optional[Tuple[Any, Any]]:
        """Get cached model or train new one if stale."""
        key = str(venue_id)
        now = datetime.now(timezone.utc)

        if key in _model_cache:
            model, trained_at, scaler = _model_cache[key]
            age_hours = (now - trained_at).total_seconds() / 3600
            if age_hours < _RETRAIN_INTERVAL_HOURS:
                return (model, scaler)

        # Train new model
        result = await self._train_model(session, venue_id)
        if result:
            model, scaler = result
            _model_cache[key] = (model, datetime.now(timezone.utc), scaler)
            return (model, scaler)

        return None

    async def force_retrain(self, session: AsyncSession, venue_id: UUID) -> bool:
        """Force model retraining for a venue (called by scheduler)."""
        key = str(venue_id)
        if key in _model_cache:
            del _model_cache[key]
        result = await self._train_model(session, venue_id)
        if result:
            model, scaler = result
            _model_cache[key] = (model, datetime.now(timezone.utc), scaler)
            return True
        return False

    # ── Scoring ───────────────────────────────────────────────────────────────

    async def score_metric(
        self,
        session: AsyncSession,
        metric: "CrowdMetric",
    ) -> Dict[str, Any]:
        """
        Score a single CrowdMetric for anomalousness.

        Returns:
          {
            "anomaly_score": float (0-1, higher = more anomalous),
            "is_anomaly": bool,
            "confidence": str ("high" | "low" | "insufficient_data"),
            "model_trained": bool
          }
        """
        try:
            import numpy as np
            model_tuple = await self._get_or_train_model(session, metric.venue_id)

            if model_tuple is None:
                return {
                    "anomaly_score": 0.0,
                    "is_anomaly": False,
                    "confidence": "insufficient_data",
                    "model_trained": False,
                }

            model, scaler = model_tuple
            features = self._extract_features(metric).reshape(1, -1)
            features_scaled = scaler.transform(features)

            # IsolationForest score_samples returns negative values
            # More negative = more anomalous
            raw_score = float(model.score_samples(features_scaled)[0])
            prediction = int(model.predict(features_scaled)[0])  # -1 anomaly, 1 normal

            # Normalize score to [0, 1]
            # Raw scores typically range from -0.6 to 0
            normalized = max(0.0, min(1.0, (-raw_score) * 2.0))

            is_anomaly = prediction == -1

            return {
                "anomaly_score": round(normalized, 3),
                "is_anomaly": is_anomaly,
                "confidence": "high",
                "model_trained": True,
            }

        except Exception as e:
            logger.error(f"AnomalyService: Scoring failed: {e}")
            return {
                "anomaly_score": 0.0,
                "is_anomaly": False,
                "confidence": "error",
                "model_trained": False,
            }

    async def get_venue_anomaly_summary(
        self,
        session: AsyncSession,
        venue_id: UUID,
        minutes: int = 60,
    ) -> Dict[str, Any]:
        """
        Get anomaly summary for the last N minutes for a venue.
        Used by the /anomaly/{venue_id} endpoint.
        """
        since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_type == "minute")
            .where(CrowdMetric.bucket_start >= since)
            .order_by(desc(CrowdMetric.bucket_start))
            .limit(200)
        )
        result = await session.execute(stmt)
        metrics = result.scalars().all()

        if not metrics:
            return {
                "venue_id": str(venue_id),
                "minutes_analyzed": minutes,
                "total_samples": 0,
                "anomalies_detected": 0,
                "anomaly_rate": 0.0,
                "latest": None,
                "model_trained": False,
            }

        scored = []
        anomaly_count = 0
        for m in metrics[:10]:  # Score only recent 10 for performance
            score = await self.score_metric(session, m)
            scored.append({
                "time": m.bucket_start.isoformat(),
                "avg_count": m.avg_count,
                "risk_level": m.risk_level,
                **score,
            })
            if score["is_anomaly"]:
                anomaly_count += 1

        return {
            "venue_id": str(venue_id),
            "minutes_analyzed": minutes,
            "total_samples": len(metrics),
            "anomalies_detected": anomaly_count,
            "anomaly_rate": round(anomaly_count / max(len(scored), 1), 3),
            "latest": scored[0] if scored else None,
            "recent_scores": scored,
            "model_trained": any(s["model_trained"] for s in scored),
        }
