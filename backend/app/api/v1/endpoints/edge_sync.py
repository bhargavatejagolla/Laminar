"""
Laminar — Edge-Federated Learning Sync Endpoints (Phase 4)
-----------------------------------------------------------
Simulates the edge model synchronisation lifecycle:
  • Edge nodes POST their local gradient deltas to /sync-model-weights
  • Central server aggregates and returns the new global model version
  • Edge nodes GET /model-status to discover the latest version

All operations are intentionally lightweight stubs so they work identically
on a local laptop and on real edge hardware — swap the aggregation function
for real FedAvg when ready.
"""

import uuid
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────────
# In-memory fleet registry (production: replace with Redis or Postgres table)
# ──────────────────────────────────────────────────────────────────────────────
_fleet: Dict[str, Dict[str, Any]] = {}
_global_model_version = "v1.0.0"
_sync_log: List[Dict[str, Any]] = []


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ──────────────────────────────────────────────────────────────────────────────
class WeightDelta(BaseModel):
    model_config = {"protected_namespaces": ()}
    edge_node_id: str
    local_samples: int
    model_version: str
    delta_checksum: Optional[str] = None   # SHA-256 of weight bytes (stub)


class ModelStatusResponse(BaseModel):
    global_version: str
    edge_nodes_registered: int
    last_sync_at: Optional[str]
    fleet: List[Dict[str, Any]]


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/sync-model-weights", summary="Edge node pushes local weight delta")
def sync_weights(payload: WeightDelta):
    """
    An edge camera/node pushes its latest local gradient delta.

    In a real FedAvg implementation the server would:
      1. Collect deltas from all registered nodes.
      2. Weight-average them by local_samples.
      3. Broadcast the new global weights.

    Here we acknowledge receipt and bump the global version.
    """
    global _global_model_version

    node_id = payload.edge_node_id
    _fleet[node_id] = {
        "node_id": node_id,
        "last_sync": datetime.now(timezone.utc).isoformat(),
        "local_samples": payload.local_samples,
        "pushed_version": payload.model_version,
        "status": "synced",
    }

    # Simulate a version bump every time enough nodes have contributed
    if len(_fleet) > 0 and random.random() < 0.3:   # 30% chance to trigger global update
        parts = _global_model_version.lstrip("v").split(".")
        parts[-1] = str(int(parts[-1]) + 1)
        _global_model_version = "v" + ".".join(parts)

    entry = {
        "sync_id": str(uuid.uuid4()),
        "node_id": node_id,
        "at": datetime.now(timezone.utc).isoformat(),
        "new_global_version": _global_model_version,
        "samples_used": payload.local_samples,
    }
    _sync_log.append(entry)

    return {
        "ok": True,
        "new_global_version": _global_model_version,
        "message": f"Weight delta from {node_id} accepted. Global model is now {_global_model_version}.",
    }


@router.get("/model-status", response_model=ModelStatusResponse, summary="Fleet-wide model health")
async def model_status():
    from app.core.database import db_manager
    from sqlalchemy import select
    from app.models.camera import Camera
    
    async with db_manager.session() as session:
        result = await session.execute(
            select(Camera).where(Camera.is_active == True, Camera.deleted_at.is_(None))
        )
        cameras = result.scalars().all()
        
        fleet_data = []
        for cam in cameras:
            # Check the in-memory mock for samples if simulated, otherwise fallback
            mock = _fleet.get(cam.name) or _fleet.get(str(cam.id))
            
            # LIVE PULSE SIMULATION: Randomly show "syncing" state to represent continuous ML
            is_syncing_now = random.random() < 0.15
            samples = mock["local_samples"] if mock else random.randint(100, 5000)
            
            if is_syncing_now:
                samples += random.randint(10, 50)
                if mock:
                    mock["local_samples"] = samples
                    
            status_tag = "syncing" if is_syncing_now else (mock["status"] if mock else "synced")
            pushed_v = mock["pushed_version"] if mock else _global_model_version
            
            # Use current time if currently syncing, otherwise use last known camera heartbeat
            sync_time = datetime.now(timezone.utc).isoformat() if is_syncing_now else (
                cam.last_heartbeat_at.isoformat() if getattr(cam, 'last_heartbeat_at', None) else (
                    cam.updated_at.isoformat() if cam.updated_at else datetime.now(timezone.utc).isoformat()
                )
            )
            
            fleet_data.append({
                "node_id": cam.name or str(cam.id)[:8],
                "last_sync": sync_time,
                "local_samples": samples,
                "pushed_version": pushed_v,
                "status": status_tag
            })
            
    last_sync = _sync_log[-1]["at"] if _sync_log else (datetime.now(timezone.utc).isoformat())

    return ModelStatusResponse(
        global_version=_global_model_version,
        edge_nodes_registered=len(fleet_data),
        last_sync_at=last_sync,
        fleet=fleet_data,
    )


@router.get("/sync-log", summary="Recent sync history (last 50 events)")
def sync_log():
    """Returns the 50 most recent sync events."""
    return {"log": _sync_log[-50:]}
