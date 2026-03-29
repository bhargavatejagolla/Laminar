import subprocess
import sys
import threading
import os
import time

def read_output(process, prefix):
    for line in iter(process.stdout.readline, b''):
        sys.stdout.write(f"[{prefix}] {line.decode('utf-8', errors='replace')}")

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    print("[SYSTEM] Starting Laminar Backend (FastAPI)...")
    
    venv_python = os.path.join(backend_dir, "venv", "Scripts", "python.exe") if os.name == "nt" else os.path.join(backend_dir, "venv", "bin", "python")
    python_exe = venv_python if os.path.exists(venv_python) else sys.executable
    
    if os.path.exists(venv_python):
        print(f"[SYSTEM] Using Backend Virtual Environment: {venv_python}")
    else:
        print(f"[SYSTEM] Virtual environment not found. Using global Python: {python_exe}")

    backend_process = subprocess.Popen(
        [python_exe, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=backend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT
    )

    print("[SYSTEM] Starting Laminar Frontend (Next.js)...")
    frontend_process = subprocess.Popen(
        ["npm.cmd" if os.name == "nt" else "npm", "run", "dev"],
        cwd=frontend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT
    )
    
    t1 = threading.Thread(target=read_output, args=(backend_process, "BACKEND"))
    t1.daemon = True
    t1.start()

    t2 = threading.Thread(target=read_output, args=(frontend_process, "FRONTEND"))
    t2.daemon = True
    t2.start()

    try:
        print("\n" + "="*40)
        print("🚀 LAMINAR UNIFIED SERVER IS RUNNING")
        print("="*40)
        print("➜ Local Network: http://localhost:3000")
        print("➜ To Expose Globally, run this in a NEW terminal:")
        print("      ngrok http 3000")
        print("\nPress Ctrl+C at any time to cleanly stop both servers.\n")
        
        while backend_process.poll() is None and frontend_process.poll() is None:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n[SYSTEM] Ctrl+C detected. Shutting down all unified servers...")
        backend_process.terminate()
        frontend_process.terminate()
        backend_process.wait()
        frontend_process.wait()
        print("[SYSTEM] All servers gracefully stopped.")

if __name__ == "__main__":
    main()
