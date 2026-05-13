
import cv2
import sys

def scan_cameras():
    print(f"Python: {sys.version}")
    print(f"OpenCV: {cv2.__version__}")
    
    available_indices = []
    for i in range(5):
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
        if cap.isOpened():
            ret, _ = cap.read()
            print(f"Index {i} (DSHOW): Opened={cap.isOpened()}, Read={ret}")
            if ret:
                available_indices.append(i)
            cap.release()
        else:
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                ret, _ = cap.read()
                print(f"Index {i} (Default): Opened={cap.isOpened()}, Read={ret}")
                if ret:
                    available_indices.append(i)
                cap.release()
            else:
                print(f"Index {i}: Not accessible")

    print(f"\nFinal Available IDs: {available_indices}")

if __name__ == "__main__":
    scan_cameras()
