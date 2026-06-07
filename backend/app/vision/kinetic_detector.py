import math
import random
import time
from typing import Dict, List, Any
from datetime import datetime

class KineticDetector:
    """
    Kinetic SOS 3.0 Multi-Signal Fusion Engine.
    Combines SOS gestures, Fall detection, Panic motion, and Audio distress signals
    into a unified Confidence Fusion Score.
    """
    def __init__(self, fps: int = 15):
        self.fps = fps
        self.history = {} # type: Dict[int, List[Dict[str, float]]] 
        self.max_history = int(fps * 2.0)  # keep 2 seconds of history
        self.frame_count = 0
        
        # State tracking for Confidence Fusion
        self.audio_conf = 0.0
        self.sos_conf = 0.0
        self.fall_conf = 0.0
        self.motion_conf = 0.0
        self.fusion_score = 0.0
        
        # Timeline and reporting
        self.timeline = []
        self.start_time = time.time()
        self.sos_activated = False

    def calculate_distance(self, p1, p2):
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    def inject_audio_signals(self, keyword_count: int):
        """Injects audio distress signals (e.g., from faster-whisper)"""
        if keyword_count > 0:
            self.audio_conf = min(100.0, keyword_count * 20.0)
            self._add_timeline_event(f"Distress Audio detected ({keyword_count} hits)")

    def _add_timeline_event(self, message: str):
        # Prevent spamming the exact same message in the timeline
        if not self.timeline or self.timeline[-1]["message"] != message:
            self.timeline.append({
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
                "message": message
            })

    def get_randy_summary(self) -> str:
        signals = []
        if self.sos_conf > 30: signals.append("✓ Distress Gesture")
        if self.audio_conf > 30: signals.append("✓ Audio Distress Keywords")
        if self.fall_conf > 30: signals.append("✓ Fall Detected")
        if self.motion_conf > 30: signals.append("✓ Panic Motion")
        
        if not signals:
            return "System optimal. No emergency signals detected."
            
        action = "Dispatch security immediately." if self.fusion_score > 70 else "Monitor situation closely."
        
        return f"""Emergency Confidence: {int(self.fusion_score)}%

Signals:
{chr(10).join(signals)}

Recommended Action:
{action}"""

    def get_fusion_state(self) -> Dict[str, Any]:
        return {
            "fusion_score": round(self.fusion_score, 1),
            "sos_conf": round(self.sos_conf, 1),
            "audio_conf": round(self.audio_conf, 1),
            "fall_conf": round(self.fall_conf, 1),
            "motion_conf": round(self.motion_conf, 1),
            "timeline": self.timeline[-10:], # last 10 events
            "randy_summary": self.get_randy_summary(),
            "sos_activated": self.sos_activated
        }

    def detect_anomalies(self, bounding_boxes: List[Dict[str, Any]], keypoints: List[List[Any]]) -> List[Dict[str, Any]]:
        events = []
        self.frame_count += 1
        
        # Decay confidences slightly over time if not re-detected (smoothing)
        self.sos_conf = max(0.0, self.sos_conf - 2.0)
        self.fall_conf = max(0.0, self.fall_conf - 1.0)
        self.motion_conf = max(0.0, self.motion_conf - 3.0)
        
        if not keypoints or not bounding_boxes:
            if self.frame_count in self.history:
                del self.history[self.frame_count]
            self._update_fusion()
            return events

        frame_history = []
        
        for kpts, bbox in zip(keypoints, bounding_boxes):
            b = bbox["bbox"]
            if len(b) == 1 and isinstance(b[0], (list, tuple)): b = b[0]
            if hasattr(b, 'tolist') and b.ndim == 2: b = b[0]
            bx1, by1, bx2, by2 = b
            
            centroid = ((bx1 + bx2) / 2, (by1 + by2) / 2)
            frame_history.append({'centroid': centroid, 'bbox': b})
            
            if not kpts or len(kpts) < 11:
                continue
                
            try:
                ls, rs = kpts[5], kpts[6]
                lw, rw = kpts[9], kpts[10]
                # Hostage / Gagged Posture (Both hands covering face/mouth)
                nose = kpts[0] if len(kpts) > 0 else None
                if nose and ls and rs and lw and rw:
                    dist_l = self.calculate_distance(lw, nose)
                    dist_r = self.calculate_distance(rw, nose)
                    shoulder_dist = self.calculate_distance(ls, rs)
                    
                    # If both wrists are very close to the nose relative to shoulder width
                    if shoulder_dist > 0 and dist_l < shoulder_dist * 0.7 and dist_r < shoulder_dist * 0.7:
                        self.sos_conf = min(100.0, self.sos_conf + 30.0)
                        if self.sos_conf > 40:
                            self._add_timeline_event("Hostage/Gagged posture detected")
                            events.append({
                                "type": "ATTACKING",
                                "risk_level": "CRITICAL",
                                "confidence": round(self.sos_conf, 1),
                                "bbox": b,
                                "message": "Hostage/Attack Detected"
                            })
                            continue # Skip other gestures if attack detected

                # SOS Gesture (Wrists raised high above shoulders)
                if ls and rs and lw and rw:
                    # Require them to be significantly above shoulders to avoid false positives when just scratching head
                    shoulder_dist = self.calculate_distance(ls, rs)
                    if lw[1] < ls[1] - shoulder_dist*0.2 and rw[1] < rs[1] - shoulder_dist*0.2:
                        self.sos_conf = min(100.0, self.sos_conf + 15.0) # builds confidence quickly
                        if self.sos_conf > 50:
                            self._add_timeline_event("Distress gesture detected")
                            events.append({
                                "type": "SOS_GESTURE",
                                "risk_level": "CRITICAL",
                                "confidence": round(self.sos_conf, 1),
                                "bbox": b,
                                "message": "Distress Gesture Detected"
                            })
                            continue
                            
                # Aggressive / Fighting Posture (Wide combat stance, arms raised)
                if ls and rs and lw and rw:
                    shoulder_dist = self.calculate_distance(ls, rs)
                    wrist_dist = self.calculate_distance(lw, rw)
                    try:
                        lh, rh = kpts[11], kpts[12]
                        if lh and rh and shoulder_dist > 0:
                            # Hands raised above hips and extended very wide (typical brawling/aggressive stance)
                            if lw[1] < lh[1] and rw[1] < rh[1] and wrist_dist > shoulder_dist * 2.2:
                                self.motion_conf = min(100.0, self.motion_conf + 20.0)
                                if self.motion_conf > 40:
                                    self._add_timeline_event("Aggressive fighting stance detected")
                                    events.append({
                                        "type": "FIGHTING",
                                        "risk_level": "CRITICAL",
                                        "confidence": round(self.motion_conf, 1),
                                        "bbox": b,
                                        "message": "Aggressive Combat Stance"
                                    })
                    except IndexError:
                        pass
                
                # Fall Detection (Rapid vertical drop -> horizontal)
                b_width = bx2 - bx1
                b_height = by2 - by1
                # Must be extremely wide (e.g. laying fully flat) to avoid false triggers on sitting people
                if b_height > 0 and b_width > b_height * 2.5:
                    self.fall_conf = min(100.0, self.fall_conf + 10.0)
                    if self.fall_conf > 40:
                        self._add_timeline_event("Fall detected")
                        events.append({
                            "type": "MEDICAL_EMERGENCY",
                            "risk_level": "CRITICAL",
                            "confidence": round(self.fall_conf, 1),
                            "bbox": b,
                            "message": "Sudden Collapse Detected"
                        })
            except IndexError:
                pass

        self.history[self.frame_count] = frame_history
        older_frame_count = self.frame_count - self.fps
        
        # Panic Motion
        if older_frame_count in self.history:
            past_centroids = self.history[older_frame_count]
            for current_item in frame_history:
                curr_c = current_item['centroid']
                closest_dist = float('inf')
                for past_item in past_centroids:
                    past_c = past_item['centroid']
                    dist = self.calculate_distance(curr_c, past_c)
                    if dist < closest_dist: closest_dist = dist
                
                if 80 < closest_dist < 400:
                    self.motion_conf = min(100.0, self.motion_conf + 20.0)
                    if self.motion_conf > 60:
                        self._add_timeline_event("Panic motion detected")
                        events.append({
                            "type": "PANIC_MOTION",
                            "risk_level": "HIGH",
                            "confidence": round(self.motion_conf, 1),
                            "bbox": current_item["bbox"],
                            "message": "Panic/Rapid Acceleration"
                        })

        if len(self.history) > self.max_history:
            oldest = min(self.history.keys())
            del self.history[oldest]
            
        fusion_event = self._update_fusion()
        if fusion_event:
            events.append(fusion_event)
            
        return events

    def _update_fusion(self):
        self.fusion_score = (
            (self.sos_conf * 0.35) +
            (self.audio_conf * 0.25) +
            (self.fall_conf * 0.50) +
            (self.motion_conf * 0.15)
        )
        # Cap at 100
        self.fusion_score = min(100.0, self.fusion_score)
        
        if self.fusion_score > 70 and not self.sos_activated:
            self.sos_activated = True
            self._add_timeline_event("Kinetic SOS Activated")
            self._add_timeline_event("Alert Sent")
            return {
                "type": "KINETIC_SOS_CRITICAL",
                "risk_level": "CRITICAL",
                "confidence": round(self.fusion_score, 1),
                "bbox": [0,0,0,0],
                "message": "AI Confidence Fusion breached threshold. Dispatching emergency alert."
            }
        return None

