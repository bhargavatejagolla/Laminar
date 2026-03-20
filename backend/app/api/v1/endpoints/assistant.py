"""
Laminar - AI Assistant API
--------------------------
Exposes the local RAG chatbot endpoint + status/index management.
"""

from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.services.ai_assistant_service import AIAssistantService
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()

# Single service instance per worker process (holds FAISS index in memory)
ai_service = AIAssistantService()


class AssistantQueryRequest(BaseModel):
    question: str
    history: List[Dict[str, str]] = []


class AssistantQueryResponse(BaseModel):
    answer: str


@router.post("/query", response_model=AssistantQueryResponse)
async def query_assistant(
    request: AssistantQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a question to the Laminar AI assistant.
    Answers are grounded in real venue, alert, and crowd data via FAISS RAG + local Ollama.
    Falls back to a structured rule-based response when Ollama is offline.
    """
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        # Auto-index on first use if index is empty
        status = ai_service.get_status()
        if not status["index_ready"]:
            logger.info("Index not ready — auto-indexing before query...")
            try:
                await ai_service.extract_and_index(db)
            except Exception as idx_err:
                logger.warning(f"Auto-index failed (non-fatal): {idx_err}")

        answer = await ai_service.query(request.question, db, request.history)
        return AssistantQueryResponse(answer=answer)
    except Exception as e:
        logger.error("AI assistant query error", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(status_code=500, detail="AI Assistant encountered an error.")


@router.get("/status")
async def assistant_status():
    """
    Returns the current state of the AI assistant:
    - Whether Ollama is online
    - Which model is being used
    - Number of indexed documents
    - When the index was last rebuilt
    """
    status = ai_service.get_status()
    return {
        "ollama_online": status["ollama_online"],
        "model_in_use": status["model_in_use"],
        "index_documents": status["index_documents"],
        "index_ready": status["index_ready"],
        "last_indexed_at": status["last_indexed_at"],
        "faiss_available": status["faiss_available"],
        "message": (
            "Ready" if status["index_ready"]
            else "Index not built — POST /assistant/index to build it"
        ),
    }


@router.post("/index")
async def rebuild_index(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a manual re-index of the vector knowledge base from the database.
    Runs in the background so the request returns immediately.
    """
    async def _do_index():
        try:
            await ai_service.extract_and_index(db)
            logger.info("Manual re-indexing complete.")
        except Exception as e:
            logger.error(f"Manual re-indexing failed: {e}")

    background_tasks.add_task(_do_index)
    return {"status": "indexing_started", "message": "Re-indexing database in background. Check /assistant/status for progress."}
