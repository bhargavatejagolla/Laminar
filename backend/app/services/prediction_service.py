"""
Laminar - Prediction Service
----------------------------

Intelligent forecasting engine with hybrid model selection and self-learning capabilities.

Provides:
- Predicted risk score
- Predicted risk level
- Confidence (R² adjusted)
- Escalation probability
- Adaptive anomaly detection
- ARIMA (AR1) lightweight model
- Hybrid model selector (regression vs ARIMA)
- AI-generated forecast explanation
- Prediction error tracking
- Auto-retraining detection
- Seasonality adjustment
- Event-based weighting
- Self-calibrating thresholds
- Performance caching
- Async compute protection
- Minimum compute interval
- Weekend context modifier
- Holiday context modifier
- Weather context modifier
- Event context modifier
- Incident explanation with recommendations
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone
from uuid import UUID
from math import exp
import statistics
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.crowd_metric import CrowdMetric
from app.models.venue import Venue
from app.core.logging import get_logger
from app.core.repository import Repository
from app.services.model_monitoring_service import ModelMonitoringService
from app.services.holiday_service import HolidayService
from app.services.weather_service import WeatherService
from app.services.event_service import EventService
from app.services.incident_explanation_service import IncidentExplanationService

logger = get_logger(__name__)


class PredictionService:

    LOOKBACK_MINUTES = 1000
    FORECAST_HORIZON = 15  # minutes into future

    # ==========================================================
    # ==========================================================
    # Dynamic Heuristic Logic (Zero Static Values Principle)
    # ==========================================================
    _TREND_STRONG_PCT    = 0.05   # 5% of warning threshold/min
    _TREND_MODERATE_PCT  = 0.01   # 1% of warning threshold/min
    _SURGE_BOOST_PCT     = 0.40   # Surge boost if growth > 40% of warning
    _RETRAIN_ERROR_LIMIT = 0.25   # MAPE threshold

    # Performance Optimization Config
    # ==========================================================
    CACHE_TTL_SECONDS = 60        # Cache prediction for 60s
    MIN_COMPUTE_INTERVAL = 30     # Minimum interval between recomputes

    # ==========================================================
    # Model performance memory (in-process)
    # ==========================================================
    _prediction_history: Dict[str, float] = {}
    _last_predictions: Dict[str, Dict[str, float]] = {}
    _model_mae_history: Dict[str, Dict[str, List[float]]] = {}
    _monitor = ModelMonitoringService()
    holiday_service = HolidayService()
    weather_service = WeatherService()
    event_service = EventService()
    venue_repo = Repository[Venue](Venue)
    explanation_service = IncidentExplanationService()

    # ==========================================================
    # In-memory cache & locks
    # ==========================================================
    _prediction_cache: Dict[str, Dict[str, Any]] = {}
    _last_compute_time: Dict[str, datetime] = {}
    _locks: Dict[str, Any] = {}

    def _get_lock(self, venue_id: UUID) -> asyncio.Lock:
        """Get or create an asyncio lock for a specific venue."""
        key = str(venue_id)
        if key not in self._locks:
            self._locks[key] = asyncio.Lock()
        return self._locks[key]

    # ==========================================================
    # Weather Modifier Method
    # ==========================================================
    async def _weather_modifier(self, latitude: float, longitude: float) -> tuple[float, Optional[Dict[str, Any]]]:
        """
        Adjust prediction based on weather conditions.
        
        Returns:
            tuple: (adjustment_factor, weather_info_dict)
        """
        try:
            weather_info = await self.weather_service.get_weather_context(
                latitude, longitude
            )

            if not weather_info:
                return 1.0, None

            condition = weather_info.get("condition", "unknown")

            # Crowd behavior logic (Contextual factors)
            # These are heuristic multipliers defined by Laminar Standards
            factors = {
                'heavy_rain': 0.8,
                'light_rain': 0.9,
                'extreme_heat': 1.1,
                'cold': 1.05
            }
            factor = factors.get(condition, 1.0)
            return factor, weather_info
        except Exception as e:
            logger.warning(
                "Weather service failed",
                extra={"error": str(e)}
            )
            return 1.0, None

    async def forecast_risk(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Dict[str, Any]:
        """
        Generate risk forecast with caching and compute protection.
        
        Performance features:
        - Caches predictions for 60 seconds
        - Minimum 30 seconds between recomputes per venue
        - Async lock prevents concurrent compute for same venue
        """
        venue_key = str(venue_id)
        now = datetime.now(timezone.utc)

        # ----------------------------------
        # 0️⃣ Fetch Venue for Dynamic Thresholds
        # ----------------------------------
        venue = await self.venue_repo.get_by_id(session, venue_id)
        if not venue:
            return {}

        warn_t = float(venue.warning_threshold) if venue.warning_threshold else (venue.capacity * 0.7 if venue.capacity else 50.0)
        crit_t = float(venue.critical_threshold) if venue.critical_threshold else (venue.capacity * 0.9 if venue.capacity else 80.0)

        # ----------------------------------
        # 1️⃣ Cache TTL Check
        # ----------------------------------
        cached = self._prediction_cache.get(venue_key)
        if cached:
            age = (now - cached["timestamp"]).total_seconds()
            if age < self.CACHE_TTL_SECONDS:
                logger.debug(
                    "Serving prediction from cache",
                    extra={"venue_id": venue_key,
                           "cache_age_seconds": int(age)}
                )
                return cached["data"]

        # ----------------------------------
        # 2️⃣ Minimum Compute Interval Guard
        # ----------------------------------
        last_compute = self._last_compute_time.get(venue_key)
        if last_compute:
            delta = (now - last_compute).total_seconds()
            if delta < self.MIN_COMPUTE_INTERVAL:
                if cached:
                    logger.debug(
                        "Serving cached prediction within compute interval",
                        extra={
                            "venue_id": venue_key,
                            "seconds_since_last_compute": int(delta),
                            "min_interval": self.MIN_COMPUTE_INTERVAL
                        }
                    )
                    return cached["data"]

        # ----------------------------------
        # 3️⃣ Async Lock Protection
        # ----------------------------------
        lock = self._get_lock(venue_id)
        async with lock:
            # Double-check cache after acquiring lock (prevent double compute)
            cached = self._prediction_cache.get(venue_key)
            if cached:
                age = (now - cached["timestamp"]).total_seconds()
                if age < self.CACHE_TTL_SECONDS:
                    return cached["data"]

            logger.info(
                "Computing fresh prediction",
                extra={"venue_id": venue_key}
            )

            metrics = await self._get_recent_metrics(session, venue_id)

            # Record MAE for last predictions
            y_values = [
                m.dynamic_risk_score for m in metrics
                if m.dynamic_risk_score is not None
            ]
            
            last_preds = self._last_predictions.get(venue_key)
            if last_preds and len(y_values) > 1:
                actual = y_values[-1]
                history = self._model_mae_history.setdefault(venue_key, {'reg': [], 'arima': [], 'ema': []})
                for mod in ['reg', 'arima', 'ema']:
                    err = abs(actual - last_preds[mod])
                    history[mod].append(err)
                    if len(history[mod]) > 10:
                        history[mod].pop(0)

            if len(metrics) < 5:
                last_score = y_values[-1] if len(y_values) > 0 else 0.0
                last_count = metrics[-1].avg_count if metrics else 0.0
                last_level = self._score_to_level(last_score, venue=venue, predicted_count=last_count)
                result = {
                    "predicted_level": last_level,
                    "predicted_risk_score": float(f"{last_score:.2f}"),
                    "confidence": 0.1,
                    "escalation_probability": 0.05,  # Non-zero baseline
                    "horizon_minutes": self.FORECAST_HORIZON,
                    "forecast_curve": [last_score] * self.FORECAST_HORIZON,
                    "forecast_upper_band": [last_score] * self.FORECAST_HORIZON,
                    "forecast_lower_band": [last_score] * self.FORECAST_HORIZON,
                    "confidence_band_width": 0.0,
                    "model_used": "baseline_fallback",
                    "forecast_explanation": f"Laminar is gathering initial baseline data for Venue {venue_id}. Accurate forecasting requires at least 5 data points.",
                    "incident_explanation": self.explanation_service.generate_insufficient_data_explanation(),
                    "retraining_recommended": False,
                    "holiday_context": None,
                    "weather_context": None,
                    "event_type": None,
                }
                # Cache the result even for insufficient data (prevents repeated compute)
                self._prediction_cache[venue_key] = {
                    "timestamp": now,
                    "data": result,
                }
                self._last_compute_time[venue_key] = now
                return result

            y_values = [
                m.dynamic_risk_score for m in metrics
                if m.dynamic_risk_score is not None
            ]

            # Extract timestamps for seasonality
            timestamps = [m.bucket_start for m in metrics]

            if len(y_values) < 5:
                last_score = y_values[-1] if len(y_values) > 0 else 0.0
                last_count = metrics[-1].avg_count if metrics else 0.0
                last_level = self._score_to_level(last_score, venue=venue, predicted_count=last_count)
                result = {
                    "predicted_level": last_level,
                    "predicted_risk_score": float(f"{last_score:.2f}"),
                    "confidence": 0.1,
                    "escalation_probability": 0.05,
                    "horizon_minutes": self.FORECAST_HORIZON,
                    "forecast_curve": [last_score] * self.FORECAST_HORIZON,
                    "forecast_upper_band": [last_score] * self.FORECAST_HORIZON,
                    "forecast_lower_band": [last_score] * self.FORECAST_HORIZON,
                    "confidence_band_width": 0.0,
                    "model_used": "baseline_fallback",
                    "forecast_explanation": "Stabilizing prediction models. Gathering more crowd metric samples for higher confidence.",
                    "incident_explanation": self.explanation_service.generate_insufficient_data_explanation(),
                    "retraining_recommended": False,
                    "holiday_context": None,
                    "weather_context": None,
                    "event_type": None,
                }
                self._prediction_cache[venue_key] = {
                    "timestamp": now,
                    "data": result,
                }
                self._last_compute_time[venue_key] = now
                return result

            # ==========================================================
            # Adaptive Anomaly Threshold
            # ==========================================================
            mean_y = float(sum(y_values)) / len(y_values) if y_values else 0.0
            std_y = statistics.stdev(y_values) if len(y_values) > 1 else 0

            # Adaptive threshold based on variance stability
            variance_ratio = std_y / mean_y if mean_y != 0 else 0

            # More strict if data unstable
            if variance_ratio > 0.5:
                z_threshold_high = 1.5
                z_threshold_medium = 0.8
            else:
                z_threshold_high = 2.5
                z_threshold_medium = 1.2

            # Build weights with adaptive thresholds
            weights = []
            for y in y_values:
                if std_y == 0:
                    weights.append(1)
                else:
                    diff = float((y - mean_y) / std_y)
                    z_score = diff if diff >= 0.0 else -diff

                    if z_score > z_threshold_high:
                        weights.append(0.3)  # Severe outlier
                    elif z_score > z_threshold_medium:
                        weights.append(0.6)  # Moderate outlier
                    else:
                        weights.append(1)     # Normal point

            # X values: 0..n-1
            x_values = [float(i) for i in range(len(y_values))]

            # ==========================================================
            # Weighted Linear Regression
            # ==========================================================
            slope, intercept, r_squared = self._weighted_linear_regression(
                x_values, y_values, weights
            )

            # Calculate standard deviation for confidence bands
            std_dev = statistics.stdev(y_values) if len(y_values) > 1 else 0

            # ==========================================================
            # Multi-step Forecast Curve (Regression)
            # ==========================================================
            forecast_values = []
            upper_band = []
            lower_band = []

            for i in range(1, self.FORECAST_HORIZON + 1):
                future_x = len(y_values) + i
                future_score = slope * future_x + intercept

                # Confidence margin reduces when R² is high
                margin = std_dev * (1 - r_squared)

                upper = min(100.0, float(future_score + margin))
                lower = max(0.0, float(future_score - margin))

                forecast_values.append(float(f"{future_score:.2f}"))
                upper_band.append(float(f"{upper:.2f}"))
                lower_band.append(float(f"{lower:.2f}"))

            # ==========================================================
            # ARIMA (AR1) Model (Mean-centered)
            # ==========================================================
            arima_prediction = self._ar1_forecast(y_values, mean_y)

            # ==========================================================
            # EMA (Exponential Moving Average) Model
            # ==========================================================
            ema_prediction = self._ema_forecast(y_values, alpha=0.3)

            # ==========================================================
            # Momentum Score (3-point derivative)
            # ==========================================================
            momentum_score = self._calculate_momentum_score(y_values)

            # ==========================================================
            # 3-Way Hybrid Ensemble Model Selector
            # ==========================================================
            # Store short-term prediction accuracy per venue; auto-switch models based on last 10 MAE scores
            history = self._model_mae_history.get(venue_key)
            if history and all(len(history[m]) >= 3 for m in ['reg', 'arima', 'ema']):
                # Gradient-Boosted-style: weight inversely by MAE
                reg_mae = sum(history['reg']) / len(history['reg'])
                arima_mae = sum(history['arima']) / len(history['arima'])
                ema_mae = sum(history['ema']) / len(history['ema'])
                
                # Protect against zero Division
                reg_inv = 1.0 / max(reg_mae, 0.01)
                arima_inv = 1.0 / max(arima_mae, 0.01)
                ema_inv = 1.0 / max(ema_mae, 0.01)
                
                total_inv = reg_inv + arima_inv + ema_inv
                w_reg = reg_inv / total_inv
                w_ar1 = arima_inv / total_inv
                w_ema = ema_inv / total_inv
                
                best_model = min([('regression', reg_mae), ('arima', arima_mae), ('ema', ema_mae)], key=lambda x: x[1])[0]
                model_used = f"{best_model}_ensemble"
            else:
                # Fallback to base weights
                if abs(slope) < 0.1:
                    w_reg, w_ar1, w_ema = 0.1, 0.5, 0.4
                    model_used = "arima+ema_ensemble"
                elif variance_ratio > 0.5:
                    w_reg, w_ar1, w_ema = 0.2, 0.3, 0.5
                    model_used = "ema_ensemble"
                else:
                    w_reg, w_ar1, w_ema = 0.6, 0.2, 0.2
                    model_used = "regression_ensemble"

            # Regression prediction = last forecast value
            reg_prediction = float(forecast_values[-1]) if forecast_values else mean_y

            # Ensemble weighted prediction
            predicted_score = (
                w_reg * reg_prediction
                + w_ar1 * arima_prediction
                + w_ema * ema_prediction
            )

            # Update forecast curve to blend regression + EMA for smoother bands
            for i in range(len(forecast_values)):
                ema_val = mean_y + (ema_prediction - mean_y) * (0.9 ** i)
                forecast_values[i] = round(
                    w_reg * forecast_values[i] + (w_ar1 + w_ema) * ema_val, 2
                )

            # ==========================================================
            # Seasonality Adjustment
            # ==========================================================
            season_factor = self._seasonality_adjustment(
                timestamps=timestamps,
                y_values=y_values,
            )
            predicted_score *= season_factor

            # ==========================================================
            # Event-Based Weighting (Surge Detection)
            # ==========================================================
            event_factor = self._event_weighting(y_values)
            predicted_score *= event_factor

            # ==========================================================
            # Weekend modifier (context-aware adjustment)
            # ==========================================================
            weekend_factor = self._weekend_modifier(datetime.now(timezone.utc))
            predicted_score *= weekend_factor

            # ==========================================================
            # Holiday adjustment
            # ==========================================================
            try:
                holiday_factor, holiday_info = await self._holiday_modifier()
            except Exception as e:
                logger.warning(
                    "Holiday service failed",
                    extra={"error": str(e)}
                )
                holiday_factor, holiday_info = 1.0, None

            predicted_score *= holiday_factor

            # ==========================================================
            # Weather adjustment
            # ==========================================================
            weather_factor, weather_info = 1.0, None

            if venue and getattr(venue, "latitude", None) and getattr(venue, "longitude", None):
                try:
                    weather_factor, weather_info = await self._weather_modifier(
                        latitude=venue.latitude,
                        longitude=venue.longitude
                    )
                except Exception as e:
                    logger.warning(
                        "Weather service failed",
                        extra={"error": str(e)}
                    )
                    weather_factor, weather_info = 1.0, None

            predicted_score *= weather_factor

            # ==========================================================
            # Event modifier
            # ==========================================================
            try:
                event_factor, event_type = await self.event_service.get_event_modifier(
                    session,
                    venue_id
                )
            except Exception as e:
                logger.warning(
                    "Event service failed",
                    extra={"error": str(e)}
                )
                event_factor, event_type = 1.0, None

            predicted_score *= event_factor

            # Ensure score is within bounds
            predicted_score = max(0.0, min(float(predicted_score), 100.0))

            # ==========================================================
            # PREDICTION STABILITY & SMOOTHING (MODULE 5) 
            # ==========================================================
            last_preds_for_venue = self._last_predictions.get(venue_key)
            if last_preds_for_venue and "ensemble" in last_preds_for_venue:
                last_score = last_preds_for_venue["ensemble"]
                # Limit swing to 15 points max to prevent wild jumps
                max_swing = 15.0
                if predicted_score > last_score + max_swing:
                    predicted_score = last_score + max_swing
                elif predicted_score < last_score - max_swing:
                    predicted_score = last_score - max_swing
                
                # Apply Temporal EMA over consecutive inferences (alpha=0.6)
                alpha_pred = 0.6
                predicted_score = (alpha_pred * predicted_score) + ((1.0 - alpha_pred) * last_score)
            
            predicted_score = max(0.0, min(float(predicted_score), 100.0))

            # Shift the forecast curve to smoothly align with the final clamped prediction
            if forecast_values:
                diff = predicted_score - forecast_values[0]
                for i in range(len(forecast_values)):
                    shift = diff * (0.8 ** i) # Fade out the adjustment over the horizon
                    forecast_values[i] = round(max(0.0, min(100.0, forecast_values[i] + shift)), 2)
                    upper_band[i] = round(max(0.0, min(100.0, upper_band[i] + shift)), 2)
                    lower_band[i] = round(max(0.0, min(100.0, lower_band[i] + shift)), 2)

            # Calculate predicted count for level classification
            # If the score is in [60, 90], it's roughly critical.
            # But let's use the actual forecast_curve value (which is predicted count/score)
            predicted_count = float(forecast_values[0]) if forecast_values else 0.0
            
            predicted_level = self._score_to_level(predicted_score, venue=venue, predicted_count=predicted_count)

            # ==========================================================
            # Track Prediction Error
            # ==========================================================
            if len(y_values) > 1:
                last_actual = y_values[-1]
                self._track_prediction_error(
                    venue_id=venue_id,
                    actual_value=last_actual,
                    predicted_value=predicted_score,
                )

            # ==========================================================
            # Enhanced Confidence Calculation
            # ==========================================================
            # More data = more confidence (using 20 data points as the saturation point)
            data_density_factor = min(len(y_values) / 20, 1.0)
            # Clamp variance_ratio to [0, 1] so stability stays non-zero even with noisy data
            stability_factor = max(0.1, float(1.0 - min(variance_ratio, 1.0)))

            # Base confidence from r-squared (already fixed above for flat lines)
            raw_confidence = r_squared * data_density_factor * stability_factor
            # Floor at 0.1 so early warnings can still trigger with sparse/noisy data
            confidence = max(0.1, float(f"{raw_confidence:.2f}"))

            # ==========================================================
            # Self-Calibrating Escalation Probability
            # ==========================================================
            escalation_probability = self._calculate_escalation_probability(
                slope=slope,
                variance_ratio=variance_ratio,
            )

            # ==========================================================
            # Forecast Explanation
            # ==========================================================
            forecast_explanation = self._generate_explanation(
                model_used=model_used,
                slope=slope,
                predicted_level=predicted_level,
                escalation_probability=escalation_probability,
                data_points=len(y_values),
                variance_ratio=variance_ratio,
            )

            # ==========================================================
            # Auto Retraining Detection
            # ==========================================================
            retraining_recommended = self._should_retrain(venue_id)

            # ==========================================================
            # Record prediction in monitoring service
            # ==========================================================
            error = self._prediction_history.get(str(venue_id), 0)
            self._monitor.record_prediction(
                confidence=confidence,
                error=error,
                model_used=model_used,
            )

            # ==========================================================
            # Generate incident explanation with context
            # ==========================================================
            incident_explanation = await self.explanation_service.generate_explanation(
                predicted_level=predicted_level,
                predicted_score=predicted_score,
                escalation_probability=escalation_probability,
                slope=slope,
                holiday_context=holiday_info,
                weather_context=weather_info,
                event_type=event_type,
                warning_threshold=warn_t,
                critical_threshold=crit_t,
            )

            # ==========================================================
            # Build final result with all contexts
            # ==========================================================
            result = {
                "predicted_level": predicted_level,
                "predicted_risk_score": float(f"{predicted_score:.2f}"),
                "confidence": confidence,
                "escalation_probability": float(f"{escalation_probability:.2f}"),
                "horizon_minutes": self.FORECAST_HORIZON,
                "forecast_curve": forecast_values,
                "forecast_upper_band": upper_band,
                "forecast_lower_band": lower_band,
                "confidence_band_width": float(f"{margin * 2:.2f}") if 'margin' in locals() else 0.0,
                "model_used": model_used,
                "forecast_explanation": forecast_explanation,
                "incident_explanation": incident_explanation,
                "retraining_recommended": retraining_recommended,
                "holiday_context": holiday_info,
                "weather_context": weather_info,
                "event_type": event_type,
                "momentum_score": float(f"{momentum_score:.2f}"),
            }

            self._last_predictions[venue_key] = {
                'reg': float(reg_prediction),
                'arima': float(arima_prediction),
                'ema': float(ema_prediction),
                'ensemble': float(predicted_score)
            }

            # ----------------------------------
            # Cache storage
            # ----------------------------------
            self._prediction_cache[venue_key] = {
                "timestamp": now,
                "data": result,
            }

            self._last_compute_time[venue_key] = now

            return result

        return {}

    async def get_graph_data(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> Dict[str, Any]:
        """
        Generate historical and forecasted data for the Analytics frontend.
        """
        # Get forecast risk which contains the upper/lower bands and predicted_level
        forecast = await self.forecast_risk(session, venue_id)
        
        # We need historical metrics too, ordered from oldest to newest
        history = await self._get_recent_metrics(session, venue_id)
        
        if not history:
            return {
                "status": "insufficient_data",
                "message": "No historical crowd metrics available."
            }
            
        hist_timestamps = [m.bucket_start.isoformat() for m in history]
        hist_risk_scores = [m.dynamic_risk_score for m in history]
        hist_crowd_counts = [m.avg_count for m in history]
        hist_occupancy = [m.occupancy_percent for m in history]
        
        last_timestamp = history[-1].bucket_start

        # For forecast timestamps, we generate 1 minute intervals
        forecast_timestamps = []
        for i in range(1, self.FORECAST_HORIZON + 1):
            ts = last_timestamp + timedelta(minutes=i)
            forecast_timestamps.append(ts.isoformat())
            
        return {
            "status": "success",
            "historical": {
                "timestamps": hist_timestamps,
                "risk_scores": hist_risk_scores,
                "crowd_counts": hist_crowd_counts,
                "occupancy_percents": hist_occupancy
            },
            "forecast": {
                "timestamps": forecast_timestamps,
                "predicted_scores": forecast.get("forecast_curve", []),
                "upper_band": forecast.get("forecast_upper_band", []),
                "lower_band": forecast.get("forecast_lower_band", []),
                "escalation_probs": [forecast.get("escalation_probability", 0)] * self.FORECAST_HORIZON
            },
            "meta": {
                "confidence": forecast.get("confidence", 0),
                "model_used": forecast.get("model_used", "unknown"),
                "horizon_minutes": forecast.get("horizon_minutes", self.FORECAST_HORIZON),
                "predictive_peak": max(forecast.get("forecast_curve", [0])) if forecast.get("forecast_curve") else 0
            },
            "generated_at": datetime.now(timezone.utc).isoformat()
        }

    async def _get_recent_metrics(
        self,
        session: AsyncSession,
        venue_id: UUID,
    ) -> List[CrowdMetric]:

        since = datetime.now(timezone.utc) - \
            timedelta(minutes=self.LOOKBACK_MINUTES)

        stmt = (
            select(CrowdMetric)
            .where(CrowdMetric.venue_id == venue_id)
            .where(CrowdMetric.bucket_type == "minute")
            .where(CrowdMetric.bucket_start >= since)
            .order_by(CrowdMetric.bucket_start.asc())
        )

        result = await session.execute(stmt)
        return list(result.scalars().all())

    # ==========================================================
    # Weighted Linear Regression
    # ==========================================================

    def _weighted_linear_regression(
        self,
        x: List[float],
        y: List[float],
        weights: List[float],
    ):
        """
        Proper weighted linear regression with R² calculation.
        """

        n = len(x)

        total_weight = sum(weights)

        # Handle zero weights
        if total_weight == 0:
            return 0, float(sum(y)) / len(y) if y else 0.0, 0

        weighted_mean_x = sum(
            w * xi for w, xi in zip(weights, x)) / total_weight
        weighted_mean_y = sum(
            w * yi for w, yi in zip(weights, y)) / total_weight

        numerator = sum(
            w * (x[i] - weighted_mean_x) * (y[i] - weighted_mean_y)
            for i, w in enumerate(weights)
        )

        denominator = sum(
            w * (x[i] - weighted_mean_x) ** 2
            for i, w in enumerate(weights)
        )

        if denominator == 0:
            return 0, weighted_mean_y, 0

        slope = numerator / denominator
        intercept = weighted_mean_y - slope * weighted_mean_x

        # Weighted R²
        ss_total = sum(
            w * (y[i] - weighted_mean_y) ** 2
            for i, w in enumerate(weights)
        )

        ss_residual = sum(
            w * (y[i] - (slope * x[i] + intercept)) ** 2
            for i, w in enumerate(weights)
        )

        if ss_total == 0:
            r_squared = 1.0 if ss_residual == 0 else 0.0
        else:
            r_squared = 1 - (ss_residual / ss_total)

        return slope, intercept, r_squared

    # ==========================================================
    # ARIMA (AR1) Model
    # ==========================================================

    def _ar1_forecast(self, y: List[float], mean_y: float = 0.0) -> float:
        """
        Lightweight AR(1) time-series model.
        """
        if len(y) < 3:
            return y[-1] if y else 0

        # Estimate phi (autocorrelation coefficient) with mean-centering
        numerator = sum((y[i] - mean_y - (y[i-1] - mean_y)) * (y[i-1] - mean_y) for i in range(1, len(y)))
        denominator = sum((y[i-1] - mean_y) ** 2 for i in range(1, len(y)))

        if denominator == 0:
            return y[-1]

        phi = numerator / denominator

        # AR(1) forecast: y(t+1) - mean = φ * (y(t) - mean)
        forecast = mean_y + phi * (y[-1] - mean_y)

        return forecast

    def _ema_forecast(self, y: List[float], alpha: float = 0.3) -> float:
        """
        Exponential Moving Average (EMA) one-step forecast.
        More responsive to recent data than AR1, smoother than last value.

        alpha: smoothing factor (0 < alpha < 1)
          - Higher alpha → more weight on recent data
          - Lower alpha → smoother, longer memory
        """
        if not y:
            return 0.0
        if len(y) == 1:
            return float(y[0])

        # Initialize EMA at first value
        ema = float(y[0])
        for val in y[1:]:
            ema = alpha * float(val) + (1 - alpha) * ema

        # EMA naturally predicts the next point as the current EMA
        return ema

    def _calculate_momentum_score(self, y: List[float]) -> float:
        """
        Compute a 3-point momentum score: rate of change over last 4 data points.
        Positive = accelerating upward, Negative = decelerating.
        Returned as a [-100, 100] normalized score.
        """
        if len(y) < 4:
            return 0.0

        # 3-point derivative: compare last quarter of the window
        recent = y[-1] - y[-4]

        # Normalize to [-100, 100]
        return max(-100.0, min(100.0, float(recent)))

    # ==========================================================
    # Seasonality Detection
    # ==========================================================

    def _seasonality_adjustment(
        self,
        timestamps: List[datetime],
        y_values: List[float],
    ) -> float:
        """
        Detect simple daily seasonality bias.
        Returns adjustment factor.
        """
        if len(timestamps) < 10:
            return 1.0

        hour_groups = {}

        for ts, y in zip(timestamps, y_values):
            hour = ts.hour
            if hour not in hour_groups:
                hour_groups[hour] = []
            hour_groups[hour].append(y)

        current_hour = timestamps[-1].hour

        if current_hour not in hour_groups:
            return 1.0

        current_list = hour_groups.get(current_hour, [])
        if not current_list:
            return 1.0

        hour_mean = float(sum(current_list)) / len(current_list) if current_list else 0.0
        overall_mean = float(sum(y_values)) / len(y_values) if y_values else 0.0

        if overall_mean == 0:
            return 1.0

        return hour_mean / overall_mean

    # ==========================================================
    # Event-Based Weighting
    # ==========================================================

    def _event_weighting(
        self,
        y_values: List[float],
        warning_threshold: float = 50.0,
    ) -> float:
        """
        Boost prediction during detected crowd surge.
        """
        if len(y_values) < 3:
            return 1.0

        recent_growth = y_values[-1] - y_values[-3]

        surge_trigger = warning_threshold * self._SURGE_BOOST_PCT

        if recent_growth > surge_trigger:
            return 1.2  # surge boost

        return 1.0

    # ==========================================================
    # Weekend Modifier
    # ==========================================================

    def _weekend_modifier(self, current_time: datetime) -> float:
        """
        Increase risk sensitivity during weekends.
        """
        weekday = current_time.weekday()  # 0=Mon, 6=Sun

        if weekday == 5:  # Saturday
            return 1.05
        elif weekday == 6:  # Sunday
            return 1.07

        return 1.0

    # ==========================================================
    # Holiday Modifier
    # ==========================================================

    async def _holiday_modifier(self) -> tuple[float, Optional[Dict[str, Any]]]:
        """
        Check if today is a holiday and return adjustment factor with holiday info.
        
        Returns:
            tuple: (adjustment_factor, holiday_info_dict)
        """
        holiday_info = await self.holiday_service.is_today_holiday()

        if not holiday_info or not holiday_info.get("is_holiday"):
            return 1.0, None

        # Different weight by holiday type
        holiday_type = holiday_info.get("type", "Unknown")

        if holiday_type == "National":
            return 1.15, holiday_info
        elif holiday_type == "Public":
            return 1.1, holiday_info
        else:
            return 1.05, holiday_info

    # ==========================================================
    # Prediction Error Tracking
    # ==========================================================

    def _track_prediction_error(
        self,
        venue_id: UUID,
        actual_value: float,
        predicted_value: float,
    ):
        """
        Track prediction error (MAPE).
        """
        if predicted_value == 0:
            return

        error = abs(actual_value - predicted_value) / predicted_value

        self._prediction_history[str(venue_id)] = error

        logger.debug(
            "Prediction error tracked",
            extra={
                "venue_id": str(venue_id),
                "error": float(f"{error:.3f}"),
                "actual": actual_value,
                "predicted": predicted_value,
            }
        )

    # ==========================================================
    # Auto Retraining Detection
    # ==========================================================

    def _should_retrain(self, venue_id: UUID) -> bool:
        """
        Decide if model needs recalibration.
        """
        error = self._prediction_history.get(str(venue_id))

        if error is None:
            return False

        return error > self._RETRAIN_ERROR_LIMIT  # Calibrated error threshold

    # ==========================================================
    # Self-Calibrating Escalation Probability
    # ==========================================================

    def _calculate_escalation_probability(
        self,
        slope: float,
        variance_ratio: float,
    ) -> float:
        """
        Self-calibrating escalation probability based on trend and volatility.
        """
        base = 1 / (1 + exp(-slope))

        # Increase sensitivity if unstable
        if variance_ratio > 0.5:
            base *= 1.2

        return min(base, 1)

    # ==========================================================
    # Forecast Explanation
    # ==========================================================

    def _generate_explanation(
        self,
        model_used: str,
        slope: float,
        predicted_level: str,
        escalation_probability: float,
        data_points: int,
        variance_ratio: float,
    ) -> str:
        """
        Generate human-readable explanation of the forecast.
        """
        # Trend description
        if slope > 0.5:
            trend_text = "Strong upward trend detected."
        elif slope > 0.1:
            trend_text = "Moderate upward trend."
        elif slope < -0.5:
            trend_text = "Strong downward trend."
        elif slope < -0.1:
            trend_text = "Moderate downward trend."
        else:
            trend_text = "Relatively flat trend."

        # Escalation risk
        if escalation_probability > 0.7:
            escalation_text = "High probability of escalation."
        elif escalation_probability > 0.4:
            escalation_text = "Medium probability of escalation."
        else:
            escalation_text = "Low probability of escalation."

        # Data quality
        if variance_ratio > 0.5:
            quality_text = "Data shows high volatility."
        elif variance_ratio > 0.2:
            quality_text = "Data shows moderate volatility."
        else:
            quality_text = "Data is relatively stable."

        # Model confidence
        if data_points > 30:
            model_text = "Based on 30+ minutes of historical data."
        elif data_points > 15:
            model_text = "Based on 15+ minutes of historical data."
        else:
            model_text = "Based on limited historical data."

        return (
            f"Forecast generated using {model_used.upper()} model. "
            f"Predicted risk level: {predicted_level.upper()}. "
            f"{trend_text} {escalation_text} {quality_text} {model_text}"
        )

    # ==========================================================
    # Utility Methods
    # ==========================================================

    def _score_to_level(self, score: float, venue: Optional[Venue] = None, predicted_count: Optional[float] = None) -> str:
        """
        Classify risk level dynamically based on venue thresholds.
        
        Priority:
        1. Predicted Person Count vs Venue Thresholds
        2. Dynamic Risk Score vs Venue-relative bands
        """
        # Resolve thresholds (Venue settings or standard defaults)
        if venue:
            warn = float(venue.warning_threshold) if venue.warning_threshold else ((venue.capacity * 0.70) if venue.capacity else 50.0)
            crit = float(venue.critical_threshold) if venue.critical_threshold else ((venue.capacity * 0.90) if venue.capacity else 80.0)
        else:
            warn = 50.0
            crit = 80.0

        if not venue:
            # Fallback to legacy static bands only if venue is missing
            if score >= crit: return "critical"
            if score >= warn: return "high"
            if score >= (warn * 0.5): return "medium"
            return "low"

        # If we have a predicted count, use that for direct comparison (more accurate)
        if predicted_count is not None:
            if predicted_count >= crit:
                return "critical"
            if predicted_count >= warn:
                return "high"
            if predicted_count >= (warn * 0.5):
                return "medium"
            return "low"

        # Fallback: the score is expected to be in ranges: [0-30]=low, [30-60]=medium, [60-90]=high, [90+]=critical
        # based on metric_aggregation_service.py logic.
        if score >= crit:
            return "critical"
        elif score >= warn:
            return "high"
        elif score >= (warn * 0.5):
            return "medium"
        return "low"
