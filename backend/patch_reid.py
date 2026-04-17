import codecs

path = 'c:/Users/bharg/OneDrive/Documents/ztest/laminar/backend/app/vision/stream_worker.py'
with codecs.open(path, 'r', 'utf-8') as f:
    text = f.read()

text = text.replace('\r\n', '\n')

reid_target = '''                    scaled_boxes.append({
                        "id": obj.get("id", 0),
                        "confidence": conf,
                        "bbox": [float(x1), float(y1), float(x2), float(y2)]
                    })'''

reid_replace = '''                    # ── 🔴 [LIVE INTELLIGENCE] ReID & Journey Tracking ──────────────────
                    from app.services.reid_service import reid_service
                    from app.services.journey_manager_service import journey_manager
                    
                    try:
                        embedding = reid_service.extract_embedding(frame, [x1, y1, x2, y2])
                        global_id = journey_manager.process_detection(str(self.camera_id), embedding)
                    except Exception as e:
                        global_id = None
                        logger.error(f"ReID extraction failed: {e}")

                    scaled_boxes.append({
                        "id": obj.get("id", 0),
                        "global_id": global_id,
                        "confidence": conf,
                        "bbox": [float(x1), float(y1), float(x2), float(y2)]
                    })'''

text = text.replace(reid_target, reid_replace)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(text)
