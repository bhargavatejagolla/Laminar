"""
Laminar - AI Conversation Memory Service
-----------------------------------------
Stores per-user conversation history in SQLite so the AI assistant
can reference past interactions across sessions.

Architecture:
  - Creates ai_conversations table on first use (no migration needed)
  - Stores last 200 turns per user
  - ai_assistant_service.py loads history before each query

This transforms the AI from a stateless chatbot to an intelligent partner
that remembers context across days/sessions.
"""

import json
import sqlite3
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pathlib import Path

from app.core.logging import get_logger

logger = get_logger(__name__)

MEMORY_DB_PATH = Path("storage") / "ai_memory.db"
MAX_TURNS_PER_USER = 200
CONTEXT_TURNS = 20  # How many recent turns to inject into the prompt


class ConversationMemoryService:
    """
    SQLite-backed conversation memory for the AI assistant.
    Thread-safe via a lock. Async-compatible via run_in_executor.
    """

    _lock = threading.Lock()
    _initialized = False

    def __init__(self):
        MEMORY_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(MEMORY_DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        """Create the ai_conversations table if it doesn't exist."""
        try:
            conn = self._get_conn()
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ai_conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    session_id TEXT,
                    venue_context TEXT
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS ix_ai_conv_user_id
                ON ai_conversations(user_id, created_at DESC)
            """)
            conn.commit()
            conn.close()
            logger.info("ConversationMemory: Schema initialized")
        except Exception as e:
            logger.error(f"ConversationMemory: Schema init failed: {e}")

    def save_turn(
        self,
        user_id: str,
        role: str,
        content: str,
        session_id: Optional[str] = None,
        venue_context: Optional[str] = None,
    ) -> None:
        """
        Save a single conversation turn.

        Args:
            user_id: User UUID string
            role: "user" or "assistant"
            content: Message content
            session_id: Optional session grouping
            venue_context: Optional venue_id for context
        """
        with self._lock:
            try:
                conn = self._get_conn()
                conn.execute(
                    """
                    INSERT INTO ai_conversations
                    (user_id, role, content, created_at, session_id, venue_context)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        role,
                        content[:4000],  # Cap content length
                        datetime.now(timezone.utc).isoformat(),
                        session_id,
                        venue_context,
                    ),
                )
                conn.commit()

                # Prune old turns (keep latest MAX_TURNS_PER_USER)
                conn.execute(
                    """
                    DELETE FROM ai_conversations
                    WHERE user_id = ?
                    AND id NOT IN (
                        SELECT id FROM ai_conversations
                        WHERE user_id = ?
                        ORDER BY created_at DESC
                        LIMIT ?
                    )
                    """,
                    (user_id, user_id, MAX_TURNS_PER_USER),
                )
                conn.commit()
                conn.close()

            except Exception as e:
                logger.error(f"ConversationMemory.save_turn failed: {e}")

    def get_history(
        self,
        user_id: str,
        limit: int = CONTEXT_TURNS,
        session_id: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """
        Retrieve recent conversation history for a user.

        Returns list of {role, content} dicts ordered oldest-first
        (ready to inject into AI prompt).
        """
        with self._lock:
            try:
                conn = self._get_conn()
                if session_id:
                    cursor = conn.execute(
                        """
                        SELECT role, content FROM ai_conversations
                        WHERE user_id = ? AND session_id = ?
                        ORDER BY created_at DESC LIMIT ?
                        """,
                        (user_id, session_id, limit),
                    )
                else:
                    cursor = conn.execute(
                        """
                        SELECT role, content FROM ai_conversations
                        WHERE user_id = ?
                        ORDER BY created_at DESC LIMIT ?
                        """,
                        (user_id, limit),
                    )
                rows = cursor.fetchall()
                conn.close()
                # Return oldest-first for prompt construction
                return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
            except Exception as e:
                logger.error(f"ConversationMemory.get_history failed: {e}")
                return []

    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Return conversation statistics for a user."""
        with self._lock:
            try:
                conn = self._get_conn()
                cursor = conn.execute(
                    """
                    SELECT
                        COUNT(*) as total_turns,
                        MIN(created_at) as first_conversation,
                        MAX(created_at) as last_conversation,
                        COUNT(DISTINCT session_id) as sessions
                    FROM ai_conversations WHERE user_id = ?
                    """,
                    (user_id,),
                )
                row = cursor.fetchone()
                conn.close()
                if row:
                    return {
                        "user_id": user_id,
                        "total_turns": row["total_turns"],
                        "first_conversation": row["first_conversation"],
                        "last_conversation": row["last_conversation"],
                        "sessions": row["sessions"],
                        "memory_active": row["total_turns"] > 0,
                    }
                return {"user_id": user_id, "total_turns": 0, "memory_active": False}
            except Exception as e:
                logger.error(f"ConversationMemory.get_user_stats failed: {e}")
                return {"user_id": user_id, "error": str(e)}

    def clear_user_history(self, user_id: str) -> int:
        """Delete all conversation history for a user. Returns deleted count."""
        with self._lock:
            try:
                conn = self._get_conn()
                cursor = conn.execute(
                    "DELETE FROM ai_conversations WHERE user_id = ?",
                    (user_id,),
                )
                deleted = cursor.rowcount
                conn.commit()
                conn.close()
                logger.info(f"ConversationMemory: Cleared {deleted} turns for user {user_id}")
                return deleted
            except Exception as e:
                logger.error(f"ConversationMemory.clear_user_history failed: {e}")
                return 0


# ─── Singleton ─────────────────────────────────────────────────────────────────
conversation_memory = ConversationMemoryService()
