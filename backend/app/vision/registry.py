
import threading
from uuid import UUID
from typing import Set

class CameraRegistry:
    """Global registry to prevent multiple workers from opening the same camera."""
    _instance = None
    _lock = threading.Lock()
    _active_cameras: Set[UUID] = set()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(CameraRegistry, cls).__new__(cls)
            return cls._instance

    def register(self, camera_id: UUID) -> bool:
        """Reserve a camera. Returns True if successful, False if already busy."""
        with self._lock:
            if camera_id in self._active_cameras:
                return False
            self._active_cameras.add(camera_id)
            return True

    def unregister(self, camera_id: UUID):
        """Release a camera."""
        with self._lock:
            if camera_id in self._active_cameras:
                self._active_cameras.remove(camera_id)

camera_registry = CameraRegistry()
