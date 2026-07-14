# Execution Flow

This page describes how PiWatch processes an image from capture to visualization and alert generation.

---

## Overview

The processing pipeline consists of six stages:

1. Image Capture
2. Image Transmission
3. AI Inference
4. Storage
5. Alert Generation
6. Dashboard Visualization

---

## Step 1 – Image Capture

The Raspberry Pi AI Camera is connected directly to the Raspberry Pi 4 through the CSI interface.

The Pi4 continuously captures frames and performs lightweight preprocessing before transmitting them to the backend.

Captured data includes:

- JPEG image
- Timestamp
- Camera identifier
- Optional metadata

The Pi4 does not perform object detection. Instead, it forwards the captured image to the Kubernetes backend.

```
AI Camera
    │
    ▼
Raspberry Pi 4
(Image Capture)
```

---

## Step 2 – Image Transmission

The Raspberry Pi 4 sends the captured image over the local Gigabit Ethernet network.

The request is sent to the Backend Service running inside the Kubernetes cluster.

```
Pi4
    │
JPEG + Metadata
    │
    ▼
Backend Service
```

---

## Step 3 – Kubernetes Routing

The Backend Service forwards the request to the FastAPI backend pod.

```
Backend Service
        │
        ▼
FastAPI + YOLO Pod
```

The backend receives the uploaded image and begins the inference pipeline.

---

## Step 4 – AI Inference Pipeline

The backend performs several processing stages.

```
Uploaded Image
        │
        ▼
YOLO Inference
        │
        ├── Object Detection
        ├── Confidence Filtering
        ├── Bounding Box Generation
        ├── Image Annotation
        ├── Event Creation
        └── Alert Generation
```

The inference produces:

- detected object classes
- confidence scores
- bounding boxes
- annotated image
- event record

---

## Step 5 – Persistent Storage

The generated data is stored using SeaweedFS.

Stored artifacts include:

- Original image
- Annotated image
- Detection metadata
- Event records

SeaweedFS stores data on the external SSD connected to the Raspberry Pi 5.

```
FastAPI
    │
    ▼
SeaweedFS
    │
    ▼
SSD
```

Critical data may also be replicated to the backup storage attached to the Raspberry Pi 4.

---

## Step 6 – Alert Generation

If a detected object matches a configured alert rule, the backend generates a notification.

Examples include:

- Person detected
- Fire detected
- Weapon detected
- Container detected

The backend sends a message through the Telegram Bot API.

```
Detection Event
        │
        ▼
Alert Engine
        │
        ▼
Telegram Bot API
        │
        ▼
User Notification
```

---

## Step 7 – Dashboard Update

After processing completes, the backend updates the frontend.

The dashboard retrieves:

- Latest detections
- Annotated images
- Event history
- Alert information
- Monitoring metrics

```
Backend API
      │
      ▼
Frontend Dashboard
      │
      ▼
Users
```

---

## Monitoring Pipeline

Every Raspberry Pi continuously exports hardware metrics.

```
Raspberry Pi Nodes
        │
Node Exporter
        │
        ▼
Prometheus
        │
        ▼
Grafana
        │
        ▼
Dashboard
```

Collected metrics include:

- CPU utilization
- Memory usage
- Network traffic
- Temperature
- Disk usage

These metrics help monitor the health of the cluster.

---

## End-to-End Processing Flow

```
AI Camera
    │
    ▼
Raspberry Pi 4
(Image Capture)
    │
JPEG Image + Metadata
    ▼
Backend Service
    ▼
FastAPI + YOLO
    ├── Object Detection
    ├── Image Annotation
    ├── Event Generation
    ├── Alert Generation
    └── Storage
          │
          ├────────► SeaweedFS
          │              │
          │              ▼
          │             SSD
          │
          ├────────► Telegram Bot API
          │
          └────────► Frontend Dashboard
```

---

## Request Lifecycle Summary

| Stage | Component | Output |
|--------|-----------|--------|
| 1 | Raspberry Pi AI Camera | Raw image |
| 2 | Raspberry Pi 4 | JPEG image + metadata |
| 3 | Backend Service | Kubernetes routing |
| 4 | FastAPI + YOLO | Detection results |
| 5 | SeaweedFS | Persistent storage |
| 6 | Telegram Bot | Alert notification |
| 7 | React Dashboard | User visualization |