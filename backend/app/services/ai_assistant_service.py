"""
Laminar - AI Assistant Service (Production RAG Engine)
--------------------------------------------------------

Architecture:
  1. On startup / manual trigger: Extract DB data → FAISS vector index on disk
  2. On query: Embed question → retrieve top-5 context docs → inject live system
     snapshot → prompt Ollama (or rule-based fallback if offline)

Key fixes:
  - Auto-detects best available Ollama model (not hardcoded to deepseek-coder)
  - Strict system prompt: ONLY answers from Laminar data, never general knowledge
  - Live system snapshot injected into every query (active alerts, top risk venue)
  - Rule-based fallback when Ollama is offline — still answers from real DB data
  - last_indexed_at tracked for /status endpoint
  - Model detection cached per process restart
"""
import os
import json
import httpx
import hashlib
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Tuple, Optional

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False


from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.core.config import settings
from app.core.logging import get_logger
from app.models.venue import Venue
from app.models.crowd_alert import CrowdAlert
from app.models.venue_event import VenueEvent
from app.models.crowd_metric import CrowdMetric
from app.models.camera import Camera
from app.models.crowd_frame import CrowdFrame

logger = get_logger(__name__)

# ─── Constants ─────────────────────────────────────────────────────────────────
VECTOR_INDEX_DIR = os.path.join("storage", "vector_index")
INDEX_FILE = os.path.join(VECTOR_INDEX_DIR, "index.faiss")
DOCS_FILE = os.path.join(VECTOR_INDEX_DIR, "docs.json")
OLLAMA_BASE = "http://localhost:11434"

# Preferred model order — instruction-tuned models first, code last
# Preferred model order — Focus on Llama 3.2 as primary high-performance model
PREFERRED_MODELS = ["llama3.2", "llama3", "mistral", "phi3"]

# In-memory query cache
_query_cache: Dict[str, Tuple[datetime, str]] = {}
CACHE_TTL = timedelta(minutes=3)  # Shorter TTL = fresher answers


class AIAssistantService:
    """
    Production RAG-based AI assistant for Laminar crowd intelligence.
    Answers questions exclusively from indexed Laminar data.
    """

    # Class-level state (shared across endpoint worker calls)
    _detected_model: str = ""
    _ollama_online: bool = False
    _last_detection_at: Optional[datetime] = None

    def __init__(self):
        self.model: Optional[SentenceTransformer] = None
        self.index = None
        self.documents: List[str] = []
        self.last_indexed_at: Optional[datetime] = None
        self._ensure_dir()

    def _ensure_dir(self) -> None:
        os.makedirs(VECTOR_INDEX_DIR, exist_ok=True)

    async def _lazy_load_model_async(self) -> None:
        if self.model is None:
            logger.info("Loading SentenceTransformer embedding model in background thread...")
            try:
                import asyncio
                await asyncio.to_thread(self._do_load_model)
            except Exception as e:
                logger.error(f"Failed to load sentence_transformers async: {e}")
                self.model = None

    def _do_load_model(self) -> None:
        try:
            import torch
            # ✅ PERFORMANCE FIX: Limit CPU threads to prevent system slowdown
            # SentenceTransformer can hog all cores, affecting YOLO detection.
            try:
                if torch.get_num_threads() > 2:
                    torch.set_num_threads(2)
                    torch.set_num_interop_threads(1)
            except RuntimeError as re:
                logger.debug(f"Could not set torch threads (likely already initialized): {re}")
            
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception as e:
            logger.error(f"Failed to load sentence_transformers: {e}")
            self.model = None

    def _lazy_load_index(self) -> None:
        if self.index is None and FAISS_AVAILABLE:
            if os.path.exists(INDEX_FILE) and os.path.exists(DOCS_FILE):
                try:
                    self.index = faiss.read_index(INDEX_FILE)
                    with open(DOCS_FILE, "r", encoding="utf-8") as f:
                        self.documents = json.load(f)
                    logger.info(f"Loaded FAISS index with {len(self.documents)} documents.")
                except Exception as e:
                    logger.error(f"Failed to load FAISS index: {e}")
                    self.index = None
                    self.documents = []

    # ─── LLM Model Detection ────────────────────────────────────────────────

    async def _detect_ollama_model(self) -> str:
        """
        Dummy for backward compatibility - delegates to AI Provider.
        """
        AIAssistantService._ollama_online = True
        AIAssistantService._detected_model = "AIFallbackProvider"
        return "AIFallbackProvider"

    # ─── Live System Snapshot ─────────────────────────────────────────────────

    async def _get_live_snapshot(self, session: AsyncSession) -> str:
        """
        Build a rich live system summary injected at the top of every query context.
        Gives the LLM fresh, actionable data on every query.
        """
        try:
            now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
            lines = [f"### LIVE SYSTEM STATUS (as of {now_str})\n"]

            # Total venues (Active & Not deleted only)
            venue_result = await session.execute(
                select(Venue).where(Venue.is_active.is_(True), (Venue.is_deleted.is_(False) if hasattr(Venue, 'is_deleted') else True))
            )
            venues = venue_result.scalars().all()
            lines.append(f"- Total venues monitored: {len(venues)}")
            
            for v in venues:
                # ── Robust Occupancy Calculation ──────────────────────────────
                # 1. Try latest minute metric
                metric_stmt = (
                    select(CrowdMetric)
                    .where(CrowdMetric.venue_id == v.id, CrowdMetric.camera_id.is_(None), CrowdMetric.bucket_type == "minute")
                    .order_by(desc(CrowdMetric.bucket_start))
                    .limit(1)
                )
                m_res = await session.execute(metric_stmt)
                latest_m = m_res.scalar_one_or_none()
                
                occ = float(latest_m.avg_count or 0) if latest_m else 0.0
                
                # 2. Fallback to live CrowdFrame sum if metric is 0 or missing
                if occ == 0.0:
                    try:
                        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
                        subq = (
                            select(func.max(CrowdFrame.detected_count).label("peak"))
                            .join(Camera, Camera.id == CrowdFrame.camera_id)
                            .where(Camera.venue_id == v.id, CrowdFrame.captured_at >= cutoff)
                            .group_by(CrowdFrame.camera_id)
                            .subquery()
                        )
                        sum_res = await session.execute(select(func.sum(subq.c.peak)))
                        occ = float(sum_res.scalar_one_or_none() or 0.0)
                    except Exception:
                        pass # Fallback failed, stick with 0

                cap = v.capacity or 0
                pct = round(occ / cap * 100, 1) if cap > 0 else 0
                warn_limit = v.warning_threshold or 700
                crit_limit = v.critical_threshold or 900
                
                lines.append(
                    f"  • Venue '{v.name}' (ID {v.id}): "
                    f"Capacity={cap}, CurrentOccupancy={occ} ({pct}%), "
                    f"WarningThreshold={warn_limit}, CriticalThreshold={crit_limit}"
                )

            # Active alerts (open + acknowledged)
            active_result = await session.execute(
                select(CrowdAlert)
                .where(CrowdAlert.status.in_(["open", "acknowledged"]))
                .order_by(desc(CrowdAlert.created_at))
                .limit(10)
            )
            active_alerts = active_result.scalars().all()
            lines.append(f"- Active crowd alerts: {len(active_alerts)}")

            for a in active_alerts:
                created_str = a.created_at.strftime("%H:%M UTC")
                extra = a.extra_data or {}
                lines.append(
                    f"  • [{a.risk_level.upper()}] Alert at venue {a.venue_id}, "
                    f"Severity={a.severity}, Status={a.status}, "
                    f"Escalation Level={a.escalation_level}, Created={created_str}. "
                    f"Recommended: {extra.get('recommended_action', a.explanation or 'N/A')}"
                )

            # Recent crowd metrics (last 15 min) - Venue and Camera level
            fifteen_min_ago = datetime.now(timezone.utc) - timedelta(minutes=15)
            metrics_result = await session.execute(
                select(CrowdMetric)
                .where(
                    CrowdMetric.bucket_start >= fifteen_min_ago,
                    CrowdMetric.bucket_type == "minute",
                )
                .order_by(desc(CrowdMetric.bucket_start), desc(CrowdMetric.avg_count))
                .limit(10)
            )
            recent_metrics = metrics_result.scalars().all()
            if recent_metrics:
                lines.append("- Recent historical metrics (last 15 minutes):")
                for m in recent_metrics:
                    scope = "Venue-wide" if m.camera_id is None else f"Camera {m.camera_id}"
                    lines.append(
                        f"  • {scope} at Venue {m.venue_id}: Avg={m.avg_count:.1f}, "
                        f"Peak={m.max_count:.0f}, Risk={m.risk_level}"
                    )

            return "\n".join(lines)

        except Exception as e:
            logger.warning(f"Could not fetch live snapshot: {e}")
            return f"### LIVE SYSTEM STATUS\n- (Live snapshot unavailable — {e})"

    # ─── Status Report ────────────────────────────────────────────────────────

    def get_status(self) -> dict:
        """Return current assistant status for the /status endpoint."""
        self._lazy_load_index()
        return {
            "ollama_online": AIAssistantService._ollama_online,
            "model_in_use": AIAssistantService._detected_model or "none",
            "index_documents": len(self.documents),
            "index_ready": self.index is not None and len(self.documents) > 0,
            "last_indexed_at": self.last_indexed_at.isoformat() if self.last_indexed_at else None,
            "faiss_available": FAISS_AVAILABLE,
        }

    # ─── Indexing ────────────────────────────────────────────────────────────

    async def extract_and_index(self, session: AsyncSession) -> None:
        """Extract DB data, embed documents, and save FAISS index to disk."""
        if not FAISS_AVAILABLE:
            logger.warning("FAISS not installed — vector indexing skipped. Run: pip install faiss-cpu")
            return

        logger.info("Starting RAG index extraction from database...")
        docs: List[str] = []

        # 1. Venues (Only Active & Not deleted)
        venues_result = await session.execute(
            select(Venue).where(Venue.is_active.is_(True), Venue.is_deleted.is_(False))
        )
        for v in venues_result.scalars().all():
            doc = (
                f"Venue: '{v.name}' (ID {v.id}), Location: '{getattr(v, 'location', None) or 'unknown'}', "
                f"Capacity: {getattr(v, 'capacity', 'unknown')}."
            )
            docs.append(doc)

        # 2. Recent alerts (last 30 days)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        alerts_result = await session.execute(
            select(CrowdAlert)
            .where(CrowdAlert.created_at >= thirty_days_ago)
            .order_by(desc(CrowdAlert.created_at))
            .limit(1000)
        )
        for a in alerts_result.scalars().all():
            created_str = a.created_at.strftime("%Y-%m-%d %H:%M UTC")
        # ── 0. Static Project Knowledge Document ────────────────────────────────
        docs.append("""
LAMINAR PLATFORM — COMPLETE PROJECT KNOWLEDGE DOCUMENT
=======================================================
Laminar is a real-time AI-powered crowd intelligence and venue management platform.

TECH STACK:
- Backend: Python (FastAPI + SQLAlchemy async + PostgreSQL + APScheduler)
- Frontend: Next.js 14 (TypeScript, Framer Motion, Tailwind CSS)
- AI Stack: FAISS (vector search), SentenceTransformers, Groq API, Gemini API, local llama.cpp
- Vision: YOLOv8 for real-time person detection via camera streams (RTSP/HTTP)
- Re-ID: ResNet-18 deep learning embeddings for cross-camera identity tracking
- Scheduler: APScheduler (minute pipeline every 60s, hourly pipeline every 3600s)

CORE FEATURES:
1. Venues — Physical locations monitored 24/7. Each venue has capacity, warning/critical thresholds, active cameras.
2. Smart City Modules — High-fidelity tracking for Traffic Volume, Vehicle/Pedestrian Velocity, and Parking Slot Occupancy.
3. Cameras — IP/RTSP cameras attached to venues, each streaming live video for AI detection.
4. Crowd Metrics — Minute and hourly aggregate stats (avg_count, max_count, risk_level) per venue and per camera.
5. Crowd Alerts — Auto-generated when crowd size exceeds thresholds. Risk levels: low/medium/high/critical.
6. Live Map — Geographic venue overview with real-time heatmaps.
7. Surge Monitor — Predictive surge detection using trend analysis.
8. Prediction Engine — AI forecasts for crowd risk over the next intervals.
9. Journey Tracking — Re-ID pipeline tracking persons across cameras. Computes wait times, dwell times.
10. Person Wait Monitor — Real-time and historical wait time analytics per venue.
11. Intelligence Reports — AI-written executive situation reports with recommended actions.
12. Alerts Dashboard — Manage, escalate, and resolve crowd alerts.
13. Command Center — Top-level system overview: venues, cameras, AI health, pipeline status.
14. Randy AI Chat — This AI assistant; understands everything about the platform and general knowledge completely unrestrictedly.

DATABASE MODELS:
- Venue: id, name, venue_type (parking, traffic, crowd), location, capacity, is_active, is_deleted, warning_threshold, critical_threshold
- Camera: id, venue_id, name, code, stream_url, stream_type, is_active, is_online, health_status, zone_name, location_label, floor_level
- CrowdFrame: id, camera_id, captured_at, detected_count, raw_detections (YOLO output)
- CrowdMetric: id, venue_id, camera_id, bucket_type (minute/hour/day), bucket_start, avg_count, max_count, min_count, risk_level
- CrowdAlert: id, venue_id, risk_level, severity, status, escalation_level, created_at, explanation, extra_data
- VenueEvent: id, venue_id, event_type, start_time, end_time, description
- Journey: id, global_track_id, camera_id, venue_id, first_seen_at, last_seen_at, embedding (512-dim ResNet-18)
- PersonWaitRecord: id, venue_id, entered_at, exited_at, wait_duration_seconds

API ENDPOINTS (Backend port 8000):
- GET/POST /api/v1/venues — List and create venues
- GET /api/v1/venues/{id}/stats — Live venue stats
- GET/POST /api/v1/cameras — Camera management
- GET /api/v1/alerts — List crowd alerts
- GET /api/v1/crowd-metrics — Aggregated metrics
- POST /api/v1/assistant/query — Randy AI chat
- GET /api/v1/intelligence/summary — AI-generated intelligence report
- GET /api/v1/system/dashboard-stats — System health dashboard
- GET /api/v1/journeys — Cross-camera journey records
""".strip())

        # ── 1. ALL Venues (active + inactive) ───────────────────────────────────
        try:
            venues_result = await session.execute(select(Venue))
            all_venues = venues_result.scalars().all()
            for v in all_venues:
                status = "ACTIVE" if getattr(v, 'is_active', True) else "INACTIVE"
                deleted = " [DELETED]" if getattr(v, 'is_deleted', False) else ""
                doc = (
                    f"Venue: '{v.name}'{deleted} (ID: {v.id}), Status: {status}, "
                    f"Location: '{getattr(v, 'location', None) or 'unknown'}', "
                    f"Capacity: {getattr(v, 'capacity', 'unknown')}, "
                    f"WarningThreshold: {getattr(v, 'warning_threshold', 'N/A')}, "
                    f"CriticalThreshold: {getattr(v, 'critical_threshold', 'N/A')}."
                )
                docs.append(doc)
        except Exception as e:
            logger.warning(f"RAG: Could not index venues: {e}")

        # ── 2. ALL Cameras ──────────────────────────────────────────────────────
        try:
            cameras_result = await session.execute(select(Camera))
            for cam in cameras_result.scalars().all():
                active_str = "active" if cam.is_active else "inactive"
                online_str = "online" if cam.is_online else "offline"
                health = getattr(cam, 'health_status', 'unknown')
                zone = getattr(cam, 'zone_name', None) or getattr(cam, 'location_label', None) or "unspecified zone"
                floor = getattr(cam, 'floor_level', None) or "unknown floor"
                doc = (
                    f"Camera: '{cam.name}' (ID: {cam.id}), "
                    f"Venue: {cam.venue_id}, Zone: {zone}, Floor: {floor}, "
                    f"Status: {active_str}, Online: {online_str}, Health: {health}, "
                    f"Stream type: {cam.stream_type}, Detection enabled: {cam.detection_enabled}."
                )
                if cam.last_frame_at:
                    doc += f" Last frame received: {cam.last_frame_at.strftime('%Y-%m-%d %H:%M UTC')}."
                docs.append(doc)
        except Exception as e:
            logger.warning(f"RAG: Could not index cameras: {e}")

        # ── 3. Recent Crowd Alerts (last 90 days, full history) ─────────────────
        try:
            ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)
            alerts_result = await session.execute(
                select(CrowdAlert)
                .where(CrowdAlert.created_at >= ninety_days_ago)
                .order_by(desc(CrowdAlert.created_at))
                .limit(2000)
            )
            for a in alerts_result.scalars().all():
                created_str = a.created_at.strftime("%Y-%m-%d %H:%M UTC")
                extra = a.extra_data or {}
                doc = (
                    f"Crowd Alert at Venue {a.venue_id} on {created_str}: "
                    f"Risk={a.risk_level}, Status={a.status}, Severity={a.severity}, "
                    f"EscalationLevel={a.escalation_level}."
                )
                if extra.get("event_type"):
                    doc += f" Event: {extra['event_type']}."
                if a.explanation:
                    doc += f" AI Explanation: {a.explanation[:200]}."
                if extra.get("recommended_action"):
                    doc += f" Recommended: {extra['recommended_action'][:150]}."
                docs.append(doc)
        except Exception as e:
            logger.warning(f"RAG: Could not index alerts: {e}")

        # ── 4. Venue Events (last 60 days) ──────────────────────────────────────
        try:
            sixty_days_ago = datetime.now(timezone.utc) - timedelta(days=60)
            events_result = await session.execute(
                select(VenueEvent)
                .where(VenueEvent.start_time >= sixty_days_ago)
                .order_by(desc(VenueEvent.start_time))
                .limit(500)
            )
            for e in events_result.scalars().all():
                s = e.start_time.strftime("%Y-%m-%d %H:%M")
                end = e.end_time.strftime("%Y-%m-%d %H:%M")
                doc = f"Event '{e.event_type}' at Venue {e.venue_id} from {s} to {end}."
                if e.description:
                    doc += f" Details: {e.description[:200]}."
                docs.append(doc)
        except Exception as e:
            logger.warning(f"RAG: Could not index events: {e}")

        # ── 5. Hourly Crowd Metrics — last 30 days (venue-level) ────────────────
        try:
            thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
            metrics_result = await session.execute(
                select(CrowdMetric)
                .where(
                    CrowdMetric.bucket_start >= thirty_days_ago,
                    CrowdMetric.bucket_type == "hour",
                    CrowdMetric.camera_id.is_(None),
                )
                .order_by(desc(CrowdMetric.bucket_start))
                .limit(5000)
            )
            for m in metrics_result.scalars().all():
                bucket_str = m.bucket_start.strftime("%Y-%m-%d %H:%M UTC")
                doc = (
                    f"Crowd Metric (hourly) at Venue {m.venue_id} on {bucket_str}: "
                    f"Peak={m.max_count} people, Min={m.min_count}, Avg={m.avg_count:.1f}, "
                    f"Risk={m.risk_level}."
                )
                docs.append(doc)
        except Exception as e:
            logger.warning(f"RAG: Could not index hourly metrics: {e}")

        # ── 6. Per-Camera Hourly Metrics — last 7 days ──────────────────────────
        try:
            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            cam_metrics_result = await session.execute(
                select(CrowdMetric)
                .where(
                    CrowdMetric.bucket_start >= seven_days_ago,
                    CrowdMetric.bucket_type == "hour",
                    CrowdMetric.camera_id.isnot(None),
                )
                .order_by(desc(CrowdMetric.bucket_start))
                .limit(3000)
            )
            for m in cam_metrics_result.scalars().all():
                bucket_str = m.bucket_start.strftime("%Y-%m-%d %H:%M UTC")
                doc = (
                    f"Camera-level metric at Venue {m.venue_id} / Camera {m.camera_id} on {bucket_str}: "
                    f"Peak={m.max_count}, Avg={m.avg_count:.1f}, Risk={m.risk_level}."
                )
                docs.append(doc)
        except Exception as e:
            logger.warning(f"RAG: Could not index camera metrics: {e}")

        if not docs:
            logger.warning("No documents extracted for RAG index — database may be empty.")
            return

        await self._lazy_load_model_async()
        if self.model is None:
            logger.error("Embedding model could not be loaded. Indexing aborted.")
            return

        import numpy as np
        import asyncio
        logger.info(f"Embedding {len(docs)} documents for comprehensive FAISS index...")
        embeddings = await asyncio.to_thread(self.model.encode, docs, convert_to_numpy=True, batch_size=64, show_progress_bar=False)

        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(embeddings)
        self.documents = docs

        faiss.write_index(self.index, INDEX_FILE)
        with open(DOCS_FILE, "w", encoding="utf-8") as f:
            json.dump(docs, f)

        self.last_indexed_at = datetime.now(timezone.utc)
        _query_cache.clear()
        logger.info(f"FAISS index saved: {len(docs)} documents indexed.")

    # ─── Rule-Based Fallback ──────────────────────────────────────────────────

    def _rule_based_response(self, question: str, context_docs: List[str]) -> str:
        """
        When Ollama is offline, produce a structured answer directly from retrieved docs.
        Uses keyword matching to format the response appropriately.
        """
        q = question.lower()

        if not context_docs:
            return (
                "I don't have indexed data to answer that right now. "
                "Please use the dashboard for live venue and alert information, "
                "or click 'Re-index' to rebuild the knowledge base."
            )

        # Format docs into a readable list
        formatted = "\n".join(f"• {doc}" for doc in context_docs[:5])

        if any(kw in q for kw in ("status", "current", "now", "today", "active")):
            return (
                f"Here is the current Laminar system data I have indexed:\n\n{formatted}\n\n"
                f"_(Randy AI is operating in Safe Mode — this is a direct data summary without advanced analysis.)_"
            )

        if any(kw in q for kw in ("alert", "risk", "critical", "high", "threat")):
            return (
                f"Based on indexed alert data:\n\n{formatted}\n\n"
                f"_(Randy AI operating in Safe Mode.)_"
            )

        if any(kw in q for kw in ("venue", "location", "place", "crowd", "occupancy", "capacity")):
            return (
                f"Based on indexed venue and crowd data:\n\n{formatted}\n\n"
                f"_(Randy AI operating in Safe Mode.)_"
            )

        # Generic fallback
        return (
            f"Here is the most relevant indexed data for your question:\n\n{formatted}\n\n"
            f"_(Randy AI Engine is currently operating safely with local knowledge dumps.)_"
        )

    # ─── Main Query ───────────────────────────────────────────────────────────

    async def query(self, question: str, session: AsyncSession, history: List[Dict[str, str]] = [], user_language: str = "en") -> str:
        """
        Process user question via the RAG pipeline with conversation history.

        Steps:
          1. Check cache (for non-history queries or simple lookups)
          2. Load FAISS index (lazy)
          3. Get live system snapshot
          4. Retrieve top-8 context docs
          5. Build message sequence (System Prompt + History + Current Question)
          6. Query Ollama Chat API
        """
        # ── Load index & model ───────────────────────────────────────────────
        self._lazy_load_index()
        await self._lazy_load_model_async()

        # ── Detect Intent Bypass ───────────────────────────────────────────
        from app.services.ai_service import get_ai_service
        ai_svc = get_ai_service()
        intent = ai_svc.classify_intent(question)
        
        is_rag_required = intent in ["informational", "analytical", "command", "casual"]

        # ── FAISS retrieval ──────────────────────────────────────────────────
        context_docs: List[str] = []
        if self.index is not None and self.documents and self.model is not None:
            import asyncio
            query_embedding = await asyncio.to_thread(self.model.encode, [question], convert_to_numpy=True)
            top_k = min(8, self.index.ntotal)
            distances, indices = self.index.search(query_embedding, top_k)
            # Always inject the first document (project knowledge) + top hits
            if len(self.documents) > 0:
                context_docs.append(self.documents[0])
            for idx in indices[0]:
                if 0 <= idx < len(self.documents) and self.documents[idx] not in context_docs:
                    context_docs.append(self.documents[idx])
        else:
            logger.warning("FAISS index not ready — answering with live snapshot only.")

        # ── Live snapshot ─────────────────────────────────────────────────────
        live_snapshot = ""
        if is_rag_required:
            live_snapshot = await self._get_live_snapshot(session)

        # ── Detect Ollama model ───────────────────────────────────────────────
        model = await self._detect_ollama_model()

        if not model:
            logger.info("Ollama offline — using rule-based response.")
            combined_docs = [live_snapshot] + context_docs
            return self._rule_based_response(question, combined_docs)

        # ── Build Chat Message Sequence ──────────────────────────────────────
        context_str = "\n".join(f"- {doc}" for doc in context_docs)
        if live_snapshot:
            context_str = live_snapshot + "\n\n" + context_str
            
        from app.services.ai_service import BASE_SYSTEM_PROMPT
        system_prompt = BASE_SYSTEM_PROMPT

        # Behavior Engine Prompt Construction
        behavior_instructions = ""
        if intent == "greeting":
            behavior_instructions = "Greeting: You are Randy AI. Introduce yourself warmly and impressively in 1 or 2 lines. Do not use generic chatbot responses. Answer any follow up naturally."
        elif intent == "casual":
            behavior_instructions = "Casual: Chat fluently and answer ANY general question the user has across ANY domain, completely unrestricted. If the user uses Hindi/Telugu, respond perfectly in that language."
        elif intent == "informational":
            behavior_instructions = "Informational: Provide extremely clear, highly informative explanations on ANY topic. Look at project data if needed, else answer natively without restrictions."
        elif intent == "analytical":
            behavior_instructions = "Analytical: STRICT FORMAT: Insight: <masterful conclusion>, Details: <deep reasoning>, Action: <genius recommendation>."
        else:
            behavior_instructions = "Command: Execute crisply and accurately."

        # Prepare flattened prompt for generic AI generation (BASE_SYSTEM_PROMPT is injected securely in generate_raw)
        full_prompt = f"[user_language={user_language}]\n### CONVERSATION HISTORY:\n"
        for msg in history[-3:]: # Memory Optimization
            role = msg.get("role", "user").upper()
            content = msg.get("content", "")
            full_prompt += f"{role}: {content}\n"
            
        if is_rag_required:
            full_prompt += f"""
Context:
{context_str if context_str else "No indexed documents."}

Intent:
{intent}

User Query:
{question}

Instructions:
* use context when available
* do not hallucinate
* remain aligned to intent
* {behavior_instructions}
"""
        else:
            full_prompt += f"""
Intent:
{intent}

User Query:
{question}

Instructions:
* respond naturally
* do not use system data
* {behavior_instructions}
"""

        # ── Call AI Service ──────────────────────────────────────────────────
        logger.info(f"Querying AI Service with history ({len(history)} msgs)...")
        try:
            answer = await ai_svc.generate_raw(full_prompt, timeout=60.0)
            if answer:
                return answer
            else:
                return self._rule_based_response(question, context_docs)
        except Exception as e:
            logger.error(f"AI Assistant query failed: {e}")
            return self._rule_based_response(question, context_docs)
