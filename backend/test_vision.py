import asyncio
import cv2
from app.vision.manager import VisionManager, StreamWorker

async def test_vision_manager():
    from app.core.database import db_manager
    print("Initializing Database")
    await db_manager.initialize()
    
    print("Initializing Vision Manager")
    vm = VisionManager()
    await vm.start()
    
    print("\nWaiting for 10 seconds for VM to sync with DB...")
    await asyncio.sleep(10)
    
    status = vm.get_status()
    print("\nVision Manager Status:")
    for k, v in status.items():
        print(f"  {k}: {v}")
    
    print("\nCamera Workers:")
    workers = vm._workers
    if not workers:
        print("  No workers found.")
    else:
        for cid, w in workers.items():
            st = await w.get_status()
            print(f"  [{cid}] Running: {st.get('running')}, Healthy: {st.get('healthy')}")
            frames = st.get('frames', {})
            print(f"    Frames processed: {frames.get('processed')}, Failed: {frames.get('failed')}")
            
    await vm.stop()
    print("Vision Manager stopped.")

if __name__ == "__main__":
    asyncio.run(test_vision_manager())
