import asyncio
from app.core.database import db_manager
from app.models.camera import Camera
from uuid import UUID

async def run():
    async with db_manager.session() as s:
        c = await s.get(Camera, UUID('a20f28d6-f81f-4bfe-b34e-ebee23f3888f'))
        if c:
            c.is_active = True
            c.monitoring_enabled = True
            await s.commit()
            print(f"Camera {c.id} activated")
        else:
            print("Camera not found")

if __name__ == "__main__":
    asyncio.run(run())
