import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Cpu,
  ImageIcon,
  RefreshCcw,
  Send,
  ShieldAlert,
  User,
  Zap,
} from "lucide-react";
import "./LiveDetectionPage.css"
type Severity = "normal" | "warning" | "critical";
type ChunkStatus = "completed" | "failed" | "pending";

type Detection = {
  class_name: string;
  confidence: number;
};

type WorkerChunk = {
  chunk_id: number;
  worker_node: string;
  status: ChunkStatus;
  processing_ms: number;
};

type LiveEvent = {
  event_id: string;
  timestamp: string;
  camera: string;
  severity: Severity;
  telegram_status: "sent" | "skipped" | "failed" | "pending";
  raw_image_url: string | null;
  annotated_image_url: string | null;
  detections: Detection[];
  chunks_processed: number;
  total_chunks: number;
  workers: WorkerChunk[];
  storage_path: string;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const demoEvent: LiveEvent = {
  event_id: "evt_2f8a91",
  timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  camera: "Pi4 Camera",
  severity: "critical",
  telegram_status: "sent",
  raw_image_url: null,
  annotated_image_url: null,
  detections: [
    { class_name: "intruder", confidence: 0.94 },
    { class_name: "person", confidence: 0.88 },
  ],
  chunks_processed: 8,
  total_chunks: 8,
  workers: [
    { chunk_id: 1, worker_node: "pi3-worker-01", status: "completed", processing_ms: 42 },
    { chunk_id: 2, worker_node: "pi3-worker-02", status: "completed", processing_ms: 39 },
    { chunk_id: 3, worker_node: "pi3-worker-03", status: "completed", processing_ms: 45 },
    { chunk_id: 4, worker_node: "pi3-worker-04", status: "completed", processing_ms: 41 },
    { chunk_id: 5, worker_node: "pi3-worker-05", status: "completed", processing_ms: 47 },
    { chunk_id: 6, worker_node: "pi3-worker-06", status: "completed", processing_ms: 40 },
    { chunk_id: 7, worker_node: "pi3-worker-07", status: "completed", processing_ms: 43 },
    { chunk_id: 8, worker_node: "pi3-worker-08", status: "completed", processing_ms: 44 },
  ],
  storage_path: "s3://edge-sentinel-frames/2026/evt_2f8a91",
};

const recentFrames: LiveEvent[] = [
  demoEvent,
  {
    ...demoEvent,
    event_id: "evt_1d4c7b",
    timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    severity: "warning",
    detections: [{ class_name: "person", confidence: 0.79 }],
    telegram_status: "skipped",
  },
  {
    ...demoEvent,
    event_id: "evt_9a3e12",
    timestamp: new Date(Date.now() - 17 * 60 * 1000).toISOString(),
    severity: "critical",
    detections: [{ class_name: "fire", confidence: 0.82 }],
    telegram_status: "sent",
  },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

function getTopDetection(event: LiveEvent) {
  return event.detections.reduce((best, item) => {
    return item.confidence > best.confidence ? item : best;
  }, event.detections[0]);
}

function getDetectionIcon(className: string) {
  const name = className.toLowerCase();

  if (name.includes("person")) return <User size={22} />;
  if (name.includes("intruder") || name.includes("weapon")) return <ShieldAlert size={22} />;
  if (name.includes("fire") || name.includes("smoke")) return <Zap size={22} />;

  return <AlertTriangle size={22} />;
}

function normalizeEvent(data: any): LiveEvent {
  const detections: Detection[] = Array.isArray(data.detections)
    ? data.detections.map((item: any) => ({
        class_name: item.class_name || item.label || item.class || "unknown",
        confidence: Number(item.confidence ?? 0),
      }))
    : [
        {
          class_name: data.event_type || data.detected_class || "unknown",
          confidence: Number(data.confidence ?? 0),
        },
      ];

  return {
    event_id: data.event_id || data.id || "latest_event",
    timestamp: data.timestamp || data.created_at || new Date().toISOString(),
    camera: data.camera || data.node_name || data.node || "Pi4 Camera",
    severity: data.severity || "normal",
    telegram_status:
      data.telegram_status ||
      (data.telegram_sent === true ? "sent" : "skipped"),
    raw_image_url:
      data.raw_image_url ||
      (data.raw_image_id
        ? `${API_BASE_URL}/api/v1/images/raw/${data.raw_image_id}`
        : null),
    annotated_image_url:
      data.annotated_image_url ||
      (data.annotated_image_id
        ? `${API_BASE_URL}/api/v1/images/annotated/${data.annotated_image_id}`
        : null),
    detections,
    chunks_processed: data.chunks_processed ?? 8,
    total_chunks: data.total_chunks ?? 8,
    workers: data.workers || demoEvent.workers,
    storage_path: data.storage_path || data.storage || "s3://edge-sentinel-frames/latest",
  };
}

function DetectionFrame({
  title,
  subtitle,
  imageUrl,
  mode,
  event,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  mode: "raw" | "annotated";
  event: LiveEvent;
}) {
  const topDetection = getTopDetection(event);

  return (
    <div className="live-frame-card">
      <div className="live-frame-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        {mode === "raw" ? (
          <span className="live-badge live">LIVE</span>
        ) : (
          <span className={`live-badge ${event.severity}`}>{event.severity}</span>
        )}
      </div>

      <div className="live-frame-box">
        {imageUrl ? (
          <img src={imageUrl} alt={title} />
        ) : (
          <div className="live-frame-placeholder">
            <ImageIcon size={42} />
          </div>
        )}

        <span className="live-camera-label">
          {event.camera.toUpperCase()} · {mode === "raw" ? "RAW" : "ANNOTATED"}
        </span>

        <span className="live-rec-dot">
          <span />
          REC
        </span>

        {mode === "annotated" && (
          <>
            <div className="bbox bbox-danger">
              <span>
                {topDetection.class_name.toUpperCase()} ·{" "}
                {Math.round(topDetection.confidence * 100)}%
              </span>
            </div>

            {event.detections[1] && (
              <div className="bbox bbox-warning">
                <span>
                  {event.detections[1].class_name.toUpperCase()} ·{" "}
                  {Math.round(event.detections[1].confidence * 100)}%
                </span>
              </div>
            )}
          </>
        )}

        <div className="live-frame-footer">
          <strong>{formatDateTime(event.timestamp)}</strong>
          <span>1920×1080 · 30fps</span>
        </div>
      </div>
    </div>
  );
}

export function LiveDetectionPage() {
  const [event, setEvent] = useState<LiveEvent>(demoEvent);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  useEffect(() => {
    async function loadLatestEvent() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/events/latest`);

        if (!response.ok) {
          throw new Error("Latest event API not available");
        }

        const data = await response.json();
        setEvent(normalizeEvent(data));
        setApiNotice(null);
      } catch {
        setEvent(demoEvent);
        setApiNotice("Showing demo data because the live detection API is not available yet.");
      }
    }

    loadLatestEvent();
  }, []);

  const topDetection = useMemo(() => getTopDetection(event), [event]);

  return (
    <section className="live-detection-page">
      <div className="live-page-header">
        <div>
          <p>STREAMING · PI4 CAMERA</p>
          <h1>Live Detection</h1>
          <span>
            Raw and YOLO-annotated frames from the Pi4 camera, processed across
            Pi3 worker nodes.
          </span>
        </div>

        <div className="live-actions">
          <button>
            <Camera size={17} />
            Pi4 Camera
          </button>

          <button className="primary">
            <RefreshCcw size={17} />
            Force capture
          </button>
        </div>
      </div>

      {apiNotice && <div className="live-api-notice">{apiNotice}</div>}

      <div className="live-frame-grid">
        <DetectionFrame
          title="Original frame"
          subtitle="GET /api/v1/images/raw/{id}"
          imageUrl={event.raw_image_url}
          mode="raw"
          event={event}
        />

        <DetectionFrame
          title="YOLO-annotated"
          subtitle="GET /api/v1/images/annotated/{id}"
          imageUrl={event.annotated_image_url}
          mode="annotated"
          event={event}
        />
      </div>

      <div className="live-info-grid">
        <div className="live-panel detected-panel">
          <div className="live-panel-header">
            <h2>Detected classes</h2>
          </div>

          <div className="detected-grid">
            {event.detections.map((detection) => (
              <div className="detected-card" key={detection.class_name}>
                <div className="detected-icon">
                  {getDetectionIcon(detection.class_name)}
                </div>

                <div className="detected-content">
                  <div>
                    <h3>{detection.class_name}</h3>
                    <strong>{Math.round(detection.confidence * 100)}%</strong>
                  </div>

                  <div className="confidence-track">
                    <span style={{ width: `${detection.confidence * 100}%` }} />
                  </div>

                  <p>confidence</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="live-panel metadata-panel">
          <div className="live-panel-header">
            <h2>Event metadata</h2>
          </div>

          <div className="metadata-list">
            <div>
              <span>Event ID</span>
              <strong>{event.event_id}</strong>
            </div>

            <div>
              <span>Timestamp</span>
              <strong>{formatDateTime(event.timestamp)}</strong>
            </div>

            <div>
              <span>Camera</span>
              <strong>{event.camera}</strong>
            </div>

            <div>
              <span>Processing</span>
              <strong>
                {event.chunks_processed}/{event.total_chunks} chunks
              </strong>
            </div>

            <div>
              <span>Severity</span>
              <strong className={`metadata-severity ${event.severity}`}>
                {event.severity}
              </strong>
            </div>

            <div>
              <span>Telegram</span>
              <strong className="metadata-telegram">
                {event.telegram_status}
              </strong>
            </div>

            <div>
              <span>Storage</span>
              <strong>{event.storage_path}</strong>
            </div>

            <div>
              <span>Received</span>
              <strong>{formatRelativeTime(event.timestamp)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="live-panel">
        <div className="live-panel-header">
          <div>
            <h2>Pi3 worker chunk processing</h2>
            <p>Pi4 frame split into 8 chunks and distributed to worker nodes.</p>
          </div>
        </div>

        <div className="worker-chunk-grid">
          {event.workers.map((worker) => (
            <div className="worker-chunk-card" key={worker.chunk_id}>
              <div>
                <span>Chunk {worker.chunk_id}</span>
                <strong>{worker.worker_node}</strong>
              </div>

              <div className={`worker-status ${worker.status}`}>
                <CheckCircle2 size={15} />
                {worker.status}
              </div>

              <p>{worker.processing_ms} ms</p>
            </div>
          ))}
        </div>
      </div>

      <div className="live-panel recent-panel">
        <div className="live-panel-header">
          <div>
            <h2>Recent processed frames</h2>
            <p>Latest Pi4 camera frames after distributed processing.</p>
          </div>
        </div>

        <div className="recent-frame-grid">
          {recentFrames.map((frame) => {
            const top = getTopDetection(frame);

            return (
              <div className="recent-frame-card" key={frame.event_id}>
                <div className="recent-preview">
                  <span className="live-camera-label">PI4 CAMERA</span>
                  <span className="live-rec-dot">
                    <span />
                    REC
                  </span>

                  <div className={frame.severity === "critical" ? "mini-box danger" : "mini-box warning"}>
                    <span>
                      {top.class_name.toUpperCase()} · {Math.round(top.confidence * 100)}%
                    </span>
                  </div>
                </div>

                <div className="recent-frame-footer">
                  <strong>{frame.event_id}</strong>
                  <span>{formatRelativeTime(frame.timestamp)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
