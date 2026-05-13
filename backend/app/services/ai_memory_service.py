"""
Laminar - AI Memory Service (Predictive RAG Context)
-----------------------------------------------------
Stores historical insights and alerts using FAISS vector search 
so the AI router can reference past patterns when generating new insights.
"""

import os
import json
import asyncio
from typing import Dict, Any, List

try:
    import faiss
    import numpy as np
    from sentence_transformers import SentenceTransformer
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False

from app.core.logging import get_logger

logger = get_logger(__name__)

MEMORY_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../ai/memory"))
INDEX_FILE = os.path.join(MEMORY_DIR, "laminar_memory.faiss")
DOCS_FILE = os.path.join(MEMORY_DIR, "laminar_docs.json")


class LaminarAIMemory:
    """Manages long-term operational memory to improve AI reasoning."""

    def __init__(self):
        self.index = None
        self.documents: List[Dict[str, Any]] = []
        self.model = None
        self._lock = asyncio.Lock()
        
        if FAISS_AVAILABLE:
            os.makedirs(MEMORY_DIR, exist_ok=True)
            self._do_lazy_load()
        else:
            logger.warning("FAISS or SentenceTransformers not available. AI Memory will be disabled.")

    def _do_lazy_load(self):
        """Synchronously load existing index and documents if they exist."""
        try:
            if os.path.exists(DOCS_FILE):
                with open(DOCS_FILE, "r", encoding="utf-8") as f:
                    self.documents = json.load(f)
            
            if os.path.exists(INDEX_FILE):
                self.index = faiss.read_index(INDEX_FILE)
            else:
                # 384 is dimension for all-MiniLM-L6-v2
                self.index = faiss.IndexFlatL2(384)
                
            logger.info(f"AI Memory initialized with {len(self.documents)} historical patterns.")
        except Exception as e:
            logger.error(f"Failed to load AI memory index: {e}")

    async def _get_model(self):
        """Asynchronously load embedding model via ML Hub."""
        if not FAISS_AVAILABLE:
            return None
        from app.core.ml_hub import ml_hub
        self.model = await ml_hub.get_embedding_model()
        return self.model

    def _format_for_embedding(self, data: dict, insight: dict = None) -> str:
        """Create a dense textual representation of the event to embed."""
        # Focus on zone, density, and trends for similarity matching
        zone = data.get("zone") or data.get("venue_name") or "Unknown Zone"
        trend = data.get("trend", "stable")
        density = data.get("crowd_density") or data.get("occupancy_percent") or 0
        
        text = f"Zone: {zone}. Density/Occupancy: {density}. Trend: {trend}. "
        
        if insight:
            if "alert" in insight: # Alert mode
                text += f"Alert: {insight.get('alert', '')} Reason: {insight.get('reason', '')}"
            else: # Insight mode
                text += f"Risk: {insight.get('risk_level', '')} Summary: {insight.get('summary', '')}"
                
        return text

    async def retrieve_similar_context_string(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Retrieve historical cases using a raw textual query (for chatbot)."""
        if not FAISS_AVAILABLE or not self.documents:
            return []

        model = await self._get_model()
        if not model or not self.index or self.index.ntotal == 0:
            return []

        def _search():
            query_embedding = model.encode([query], convert_to_numpy=True)
            distances, indices = self.index.search(query_embedding, min(top_k, self.index.ntotal))
            
            results = []
            for i, idx in enumerate(indices[0]):
                if 0 <= idx < len(self.documents):
                    if distances[0][i] < 2.0:
                        results.append(self.documents[idx])
            return results

        try:
            return await asyncio.to_thread(_search)
        except Exception as e:
            logger.error(f"Failed to retrieve AI memory context for string: {e}")
            return []

    async def store_event(self, data: dict, insight: dict):
        """Store a new event and its generated insight into memory asynchronously."""
        if not FAISS_AVAILABLE:
            return

        model = await self._get_model()
        if not model or not self.index:
            return

        text_to_embed = self._format_for_embedding(data, insight)
        
        # Offload embedding creation
        def _embed_and_add():
            embedding = model.encode([text_to_embed], convert_to_numpy=True)
            self.index.add(embedding)
            
            doc_record = {
                "scenario_text": text_to_embed,
                "data": data,
                "insight": insight
            }
            self.documents.append(doc_record)
            
            # Persist to disk
            faiss.write_index(self.index, INDEX_FILE)
            with open(DOCS_FILE, "w", encoding="utf-8") as f:
                json.dump(self.documents, f)
                
        try:
            async with self._lock:
                await asyncio.to_thread(_embed_and_add)
        except Exception as e:
            logger.error(f"Failed to store AI memory event: {e}")

    async def retrieve_similar_context(self, current_data: dict, top_k: int = 3) -> List[Dict[str, Any]]:
        """Retrieve historical cases similar to the current data point."""
        if not FAISS_AVAILABLE or not self.documents:
            return []

        model = await self._get_model()
        if not model or not self.index or self.index.ntotal == 0:
            return []

        text_to_embed = self._format_for_embedding(current_data)
        
        def _search():
            query_embedding = model.encode([text_to_embed], convert_to_numpy=True)
            distances, indices = self.index.search(query_embedding, min(top_k, self.index.ntotal))
            
            results = []
            for i, idx in enumerate(indices[0]):
                if 0 <= idx < len(self.documents):
                    # We only want logically relevant history, drop outliers by distance
                    # 384 dim typical L2 distance thresholds -> keep < 1.5 roughly
                    if distances[0][i] < 2.0: 
                        results.append(self.documents[idx])
            return results

        try:
            return await asyncio.to_thread(_search)
        except Exception as e:
            logger.error(f"Failed to retrieve AI memory context: {e}")
            return []

# Singleton instance
ai_memory = LaminarAIMemory()

def get_ai_memory() -> LaminarAIMemory:
    return ai_memory
