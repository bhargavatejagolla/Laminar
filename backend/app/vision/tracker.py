import collections
import math
from typing import Dict, List, Tuple

class CentroidTracker:
    def __init__(self, max_disappeared=10, max_distance=50):
        # Store the object ID as the key, and the centroid details as the value
        self.next_object_id = 0
        self.objects: Dict[int, Tuple[int, int]] = {}
        self.disappeared: Dict[int, int] = {}
        
        # Keep track of history to compute speed
        self.history: Dict[int, List[Tuple[int, int]]] = collections.defaultdict(list)

        # Config
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def register(self, centroid):
        self.objects[self.next_object_id] = centroid
        self.disappeared[self.next_object_id] = 0
        self.history[self.next_object_id].append(centroid)
        self.next_object_id += 1

    def deregister(self, object_id):
        del self.objects[object_id]
        del self.disappeared[object_id]
        if object_id in self.history:
            del self.history[object_id]

    def update(self, rects):
        # rects is a list of [startX, startY, endX, endY]
        if len(rects) == 0:
            for object_id in list(self.disappeared.keys()):
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self.deregister(object_id)
            return self.objects

        input_centroids = []
        for (startX, startY, endX, endY) in rects:
            cX = int((startX + endX) / 2.0)
            cY = int((startY + endY) / 2.0)
            input_centroids.append((cX, cY))

        if len(self.objects) == 0:
            for i in range(0, len(input_centroids)):
                self.register(input_centroids[i])
        else:
            object_ids = list(self.objects.keys())
            object_centroids = list(self.objects.values())

            # Calculate distances between existing objects and new input centroids
            # We use a simple NxM matrix
            D = []
            for oc in object_centroids:
                row = []
                for ic in input_centroids:
                    dist = math.hypot(oc[0] - ic[0], oc[1] - ic[1])
                    row.append(dist)
                D.append(row)

            # Sort the distance matrix to match closest points
            # Simple greedy matching
            used_rows = set()
            used_cols = set()
            
            # Create a list of all distances with their row and col index
            flat_distances = []
            for r in range(len(D)):
                for c in range(len(D[r])):
                    flat_distances.append((D[r][c], r, c))
            
            # Sort by distance
            flat_distances.sort(key=lambda x: x[0])

            for (dist, row, col) in flat_distances:
                if row in used_rows or col in used_cols:
                    continue
                
                # If distance exceeds max, don't match
                if dist > self.max_distance:
                    continue
                    
                object_id = object_ids[row]
                self.objects[object_id] = input_centroids[col]
                self.disappeared[object_id] = 0
                
                # Keep history up to max 10 frames
                self.history[object_id].append(input_centroids[col])
                if len(self.history[object_id]) > 10:
                    self.history[object_id].pop(0)

                used_rows.add(row)
                used_cols.add(col)

            # Check for disappeared objects
            unused_rows = set(range(len(object_centroids))) - used_rows
            for row in unused_rows:
                object_id = object_ids[row]
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self.deregister(object_id)

            # Register new objects
            unused_cols = set(range(len(input_centroids))) - used_cols
            for col in unused_cols:
                self.register(input_centroids[col])

        return self.objects
