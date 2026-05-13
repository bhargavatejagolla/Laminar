import sys
import uvicorn
from app.main import app
import traceback

if __name__ == "__main__":
    print("Starting uvicorn programmatically...")
    try:
        uvicorn.run(app, host="127.0.0.1", port=8000)
    except Exception as e:
        print(f"Server crashed: {e}")
        traceback.print_exc()
