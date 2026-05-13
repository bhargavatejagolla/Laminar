"""
Laminar - Global State Store
----------------------------

Thread-safe memory store for real-time telemetry across all AI domains.
Provides lag-free access to the latest system state for APIs and Dashboards.
"""

import threading
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import numpy as np


from collections import deque

class GlobalStateStore:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(GlobalStateStore, cls).__new__(cls)
                cls._instance._data = {
                    "people": {},
                    "parking": {},
                    "traffic": {},
                    "incident": {},
                    "notifications": {},
                    "system": {
                        "last_updated": datetime.now(timezone.utc).isoformat(),
                        "uptime_start": datetime.now(timezone.utc).isoformat()
                    }
                }
                # Persistent event bus for history/analytics
                cls._instance._events = {
                    "traffic": {},  # key -> deque
                    "parking": {},
                    "people": {},
                    "incident": deque(maxlen=200),
                    "notifications": deque(maxlen=200)
                }
                cls._instance._data_lock = threading.Lock()
        return cls._instance

    def _sanitize(self, data: Any) -> Any:
        """Recursive helper to convert non-serializable types to Python primitives."""
        if isinstance(data, dict):
            return {k: self._sanitize(v) for k, v in data.items()}
        if isinstance(data, (list, tuple)):
            return [self._sanitize(v) for v in data]
        if isinstance(data, (np.int64, np.intc, np.intp, np.int8, np.int16, np.int32,
                            np.uint8, np.uint16, np.uint32, np.uint64)):
            return int(data)
        if isinstance(data, (np.float16, np.float32, np.float64)):
            return float(data)
        if isinstance(data, np.ndarray):
            return self._sanitize(data.tolist())
        return data

    def update(self, domain: str, venue_id: Any, payload: Dict[str, Any]):
        """Thread-safe update of domain-specific venue state."""
        venue_id = str(venue_id)
        with self._data_lock:
            if domain not in self._data:
                self._data[domain] = {}
            
            # Merge existing data with new payload
            if venue_id not in self._data[domain]:
                self._data[domain][venue_id] = {}
            
            # Sanitize payload
            safe_payload = self._sanitize(payload)
            self._data[domain][venue_id].update(safe_payload)
            self._data[domain][venue_id]["last_updated"] = datetime.now(timezone.utc).isoformat()
            self._data["system"]["last_updated"] = datetime.now(timezone.utc).isoformat()

    def get_venue_state(self, domain: str, venue_id: Any) -> Optional[Dict[str, Any]]:
        """Retrieve state for a specific venue in a domain."""
        venue_id = str(venue_id)
        with self._data_lock:
            return self._data.get(domain, {}).get(venue_id)

    def get_domain_state(self, domain: str) -> Dict[str, Dict[str, Any]]:
        """Retrieve state for all venues in a domain."""
        with self._data_lock:
            return self._data.get(domain, {}).copy()

    def update_domain_camera(self, domain: str, camera_id: Any, payload: Dict[str, Any]):
        """Thread-safe update of per-camera state within a domain.
        
        Stores data under _data[domain]['_cameras'][camera_id].
        """
        camera_id = str(camera_id)
        with self._data_lock:
            if domain not in self._data:
                self._data[domain] = {}
            if "_cameras" not in self._data[domain]:
                self._data[domain]["_cameras"] = {}
            if camera_id not in self._data[domain]["_cameras"]:
                self._data[domain]["_cameras"][camera_id] = {}
            # Sanitize payload
            safe_payload = self._sanitize(payload)
            self._data[domain]["_cameras"][camera_id].update(safe_payload)
            self._data[domain]["_cameras"][camera_id]["last_updated"] = datetime.now(timezone.utc).isoformat()
            self._data["system"]["last_updated"] = datetime.now(timezone.utc).isoformat()

    def get_camera_state(self, domain: str, camera_id: Any) -> Optional[Dict[str, Any]]:
        """Retrieve state for a specific camera within a domain."""
        camera_id = str(camera_id)
        with self._data_lock:
            return self._data.get(domain, {}).get("_cameras", {}).get(camera_id)

    def get_all(self) -> Dict[str, Any]:
        """Deep copy of the entire state."""
        with self._data_lock:
            # Simple shallow copy of top level is okay because we return copies of sub-dicts in specific getters
            # but for a full dump we do a real copy
            import copy
            return copy.deepcopy(self._data)

    def push_event(self, domain: str, key: str, event: Dict[str, Any], maxlen: int = 500):
        """Pushes an event into a persistent deque for historical analytics."""
        with self._data_lock:
            if domain not in self._events:
                self._events[domain] = {}
            
            # Domain-specific root deques (like 'incident' or 'notifications')
            if isinstance(self._events[domain], deque):
                self._events[domain].appendleft(event)
                return

            # Per-entity deques (like 'traffic' -> camera_id)
            if key not in self._events[domain]:
                self._events[domain][key] = deque(maxlen=maxlen)
            self._events[domain][key].appendleft(event)

    def get_events(self, domain: str, key: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
        """Retrieves historical events for a domain or specific entity."""
        with self._data_lock:
            if domain not in self._events:
                return []
            
            dset = self._events[domain]
            if isinstance(dset, deque):
                return list(dset)[:limit]
            
            if key:
                return list(dset.get(key, []))[:limit]
            
            # Aggregate all keys in domain
            all_ev = []
            for dq in dset.values():
                all_ev.extend(list(dq))
            # Sort by timestamp if available
            all_ev.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return all_ev[:limit]


# Shared instance
GLOBAL_STATE = GlobalStateStore()
