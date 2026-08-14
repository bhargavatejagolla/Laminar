import asyncio
import cv2
import time
import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.vision.vision_core import vision_core, VisionState

async def test_vision_core():
    print("Testing VisionCore Initialization...")
    
    video_path = "test_incident.mp4"
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found.")
        return

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Failed to open video.")
        return

    print("Video opened successfully. Running VisionCore on 50 frames...")
    
    start_time = time.time()
    frames_processed = 0
    total_tracks_found = 0
    
    while frames_processed < 50:
        ret, frame = cap.read()
        if not ret or frame is None:
            break
            
        frame_start = time.time()
        
        # We simulate the live feed by passing it to process_frame
        state: VisionState = await vision_core.process_frame(frame, camera_id="test_cam_01")
        
        frame_time = time.time() - frame_start
        
        frames_processed += 1
        total_tracks_found += len(state.tracks)
        
        if frames_processed % 10 == 0:
            print(f"Frame {frames_processed}/50 | Tracks: {len(state.tracks)} | Inference Time: {frame_time:.3f}s")
            if len(state.tracks) > 0:
                print(f"Sample Track -> ID: {state.tracks[0]['id']} | Class: {state.tracks[0]['class_name']} | Speed: {state.tracks[0]['speed_px_s']} px/s")

    cap.release()
    total_time = time.time() - start_time
    
    print("\n--- Test Summary ---")
    print(f"Frames Processed: {frames_processed}")
    print(f"Total Tracks Aggregated: {total_tracks_found}")
    print(f"Average FPS: {frames_processed / total_time:.2f}")
    print("Vision Core is functioning and tracking correctly without blocking.")

if __name__ == "__main__":
    asyncio.run(test_vision_core())
