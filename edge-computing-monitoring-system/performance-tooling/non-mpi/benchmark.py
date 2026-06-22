import time
import numpy as np
import json
import sys
sys.path.insert(0, '/srv/nfs/shared')

from celery import group
from tasks import matrix_multiply_chunk

MATRIX_SIZE = 512

def run_serial_baseline():
    A = np.random.rand(MATRIX_SIZE, MATRIX_SIZE)
    B = np.random.rand(MATRIX_SIZE, MATRIX_SIZE)
    t0 = time.perf_counter()
    _ = A @ B
    return time.perf_counter() - t0

def run_parallel(n_workers):
    A = np.random.rand(MATRIX_SIZE, MATRIX_SIZE)
    B = np.random.rand(MATRIX_SIZE, MATRIX_SIZE).tolist()
    chunks = np.array_split(A, n_workers)

    job = group(
        matrix_multiply_chunk.s(i, chunk.tolist(), B)
        for i, chunk in enumerate(chunks)
    )

    t0 = time.perf_counter()
    result = job.apply_async()
    outputs = result.get(timeout=120)
    wall = time.perf_counter() - t0

    return {
        'n_workers': n_workers,
        'wall_time_s': round(wall, 4),
        'worker_times_s': [round(r['elapsed_s'], 4) for r in outputs],
        'nodes': [r['node'] for r in outputs],
        'max_worker_s': round(max(r['elapsed_s'] for r in outputs), 4),
        'mean_worker_s': round(sum(r['elapsed_s'] for r in outputs) / len(outputs), 4),
    }

if __name__ == '__main__':
    print(f"=== Celery Non-MPI Benchmark (matrix {MATRIX_SIZE}x{MATRIX_SIZE}) ===\n")

    # Warmup
    print("Warming up...")
    run_parallel(1)

    T_serial = run_serial_baseline()
    print(f"Serial baseline: {T_serial:.4f}s\n")

    results = []
    for n in [1, 2, 4, 8]:
        r = run_parallel(n)
        speedup    = round(T_serial / r['wall_time_s'], 3)
        efficiency = round(speedup / n, 3)
        amdahl     = round(1 / (1 - 0.9 + 0.9 / n), 3)
        r.update({'speedup': speedup, 'efficiency': efficiency, 'amdahl_limit': amdahl, 'serial_s': round(T_serial, 4)})
        results.append(r)
        print(f"Workers={n:2d} | Wall={r['wall_time_s']:.4f}s | Speedup={speedup:.3f}x | "
              f"Efficiency={efficiency:.1%} | Amdahl limit={amdahl:.3f}x")
        print(f"         Nodes used: {set(r['nodes'])}")

    with open('/srv/nfs/shared/celery_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print("\nResults saved to /srv/nfs/shared/celery_results.json")