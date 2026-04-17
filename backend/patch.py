import codecs
import re
import os

path = 'c:/Users/bharg/OneDrive/Documents/ztest/laminar/backend/app/vision/stream_worker.py'
with codecs.open(path, 'r', 'utf-8') as f:
    content = f.read()

# 1. Imports
c1 = '''from app.services.dwell_time_service import get_dwell_service
from app.services.intelligence.zone_orchestrator import get_zone_orchestrator'''
r1 = '''from app.services.dwell_time_service import get_dwell_service
from app.services.intelligence.zone_orchestrator import get_zone_orchestrator
from app.api.v1.endpoints.websocket import ws_manager'''
if c1 in content:
    content = content.replace(c1, r1)
    print("Replaced chunk 1")
else:
    print("Warning: c1 not found")

# 2. _metrics_broadcast_counter
c2 = '''        self._semantic_index_interval: int = 5  # seconds
        # One orchestrator per camera'''
r2 = '''        self._semantic_index_interval: int = 5  # seconds
        self._metrics_broadcast_counter = 0 # To throttle WS broadcast
        # One orchestrator per camera'''
if c2 in content:
    content = content.replace(c2, r2)
    print("Replaced chunk 2")
else:
    print("Warning: c2 not found")

# 3. Live Broadcast
c3 = '''            except Exception as e:
                logger.error(f"Movement analysis failed for camera {self.camera_id}: {e}")

            # ==========================================================
            # Step 5: PRODUCTION EFFICIENT SAVE LOGIC'''
r3 = '''            except Exception as e:
                logger.error(f"Movement analysis failed for camera {self.camera_id}: {e}")

            # ── 🔴 [LIVE BROADCAST] Push kinetics to WebSocket ──────────────────
            self._metrics_broadcast_counter += 1
            if self._metrics_broadcast_counter % 5 == 0: # Every ~5 frames for smoothness
                try:
                    import asyncio
                    from app.api.v1.endpoints.websocket import ws_manager
                    asyncio.create_task(ws_manager.broadcast({
                        "type": "live_metrics",
                        "data": {
                            "camera_id": str(self.camera_id),
                            "velocity": round(float(cur_velocity), 2),
                            "variance": round(float(cur_variance), 3),
                            "acceleration": round(float(cur_acceleration), 2),
                            "count": detected_count,
                            "timestamp": now.isoformat()
                        }
                    }))
                except Exception as e:
                    pass # Non-critical

            # ==========================================================
            # Step 5: PRODUCTION EFFICIENT SAVE LOGIC'''
if c3 in content:
    content = content.replace(c3, r3)
    print("Replaced chunk 3")
else:
    print("Warning: c3 not found")

# 4. Heartbeat DB retry
c4 = '''                # This updates last_heartbeat_at on the Camera row so the
                # Camera Health page shows a live timestamp instead of "Never".
                try:
                    from app.models.camera import Camera as CameraModel
                    from sqlalchemy import select as sa_select
                    async with db_manager.session() as hb_session:
                        hb_res = await hb_session.execute(
                            sa_select(CameraModel).where(CameraModel.id == self.camera_id)
                        )
                        cam_row = hb_res.scalar_one_or_none()
                        if cam_row:
                            cam_row.update_heartbeat()  # sets last_heartbeat_at = now + is_online = True
                            await hb_session.commit()
                except Exception as hb_err:
                    logger.warning(
                        "Heartbeat DB write failed",
                        extra={"camera_id": str(self.camera_id), "error": str(hb_err)},
                    )'''
r4 = '''                # This updates last_heartbeat_at on the Camera row so the
                # Camera Health page shows a live timestamp instead of "Never".
                import asyncio
                for hb_attempt in range(3):
                    try:
                        from app.models.camera import Camera as CameraModel
                        from sqlalchemy import select as sa_select
                        async with db_manager.session() as hb_session:
                            hb_res = await hb_session.execute(
                                sa_select(CameraModel).where(CameraModel.id == self.camera_id)
                            )
                            cam_row = hb_res.scalar_one_or_none()
                            if cam_row:
                                cam_row.update_heartbeat()  # sets last_heartbeat_at = now + is_online = True
                                await hb_session.commit()
                        break
                    except Exception as hb_err:
                        if hb_attempt == 2:
                            logger.warning(
                                "Heartbeat DB write failed after retries",
                                extra={"camera_id": str(self.camera_id), "error": str(hb_err)},
                            )
                        await asyncio.sleep(0.5)'''
if c4 in content:
    content = content.replace(c4, r4)
    print("Replaced chunk 4")
else:
    print("Warning: c4 not found")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(content)

print('Patch script finished.')
