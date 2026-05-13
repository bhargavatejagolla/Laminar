import asyncio
import httpx
from app.core.config import settings

async def test_groq():
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.1-8b-instant",
        "messages": [{"role": "user", "content": "What is the capital of France?"}],
        "temperature": 0.2,
        "max_tokens": 50
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=payload)
        print("Status", resp.status_code)
        print("Response", resp.text)

if __name__ == "__main__":
    asyncio.run(test_groq())
