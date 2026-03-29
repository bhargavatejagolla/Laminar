from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel
from app.vision.vector_store import vector_store
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

class SearchResult(BaseModel):
    description: str
    camera_id: str
    timestamp: str
    image_url: str = None
    distance: float
    bbox: list = None

@router.get("/status")
async def search_status():
    """Return index statistics so the frontend can show readiness state."""
    return {
        "total_items": vector_store._current_id,
        "model_loaded": vector_store.model is not None,
    }


@router.post("/semantic", response_model=List[SearchResult])
async def search_semantic_events(request: SearchRequest):
    """
    Perform a natural language search over the video events using FAISS and Sentence-Transformers.
    """
    try:
        results = await vector_store.search(request.query, top_k=request.top_k)
        return results
    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        raise HTTPException(status_code=500, detail="Search execution failed.")
