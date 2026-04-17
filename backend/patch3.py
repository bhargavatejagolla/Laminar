import codecs
import sys

path = 'c:/Users/bharg/OneDrive/Documents/ztest/laminar/backend/app/vision/stream_worker.py'
with codecs.open(path, 'r', 'utf-8') as f:
    lines = f.readlines()

out = []
for i, line in enumerate(lines):
    # 1. Imports
    if "from app.services.intelligence.zone_orchestrator import get_zone_orchestrator" in line:
        out.append(line)
        out.append("from app.api.v1.endpoints.websocket import ws_manager\n")
        continue
    
    # 2. _metrics_broadcast_counter
    if "self._semantic_index_interval: int = 5  # seconds" in line:
        out.append(line)
        out.append("        self._metrics_broadcast_counter = 0 # To throttle WS broadcast\n")
        continue

    # 3. Live kinetics broadcast
    if "logger.error(f\"Movement analysis failed for camera {self.camera_id}: {e}\")" in line:
        out.append(line)
        ws_code = [
            "\n",
            "            # ── 🔴 [LIVE BROADCAST] Push kinetics to WebSocket ──────────────────\n",
            "            self._metrics_broadcast_counter += 1\n",
            "            if self._metrics_broadcast_counter % 5 == 0: # Every ~5 frames for smoothness\n",
            "                try:\n",
            "                    import asyncio\n",
            "                    from app.api.v1.endpoints.websocket import ws_manager\n",
            "                    asyncio.create_task(ws_manager.broadcast({\n",
            "                        \"type\": \"live_metrics\",\n",
            "                        \"data\": {\n",
            "                            \"camera_id\": str(self.camera_id),\n",
            "                            \"velocity\": round(float(cur_velocity), 2),\n",
            "                            \"variance\": round(float(cur_variance), 3),\n",
            "                            \"acceleration\": round(float(cur_acceleration), 2),\n",
            "                            \"count\": detected_count,\n",
            "                            \"timestamp\": now.isoformat()\n",
            "                        }\n",
            "                    }))\n",
            "                except Exception as eval_err:\n",
            "                    pass # Non-critical\n"
        ]
        out.extend(ws_code)
        continue

    out.append(line)

out_text = "".join(out)

# For heartbeat, it's safer to do string replace on the full text
import re
pattern = r"(\s+try:\n\s+from app\.models\.camera import Camera as CameraModel.*?\s+except Exception as hb_err:\n\s+logger\.warning\(\n\s+\"Heartbeat DB write failed\",\n\s+extra={\"camera_id\": str\(self\.camera_id\), \"error\": str\(hb_err\)},\n\s+\))"

replacement = '''                import asyncio
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

# Using re.DOTALL so .* matches newlines
def patch_text(t):
    return re.sub(pattern, replacement, t, flags=re.DOTALL)

try:
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(patch_text(out_text))
    print("Patch applied successfully.")
except Exception as e:
    print("Error:", e)
