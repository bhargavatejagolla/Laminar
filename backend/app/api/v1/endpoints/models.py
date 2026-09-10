"""
LAMINAR - Model Governance API Endpoints
-----------------------------------------
Exposes model registry status, descriptors, inspection, and benchmarks.
"""

from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.core.model_registry import model_registry, ModelLifecycleState

router = APIRouter()

class RegisterModelRequest(BaseModel):
    path: str
    auto_enable: bool = False

@router.get("")
async def list_models():
    """List all registered vision models with their lifecycle state and metadata."""
    return {
        "success": True,
        "models": model_registry.list_models()
    }

@router.get("/{domain}")
async def get_model(domain: str):
    """Get descriptor for a specific intelligence domain."""
    desc = model_registry.get_descriptor(domain)
    if not desc:
        raise HTTPException(404, detail=f"Domain '{domain}' not found in registry")
    return {
        "success": True,
        "model": desc.model_dump()
    }

@router.post("/register-road-weights")
async def register_road_weights(payload: RegisterModelRequest):
    """
    Inspect and register a candidate road condition weights file.
    Does NOT blindly enable it unless classes pass road defect taxonomy validation.
    """
    desc = model_registry.register_road_model(payload.path, auto_enable=payload.auto_enable)
    return {
        "success": True,
        "model": desc.model_dump()
    }

@router.post("/{domain}/benchmark")
async def benchmark_model(domain: str, runs: int = Query(5, ge=1, le=20)):
    """Benchmark model latency and effective AI FPS on system hardware."""
    res = model_registry.benchmark_model(domain, runs=runs)
    return {
        "success": True,
        "benchmark": res
    }
