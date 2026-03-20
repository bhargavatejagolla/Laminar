import os
import requests
import uuid

# Mock backend URL
BACKEND_URL = "http://127.0.0.1:8000/api/v1"

def verify_download():
    print("Verifying video download flow...")
    
    # 1. Check if we can list cameras (need at least one)
    try:
        resp = requests.get(f"{BACKEND_URL}/cameras")
        if resp.status_code != 200:
            print(f"Error: Could not list cameras ({resp.status_code})")
            return
        
        cameras = resp.json()
        if not cameras:
            print("Error: No cameras found. Please create a camera first.")
            return
            
        camera_id = cameras[0]["id"]
        print(f"Found camera: {camera_id}")
        
    except Exception as e:
        print(f"Error: Backend might be offline. {e}")
        return

    # 2. Check clips for the camera
    resp = requests.get(f"{BACKEND_URL}/cameras/{camera_id}/clips")
    if resp.status_code != 200:
        print(f"Error: Could not list clips ({resp.status_code})")
        return
        
    clips = resp.json()
    if not clips:
        print("Note: No clips found for this camera. Try recording a clip first.")
        # We can't proceed further without a clip, but we can check if the field exists
        return

    clip = clips[0]
    print(f"Latest clip: {clip['filename']}")
    
    if "download_url" not in clip:
        print("Error: 'download_url' field missing from clip response!")
        return

    download_url = f"http://127.0.0.1:8000{clip['download_url']}"
    print(f"Checking download URL: {download_url}")
    
    # 3. Verify the download endpoint headers
    resp = requests.get(download_url)
    if resp.status_code == 200:
        content_disposition = resp.headers.get("Content-Disposition", "")
        if "attachment" in content_disposition:
            print("SUCCESS: Content-Disposition header correctly set to 'attachment'.")
        else:
            print(f"Error: Content-Disposition header missing or incorrect: {content_disposition}")
    else:
        print(f"Error: Download endpoint returned status {resp.status_code}")

if __name__ == "__main__":
    verify_download()
