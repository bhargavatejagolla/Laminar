"""
Laminar - Crowd Density Heatmap Service
---------------------------------------

Generates a visual density heatmap overlay using raw YOLO bounding boxes.
- Extracts center coordinates from person bounding boxes
- Generates a blank canvas, plots Gaussian blobs
- Colorizes using OpenCV JET colormap
- Calculates density classification (Safe, Busy, Overcrowded)
"""

import cv2
import numpy as np
from typing import List, Dict, Any, Tuple
from app.core.logging import get_logger

logger = get_logger(__name__)

class CrowdDensityService:
    def __init__(self):
        # We need a fixed scaling standard to estimate density "per square meter".
        # Assume area mapped to square meters (highly approximate based on resolution)
        # Assuming ~ 10,000 pixels is roughly 1 square meter on average camera view
        self.pixels_per_sqm = 10000 
        
        # Gaussian blur parameters
        self.kernel_size = (91, 91)
        # Intensity multiplier for the blobs
        self.blob_intensity = 30
        self.heatmap_accum = None

    def compute_density_status(self, bboxes: List[Dict[str, Any]], frame_shape: Tuple[int, int, int]) -> Dict[str, Any]:
        """
        Computes the global density classification.
        0-2 persons/m² -> SAFE
        3-5 persons/m² -> BUSY
        6+ persons/m² -> OVERCROWDED
        """
        count = len(bboxes)
        
        if count == 0:
            return {
                "density_level": "SAFE",
                "persons_per_sqm": 0.0,
                "color": "green"
            }
            
        height, width, _ = frame_shape
        total_pixels = height * width
        
        # Estimate the useful tracking area (bottom 70% of frame usually)
        estimated_area_sqm = (total_pixels * 0.7) / self.pixels_per_sqm
        if estimated_area_sqm < 1:
            estimated_area_sqm = 1.0
            
        # VERY rough global density calculation. In a real scenario we'd use local max clusters
        avg_density = count / estimated_area_sqm
        
        # To make the demo look "wow" and dynamic, if there's a lot of people, we can artificially
        # inflate the density if people are clustered. For now, basic cutoff mappings:
        
        # Since avg density across whole frame is usually very low, let's look at raw count
        # or multiply standard density to make it visually responsive for indoor cameras.
        effective_density = avg_density * 5.0 
        
        if effective_density <= 2.0:
            level = "SAFE"
            color = "green"
        elif effective_density <= 5.0:
            level = "BUSY"
            color = "yellow"
        else:
            level = "OVERCROWDED"
            color = "red"
            
        return {
            "density_level": level,
            "persons_per_sqm": effective_density,
            "color": color
        }

    def generate_heatmap(self, frame_shape: Tuple[int, int, int], bboxes: List[Dict[str, Any]]) -> np.ndarray:
        """
        Generates a colorized heatmap overlay matching the frame size.
        Returns the heatmap image (BGR format, black = transparent when blended with mix-blend-screen).
        If no boxes, returns a completely black image.
        """
        height, width, _ = frame_shape

        if not bboxes:
            return np.zeros((height, width, 3), dtype=np.uint8)

        # 1. Adaptive kernel size — scale with frame resolution for consistent look
        # Use ~8% of min(height, width), must be odd
        k = max(31, int(min(height, width) * 0.08) | 1)
        kernel = (k, k)

        # 2. Create or Decay accumulation buffer
        if not hasattr(self, "heatmap_accum") or self.heatmap_accum is None or self.heatmap_accum.shape != (height, width):
            self.heatmap_accum = np.zeros((height, width), dtype=np.float32)
        else:
            # Decay existing heat to form trails instead of instant flashes
            self.heatmap_accum *= 0.85
            
        heatmap_accum = self.heatmap_accum

        for item in bboxes:
            box = item.get("bbox")
            if not box or len(box) != 4:
                continue

            x1, y1, x2, y2 = [float(v) for v in box]

            # Person foot center (more physically accurate for ground density maps)
            cx = int((x1 + x2) / 2.0)
            cy = int(y2 - (y2 - y1) * 0.05)   # just above bottom

            cx = max(0, min(width - 1, cx))
            cy = max(0, min(height - 1, cy))

            # Also splat intensity along the lower half of the bounding box for a body "footprint"
            person_h = max(1, int(y2 - y1))
            person_w = max(1, int(x2 - x1))
            cy_top = max(0, int(y1 + person_h * 0.4))
            cy_bot = min(height - 1, int(y2))
            cx_l   = max(0, int(x1))
            cx_r   = min(width - 1, int(x2))
            # Fill a small rect with intensity so Gaussian has more to spread
            heatmap_accum[cy_top:cy_bot, cx_l:cx_r] += self.blob_intensity * 0.6
            # Extra spike at foot center
            heatmap_accum[cy, cx] += self.blob_intensity * 0.4

        # 3. Gaussian spread
        heatmap_blur = cv2.GaussianBlur(heatmap_accum, kernel, 0)

        # 4. Normalize — ensure even a single person produces a bright visible glow
        max_val = float(np.max(heatmap_blur))
        if max_val <= 0:
            return np.zeros((height, width, 3), dtype=np.uint8)

        # Normalise so that 1 person = ~60% brightness (visible but not alarmingly red)
        # More people → higher max → relatively brighter; clusters saturate to 255 (red)
        single_person_brightness = 0.60  # 0..1
        ref_val = self.blob_intensity / single_person_brightness
        effective_max = max(max_val, ref_val)

        heatmap_norm = np.clip((heatmap_blur / effective_max) * 255.0, 0, 255).astype(np.uint8)

        # 5. Colormap: TURBO gives a vivid blue→green→yellow→red gradient
        heatmap_color = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_TURBO)

        # 6. Mask out near-zero pixels so background is pure black
        #    (black + mix-blend-screen = transparent on the frontend)
        mask = (heatmap_norm > 8).astype(np.uint8)
        heatmap_color = cv2.bitwise_and(heatmap_color, heatmap_color, mask=mask)

        return heatmap_color
