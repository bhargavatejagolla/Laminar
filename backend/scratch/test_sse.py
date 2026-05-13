import httpx
import asyncio
import json

async def listen_sse():
    url = "http://127.0.0.1:8000/api/v1/traffic/events/stream"
    print(f"Connecting to {url}...")
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("GET", url) as response:
                print(f"Status: {response.status_code}")
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = json.loads(line[6:])
                        print(f"Event received: {json.dumps(data, indent=2)}")
                        if data.get("latitude") and data.get("longitude"):
                            print("SUCCESS: Received event with coordinates!")
                            return
                        else:
                            print("KEEP WAITING: Event has zero/missing coordinates.")
                    await asyncio.sleep(0)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(asyncio.wait_for(listen_sse(), timeout=15))
    except asyncio.TimeoutError:
        print("Timeout: No events received in 15s. Is the TrafficWorker running?")
    except Exception as e:
        print(f"Final error: {e}")
