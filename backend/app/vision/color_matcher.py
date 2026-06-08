"""
Laminar - Color Matcher
-----------------------
HSV-based color matching for semantic video search.

Improvements over v1:
- 16 colors (added pink, cyan, navy, brown, maroon, beige, lime, teal, violet)
- Body-zone split: torso (top 60%) and legs (bottom 40%) analysed independently
  so a "blue jeans" query matches even if the shirt is white.
- Tighter default threshold (12 %) to eliminate walls/background noise false-positives
- Returns a confidence float [0.0-1.0] instead of a plain bool so results can
  be ranked by quality.
- Multi-alias NLP lookup: 'navy blue', 'light blue', 'dark green', etc. resolve.
"""

import cv2
import numpy as np
from typing import Optional, List, Tuple

# ─────────────────────────────────────────────────────────────
# HSV colour ranges  (H: 0-180, S: 0-255, V: 0-255 in OpenCV)
# Each colour can have multiple ranges (e.g. red wraps at 0/180)
# ─────────────────────────────────────────────────────────────
COLOR_RANGES: dict = {
    "red":    [((0,   120, 60), (10,  255, 255)),  # v8: Stricter saturation (70->120)
               ((160, 120, 60), (180, 255, 255))],
    "orange": [((10,  100, 70), (24,  255, 255))],
    "yellow": [((24,  100, 70), (35,  255, 255))],
    "lime":   [((35,  80,  50), (55,  255, 255))],
    "green":  [((55,  60,  30), (90,  255, 255))],
    "teal":   [((85,  70,  30), (105, 255, 255))],
    "cyan":   [((85,  100, 70), (105, 255, 255))],
    "blue":   [((95,  100, 40), (135, 255, 255))], # v8: Much stricter saturation (50->100)
    "navy":   [((95,  120, 20), (135, 255, 120))], # v8: Higher saturation for dark blues
    "purple": [((125, 60,  30), (155, 255, 255))],
    "violet": [((130, 60,  30), (165, 255, 255))],
    "maroon": [((0,   100, 20), (12,  255, 110)),
               ((160, 100, 20), (180, 255, 110))],
    "pink":   [((140, 60,  100), (178, 255, 255)),
               ((0,   40,  160), (18,  200, 255))],
    "white":  [((0,   0,   210), (180, 40,  255))], # v8: Purer whites
    "gray":   [((0,   0,   60),  (180, 40,  200))],
    "grey":   [((0,   0,   60),  (180, 40,  200))],
    "black":  [((0,   0,   0),   (180, 255, 50))],  # v8: Lower value limit for black
    "brown":  [((5,   90,  20),  (22,  230, 160))],
    "beige":  [((15,  30,  160), (32,  90,  255))],
}

# ─────────────────────────────────────────────────────────────
# NLP aliases  →  canonical colour key
# ─────────────────────────────────────────────────────────────
_NLP_ALIASES: dict = {
    "navy blue":   "navy",
    "dark blue":   "navy",
    "light blue":  "blue",
    "sky blue":    "blue",
    "dark green":  "green",
    "light green": "lime",
    "magenta":     "pink",
    "fuchsia":     "pink",
    "crimson":     "red",
    "scarlet":     "red",
    "maroon":      "maroon",
    "olive":       "green",
    "khaki":       "beige",
    "cream":       "beige",
    "silver":      "gray",
    "charcoal":    "gray",
    "dark gray":   "gray",
    "dark grey":   "gray",
    "indigo":      "purple",
    "lavender":    "purple",
    "turquoise":   "teal",
    "aqua":        "cyan",
}


def extract_primary_color(nlp_query: str) -> Optional[str]:
    """
    Extract a canonical colour keyword from a free-text search query.

    Checks multi-word aliases first, then single-word direct matches.
    Returns None if no known colour is found.
    """
    if not nlp_query:
        return None
    q = nlp_query.lower()

    # Multi-word alias check (longest-match first)
    for alias in sorted(_NLP_ALIASES, key=len, reverse=True):
        if alias in q:
            return _NLP_ALIASES[alias]

    # Direct single-word colour match
    for colour in COLOR_RANGES:
        if colour in q:
            return colour

    return None


# ─────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────

def _colour_ratio(hsv_roi: np.ndarray, colour: str) -> float:
    """Return pixel fraction [0-1] matching `colour` inside `hsv_roi`."""
    if hsv_roi is None or hsv_roi.size == 0:
        return 0.0
    ranges: List[Tuple] = COLOR_RANGES.get(colour, [])
    if not ranges:
        return 0.0

    mask = np.zeros(hsv_roi.shape[:2], dtype=np.uint8)
    for (lo, hi) in ranges:
        mask = cv2.bitwise_or(mask, cv2.inRange(hsv_roi,
                                                  np.array(lo, np.uint8),
                                                  np.array(hi, np.uint8)))
    total = mask.shape[0] * mask.shape[1]
    return cv2.countNonZero(mask) / float(total) if total else 0.0


def _inner_roi(hsv: np.ndarray,
               x_margin: float = 0.15,
               y_top: float = 0.05,
               y_bot: float = 0.95) -> np.ndarray:
    """Return the central region of an HSV crop (strips noisy edges)."""
    h, w = hsv.shape[:2]
    x0 = int(w * x_margin)
    x1 = int(w * (1 - x_margin))
    y0 = int(h * y_top)
    y1 = int(h * y_bot)
    if x1 - x0 < 2 or y1 - y0 < 2:
        return hsv
    return hsv[y0:y1, x0:x1]


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────

def match_color_in_crop(
    crop_bgr: np.ndarray,
    target_color: str,
    threshold_ratio: float = 0.12,
) -> bool:
    """
    Returns True if the person crop contains a significant amount of
    `target_color` in either the torso or leg zone.

    threshold_ratio (default 12 %): minimum pixel fraction in ANY zone
    that qualifies as a match.  Raising this value reduces false positives.
    """
    score = color_confidence(crop_bgr, target_color, threshold_ratio)
    return score >= threshold_ratio


def color_confidence(
    crop_bgr: np.ndarray,
    target_color: str,
    threshold_ratio: float = 0.12,
) -> float:
    """
    Returns a confidence score [0.0 – 1.0] representing how strongly
    the crop matches `target_color`.

    Strategy
    --------
    1. Split the crop into torso zone (top 60 %) and legs zone (bottom 40 %).
    2. Strip 15 % horizontal margins from each zone to avoid wall bleed.
    3. Measure colour ratio in each zone.
    4. Score = max(torso_ratio, legs_ratio) so either zone can anchor a match.
       This handles "blue jeans + white shirt" → still a hit for 'blue'.
    5. Normalise so that threshold_ratio maps to 0.5 confidence.
    """
    if target_color not in COLOR_RANGES or crop_bgr is None or crop_bgr.size == 0:
        return 0.0

    hsv_full = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    h = hsv_full.shape[0]

    # Zone split
    torso_raw = hsv_full[:int(h * 0.60), :]
    legs_raw  = hsv_full[int(h * 0.60):, :]

    torso_roi = _inner_roi(torso_raw)
    legs_roi  = _inner_roi(legs_raw)

    torso_ratio = _colour_ratio(torso_roi, target_color)
    legs_ratio  = _colour_ratio(legs_roi,  target_color)

    best = max(torso_ratio, legs_ratio)

    # Normalise: at threshold → 0.5 confidence, linear above/below
    if threshold_ratio <= 0:
        return float(best)
    return min(1.0, best / (threshold_ratio * 2))

def extract_dominant_color(crop_bgr: np.ndarray) -> str:
    """
    Evaluates all known colors and returns the string name of the most prominent one.
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return "Unknown"
        
    hsv_full = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    roi = _inner_roi(hsv_full)
    
    best_color = "Unknown"
    max_ratio = 0.0
    
    for color in COLOR_RANGES:
        # Ignore grey/white/black for now unless they are extremely dominant
        ratio = _colour_ratio(roi, color)
        # Penalize monochrome colors slightly so vivid colors take precedence
        if color in ["black", "white", "gray", "grey"]:
            ratio = ratio * 0.7
            
        if ratio > max_ratio and ratio > 0.10: # Minimum 10% presence
            max_ratio = ratio
            best_color = color
            
    return best_color.capitalize()
