# Performance Summary

## Non-MPI

Three different benchmark implementations were evaluated on the Raspberry Pi cluster:

1. **POV-Ray Task Distributor (8 Workers)**
2. **Modified Task Distributor (32 Logical Workers)**
3. **Celery + Redis Monte Carlo Benchmark**

Although all three are non-MPI approaches, they exhibit different scalability characteristics because of their communication models and workload distributions.

---

### 1. POV-Ray Task Distributor (8 Workers)

The original task distributor demonstrates both **Amdahl's Law** and **Gustafson's Law**, depending on the workload size.

For small images (200×150 to 800×600), communication and coordination overhead dominate the execution time. Establishing SSH connections, coordinating workers, and assembling the final image consume more time than the rendering itself, resulting in little or no speedup.

As image size increases (1600×1200 and 3200×2400), rendering becomes the dominant cost. The parallel portion of the workload grows significantly while the sequential overhead remains relatively constant, leading to measurable speedup.

#### Key observations

- Small workloads become slower with additional workers.
- Large workloads benefit from parallel execution.
- Best measured speedup: **~2×** at 3200×2400 using 8 workers.
- Main bottlenecks:
  - SSH startup overhead
  - NFS synchronization
  - Sequential image composition
  - Background k3s processes

---

### 2. Modified Task Distributor (32 Logical Workers)

#### Summary

The scheduler was extended to support multiple logical workers per Raspberry Pi, allowing all CPU cores to participate in rendering.

Instead of assigning one rendering task per machine, each physical Raspberry Pi executes multiple rendering processes simultaneously.

This increases hardware utilization but also introduces additional process scheduling overhead and CPU contention.

#### Key observations

- Small workloads remain dominated by overhead.
- Medium and large workloads improve significantly up to approximately **8 workers**.
- Beyond this point, performance begins to plateau or decline.
- Best measured speedup:
  - **2.73×** for 1600×1200
  - **2.59×** for 3200×2400

Increasing logical workers beyond the available hardware resources provides diminishing returns because workers begin competing for the same CPU cores, memory bandwidth, and cache.

#### Main bottlenecks

- SSH process creation
- Operating system scheduling overhead
- CPU contention between multiple rendering processes
- Sequential image assembly

---

### 3. Celery + Redis Monte Carlo Benchmark

Unlike the Task Distributor, Celery distributes independent Monte Carlo tasks through a Redis message broker.

The measured runtime includes task scheduling, serialization, communication, computation, and result collection.

For small workloads, communication overhead dominates execution time, resulting in almost no speedup.

As the workload increases to tens of millions of samples, computation becomes the dominant component and the cluster begins to scale more effectively.

#### Key observations

- Very small workloads show almost no benefit from parallel execution.
- Larger workloads (10M–50M samples) demonstrate increasing speedup.
- Best measured speedup:
  - **2.68×** at 50M samples using 32 workers.

#### Main bottlenecks

- Redis broker becoming a centralized communication point
- Task serialization/deserialization
- Queue scheduling latency
- Python interpreter overhead
- Result collection through Redis

Possible improvements include replacing Redis with a lower-overhead messaging framework such as **ZeroMQ**, increasing task granularity, and reducing communication frequency.

---

## Overall Comparison

| Benchmark | Parallel Model | Best Speedup | Main Limitation |
|------------|----------------|--------------|-----------------|
| Task Distributor (8 Workers) | Static image strip distribution | ~2× | SSH startup and sequential image composition |
| Modified Task Distributor (32 Logical Workers) | Multiple workers per physical node | 2.73× | CPU contention and scheduling overhead |
| Celery + Redis | Distributed task queue | 2.68× | Redis communication and task scheduling overhead |
