import subprocess
import sys
import threading
import os
import time
import re

def kill_port(port):
    """Kill any process occupying the given port (Windows)."""
    try:
        # Use netstat to find PIDs on the port
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True
        )
        # Match :port followed by whitespace, then any address, then LISTENING, then the PID
        pattern = re.compile(rf":{port}\s+.*LISTENING\s+(\d+)")
        
        killed_pids = set()
        for line in result.stdout.splitlines():
            match = pattern.search(line)
            if match:
                pid = match.group(1)
                if pid not in killed_pids and pid != "0":
                    print(f"[SYSTEM] Found process {pid} on port {port}. Attempting forced termination...")
                    subprocess.run(["taskkill", "/F", "/PID", pid],
                                   capture_output=True, check=False)
                    killed_pids.add(pid)
        
        if killed_pids:
            print(f"[SYSTEM] Cleared {len(killed_pids)} stale process(es) on port {port}")
            time.sleep(1.5)  # allow OS extra time to release the socket
        
    except Exception as e:
        print(f"[SYSTEM] Warning: could not clear port {port}: {e}")

def read_output(process, prefix):
    for line in iter(process.stdout.readline, b''):
        try:
            msg = line.decode('utf-8', errors='replace')
            sys.stdout.write(f"[{prefix}] {msg}")
            sys.stdout.flush()
        except Exception:
            # Fallback for extreme encoding mismatches
            pass

def main():
    # Force the local terminal to handle UTF-8 if possible
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    print("[SYSTEM] Clearing any stale processes on ports 3000 and 8000...")
    kill_port(8000)
    kill_port(3000)
    time.sleep(1)  # brief pause so OS releases the ports

    # Use the backend venv Python if it exists (has all installed deps)
    venv_python = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
    backend_python = venv_python if os.path.exists(venv_python) else sys.executable

    print("[SYSTEM] Starting Laminar Backend (FastAPI)...")
    backend_process = subprocess.Popen(
        [backend_python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
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
        print("--- LAMINAR UNIFIED SERVER IS RUNNING ---")
        print("="*40)
        print("  Local Network: http://localhost:3000")
        print("  To Expose Globally, run this in a NEW terminal:")
        print("      ngrok http 3000")
        print("\nPress Ctrl+C at any time to cleanly stop both servers.\n")

        while True:
            # Check frontend
            if frontend_process.poll() is not None:
                print("[SYSTEM] Frontend process exited. Stopping backend and exiting...")
                backend_process.terminate()
                break
            
            # Check backend
            if backend_process.poll() is not None:
                exit_code = backend_process.poll()
                print(f"[SYSTEM] WARNING: Backend process exited with code {exit_code}.")
                
                if exit_code != 0:
                    print("[SYSTEM] Attempting to restart backend in 3 seconds...")
                    time.sleep(3)
                    # Clear port just in case it's still hung
                    kill_port(8000)
                    backend_process = subprocess.Popen(
                        [backend_python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
                        cwd=backend_dir,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT
                    )
                    # Restart output thread
                    t_restart = threading.Thread(target=read_output, args=(backend_process, "BACKEND"))
                    t_restart.daemon = True
                    t_restart.start()
                else:
                    print("[SYSTEM] Backend exited cleanly. Stopping.")
                    break
            
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
