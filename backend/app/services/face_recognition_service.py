import cv2
import numpy as np
from typing import List, Optional
from app.core.logging import get_logger

logger = get_logger(__name__)

class FaceRecognitionService:
    """
    Enterprise-grade Face Recognition using InsightFace (ArcFace).
    Extracts a 512-dimensional highly discriminative face embedding.
    """
    def __init__(self):
        try:
            import insightface
            from insightface.app import FaceAnalysis
            
            # Using the buffalo_l model which includes detection and recognition
            self.app = FaceAnalysis(name='buffalo_l', root='storage/insightface_models')
            # Initialize with CPU by default (provider=['CPUExecutionProvider'])
            # We can use CUDAExecutionProvider if GPU is heavily needed, but CPU is safer for threading
            self.app.prepare(ctx_id=0, det_size=(640, 640))
            self.initialized = True
            logger.info("InsightFace Face Recognition Service initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize InsightFace: {e}")
            self.initialized = False

    def extract_face_embedding(self, frame: np.ndarray, bbox: Optional[List[float]] = None) -> Optional[np.ndarray]:
        """
        Extract a 512-dim face embedding.
        If bbox is provided, it crops the person first to avoid detecting other faces in the background.
        If no face is found, returns None.
        """
        if not self.initialized or frame is None:
            return None
            
        try:
            img = frame
            # If bbox is provided, crop the person to isolate them
            if bbox is not None:
                x1, y1, x2, y2 = map(int, bbox)
                h, w = frame.shape[:2]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                
                if x2 - x1 < 20 or y2 - y1 < 20:
                    return None
                    
                img = frame[y1:y2, x1:x2]

            # Detect faces
            faces = self.app.get(img)
            
            if not faces:
                return None
                
            # If multiple faces are found in the crop (unlikely if cropped tight), take the largest one
            faces = sorted(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]), reverse=True)
            
            best_face = faces[0]
            # ArcFace embedding is typically 512-d
            embedding = best_face.normed_embedding
            
            return np.array(embedding, dtype=np.float32)
            
        except Exception as e:
            logger.error(f"Face extraction error: {e}")
            return None

_face_service = None
def get_face_service():
    global _face_service
    if _face_service is None:
        _face_service = FaceRecognitionService()
    return _face_service

class LazyFaceService:
    def __getattr__(self, name):
        return getattr(get_face_service(), name)

face_service = LazyFaceService()
