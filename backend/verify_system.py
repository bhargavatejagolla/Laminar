
import requests
import time

def verify_system():
    base_url = "http://localhost:8000/api/v1"
    endpoints = [
        "/health",
        "/intelligence/system",
        "/search/status",
        "/dwell/metrics/all",
        "/alerts"
    ]
    
    print("=== LAMINAR SYSTEM VERIFICATION ===")
    print(f"Time: {time.ctime()}")
    
    for endpoint in endpoints:
        url = f"{base_url}{endpoint}"
        try:
            start = time.time()
            r = requests.get(url, timeout=10)
            elapsed = time.time() - start
            status = "PASS" if r.status_code == 200 else "FAIL"
            print(f"[{status}] {endpoint} - Status: {r.status_code} ({elapsed:.2f}s)")
            if status == "FAIL":
                print(f"      Error: {r.text[:100]}")
        except Exception as e:
            print(f"[ERROR] {endpoint} - {str(e)}")

    print("\nVerification pulse check complete.")

if __name__ == "__main__":
    verify_system()
