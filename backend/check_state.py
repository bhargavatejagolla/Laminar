
import asyncio
from app.core.global_state import GLOBAL_STATE

async def check_global_state():
    # Print all parking and traffic entries in GLOBAL_STATE
    print("=== GLOBAL STATE: PARKING ===")
    parking_states = GLOBAL_STATE.get_domain("parking")
    for venue_id, state in parking_states.items():
        print(f"Venue {venue_id}: {state}")
        
    print("\n=== GLOBAL STATE: TRAFFIC ===")
    traffic_states = GLOBAL_STATE.get_domain("traffic")
    for venue_id, state in traffic_states.items():
        print(f"Venue {venue_id}: {state}")

if __name__ == "__main__":
    asyncio.run(check_global_state())
