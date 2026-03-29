"""
Laminar - AutoML Retraining Trigger Service
--------------------------------------------
Monitors YOLO detection confidence over time and automatically flags
low-confidence frames as retraining candidates.

Workflow:
  1. stream_worker.py calls log_if_low(camera_id, frame_path, confidence) after each detection
  2. Frames with confidence < threshold saved to storage/retrain_candidates/
  3. Scheduler runs daily: generate_retrain_report() → retrain_report_{date}.json

This implements a self-improving model feedback loop — a core AI startup differentiator.
Zero impact on existing detection pipeline (additive only).
"""

import os
import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path

from app.core.logging import get_logger

logger = get_logger(__name__)

RETRAIN_DIR = Path("storage") / "retrain_candidates"
CONFIDENCE_THRESHOLD = 0.45  # Below this = potential labeling candidate
MAX_CANDIDATES_PER_DAY = 500  # Cap to avoid filling disk


class RetrainingService:
    """
    Monitors detection quality and builds a self-improving retraining pipeline.
    """

    def __init__(self):
        RETRAIN_DIR.mkdir(parents=True, exist_ok=True)
        self._daily_count = 0
        self._last_reset = datetime.now(timezone.utc).date()

    def _reset_daily_counter_if_needed(self) -> None:
        today = datetime.now(timezone.utc).date()
        if today != self._last_reset:
            self._daily_count = 0
            self._last_reset = today

    def log_if_low(
        self,
        camera_id: str,
        frame_path: Optional[str],
        confidence: float,
        count: int = 0,
        venue_id: Optional[str] = None,
    ) -> bool:
        """
        Log a frame as a retraining candidate if confidence is low.

        Args:
            camera_id: Camera UUID string
            frame_path: Path to the frame file (optional)
            confidence: Detection confidence score (0-1)
            count: Number of detections in this frame
            venue_id: Optional venue context

        Returns:
            True if logged as candidate, False otherwise
        """
        self._reset_daily_counter_if_needed()

        if confidence >= CONFIDENCE_THRESHOLD:
            return False

        if self._daily_count >= MAX_CANDIDATES_PER_DAY:
            return False

        try:
            candidate = {
                "camera_id": camera_id,
                "venue_id": venue_id,
                "frame_path": frame_path,
                "confidence": round(confidence, 4),
                "detection_count": count,
                "logged_at": datetime.now(timezone.utc).isoformat(),
            }

            # Append to daily candidates file
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            candidate_file = RETRAIN_DIR / f"candidates_{today}.jsonl"

            with open(candidate_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(candidate) + "\n")

            self._daily_count += 1
            return True

        except Exception as e:
            logger.error(f"RetrainingService: Failed to log candidate: {e}")
            return False

    def generate_retrain_report(self) -> Dict[str, Any]:
        """
        Generate a daily retraining quality report summarizing candidate frames.
        Called by the scheduler daily.
        """
        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

            candidates = []
            for date in [today, yesterday]:
                candidate_file = RETRAIN_DIR / f"candidates_{date}.jsonl"
                if candidate_file.exists():
                    with open(candidate_file, "r", encoding="utf-8") as f:
                        for line in f:
                            try:
                                candidates.append(json.loads(line.strip()))
                            except Exception:
                                pass

            if not candidates:
                report = {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "period": f"{yesterday} to {today}",
                    "total_candidates": 0,
                    "recommendation": "No low-confidence detections — model performing well",
                    "ready_for_retraining": False,
                }
            else:
                avg_confidence = sum(c["confidence"] for c in candidates) / len(candidates)
                cameras_affected = list(set(c["camera_id"] for c in candidates))

                report = {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "period": f"{yesterday} to {today}",
                    "total_candidates": len(candidates),
                    "average_confidence": round(avg_confidence, 4),
                    "cameras_affected": cameras_affected,
                    "ready_for_retraining": len(candidates) >= 50,
                    "recommendation": (
                        f"⚠️ {len(candidates)} low-confidence frames detected across "
                        f"{len(cameras_affected)} cameras. Retraining recommended."
                        if len(candidates) >= 50
                        else f"ℹ️ {len(candidates)} low-confidence frames — continue monitoring."
                    ),
                    "candidate_file_paths": [
                        str(RETRAIN_DIR / f"candidates_{today}.jsonl"),
                        str(RETRAIN_DIR / f"candidates_{yesterday}.jsonl"),
                    ],
                }

            # Save report
            report_file = RETRAIN_DIR / f"retrain_report_{today}.json"
            with open(report_file, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)

            logger.info(
                f"RetrainingService: Report generated — "
                f"{report.get('total_candidates', 0)} candidates, "
                f"ready={report.get('ready_for_retraining', False)}"
            )
            return report

        except Exception as e:
            logger.error(f"RetrainingService: Report generation failed: {e}")
            return {"error": str(e), "generated_at": datetime.now(timezone.utc).isoformat()}

    def get_status(self) -> Dict[str, Any]:
        """Return current retraining service status."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        candidate_file = RETRAIN_DIR / f"candidates_{today}.jsonl"
        count = 0
        if candidate_file.exists():
            try:
                with open(candidate_file, "r") as f:
                    count = sum(1 for _ in f)
            except Exception:
                pass

        return {
            "threshold": CONFIDENCE_THRESHOLD,
            "candidates_today": count,
            "max_per_day": MAX_CANDIDATES_PER_DAY,
            "candidate_dir": str(RETRAIN_DIR),
            "ready_for_retraining": count >= 50,
        }


# ─── Singleton ─────────────────────────────────────────────────────────────────
retraining_service = RetrainingService()
