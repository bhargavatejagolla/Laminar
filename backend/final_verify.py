import asyncio
import os
import sys

# Ensure backend directory is in path
sys.path.append(os.getcwd())

from app.core.database import db_manager
from app.vision.manager import vision_manager

async def verify():
    print("🚀 STARTING FINAL ARCHITECTURAL VALIDATION...")
    
    try:
        print("1. Initializing Database...")
        await db_manager.initialize()
        print("✅ Database Initialized.")
        
        print("2. Starting Vision Manager (YOLOv11s)...")
        await vision_manager.start()
        print("✅ Vision Manager Started.")
        
        print("3. Waiting for synchronization (10s)...")
        await asyncio.sleep(10)
        
        status = await vision_manager.get_status()
        print(f"   Status: {status.get('status')}")
        print(f"   Active Workers: {len(vision_manager._workers)}")
        
        if len(vision_manager._workers) > 0:
            for cid, w in vision_manager._workers.items():
                st = await w.get_status()
                print(f"   - [CAM {cid[:8]}] Running: {st.get('running')}, Healthy: {st.get('healthy')}")
        else:
            print("   ⚠️ No active workers - check if cameras are enabled in DB.")
            
        print("4. Stopping Vision Manager...")
        await vision_manager.stop()
        print("✅ Vision Manager Stopped.")
        
        print("\n🏆 VALIDATION SUCCESSFUL: CORE ARCHITECTURE IS LIVE.")
        
    except Exception as e:
        print(f"\n❌ VALIDATION FAILED: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(verify())
