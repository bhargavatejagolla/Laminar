"""
Laminar - Model Monitoring Service
-----------------------------------

Provides observability for Prediction Engine.
Tracks model performance, drift, and stability metrics.
"""

from typing import Dict, Any
from statistics import mean
from datetime import datetime, timezone


class ModelMonitoringService:

    def __init__(self):
        self._confidence_history = []
        self._error_history = []
        self._model_usage = {"regression": 0, "arima": 0}
        self._last_updated = None

    # ==========================================================
    # Recording Methods
    # ==========================================================

    def record_prediction(
        self,
        confidence: float,
        error: float,
        model_used: str,
    ):
        self._confidence_history.append(confidence)
        self._error_history.append(error)

        if model_used in self._model_usage:
            self._model_usage[model_used] += 1

        self._last_updated = datetime.now(timezone.utc)

    # ==========================================================
    # Health Metrics
    # ==========================================================

    def get_health_summary(self) -> Dict[str, Any]:

        avg_confidence = (
            mean(self._confidence_history)
            if self._confidence_history else 0
        )

        avg_error = (
            mean(self._error_history)
            if self._error_history else 0
        )

        drift_detected = avg_error > 0.3

        return {
            "average_confidence": round(avg_confidence, 3),
            "average_error": round(avg_error, 3),
            "model_usage_distribution": self._model_usage,
            "drift_detected": drift_detected,
            "last_updated": self._last_updated.isoformat()
            if self._last_updated else None,
        }
