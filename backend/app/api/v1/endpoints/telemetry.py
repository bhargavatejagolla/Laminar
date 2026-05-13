"""
Laminar - Telemetry API
-----------------------

Exposes real-time system state from the Global State Store.
"""

from fastapi import APIRouter
from typing import Dict, Any

from app.core.global_state import GLOBAL_STATE

router = APIRouter()


@router.get("/state")
async def get_global_state():
    """
    Returns the entire real-time state of all AI domains.
    """
    return GLOBAL_STATE.get_all()


@router.get("/domain/{domain}")
async def get_domain_state(domain: str):
    """
    Returns state for a specific domain (people, parking, traffic, incident).
    """
    return GLOBAL_STATE.get_domain_state(domain)
