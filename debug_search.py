import requests
import json

try:
    response = requests.post(
        "http://127.0.0.1:8000/api/v1/search/semantic",
        json={"query": "test", "top_k": 1},
        timeout=120
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
