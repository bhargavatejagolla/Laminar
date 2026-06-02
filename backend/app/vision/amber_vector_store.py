import os
import faiss
import numpy as np
import json
from typing import List, Dict, Any, Tuple
import threading
from app.core.logging import get_logger

logger = get_logger(__name__)

class AmberVectorStore:
    """
    Dedicated FAISS Vector Store for the AMBER Protocol.
    Stores Deep Learning ReID and Face embeddings for instantaneous
    cross-camera neural search.
    """
    def __init__(self, index_path: str = "storage/amber_index.faiss", meta_path: str = "storage/amber_meta.json"):
        self.index_path = index_path
        self.meta_path = meta_path
        self.dim = 512  # InsightFace and our ReID both use 512-dim
        
        # We use an L2 inner product index for fast cosine similarity (assuming normalized vectors)
        self.index = faiss.IndexFlatIP(self.dim)
        self.metadata: Dict[int, Dict[str, Any]] = {}
        self.lock = threading.Lock()
        
        self._load()
        
    def _load(self):
        os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
        with self.lock:
            if os.path.exists(self.index_path):
                self.index = faiss.read_index(self.index_path)
            if os.path.exists(self.meta_path):
                try:
                    with open(self.meta_path, "r") as f:
                        # JSON keys are strings, convert back to int
                        raw_meta = json.load(f)
                        self.metadata = {int(k): v for k, v in raw_meta.items()}
                except json.JSONDecodeError as e:
                    logger.error(f"Corrupted AMBER metadata file ignored: {e}")
                    self.metadata = {}
        logger.info(f"Loaded AMBER Vector Store with {self.index.ntotal} embeddings.")

    def _save(self):
        with self.lock:
            faiss.write_index(self.index, self.index_path)
            with open(self.meta_path, "w") as f:
                json.dump(self.metadata, f)

    def add_embedding(self, embedding: np.ndarray, meta: Dict[str, Any]):
        """Add a single normalized 512-dim embedding."""
        if embedding is None or embedding.shape != (self.dim,):
            return
            
        # Ensure L2 normalization for Inner Product (Cosine Similarity)
        embedding = embedding / np.linalg.norm(embedding)
        emb_batch = np.expand_dims(embedding, axis=0).astype(np.float32)
        
        with self.lock:
            idx = self.index.ntotal
            self.index.add(emb_batch)
            self.metadata[idx] = meta
            
        # Save periodically in a real scenario, but for now we save on every add for safety
        self._save()

    def search(self, query_embedding: np.ndarray, top_k: int = 10, threshold: float = 0.5) -> List[Dict[str, Any]]:
        """Search the FAISS index for the closest matches."""
        if self.index.ntotal == 0 or query_embedding is None:
            return []
            
        query_embedding = query_embedding / np.linalg.norm(query_embedding)
        q_batch = np.expand_dims(query_embedding, axis=0).astype(np.float32)
        
        with self.lock:
            distances, indices = self.index.search(q_batch, top_k)
            
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx != -1 and dist > threshold:
                meta = self.metadata.get(int(idx), {})
                # Distance in FlatIP with normalized vectors is the cosine similarity [0, 1]
                results.append({
                    "score": float(dist),
                    "meta": meta
                })
                
        # Sort by highest score first
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

amber_vector_store = AmberVectorStore()
