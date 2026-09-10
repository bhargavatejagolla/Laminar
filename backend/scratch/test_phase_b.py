import sys
import os
import asyncio
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

backend_dir = r"c:\Users\bharg\OneDrive\Documents\ztest\laminar\backend"
sys.path.insert(0, backend_dir)

from app.core.database import db_manager, async_session_factory
from app.models.intelligence_event import LaminarIntelligenceEvent, LocationPayload, IntelligenceEventRecord
from app.services.event_bus import event_bus
from app.vision.parking_detector import parking_detector
from app.vision.intersection_analyzer import intersection_analyzer
from sqlalchemy.future import select

async def test_persistent_event_store():
    print("\n=== [1] TESTING DUAL-STORE EVENT PERSISTENCE ===", flush=True)
    await db_manager.initialize()

    test_ev_id = f"TEST-PERSIST-{int(time.time()*1000)}"
    test_event = LaminarIntelligenceEvent(
        event_id=test_ev_id,
        event_type="test_dual_store_verified",
        domain="traffic",
        venue_id="f8ac4b18-d265-4d77-8ac5-dfb649f8ef70",
        venue_name="New Bustand",
        camera_id="cam_01",
        camera_name="Corridor South",
        source_type="upload",
        location=LocationPayload(latitude=17.585, longitude=78.4867, location_source="CAMERA_CONFIG"),
        severity="high",
        confidence=0.92,
        state="verified",
        title="Dual Store Verification",
        description="Verifying that event is persisted to SQL database as historical truth while streaming to SSE.",
        evidence={"sample": 42},
        explanation={"reason": "Audit persistence check."}
    )

    emitted = await event_bus.emit_event(test_event, cooldown_seconds=0.0)
    assert emitted, "EventBus failed to emit event"
    print(f"[OK] EventBus emitted event {test_ev_id} to SSE ring buffer", flush=True)

    # Verify persistence in Database
    async with async_session_factory() as session:
        result = await session.execute(
            select(IntelligenceEventRecord).where(IntelligenceEventRecord.event_id == test_ev_id)
        )
        rec = result.scalar_one_or_none()
        assert rec is not None, f"Event {test_ev_id} was NOT found in persistent database!"
        assert rec.venue_name == "New Bustand", f"Venue name mismatch: {rec.venue_name}"
        assert rec.location_source == "CAMERA_CONFIG", f"Location source mismatch: {rec.location_source}"
        assert rec.latitude == 17.585, f"Latitude mismatch: {rec.latitude}"
        print(f"[OK] Event successfully verified in PostgreSQL/SQLite database table 'intelligence_events'!", flush=True)

async def test_parking_guard():
    print("\n=== [2] TESTING PARKING GEOMETRY GUARD ===", flush=True)
    insights = await parking_detector.get_current_insights()
    overall = insights.get("overall", {})
    if not overall.get("configured"):
        assert overall.get("geometry_status") == "PARKING GEOMETRY NOT CONFIGURED", f"Expected PARKING GEOMETRY NOT CONFIGURED, got {overall.get('geometry_status')}"
        assert overall.get("total_slots") is None, "total_slots must be None when geometry unconfigured (no fake capacity)"
        print("[OK] Unconfigured parking correctly reports: PARKING GEOMETRY NOT CONFIGURED (zero fake slots)", flush=True)
    else:
        print(f"[OK] Configured parking reporting: {overall.get('occupied')}/{overall.get('capacity')} slots", flush=True)

async def test_intersection_kinematics():
    print("\n=== [3] TESTING INTERSECTION KINEMATICS ===", flush=True)
    # Test 1: Unconfigured
    res_unconf = intersection_analyzer.analyze_intersection(tracks=[])
    assert res_unconf["status"] == "NOT_CONFIGURED", f"Expected NOT_CONFIGURED, got {res_unconf['status']}"
    assert res_unconf["signal_state"] == "SIGNAL DATA NOT CONNECTED", f"Expected SIGNAL DATA NOT CONNECTED, got {res_unconf['signal_state']}"
    print("[OK] Unconfigured intersection reports: NOT_CONFIGURED and SIGNAL DATA NOT CONNECTED", flush=True)

    # Test 2: Configured with sample tracks
    dummy_config = {
        "signal_state": "FIXED_CYCLE_LOCAL",
        "conflict_zone": [[100, 100], [300, 100], [300, 300], [100, 300]],
        "approach_zones": {"north": [[100, 0], [300, 0], [300, 100], [100, 100]]}
    }
    dummy_tracks = [
        {"id": 1, "class_name": "car", "bbox": [150, 150, 250, 250], "speed_px_s": 2.0, "trajectory": [[150, 150], [152, 151], [155, 152]]},
        {"id": 2, "class_name": "truck", "bbox": [400, 400, 500, 500], "speed_px_s": 60.0, "trajectory": [[400, 400], [420, 400], [450, 400]]},
    ]
    # Simulate stopped for 3 frames
    intersection_analyzer.analyze_intersection(dummy_tracks, dummy_config)
    intersection_analyzer.analyze_intersection(dummy_tracks, dummy_config)
    res_conf = intersection_analyzer.analyze_intersection(dummy_tracks, dummy_config)

    assert res_conf["status"] == "CONFIGURED", "Expected CONFIGURED"
    assert res_conf["metrics"]["conflict_zone_occupancy"] >= 1, "Expected car to be inside conflict zone"
    assert res_conf["metrics"]["stopped_vehicles"] >= 1, "Expected stopped car (speed < 5 px/s)"
    assert res_conf["metrics"]["directional_flow"]["east"] >= 1, "Expected eastbound truck trajectory"
    print(f"[OK] Configured intersection kinematics verified: {res_conf['metrics']}", flush=True)

async def main():
    await test_persistent_event_store()
    await test_parking_guard()
    await test_intersection_kinematics()
    print("\n[SUCCESS] ALL PHASE B VERIFICATION CHECKS PASSED PERFECTLY!\n", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
