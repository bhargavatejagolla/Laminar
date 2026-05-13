"""
Laminar - Semantic Vector Store
-------------------------------
Provides Natural Language Video Search capabilities using FAISS.
"""

import os
import json
import faiss
import asyncio
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple

from app.core.logging import get_logger
import concurrent.futures

logger = get_logger(__name__)

class SemanticVectorStore:
    """
    Singleton FAISS Vector Store for Natural Language Search.
    Extracts semantic meaning from frame descriptions and indexes them.
    """
    
    def __init__(self, index_path: str = "storage/semantic_index.faiss", meta_path: str = "storage/semantic_meta.json"):
        self.index_path = index_path
        self.meta_path = meta_path
        
        # We will load the model asynchronously in start()
        self.model = None
        self.index = None
        
        # ID -> Metadata mapping
        self.metadata: Dict[int, Dict[str, Any]] = {}
        self._current_id = 0
        
        self._lock = asyncio.Lock()
        self._write_lock = asyncio.Lock() # Lock for index/meta modifications
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="FAISS_ML_Worker")
        
        # Dirty flag for batch saving
        self._needs_save = False
        self._save_interval = 30 # seconds
        self._last_save_time = datetime.now()
        
    async def initialize(self, load_model: bool = True):
        """Load the FAISS index and optionally the embedding model."""
        logger.info("Initializing Semantic Vector Store...")
        
        if load_model:
            from app.core.ml_hub import ml_hub
            self.model = await ml_hub.get_embedding_model()
            if self.model:
                self.embedding_dim = self.model.get_sentence_embedding_dimension()
            else:
                self.embedding_dim = 384 # Fallback
        else:
            self.embedding_dim = 384 # Assume default
            
        def _load_index():
            # Load FAISS index if it exists
            if os.path.exists(self.index_path):
                self.index = faiss.read_index(self.index_path)
            else:
                self.index = faiss.IndexFlatL2(self.embedding_dim)
                
            # Load metadata
            if os.path.exists(self.meta_path):
                with open(self.meta_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.metadata = {int(k): v for k, v in data.items()}
                    if self.metadata:
                        self._current_id = max(self.metadata.keys()) + 1
                        
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._executor, _load_index)
        
        # Initial integrity check
        is_valid, error = self.verify_integrity()
        if not is_valid:
            logger.error(f"Semantic Vector Store Integrity Failure: {error}")
        else:
            logger.info(f"Semantic Vector Store verified. ({len(self.metadata)} items)")
            
    def verify_integrity(self) -> Tuple[bool, str]:
        """Verify that FAISS index and metadata are in sync."""
        if self.index is None:
            return False, "Index not loaded"
        
        faiss_count = self.index.ntotal
        meta_count = len(self.metadata)
        
        if faiss_count != meta_count:
            return False, f"Desync detected: FAISS={faiss_count}, Metadata={meta_count}"
        
        return True, ""
        
    async def shutdown(self):
        """Cleanly shutdown the vector store's thread pool."""
        logger.info("Shutting down Semantic Vector Store executor...")
        self._executor.shutdown(wait=False)
        
    async def add_event(self, description: str, camera_id: str, timestamp: str, image_url: str = None, bbox: list = None):
        """Add a semantic description of a frame/event to the index."""
        if not self.model or not self.index:
            logger.warning("Attempted to add event but model/index not loaded.")
            return
            
        async with self._write_lock:
            def _embed_and_add():
                try:
                    # Generate embedding
                    embedding = self.model.encode([description], convert_to_numpy=True)
                    
                    # Add to FAISS index
                    self.index.add(embedding)
                    
                    # Store metadata
                    idx = self._current_id
                    self.metadata[idx] = {
                        "description": description,
                        "camera_id": str(camera_id),
                        "timestamp": timestamp,
                        "image_url": image_url,
                        "bbox": bbox
                    }
                    self._current_id += 1
                    self._needs_save = True
                    
                    # Log integrity after every 100 adds
                    if self._current_id % 100 == 0:
                        logger.info(f"Vector Store checkpoint: {self._current_id} events indexed.")
                except Exception as e:
                    logger.exception(f"Internal error during embedding/indexing: {e}")
                    raise

            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(self._executor, _embed_and_add)
                
                # Immediate save if it's been long enough or we have many pending
                if self._needs_save:
                    now = datetime.now()
                    if (now - self._last_save_time).total_seconds() > self._save_interval:
                        await self.save_index()
            except Exception as e:
                logger.error(f"Failed to add semantic event: {e}")
                raise # Re-raise to let caller know it failed

    async def save_index(self):
        """Force save of FAISS index and metadata to disk."""
        if not self._needs_save:
            return
            
        async with self._write_lock:
            def _write_to_disk():
                logger.info(f"Saving vector store to disk... ({len(self.metadata)} items)")
                faiss.write_index(self.index, self.index_path)
                with open(self.meta_path, 'w', encoding='utf-8') as f:
                    json.dump(self.metadata, f)
            
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(self._executor, _write_to_disk)
                self._needs_save = False
                self._last_save_time = datetime.now()
            except Exception as e:
                logger.error(f"CRITICAL: Failed to save index to disk: {e}")

    async def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Search the index using natural language with deduplication."""
        # Integrity check — log and return [] instead of raising
        is_valid, error = self.verify_integrity()
        if not is_valid:
            logger.warning(f"Vector Store integrity issue (returning []): {error}")
            return []

        if not self.model:
            logger.info("Lazy-loading embedding model for search...")
            try:
                await self.initialize(load_model=True)
            except Exception as exc:
                logger.warning(f"Model lazy-load failed (returning []): {exc}")
                return []

        if not self.model or not self.index or self._current_id == 0:
            return []
            
        def _execute_search():
            # Embed the query
            query_embedding = self.model.encode([query], convert_to_numpy=True)
            
            # Search FAISS with a larger pool to allow for deduplication
            search_k = min(top_k * 5, self._current_id)
            distances, indices = self.index.search(query_embedding, search_k)
            
            results = []
            seen_cameras = set()
            
            for i, idx in enumerate(indices[0]):
                if len(results) >= top_k:
                    break
                    
                if idx in self.metadata and idx != -1:
                    dist = float(distances[0][i])
                    
                    meta = self.metadata[idx].copy()
                    cam_id = meta.get("camera_id")
                    timestamp = meta.get("timestamp", "")
                    
                    # [NEW] 1. Live Data Filter
                    try:
                        # Handle python ISO format variations
                        ts_str = timestamp.replace('Z', '+00:00')
                        dt = datetime.fromisoformat(ts_str)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                    except Exception as e:
                        logger.debug(f"Timestamp parse error: {e}")
                        pass
                        
                    # Deduplicate by camera and time segment (e.g., 10 seconds)
                    time_bucket = timestamp[:18] if len(timestamp) >= 19 else str(idx)
                    dedup_key = f"{cam_id}_{time_bucket}"
                    
                    # Prevent flooding the UI with the exact same event separated by milliseconds.
                    if dedup_key in seen_cameras:
                        continue
                        
                    seen_cameras.add(dedup_key)
                    meta["distance"] = dist
                    results.append(meta)
                    
            return results
            
        try:
            # We don't strictly need a lock for search if we trust FAISS L2 is thread-safe for reads while writes happen,
            # but using _write_lock here would cause search to block during indexing.
            # However, if FAISS index is being modified (self.index.add), concurrent searches might crash if not synced.
            # Let's use the lock to be safe, as the user mentioned stability is the priority.
            async with self._write_lock:
                loop = asyncio.get_running_loop()
                return await loop.run_in_executor(self._executor, _execute_search)
        except Exception as e:
            logger.exception(f"Semantic search failed (VectorStore): {e}")
            raise

vector_store = SemanticVectorStore()
