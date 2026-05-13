from typing import Dict, Any, List
import time

class ParkingStateManager:
    """ Maintains slot state over time with temporal smoothing to avoid flicker. """
    def __init__(self, history_length: int = 5, confidence_threshold: float = 0.5):
        self.history_length = history_length
        self.confidence_threshold = confidence_threshold
        # Maps slot_id to a list of recent states (True mapping to occupied)
        self.slot_history: Dict[str, List[bool]] = {}
        # The canonical stable state
        self.stable_state: Dict[str, bool] = {}

    def update_with_history(self, slot_id: str, is_occupied: bool, confidence: float) -> bool:
        """ Update slot history and return the smoothed stable state. """
        if confidence < self.confidence_threshold:
            # Ignore low confidence detections if it says it's occupied
            if is_occupied:
                is_occupied = False

        if slot_id not in self.slot_history:
            self.slot_history[slot_id] = []
        
        self.slot_history[slot_id].append(is_occupied)
        
        if len(self.slot_history[slot_id]) > self.history_length:
            self.slot_history[slot_id].pop(0)

        # Majority vote for temporal smoothing
        history = self.slot_history[slot_id]
        occupied_count = sum(history)
        
        # If strictly more than half are True, we consider it occupied
        stable_occupied = occupied_count > (len(history) / 2.0)
        self.stable_state[slot_id] = stable_occupied
        return stable_occupied

    def get_all_stable_states(self) -> Dict[str, bool]:
        return self.stable_state

parking_state_manager = ParkingStateManager()
