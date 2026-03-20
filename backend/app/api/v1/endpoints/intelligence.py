"""
Laminar - AI Intelligence Engine API
--------------------------------------
Exposes the Laminar AI Intelligence Engine for real-time crowd operations analysis.

Endpoints:
  GET  /intelligence/system      → System-wide intelligence overview
  GET  /intelligence/venue/{id}  → Full venue intelligence report (Situation/Trends/Risk/Prediction/Actions)
  GET  /intelligence/status      → Engine status (model, online state)
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logging import get_logger
from app.services.laminar_intelligence_service import laminar_intelligence

logger = get_logger(__name__)
router = APIRouter()


@router.get("/status")
async def intelligence_status():
    """
    Get the current status of the Laminar AI Intelligence Engine.
    Returns whether Llama 3.2 is online, which model is in use, and engine health.
    """
    return {
        "engine": "Laminar AI Intelligence Engine",
        "llm_online": laminar_intelligence._ollama_online,
        "model_in_use": laminar_intelligence._cached_model or "rule-based-fallback",
        "capabilities": [
            "Real-time crowd pattern analysis",
            "Multi-camera correlation",
            "Predictive risk assessment",
            "Operational recommendations",
            "Structured intelligence reports",
        ],
        "intelligence_format": {
            "situation_analysis": "Current crowd conditions description",
            "observed_trends": "Detected patterns across cameras and metrics",
            "risk_assessment": "Risk classification with reasoning",
            "predicted_outcome": "Probabilistic near-term crowd state forecast",
            "recommended_actions": "Specific operational actions for responders",
        }
    }


@router.get("/system")
async def system_intelligence(db: AsyncSession = Depends(get_db)):
    """
    Generate a system-wide intelligence overview across all active venues.
    
    Returns live crowd totals, active alert counts, and overall system threat status.
    """
    try:
        result = await laminar_intelligence.get_system_intelligence(db)
        return result
    except Exception as e:
        logger.error(f"System intelligence generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Intelligence engine error: {str(e)}")


@router.get("/venue/{venue_id}")
async def venue_intelligence(venue_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Generate a full operational intelligence report for a specific venue.
    
    Returns a structured report with:
    - Situation Analysis
    - Observed Trends (cross-camera patterns)
    - Risk Assessment
    - Predicted Outcome
    - Recommended Actions
    
    Powered by Llama 3.2 (via Ollama) if available, with rule-based fallback.
    """
    try:
        intel = await laminar_intelligence.analyze_venue(db, venue_id)
        return {
            "venue_id": str(venue_id),
            **intel.to_dict()
        }
    except Exception as e:
        logger.error(f"Venue intelligence generation failed for {venue_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Intelligence engine error: {str(e)}")


@router.get("/venue/{venue_id}/text")
async def venue_intelligence_text(venue_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Generate a full operational intelligence report as formatted text.
    
    Useful for displaying in terminals, emails, or raw text dashboards.
    """
    try:
        intel = await laminar_intelligence.analyze_venue(db, venue_id)
        return {
            "venue_id": str(venue_id),
            "report": intel.to_text(),
            "generated_by": intel.generated_by,
            "timestamp": intel.timestamp,
        }
    except Exception as e:
        logger.error(f"Venue intelligence text generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Intelligence engine error: {str(e)}")
