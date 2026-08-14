from fastapi import APIRouter
from app.intelligence.decision_engine import DECISION_ENGINE

router = APIRouter()

@router.get("/state")
async def get_operations_state():
    """
    Returns the complete intelligence payload for the AI Operations Center.
    This includes the topological World Model, the causal Situation Analysis,
    the Forecasts, and the recommended Action Plan.
    """
    return DECISION_ENGINE.recommend()
