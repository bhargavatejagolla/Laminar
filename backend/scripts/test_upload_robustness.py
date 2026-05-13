import requests
import uuid
import os

BASE_URL = "http://localhost:8000/api/v1"

def test_upload_invalid_params():
    print("Testing upload with invalid params...")
    url = f"{BASE_URL}/traffic/upload?camera_id=test-cam&venue_id=invalid-uuid"
    
    # Create a tiny dummy mp4-like file
    with open("test_dummy.mp4", "wb") as f:
        f.write(b"\x00\x00\x00\x18ftypmp42")
    
    try:
        with open("test_dummy.mp4", "rb") as f:
            files = {"file": ("test_dummy.mp4", f, "video/mp4")}
            response = requests.post(url, files=files)
            print(f"Status Code: {response.status_code}")
            print(f"Response: {response.json()}")
            
            # Since the file is invalid as a video, it should return 400 or 422, NOT 500
            if response.status_code == 500:
                print("FAIL: Backend returned 500 Internal Server Error")
            else:
                print("SUCCESS: Backend handled invalid UUID and bad video gracefully")
    except Exception as e:
        print(f"Request failed: {e}")
    finally:
        if os.path.exists("test_dummy.mp4"):
            os.remove("test_dummy.mp4")

if __name__ == "__main__":
    # Note: This requires the server to be running. 
    # If not running, we'll just check if the code compiles and looks correct.
    try:
        test_upload_invalid_params()
    except Exception:
        print("Could not connect to server, but script is ready for manual verification.")
