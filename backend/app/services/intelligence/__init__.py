"""
Laminar - Phase 1 Intelligence Layer
--------------------------------------

Pure-logic, real-time behavioral analytics.
No AI/ML models — all signal derivation from raw YOLO detections.

Modules:
    surge_engine      → density trend, rate-of-change, projection
    dwell_engine      → behavioral dwell analytics per zone
    flow_engine       → movement direction classification
    prediction_engine → future state projection based on historical trends
    fusion_engine     → multi-signal aggregation and conflict resolution
    temporal_stability → analyzes signal consistency over time
    venue_coordinator → orchestrates intelligence across multiple cameras/zones
    zone_orchestrator → unified per-camera intelligence snapshot
"""

from app.services.intelligence.surge_engine import SurgeIntelligenceEngine, SurgeSignal
from app.services.intelligence.dwell_engine import DwellIntelligenceEngine, DwellSignal
from app.services.intelligence.flow_engine import FlowDirectionEngine, FlowSignal
from app.services.intelligence.prediction_engine import PredictionEngine, PredictionSignal
from app.services.intelligence.fusion_engine import MultiSignalFusionEngine, FusionSignal
from app.services.intelligence.temporal_stability import TemporalStabilityEngine
from app.services.intelligence.venue_coordinator import venue_coordinator
from app.services.intelligence.zone_orchestrator import ZoneIntelligenceOrchestrator, ZoneIntelligenceSnapshot, get_zone_orchestrator

__all__ = [
    "SurgeIntelligenceEngine",
    "SurgeSignal",
    "DwellIntelligenceEngine",
    "DwellSignal",
    "FlowDirectionEngine",
    "FlowSignal",
    "PredictionEngine",
    "PredictionSignal",
    "MultiSignalFusionEngine",
    "FusionSignal",
    "TemporalStabilityEngine",
    "venue_coordinator",
    "ZoneIntelligenceOrchestrator",
    "ZoneIntelligenceSnapshot",
    "get_zone_orchestrator"
]
