import asyncio
import uuid
from datetime import datetime, timezone
from app.core.database import db_manager
from app.services.alert_engine_service import AlertEngineService
from app.models.venue import Venue

async def test_explainer():
    from app.services.alert_explainer_service import AlertExplainerService
    
    # We don't even need the db connection for the prompt generation, just to see the LLM output.
    decision = {
        "venue_id": str(uuid.uuid4()),
        "metric_id": str(uuid.uuid4()),
        "should_alert": True,
        "current_level": "critical",
        "severity": 95,
        "recommended_action": "Evacuate the area immediately.",
        "triggering_events": [
            {
                "type": "overcapacity",
                "value": 312,
                "threshold": 250
            }
        ]
    }

    explainer = AlertExplainerService()
    prompt = explainer._build_prompt(decision)
    print("--- Built Prompt ---")
    print(prompt)
    
    print("\n--- Calling Ollama ---")
    explanation = await explainer._call_ollama(prompt)
    print(f"\nFinal Explanation:\n{explanation}")

if __name__ == "__main__":
    asyncio.run(test_explainer())
