from celery import Celery
import numpy as np
import time
import socket

BROKER = 'redis://192.168.50.1:6379/0'
BACKEND = 'redis://192.168.50.1:6379/1'

app = Celery('cluster_tasks', broker=BROKER, backend=BACKEND)

@app.task
def matrix_multiply_chunk(chunk_id: int, A_rows: list, B: list) -> dict:
    A = np.array(A_rows)
    Bm = np.array(B)
    t0 = time.perf_counter()
    result = A @ Bm
    elapsed = time.perf_counter() - t0
    return {
        'chunk_id': chunk_id,
        'elapsed_s': elapsed,
        'node': socket.gethostname()
    }

@app.task
def process_frame_chunk(chunk_id: int, pixel_data: list, operation: str = 'edge_detect') -> dict:
    arr = np.array(pixel_data, dtype=np.float32).reshape(-1, 3)
    t0 = time.perf_counter()
    lum = 0.299*arr[:,0] + 0.587*arr[:,1] + 0.114*arr[:,2]
    result = np.gradient(lum).tolist()
    elapsed = time.perf_counter() - t0
    return {
        'chunk_id': chunk_id,
        'elapsed_s': elapsed,
        'node': socket.gethostname()
    }