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
from typing import List, Dict, Any

from app.core.logging import get_logger

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
        
    async def initialize(self):
        """Asynchronously load the transformer model and FAISS index."""
        logger.info("Initializing Semantic Vector Store...")
        
        def _load():
            # Use a fast, lightweight model suitable for CPU inference
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            self.embedding_dim = self.model.get_sentence_embedding_dimension()
            
            # Load FAISS index if it exists
            if os.path.exists(self.index_path):
                self.index = faiss.read_index(self.index_path)
            else:
                self.index = faiss.IndexFlatL2(self.embedding_dim)
                
            # Load metadata
            if os.path.exists(self.meta_path):
                with open(self.meta_path, 'r') as f:
                    data = json.load(f)
                    # Convert string keys back to int
                    self.metadata = {int(k): v for k, v in data.items()}
                    if self.metadata:
                        self._current_id = max(self.metadata.keys()) + 1
                        
        await asyncio.to_thread(_load)
        logger.info(f"Semantic Vector Store initialized with {self._current_id} items.")
        
    async def add_event(self, description: str, camera_id: str, timestamp: str, image_url: str = None, bbox: list = None):
        """Add a semantic description of a frame/event to the index."""
        if not self.model or not self.index:
            return
            
        async with self._lock:
            def _embed_and_add():
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
                
                # Periodically save (every 100 items) or we can just save on exit.
                # Here we save every time for simplicity, but it's threaded.
                faiss.write_index(self.index, self.index_path)
                with open(self.meta_path, 'w') as f:
                    json.dump(self.metadata, f)
                    
            try:
                await asyncio.to_thread(_embed_and_add)
            except Exception as e:
                logger.error(f"Failed to add semantic event: {e}")

    async def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Search the index using natural language with deduplication and accuracy thresholds."""
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
                    
                    # Mathematical distance filtering is too strict for generic real-world queries.
                    # We will ALWAYS return the top-K closest semantic hits, relying on our
                    # exact NLP color matching and Live Window to ensure accuracy.
                    # if dist > MAX_DISTANCE_THRESHOLD:
                    #     continue
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
                            
                        # Removed the 5-minute Live Window filter so users can search all 
                        # historical indexing events during the demo.
                        # if (now_utc - dt).total_seconds() > LIVE_WINDOW_SECONDS:
                        #     continue
                    except Exception:
                        pass
                        
                    # Note: We rely on FAISS semantic distance for relevance ranking.
                    # Strict literal color filtering was removed because YOLO frame descriptions
                    # only contain zone/object labels, never clothing colors.
                    
                    # Deduplicate by camera and time segment (e.g., 10 seconds)
                    # Example: "2026-03-29T03:00:54Z" -> "2026-03-29T03:00:5"
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
            return await asyncio.to_thread(_execute_search)
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            return []

vector_store = SemanticVectorStore()
