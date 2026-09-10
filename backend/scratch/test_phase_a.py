import sys
import os
import asyncio

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

backend_dir = r"c:\Users\bharg\OneDrive\Documents\ztest\laminar\backend"
sys.path.insert(0, backend_dir)

from app.core.model_registry import model_registry, ModelLifecycleState
from app.services.venue_service import venue_service
from app.core.database import db_manager
from sqlalchemy.future import select
from app.models.venue import Venue

async def test_model_registry():
    print("\n=== [1] TESTING CENTRAL MODEL REGISTRY ===", flush=True)
    
    # Check vehicle perception
    veh = model_registry.get_descriptor("vehicle_perception")
    assert veh is not None, "Vehicle perception descriptor missing"
    assert veh.state == ModelLifecycleState.FROZEN, f"Vehicle perception state must be FROZEN, got {veh.state}"
    assert veh.tracker == "ByteTrack", f"Tracker must be ByteTrack, got {veh.tracker}"
    print(f"[OK] Vehicle Perception: {veh.model_name} | State: {veh.state.value} | Tracker: {veh.tracker} | Device: {veh.device}", flush=True)

    # Check road condition model (must be strictly NOT_CONFIGURED when best.pt absent)
    road = model_registry.get_descriptor("road_condition")
    assert road is not None, "Road condition descriptor missing"
    assert road.state == ModelLifecycleState.NOT_CONFIGURED, f"Expected NOT_CONFIGURED when best.pt is absent, got {road.state}"
    print(f"[OK] Road Condition: {road.model_name} | State: {road.state.value} | Notes: {road.validation_notes}", flush=True)

    # Test inspection of non-existent file
    fake_res = model_registry.inspect_weights("completely_fake_weights.pt")
    assert fake_res["state"] == ModelLifecycleState.NOT_CONFIGURED, "Non-existent weights must be NOT_CONFIGURED"
    print(f"[OK] Non-existent inspection test: State {fake_res['state'].value}", flush=True)

    # Benchmark vehicle perception model
    print("[INFO] Running benchmark on vehicle model...", flush=True)
    bench = model_registry.benchmark_model("vehicle_perception", runs=1)
    assert bench.get("status") == "BENCHMARKED", f"Benchmark failed: {bench}"
    print(f"[OK] Benchmark Vehicle Model: {bench.get('latency_ms')} ms/frame | Effective AI FPS: {bench.get('effective_ai_fps')} | Device: {bench.get('device')}", flush=True)

async def test_domain_router():
    print("\n=== [2] TESTING CANONICAL DOMAIN ROUTER ===", flush=True)
    await db_manager.initialize()
    async with db_manager.session() as session:
        # Find an existing venue
        v_res = await session.execute(select(Venue))
        venues = list(v_res.scalars().all())
        if not venues:
            print("⚠️ No venues in DB to test router against. Skipping DB check.", flush=True)
            return

        test_venue = venues[0]
        print(f"Testing against Venue: {test_venue.name} ({test_venue.id})", flush=True)

        # Resolve cameras for traffic
        traffic_cams = await venue_service.resolve_cameras_for_domain(session, test_venue.id, "traffic")
        print(f"[OK] Traffic cameras resolved: {len(traffic_cams)} camera(s)", flush=True)
        for c in traffic_cams:
            print(f"   - {c.name} (type={c.camera_type}, active={c.is_active})", flush=True)

        # Resolve for an unconfigured domain e.g. "underwater_sonar"
        unconf_cams = await venue_service.resolve_cameras_for_domain(session, test_venue.id, "underwater_sonar")
        assert len(unconf_cams) == 0, f"Expected 0 cameras for unconfigured domain, got {len(unconf_cams)}"
        print(f"[OK] Unconfigured domain resolution: strictly 0 cameras returned (NO_CAMERA_CONFIGURED)", flush=True)

async def main():
    await test_model_registry()
    await test_domain_router()
    print("\n[SUCCESS] ALL PHASE A VERIFICATION CHECKS PASSED PERFECTLY!\n", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
