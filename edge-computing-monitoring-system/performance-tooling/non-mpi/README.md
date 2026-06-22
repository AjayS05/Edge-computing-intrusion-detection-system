# Non-MPI Parallelisation on a Raspberry Pi Cluster

## Overview

This project implements and benchmarks a **non-MPI parallel task scheduling system** on a heterogeneous Raspberry Pi cluster. The goal is to demonstrate that queue-based task distribution (via Celery + Redis) is a viable and measurable alternative to MPI for parallel workloads — and to compare the two approaches against parallel speedup laws (Amdahl's Law, Gustafson's Law).

The key question being answered: *how does a broker-mediated, pull-based scheduler differ in efficiency, overhead, and speedup characteristics from MPI's barrier-synchronised, rank-based communication model?*

---

## Hardware Setup

| Device | Role | Quantity |
|---|---|---|
| Raspberry Pi 5 | Master node, PXE boot server, Redis broker, task dispatcher | 1 |
| Raspberry Pi 4 + AI Camera | Image capture and frame encoding (data source) | 1 |
| Raspberry Pi 3 | Stateless worker nodes (PXE booted) | 8 |

### Network topology

All nodes are on a private LAN (`192.168.50.0/24`). The RPi 5 is the gateway and DHCP/PXE server at `192.168.50.1`. Workers are assigned static IPs `192.168.50.101` through `192.168.50.108`.

The RPi 3 workers are fully **stateless** — they have no local OS on disk. They PXE boot over the network, mounting their root filesystem from the RPi 5 via NFS. This means any change to the shared NFS rootfs is reflected on all workers at next boot.

---

## Why Non-MPI?

MPI (Message Passing Interface) is the traditional standard for distributed parallel computing. It works well for tightly-coupled HPC workloads but carries significant constraints:

- Every process must know the total number of processes at startup (ranks)
- Collective operations (broadcast, scatter, gather, barrier) require **all nodes to synchronise** before any can proceed
- A single slow or crashed node blocks the entire job
- Communication is direct rank-to-rank — the programmer manages the topology explicitly

**Celery + Redis** takes a fundamentally different approach:

- The master pushes tasks into a **queue** (Redis)
- Workers independently **pull** the next available task whenever they are free
- No ranks, no barriers, no synchronisation between workers
- A crashed worker's task is automatically re-queued
- The scheduler is **work-stealing by nature** — fast workers process more tasks without waiting for slow ones

This difference matters most under **load imbalance**: when subtasks take unequal time, MPI wastes cycles at barrier synchronisation points while Celery workers keep pulling. The benchmark is designed to measure exactly this.

---

## Software Stack

| Component | Software | Where it runs |
|---|---|---|
| Task broker | Redis | RPi 5 |
| Task scheduler / worker | Celery 5.6.3 | All 8 RPi 3 workers |
| Numerical workload | NumPy 2.2.4 | All nodes |
| Shared code distribution | NFS (`/srv/nfs/shared` → `/shared`) | RPi 5 exports, workers mount |
| Benchmark dispatcher | Python 3 (`benchmark.py`) | RPi 5 |
| Task definitions | Python 3 (`tasks.py`) | Shared via NFS |

---

## Infrastructure Setup

### 1. NFS shared directory

The RPi 5 already serves per-node NFS roots (`/srv/nfs/rpi3-01` through `rpi3-08`) for PXE booting. A separate shared volume at `/srv/nfs/shared` is exported to all nodes and mounted by each worker at `/shared`. This is where `tasks.py` and `benchmark.py` live — one copy, visible to everyone instantly.

Verify exports on the RPi 5:
```bash
sudo exportfs -v
showmount -e localhost
```

Verify a worker has it mounted:
```bash
ssh pi3@192.168.50.101 "cat /proc/mounts | grep nfs"
```

### 2. Redis broker

Redis is installed on the RPi 5 and configured to accept connections from the cluster LAN (not just localhost).

Two configuration changes were required from the default Raspberry Pi OS Redis install:

**Bind to all interfaces** (default is `127.0.0.1` only):
```bash
sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf
```

**Disable protected mode** (blocks external connections when no password is set):
```bash
sudo sed -i 's/^protected-mode yes/protected-mode no/' /etc/redis/redis.conf
sudo systemctl restart redis
```

This is safe on a private cluster LAN with no internet exposure. For production use, set a Redis password and update the broker URL in `tasks.py` accordingly.

### 3. Celery installation on workers

Celery is not available system-wide on the RPi 3 nodes (system site-packages are read-only). It installs to the user's local bin at `/home/pi3/.local/bin/celery`.

Install across all workers from the RPi 5 in one pass:
```bash
for i in 101 102 103 104 105 106 107 108; do
    ssh pi3@192.168.50.$i "pip3 install celery redis numpy --break-system-packages"
done
```

### 4. Starting workers

Workers are started from the RPi 5 via SSH. They run detached, reading `tasks.py` from `/shared`:

```bash
for i in 101 102 103 104 105 106 107 108; do
    ssh pi3@192.168.50.$i \
        "cd /shared && /home/pi3/.local/bin/celery -A tasks worker \
        --loglevel=info --concurrency=2 \
        -n worker@\$(hostname) \
        --detach \
        --logfile=/tmp/celery.log \
        --pidfile=/tmp/celery.pid"
done
```

`--concurrency=2` gives each RPi 3 two worker processes, matching its dual-core CPU.

### 5. Verifying all workers are online

From the RPi 5, using the Celery inspect command (note: celery binary is not on PATH for the pi5 user, so use the module invocation):

```bash
cd /srv/nfs/shared && python3 -m celery -A tasks inspect ping
```

Expected output: `8 nodes online` with a `pong` from each `worker@rpi3-0X`.

---

## Benchmark Design

The benchmark (`benchmark.py`) measures parallel matrix multiplication — an embarrassingly parallel workload that splits cleanly across workers by row partition.

### What it measures

- **Serial baseline**: single-node `numpy` matrix multiply on the RPi 5, no distribution overhead
- **Parallel runs**: the same matrix split into N chunks, dispatched as a Celery task group, timed end-to-end (including dispatch and result collection overhead)
- **Worker-level timing**: each task records its own compute time on the node, returned with the result

### Metrics computed

| Metric | Formula | What it tells you |
|---|---|---|
| Speedup | T_serial / T_wall | How much faster than serial |
| Efficiency | Speedup / N_workers | Fraction of theoretical maximum being used |
| Amdahl limit | 1 / (1 - p + p/N) | Theoretical ceiling assuming 90% parallel fraction |

Runs are performed at 1, 2, 4, and 8 workers to trace the speedup curve and compare it against Amdahl's prediction.

### Why this workload

Matrix multiplication has a well-understood parallel structure. The row-wise partition is embarrassingly parallel (no inter-chunk dependencies), so any deviation from linear speedup is attributable purely to scheduling overhead, serialisation cost (sending data through Redis), and load imbalance — not to the algorithm itself. This makes it an ideal probe for comparing scheduler architectures.

---

## Files

| File | Location | Purpose |
|---|---|---|
| `tasks.py` | `/srv/nfs/shared/` | Celery task definitions (matrix multiply, frame processing) |
| `benchmark.py` | `/srv/nfs/shared/` | Benchmark harness, runs serial and parallel, saves results |
| `celery_results.json` | `/srv/nfs/shared/` | Output: timing and speedup data per worker count |

---

## Replication Checklist

1. RPi 5 as PXE/NFS server with `/srv/nfs/shared` exported to the cluster subnet
2. Redis installed on RPi 5, bound to `0.0.0.0`, protected mode off
3. Celery + Redis + NumPy installed on all worker nodes (`pip3 install celery redis numpy`)
4. `tasks.py` placed in `/srv/nfs/shared/`
5. Workers started via SSH with `cd /shared && celery -A tasks worker --detach`
6. Verified with `python3 -m celery -A tasks inspect ping` showing all N nodes
7. Run `python3 benchmark.py` from `/srv/nfs/shared/` on the RPi 5

---

## Interpreting Results

Compare the output speedup curve against the Amdahl limit column. The gap between them is the **Celery scheduling overhead** — time spent serialising tasks, pushing to Redis, pulling from the queue, and deserialising results.

When you run the equivalent MPI benchmark (`mpi4py` with `MPI.COMM_WORLD.Scatter` / `Gather`), compare:

- At equal worker counts, which wall time is lower?
- How does efficiency degrade as N increases?
- At what N does Celery's lack of barrier synchronisation give it an advantage over MPI under load imbalance?

The answers demonstrate the architectural trade-off: MPI minimises communication latency for uniform workloads; Celery minimises idle time for variable-duration tasks.