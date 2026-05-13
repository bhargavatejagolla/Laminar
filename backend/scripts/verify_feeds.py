import requests
import time
import cv2
import numpy as np

BASE_URL = "http://localhost:8000/api/v1"

def check_specialized_health():
    print("Checking Specialized Camera Health...")
    # Get all cameras
    response = requests.get(f"{BASE_URL}/cameras")
    cameras = response.json()
    
    specialized = [c for c in cameras if c.get("venue_domain") in ["parking", "traffic", "incident"]]
    
    if not specialized:
        print("No specialized cameras found to test.")
        return
    
    for cam in specialized:
        cam_id = cam["id"]
        health_resp = requests.get(f"{BASE_URL}/cameras/{cam_id}/health")
        health = health_resp.json()
        print(f"Camera {cam_id} ({cam['venue_domain']}): {health['status']} - {health['message']}")

def test_stream_fps(camera_id, duration=5):
    print(f"Testing Stream FPS for camera {camera_id}...")
    stream_url = f"{BASE_URL}/vision/feed/{camera_id}"
    
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        print(f"Failed to open stream for {camera_id}")
        return

    frames = 0
    start = time.time()
    while time.time() - start < duration:
        ret, frame = cap.read()
        if ret:
            frames += 1
        else:
            break
            
    end = time.time()
    fps = frames / (end - start)
    print(f"Camera {camera_id} Average FPS: {fps:.2f} ({frames} frames in {end-start:.2f}s)")
    cap.release()

if __name__ == "__main__":
    try:
        check_specialized_health()
        # Find a specialized camera to test stream
        response = requests.get(f"{BASE_URL}/cameras")
        cameras = response.json()
        specialized = [c for c in cameras if c.get("venue_domain") in ["parking", "traffic", "incident"]]
        if specialized:
            test_stream_fps(specialized[0]["id"])
    except Exception as e:
        print(f"Verification script error: {e}")
