from typing import Dict, List, Optional
import numpy as np
from datetime import datetime, timezone
import uuid

class JourneyTrack:
    def __init__(self, global_id: str, embedding: np.ndarray, initial_camera: str, initial_camera_name: str = ""):
        self.global_id = global_id
        self.latest_embedding = embedding
        self.path = [{"camera_id": initial_camera, "camera_name": initial_camera_name or initial_camera[:8], "timestamp": datetime.now(timezone.utc).isoformat()}]
        self.last_seen = datetime.now(timezone.utc).isoformat()
        self.latest_similarity = 1.0  # Default 100% on creation

class JourneyManagerService:
    """
    Manages cross-camera tracks by comparing new ReID embeddings
    with active global tracks. Updates the 3D twin backend state.
    """
    def __init__(self):
        self.active_journeys: Dict[str, JourneyTrack] = {}
        self.similarity_threshold = 0.55 # Lowered from 0.70 to reduce duplicates; added same-camera boost below
        self._last_cleanup = datetime.now(timezone.utc)

    def process_detection(self, camera_id: str, embedding: np.ndarray, camera_name: str = "") -> tuple[str, Optional[str]]:
        """
        Matches a new detection against active journeys.
        Returns (global_id, insight_message_if_cross_camera).
        """
        # Periodic cleanup of stale journeys (> 30 mins)
        now = datetime.now(timezone.utc)
        if (now - self._last_cleanup).total_seconds() > 300: # Every 5 mins
            self._cleanup_stale_journeys()
            self._last_cleanup = now

        best_match_id = None
        best_score = 0.0

        from app.services.reid_service import reid_service

        for j_id, track in self.active_journeys.items():
            score = reid_service.compute_similarity(embedding, track.latest_embedding)
            
            # ── 🟢 Same-Camera Boost 🟢 ──
            if track.path[-1]["camera_id"] == camera_id:
                score *= 1.15
                
            if score > best_score:
                best_score = score
                best_match_id = j_id
        
        if best_match_id and best_score > self.similarity_threshold:
            track = self.active_journeys[best_match_id]
            track.latest_embedding = (track.latest_embedding * 0.7) + (embedding * 0.3)
            track.last_seen = now.isoformat()
            track.latest_similarity = float(best_score)
            
            last_entry = track.path[-1]
            last_cam = last_entry["camera_id"]
            
            if last_cam != camera_id:
                hop_time = now.isoformat()
                
                # Calculate dwell time on previous camera
                dwell_seconds = 0
                if track.path:
                    prev_time = datetime.fromisoformat(track.path[-1]["timestamp"])
                    dwell_seconds = int((now - prev_time).total_seconds())
                    track.path[-1]["dwell_time"] = dwell_seconds

                from_name = last_entry.get("camera_name") or str(last_cam)[:12]
                to_name   = camera_name or str(camera_id)[:12]
                
                # ── 🧠 Traversal Intuition 🧠 ──
                intent = self._infer_traversal_intent(from_name, to_name)
                insight_msg = f"{intent}: {from_name} → {to_name} ({round(float(best_score)*100)}% match)"

                track.path.append({
                    "camera_id": camera_id,
                    "camera_name": to_name,
                    "timestamp": hop_time,
                    "dwell_time": 0,
                    "intent": intent
                })
                
                return best_match_id, insight_msg
                
            return best_match_id, None
        else:
            # Create new global track
            new_id = str(uuid.uuid4())
            self.active_journeys[new_id] = JourneyTrack(new_id, embedding, camera_id, camera_name)
            return new_id, None

    def _cleanup_stale_journeys(self):
        """Removes journeys not seen for > 30 minutes to free memory."""
        now = datetime.now(timezone.utc)
        to_delete = []
        for j_id, track in self.active_journeys.items():
            ls = datetime.fromisoformat(track.last_seen)
            if (now - ls).total_seconds() > 1800:
                to_delete.append(j_id)
        for j_id in to_delete:
            del self.active_journeys[j_id]

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
        # Sort by last seen so newest are first
        sorted_journeys = sorted(
            self.active_journeys.items(), 
            key=lambda x: x[1].last_seen, 
            reverse=True
        )
        for j_id, t in sorted_journeys:
            # Return all journeys so user can see them being created/updated
            data.append({
                "global_id": j_id,
                "path": t.path,
                "last_seen": t.last_seen,
                "is_multicam": len(set(p["camera_id"] for p in t.path)) > 1
            })
        return data

journey_manager = JourneyManagerService()
