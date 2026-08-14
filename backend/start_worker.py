import os
import sys
from rq import Worker, Queue, Connection
from app.core.queue import redis_conn

listen = ['upload_analysis', 'evidence_writer', 'realtime_vision']

if __name__ == '__main__':
    print("Starting Laminar RQ Worker...")
    print(f"Listening on queues: {', '.join(listen)}")
    with Connection(redis_conn):
        worker = Worker(map(Queue, listen))
        worker.work()
