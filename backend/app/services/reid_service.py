import numpy as np
import cv2
from typing import List

class ReIDService:
    """
    Lightweight Re-Identification service using HSV color histograms.
    In a full production environment, this would be swapped with a deep learning
    feature extractor like OSNet, ResNet50, or viT.
    """
    def __init__(self):
        # 8 bins for Hue (color type), 4 for Saturation, 4 for Value (brightness)
        # This reduces extreme sensitivity to harsh lighting changes across cameras
        self.bins = (8, 4, 4)

    def extract_embedding(self, frame: np.ndarray, bbox: List[float]) -> np.ndarray:
        """
        Extracts a normalized color histogram as a feature embedding.
        
        Args:
            frame: Full original BGR frame
            bbox: [x1, y1, x2, y2]
        """
        x1, y1, x2, y2 = map(int, bbox)
        
        # Ensure bounds
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        if x2 - x1 < 10 or y2 - y1 < 10:
            return np.zeros((512,), dtype=np.float32) # Fallback empty embedding

        crop = frame[y1:y2, x1:x2]
        hsv_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        
        # Calculate 3D histogram
        hist = cv2.calcHist([hsv_crop], [0, 1, 2], None, self.bins, [0, 180, 0, 256, 0, 256])
        
        # Normalize the histogram
        cv2.normalize(hist, hist)
        
        return hist.flatten().astype(np.float32)

    def compute_similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Computes cosine similarity between two embeddings.
        """
        if np.all(emb1 == 0) or np.all(emb2 == 0):
            return 0.0
            
        dot_product = np.dot(emb1, emb2)
        norm1 = np.linalg.norm(emb1)
        norm2 = np.linalg.norm(emb2)
        return float(dot_product / (norm1 * norm2))

reid_service = ReIDService()
