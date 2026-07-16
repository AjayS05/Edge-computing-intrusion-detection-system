<article markdown="1">

# Backend Overview

## 1. Purpose

The PiWatch backend is the coordination and API layer of the edge-computing intrusion-detection system. It receives camera frames from the Raspberry Pi 4, validates and stores them, coordinates distributed preprocessing across Raspberry Pi 3 workers, invokes the YOLO inference service on the Raspberry Pi 5, creates events and alerts, and exposes the data required by the frontend, monitoring pages and Telegram workflow.

The backend is implemented with FastAPI and is deployed in the `edge-monitoring` Kubernetes namespace.

---

## 2. Current Deployment Status
    
The currently deployed production arrangement is:

| Component | Current runtime location | Kubernetes resource | Port |
|---|---|---|---:|
| FastAPI backend | Raspberry Pi 5 node `cloud` | `Deployment/backend` | `8000` |
| Backend external access | Kubernetes NodePort | `Service/backend` | `30080` |
| YOLO inference | Raspberry Pi 5 node `cloud` | `Deployment/inference` | `8001` |
| Image workers | Raspberry Pi 3 nodes | `Deployment/image-worker` | `8002` |
| SeaweedFS S3 gateway | K3s cluster | `Service/seaweedfs-s3` | `8333` |
| Prometheus | `monitoring` namespace | `Service/prometheus-kube-prometheus-prometheus` | `9090` |

The production backend still runs as one replica on the Pi5. A separate Pi3 backend canary was successfully validated using a compressed runtime-bundle design, but that HA design has not yet replaced the production backend.

> **Screenshot placeholder — current backend deployment**  
> Show the production backend, inference pod and worker pods with their assigned nodes.  
> Suggested filename: `assets/backend/backend-current-pods.png`

---

## 3. Main Backend Responsibilities

The backend performs the following tasks:

- validates uploaded JPEG and PNG frames;
- verifies upload size and optional SHA-256 checksums;
- generates or accepts a stable `capture_id`;
- stores raw evidence before inference;
- discovers healthy Pi3 worker endpoints;
- selects an image-splitting layout based on available workers;
- sends image tiles to workers and retries failed assignments;
- reconstructs the processed image;
- sends one reconstructed frame to the YOLO inference service;
- stores raw images, annotated images and JSON metadata in SeaweedFS;
- creates frame-level events and critical alerts;
- sends configured Telegram notifications;
- serves raw and annotated images to the frontend;
- exposes monitoring, Kubernetes, storage and model-information APIs;
- exports Prometheus metrics through `/metrics`.

---

## 4. Backend API Summary

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Backend process, local data directory and SQLite health check |
| `POST` | `/api/v1/frames` | Upload and process a camera frame |
| `GET` | `/api/v1/frames/{frame_id}` | Retrieve stored frame metadata |
| `GET` | `/api/v1/events` | List stored detection events |
| `GET` | `/api/v1/images/raw/{frame_id}` | Retrieve the original image |
| `GET` | `/api/v1/images/annotated/{frame_id}` | Retrieve the annotated image |
| `GET` | `/api/v1/alerts` | List alert records |
| `GET` | `/api/v1/monitoring/overview` | Return node metrics, charts and monitoring alerts |
| `GET` | `/api/v1/storage/status` | Check SeaweedFS buckets and storage status |
| `GET` | `/api/v1/kubernetes/pods` | Return pod and workload information |
| `GET` | `/api/v1/model/info` | Return model and dataset metadata |
| `GET` | `/metrics` | Prometheus metrics endpoint |

> **Screenshot placeholder — FastAPI API documentation**  
> Capture the `/docs` page showing the registered backend endpoints.  
> Suggested filename: `assets/backend/backend-swagger-docs.png`

---

## 5. Frame Upload Contract

The Pi4 sender submits a multipart request to:

```text
POST http://192.168.50.1:30080/api/v1/frames
```

A frame request can contain:

| Field | Description |
|---|---|
| `image` | JPEG or PNG image file |
| `sensor_node_id` | Camera node identity, for example `rpi4-camera-01` |
| `captured_at` | Capture timestamp |
| `sequence_number` | Optional sender sequence number |
| `camera_location` | Optional camera location |
| `capture_id` | Optional 32-character hexadecimal identity |
| `content_sha256` | Optional SHA-256 checksum |
| `upload_source` | `live`, `retry` or `manual` |

If `capture_id` is omitted, the backend generates a deterministic identity from the sensor, timestamp, sequence number and image checksum.

### Duplicate behaviour

With the current single production replica, the backend uses:

1. an in-process lock for simultaneous requests handled by that replica; and
2. stored frame metadata in SeaweedFS to recognize completed retries across restarts.

This provides reliable retry handling for the current deployment. In a future multi-replica deployment, two identical requests can still begin processing on different replicas at the same time. That duplicate risk was accepted for the current HA experiment and must not be described as strict cluster-wide exactly-once processing.

---

## 6. Distributed Image Processing

To improve scalability and demonstrate distributed edge computing, the backend performs image preprocessing across multiple Raspberry Pi 3 worker nodes before object detection.

After receiving a frame from the Raspberry Pi 4 camera, the backend determines how many healthy worker nodes are available. Based on this, it selects an appropriate image-splitting layout and divides the original frame into multiple overlapping tiles.

The tiles are then distributed to the available worker pods through the Kubernetes headless Service.

```text
Captured Image
        │
        ▼
FastAPI Backend
        │
        ▼
Split into image tiles
        │
        ▼
Distribute tiles to Pi3 workers
        │
        ▼
Parallel image preprocessing
        │
        ▼
Processed tiles returned
        │
        ▼
Image reconstruction
        │
        ▼
YOLO inference
```

The backend dynamically adjusts the number of tiles according to the number of available workers.

| Healthy Workers | Layout | Tiles |
|----------------|--------|------:|
| 8 or more | 4 × 2 | 8 |
| 6–7 | 3 × 2 | 6 |
| 4–5 | 2 × 2 | 4 |
| 2–3 | 2 × 1 | 2 |
| Fewer than 2 | Full image | 1 |

The overlapping regions between neighbouring tiles ensure that objects located near tile boundaries are preserved during reconstruction.

---

### Responsibilities of the Pi3 Worker Nodes

Each Raspberry Pi 3 runs a lightweight FastAPI worker service responsible only for image preprocessing.

The worker does **not** execute the YOLO model.

Instead, each worker receives one image tile from the backend, performs the configured preprocessing operation and returns the processed tile together with processing metadata.

The implemented preprocessing modes include:

- Identity processing
- CLAHE contrast enhancement
- Grayscale conversion

Each worker returns:

- processed image tile
- worker identifier
- checksum
- processing latency

The backend waits until all available workers respond, reconstructs the complete image from the processed tiles and forwards the reconstructed image to the dedicated YOLO inference service running on the Raspberry Pi 5.

This architecture distributes preprocessing across multiple Raspberry Pi 3 nodes while keeping the computationally intensive object detection centralized on the Raspberry Pi 5.
---

## 7. YOLO Inference

After reconstruction, the backend calls the cluster-internal inference service:

```text
http://inference.edge-monitoring.svc.cluster.local:8001
```

YOLO runs once on the reconstructed image. The Pi3 workers do not run separate YOLO models on individual tiles.

The inference response can contain:

- class name;
- confidence value and confidence percentage;
- bounding box coordinates;
- severity;
- inference latency;
- request round-trip latency;
- annotated JPEG bytes.

The current model classes are:

| Class | Event policy |
|---|---|
| `fire` | Critical alert candidate |
| `weapon` | Critical alert candidate |
| `person` | Informational event |
| `container` | Informational event |

> **Screenshot placeholder — inference success logs**  
> Show a backend request together with an inference `POST /infer 200 OK` log entry.  
> Suggested filename: `assets/backend/backend-inference-logs.png`

---

## 8. Events, Alerts and Telegram

A detected frame produces one frame-level event that contains the complete list of detections. This keeps Event History organized while preserving every detection associated with the frame.

Critical detections can additionally produce alert records. Telegram notification status is stored with the event and alert metadata, including:

- whether the message was sent;
- send timestamp;
- error text when delivery failed.

Live annotations and alerts are separate concepts. A future Live Streaming page can show bounding boxes for every processed frame, while Telegram remains limited to configured threat conditions.

---

## 9. Persistent Storage

The backend uses SeaweedFS through its S3-compatible gateway:

```text
http://seaweedfs-s3.seaweedfs.svc.cluster.local:8333
```

Configured buckets:

| Bucket | Stored content |
|---|---|
| `captured-images` | Raw and annotated images |
| `event-metadata` | Frame, detection, event and alert JSON |

The shared application evidence is therefore not stored only inside the backend container. Backend pod restarts do not remove the evidence saved in SeaweedFS.

The local `/data` directory currently contains a small SQLite file used for backend health initialization and checking. It is not the authoritative frame/event store. For Pi3 backend canaries, `/data` was safely provided as a pod-local `emptyDir`.

> **Screenshot placeholder — storage status API**  
> Capture `/api/v1/storage/status?refresh=true` showing the storage backend, bucket checks and available capacity.  
> Suggested filename: `assets/backend/backend-storage-status.png`

---

## 10. Monitoring Integration

The monitoring overview endpoint queries Prometheus for:

- node availability;
- CPU usage;
- memory usage;
- disk usage;
- temperature;
- network receive/transmit rates;
- load averages;
- uptime;
- time-series chart data.

Inside Kubernetes, the backend must use the internal Prometheus address:

```text
http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
```

Without an explicit `PROMETHEUS_URL`, the application defaults to `http://127.0.0.1:9090`. That address works only when Prometheus is in the same network namespace, so a Pi3 backend pod returns HTTP `200` with empty metrics and `Connection refused` debug messages until the internal service URL is configured.

> **Screenshot placeholder — monitoring overview response**  
> Capture a populated `/api/v1/monitoring/overview` response after setting the Kubernetes Prometheus service URL.  
> Suggested filename: `assets/backend/backend-monitoring-overview.png`

---

## 11. Kubernetes Access and RBAC

The backend uses the dedicated ServiceAccount:

```text
backend-kubernetes-reader
```

A namespaced Role and RoleBinding allow it to read pod information in `edge-monitoring`. This fixed the earlier `403 Forbidden` response from `/api/v1/kubernetes/pods`.

The backend should retain read-only permissions unless a future feature explicitly requires write access.

---

## 12. Container-Image Improvements

The original combined backend image was approximately `3.26 GB` because it was built from a root requirements file containing `ultralytics`, PyTorch-related inference dependencies, inference source files and model files.

The backend-only Dockerfile reduced the image to approximately `198 MB` by using `requirements/backend.txt` and excluding YOLO dependencies. However, new backend images still timed out during container creation on the Pi3 nodes because their K3s containerd storage is located inside the PXE/NFS root filesystem.

The successful workaround was a bundle-based image:

1. use the already-working `edge-worker:v1` image as the base;
2. install only missing backend dependencies in a builder stage;
3. compress the backend runtime into one `backend-runtime.tar.gz` file;
4. add only that archive to the final image;
5. extract it into a pod-local runtime directory when the container starts.

This design successfully started a real backend canary on `rpi3-01`, and the following checks worked:

- `/health`;
- `/docs`;
- `/api/v1/kubernetes/pods`;
- `/api/v1/storage/status`;
- `/api/v1/monitoring/overview` route execution.

> **Screenshot placeholder — Pi3 backend canary**  
> Show `backend-bundle-canary` in `1/1 Ready` state on `rpi3-01`.  
> Suggested filename: `assets/backend/backend-bundle-canary.png`

---

## 13. High-Availability Status

### Already available

- Kubernetes restarts failed backend containers.
- The worker stage can continue with fewer healthy Pi3 nodes.
- The backend Service can load-balance across multiple ready backend endpoints when more replicas are added.
- K3s ServiceLB and Traefik are already installed.
- A Pi3 backend canary has been validated successfully.

### Not yet complete

- Production still uses one backend replica on Pi5.
- The Pi3 backend has not yet been rolled out to all eight nodes.
- Inference still runs as one replica on Pi5.
- SeaweedFS and the external SSD depend on Pi5.
- The K3s control plane is one Pi5 server.
- Every Pi3 PXE/NFS root depends on Pi5.

The correct current statement is:

> PiWatch has worker-level fault tolerance, Kubernetes self-recovery and a validated Pi3 backend-canary design. It is not yet a fully highly available system because Pi5 remains a major single point of failure.

---

## 14. Backend Setup and Deployment

The backend is deployed from the Raspberry Pi 5, which acts as the K3s control-plane node. The following procedure describes the production deployment workflow.

### Step 1: Open the backend directory

From the project repository, move into the backend source directory:

```bash
cd ~/cloud/Edge-computing-intrusion-detection-system/edge-computing-monitoring-system/backend
```

### Step 2: Create the backend configuration

The Kubernetes configuration must provide the internal addresses used by the backend services. The important values are:

```env
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=http://seaweedfs-s3.seaweedfs.svc.cluster.local:8333
S3_CAPTURED_IMAGES_BUCKET=captured-images
S3_EVENT_METADATA_BUCKET=event-metadata
PROMETHEUS_URL=http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
INFERENCE_URL=http://inference.edge-monitoring.svc.cluster.local:8001
WORKER_SERVICE_HOST=image-worker-headless.edge-monitoring.svc.cluster.local
WORKER_SERVICE_PORT=8002
```

Non-sensitive settings belong in the backend ConfigMap. Credentials, tokens and other confidential values must be stored in a Kubernetes Secret rather than committed to Git.

Apply the backend configuration before deploying the application:

```bash
kubectl apply -f k8s/backend-configmap.yaml
kubectl apply -f k8s/backend-secret.yaml
```

### Step 3: Build the backend container image

Create a unique image tag so that each deployment can be identified and rolled back if required:

```bash
BACKEND_TAG="$(date +%Y%m%d-%H%M%S)"
docker build -t "edge-backend:${BACKEND_TAG}" .
```

The backend image contains the FastAPI application and backend-only Python dependencies. YOLO and its larger machine-learning dependencies remain in the separate inference image.

### Step 4: Import the image into K3s

K3s uses its own containerd image store. Import the newly built image before updating the Deployment:

```bash
docker save "edge-backend:${BACKEND_TAG}" \
  | sudo k3s ctr -n k8s.io images import -
```

Confirm that the image is available to K3s:

```bash
sudo k3s ctr -n k8s.io images list | grep edge-backend
```

### Step 5: Apply the Kubernetes resources

Create or update the ServiceAccount, read-only RBAC permissions, Deployment and Service:

```bash
kubectl apply -f k8s/backend-serviceaccount.yaml
kubectl apply -f k8s/backend-rbac.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/backend-service.yaml
```

The backend runs in the `edge-monitoring` namespace and is exposed externally through NodePort `30080`.

### Step 6: Deploy the new image version

Update the backend Deployment to use the image created in Step 3:

```bash
kubectl -n edge-monitoring set image deployment/backend \
  backend="edge-backend:${BACKEND_TAG}"
```

Wait for Kubernetes to complete the rollout:

```bash
kubectl -n edge-monitoring rollout status deployment/backend
```

The running backend pod and its assigned node can be viewed with:

```bash
kubectl -n edge-monitoring get pods -o wide
```

### Step 7: Access the backend

The production API is available through the Pi5 cluster address:

```text
http://192.168.50.1:30080
```

FastAPI generates interactive API documentation at:

```text
http://192.168.50.1:30080/docs
```

The frontend uses the same NodePort address as its backend base URL:

```env
VITE_API_BASE_URL=http://192.168.50.1:30080
```

### Step 8: Send frames from the Raspberry Pi 4

The Pi4 camera sender uploads captured images to the frame endpoint:

```text
POST http://192.168.50.1:30080/api/v1/frames
```

Each accepted frame follows the complete backend pipeline:

```text
Pi4 camera → FastAPI backend → Pi3 preprocessing workers → YOLO inference → SeaweedFS storage → frontend and Telegram
```

Raw images, annotated images and event metadata remain stored in SeaweedFS and can be retrieved through the backend API after processing.

</article>
