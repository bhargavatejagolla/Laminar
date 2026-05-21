import numpy as np
import cv2
from typing import List, Any

class ReIDService:
    """
    Robust Re-Identification service using ResNet-18 Deep Learning Features.
    Extracts high-level 512-dimensional semantic embeddings from cropped frames,
    allowing highly robust matchings for the same identity across frames and cameras.
    """
    def __init__(self):
        import torch
        from torchvision import models, transforms
        from torchvision.models import ResNet18_Weights

        # Determine device
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Load pre-trained ResNet-18
        self.model = models.resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)
        
        # Remove the final classification layer to act as a feature extractor (512-dim output)
        self.model.fc = torch.nn.Identity()
        
        # Set explicitly to eval mode, push to device
        self.model.eval()
        self.model.to(self.device)
        
        # Standard ImageNet pre-processing (Resize, CenterCrop, Normalize)
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
        ])

    def extract_embedding(self, frame: np.ndarray, bbox: List[float]) -> np.ndarray:
        """
        Extracts a normalized deep semantic feature embedding from a cropped frame.
        
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
            return np.zeros((512,), dtype=np.float32)

        # Crop and convert BGR (OpenCV) to RGB
        crop = frame[y1:y2, x1:x2]
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        
        try:
            import torch
            import torch.nn.functional as F

            # Apply transforms: output is [3, 224, 224] Tensor
            tensor = self.transform(crop_rgb)
            # Add batch dimension: [1, 3, 224, 224]
            tensor = tensor.unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                # Extract features: [1, 512]
                embedding = self.model(tensor)
                
                # Squeeze to [512]
                embedding = embedding.squeeze().cpu()
                
                # L2 Normalize the embedding vector heavily
                embedding = F.normalize(embedding, p=2, dim=0).numpy().astype(np.float32)
                
            return embedding
        except Exception as e:
            # In case of any inference failure, fail gracefully
            return np.zeros((512,), dtype=np.float32)

    def compute_similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Computes cosine similarity between two 512-dim normalized deep embeddings.
        Returns a float between -1.0 and 1.0.
        """
        if np.all(emb1 == 0) or np.all(emb2 == 0):
            return 0.0
        
        if emb1.shape != emb2.shape:
            # Failsafe against legacy 384-dimensional HSV embeddings from previous DB state
            return 0.0
            
        # Vectors are L2 normalized, so dot product = cosine similarity
        return float(np.dot(emb1, emb2))

_reid_service = None
def get_reid_service():
    global _reid_service
    if _reid_service is None:
        _reid_service = ReIDService()
    return _reid_service

class LazyReIDService:
    def __getattr__(self, name):
        return getattr(get_reid_service(), name)

reid_service = LazyReIDService()

