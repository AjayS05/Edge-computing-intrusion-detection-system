"""
Combined Amdahl + Gustafson Benchmark
Celery+Redis AND ZeroMQ — Monte Carlo Pi
Produces professor-style charts for both schedulers.

Layout (per scheduler):
  Columns : point sizes [10K, 100K, 1M, 10M, 50M]
  Row 0   : wall clock time (mean of N trials)
  Row 1   : speedup vs serial baseline
  X-axis  : worker counts [1, 2, 4, 8, 16, 32]

Trial counts:
  10K / 100K / 1M  → 10 trials
  10M              →  3 trials
  50M              →  3 trials, minimum 2 workers (skip N=1)
"""

import time, json, sys, subprocess, socket, pickle
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

sys.path.insert(0, '/srv/nfs/shared')

# ── Config ────────────────────────────────────────────────────────────────────
MASTER_IP     = '192.168.50.1'
WORKER_IPS    = [f'192.168.50.{i}' for i in range(101, 109)]
WORKER_COUNTS = [1, 2, 4, 8, 16, 32]
OUTPUT_DIR    = '/srv/nfs/shared'

POINT_CONFIGS = [
    {'points': 10_000,      'trials': 10, 'min_workers': 1},
    {'points': 100_000,     'trials': 10, 'min_workers': 1},
    {'points': 1_000_000,   'trials': 10, 'min_workers': 1},
    {'points': 10_000_000,  'trials':  3, 'min_workers': 1},
    {'points': 50_000_000,  'trials':  3, 'min_workers': 2},
]

# ── Shared: serial baseline ───────────────────────────────────────────────────
def serial_baseline(total_points, trials=5):
    rng = np.random.default_rng()
    times = []
    for _ in range(trials):
        t0 = time.perf_counter()
        xy = rng.random((total_points, 2))
        np.sum(xy[:,0]**2 + xy[:,1]**2 < 1.0)
        times.append(time.perf_counter() - t0)
    return round(sum(times) / len(times), 6)

# ════════════════════════════════════════════════════════════════════════════════
# CELERY SECTION
# ════════════════════════════════════════════════════════════════════════════════
def run_celery(n_workers, points_per_worker):
    from celery import group
    from tasks import monte_carlo_pi
    job     = group(monte_carlo_pi.s(points_per_worker) for _ in range(n_workers))
    t0      = time.perf_counter()
    result  = job.apply_async()
    outputs = result.get(timeout=600)
    wall    = time.perf_counter() - t0
    return wall, outputs

def benchmark_celery():
    print('\n' + '═'*60)
    print('CELERY + REDIS BENCHMARK')
    print('═'*60)
    results = []

    for cfg in POINT_CONFIGS:
        pts    = cfg['points']
        trials = cfg['trials']
        min_w  = cfg['min_workers']
        workers_to_run = [n for n in WORKER_COUNTS if n >= min_w]

        print(f'\n── Celery | {pts:,} points | {trials} trials ──')
        T_serial = serial_baseline(pts)
        print(f'   Serial baseline: {T_serial:.4f}s')

        for n in workers_to_run:
            ppw   = max(1, pts // n)
            walls = []
            for t in range(trials):
                try:
                    w, _ = run_celery(n, ppw)
                    walls.append(w)
                    print(f'   N={n:2d} trial {t+1}/{trials}: {w:.4f}s')
                except Exception as e:
                    print(f'   N={n:2d} trial {t+1} FAILED: {e}')
            if not walls:
                continue
            wall       = round(sum(walls) / len(walls), 4)
            speedup    = round(T_serial / wall, 4)
            efficiency = round(speedup / n, 4)
            results.append({
                'scheduler': 'celery',
                'total_points': pts,
                'n_workers': n,
                'serial_s': T_serial,
                'wall_s': wall,
                'wall_all': walls,
                'speedup': speedup,
                'efficiency': efficiency,
            })
            print(f'   N={n:2d} MEAN Wall={wall:.4f}s Speedup={speedup:.3f}x '
                  f'Eff={efficiency:.2%}')

    return results

# ════════════════════════════════════════════════════════════════════════════════
# ZEROMQ SECTION
# ════════════════════════════════════════════════════════════════════════════════
TASK_PORT   = 5557   # different ports to avoid conflicts with any running celery
RESULT_PORT = 5558

def zmq_start_workers(n_workers):
    for ip in WORKER_IPS[:n_workers]:
        cmd = (f'ssh pi3@{ip} "python3 /shared/zmq_worker.py {MASTER_IP} '
               f'{TASK_PORT} {RESULT_PORT} > /tmp/zmq.log 2>&1 &"')
        subprocess.Popen(cmd, shell=True).wait()
    time.sleep(1.5)

def zmq_stop_workers(n_workers, task_sock):
    for i in range(n_workers * 2):   # send extra pills to be safe
        task_sock.send(pickle.dumps((f'poison_{i}', -1)))
    time.sleep(0.5)
    for ip in WORKER_IPS[:n_workers]:
        subprocess.Popen(
            f'ssh pi3@{ip} "pkill -f zmq_worker.py 2>/dev/null"',
            shell=True).wait()

def run_zmq_once(n_workers, points_per_worker, task_sock, result_sock):
    import zmq
    t0 = time.perf_counter()
    for tid in range(n_workers):
        task_sock.send(pickle.dumps((tid, points_per_worker)))
    outputs = []
    result_sock.setsockopt(zmq.RCVTIMEO, 300_000)
    for _ in range(n_workers):
        raw = result_sock.recv()
        outputs.append(pickle.loads(raw))
    return time.perf_counter() - t0, outputs

def benchmark_zmq():
    import zmq
    print('\n' + '═'*60)
    print('ZEROMQ BENCHMARK')
    print('═'*60)

    ctx         = zmq.Context()
    task_sock   = ctx.socket(zmq.PUSH)
    task_sock.setsockopt(zmq.LINGER, 0)
    task_sock.setsockopt(zmq.SNDHWM, 0)
    task_sock.bind(f'tcp://*:{TASK_PORT}')
    result_sock = ctx.socket(zmq.PULL)
    result_sock.setsockopt(zmq.LINGER, 0)
    result_sock.bind(f'tcp://*:{RESULT_PORT}')
    time.sleep(0.5)

    results = []

    for cfg in POINT_CONFIGS:
        pts    = cfg['points']
        trials = cfg['trials']
        min_w  = cfg['min_workers']
        workers_to_run = [n for n in WORKER_COUNTS if n >= min_w]

        print(f'\n── ZMQ | {pts:,} points | {trials} trials ──')
        T_serial = serial_baseline(pts)
        print(f'   Serial baseline: {T_serial:.4f}s')

        for n in workers_to_run:
            ppw = max(1, pts // n)
            zmq_start_workers(n)
            walls = []
            for t in range(trials):
                try:
                    w, _ = run_zmq_once(n, ppw, task_sock, result_sock)
                    walls.append(w)
                    print(f'   N={n:2d} trial {t+1}/{trials}: {w:.4f}s')
                except Exception as e:
                    print(f'   N={n:2d} trial {t+1} FAILED: {e}')
            zmq_stop_workers(n, task_sock)
            if not walls:
                continue
            wall       = round(sum(walls) / len(walls), 4)
            speedup    = round(T_serial / wall, 4)
            efficiency = round(speedup / n, 4)
            results.append({
                'scheduler': 'zmq',
                'total_points': pts,
                'n_workers': n,
                'serial_s': T_serial,
                'wall_s': wall,
                'wall_all': walls,
                'speedup': speedup,
                'efficiency': efficiency,
            })
            print(f'   N={n:2d} MEAN Wall={wall:.4f}s Speedup={speedup:.3f}x '
                  f'Eff={efficiency:.2%}')

    task_sock.close()
    result_sock.close()
    ctx.term()
    return results

# ════════════════════════════════════════════════════════════════════════════════
# PLOTTING — professor style
# ════════════════════════════════════════════════════════════════════════════════
PURPLE    = '#4B0082'
BAR_COLOR = '#CCCCCC'
BAR_EDGE  = '#333333'

def chart(results, scheduler_name, filename):
    point_sizes = sorted(set(r['total_points'] for r in results))
    n_cols      = len(point_sizes)

    fig, axes = plt.subplots(2, n_cols, figsize=(3.2 * n_cols, 7))
    fig.patch.set_facecolor(PURPLE)

    title = (f"{'Amdahl' + chr(39) + 's & Gustafson' + chr(39) + 's Law — Monte Carlo Pi'}\n"
             f"Non-MPI {'Celery+Redis' if scheduler_name=='celery' else 'ZeroMQ'} Cluster  "
             f"(8× RPi3, mean of trials)")
    fig.suptitle(title, color='white', fontsize=10, fontweight='bold', y=0.99)

    for col, pts in enumerate(point_sizes):
        rows = sorted([r for r in results if r['total_points'] == pts],
                      key=lambda x: x['n_workers'])
        if not rows:
            continue

        ns      = [r['n_workers'] for r in rows]
        walls   = [r['wall_s']    for r in rows]
        speedups= [r['speedup']   for r in rows]
        x_pos   = np.arange(len(ns))

        # ── Top: wall time ──
        ax_w = axes[0][col]
        bars = ax_w.bar(x_pos, walls, color=BAR_COLOR, edgecolor=BAR_EDGE,
                        linewidth=0.5, width=0.65)
        ax_w.set_xticks(x_pos)
        ax_w.set_xticklabels(ns, fontsize=5)
        ax_w.tick_params(axis='y', labelsize=5)
        ax_w.set_ylabel('[s]', fontsize=6)
        ax_w.set_xlabel('Number of Workers', fontsize=5)
        pts_label = f'{pts//1_000_000}M' if pts >= 1_000_000 else f'{pts//1_000}K'
        trial_count = next(c['trials'] for c in POINT_CONFIGS if c['points'] == pts)
        ax_w.set_title(f'Pi approximated with\n{pts:,} points\n'
                       f'(Mean Time of {trial_count} Tests)',
                       fontsize=6, pad=3)
        ax_w.set_facecolor('white')
        ax_w.spines['top'].set_visible(False)
        ax_w.spines['right'].set_visible(False)
        for bar, val in zip(bars, walls):
            ax_w.text(bar.get_x() + bar.get_width()/2,
                      bar.get_height() + max(walls)*0.01,
                      f'{val:.4f}' if val < 10 else f'{val:.3f}',
                      ha='center', va='bottom', fontsize=4, rotation=90)

        # ── Bottom: speedup ──
        ax_s = axes[1][col]
        bars2 = ax_s.bar(x_pos, speedups, color=BAR_COLOR, edgecolor=BAR_EDGE,
                         linewidth=0.5, width=0.65)
        ax_s.set_xticks(x_pos)
        ax_s.set_xticklabels(ns, fontsize=5)
        ax_s.tick_params(axis='y', labelsize=5)
        ax_s.set_ylabel('Speedup', fontsize=6)
        ax_s.set_xlabel('Number of Workers', fontsize=5)
        ax_s.set_facecolor('white')
        ax_s.spines['top'].set_visible(False)
        ax_s.spines['right'].set_visible(False)
        for bar, val in zip(bars2, speedups):
            ax_s.text(bar.get_x() + bar.get_width()/2,
                      bar.get_height() + max(speedups)*0.01,
                      f'{val:.2f}',
                      ha='center', va='bottom', fontsize=4, rotation=90)

    fig.text(0.5, 0.005,
             f'Non-MPI {"Celery+Redis" if scheduler_name=="celery" else "ZeroMQ (no broker)"}  —  '
             f'8× Raspberry Pi 3 Workers  —  Raspberry Pi 5 Master',
             ha='center', color='white', fontsize=6)

    plt.tight_layout(rect=[0, 0.02, 1, 0.97])
    path = f'{OUTPUT_DIR}/{filename}'
    plt.savefig(path, dpi=180, bbox_inches='tight', facecolor=PURPLE)
    plt.close()
    print(f'\nSaved: {path}')

# ════════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    all_results = []

    # ── Celery ──
    celery_results = benchmark_celery()
    all_results += celery_results
    with open(f'{OUTPUT_DIR}/celery_combined_results.json', 'w') as f:
        json.dump(celery_results, f, indent=2)
    chart(celery_results, 'celery', 'celery_combined.png')

    # # ── ZeroMQ ──
    # zmq_results = benchmark_zmq()
    # all_results += zmq_results
    # with open(f'{OUTPUT_DIR}/zmq_combined_results.json', 'w') as f:
    #     json.dump(zmq_results, f, indent=2)
    # professor_chart(zmq_results, 'zmq', 'zmq_combined.png')

    print('\n=== All done ===')
    print(f'Charts saved to {OUTPUT_DIR}/')