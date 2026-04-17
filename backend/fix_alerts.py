import asyncio
import os
import sys

# Configure environment and path before importing Laminar internals
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import db_manager
from app.models.crowd_alert import CrowdAlert
from sqlalchemy import update

async def wipe_old_alert_explanations():
    print("Connecting to database to clear old alert explanations...")
    try:
        async with db_manager.session() as session:
            # Wipe explanations, effectively forcing AI cache misses 
            # so the alerts generate completely fresh natural language paragraphs!
            await session.execute(
                update(CrowdAlert).values(explanation=None)
            )
            await session.commit()
            print("Successfully wiped all old explanations! Next time the UI polls, AI will regenerate beautifully written paragraphs.")
    except Exception as e:
        print(f"Error wiping alerts: {e}")
        
if __name__ == "__main__":
    asyncio.run(wipe_old_alert_explanations())
