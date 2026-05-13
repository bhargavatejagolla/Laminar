import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get("http://127.0.0.1:8000/", timeout=2.0)
            print(f"Root status: {resp.status_code}")
            print(f"Root body: {resp.text}")
            
            resp = await client.get("http://127.0.0.1:8000/api/v1/traffic/status", timeout=2.0)
            print(f"Traffic status status: {resp.status_code}")
            print(f"Traffic status body: {resp.text}")
        except Exception as e:
            print(f"Error type: {type(e)}")
            print(f"Error details: {str(e)}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
