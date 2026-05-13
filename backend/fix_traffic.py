import re

path = 'app/api/v1/endpoints/traffic.py'
content = open(path, encoding='utf-8').read()

# 1. Remove send_dedicated_traffic_email
pattern1 = r'async def send_dedicated_traffic_email\(.*?\n    await asyncio\.to_thread\(_sync_send\)\n'
content = re.sub(pattern1, '', content, flags=re.DOTALL)

# 2. Update push_traffic_event
old_fire_live = r'''            if venue_id:
                async def _fire_live_traffic_email\(vid, cnt, den, vel, wt, rs, tier, ins, rec\):
                    try:
                        from app.models.venue import Venue as VenueModel
                        async with db_manager.session\(\) as sess:
                            v = await sess.get\(VenueModel, UUID\(vid\)\)
                            if not v:
                                stmt = select\(VenueModel\)\.limit\(1\)
                                res = await sess.execute\(stmt\)
                                v = res.scalar_one_or_none\(\)
                            if v:
                                await send_dedicated_traffic_email\(
                                    venue_obj=v, count=cnt, density=den,
                                    velocity=vel, wait_time=wt, risk_score=rs,
                                    tier_label=tier, insight=ins, recommendation=rec
                                \)
                    except Exception as ex:
                        logger.error\(f"Live traffic email failed: \{ex\}"\)'''

new_fire_live = '''            if venue_id:
                async def _fire_live_traffic_email(vid, cnt, den, vel, wt, rs, tier, ins, rec):
                    try:
                        from app.models.venue import Venue as VenueModel
                        from app.services.notification_service import NotificationService
                        async with db_manager.session() as sess:
                            v = await sess.get(VenueModel, UUID(vid))
                            if not v:
                                stmt = select(VenueModel).limit(1)
                                res = await sess.execute(stmt)
                                v = res.scalar_one_or_none()
                            if v:
                                notif_svc = NotificationService()
                                metadata = {
                                    "count": cnt, "density": den, "velocity": vel,
                                    "wait_time": wt, "risk_score": rs, "insight": ins,
                                    "recommendation": rec, "latitude": v.latitude, "longitude": v.longitude
                                }
                                await notif_svc.notify_realtime_event(
                                    session=sess, domain="traffic", type="congestion",
                                    priority=tier, description=ins,
                                    venue_id=str(v.id), venue_name=v.name,
                                    camera_id=camera_id, metadata=metadata
                                )
                                await notif_svc.push_notification(
                                    domain="traffic", type="congestion",
                                    priority=tier, description=ins,
                                    venue_id=str(v.id), venue_name=v.name,
                                    camera_id=camera_id, metadata=metadata
                                )
                    except Exception as ex:
                        logger.error(f"Live traffic email failed: {ex}")'''
content = re.sub(old_fire_live, new_fire_live, content, flags=re.DOTALL)

# 3. Update upload_traffic_video
old_upload = r'''                    if v_obj:
                        tier = "CRITICAL" if peak_density == "Critical" else "HIGH"
                        insight = \(
                            f"Video analysis of '\{file.filename\}' \(\{len\(frame_results\)\} frames sampled\): "
                            f"Peak density was \{peak_density\} with up to \{max_count\} vehicles. "
                            f"Avg speed \{avg_speed:.1f\} px/s, avg wait \{avg_wait:.1f\} min."
                        \)
                        recommendation = _generate_recommendation\(peak_density, peak_risk_score\)
                        await send_dedicated_traffic_email\(
                            venue_obj=v_obj,
                            count=max_count,
                            density=peak_density,
                            velocity=avg_speed,
                            wait_time=avg_wait,
                            risk_score=peak_risk_score,
                            tier_label=tier,
                            insight=insight,
                            recommendation=recommendation,
                            screenshot_path=screenshot_path
                        \)
                        
                        # --- Send SMS ---
                        try:
                            from app.services.sms_alert_service import SmsAlertService
                            from app.models.user import User
                            sms = SmsAlertService\(\)
                            stmt_sms = select\(User.phone_number\)\.where\(
                                User.receive_sms_alerts == True, User.phone_number.isnot\(None\)
                            \)
                            res_sms = await sess.execute\(stmt_sms\)
                            contacts = \[row\[0\] for row in res_sms.all\(\)\]
                            if contacts:
                                sms_msg = \(
                                    f"🚨 \[LAMINAR TRAFFIC \{tier\}\]\\n"
                                    f"Venue: \{v_obj.name\}\\n"
                                    f"Vehicles: \{max_count\} \| Status: \{peak_density\}\\n"
                                    f"Flow: \{avg_speed:.1f\}px/s \| Wait: \{avg_wait:.1f\}m\\n"
                                    f"Action: \{recommendation\}"
                                \)
                                await sms.notify_recipients\(contacts, sms_msg\)
                        except Exception as e_sms:
                            logger.error\(f"Traffic video SMS failed: \{e_sms\}"\)'''

new_upload = '''                    if v_obj:
                        tier = "CRITICAL" if peak_density == "Critical" else "HIGH"
                        insight = (
                            f"Video analysis of '{file.filename}' ({len(frame_results)} frames sampled): "
                            f"Peak density was {peak_density} with up to {max_count} vehicles. "
                            f"Avg speed {avg_speed:.1f} px/s, avg wait {avg_wait:.1f} min."
                        )
                        recommendation = _generate_recommendation(peak_density, peak_risk_score)
                        
                        from app.services.notification_service import NotificationService
                        import uuid
                        notif_svc = NotificationService()
                        v_id_str = str(getattr(v_obj, "id", uuid.uuid4()))
                        metadata = {
                            "count": max_count, "density": peak_density, "velocity": avg_speed,
                            "wait_time": avg_wait, "risk_score": peak_risk_score, "insight": insight,
                            "recommendation": recommendation, "screenshot_path": screenshot_path,
                            "latitude": v_obj.latitude, "longitude": v_obj.longitude
                        }
                        
                        await notif_svc.notify_realtime_event(
                            session=sess, domain="traffic", type="congestion",
                            priority=tier, description=insight,
                            venue_id=v_id_str, venue_name=v_obj.name,
                            camera_id=camera_id, metadata=metadata
                        )
                        await notif_svc.push_notification(
                            domain="traffic", type="congestion",
                            priority=tier, description=insight,
                            venue_id=v_id_str, venue_name=v_obj.name,
                            camera_id=camera_id, metadata=metadata
                        )'''

content = re.sub(old_upload, new_upload, content, flags=re.DOTALL)

open(path, 'w', encoding='utf-8').write(content)
print("Done rewriting traffic.py")
