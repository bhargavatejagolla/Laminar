import numpy as np
import cv2
from typing import Tuple, List, Optional

class CameraCalibration:
    """
    Handles mapping from 2D image pixels to 3D/2D world coordinates (meters).
    This enables accurate velocity (km/h) and acceleration calculations.
    """

    def __init__(self, image_points: Optional[List[Tuple[float, float]]] = None, 
                 world_points: Optional[List[Tuple[float, float]]] = None):
        """
        Initialize with points to compute the homography matrix.
        If no points are provided, it falls back to a default affine approximation
        (assuming a typical angled pole-mounted camera).
        
        Args:
            image_points: 4 points in the image (x, y) pixels
            world_points: 4 corresponding points on the ground plane (x, y) in meters
        """
        self.homography_matrix = None
        self.pixel_scale = 0.05 # Fallback: 1 pixel = 5cm

        if image_points and world_points and len(image_points) >= 4 and len(world_points) >= 4:
            src = np.array(image_points, dtype=np.float32)
            dst = np.array(world_points, dtype=np.float32)
            self.homography_matrix, _ = cv2.findHomography(src, dst)

    def pixel_to_world(self, x: float, y: float) -> Tuple[float, float]:
        """
        Convert a pixel coordinate (bottom-center of bounding box) to real-world meters.
        """
        if self.homography_matrix is not None:
            # Add homogeneous coordinate
            pt = np.array([[[x, y]]], dtype=np.float32)
            world_pt = cv2.perspectiveTransform(pt, self.homography_matrix)
            return float(world_pt[0][0][0]), float(world_pt[0][0][1])
        else:
            # Fallback linear approximation (highly inaccurate for deep perspective)
            return x * self.pixel_scale, y * self.pixel_scale

    def calculate_speed_kmh(self, pt1: Tuple[float, float], pt2: Tuple[float, float], time_delta_sec: float) -> float:
        """
        Calculate speed between two pixel points in km/h.
        """
        if time_delta_sec <= 0:
            return 0.0
            
        w1_x, w1_y = self.pixel_to_world(pt1[0], pt1[1])
        w2_x, w2_y = self.pixel_to_world(pt2[0], pt2[1])
        
        distance_meters = np.hypot(w2_x - w1_x, w2_y - w1_y)
        speed_mps = distance_meters / time_delta_sec
        return speed_mps * 3.6 # Convert m/s to km/h
