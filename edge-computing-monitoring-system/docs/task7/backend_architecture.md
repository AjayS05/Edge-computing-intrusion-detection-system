<article markdown="1">

# Backend Architecture Design

## 1. Purpose

The PiWatch backend is the coordination layer of the edge-computing intrusion-detection system. It receives frames from the Raspberry Pi 4 camera node, persists the original image, distributes image preprocessing across eight Raspberry Pi 3 workers, invokes the YOLO inference service on the Raspberry Pi 5, stores the resulting evidence and metadata, and exposes APIs used by the frontend and Telegram alerting workflow.

The architecture separates the pipeline into three independently deployable services:

| Service | Runtime location | Port | Main responsibility |
|---|---:|---:|---|
| FastAPI backend | Raspberry Pi 5 (`cloud`) | `8000` | Request validation, orchestration, storage, events, alerts and APIs |
| YOLO inference service | Raspberry Pi 5 (`cloud`) | `8001` | Model loading, object detection and annotated-image generation |
| Image worker service | Raspberry Pi 3 nodes | `8002` | Distributed tile preprocessing and health reporting |

The backend is exposed outside the K3s cluster through NodePort `30080`.

---

## 2. Complete Backend Architecture

![PiWatch backend architecture](assets/backend/backend-architecture.svg)

**Figure 1 — PiWatch backend architecture.** The Pi4 camera sends frames through the private `192.168.50.0/24` network. The Pi5 coordinates the Pi3 workers, performs inference through a dedicated service, and stores persistent evidence in SeaweedFS on the external SSD.

> **Screenshot placeholder — deployed backend architecture**  
> Add a screenshot of the final architecture diagram used in the report or presentation.  
> Suggested filename: `assets/backend/backend-architecture-final.png`

---

## 3. Hardware and Network Roles

| Device | Address or identity | Role |
|---|---|---|
| Raspberry Pi 5 | `192.168.50.1`, K3s node `cloud` | Control plane, FastAPI backend, inference service, storage access and monitoring |
| Raspberry Pi 4 | `192.168.50.144` | Camera capture and frame sender |
| Raspberry Pi 3 workers | `rpi3-01` to `rpi3-08` | Distributed image preprocessing |
| Pi3 worker addresses | `192.168.50.101` to `192.168.50.108` | Private worker-node communication |
| External SSD | Mounted on Pi5 under `/srv/nfs` | Persistent application, SeaweedFS and container-runtime storage |

The private `192.168.50.0/24` network is used for the internal edge pipeline. This avoids depending on a temporary Wi-Fi address assigned by an external router.

---

## 4. End-to-End Frame Processing Flow

### Step 1 — Frame capture

The Pi4 camera sender captures a JPEG frame with the configured resolution and quality. Each capture contains:

- `capture_id`
- `sensor_node_id`
- `camera_location`
- `captured_at`
- `sequence_number`
- SHA-256 image checksum
- upload source (`live`, `retry` or `manual`)

### Step 2 — Backend request validation

The Pi4 submits the frame to:

```text
POST http://192.168.50.1:30080/api/v1/frames
```

The FastAPI backend validates:

- image type (`JPEG` or `PNG`);
- image size;
- required sensor and capture fields;
- checksum correctness;
- idempotency information.

### Step 3 — Duplicate protection

The backend uses the persistent `capture_id` as the frame identity. When the sender retries an image after a timeout, the backend returns the stored result rather than running the complete pipeline again.

This prevents:

- duplicate inference;
- duplicate events;
- duplicate alerts;
- repeated Telegram messages;
- repeated metadata records for the same capture.

### Step 4 — Raw-image persistence

The exact bytes received from the Pi4 are stored in the `captured-images` bucket before distributed processing or inference modifies the frame.

### Step 5 — Worker discovery

The backend discovers healthy worker pods through the headless Kubernetes Service:

```text
image-worker-headless.edge-monitoring.svc.cluster.local:8002
```

Only workers that pass their health checks are used.

### Step 6 — Adaptive image splitting

The backend selects a stable tile layout based on the number of available workers.

| Healthy workers | Layout | Number of tiles |
|---:|---:|---:|
| 8 or more | `4 × 2` | 8 |
| 6–7 | `3 × 2` | 6 |
| 4–5 | `2 × 2` | 4 |
| 2–3 | `2 × 1` | 2 |
| Fewer than 2 | Full-frame fallback | 1 |

A default overlap of `32 px` is used around tile boundaries. During reconstruction, only each tile's core region is used, preventing duplicated overlap regions.

### Step 7 — Distributed preprocessing

Each tile is sent to a Pi3 worker. A worker can apply the configured processing mode, such as:

- CLAHE contrast enhancement;
- grayscale conversion;
- identity processing.

The worker returns the processed tile, checksum, worker identity and processing latency.

### Step 8 — Retry and fallback

When a worker request fails:

1. the backend retries the tile on another healthy worker;
2. attempt errors are retained in the distribution metadata;
3. if every worker attempt fails, the original tile is used;
4. if distributed processing cannot be used, the full original frame proceeds to inference.

A worker failure therefore does not automatically discard the frame.

### Step 9 — Frame reconstruction

The backend reconstructs a single image from the successful or fallback tiles. YOLO is called once on the reconstructed image; the model is not executed separately on every Pi3.

### Step 10 — YOLO inference

The backend calls:

```text
http://inference.edge-monitoring.svc.cluster.local:8001
```

The inference service loads `best_final.pt` once and returns:

- detections;
- class names;
- confidence scores;
- bounding boxes;
- severity values;
- inference latency;
- annotated JPEG data when detections exist.

The final model contains four classes:

| Class | Severity policy |
|---|---|
| `fire` | Critical |
| `weapon` | Critical |
| `person` | Informational |
| `container` | Informational |

### Step 11 — Event and alert creation

A detected frame produces one frame-level event containing the complete `detections` array. Critical threat detections can additionally produce individual alert records.

This keeps the Event History page organized while preserving all detections associated with the frame.

### Step 12 — Persistent result storage

The backend stores:

- raw image;
- annotated image when detections exist;
- frame JSON;
- detection JSON;
- event JSON;
- alert JSON when required.

### Step 13 — API and notification access

The frontend reads events and images through the backend API. Critical alerts can also be sent through the Telegram bot integration.

---

## 5. Core Backend Components

### 5.1 FastAPI coordinator

The coordinator owns the public REST API and the full request lifecycle. Its responsibilities include:

- input validation;
- duplicate protection;
- worker discovery;
- tile dispatch;
- image reconstruction;
- inference-service communication;
- SeaweedFS access;
- event and alert generation;
- Telegram integration;
- frontend image streaming;
- monitoring and storage-status APIs.

### 5.2 Distributed frame service

The distributed frame service decides whether distributed processing can be used and produces structured metadata containing:

- active worker count;
- selected layout;
- tile count;
- successful tiles;
- failed tiles;
- fallback tiles;
- workers used;
- worker processing latency;
- total distributed-stage latency.

### 5.3 Worker registry

The worker registry resolves worker endpoints from Kubernetes DNS or configured URLs. Health checks ensure that unavailable workers are excluded from new assignments.

### 5.4 Task dispatcher

The dispatcher assigns tiles to workers, balances requests and retries failures. It records the worker used for each tile and the latency of every attempt.

### 5.5 Inference client

The backend inference client sends the reconstructed image to the inference service over HTTP and converts the response into backend metadata.

### 5.6 Storage service

The storage service abstracts SeaweedFS S3 and local fallback storage. It generates predictable object keys and provides read, write and list operations.

### 5.7 Alert and Telegram services

The alert service creates alerts according to the detection severity policy. The Telegram service sends critical notifications when a token and chat ID are configured.

---

## 6. Backend Source Layout

```text
backend/
├── app/
│   ├── api/
│   │   ├── frames.py
│   │   ├── events.py
│   │   ├── images.py
│   │   ├── alerts.py
│   │   ├── monitoring.py
│   │   ├── model.py
│   │   ├── storage.py
│   │   └── telegram.py
│   ├── core/
│   │   └── config.py
│   ├── services/
│   │   ├── frame_processing_service.py
│   │   ├── distributed_frame_service.py
│   │   ├── image_splitter.py
│   │   ├── worker_registry.py
│   │   ├── task_dispatcher.py
│   │   ├── inference_client.py
│   │   ├── storage_service.py
│   │   ├── storage_status_service.py
│   │   ├── alert_service.py
│   │   └── telegram_service.py
│   └── main.py
├── inference_app/
│   ├── main.py
│   ├── inference_service.py
│   └── schemas.py
├── worker_app/
│   ├── main.py
│   ├── processing.py
│   ├── config.py
│   └── schemas.py
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.inference
│   └── Dockerfile.worker
├── requirements/
│   ├── backend.txt
│   ├── inference.txt
│   └── worker.txt
└── k8s/
    ├── 00-namespace-config.yaml
    ├── 10-backend.yaml
    ├── 20-inference.yaml
    └── 30-workers.yaml
```

---

## 7. Service Communication

| Source | Destination | Protocol | Purpose |
|---|---|---|---|
| Pi4 camera sender | Backend NodePort `30080` | HTTP multipart | Upload a frame |
| Backend | Pi3 workers `8002` | HTTP | Health checks and tile processing |
| Backend | Inference service `8001` | HTTP | YOLO inference |
| Backend | SeaweedFS S3 `8333` | S3-compatible HTTP | Store and retrieve objects |
| Frontend | Backend NodePort `30080` | HTTP JSON/image | Events, monitoring and evidence |
| Backend | Telegram Bot API | HTTPS | Critical notifications |
| Prometheus | Backend and nodes | HTTP metrics | Monitoring |

---

## 8. Reliability Design

### Health probes

Backend, inference and worker deployments use Kubernetes probes:

- startup probes allow initialization time;
- readiness probes prevent traffic before a service is ready;
- liveness probes restart an unresponsive container.

### Persistent storage

SeaweedFS stores evidence on SSD-backed storage, so restarting backend or inference pods does not remove images and metadata.

### Local image availability

The K3s manifests use `imagePullPolicy: Never` for locally built ARM64 images. Therefore, the worker image must be present in K3s containerd on every Pi3 that may run a worker pod.

### Graceful degradation

The pipeline supports:

- fewer available workers;
- per-tile retry;
- original-tile fallback;
- full-frame fallback;
- no-detection responses without annotated images;
- retry-safe uploads through persistent capture IDs.

---

## 9. Performance Metadata

Each processed frame can include:

```text
distributed_processing.active_worker_count
distributed_processing.layout
distributed_processing.tile_count
distributed_processing.successful_tile_count
distributed_processing.fallback_tile_count
distributed_processing.failed_tile_count
distributed_processing.total_latency_seconds
distributed_processing.workers_used

inference.model_latency_seconds
inference.round_trip_latency_seconds
inference.detection_count

pipeline_latency_seconds
```

These fields support performance evaluation, troubleshooting and frontend visualization.

---

## 10. Architecture Validation

The deployed architecture is considered healthy when:

- Pi5 and all Pi3 nodes report `Ready`;
- one backend pod is ready on `cloud`;
- one inference pod is ready on `cloud`;
- eight worker pods are ready across `rpi3-01` to `rpi3-08`;
- the worker headless Service exposes eight endpoints;
- backend health checks can reach inference and workers;
- a Pi4 upload returns `HTTP 200`;
- inference logs show `POST /infer HTTP/1.1 200 OK`;
- raw images and JSON remain available after a backend restart.

---

## 11. Screenshots to Add

1. `backend-architecture-final.png` — final architecture diagram.
2. `backend-pipeline-flow.png` — Pi4 upload through storage and event creation.
3. `kubernetes-worker-distribution.png` — eight worker pods across Pi3 nodes.
4. `backend-inference-logs.png` — backend uploads and inference `POST /infer 200`.
5. `distributed-response-metadata.png` — frame response showing `4x2`, eight tiles and inference metadata.
6. `frontend-live-detection.png` — annotated image and detection metadata in the UI.

Recommended image directory:

```text
assets/backend/
```

</article>
