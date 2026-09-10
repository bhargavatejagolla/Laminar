import sys
import os
import asyncio

# Ensure stdout uses utf-8
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, r"c:\Users\bharg\OneDrive\Documents\ztest\laminar\backend")

async def main():
    print("=== Testing Phase F: Audited Operational PDF Report Generator ===")

    from app.core.database import db_manager, async_session_factory
    from app.services.pdf_report_service import pdf_report_service
    from app.services.event_bus import event_bus
    from app.models.intelligence_event import LaminarIntelligenceEvent, LocationPayload

    await db_manager.initialize()

    # Emit a sample verified collision event to event bus / DB so the report has rich content
    test_ev = LaminarIntelligenceEvent(
        event_id="TEST-INCIDENT-PDF-001",
        event_type="collision_verified",
        domain="incident",
        venue_id="test_venue_sector",
        venue_name="Metro Arterial Corridor",
        camera_id="cam_sector_1",
        camera_name="Cam 01 - North Junction",
        source_type="live",
        location=LocationPayload(
            latitude=17.38504,
            longitude=78.48667,
            location_source="CAMERA_CONFIG"
        ),
        severity="critical",
        confidence=0.96,
        state="verified",
        title="Physical Collision Verified on North Junction",
        description="High-speed impact detected between tracked units with post-collision stall.",
        evidence={
            "track_ids": [3, 12],
            "timestamp_seconds": 8.66,
            "signals": {
                "sudden_deceleration": "True (-381 px/s)",
                "convergence": "42 deg angle",
                "contact_geometry": "IoU 0.946",
                "post_event_stall": "True"
            }
        },
        explanation={
            "reason": "Impact signature verified across tracker continuity.",
            "confidence": 0.96
        }
    )
    await event_bus.emit_event(test_ev, cooldown_seconds=0.0)

    # 1. Generate Global Report
    async with async_session_factory() as session:
        pdf_bytes = await pdf_report_service.generate_road_intelligence_pdf(session=session, venue_id=None)
        assert isinstance(pdf_bytes, bytes), "Expected bytes output"
        assert len(pdf_bytes) > 2000, f"Expected PDF > 2KB, got {len(pdf_bytes)} bytes"
        assert pdf_bytes[:4] == b"%PDF", "PDF must begin with %PDF header"
        print(f"[PASS] Global Road Intelligence PDF generated successfully ({len(pdf_bytes):,} bytes)")

    # 2. Generate Venue-Scoped Report
    async with async_session_factory() as session:
        venue_pdf_bytes = await pdf_report_service.generate_road_intelligence_pdf(session=session, venue_id="test_venue_sector")
        assert isinstance(venue_pdf_bytes, bytes)
        assert len(venue_pdf_bytes) > 2000
        assert venue_pdf_bytes[:4] == b"%PDF"
        print(f"[PASS] Venue-scoped Road Intelligence PDF generated successfully ({len(venue_pdf_bytes):,} bytes)")

    # 3. Save sample artifact for inspection
    out_path = os.path.abspath(r"c:\Users\bharg\OneDrive\Documents\ztest\laminar\backend\data\sample_audit_report.pdf")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(pdf_bytes)
    print(f"[PASS] Verified PDF written to disk: {out_path}")

    print("\n=== Phase F Verification PASSED Successfully ===")

if __name__ == "__main__":
    asyncio.run(main())
