import cv2
import numpy as np

try:
    img = np.zeros((240, 320, 3), dtype="uint8")
    cv2.putText(img, "No dwell feed", (30, 120),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 2)
    success, buf = cv2.imencode(".jpg", img)
    if success:
        print(f"Encoded sizes: {len(buf.tobytes())}")
    else:
        print("Failed to encode")
except Exception as e:
    print(f"Exception: {e}")
