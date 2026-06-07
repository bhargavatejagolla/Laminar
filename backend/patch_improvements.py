import os
import re

endpoints_dir = r"C:\Users\bharg\OneDrive\Documents\ztest\laminar\backend\app\api\v1\endpoints"
vision_dir = r"C:\Users\bharg\OneDrive\Documents\ztest\laminar\backend\app\vision"

print("Updating endpoints...")
for fname in os.listdir(endpoints_dir):
    if fname.endswith(".py"):
        fpath = os.path.join(endpoints_dir, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        if "yield boundary + (frame_bytes if frame_bytes else blank_bytes) + b" in content:
            new_generator = """        last_yielded = None
        while True:
            worker = ORCHESTRATOR._workers.get(cam_uuid)
            frame_bytes = getattr(worker, "_cached_frame_bytes", None) if worker else None
            
            if frame_bytes and frame_bytes != last_yielded:
                yield boundary + frame_bytes + b"\\r\\n"
                last_yielded = frame_bytes
            elif not frame_bytes:
                yield boundary + blank_bytes + b"\\r\\n"
                
            await asyncio.sleep(0.033)"""

            pattern = re.compile(r'        while True:.*?yield boundary \+ \(frame_bytes if frame_bytes else blank_bytes\) \+ b"\\r\\n".*?await asyncio\.sleep\([\d\.]+\)', re.DOTALL)
            if pattern.search(content):
                content = pattern.sub(new_generator, content)
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"Updated {fname}")

print("Updating vision workers...")
for fname in os.listdir(vision_dir):
    if fname.endswith(".py"):
        fpath = os.path.join(vision_dir, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
        
        modified = False
        
        if re.search(r"cv2\.IMWRITE_JPEG_QUALITY, \d+", content):
            content = re.sub(r"cv2\.IMWRITE_JPEG_QUALITY, \d+", "cv2.IMWRITE_JPEG_QUALITY, 65", content)
            modified = True
            
        if "detection_interval = 0.5" in content:
            content = content.replace("detection_interval = 0.5", "detection_interval = 0.05")
            modified = True
            
        for old in ['"yolo11n.pt"', '"yolov8n.pt"']:
            if old in content:
                content = content.replace(old, '"yolo11m.pt"')
                modified = True
            
        if modified:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Updated {fname}")
print("Done!")
