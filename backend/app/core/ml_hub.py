
import asyncio
from typing import Optional, Any
from app.core.logging import get_logger

logger = get_logger(__name__)

class MLModelHub:
    """
    Centralized hub for shared ML models to prevent redundant memory usage 
    and optimize startup performance.
    """
    _instance: Optional['MLModelHub'] = None
    _embedding_model: Optional[Any] = None
    _lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MLModelHub, cls).__new__(cls)
        return cls._instance

    async def get_embedding_model(self) -> Any:
        """
        Get or load the shared SentenceTransformer model.
        Thread-safe and async-safe.
        """
        if self._embedding_model is not None:
            return self._embedding_model

        async with self._lock:
            # Double-check pattern
            if self._embedding_model is not None:
                return self._embedding_model

            try:
                from sentence_transformers import SentenceTransformer
                logger.info("ML_HUB: Loading shared SentenceTransformer (all-MiniLM-L6-v2) on background thread...")
                
                # Load in thread to prevent blocking asyncpg heartbeats on the main event loop
                self._embedding_model = await asyncio.to_thread(
                    SentenceTransformer, 'all-MiniLM-L6-v2'
                )
                
                logger.info("ML_HUB: Model successfully loaded into memory.")
                return self._embedding_model
            except Exception as e:
                logger.error(f"ML_HUB: Failed to load embedding model: {e}")
                return None

    def is_model_loaded(self) -> bool:
        return self._embedding_model is not None

# Singleton index
ml_hub = MLModelHub()
