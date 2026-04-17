import codecs

path = 'c:/Users/bharg/OneDrive/Documents/ztest/laminar/backend/app/vision/stream_worker.py'
with codecs.open(path, 'r', 'utf-8') as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Counter
text = text.replace(
    '        self._semantic_index_interval: int = 5  # seconds\n        # One orchestrator per camera',
    '        self._semantic_index_interval: int = 5  # seconds\n        self._metrics_broadcast_counter = 0 # To throttle WS broadcast\n        # One orchestrator per camera'
)

# 2. WebSocket Broadcast
ws_target = '''            except Exception as e:\n                logger.error(f"Movement analysis failed for camera {self.camera_id}: {e}")\n\n            # ==========================================================\n            # Step 5: PRODUCTION EFFICIENT SAVE LOGIC'''

ws_replace = '''            except Exception as e:\n                logger.error(f"Movement analysis failed for camera {self.camera_id}: {e}")\n\n            # ── 🔴 [LIVE BROADCAST] Push kinetics to WebSocket ──────────────────\n            self._metrics_broadcast_counter += 1\n            if self._metrics_broadcast_counter % 5 == 0: # Every ~5 frames for smoothness\n                try:\n                    import asyncio\n                    from app.api.v1.endpoints.websocket import ws_manager\n                    asyncio.create_task(ws_manager.broadcast({\n                        "type": "live_metrics",\n                        "data": {\n                            "camera_id": str(self.camera_id),\n                            "velocity": round(float(cur_velocity), 2),\n                            "variance": round(float(cur_variance), 3),\n                            "acceleration": round(float(cur_acceleration), 2),\n                            "count": detected_count,\n                            "timestamp": now.isoformat()\n                        }\n                    }))\n                except Exception as eval_err:\n                    pass # Non-critical\n\n            # ==========================================================\n            # Step 5: PRODUCTION EFFICIENT SAVE LOGIC'''
text = text.replace(ws_target, ws_replace)

# 3. Heartbeat Retry
hb_target = '''                try:\n                    from app.models.camera import Camera as CameraModel\n                    from sqlalchemy import select as sa_select\n                    async with db_manager.session() as hb_session:\n                        hb_res = await hb_session.execute(\n                            sa_select(CameraModel).where(CameraModel.id == self.camera_id)\n                        )\n                        cam_row = hb_res.scalar_one_or_none()\n                        if cam_row:\n                            cam_row.update_heartbeat()  # sets last_heartbeat_at = now + is_online = True\n                            await hb_session.commit()\n                except Exception as hb_err:\n                    logger.warning(\n                        "Heartbeat DB write failed",\n                        extra={"camera_id": str(self.camera_id), "error": str(hb_err)},\n                    )'''

hb_replace = '''                import asyncio\n                for hb_attempt in range(3):\n                    try:\n                        from app.models.camera import Camera as CameraModel\n                        from sqlalchemy import select as sa_select\n                        async with db_manager.session() as hb_session:\n                            hb_res = await hb_session.execute(\n                                sa_select(CameraModel).where(CameraModel.id == self.camera_id)\n                            )\n                            cam_row = hb_res.scalar_one_or_none()\n                            if cam_row:\n                                cam_row.update_heartbeat()  # sets last_heartbeat_at = now + is_online = True\n                                await hb_session.commit()\n                        break\n                    except Exception as hb_err:\n                        if hb_attempt == 2:\n                            logger.warning(\n                                "Heartbeat DB write failed after retries",\n                                extra={"camera_id": str(self.camera_id), "error": str(hb_err)},\n                            )\n                        await asyncio.sleep(0.5)'''
text = text.replace(hb_target, hb_replace)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(text)
