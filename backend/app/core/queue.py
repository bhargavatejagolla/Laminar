"""
Laminar – Queue / Task backend
-------------------------------
Tries to connect to Redis for production use.
Falls back gracefully to a no-op stub so the server starts without Redis on dev machines.
"""
import os
import logging

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class _NullQueue:
    """No-op queue stub used when Redis is unavailable."""
    def enqueue(self, *args, **kwargs):
        logger.warning("Redis not available – job dropped (NullQueue). Start Redis for production use.")
        return None

def _make_queue(name: str, connection, **kwargs):
    try:
        from rq import Queue
        return Queue(name, connection=connection, **kwargs)
    except Exception:
        return _NullQueue()

try:
    import redis
    redis_conn = redis.from_url(REDIS_URL, socket_connect_timeout=2)
    redis_conn.ping()  # Test connection immediately

    upload_queue  = _make_queue("upload_analysis", redis_conn, default_timeout=3600)
    evidence_queue = _make_queue("evidence_writer",  redis_conn, default_timeout=600)
    vision_queue   = _make_queue("realtime_vision",  redis_conn, default_timeout=300)
    logger.info("Redis connected – queues initialized.")

except Exception as e:
    logger.warning(f"Redis unavailable ({e}). Using NullQueue – video jobs will run in-process via BackgroundTasks.")
    redis_conn     = None
    upload_queue   = _NullQueue()
    evidence_queue = _NullQueue()
    vision_queue   = _NullQueue()
