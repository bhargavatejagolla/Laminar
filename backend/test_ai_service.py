import asyncio
import os
import sys
import time
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.services.ai_service import get_ai_service

async def test_ai_memory():
    ai_service = get_ai_service()
    data = {
        "zone": "North Corridor",
        "crowd_density": 0.92,
        "dwell_time": 180,
        "trend": "increasing",
        "historical_avg_density": 0.50
    }
    
    print("--- 1. Generating First Insight (Cold Start, Memory Empty/Saving) ---")
    start = time.time()
    insight, provider = await ai_service.generate_insight(data, return_provider_name=True)
    duration_1 = time.time() - start
    print(f"Provider: {provider} | Time: {duration_1:.3f}s")
    print(json.dumps(insight, indent=2))
    
    # Wait a bit so async memory indexing can finish 
    await asyncio.sleep(2)
    
    print("\n--- 2. Generating Exact Same Insight (Testing Cache) ---")
    start2 = time.time()
    insight2, provider2 = await ai_service.generate_insight(data, return_provider_name=True)
    duration_2 = time.time() - start2
    print(f"Provider: {provider2} | Time: {duration_2:.5f}s (Should be near 0 due to LRU Cache)")
    print(json.dumps(insight2, indent=2))
    
    print("\n--- 3. Generating Insight for slightly different data (Testing Memory RAG) ---")
    # Slightly diff data so the MD5 hash differs, triggering a fresh LLM generation
    # but the AI memory service will fetch the item we just stored in step 1.
    data_mod = data.copy()
    data_mod["dwell_time"] = 190
    
    start3 = time.time()
    insight3, provider3 = await ai_service.generate_insight(data_mod, return_provider_name=True)
    duration_3 = time.time() - start3
    print(f"Provider: {provider3} | Time: {duration_3:.3f}s")
    print("Notice if the RAG context informed this output:")
    print(json.dumps(insight3, indent=2))


if __name__ == "__main__":
    asyncio.run(test_ai_memory())
