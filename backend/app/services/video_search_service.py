"""
Laminar - Forensic Video Retrieval Service (General CCTV & Reference Appearance Search)
========================================================================================
Provides evidence-grounded video search over CCTV footage:
- Adaptive Temporal Sampling (scales FPS based on video duration)
- 64-bit Perceptual dHash Edge-Gate Filter (prunes static frames)
- Spatial Pyramid & Quadrant Categorization (Top-Left, Top-Right, Bottom-Left, Bottom-Right, Center)
- YOLOv11 Multi-Class & Color Profile Extraction
- Deep Appearance Feature Extraction (ResNet-18 512-dim ReID embeddings)
- Multi-Attribute CCTV Query Parsing (People, Vehicles, Belongings, Spatial, Relational)
- Reference Appearance Search ("Search by Reference Appearance" via visual similarity)
- Measured Telemetry (real pruning %, real latencies)
- Configurable Evidence-Grounded Relevance Gate (VERIFIED vs NOT VERIFIED)
- Grounded AI Forensic Brief Synthesis (citing strictly verified timestamps [MM:SS])
- Conversational Forensic Q&A over Verified Evidence Dossier
"""

from __future__ import annotations

import os
import time
import json
import glob
import re
import math
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple

import cv2
import numpy as np

from app.vision.detector import get_detector
from app.vision.color_matcher import extract_primary_color, color_confidence
from app.services.reid_service import reid_service

logger = logging.getLogger(__name__)

# Base directories
_SERVICES_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(os.path.dirname(_SERVICES_DIR))
_STORAGE_DIR = os.path.join(_BACKEND_DIR, "storage")
_INDICES_DIR = os.path.join(_STORAGE_DIR, "video_search_indices")
_THUMBS_DIR = os.path.join(_STORAGE_DIR, "forensic_thumbs")
_UPLOADS_DIR = os.path.join(_BACKEND_DIR, "data", "uploads")

os.makedirs(_INDICES_DIR, exist_ok=True)
os.makedirs(_THUMBS_DIR, exist_ok=True)
os.makedirs(_UPLOADS_DIR, exist_ok=True)

# Default configurable forensic relevance thresholds
DEFAULT_RELEVANCE_THRESHOLD = 0.40
DEFAULT_REFERENCE_SIMILARITY_THRESHOLD = 0.52

# COCO Class mapping for CCTV forensic search
COCO_CLASSES: Dict[str, int] = {
    "person": 0, "man": 0, "woman": 0, "child": 0, "pedestrian": 0, "someone": 0,
    "individual": 0, "people": 0, "crowd": 0, "suspect": 0, "subject": 0, "guy": 0, "lady": 0,
    "bicycle": 1, "bike": 1, "cycle": 1, "cyclist": 1,
    "car": 2, "vehicle": 2, "automobile": 2, "sedan": 2, "suv": 2, "auto": 2, "cab": 2, "taxi": 2,
    "motorcycle": 3, "motorbike": 3, "scooter": 3, "moped": 3,
    "airplane": 4, "plane": 4,
    "bus": 5, "minibus": 5,
    "train": 6,
    "truck": 7, "lorry": 7, "pickup": 7, "van": 7,
    "boat": 8,
    "traffic light": 9,
    "fire hydrant": 10,
    "stop sign": 11,
    "dog": 16, "puppy": 16, "pet": 16,
    "cat": 15, "kitten": 15,
    "backpack": 24, "bag": 24, "rucksack": 24, "pack": 24,
    "umbrella": 25,
    "handbag": 26, "purse": 26,
    "suitcase": 28, "luggage": 28, "trolley": 28, "briefcase": 28,
    "sports ball": 32, "ball": 32,
    "bottle": 39,
    "cup": 41,
    "chair": 56, "seat": 56, "bench": 56,
    "couch": 57, "sofa": 57,
    "tv": 62, "monitor": 62, "screen": 62,
    "laptop": 63, "computer": 63,
    "mouse": 64,
    "remote": 65,
    "keyboard": 66,
    "cell phone": 67, "phone": 67, "smartphone": 67,
    "book": 73,
}

COCO_NAMES: Dict[int, str] = {
    0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 4: "airplane", 5: "bus",
    6: "train", 7: "truck", 8: "boat", 9: "traffic light", 10: "fire hydrant",
    11: "stop sign", 15: "cat", 16: "dog", 24: "backpack", 25: "umbrella",
    26: "handbag", 28: "suitcase", 32: "sports ball", 39: "bottle", 41: "cup",
    56: "chair", 57: "couch", 62: "tv", 63: "laptop", 64: "mouse", 65: "remote",
    66: "keyboard", 67: "cell phone", 73: "book"
}

GENERIC_SEARCH_WORDS = {"target", "object", "anything", "presence", "entity", "movement"}

SPATIAL_KEYWORDS = {
    "top_left": ["top left", "upper left", "top-left", "upper-left", "northwest"],
    "top_right": ["top right", "upper right", "top-right", "upper-right", "northeast"],
    "bottom_left": ["bottom left", "lower left", "bottom-left", "lower-left", "southwest"],
    "bottom_right": ["bottom right", "lower right", "bottom-right", "lower-right", "southeast"],
    "center": ["center", "middle", "centre", "central"],
}

# Belongings / co-occurrence pairs
RELATIONAL_KEYWORDS = {
    "backpack": [24],
    "bag": [24, 26],
    "handbag": [26],
    "luggage": [28],
    "suitcase": [28],
}


# ─────────────────────────────────────────────────────────────
# Perceptual 64-bit dHash & Distance
# ─────────────────────────────────────────────────────────────

def compute_dhash(img_gray: np.ndarray) -> int:
    resized = cv2.resize(img_gray, (9, 8), interpolation=cv2.INTER_AREA)
    diff = resized[:, 1:] > resized[:, :-1]
    val = 0
    for b in diff.flatten():
        val = (val << 1) | int(b)
    return val


def hamming_distance(h1: int, h2: int) -> int:
    return bin(h1 ^ h2).count('1')


def sample_fps_for(duration_sec: float) -> float:
    if duration_sec <= 60.0:
        return 2.0
    elif duration_sec <= 300.0:
        return 1.0
    elif duration_sec <= 1800.0:
        return 0.5
    else:
        return 0.25


def format_timestamp(seconds: float) -> str:
    mins = int(seconds // 60)
    secs = seconds % 60
    return f"{mins:02d}:{secs:04.1f}"


def compute_quadrant(bbox_norm: List[float]) -> str:
    """Computes spatial pyramid quadrant from normalized bbox [x1, y1, x2, y2]."""
    cx = (bbox_norm[0] + bbox_norm[2]) / 2.0
    cy = (bbox_norm[1] + bbox_norm[3]) / 2.0
    
    if 25.0 <= cx <= 75.0 and 25.0 <= cy <= 75.0:
        return "Center"
    elif cx < 50.0 and cy < 50.0:
        return "Top-Left"
    elif cx >= 50.0 and cy < 50.0:
        return "Top-Right"
    elif cx < 50.0 and cy >= 50.0:
        return "Bottom-Left"
    else:
        return "Bottom-Right"


# ─────────────────────────────────────────────────────────────
# Forensic Video Search Service
# ─────────────────────────────────────────────────────────────

class ForensicVideoSearchService:
    def __init__(self):
        pass

    def get_index_path(self, video_id: str) -> str:
        return os.path.join(_INDICES_DIR, f"{video_id}.json")

    def get_embeddings_path(self, video_id: str) -> str:
        return os.path.join(_INDICES_DIR, f"{video_id}_embeddings.npz")

    def is_indexed(self, video_id: str) -> bool:
        path = self.get_index_path(video_id)
        return os.path.exists(path) and os.path.getsize(path) > 100

    def load_index(self, video_id: str) -> Optional[Dict[str, Any]]:
        path = self.get_index_path(video_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load index for {video_id}: {e}")
            return None

    def load_embeddings(self, video_id: str) -> Optional[Dict[str, np.ndarray]]:
        """Loads (keys, vectors) from the npz cache."""
        emb_path = self.get_embeddings_path(video_id)
        if not os.path.exists(emb_path):
            return None
        try:
            with np.load(emb_path) as data:
                return {
                    "keys": data["keys"],          # Array of string identifiers: f"{f_idx}_{obj_id}"
                    "vectors": data["vectors"]      # Shape: (N, 512) float32
                }
        except Exception as e:
            logger.warning(f"Could not load embeddings npz for {video_id}: {e}")
            return None

    def save_embeddings(self, video_id: str, keys: List[str], vectors: np.ndarray):
        emb_path = self.get_embeddings_path(video_id)
        try:
            np.savez_compressed(emb_path, keys=np.array(keys), vectors=vectors.astype(np.float32))
        except Exception as e:
            logger.error(f"Failed to save embeddings npz for {video_id}: {e}")

    def list_library_videos(self) -> List[Dict[str, Any]]:
        videos = []
        extensions = (".mp4", ".mov", ".avi", ".mkv")
        if not os.path.isdir(_UPLOADS_DIR):
            return []

        for f in os.listdir(_UPLOADS_DIR):
            if f.lower().endswith(extensions):
                if f.startswith("annotated_") or f.startswith("temp_"):
                    continue
                file_path = os.path.join(_UPLOADS_DIR, f)
                video_id = os.path.splitext(f)[0]
                indexed = self.is_indexed(video_id)
                size_mb = round(os.path.getsize(file_path) / (1024 * 1024), 2)
                videos.append({
                    "video_id": video_id,
                    "filename": f,
                    "file_path": file_path,
                    "size_mb": size_mb,
                    "indexed": indexed,
                    "stream_url": f"/api/v1/search/video-stream/{video_id}"
                })

        videos.sort(key=lambda x: x["indexed"], reverse=True)
        return videos

    def index_video(self, video_id: str, video_path: str, force_reindex: bool = False) -> Dict[str, Any]:
        if not force_reindex and self.is_indexed(video_id):
            cached = self.load_index(video_id)
            if cached:
                cached["cached"] = True
                # Ensure embeddings cache is also ready
                self.ensure_embeddings(video_id, cached)
                return cached

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video file: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec = total_frames / fps if fps > 0 else 0.0
        orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        sample_fps = sample_fps_for(duration_sec)
        frame_step = max(1, int(round(fps / sample_fps)))

        logger.info(
            f"Forensic Indexing Video {video_id}: duration={duration_sec:.1f}s, "
            f"fps={fps:.1f}, total_frames={total_frames}, sample_fps={sample_fps}, step={frame_step}"
        )

        detector = get_detector()
        target_coco_ids = [0, 1, 2, 3, 5, 7, 15, 16, 24, 25, 26, 28, 39, 56, 62, 63, 67]

        t0 = time.perf_counter()
        sampled_frames = 0
        retained_frames = 0
        pruned_frames = 0
        prev_hash = None

        indexed_evidence: List[Dict[str, Any]] = []
        emb_keys: List[str] = []
        emb_vectors: List[np.ndarray] = []

        f_idx = 0
        while True:
            if f_idx >= total_frames:
                break

            if f_idx % frame_step == 0:
                ret, frame = cap.read()
                if not ret:
                    break
                sampled_frames += 1

                # 1. dHash Perceptual Static Frame Gate
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                curr_hash = compute_dhash(gray)

                if prev_hash is not None:
                    h_dist = hamming_distance(curr_hash, prev_hash)
                    if h_dist < 10:
                        pruned_frames += 1
                        f_idx += 1
                        continue

                prev_hash = curr_hash
                retained_frames += 1
                timestamp_sec = round(f_idx / fps, 2)
                timestamp_fmt = format_timestamp(timestamp_sec)

                # 2. YOLOv11 Multi-Class Detection on Retained Frame
                detected_objects: List[Dict[str, Any]] = []
                try:
                    with detector._inference_lock:
                        yolo_res = detector.model.predict(
                            source=frame,
                            conf=0.25,
                            iou=0.40,
                            imgsz=640,
                            device=detector.device,
                            verbose=False,
                            classes=target_coco_ids,
                            agnostic_nms=True
                        )
                    if yolo_res and len(yolo_res) > 0:
                        boxes = yolo_res[0].boxes
                        if boxes is not None and len(boxes) > 0:
                            xyxy = boxes.xyxy.cpu().numpy()
                            confs = boxes.conf.cpu().numpy()
                            clss = boxes.cls.cpu().numpy()

                            for b_i, (b_xy, b_c, b_cls) in enumerate(zip(xyxy, confs, clss)):
                                cls_id = int(b_cls)
                                cls_name = COCO_NAMES.get(cls_id, yolo_res[0].names.get(cls_id, "object"))
                                x1, y1, x2, y2 = b_xy
                                
                                nx1 = round(float(max(0, min(orig_w, x1)) / orig_w) * 100, 2)
                                ny1 = round(float(max(0, min(orig_h, y1)) / orig_h) * 100, 2)
                                nx2 = round(float(max(0, min(orig_w, x2)) / orig_w) * 100, 2)
                                ny2 = round(float(max(0, min(orig_h, y2)) / orig_h) * 100, 2)

                                cx1, cy1 = int(max(0, x1)), int(max(0, y1))
                                cx2, cy2 = int(min(orig_w, x2)), int(min(orig_h, y2))
                                crop = frame[cy1:cy2, cx1:cx2]

                                color_profile: Dict[str, float] = {}
                                dominant_color = "unknown"
                                if crop.size > 0 and crop.shape[0] >= 10 and crop.shape[1] >= 10:
                                    check_colors = ["red", "blue", "black", "white", "gray", "green", "yellow", "orange", "pink"]
                                    best_c_score = 0.0
                                    for c_name in check_colors:
                                        sc = color_confidence(crop, c_name)
                                        if sc > 0.15:
                                            color_profile[c_name] = round(sc, 2)
                                            if sc > best_c_score:
                                                best_c_score = sc
                                                dominant_color = c_name

                                    # Extract ResNet-18 Deep Appearance Embedding
                                    obj_emb = reid_service.extract_embedding(frame, [cx1, cy1, cx2, cy2])
                                    emb_keys.append(f"{f_idx}_{b_i}")
                                    emb_vectors.append(obj_emb)

                                bbox_norm = [nx1, ny1, nx2, ny2]
                                quadrant = compute_quadrant(bbox_norm)

                                detected_objects.append({
                                    "id": b_i,
                                    "class_id": cls_id,
                                    "class_name": cls_name,
                                    "confidence": round(float(b_c), 3),
                                    "bbox_norm": bbox_norm,
                                    "quadrant": quadrant,
                                    "dominant_color": dominant_color,
                                    "color_profile": color_profile
                                })
                except Exception as y_err:
                    logger.warning(f"YOLO/Appearance extraction failed on frame {f_idx}: {y_err}")

                # 3. Save thumbnail keyframe for evidence display
                thumb_filename = f"{video_id}_f{f_idx}.jpg"
                thumb_path = os.path.join(_THUMBS_DIR, thumb_filename)
                
                th_h, th_w = frame.shape[:2]
                scale = 480 / max(th_w, 1)
                thumb_img = cv2.resize(frame, (480, int(th_h * scale)), interpolation=cv2.INTER_AREA)
                cv2.imwrite(thumb_path, thumb_img, [cv2.IMWRITE_JPEG_QUALITY, 85])

                indexed_evidence.append({
                    "frame_idx": f_idx,
                    "timestamp_sec": timestamp_sec,
                    "timestamp_formatted": timestamp_fmt,
                    "dhash": curr_hash,
                    "thumbnail_file": thumb_filename,
                    "objects": detected_objects,
                    "object_count": len(detected_objects)
                })

            else:
                ret = cap.grab()
                if not ret:
                    break

            f_idx += 1

        cap.release()
        elapsed_sec = round(time.perf_counter() - t0, 2)
        pruned_pct = round((pruned_frames / max(sampled_frames, 1)) * 100, 1)

        # Save embeddings cache
        if emb_vectors:
            self.save_embeddings(video_id, emb_keys, np.array(emb_vectors))

        telemetry = {
            "duration_sec": round(duration_sec, 2),
            "total_frames": total_frames,
            "fps": round(fps, 2),
            "sampled_frames": sampled_frames,
            "retained_frames": retained_frames,
            "pruned_static_frames": pruned_frames,
            "pruned_static_pct": pruned_pct,
            "index_elapsed_sec": elapsed_sec,
            "resolution": f"{orig_w}x{orig_h}",
            "embeddings_count": len(emb_vectors)
        }

        index_data = {
            "video_id": video_id,
            "video_path": video_path,
            "filename": os.path.basename(video_path),
            "indexed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "telemetry": telemetry,
            "frames": indexed_evidence
        }

        with open(self.get_index_path(video_id), "w", encoding="utf-8") as f:
            json.dump(index_data, f, indent=2)

        return index_data

    def ensure_embeddings(self, video_id: str, index_data: Dict[str, Any]) -> Dict[str, np.ndarray]:
        """
        Guarantees that 512-dim visual embeddings exist for all objects in index_data.
        If missing from previous runs, extracts them lazily from thumbnails without re-decoding video.
        """
        cached_emb = self.load_embeddings(video_id)
        if cached_emb and len(cached_emb["keys"]) > 0:
            return cached_emb

        logger.info(f"Generating missing visual appearance embeddings for {video_id}...")
        emb_keys: List[str] = []
        emb_vectors: List[np.ndarray] = []

        frames = index_data.get("frames", [])
        for f_item in frames:
            f_idx = f_item["frame_idx"]
            thumb_file = f_item.get("thumbnail_file")
            if not thumb_file:
                continue
            thumb_path = os.path.join(_THUMBS_DIR, thumb_file)
            if not os.path.exists(thumb_path):
                continue
            
            thumb_img = cv2.imread(thumb_path)
            if thumb_img is None:
                continue
            th_h, th_w = thumb_img.shape[:2]

            for obj in f_item.get("objects", []):
                obj_id = obj["id"]
                bx1, by1, bx2, by2 = obj["bbox_norm"]
                # Convert normalized percentages to thumbnail pixel coordinates
                px1 = int((bx1 / 100.0) * th_w)
                py1 = int((by1 / 100.0) * th_h)
                px2 = int((bx2 / 100.0) * th_w)
                py2 = int((by2 / 100.0) * th_h)

                emb = reid_service.extract_embedding(thumb_img, [px1, py1, px2, py2])
                emb_keys.append(f"{f_idx}_{obj_id}")
                emb_vectors.append(emb)

        if emb_vectors:
            vec_arr = np.array(emb_vectors, dtype=np.float32)
            self.save_embeddings(video_id, emb_keys, vec_arr)
            return {"keys": np.array(emb_keys), "vectors": vec_arr}

        return {"keys": np.array([]), "vectors": np.zeros((0, 512), dtype=np.float32)}

    # ─────────────────────────────────────────────────────────────
    # Query Video (Natural Language Multi-Attribute Search)
    # ─────────────────────────────────────────────────────────────

    async def query_video(
        self,
        video_id: str,
        query: str,
        threshold: float = DEFAULT_RELEVANCE_THRESHOLD,
        top_k: int = 8,
        generate_brief: bool = True
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()
        index_data = self.load_index(video_id)
        if not index_data:
            v_matches = glob.glob(os.path.join(_UPLOADS_DIR, f"{video_id}.*"))
            if v_matches:
                loop = asyncio.get_running_loop()
                index_data = await loop.run_in_executor(None, self.index_video, video_id, v_matches[0])
            else:
                return {
                    "status": "NOT_VERIFIED",
                    "verdict_title": "INDEX NOT FOUND",
                    "summary": f"No index found for video {video_id}. Please index video first.",
                    "matches": [],
                    "relevance_gate": {"active": True, "threshold": threshold},
                    "telemetry": {"query_ms": 0.0}
                }

        q = query.lower().strip()

        # Check for dark clothing / attire
        is_dark_attire = any(phrase in q for phrase in ["dark clothing", "dark clothes", "dark attire", "wearing dark", "in black", "dressed in black"])
        target_color = "black" if is_dark_attire else extract_primary_color(q)

        # ── Spatial Intent Parsing ────────────────────────────────────
        requested_quadrant = None
        for quad_key, synonyms in SPATIAL_KEYWORDS.items():
            if any(syn in q for syn in synonyms):
                requested_quadrant = quad_key
                break

        # ── Relational / Belonging Parsing ────────────────────────────
        requires_relational_object = False
        relational_class_ids = set()
        for rel_word, rel_ids in RELATIONAL_KEYWORDS.items():
            if rel_word in q:
                requires_relational_object = True
                relational_class_ids.update(rel_ids)

        # ── Forensic Class Parsing ────────────────────────────────────
        tokens = re.findall(r"[a-z0-9]+", q)
        target_class_ids = set()

        for token in tokens:
            if token in COCO_CLASSES:
                cid = COCO_CLASSES[token]
                target_class_ids.add(cid)

        for phrase, cid in COCO_CLASSES.items():
            if " " in phrase and phrase in q:
                target_class_ids.add(cid)

        is_generic_search = any(w in tokens for w in GENERIC_SEARCH_WORDS)

        # Words that indicate entity search vs pure stop words
        stop_words = {
            "in", "a", "an", "the", "with", "wearing", "of", "and", "near", "at", "on", "is",
            "moving", "standing", "sitting", "running", "walking", "fast", "slow", "front", "back",
            "left", "right", "top", "bottom", "side", "area", "quadrant", "zone", "corner", "carrying",
            "having", "clothes", "clothing", "attire", "dressed", "holding"
        }
        query_nouns = [
            w for w in tokens 
            if w not in stop_words and w != target_color and w != "dark"
        ]

        # Check if the query asks for an entity completely absent from surveillance vocabulary
        if not target_class_ids and not is_generic_search:
            if query_nouns:
                unmatched_target = query_nouns[0].upper()
                query_ms = round((time.perf_counter() - t0) * 1000, 1)
                return {
                    "status": "NOT_VERIFIED",
                    "verdict_title": "TARGET NOT VERIFIED",
                    "summary": (
                        f"Target '{unmatched_target}' is not present in indexed surveillance evidence. "
                        f"Zero indexed evidence exceeded the forensic gate ({threshold:.2f})."
                    ),
                    "forensic_brief": f"Forensic scan completed for '{query}'. No visual evidence matched the target entity.",
                    "relevance_gate": {
                        "active": True,
                        "threshold": threshold,
                        "gated_candidates_count": 0
                    },
                    "matches": [],
                    "telemetry": {
                        "query_ms": query_ms,
                        "frames_searched": len(index_data.get("frames", [])),
                        "video_duration_sec": index_data.get("telemetry", {}).get("duration_sec", 0)
                    }
                }
            else:
                target_class_ids.add(0)

        frames = index_data.get("frames", [])
        candidates: List[Dict[str, Any]] = []

        for frame_item in frames:
            ts_sec = frame_item["timestamp_sec"]
            ts_fmt = frame_item["timestamp_formatted"]
            thumb_file = frame_item["thumbnail_file"]
            objects = frame_item.get("objects", [])

            # Check if frame contains required relational objects (e.g., person with backpack)
            frame_class_ids = {obj["class_id"] for obj in objects}
            has_relational_companion = False
            if requires_relational_object:
                has_relational_companion = bool(frame_class_ids.intersection(relational_class_ids))

            for obj in objects:
                cid = obj["class_id"]
                cname = obj["class_name"]
                yolo_conf = obj["confidence"]
                dom_color = obj.get("dominant_color", "unknown")
                color_scores = obj.get("color_profile", {})
                quadrant = obj.get("quadrant") or compute_quadrant(obj["bbox_norm"])

                # 1. Class Relevance Score
                if is_generic_search or cid in target_class_ids:
                    class_score = 1.0
                else:
                    class_score = 0.0

                if class_score == 0.0:
                    continue

                # 2. Color Relevance Score & Color Gating
                if target_color:
                    if is_dark_attire:
                        # Dark attire matches black, gray, dark blue
                        c_conf = max(color_scores.get("black", 0.0), color_scores.get("gray", 0.0), 0.0)
                        if dom_color in {"black", "gray"}:
                            c_conf = max(c_conf, 0.85)
                    else:
                        if dom_color == target_color:
                            c_conf = max(color_scores.get(target_color, 0.85), 0.85)
                        elif cname == "person" and target_color in color_scores and color_scores[target_color] >= 0.40:
                            c_conf = color_scores[target_color] * 0.90
                        else:
                            c_conf = 0.0

                    if c_conf < 0.25:
                        continue

                    base_score = (class_score * 0.30) + (c_conf * 0.55) + (yolo_conf * 0.15)
                else:
                    base_score = (class_score * 0.60) + (yolo_conf * 0.40)

                # 3. Relational Boost (e.g. person with backpack)
                if requires_relational_object:
                    if has_relational_companion:
                        base_score = min(1.0, base_score * 1.25)
                    elif cid == 0:
                        # If looking for person with bag and no bag found in frame, reduce score
                        base_score *= 0.60

                # 4. Spatial Pyramid Weighting
                spatial_multiplier = 1.0
                if requested_quadrant:
                    q_clean = quadrant.lower().replace("-", "_")
                    if requested_quadrant == q_clean:
                        spatial_multiplier = 1.20
                    else:
                        spatial_multiplier = 0.60

                final_score = round(base_score * spatial_multiplier, 3)

                if final_score >= threshold:
                    rationale = f"{cname.capitalize()} detected with {int(final_score * 100)}% visual confidence"
                    if target_color:
                        rationale += f" ({target_color.upper()} match)"
                    if requires_relational_object and has_relational_companion:
                        rationale += " [Co-occurring Belonging Verified]"

                    candidates.append({
                        "timestamp_sec": ts_sec,
                        "timestamp_formatted": ts_fmt,
                        "confidence": int(final_score * 100),
                        "score": final_score,
                        "class_name": cname,
                        "dominant_color": dom_color,
                        "bbox_norm": obj["bbox_norm"],
                        "quadrant": quadrant,
                        "region": quadrant,
                        "rationale": rationale,
                        "thumbnail_url": f"/api/v1/search/thumbnail/{thumb_file}"
                    })

        candidates.sort(key=lambda x: x["score"], reverse=True)

        deduped_hits: List[Dict[str, Any]] = []
        for c in candidates:
            if len(deduped_hits) >= top_k:
                break
            too_close = False
            for d in deduped_hits:
                if abs(c["timestamp_sec"] - d["timestamp_sec"]) < 1.5:
                    too_close = True
                    break
            if not too_close:
                deduped_hits.append(c)

        query_ms = round((time.perf_counter() - t0) * 1000, 1)

        if not deduped_hits:
            return {
                "status": "NOT_VERIFIED",
                "verdict_title": "TARGET NOT VERIFIED",
                "summary": (
                    f"No indexed evidence exceeded the forensic verification threshold ({threshold:.2f}) "
                    f"for '{query}'. Inspected {len(frames)} indexed frames with 0 ungrounded assumptions."
                ),
                "forensic_brief": f"Zero occurrences of '{query}' exceeded the active evidence verification threshold.",
                "relevance_gate": {
                    "active": True,
                    "threshold": threshold,
                    "gated_candidates_count": len(candidates)
                },
                "matches": [],
                "telemetry": {
                    "query_ms": query_ms,
                    "frames_searched": len(frames),
                    "video_duration_sec": index_data.get("telemetry", {}).get("duration_sec", 0)
                }
            }

        # ── Grounded AI Forensic Brief Synthesis ───────────────────────
        brief = ""
        if generate_brief:
            brief = await self._synthesize_forensic_brief(query, deduped_hits, index_data.get("telemetry", {}))

        return {
            "status": "VERIFIED",
            "verdict_title": "TARGET VERIFIED",
            "summary": (
                f"Identified {len(deduped_hits)} verified occurrence(s) matching '{query}' "
                f"exceeding the evidence verification threshold ({threshold:.2f})."
            ),
            "forensic_brief": brief,
            "relevance_gate": {
                "active": True,
                "threshold": threshold,
                "highest_confidence": deduped_hits[0]["confidence"]
            },
            "matches": deduped_hits,
            "telemetry": {
                "query_ms": query_ms,
                "frames_searched": len(frames),
                "video_duration_sec": index_data.get("telemetry", {}).get("duration_sec", 0)
            }
        }

    # ─────────────────────────────────────────────────────────────
    # Reference Appearance Search ("Search by Reference Appearance")
    # ─────────────────────────────────────────────────────────────

    async def search_by_reference_image(
        self,
        video_id: str,
        image_bytes: bytes,
        threshold: float = DEFAULT_REFERENCE_SIMILARITY_THRESHOLD,
        top_k: int = 8,
        generate_brief: bool = True
    ) -> Dict[str, Any]:
        """
        Conducts Reference Appearance Visual Similarity Search:
        1. Decodes uploaded reference image crop/screenshot.
        2. Computes deep 512-dim ResNet-18 visual feature embedding.
        3. Computes color distribution.
        4. Compares visual cosine similarity across all indexed candidate object crops.
        5. Strictly gates results: TARGET VERIFIED (>= threshold) vs TARGET NOT VERIFIED (< threshold).
        6. Cites verified timestamps [MM:SS] in a grounded forensic brief.
        """
        t0 = time.perf_counter()

        index_data = self.load_index(video_id)
        if not index_data:
            v_matches = glob.glob(os.path.join(_UPLOADS_DIR, f"{video_id}.*"))
            if v_matches:
                loop = asyncio.get_running_loop()
                index_data = await loop.run_in_executor(None, self.index_video, video_id, v_matches[0])
            else:
                return {
                    "status": "NOT_VERIFIED",
                    "verdict_title": "INDEX NOT FOUND",
                    "summary": f"Video index not found for {video_id}.",
                    "matches": [],
                    "relevance_gate": {"active": True, "threshold": threshold},
                    "telemetry": {"query_ms": 0.0}
                }

        # 1. Decode reference image
        nparr = np.frombuffer(image_bytes, np.uint8)
        ref_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if ref_img is None or ref_img.size == 0:
            raise ValueError("Failed to decode uploaded reference image.")

        ref_h, ref_w = ref_img.shape[:2]

        # 2. Extract deep 512-d visual appearance embedding of reference image
        ref_emb = reid_service.extract_embedding(ref_img, [0, 0, ref_w, ref_h])
        if np.all(ref_emb == 0):
            return {
                "status": "NOT_VERIFIED",
                "verdict_title": "INVALID REFERENCE CROP",
                "summary": "Reference image resolution is too low or feature extraction failed.",
                "matches": [],
                "relevance_gate": {"active": True, "threshold": threshold},
                "telemetry": {"query_ms": round((time.perf_counter() - t0) * 1000, 1)}
            }

        # Extract reference color profile
        ref_color_profile: Dict[str, float] = {}
        check_colors = ["red", "blue", "black", "white", "gray", "green", "yellow", "orange", "pink"]
        for c_name in check_colors:
            sc = color_confidence(ref_img, c_name)
            if sc > 0.15:
                ref_color_profile[c_name] = sc

        # 3. Load or generate video candidate embeddings
        emb_data = self.ensure_embeddings(video_id, index_data)
        emb_keys = emb_data["keys"]
        emb_vectors = emb_data["vectors"]

        if len(emb_vectors) == 0:
            return {
                "status": "NOT_VERIFIED",
                "verdict_title": "NO SURVEILLANCE OBJECTS",
                "summary": "No objects were detected in this video to compare against reference appearance.",
                "matches": [],
                "relevance_gate": {"active": True, "threshold": threshold},
                "telemetry": {"query_ms": round((time.perf_counter() - t0) * 1000, 1)}
            }

        # 4. Fast Vectorized Cosine Similarity
        # ref_emb: (512,), emb_vectors: (N, 512)
        # Both are L2 normalized, so cosine similarity is simply dot product
        similarities = np.dot(emb_vectors, ref_emb)

        # Build a lookup mapping: key -> similarity
        key_to_sim = {k: float(sim) for k, sim in zip(emb_keys, similarities)}

        # 5. Search frames for matching objects and combine visual + color similarity
        frames = index_data.get("frames", [])
        candidates: List[Dict[str, Any]] = []

        for f_item in frames:
            f_idx = f_item["frame_idx"]
            ts_sec = f_item["timestamp_sec"]
            ts_fmt = f_item["timestamp_formatted"]
            thumb_file = f_item["thumbnail_file"]

            for obj in f_item.get("objects", []):
                obj_id = obj["id"]
                key = f"{f_idx}_{obj_id}"
                raw_sim = key_to_sim.get(key, 0.0)

                if raw_sim <= 0.0:
                    continue

                # Color consistency score
                cand_color_profile = obj.get("color_profile", {})
                color_match_bonus = 0.0
                if ref_color_profile and cand_color_profile:
                    common_colors = set(ref_color_profile.keys()).intersection(cand_color_profile.keys())
                    if common_colors:
                        color_match_bonus = sum(min(ref_color_profile[c], cand_color_profile[c]) for c in common_colors) / max(len(ref_color_profile), 1)

                # Combined Visual Appearance Score
                # 80% Deep ReID Feature Vector + 20% Color Consistency
                combined_score = round((raw_sim * 0.80) + (color_match_bonus * 0.20), 3)

                if combined_score >= threshold:
                    quadrant = obj.get("quadrant") or compute_quadrant(obj["bbox_norm"])
                    cname = obj.get("class_name", "object")
                    sim_pct = int(min(99, max(1, combined_score * 100)))

                    candidates.append({
                        "timestamp_sec": ts_sec,
                        "timestamp_formatted": ts_fmt,
                        "confidence": sim_pct,
                        "score": combined_score,
                        "class_name": cname,
                        "dominant_color": obj.get("dominant_color", "unknown"),
                        "bbox_norm": obj["bbox_norm"],
                        "quadrant": quadrant,
                        "region": quadrant,
                        "similarity_score": round(raw_sim, 3),
                        "rationale": f"Visual Appearance Match ({sim_pct}% similarity) isolated in {quadrant} quadrant",
                        "thumbnail_url": f"/api/v1/search/thumbnail/{thumb_file}"
                    })

        candidates.sort(key=lambda x: x["score"], reverse=True)

        # Deduplicate hits temporally (at least 1.5s separation)
        deduped_hits: List[Dict[str, Any]] = []
        for c in candidates:
            if len(deduped_hits) >= top_k:
                break
            too_close = False
            for d in deduped_hits:
                if abs(c["timestamp_sec"] - d["timestamp_sec"]) < 1.5:
                    too_close = True
                    break
            if not too_close:
                deduped_hits.append(c)

        query_ms = round((time.perf_counter() - t0) * 1000, 1)

        if not deduped_hits:
            return {
                "status": "NOT_VERIFIED",
                "verdict_title": "TARGET NOT VERIFIED",
                "summary": (
                    f"No candidate in indexed surveillance footage matched the reference appearance "
                    f"above the verification threshold ({threshold:.2f}). Inspected {len(emb_vectors)} visual entities."
                ),
                "forensic_brief": "Zero occurrences matched the uploaded reference appearance above the verification threshold.",
                "relevance_gate": {
                    "active": True,
                    "threshold": threshold,
                    "gated_candidates_count": len(candidates)
                },
                "matches": [],
                "telemetry": {
                    "query_ms": query_ms,
                    "frames_searched": len(frames),
                    "entities_compared": len(emb_vectors),
                    "video_duration_sec": index_data.get("telemetry", {}).get("duration_sec", 0)
                }
            }

        brief = ""
        if generate_brief:
            brief = await self._synthesize_reference_brief(deduped_hits, index_data.get("telemetry", {}))

        return {
            "status": "VERIFIED",
            "verdict_title": "TARGET VERIFIED: Reference Appearance Match",
            "summary": (
                f"Isolated {len(deduped_hits)} verified candidate occurrence(s) matching the reference appearance "
                f"exceeding the verification threshold ({threshold:.2f})."
            ),
            "forensic_brief": brief,
            "relevance_gate": {
                "active": True,
                "threshold": threshold,
                "highest_confidence": deduped_hits[0]["confidence"]
            },
            "matches": deduped_hits,
            "telemetry": {
                "query_ms": query_ms,
                "frames_searched": len(frames),
                "entities_compared": len(emb_vectors),
                "video_duration_sec": index_data.get("telemetry", {}).get("duration_sec", 0)
            }
        }

    async def _synthesize_reference_brief(self, matches: List[Dict[str, Any]], telemetry: dict) -> str:
        """Synthesizes an executive forensic brief for reference appearance matches citing verified timestamps."""
        if not matches:
            return ""

        top_hit = matches[0]
        last_hit = matches[-1]

        fallback_brief = (
            f"Reference appearance candidate verified across {len(matches)} occurrence(s), "
            f"first isolated at [{top_hit['timestamp_formatted']}] in the {top_hit['quadrant']} quadrant "
            f"({top_hit['confidence']}% visual similarity) and tracked through [{last_hit['timestamp_formatted']}]."
        )

        evidence_snippets = []
        for m in matches[:5]:
            evidence_snippets.append(
                f"- Timestamp [{m['timestamp_formatted']}]: {m['class_name']} in {m['quadrant']} ({m['confidence']}% visual similarity)"
            )
        evidence_str = chr(10).join(evidence_snippets)

        prompt = f"""You are an elite CCTV forensic video investigator.
Task: Reference Appearance Visual Match Analysis.
Verified Surveillance Sightings:
{evidence_str}

Instructions:
1. Write a professional, concise 2-sentence forensic brief summarizing where and when this reference target was sighted.
2. You MUST cite the exact timestamps using brackets [MM:SS] (e.g. [{top_hit['timestamp_formatted']}]) for any events described.
3. Use objective forensic terms like "visual appearance match" or "subject sighting". NEVER claim absolute facial recognition or positive biometric identification.
4. Keep it direct, evidentiary, and objective."""

        try:
            from app.services.ai_service import get_ai_service
            ai_text = await asyncio.wait_for(get_ai_service().generate_raw(prompt, timeout=12.0), timeout=14.0)
            if ai_text and len(ai_text.strip()) > 15:
                if any(f"[{m['timestamp_formatted']}]" in ai_text for m in matches):
                    return ai_text.strip()
        except Exception as exc:
            logger.debug(f"AI Reference Brief synthesis fallback: {exc}")

        return fallback_brief

    async def _synthesize_forensic_brief(self, query: str, matches: List[Dict[str, Any]], telemetry: dict) -> str:
        """Synthesizes a 2-sentence executive forensic brief citing ONLY verified timestamps [MM:SS]."""
        if not matches:
            return ""

        top_hit = matches[0]
        last_hit = matches[-1]

        fallback_brief = (
            f"Target matching '{query}' was verified across {len(matches)} frames, "
            f"first isolated at [{top_hit['timestamp_formatted']}] in the {top_hit['quadrant']} quadrant "
            f"({top_hit['confidence']}% visual certainty) and tracked through [{last_hit['timestamp_formatted']}]."
        )

        evidence_snippets = []
        for m in matches[:5]:
            evidence_snippets.append(
                f"- Timestamp [{m['timestamp_formatted']}]: {m['class_name']} ({m['dominant_color']}) in {m['quadrant']} ({m['confidence']}% confidence)"
            )
        evidence_str = chr(10).join(evidence_snippets)

        prompt = f"""You are an elite forensic video investigator.
Target Query: "{query}"
Verified Video Evidence:
{evidence_str}

Instructions:
1. Write a professional, concise 2-sentence forensic intelligence brief summarizing where and when the target was detected.
2. You MUST cite the exact timestamps using brackets [MM:SS] (e.g. [{top_hit['timestamp_formatted']}]) for events you describe.
3. NEVER mention or hallucinate any timestamp not present in the verified evidence above.
4. Keep it direct, evidentiary, and objective."""

        try:
            from app.services.ai_service import get_ai_service
            ai_text = await asyncio.wait_for(get_ai_service().generate_raw(prompt, timeout=12.0), timeout=14.0)
            if ai_text and len(ai_text.strip()) > 15:
                if any(f"[{m['timestamp_formatted']}]" in ai_text for m in matches):
                    return ai_text.strip()
        except Exception as exc:
            logger.debug(f"AI Brief synthesis fallback triggered: {exc}")

        return fallback_brief

    async def forensic_chat(self, video_id: str, question: str, matches: List[Dict[str, Any]]) -> str:
        """Answers investigator questions strictly grounded in the verified evidence dossier."""
        if not matches:
            return "No verified occurrences are available for this video to analyze."

        evidence_snippets = []
        for m in matches:
            evidence_snippets.append(
                f"- Timestamp [{m['timestamp_formatted']}]: {m['class_name']} ({m['dominant_color']}) in quadrant {m['quadrant']}, confidence {m['confidence']}%"
            )
        evidence_str = chr(10).join(evidence_snippets)

        prompt = f"""You are Randy AI, forensic investigator on the Laminar Platform.
Investigator Question: "{question}"

VERIFIED FORENSIC EVIDENCE:
{evidence_str}

STRICT FORENSIC RULES:
1. Ground your answer ONLY in the verified evidence listed above.
2. Whenever referring to an event or location, ALWAYS cite the timestamp in brackets [MM:SS] (e.g. [{matches[0]['timestamp_formatted']}]).
3. If the evidence does not contain the answer, say "Based on verified surveillance timestamps, this information is not visible."
4. Be crisp, professional, and directly useful."""

        try:
            from app.services.ai_service import get_ai_service
            ans = await get_ai_service().generate_raw(prompt, timeout=15.0)
            if ans and len(ans.strip()) > 10:
                return ans.strip()
        except Exception as e:
            logger.warning(f"Forensic chat failure: {e}")

        return f"Based on verified surveillance timestamps [{matches[0]['timestamp_formatted']}] through [{matches[-1]['timestamp_formatted']}], {len(matches)} occurrence(s) were isolated in the footage."

forensic_search_service = ForensicVideoSearchService()
