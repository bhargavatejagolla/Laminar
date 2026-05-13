
import asyncio
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import db_manager
from app.services.laminar_intelligence_service import laminar_intelligence
from app.services.notification_service import notification_service
from app.models.venue import Venue
from app.models.crowd_alert import CrowdAlert
from sqlalchemy import select

async def verify_briefs():
    async with db_manager.session() as session:
        # Get a test venue
        result = await session.execute(select(Venue).limit(1))
        venue = result.scalar_one_or_none()
        
        if not venue:
            print("No venue found for testing.")
            return

        # Ensure staffing_config exists
        venue.staffing_config = {
            "low": 2,
            "medium": 5,
            "high": 12,
            "critical": 25
        }
        await session.commit()
        await session.refresh(venue)

        domains = ["crowd", "parking", "traffic", "incident"]
        risk_levels = ["medium", "high", "critical"]

        print(f"\n--- VERIFYING INTELLIGENCE BRIEFS FOR VENUE: {venue.name} ---")
        
        for domain in domains:
            for risk in risk_levels:
                alert = CrowdAlert(
                    id=uuid.uuid4(),
                    venue_id=venue.id,
                    risk_level=risk,
                    severity=0.8 if risk == "critical" else 0.5,
                    status="open",
                    explanation=f"Test {domain} alert",
                    extra_data={
                        "domain": domain,
                        "type": "congestion" if domain == "traffic" else "accident" if domain == "incident" else "saturation",
                        "count": 150 if domain != "incident" else 1,
                        "occupancy": 85 if domain == "parking" else None
                    }
                )
                
                print(f"\n[DOMAIN: {domain.upper()} | RISK: {risk.upper()}]")
                brief = await laminar_intelligence.generate_notification_brief(
                    session, alert, venue.name, "Main Entrance", lang="en"
                )
                print(brief)
                
                # Verify Email Building (UI Structure)
                email = notification_service._build_email(
                    alert=alert,
                    venue=venue,
                    location_text="Main Entrance",
                    color="#dc2626",
                    ai_brief=brief,
                    ai_brief_is_llm=False,
                    live_metrics={"avg_count": 150, "occupancy_percent": 85}
                )
                
                html = email.get_payload(1).get_payload() if hasattr(email, 'get_payload') and isinstance(email.get_payload(), list) else email.get_content()
                
                if "Deployment Requirement" in str(html) and "Google Maps" in str(html):
                    print("✅ Email UI structure verified (Staffing & Maps present)")
                else:
                    print("❌ Email UI structure MISSING markers")

if __name__ == "__main__":
    asyncio.run(verify_briefs())
