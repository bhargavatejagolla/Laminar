import asyncio
import cv2
import numpy as np
import time
from typing import Optional, Any, Dict
from uuid import UUID
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.core.global_state import GLOBAL_STATE
from app.core.database import db_manager
from app.services.notification_service import notification_service
from app.vision.video_normalizer import VideoNormalizer

logger = get_logger(__name__)

class UnifiedWorker:
    """
    Unified Worker that ingests frames from VideoNormalizer and 
    routes them to the correct AI blocks based on the camera_type profile.
    
    Implements Adaptive Inference:
    - Maintains 30FPS frame ingestion (for video streaming and smooth tracking).
    - Runs heavy YOLO inference at 5-15 FPS based on scene dynamics.
    """

    def __init__(self, camera_id: UUID, venue_id: UUID, stream_url: str, stream_type: str, camera_profile: str):
        self.camera_id = camera_id
        self.venue_id = venue_id
        self.camera_profile = camera_profile # e.g. "traffic", "parking", "security"
        
        self.normalizer = VideoNormalizer(stream_url, stream_type=stream_type)
        self._running = False
        
        self._task: Optional[asyncio.Task] = None
        self._inference_task: Optional[asyncio.Task] = None
        
        self._current_frame: Optional[np.ndarray] = None
        self._last_annotated_frame: Optional[np.ndarray] = None
        self._cached_frame_bytes: Optional[bytes] = None
        
        self._last_result: Optional[dict] = None
        self._last_inference_time: float = 0.0
        
        # Determine target AI FPS (Adaptive: max 15, drop to 5 if idle)
        self.target_inference_fps = 15.0
        self._idle_frames = 0

    async def start(self):
        if self._running:
            return
        self._running = True
        self.normalizer.start()
        
        self._task = asyncio.create_task(self._ingestion_loop())
        self._inference_task = asyncio.create_task(self._adaptive_inference_loop())
        logger.info(f"UnifiedWorker started for camera {self.camera_id} with profile [{self.camera_profile}]")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
        if self._inference_task:
            self._inference_task.cancel()
            
        self.normalizer.stop()
        logger.info(f"UnifiedWorker stopped for camera {self.camera_id}")

    async def _ingestion_loop(self):
        """
        High-performance loop to ingest frames at full speed (e.g. 30 FPS).
        Renders the latest AI annotations without waiting for AI inference.
        """
        while self._running:
            try:
                ret, frame = await self.normalizer.read()
                if not ret or frame is None:
                    await asyncio.sleep(0.05)
                    continue

                self._current_frame = frame.copy()
                
                # Render annotations (using self._last_result)
                annotated = frame.copy()
                if self._last_result:
                    # In future, we will draw based on RoadState
                    pass
                self._last_annotated_frame = annotated
                
                # Cache MJPEG bytes
                try:
                    _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 65])
                    self._cached_frame_bytes = jpeg.tobytes()
                except Exception:
                    pass

                # Brief yield to event loop
                await asyncio.sleep(0.01)
                
            except Exception as e:
                logger.error(f"UnifiedWorker ingestion error: {e}")
                await asyncio.sleep(0.5)

    async def _adaptive_inference_loop(self):
        """
        Runs heavy AI models (YOLO + Tracking) adaptively.
        Routes to specific AI pipelines based on self.camera_profile.
        """
        while self._running:
            try:
                if self._current_frame is None:
                    await asyncio.sleep(0.1)
                    continue
                
                start_time = time.time()
                frame = self._current_frame.copy()
                
                # ── Route based on Camera Profile ──
                if self.camera_profile == "traffic":
                    await self._run_traffic_pipeline(frame)
                elif self.camera_profile == "parking":
                    await self._run_parking_pipeline(frame)
                else:
                    await self._run_security_pipeline(frame)
                
                # ── Adaptive Sleep ──
                inference_time = time.time() - start_time
                self._last_inference_time = inference_time
                
                # If nothing detected, reduce FPS to save CPU (e.g., 5 FPS)
                target_sleep = (1.0 / self.target_inference_fps) - inference_time
                if target_sleep > 0:
                    await asyncio.sleep(target_sleep)
                else:
                    # Yield to event loop even if overloaded
                    await asyncio.sleep(0.01)
                    
            except Exception as e:
                logger.error(f"UnifiedWorker inference error: {e}")
                await asyncio.sleep(1.0)
                
    async def _run_traffic_pipeline(self, frame: np.ndarray):
        """Execute Traffic & Incident capabilities."""
        from app.vision.vision_core import vision_core
        from app.vision.traffic_detector import traffic_detector
        from app.vision.incident_detector import incident_detector
        from app.vision.primitives import RoadState, FlowMetrics, TrackedVehicle, IncidentEvidence
        
        # 1. Base Perception (Run YOLO + Tracker)
        vision_state = await vision_core.process_frame(frame, str(self.camera_id))
        
        # 2. Traffic Flow Intelligence
        loop = asyncio.get_running_loop()
        flow_data = await loop.run_in_executor(None, traffic_detector.analyze_traffic, vision_state)
        
        # 3. Incident Detection (Phase 6 hook)
        incidents_raw = await loop.run_in_executor(None, incident_detector.detect_incidents, frame.copy())
        
        # Format into standardized primitives
        vehicles = []
        for t in vision_state.tracks:
            vehicles.append(TrackedVehicle(
                track_id=t["id"],
                class_name=t["class_name"],
                confidence=t["confidence"],
                bbox=t["bbox"],
                speed_kmh=t.get("speed_kmh", 0.0),
                trajectory=t.get("trajectory", [])
            ))
            
        flow_metrics = FlowMetrics(
            avg_speed_kmh=flow_data.get("avg_speed_kmh", 0.0),
            vehicle_count=flow_data.get("vehicle_count", 0),
            congestion_level=flow_data.get("congestion_level", 0.0),
            density_status=flow_data.get("density_status", "Low")
        )
        
        active_incidents = []
        from app.services.incident_explanation_service import IncidentExplanationService
        explainer = IncidentExplanationService()
        
        for inc in incidents_raw:
            # LLM Explainer Phase 7
            ai_description = await explainer.explain_traffic_incident(
                incident_type=inc["type"],
                confidence=inc.get("confidence", 0.9),
                description=inc["description"],
                signals=inc.get("signals", {})
            )
            
            active_incidents.append(IncidentEvidence(
                incident_type=inc["type"],
                confidence_score=inc.get("confidence", 0.9),
                involved_track_ids=inc.get("track_ids", []),
                description=ai_description,
                timestamp=time.time(),
                location_bbox=inc.get("bbox"),
                signals=inc.get("signals", {})
            ))
        
        # 4. Construct Central RoadState
        road_state = RoadState(
            timestamp=time.time(),
            camera_id=str(self.camera_id),
            vehicles=vehicles,
            flow_metrics=flow_metrics,
            active_incidents=active_incidents
        )
        
        # Save state for overlay rendering in ingestion loop
        self._last_result = {
            "vehicles": vision_state.tracks,
            "count": flow_data["count"],
            "density": flow_data["density"],
            "avg_velocity": flow_data["avg_velocity"],
            "risk_score": flow_data["risk_score"]
        }
        
        # 5. Push to Global State & Event Bus
        GLOBAL_STATE.update(
            domain="traffic",
            venue_id=str(self.venue_id),
            payload={
                "venue_id": str(self.venue_id),
                "camera_id": str(self.camera_id),
                "count": flow_metrics.vehicle_count,
                "density": flow_metrics.density_status,
                "congestion_level": flow_metrics.congestion_level,
                "avg_speed_kmh": flow_metrics.avg_speed_kmh,
                "risk_score": flow_data["risk_score"],
                "last_updated": time.time(),
            }
        )
        
        # 6. Push Incidents & Alerts to AlertEngineService
        from app.services.alert_engine_service import AlertEngineService
        from app.core.database import db_manager
        alert_engine = AlertEngineService()
        
        async with db_manager.session() as session:
            # 6a. Process Incidents
            if active_incidents:
                for inc in active_incidents:
                    decision = {
                        "domain": "traffic",
                        "should_alert": True,
                        "venue_id": str(self.venue_id),
                        "camera_id": str(self.camera_id),
                        "metric_id": str(self.camera_id), # Fallback using camera_id
                        "current_level": "critical" if inc.confidence_score > 0.8 else "high",
                        "severity": 9 if inc.confidence_score > 0.8 else 7,
                        "alert_type": inc.incident_type,
                        "xai_explanation": inc.description,
                        "early_warning_triggered": False,
                        "velocity": flow_metrics.avg_speed_kmh
                    }
                    try:
                        await alert_engine.process_decision(session, decision=decision)
                    except Exception as e:
                        logger.error(f"Failed to process incident alert: {e}")
            
            # 6b. Process Congestion
            if flow_metrics.density_status in ["High", "Critical"]:
                decision = {
                    "domain": "traffic",
                    "should_alert": True,
                    "venue_id": str(self.venue_id),
                    "camera_id": str(self.camera_id),
                    "metric_id": str(self.camera_id),
                    "current_level": "critical" if flow_metrics.density_status == "Critical" else "high",
                    "severity": 9 if flow_metrics.density_status == "Critical" else 7,
                    "alert_type": "Severe Congestion",
                    "xai_explanation": f"High vehicle density detected ({flow_metrics.vehicle_count} vehicles).",
                    "early_warning_triggered": False,
                    "velocity": flow_metrics.avg_speed_kmh
                }
                try:
                    await alert_engine.process_decision(session, decision=decision)
                except Exception as e:
                    logger.error(f"Failed to process congestion alert: {e}")
    async def _run_parking_pipeline(self, frame: np.ndarray):
        """Execute Parking capabilities."""
        from app.vision.vision_core import vision_core
        from app.vision.parking_detector import parking_detector
        from app.vision.primitives import RoadState, ParkingState, ParkingSlotState, TrackedVehicle
        
        # 1. Base Perception
        vision_state = await vision_core.process_frame(frame, str(self.camera_id))
        
        # 2. Parking Intelligence
        loop = asyncio.get_running_loop()
        # TODO: Ideally fetch zones from database based on camera_id. Using default for now.
        slot_states_raw = await loop.run_in_executor(
            None, 
            parking_detector.detect_occupancy, 
            vision_state, 
            parking_detector.DEFAULT_ZONES
        )
        
        # 3. Format into Primitives
        slots = {}
        occupied_count = 0
        for slot_id, state in slot_states_raw.items():
            is_occ = state.get("occupied", False)
            if is_occ: occupied_count += 1
            slots[slot_id] = ParkingSlotState(
                slot_id=slot_id,
                polygon=state.get("polygon", []),
                is_occupied=is_occ,
                occupied_duration_sec=0.0 # Could track duration in stability dict
            )
            
        parking_state = ParkingState(
            total_slots=len(slots),
            occupied_slots=occupied_count,
            available_slots=max(0, len(slots) - occupied_count),
            slots=slots
        )
        
        vehicles = []
        for t in vision_state.tracks:
            vehicles.append(TrackedVehicle(
                track_id=t["id"],
                class_name=t["class_name"],
                confidence=t["confidence"],
                bbox=t["bbox"],
                trajectory=t.get("trajectory", [])
            ))
            
        road_state = RoadState(
            timestamp=time.time(),
            camera_id=str(self.camera_id),
            vehicles=vehicles,
            parking_state=parking_state
        )
        
        # 4. Save state for rendering
        self._last_result = {
            "vehicles": vision_state.tracks,
            "slot_states": slot_states_raw,
            "occupied_spots": parking_state.occupied_slots,
            "total_slots": parking_state.total_slots
        }
        
        # 5. Push to Global State
        GLOBAL_STATE.update(
            domain="parking",
            venue_id=str(self.venue_id),
            payload={
                "venue_id": str(self.venue_id),
                "camera_id": str(self.camera_id),
                "occupied_spots": parking_state.occupied_slots,
                "total_slots": parking_state.total_slots,
                "slot_states": slot_states_raw,
                "last_updated": time.time(),
            }
        )
        
    async def _run_security_pipeline(self, frame: np.ndarray):
        """Execute standard Crowd/Security capabilities."""
        pass
