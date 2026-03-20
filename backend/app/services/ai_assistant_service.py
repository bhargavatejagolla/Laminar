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

    def _lazy_load_model(self) -> None:
        if self.model is None:
            logger.info("Loading SentenceTransformer embedding model...")
            try:
                import torch
                # ✅ PERFORMANCE FIX: Limit CPU threads to prevent system slowdown
                # SentenceTransformer can hog all cores, affecting YOLO detection.
                if torch.get_num_threads() > 2:
                    torch.set_num_threads(2)
                    torch.set_num_interop_threads(1)
                
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
            doc = (
                f"Crowd Alert at Venue {a.venue_id} on {created_str}: "
                f"Risk={a.risk_level}, Status={a.status}, Severity={a.severity}, "
                f"Escalation Level={a.escalation_level}."
            )
            if a.extra_data and a.extra_data.get("event_type"):
                doc += f" Event: {a.extra_data['event_type']}."
            docs.append(doc)

        # 3. Recent events
        events_result = await session.execute(
            select(VenueEvent)
            .where(VenueEvent.start_time >= thirty_days_ago)
            .order_by(desc(VenueEvent.start_time))
            .limit(500)
        )
        for e in events_result.scalars().all():
            s = e.start_time.strftime("%Y-%m-%d %H:%M")
            end = e.end_time.strftime("%Y-%m-%d %H:%M")
            doc = f"Event '{e.event_type}' at Venue {e.venue_id} from {s} to {end}. {e.description or ''}."
            docs.append(doc)

        # 4. Crowd metrics (last 7 days, hourly)
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        metrics_result = await session.execute(
            select(CrowdMetric)
            .where(CrowdMetric.bucket_start >= seven_days_ago)
            .where(CrowdMetric.bucket_type == "hour")
            .where(CrowdMetric.camera_id.is_(None))
            .order_by(desc(CrowdMetric.bucket_start))
            .limit(2000)
        )
        for m in metrics_result.scalars().all():
            bucket_str = m.bucket_start.strftime("%Y-%m-%d %H:%M UTC")
            doc = (
                f"Crowd Metric at Venue {m.venue_id} on {bucket_str}: "
                f"Peak={m.max_count} people, Min={m.min_count}, Avg={m.avg_count:.1f}, "
                f"Risk={m.risk_level}."
            )
            docs.append(doc)

        if not docs:
            logger.warning("No documents extracted for RAG index — database may be empty.")
            return

        self._lazy_load_model()
        if self.model is None:
            logger.error("Embedding model could not be loaded. Indexing aborted.")
            return

        import numpy as np
        logger.info(f"Embedding {len(docs)} documents for FAISS index...")
        embeddings = self.model.encode(docs, convert_to_numpy=True)

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
                f"_(AI model is offline — this is a direct data summary. Start Ollama for full AI analysis.)_"
            )

        if any(kw in q for kw in ("alert", "risk", "critical", "high", "threat")):
            return (
                f"Based on indexed alert data:\n\n{formatted}\n\n"
                f"_(AI model offline — this is raw alert data. Start Ollama for AI analysis.)_"
            )

        if any(kw in q for kw in ("venue", "location", "place", "crowd", "occupancy", "capacity")):
            return (
                f"Based on indexed venue and crowd data:\n\n{formatted}\n\n"
                f"_(AI model offline — data shown directly from index.)_"
            )

        # Generic fallback
        return (
            f"Here is the most relevant indexed data for your question:\n\n{formatted}\n\n"
            f"_(AI model offline — responses are data summaries only. Run `ollama pull llama3` to enable full AI.)_"
        )

    # ─── Main Query ───────────────────────────────────────────────────────────

    async def query(self, question: str, session: AsyncSession, history: List[Dict[str, str]] = []) -> str:
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
        self._lazy_load_model()

        # ── FAISS retrieval ──────────────────────────────────────────────────
        context_docs: List[str] = []
        if self.index is not None and self.documents and self.model is not None:
            query_embedding = self.model.encode([question], convert_to_numpy=True)
            # Increased k to 8 for "complete data" as requested
            distances, indices = self.index.search(query_embedding, 8)
            for idx in indices[0]:
                if 0 <= idx < len(self.documents):
                    context_docs.append(self.documents[idx])
        else:
            logger.warning("FAISS index not ready — answering with live snapshot only.")

        # ── Live snapshot ─────────────────────────────────────────────────────
        live_snapshot = await self._get_live_snapshot(session)

        # ── Detect Ollama model ───────────────────────────────────────────────
        model = await self._detect_ollama_model()

        if not model:
            logger.info("Ollama offline — using rule-based response.")
            combined_docs = [live_snapshot] + context_docs
            return self._rule_based_response(question, combined_docs)

        # ── Build Chat Message Sequence ──────────────────────────────────────
        context_str = "\n".join(f"- {doc}" for doc in context_docs)
        
        system_prompt = f"""You are the Laminar AI Crowd Intelligence Assistant. Your role is to help security managers and operations staff understand crowd conditions, alerts, and system status in real-time.

STRICT RULES:
1. You ONLY answer questions using the CONTEXT and LIVE STATUS sections below.
2. NEVER use general knowledge or make up data.
3. If the answer cannot be found in the context or history, say exactly: "I don't have that data in my current index. Please check the dashboard directly or click Re-index to refresh my knowledge."
4. Keep answers concise, factual, and professional.
5. Always refer to specific venues, alert counts, or risk levels from the data.

{live_snapshot}

### INDEXED KNOWLEDGE BASE (recent data):
{context_str if context_str else "(No indexed documents available)"}
"""

        # Prepare flattened prompt for generic AI generation
        full_prompt = system_prompt + "\n\n### CONVERSATION HISTORY:\n"
        for msg in history[-10:]:
            role = msg.get("role", "user").upper()
            content = msg.get("content", "")
            full_prompt += f"{role}: {content}\n"
            
        full_prompt += f"USER: {question}\nASSISTANT: "

        # ── Call AI Fallback Provider ──────────────────────────────────────────────────
        from app.services.ai_provider_service import ai_provider
        logger.info(f"Querying AI Fallback Provider with history ({len(history)} msgs)...")
        try:
            answer = await ai_provider.generate_response(full_prompt, timeout=60.0)
            if answer:
                return answer
            else:
                return self._rule_based_response(question, context_docs)
        except Exception as e:
            logger.error(f"AI Assistant query failed: {e}")
            return self._rule_based_response(question, context_docs)
