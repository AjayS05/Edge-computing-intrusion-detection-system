# Non-MPI Cluster Benchmark

There are two ways in which a non-MPI cluster benchmark differs from MPI:
1. The workers do not communicate with each other to get a task done.
2. The workers make use of a shared space. #

In our implementation, we made use of two ways to do benchmark analysis - each differing in their shared space and the communication technology used by the master node. 

## POV-Ray Task Distributor
### Overview

This benchmark uses **Dr. Christian Baun's Task Distributor** — the same tool developed by the professor — to distribute POV-Ray ray tracing workloads across a Raspberry Pi cluster without MPI. The goal is to demonstrate Amdahl's Law and Gustafson's Law through a real compute-heavy workload, and to identify bottlenecks in a non-MPI distributed architecture.

---

### Cluster Setup

| Component | Details |
|---|---|
| Master node | Raspberry Pi 5 (RPi5) |
| Worker nodes | 8 × Raspberry Pi 3 (RPi3) |
| Network | Private LAN 192.168.50.0/24 |
| Shared filesystem | NFS — RPi5 exports `/srv/nfs/shared` → workers mount at `/shared` |
| Worker boot | PXE boot from RPi5 — workers are stateless |
| Background load | k3s Kubernetes agent running on all RPi3 nodes (~5–30% CPU) |

---

### How Task Distributor Works

The task distributor splits a POV-Ray scene into horizontal image strips and distributes them across worker nodes. The process has three phases which directly map to Amdahl's serial and parallel fractions:

![Workflow Task Distributor Baun](images/baun_povray.png)

#### Phase 1 — 1st Sequential Part (master only)
- Master creates a locfile on the NFS shared volume
- Master calculates row ranges for each worker
- SSH connection established to each worker node
- This is pure serial overhead — cannot be parallelised

#### Phase 2 — Parallel Part (all workers simultaneously)
- Master SSHes into each RPi3 and launches `task-distributor-worker.sh`
- Each worker runs POV-Ray independently, rendering only its assigned row range
- Workers write output to local `/tmp/` (avoids NFS write contention during render)
- When done, each worker crops its strip, moves it to `/shared/output/workerN.png`
- Each worker writes a `.done` file to signal completion — master polls this file
- Master waits until all workers signal done before proceeding

#### Phase 3 — 2nd Sequential Part (master only)
- Master collects all `worker*.png` strips from NFS shared volume
- ImageMagick `convert -append` stitches strips vertically into final image
- This assembly step is serial and grows with number of workers (more strips to assemble)

#### Why it is Non-MPI
Workers have no awareness of each other. There are no ranks, no barriers, no collective operations, no direct worker-to-worker communication. Each worker only communicates with the master via the NFS filesystem — reading its task parameters from SSH arguments and signalling completion via a `.done` file. This is a classic **task farming** pattern, architecturally distinct from MPI's tightly-coupled collective model.

---

### Benchmark Configuration

| Parameter | Value |
|---|---|
| Workload | POV-Ray ray tracing of `blob.pov` scene |
| Image sizes tested | 200×150, 400×300, 800×600, 1600×1200, 3200×2400 |
| Worker counts | 1, 2, 4, 8 |
| Repetitions | 3–10 runs per configuration |
| Metric | Mean wall clock time, parallel time, sequential times |
| Speedup reference | T1 (1-worker distributed time) |

---

### Results

#### Graph interpretation

The stacked bar charts show three components per run:

- **Green (Par. part)** — time workers spent actually rendering in parallel
- **Orange (2nd seq. part)** — time master spent assembling image strips
- **Red (1st seq. part)** — time master spent setting up SSH connections and lockfile

The speedup bars show T1/Tn — how much faster N workers is compared to 1 worker.
![Task Distributor 8 Node Result](images/combined_performance_grid2.png)

#### What the results show

##### 200×150 — Pure Amdahl's Law regime

| Workers | Wall time (s) | Speedup |
|---|---|---|
| 1 | ~2.1 | 1.00 |
| 2 | ~2.9 | 0.66 |
| 4 | ~5.0 | 0.41 |
| 8 | ~18.8 | 0.11 |

Wall time **increases** with more workers. Speedup drops far below 1.0. This is textbook Amdahl's Law — the problem is so small (30,000 pixels) that the parallel compute time is negligible, but the SSH startup overhead (establishing 8 connections) and the NFS lockfile coordination grow with N. Adding workers makes things worse because the serial overhead dominates.

##### 400×300 — Still Amdahl-dominated

Similar pattern — time increases then partially recovers at N=8 but never beats N=1. The compute is still too small relative to coordination overhead.

##### 800×600 — Transition zone

| Workers | Wall time (s) | Speedup |
|---|---|---|
| 1 | ~10.2 | 1.00 |
| 2 | ~10.5 | 0.93 |
| 4 | ~4.6 | 1.11 |
| 8 | ~18.9 | 0.54 |

N=4 finally breaks speedup above 1.0 (1.11×) — the parallel compute is large enough to benefit from 4 workers. But N=8 regresses because the 2nd sequential assembly step and SSH overhead now outweigh the compute gain.

##### 1600×1200 — Gustafson's Law emerging

| Workers | Wall time (s) | Speedup |
|---|---|---|
| 1 | ~12.0 | 1.00 |
| 2 | ~13.2 | 0.92 |
| 4 | ~10.5 | 1.13 |
| 8 | ~7.9 | 1.51 |

Clear trend — speedup increases with workers and stays above 1.0 from N=4 onwards. The parallel green bar dominates and shrinks with more workers. The sequential orange bar (image assembly) is now visible but small relative to total time. This is Gustafson's regime — the problem is large enough that parallel compute dominates.

##### 3200×2400 — Strong Gustafson's Law

| Workers | Wall time (s) | Speedup |
|---|---|---|
| 2 | ~35.6 | 1.00 (baseline) |
| 4 | ~27.4 | 1.34 |
| 8 | ~25.3 | 1.98 |

N=1 not possible — single RPi3 cannot render the full 4K image as `/tmp` fills up (POV-Ray temp files exceed 256MB tmpfs limit). N=8 achieves nearly 2× speedup over N=2. The orange sequential bar is now clearly visible — image assembly via `convert` takes ~1.5s regardless of worker count, forming a fixed serial cost floor.

---

### Bottlenecks Identified

#### 1. SSH startup overhead (1st sequential part)
Every run requires the master to open SSH connections to each worker. At N=8 this adds ~0.5–1s of serial overhead before any compute starts. This is why small images show negative speedup — the SSH overhead exceeds the render time.

**Internal CPU view:** The master's CPU spends time in system calls for network socket setup, key exchange, and process spawning. Workers sit idle waiting for the SSH connection to establish.

#### 2. NFS lockfile write contention
Workers signal completion by appending to a shared NFS lockfile. Under high concurrency (N=8, all finishing simultaneously) NFS write ordering is not guaranteed, causing some workers' writes to be lost silently. This caused intermittent hangs where the master waited indefinitely for a worker that had already finished.

**Fix applied:** Replaced shared lockfile append with individual per-worker `.done` files — each worker creates `worker1.done`, `worker2.done` etc. Master checks for file existence rather than grepping a shared file, eliminating the race condition.

#### 3. Image assembly (2nd sequential part — Amdahl's serial fraction α)
The `convert -append` command runs on the master and is inherently serial. It grows slightly with N (more strips to load and stitch). At 3200×2400 this takes ~1.5s. This is our measured α — the fraction of work that cannot be parallelised regardless of how many workers you add.

**Internal CPU view:** Single-threaded ImageMagick decompresses each PNG strip, allocates a full-resolution output buffer in memory, copies strips sequentially, then re-encodes. Memory bandwidth limited on RPi5.

#### 4. k3s Kubernetes agent interference
All RPi3 worker nodes run a k3s agent as part of the production Kubernetes cluster serving SeaweedFS. This agent consumes 5–30% CPU intermittently, causing variance in per-worker render times. In extreme cases one worker took 2+ minutes longer than others, inflating parallel wall time significantly.

**Internal CPU view:** k3s agent performs periodic container health checks, network namespace maintenance, and etcd heartbeats. These are burst operations that preempt POV-Ray's compute threads. Since k3s load is non-uniform across nodes (different pods scheduled differently), workers finish at different times — this is visible in the lockfile timestamps showing 30–60 second gaps between first and last worker completion.

#### 5. /tmp size limit at large image sizes
RPi3 nodes have 256MB tmpfs mounted at `/tmp`. POV-Ray writes large intermediate files during rendering. At 3200×2400 with a single worker, POV-Ray's temp directories (`/tmp/pov*`) consume the entire tmpfs and the process aborts with a segmentation fault.

**This is actually a Gustafson argument:** The only way to render large images is to distribute them — no single node has sufficient local scratch space. More workers = smaller strips = smaller per-node temp files. This is a real hardware constraint that motivates distributed rendering.

---

### Amdahl's Law Verification

From the results, the serial fraction α can be estimated from the sequential times:

- At 800×600: seq1 + seq2 ≈ 0.15s, wall ≈ 5s → α ≈ 0.03 (3% serial)
- At 1600×1200: seq1 + seq2 ≈ 0.7s, wall ≈ 10s → α ≈ 0.07 (7% serial)
- At 3200×2400: seq1 + seq2 ≈ 1.6s, wall ≈ 27s → α ≈ 0.06 (6% serial)

With α ≈ 0.06, Amdahl's Law predicts maximum speedup of `1/0.06 ≈ 16.7×` with infinite workers. The measured speedup of 1.98× at N=8 for 3200×2400 is consistent with this — we are nowhere near the theoretical limit, primarily because N=8 is still small relative to the ceiling.

---

### Gustafson's Law Verification

The left columns of the chart (small images) show increasing wall time with workers — Amdahl behaviour. The right columns (large images) show decreasing wall time — Gustafson behaviour. The transition occurs between 800×600 and 1600×1200, where the parallel compute fraction becomes large enough to benefit from distribution.

This matches Gustafson's insight: for a sufficiently large problem, the sequential fraction becomes negligible relative to the parallel work, and speedup scales with N. Our measured efficiency at 3200×2400 with N=8 is approximately 1.98/8 = 24.8% — limited by the k3s interference and fixed assembly cost, not the parallelisation architecture itself.

---

### Side-Quest
We modified the task distributor to distribute the image slides within a node to cores. Making cores as the workers. Following code transforms the scheduler from a one-worker-per-machine model into a many-workers-per-machine model.
```
WORKERS_PER_NODE=$((NUM_NODES / 8))

for ((node=1; node<=8; node++)); do
    for ((w=1; w<=WORKERS_PER_NODE; w++)); do
        HOSTS_ARRAY[$idx]=${PHYSICAL_NODES[$node]}
        idx=$((idx + 1))
    done
done
```

Basically, for 32 workers the process distribution is like this:

```
Image
────────────────────────────

Slice1  → Pi1
Slice2  → Pi1
Slice3  → Pi1
Slice4  → Pi1

Slice5  → Pi2
Slice6  → Pi2
Slice7  → Pi2
Slice8  → Pi2

...
```

## Celery-based Benchmark
Following is the flow which is repeated many times with different numbers of workers and different workload sizes.

```
               Pi 5 (Master)
                    │
         Create Monte Carlo workload
                    │
        ┌───────────┴───────────┐
        │                       │
   Scheduler             Celery
        │
        ▼
 Distribute work to workers
        │
        ▼
  Raspberry Pi 3 workers
        │
        ▼
Each computes part of Monte Carlo Pi
        │
        ▼
Send results back
        │
        ▼
Master measures total time
        │
        ▼
Compare against serial execution
```

Timer is started before sending which includes:
- scheduling
- sending tasks
- waiting
- network delay
- computation
- receiving results