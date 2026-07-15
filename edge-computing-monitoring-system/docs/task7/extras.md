##### if want to mention
### Data Flow

The image processing pipeline is shown below.

```
Raspberry Pi AI Camera
        │
        ▼
Raspberry Pi 4
(Image Capture)
        │
 JPEG + Metadata
        ▼
Backend Service
        │
        ▼
FastAPI + YOLO
        │
 ├── Object Detection
 ├── Event Generation
 ├── Alert Generation
 ├── Image Annotation
 └── Storage
        │
        ├────────► SeaweedFS
        ├────────► Telegram Bot API
        └────────► Frontend Dashboard
```

### Monitoring Flow

```
All Raspberry Pi Nodes
        │
 Node Exporter
        │
        ▼
 Prometheus
        │
        ▼
 Grafana
```