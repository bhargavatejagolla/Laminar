import sys
import os
import asyncio
import numpy as np

# Ensure stdout uses utf-8
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, r"c:\Users\bharg\OneDrive\Documents\ztest\laminar\backend")

async def main():
    print("=== Testing Phase D: Road Condition Governance & Worker Tasks Integration ===")

    from app.core.model_registry import model_registry, ModelLifecycleState
    from app.vision.road_condition_detector import road_condition_detector
    from app.vision.intersection_analyzer import intersection_analyzer

    # 1. Model Registry Road Condition Status
    rc_desc = model_registry.get_descriptor("road_condition")
    assert rc_desc is not None, "Road condition descriptor must exist in registry"
    assert rc_desc.state == ModelLifecycleState.NOT_CONFIGURED, f"Expected NOT_CONFIGURED, got {rc_desc.state}"
    print(f"[PASS] Model Registry road_condition state: {rc_desc.state.value}")

    # 2. Road Condition Detector Status
    status = road_condition_detector.get_status()
    assert status["status"] == "NOT_CONFIGURED", f"Expected NOT_CONFIGURED, got {status['status']}"
    print(f"[PASS] RoadConditionDetector get_status(): {status['status']}")

    # 3. Defect Detection on Frame (Zero Mock check)
    dummy_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    res = road_condition_detector.detect_defects(dummy_frame, camera_id="test_cam")
    assert res["status"] == "NOT_CONFIGURED", f"Expected NOT_CONFIGURED, got {res['status']}"
    assert res["count"] == 0, f"Expected 0 defects, got {res['count']}"
    assert len(res["defects"]) == 0, f"Expected empty defects list, got {len(res['defects'])}"
    print(f"[PASS] RoadConditionDetector detect_defects() correctly returns NOT_CONFIGURED with 0 defects")

    # 4. Intersection Analyzer (Zero Mock check)
    inter_res = intersection_analyzer.analyze_intersection([], intersection_config=None, camera_id="test_cam")
    assert inter_res["status"] == "NOT_CONFIGURED", f"Expected NOT_CONFIGURED, got {inter_res['status']}"
    assert inter_res["signal_state"] == "SIGNAL DATA NOT CONNECTED", f"Expected 'SIGNAL DATA NOT CONNECTED', got {inter_res['signal_state']}"
    print(f"[PASS] IntersectionAnalyzer correctly returns NOT_CONFIGURED and SIGNAL DATA NOT CONNECTED")

    # 5. Worker Tasks import check
    from app.vision.worker_tasks import async_process_upload_job
    assert callable(async_process_upload_job), "async_process_upload_job must be callable"
    print(f"[PASS] worker_tasks.py imports and syntax verified cleanly")

    print("\n=== Phase D Verification PASSED Successfully ===")

if __name__ == "__main__":
    asyncio.run(main())
