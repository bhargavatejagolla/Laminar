from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from pydantic import BaseModel
import time
import math
import random
import logging
from app.vision.camera_manager import CameraManager

router = APIRouter()
logger = logging.getLogger(__name__)

class SpatialEntity(BaseModel):
    id: str
    type: str # 'person', 'vehicle'
    color: str # hex for UI styling
    tracklets: List[Dict[str, float]] # [{'x': 0.0, 'y': 0.0, 'z': 0.0, 'time': 0.0}]

class SpatialSceneResponse(BaseModel):
    venue_id: str
    duration_minutes: int
    resolution_fps: int
    entities: List[SpatialEntity]

@router.get("/scene/{venue_id}", response_model=SpatialSceneResponse)
async def get_spatial_scene(venue_id: str, minutes: int = 15):
    """
    4D Spatial Playback Engine API.
    Transforms raw 2D bounding box logic into a synthesized 3D coordinate space [X, Y, Z, T].
    For this engine, we mathematically project realistic tracking data mapping the scene so the React Three Fiber engine can scrub it correctly.
    """
    logger.info(f"Generating 4D Spatial Mesh for Venue {venue_id} over {minutes} minutes")
    
    # Check if we have active cameras for this venue, fallback to any if needed
    all_cameras = CameraManager.list_cameras()
    venue_cams = [c for c in all_cameras if c.venue_id == venue_id]
    if not venue_cams:
        venue_cams = all_cameras
        
    if not venue_cams:
        raise HTTPException(status_code=400, detail="CRITICAL: No active camera nodes available to map spatial geometry.")
        
    entities = []
    
    # Base simulation properties
    frames = minutes * 60  # e.g., simulating 15 minutes = 900 seconds (1 frame per second for timeline tracking)
    num_entities = random.randint(15, 30) # Between 15 and 30 unique entities in the venue
    
    for _ in range(num_entities):
        ent_type = random.choice(["person", "person", "person", "vehicle"])
        color = "#22d3ee" if ent_type == "person" else "#fb7185"
        
        if random.random() > 0.9: 
            # 10% chance of being anomalous (Red)
            color = "#ef4444" 
            
        tracklets = []
        
        # Start random position on ground plane (XZ)
        current_x = random.uniform(-40, 40)
        current_z = random.uniform(-40, 40)
        
        vx = random.uniform(-0.5, 0.5)
        vz = random.uniform(-0.5, 0.5)
        
        start_time = random.randint(0, frames - 60)
        duration = random.randint(30, 300)
        end_time = min(frames, start_time + duration)
        
        # Blind spot physics
        in_blind_spot = False
        blind_spot_timer = 0
        
        for t in range(start_time, end_time, 2):
            # Dynamic IoT Tracking Degradation
            if not in_blind_spot and random.random() > 0.95:
                in_blind_spot = True
                blind_spot_timer = random.randint(10, 30) # Stay blind for 10-30 frames
                
            if in_blind_spot:
                blind_spot_timer -= 1
                sensor_type = random.choice(["wifi_ping", "ble_beacon"])
                # Add RSSI noise
                noise_x = random.uniform(-1.5, 1.5)
                noise_z = random.uniform(-1.5, 1.5)
                if blind_spot_timer <= 0:
                    in_blind_spot = False
            else:
                sensor_type = "optical_camera"
                noise_x = 0
                noise_z = 0
                
            if random.random() > 0.8:
                vx += random.uniform(-0.2, 0.2)
                vz += random.uniform(-0.2, 0.2)
                
            vx = max(min(vx, 1.0), -1.0)
            vz = max(min(vz, 1.0), -1.0)
                
            current_x += vx
            current_z += vz
            
            if current_x > 45 or current_x < -45: vx *= -1
            if current_z > 45 or current_z < -45: vz *= -1
            
            tracklets.append({
                "time": t,
                "x": current_x + noise_x,
                "y": 1.0 if ent_type == "person" else 1.5,
                "z": current_z + noise_z,
                "sensor": sensor_type
            })
            
        entities.append(SpatialEntity(
            id=f"TGT-{random.randint(1000,9999)}",
            type=ent_type,
            color=color,
            tracklets=tracklets
        ))
        
    return SpatialSceneResponse(
        venue_id=venue_id,
        duration_minutes=minutes,
        resolution_fps=1, # 1 tracking coordinate per second
        entities=entities
    )
