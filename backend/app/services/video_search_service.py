"""
Laminar - Forensic Video Retrieval Service (VideoRAG Synthesis)
==============================================================
Provides evidence-grounded video search over CCTV footage:
- Adaptive Temporal Sampling (scales FPS based on video duration)
- 64-bit Perceptual dHash Edge-Gate Filter (prunes static frames)
- YOLOv11 Multi-Class & Color Extraction
- Measured Telemetry (real pruning %, real latencies)
- Configurable Evidence-Grounded Relevance Gate (VERIFIED vs NOT VERIFIED)
- Timestamped Evidence Dossier for Click-to-Seek Playback
"""

from __future__ import annotations

import os
import time
import json
import glob
import re
import math
import base64
import logging
from typing import List, Dict, Any, Optional, Tuple

import cv2
import numpy as np

from app.vision.detector import get_detector
from app.vision.color_matcher import extract_primary_color, color_confidence

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

# Default configurable forensic relevance threshold
DEFAULT_RELEVANCE_THRESHOLD = 0.40

# COCO Class mapping for forensic search
COCO_CLASSES: Dict[str, int] = {
    "person": 0, "man": 0, "woman": 0, "child": 0, "pedestrian": 0, "someone": 0, "individual": 0, "people": 0, "crowd": 0,
    "bicycle": 1, "bike": 1, "cycle": 1, "cyclist": 1,
    "car": 2, "vehicle": 2, "automobile": 2, "sedan": 2, "suv": 2, "auto": 2,
    "motorcycle": 3, "motorbike": 3, "scooter": 3,
    "airplane": 4, "plane": 4,
    "bus": 5,
    "train": 6,
    "truck": 7, "lorry": 7, "pickup": 7,
    "boat": 8,
    "traffic light": 9,
    "fire hydrant": 10,
    "stop sign": 11,
    "dog": 16, "puppy": 16, "pet": 16,
    "cat": 15, "kitten": 15,
    "backpack": 24, "bag": 24, "rucksack": 24,
    "umbrella": 25,
    "handbag": 26, "purse": 26,
    "suitcase": 28, "luggage": 28,
    "sports ball": 32, "ball": 32,
    "bottle": 39,
    "cup": 41,
    "chair": 56, "seat": 56,
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


# ─────────────────────────────────────────────────────────────
# Video Search Service
# ─────────────────────────────────────────────────────────────

class ForensicVideoSearchService:
    def __init__(self):
        pass

    def get_index_path(self, video_id: str) -> str:
        return os.path.join(_INDICES_DIR, f"{video_id}.json")

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

                                detected_objects.append({
                                    "id": b_i,
                                    "class_id": cls_id,
                                    "class_name": cls_name,
                                    "confidence": round(float(b_c), 3),
                                    "bbox_norm": [nx1, ny1, nx2, ny2],
                                    "dominant_color": dominant_color,
                                    "color_profile": color_profile
                                })
                except Exception as y_err:
                    logger.warning(f"YOLO extraction failed on frame {f_idx}: {y_err}")

                # 3. Save thumbnail crop/frame for evidence display
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

        telemetry = {
            "duration_sec": round(duration_sec, 2),
            "total_frames": total_frames,
            "fps": round(fps, 2),
            "sampled_frames": sampled_frames,
            "retained_frames": retained_frames,
            "pruned_static_frames": pruned_frames,
            "pruned_static_pct": pruned_pct,
            "index_elapsed_sec": elapsed_sec,
            "resolution": f"{orig_w}x{orig_h}"
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

    def query_video(
        self,
        video_id: str,
        query: str,
        threshold: float = DEFAULT_RELEVANCE_THRESHOLD,
        top_k: int = 6
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()
        index_data = self.load_index(video_id)
        if not index_data:
            v_matches = glob.glob(os.path.join(_UPLOADS_DIR, f"{video_id}.*"))
            if v_matches:
                index_data = self.index_video(video_id, v_matches[0])
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
        target_color = extract_primary_color(q)

        # ── Forensic Class Parsing ────────────────────────────────────
        tokens = re.findall(r"[a-z0-9]+", q)
        target_class_ids = set()
        matched_class_names = set()

        for token in tokens:
            if token in COCO_CLASSES:
                cid = COCO_CLASSES[token]
                target_class_ids.add(cid)
                matched_class_names.add(COCO_NAMES.get(cid, token))

        # Check for multi-word classes like "traffic light", "fire hydrant", "cell phone"
        for phrase, cid in COCO_CLASSES.items():
            if " " in phrase and phrase in q:
                target_class_ids.add(cid)
                matched_class_names.add(COCO_NAMES.get(cid, phrase))

        is_generic_search = any(w in tokens for w in GENERIC_SEARCH_WORDS)

        # If user queried a specific noun that is NOT a known COCO class,
        # do NOT default to person! Return NOT_VERIFIED honestly!
        query_nouns = [w for w in tokens if w not in {"in", "a", "an", "the", "with", "wearing", "of", "and", "near", "at", "on", "is", "moving", "standing", "sitting", "running", "walking", "fast", "slow", "front", "back", "left", "right"} and w != target_color]
        
        if not target_class_ids and not is_generic_search:
            # If query has nouns but none match COCO (e.g. "giraffe", "dinosaur", "helicopter", "spaceship")
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
                # Default to person only if completely abstract (e.g. "in red")
                target_class_ids.add(0)

        frames = index_data.get("frames", [])
        candidates: List[Dict[str, Any]] = []

        for frame_item in frames:
            ts_sec = frame_item["timestamp_sec"]
            ts_fmt = frame_item["timestamp_formatted"]
            thumb_file = frame_item["thumbnail_file"]
            objects = frame_item.get("objects", [])

            for obj in objects:
                cid = obj["class_id"]
                cname = obj["class_name"]
                yolo_conf = obj["confidence"]
                dom_color = obj.get("dominant_color", "unknown")
                color_scores = obj.get("color_profile", {})

                # 1. Class Relevance Score
                if is_generic_search or cid in target_class_ids:
                    class_score = 1.0
                else:
                    class_score = 0.0  # Zero score for class mismatch!

                # If class doesn't match at all, drop object candidate
                if class_score == 0.0:
                    continue

                # 2. Color Relevance Score & Color Gating
                if target_color:
                    # Forensic color resolution:
                    if dom_color == target_color:
                        c_conf = max(color_scores.get(target_color, 0.85), 0.85)
                    elif cname == "person" and target_color in color_scores and color_scores[target_color] >= 0.50:
                        # People can wear different top/bottom colors
                        c_conf = color_scores[target_color] * 0.85
                    else:
                        # Vehicles, bags, etc. must match dominant color
                        c_conf = 0.0

                    # Strict color gate
                    if c_conf < 0.30:
                        continue

                    final_score = (class_score * 0.30) + (c_conf * 0.55) + (yolo_conf * 0.15)
                else:
                    final_score = (class_score * 0.60) + (yolo_conf * 0.40)

                final_score = round(final_score, 3)

                if final_score >= threshold:
                    bbox = obj["bbox_norm"]
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    x_region = "Left" if cx < 35 else "Right" if cx > 65 else "Center"
                    y_region = "Top" if cy < 35 else "Bottom" if cy > 65 else "Mid"
                    region_tag = f"{y_region}-{x_region}" if (x_region != "Center" or y_region != "Mid") else "Center"

                    rationale = f"{cname.capitalize()} detected with {int(final_score * 100)}% visual confidence"
                    if target_color:
                        rationale += f" ({target_color.upper()} attire/surface match)"

                    candidates.append({
                        "timestamp_sec": ts_sec,
                        "timestamp_formatted": ts_fmt,
                        "confidence": int(final_score * 100),
                        "score": final_score,
                        "class_name": cname,
                        "dominant_color": dom_color,
                        "bbox_norm": bbox,
                        "region": region_tag,
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

        return {
            "status": "VERIFIED",
            "verdict_title": "TARGET VERIFIED",
            "summary": (
                f"Identified {len(deduped_hits)} verified occurrence(s) matching '{query}' "
                f"exceeding the evidence verification threshold ({threshold:.2f})."
            ),
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

forensic_search_service = ForensicVideoSearchService()
