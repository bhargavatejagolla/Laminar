import os
import redis
from rq import Queue

# Fetch Redis URL from environment or fallback to localhost
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Setup connection
redis_conn = redis.from_url(REDIS_URL)

# Define Queues
# 1. upload_analysis: Heavy background processing (videos)
upload_queue = Queue("upload_analysis", connection=redis_conn, default_timeout=3600)

# 2. evidence_writer: Low priority disk I/O
evidence_queue = Queue("evidence_writer", connection=redis_conn, default_timeout=600)

# 3. realtime_vision: If we ever need to push async light vision tasks
vision_queue = Queue("realtime_vision", connection=redis_conn, default_timeout=300)
