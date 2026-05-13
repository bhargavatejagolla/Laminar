import os
import cv2
import asyncio
import uuid
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, List
from sqlalchemy import select, update
from app.core.database import db_manager
from app.models.journey import Journey
from app.core.logging import get_logger

logger = get_logger(__name__)

class JourneyTrack:
    def __init__(self, global_id: str, embedding: np.ndarray, initial_camera: str, initial_camera_name: str = ""):
        self.global_id = global_id
        self.latest_embedding = embedding
        _initial_session_id = str(uuid.uuid4())
        self.path = [{
            "camera_id": initial_camera,
            "camera_name": initial_camera_name or initial_camera[:8],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "session_id": _initial_session_id,
            "dwell_time": 0,
        }]
        self.last_seen = datetime.now(timezone.utc).isoformat()
        self.latest_similarity = 1.0
        self.canonical_image_path: Optional[str] = None

class JourneyManagerService:
    """
    Manages cross-camera tracks by comparing new ReID embeddings
    with active global tracks. Updates the 3D twin backend state and persists to DB.

    Session semantics:
    - Each camera appearance is a "session" with its own session_id.
    - If a person re-appears on the SAME camera after SESSION_REENTRY_GAP seconds,
      a new session is created (wait time resets to 0).
    - Cross-camera hops always get a fresh session entry.
    """
    # How long (seconds) a person must be absent from a camera before
    # their return is treated as a brand-new session (wait time resets).
    SESSION_REENTRY_GAP: float = 12.0  # 12 seconds instead of 5 minutes for strict real-time resets

    def __init__(self):
        self.active_journeys: Dict[str, JourneyTrack] = {}
        self.similarity_threshold = 0.78
        self._last_cleanup = datetime.now(timezone.utc)
        self._initialized = False
        self._init_lock = asyncio.Lock()

        os.makedirs(os.path.join("storage", "snapshots"), exist_ok=True)

    async def _ensure_initialized(self):
        """Lazy initialization from database."""
        if self._initialized:
            return
        async with self._init_lock:
            if self._initialized:
                return
            try:
                async with db_manager.session() as session:
                    # Load journeys from the last 24 hours to keep active memory lean 
                    # but allow re-identification of recent persons.
                    since = datetime.now(timezone.utc) - timedelta(hours=24)
                    result = await session.execute(
                        select(Journey).where(Journey.last_seen >= since)
                    )
                    journeys = result.scalars().all()
                    for j in journeys:
                        track = JourneyTrack(
                            global_id=j.global_id,
                            embedding=np.array(j.latest_embedding_data["embedding"]) if j.latest_embedding_data else np.zeros(512),
                            initial_camera=""
                        )
                        track.path = j.path
                        track.last_seen = j.last_seen.isoformat()
                        track.latest_similarity = j.latest_similarity
                        track.canonical_image_path = j.canonical_image_path
                        self.active_journeys[j.global_id] = track
                
                self._initialized = True
                logger.info(f"JourneyManager initialized with {len(self.active_journeys)} tracks from DB")
            except Exception as e:
                logger.error(f"Failed to initialize JourneyManager: {e}")

    async def process_detection(self, camera_id: str, embedding: np.ndarray, camera_name: str = "", frame_crop: Optional[np.ndarray] = None) -> tuple[str, Optional[str]]:
        """
        Matches a new detection against active journeys.
        Returns (global_id, insight_message_if_cross_camera).
        """
        await self._ensure_initialized()

        now = datetime.now(timezone.utc)
        best_match_id = None
        best_score = 0.0

        from app.services.reid_service import reid_service
        # Use list() to avoid RuntimeError if dict changes size during iteration
        for j_id, track in list(self.active_journeys.items()):
            score = reid_service.compute_similarity(embedding, track.latest_embedding)
            
            # ── 🟢 Same-Camera Boost 🟢 ──
            if track.path[-1]["camera_id"] == camera_id:
                score *= 1.15 # Reduced from 1.35 to prevent high-drift identity hijacking
                
            if score > best_score:
                best_score = score
                best_match_id = j_id
        
        if best_match_id and best_score > self.similarity_threshold:
            track = self.active_journeys[best_match_id]
            # EMA Update of embedding for gradual adaptation
            track.latest_embedding = (track.latest_embedding * 0.8) + (embedding * 0.2)
            track.last_seen = now.isoformat()
            track.latest_similarity = float(best_score)
            
            # --- "BEST QUALITY" SNAPSHOT LOGIC ---
            # Update canonical image if we don't have one OR if the current detection is higher quality
            if frame_crop is not None and frame_crop.size > 0:
                is_better = False
                if not track.canonical_image_path:
                    is_better = True
                else:
                    try:
                        # Only update if the new image is significantly higher confidence than previously saved
                        current_best = getattr(track, 'highest_snapshot_score', 0.0)
                        if best_score > 0.85 and best_score > (current_best + 0.05):
                            is_better = True
                            track.highest_snapshot_score = best_score
                    except:
                        pass
                
                if is_better:
                    # ── 🟢 Full View Frame 🟢 ──
                    filename = f"journey_{best_match_id[:8]}_{int(now.timestamp())}.jpg"
                    save_path = os.path.join("storage", "snapshots", filename)
                    try:
                        old_path = track.canonical_image_path
                        track.canonical_image_path = save_path
                        
                        def _io_thread(old, new, crop):
                            if old and os.path.exists(old):
                                try: os.remove(old)
                                except: pass
                            cv2.imwrite(new, crop, [cv2.IMWRITE_JPEG_QUALITY, 94])
                            logger.info(f"Updated high-quality evidence screenshot for {best_match_id[:8]}")
                            
                        # Fire and forget IO
                        asyncio.get_event_loop().run_in_executor(None, _io_thread, old_path, save_path, frame_crop)
                    except Exception as e:
                        logger.error(f"Failed to dispatch complete snapshot save: {e}")
            
            last_entry = track.path[-1]
            last_cam = last_entry["camera_id"]

            if last_cam != camera_id:
                # ── 🔄 Camera Hop (Cross-camera traversal) ──
                hop_time = now.isoformat()

                # Finalise dwell on previous camera
                if track.path:
                    prev_time = datetime.fromisoformat(track.path[-1]["timestamp"])
                    track.path[-1]["dwell_time"] = int((now - prev_time).total_seconds())

                from_name = last_entry.get("camera_name") or str(last_cam)[:12]
                to_name   = camera_name or str(camera_id)[:12]

                intent = self._infer_traversal_intent(from_name, to_name)
                new_session_id = str(uuid.uuid4())
                track.path.append({
                    "camera_id": camera_id,
                    "camera_name": to_name,
                    "timestamp": hop_time,
                    "session_id": new_session_id,
                    "dwell_time": 0,
                    "intent": intent,
                })
                asyncio.create_task(self._persist_journey(track))
                return best_match_id, f"{intent}: {from_name} → {to_name}"
            else:
                # ── 📍 Same Camera ──────────────────────────
                # SESSION REENTRY: if absent for > SESSION_REENTRY_GAP, start a fresh session
                last_seen_time = datetime.fromisoformat(track.last_seen)
                gap_seconds = (now - last_seen_time).total_seconds()
                if gap_seconds > self.SESSION_REENTRY_GAP:
                    # Person returned after a significant absence → NEW SESSION, wait time = 0
                    new_session_id = str(uuid.uuid4())
                    track.path.append({
                        "camera_id": camera_id,
                        "camera_name": camera_name or str(camera_id)[:12],
                        "timestamp": now.isoformat(),
                        "session_id": new_session_id,
                        "dwell_time": 0,
                        "intent": "Re-entry (New Session)",
                    })
                    asyncio.create_task(self._persist_journey(track))
                    return best_match_id, f"Re-entered after {int(gap_seconds//60)}m gap — new session"

                # Normal same-session update: increment dwell_time from session entry
                prev_time = datetime.fromisoformat(last_entry["timestamp"])
                last_entry["dwell_time"] = int((now - prev_time).total_seconds())
                if last_entry["dwell_time"] % 30 == 0:
                    asyncio.create_task(self._persist_journey(track))
                return best_match_id, None
        else:
            # Create new global track
            new_id = str(uuid.uuid4())
            new_track = JourneyTrack(new_id, embedding, camera_id, camera_name)
            
            # Save the full camera screenshot for better context
            if frame_crop is not None and frame_crop.size > 0:
                filename = f"journey_{new_id[:8]}_{int(now.timestamp())}.jpg"
                save_path = os.path.join("storage", "snapshots", filename)
                try:
                        new_track.canonical_image_path = save_path
                        
                        def _io_initial(new, crop):
                            cv2.imwrite(new, crop, [cv2.IMWRITE_JPEG_QUALITY, 94])
                            
                        asyncio.get_event_loop().run_in_executor(None, _io_initial, save_path, frame_crop)
                except Exception as e:
                    logger.error(f"Failed to dispatch initial complete snapshot: {e}")

            self.active_journeys[new_id] = new_track
            # Persist new journey to DB
            asyncio.create_task(self._persist_journey(new_track))
            return new_id, None

    async def _persist_journey(self, track: JourneyTrack):
        """Saves or updates a journey in the database."""
        try:
            async with db_manager.session() as session:
                # Optimized upsert
                stmt = select(Journey).where(Journey.global_id == track.global_id)
                res = await session.execute(stmt)
                journey = res.scalar_one_or_none()
                
                embedding_data = {"embedding": track.latest_embedding.tolist()}
                
                if not journey:
                    journey = Journey(
                        global_id=track.global_id,
                        latest_embedding_data=embedding_data,
                        last_seen=datetime.fromisoformat(track.last_seen),
                        latest_similarity=track.latest_similarity,
                        path=track.path,
                        canonical_image_path=track.canonical_image_path
                    )
                    session.add(journey)
                else:
                    journey.latest_embedding_data = embedding_data
                    journey.last_seen = datetime.fromisoformat(track.last_seen)
                    journey.latest_similarity = track.latest_similarity
                    journey.path = track.path
                    journey.canonical_image_path = track.canonical_image_path
                
                await session.commit()
        except Exception as e:
            logger.error(f"Failed to persist journey to DB: {e}")

    def _cleanup_stale_journeys(self):
        """Removes journeys not seen for > 30 minutes to free memory."""
        now = datetime.now(timezone.utc)
        to_delete = []
        # Use list() to avoid RuntimeError
        for j_id, track in list(self.active_journeys.items()):
            ls = datetime.fromisoformat(track.last_seen)
            if (now - ls).total_seconds() > 1800:
                to_delete.append(j_id)
        for j_id in to_delete:
            # Note: We could optionally delete the image here or leave it for forensics
            del self.active_journeys[j_id]

    def delete_journey(self, global_id: str) -> bool:
        """Manually purge a track from memory (GDPR/Clear function)."""
        if global_id in self.active_journeys:
            del self.active_journeys[global_id]
            logger.info(f"Purged intelligence record: {global_id}")
            return True
        return False

    def clear_all_journeys(self):
        """Purge all active evidences."""
        count = len(self.active_journeys)
        self.active_journeys.clear()
        logger.info(f"Cleared all {count} active journeys.")
        return count

    def _infer_traversal_intent(self, from_name: str, to_name: str) -> str:
        """Heuristic-based intent inference for movement pathways."""
        f, t = from_name.lower(), to_name.lower()
        if "gate" in f and ("exit" in t or "lobby" in t): return "Entry Sequence"
        if ("lobby" in f or "hall" in f) and "exit" in t: return "Exit Pathway"
        if "gate" in f and "gate" in t: return "Perimeter Sweep"
        if f == t: return "Sector Persistence"
        return "Cross-Camera Traversal"

    def get_active_journeys_for_api(self):
        """Returns simplified paths for frontend rendering."""
        data = []
        # Run garbage collection before returning API results so stale records vanish naturally
        self._cleanup_stale_journeys()
        
        # Sort by last seen so newest are first - use list() to avoid RuntimeError
        sorted_journeys = sorted(
            list(self.active_journeys.items()), 
            key=lambda x: x[1].last_seen, 
            reverse=True
        )
        for j_id, t in sorted_journeys:
            # Include canonical image and similarity
            data.append({
                "global_id": j_id,
                "path": t.path,
                "last_seen": t.last_seen,
                "is_multicam": len(set(p["camera_id"] for p in t.path)) > 1,
                "similarity": t.latest_similarity,
                "canonical_image": t.canonical_image_path
            })
        return data

journey_manager = JourneyManagerService()

