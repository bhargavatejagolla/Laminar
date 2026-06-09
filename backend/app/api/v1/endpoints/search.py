"""
Laminar – Semantic Video Search Endpoint  (v7 – Optimized Parallel Engine)
=======================================================================
Ultra-Performance & Accuracy:
• YOLO v11m: (v6) High-precision Medium model for superior isolation.
• Parallel Scan: (v7) Uses asyncio.Semaphore(2) to process 20 snapshots in parallel.
• 4x Data Depth: (v7) 15s snapshot frequency provides much richer history.
• Extreme Timeout: (v7) 40s backend / 60s frontend safe-wait window.
• Guaranteed Stability: Bulletproof 200 [] fallback on any failure.
"""

from __future__ import annotations

import asyncio
import glob
import logging
import os
import base64
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import String, select
from sqlalchemy.orm import joinedload

from app.core.database import db_manager
from app.models.camera import Camera
from app.vision.color_matcher import color_confidence, extract_primary_color
from app.vision.detector import get_detector
from app.vision.vector_store import vector_store

logger = logging.getLogger(__name__)
router = APIRouter()

# ──────────────────────────────────────────────────────────────
# Config (v7)
# ──────────────────────────────────────────────────────────────

_ENDPOINT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(_ENDPOINT_DIR))))
_SNAPSHOT_DIR = os.path.join(_ROOT_DIR, "storage", "semantic_snapshots")

_MAX_SCAN            = 20      # Deep scan
_PIPELINE_TIMEOUT     = 40.0    # 40s (v7 Parallel safe-window)
_CROP_CONF_THRESHOLD  = 0.38
_PARALLEL_WORKERS     = 2       # Safe for CPU-based YOLOv11m

# COCO Class Mapping for multi-object search
_COCO_MAP = {
    "person": 0, "man": 0, "woman": 0, "child": 0, "individual": 0, "someone": 0,
    "bicycle": 1, "bike": 1,
    "car": 2, "vehicle": 2, "automobile": 2,
    "motorcycle": 3, "moto": 3,
    "van": 5, "bus": 5,
    "truck": 7, "lorry": 7, 
    "fire hydrant": 10,
    "stop sign": 11,
    "dog": 16, "pet": 16, "puppy": 16,
    "cat": 15, "kitten": 15,
    "bag": 24, "backpack": 24, "rucksack": 24,
    "umbrella": 25,
    "handbag": 26, "purse": 26,
    "suitcase": 28, "luggage": 28,
    "bottle": 39,
    "cup": 41, "glass": 41,
    "chair": 56, "seat": 56,
    "couch": 57, "sofa": 57,
    "tv": 62, "monitor": 62, "screen": 62,
    "laptop": 63, "computer": 63,
    "mouse": 64,
    "remote": 65,
    "keyboard": 66,
    "phone": 67, "cellphone": 67, "smartphone": 67,
    "microwave": 68,
    "oven": 69,
    "refrigerator": 72, "fridge": 72,
    "book": 73,
}

_PARALLEL_SEM = None

def _get_parallel_sem():
    global _PARALLEL_SEM
    if _PARALLEL_SEM is None:
        _PARALLEL_SEM = asyncio.Semaphore(_PARALLEL_WORKERS)
    return _PARALLEL_SEM

# ──────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

class SearchResult(BaseModel):
    id: str
    description: str
    camera_id: str
    timestamp: str
    image_url: Optional[str] = None
    confidence: float
    bbox: Optional[List[float]] = None
    distance: float = 0.0

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _parse_ts(fname: str) -> str:
    try:
        stem = os.path.splitext(os.path.basename(fname))[0]
        parts = stem.rsplit("_", 2)
        if len(parts) == 3:
            dt = datetime.strptime(f"{parts[1]}{parts[2]}", "%Y%m%d%H%M%S")
            return dt.replace(tzinfo=timezone.utc).isoformat()
    except Exception: pass
    return datetime.now(timezone.utc).isoformat()

def _parse_cam(fname: str) -> str:
    try:
        stem = os.path.splitext(os.path.basename(fname))[0]
        parts = stem.rsplit("_", 2)
        return parts[0] if len(parts) == 3 else "unknown"
    except Exception: return "unknown"

def _extract_coco_classes(query: str) -> List[int]:
    classes = set()
    q = query.lower()
    for word, cls_id in _COCO_MAP.items():
        if word in q:
            classes.add(cls_id)
    return list(classes) if classes else [0]

# ──────────────────────────────────────────────────────────────
# Core Surgical Worker (v7 Parallel)
# ──────────────────────────────────────────────────────────────

async def _yolo_surgical_task(path: str, color: Optional[str], classes: List[int], primary_label: str, query: str = ""):
    """
    Individual async worker for v7 parallel engine.
    """
    async with _get_parallel_sem():
        try:
            # 1. Image Read (In thread to not block event loop)
            def read_and_detect():
                detector = get_detector()
                frame = cv2.imread(path)
                if frame is None: return None
                return frame, detector.detect_people(frame, return_boxes=True, classes=classes)

            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, read_and_detect)
            if not result: return None
            frame, res = result

            if not res or res.count == 0:
                return None

            orig_h, orig_w = frame.shape[:2]
            best_match = None
            best_conf = 0.0

            for detection in res.bounding_boxes:
                # Require a minimum baseline YOLO confidence to filter out noise
                if detection["confidence"] < 0.40:
                    continue
                    
                x1, y1, x2, y2 = detection["bbox"]
                
                if color:
                    cx1, cy1 = int(max(0, x1)), int(max(0, y1))
                    cx2, cy2 = int(min(orig_w, x2)), int(min(orig_h, y2))
                    crop = frame[cy1:cy2, cx1:cx2]
                    if crop.size == 0: continue
                    
                    c_conf = color_confidence(crop, color, query_context=query)
                    # v8.1 Surgical Absolute: 25% YOLO / 75% Color bias (High Accuracy Mode)
                    total_conf = (detection["confidence"] * 0.25) + (c_conf * 0.75)
                    
                    if total_conf > best_conf:
                        best_conf = total_conf
                        best_match = detection
                else:
                    if detection["confidence"] > best_conf:
                        best_conf = detection["confidence"]
                        best_match = detection

            # v8.1: High Precision threshold
            threshold = 0.46 if color else 0.48
            if best_match and best_conf >= threshold:
                fname = os.path.basename(path)
                
                # Base64 Encode Crop (In thread)
                def encode_crop():
                    x1, y1, x2, y2 = best_match["bbox"]
                    cx1, cy1 = int(max(0, x1)), int(max(0, y1))
                    cx2, cy2 = int(min(orig_w, x2)), int(min(orig_h, y2))
                    crp = frame[cy1:cy2, cx1:cx2]
                    _, buf = cv2.imencode(".jpg", crp, [cv2.IMWRITE_JPEG_QUALITY, 92])
                    return base64.b64encode(buf).decode("ascii")

                img_b64 = await loop.run_in_executor(None, encode_crop)
                
                desc = primary_label.upper()
                if color: desc += f" in {color.upper()}"

                return {
                    "id": f"v8_{fname}_{best_conf}",
                    "camera_id": _parse_cam(fname),
                    "timestamp": _parse_ts(fname),
                    "image_url": f"data:image/jpeg;base64,{img_b64}",
                    "distance": round(1.0 - best_conf, 4),
                    "bbox": best_match["bbox"],
                    "confidence": round(best_conf * 100, 1),
                    "_label": desc,
                    "_file": path # for deduplication
                }
            return None
        except Exception as exc:
            logger.error(f"Worker failure on {path}: {exc}")
            return None

# ──────────────────────────────────────────────────────────────
# Pipelines
# ──────────────────────────────────────────────────────────────

async def _faiss_search(query: str, top_k: int) -> List[SearchResult]:
    try:
        results = await asyncio.wait_for(vector_store.search(query, top_k=top_k), timeout=10.0) 
        final = []
        for r in (results if isinstance(results, list) else []):
            final.append(SearchResult(
                id=str(r.get("id", "0")),
                description=r.get("metadata", {}).get("description", "Historical occurrence"),
                camera_id=r.get("camera_id", "unknown"),
                timestamp=r.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                image_url=r.get("image_url") or r.get("image_reference"),
                distance=r.get("distance", 1.0),
                confidence=round((1.0 - r.get("distance", 1.0))*100, 1),
                bbox=r.get("bbox")
            ))
        return final
    except Exception: return []

async def _enrich(hits: List[dict]) -> None:
    # Set a fallback description immediately so Pydantic validation never fails
    for h in hits:
        h["description"] = f"CRITICAL HIT! {h.get('_label', 'Object')} detected ({h.get('confidence', 0):.0f}% AI confidence)"

    try:
        cam_ids = {h["camera_id"] for h in hits if h["camera_id"] != "unknown"}
        venue_map: dict[str, str] = {}
        if cam_ids:
            async with db_manager.session() as db:
                for cid in cam_ids:
                    try:
                        res = await db.execute(
                            select(Camera).options(joinedload(Camera.venue)).where(Camera.id.cast(String).contains(cid))
                        )
                        cam = res.scalar_one_or_none()
                        if cam and cam.venue: venue_map[cid] = cam.venue.name
                    except Exception: pass
        for h in hits:
            venue = venue_map.get(h["camera_id"], "LAMINAR_HQ")
            h["description"] = f"CRITICAL HIT! {h['_label']} detected @ {venue.upper()} ({h['confidence']:.0f}% AI confidence)"
    except Exception: pass

async def _surgical_pipeline(query: str, color: Optional[str], top_k: int) -> List[SearchResult]:
    if not os.path.isdir(_SNAPSHOT_DIR): return []
    files = glob.glob(os.path.join(_SNAPSHOT_DIR, "*.jpg"))
    if not files: return []

    files.sort(key=os.path.getmtime, reverse=True)
    candidates = files[:_MAX_SCAN]
    
    classes = _extract_coco_classes(query)
    rev_map = {v: k for k, v in _COCO_MAP.items()}
    primary_label = rev_map.get(classes[0], "Object")

    logger.info(f"v7 Machine Start: {len(candidates)} surgical threads | Query: {query}")

    tasks = [_yolo_surgical_task(f, color, classes, primary_label, query) for f in candidates]
    # v8: Safety guard for parallel execution
    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as exc:
        logger.error(f"v8 Gather failed: {exc}")
        return []

    # Filter out exceptions and Nones
    raw_hits = []
    for r in results:
        if isinstance(r, dict):
            raw_hits.append(r)
        elif isinstance(r, Exception):
            logger.warning(f"Worker exception: {r}")

    # v8: Time-based deduplication and diversity filtering
    raw_hits.sort(key=lambda x: x["timestamp"], reverse=True)
    
    unique_hits = []
    last_ts_dt = None
    seen_files = set()

    for h in raw_hits:
        if h["_file"] in seen_files:
            continue
            
        # Parse timestamp for thinning (avoid hits within 20s of each other)
        try:
            curr_ts = h["timestamp"]
            # datetime.fromisoformat might be picky about 'Z' or offsets
            curr_dt = datetime.fromisoformat(curr_ts.replace('Z', '+00:00'))
            
            if last_ts_dt is not None:
                diff = abs((last_ts_dt - curr_dt).total_seconds())
                if diff < 20: # 20s gap for diversity
                    continue
            
            last_ts_dt = curr_dt
            seen_files.add(h["_file"])
            unique_hits.append(h)
        except Exception:
            # Fallback to simple uniqueness if timestamp parsing fails
            seen_files.add(h["_file"])
            unique_hits.append(h)

    # Re-sort by confidence for final ranking
    unique_hits.sort(key=lambda x: x["confidence"], reverse=True)
    
    truncated = unique_hits[:top_k]
    await _enrich(truncated)
    
    return [SearchResult(**h) for h in truncated]

# ──────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────

@router.get("/status")
async def search_status():
    snap_count = len(glob.glob(os.path.join(_SNAPSHOT_DIR, "*.jpg"))) if os.path.isdir(_SNAPSHOT_DIR) else 0
    v_count = len(vector_store.metadata)
    m_loaded = vector_store.model is not None
    return {
        "engine": "v7_optimized_beast",
        "parallel_workers": _PARALLEL_WORKERS,
        "snapshots_scanned": _MAX_SCAN,
        "timeout_limit": _PIPELINE_TIMEOUT,
        "total_items": v_count,
        "model_loaded": m_loaded,
        "semantic_snapshots": snap_count,
        "yolo_surgical": True
    }

@router.post("/semantic", response_model=List[SearchResult])
async def semantic_search(req: SearchRequest):
    query = req.query.strip()
    if not query: return []
    
    color = extract_primary_color(query)
    surgical_hit = color or len(_extract_coco_classes(query)) > 0
    
    try:
        if surgical_hit:
            return await asyncio.wait_for(_surgical_pipeline(query, color, req.top_k), timeout=_PIPELINE_TIMEOUT)
        return await _faiss_search(query, req.top_k)
    except asyncio.TimeoutError:
        logger.warning(f"v7 Parallel Pipeline timeout: {query}")
        return []
    except Exception as exc:
        logger.exception(f"v7 Search error: {exc}")
        return []
