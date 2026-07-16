import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ImageIcon,
  RefreshCcw,
  ShieldAlert,
  User,
  Zap,
} from "lucide-react";
import {
  getAnnotatedImageUrl,
  getEvents,
  getLatestEvent,
  getRawImageUrl,
  type EventItem,
  type LatestEventResponse,
} from "../../services/api";
import "./LiveDetectionPage.css";

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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelativeTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

function extractLatestEvent(response: LatestEventResponse): EventItem | null {
  if ("event" in response && response.event) {
    return response.event;
  }

  if ("latest_event" in response && response.latest_event) {
    return response.latest_event;
  }

  if ("data" in response && response.data) {
    return response.data;
  }

  return response as EventItem;
}

function normalizeDetections(data: EventItem): Detection[] {
  if (Array.isArray(data.detections) && data.detections.length > 0) {
    return data.detections.map((item) => ({
      class_name:
        item.class_name || item.label || item.class || item.name || "unknown",
      confidence: Number(item.confidence ?? 0),
    }));
  }

  if (Array.isArray(data.class_names) && data.class_names.length > 0) {
    return data.class_names.map((className) => ({
      class_name: className,
      confidence: Number(data.confidence ?? 0),
    }));
  }

  if (Array.isArray(data.classes) && data.classes.length > 0) {
    return data.classes.map((className) => ({
      class_name: className,
      confidence: Number(data.confidence ?? 0),
    }));
  }

  return [
    {
      class_name:
        data.event_type ||
        data.threat_type ||
        data.class_name ||
        data.label ||
        data.detected_class ||
        "unknown",
      confidence: Number(data.confidence ?? 0),
    },
  ];
}

function normalizeSeverity(
  severityValue: string | undefined,
  detections: Detection[],
): Severity {
  const severity = String(severityValue || "").toLowerCase();

  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  if (severity === "normal") return "normal";

  const classNames = detections.map((item) => item.class_name.toLowerCase());

  if (
    classNames.some((name) =>
      ["weapon", "fire", "smoke", "intruder"].includes(name),
    )
  ) {
    return "critical";
  }

  if (classNames.some((name) => ["container", "liquid_spill"].includes(name))) {
    return "warning";
  }

  return "normal";
}

function normalizeTelegramStatus(
  statusValue: string | undefined,
  telegramSent: boolean | undefined,
): LiveEvent["telegram_status"] {
  const status = String(statusValue || "").toLowerCase();

  if (status === "sent") return "sent";
  if (status === "skipped") return "skipped";
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";

  if (telegramSent === true) return "sent";
  if (telegramSent === false) return "skipped";

  return "pending";
}

function normalizeWorkers(data: EventItem): WorkerChunk[] {
  const sourceWorkers = data.workers || data.chunks;

  if (Array.isArray(sourceWorkers) && sourceWorkers.length > 0) {
    return sourceWorkers.map((worker, index) => ({
      chunk_id: Number(worker.chunk_id ?? index + 1),
      worker_node:
        worker.worker_node ||
        worker.node ||
        `pi3-worker-${String(index + 1).padStart(2, "0")}`,
      status:
        worker.status === "failed"
          ? "failed"
          : worker.status === "pending"
            ? "pending"
            : "completed",
      processing_ms: Number(worker.processing_ms ?? 0),
    }));
  }

  const totalChunks = Number(data.total_chunks ?? 8);
  const chunksProcessed = Number(data.chunks_processed ?? totalChunks);

  return Array.from({ length: totalChunks }, (_, index) => ({
    chunk_id: index + 1,
    worker_node: `pi3-worker-${String(index + 1).padStart(2, "0")}`,
    status: index < chunksProcessed ? "completed" : "pending",
    processing_ms: 0,
  }));
}

function normalizeLiveEvent(data: EventItem, index = 0): LiveEvent {
  const detections = normalizeDetections(data);

  const rawImageUrl =
    data.raw_image_url ||
    data.raw_url ||
    (data.raw_image_id !== undefined && data.raw_image_id !== null
      ? getRawImageUrl(data.raw_image_id)
      : null);

  const annotatedImageUrl =
    data.annotated_image_url ||
    data.annotated_url ||
    (data.annotated_image_id !== undefined && data.annotated_image_id !== null
      ? getAnnotatedImageUrl(data.annotated_image_id)
      : null);

  const totalChunks = Number(data.total_chunks ?? 8);
  const chunksProcessed = Number(data.chunks_processed ?? totalChunks);

  return {
    event_id: String(data.event_id || data.id || `event_${index + 1}`),
    timestamp:
      data.timestamp || data.created_at || data.time || new Date().toISOString(),
    camera:
      data.camera ||
      data.node_name ||
      data.node ||
      data.sensor_node_id ||
      "Pi4 Camera",
    severity: normalizeSeverity(data.severity, detections),
    telegram_status: normalizeTelegramStatus(
      data.telegram_status,
      data.telegram_sent,
    ),
    raw_image_url: rawImageUrl,
    annotated_image_url: annotatedImageUrl,
    detections,
    chunks_processed: chunksProcessed,
    total_chunks: totalChunks,
    workers: normalizeWorkers(data),
    storage_path:
      data.storage_path ||
      data.storage ||
      "Stored by backend image/event pipeline",
  };
}

function getTopDetection(event: LiveEvent): Detection {
  const fallback = {
    class_name: "unknown",
    confidence: 0,
  };

  if (event.detections.length === 0) {
    return fallback;
  }

  return event.detections.reduce((best, item) => {
    return item.confidence > best.confidence ? item : best;
  }, event.detections[0] || fallback);
}

function getDetectionIcon(className: string) {
  const name = className.toLowerCase();

  if (name.includes("person")) return <User size={22} />;

  if (name.includes("intruder") || name.includes("weapon")) {
    return <ShieldAlert size={22} />;
  }

  if (name.includes("fire") || name.includes("smoke")) {
    return <Zap size={22} />;
  }

  return <AlertTriangle size={22} />;
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
          <span className={`live-badge ${event.severity}`}>
            {event.severity}
          </span>
        )}
      </div>

      <div className="live-frame-box">
        {imageUrl ? (
          <img src={imageUrl} alt={title} />
        ) : (
          <div className="live-frame-placeholder">
            <ImageIcon size={42} />
            <span>No image returned by backend</span>
          </div>
        )}

        <span className="live-camera-label">
          {event.camera.toUpperCase()} · {mode === "raw" ? "RAW" : "ANNOTATED"}
        </span>

        <span className="live-rec-dot">
          <span />
          REC
        </span>

        {mode === "annotated" && imageUrl && (
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
          <span>Pi4 camera frame</span>
        </div>
      </div>
    </div>
  );
}

export function LiveDetectionPage() {
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [recentFrames, setRecentFrames] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const loadLiveData = useCallback(async () => {
    try {
      setLoading(true);
      setApiError(null);

      const latestResponse = await getLatestEvent();
      const latestEvent = extractLatestEvent(latestResponse);

      if (!latestEvent) {
        setEvent(null);
        setRecentFrames([]);
        return;
      }

      setEvent(normalizeLiveEvent(latestEvent));

      const recentResponse = await getEvents({ limit: 6 });
      const recentEvents = Array.isArray(recentResponse.events)
        ? recentResponse.events
        : [];

      setRecentFrames(recentEvents.map(normalizeLiveEvent));
    } catch (error) {
      console.error("Live detection API error:", error);

      setEvent(null);
      setRecentFrames([]);

      setApiError(
        error instanceof Error
          ? error.message
          : "Failed to load live detection data from backend.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLiveData();

    const intervalId = window.setInterval(() => {
      void loadLiveData();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadLiveData]);

  const topDetection = useMemo(() => {
    if (!event) return null;
    return getTopDetection(event);
  }, [event]);

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
          <button type="button">
            <Camera size={17} />
            Pi4 Camera
          </button>

          <button
            className="primary"
            type="button"
            onClick={() => void loadLiveData()}
          >
            <RefreshCcw size={17} />
            Refresh latest
          </button>
        </div>
      </div>

      {apiError && <div className="live-api-notice">{apiError}</div>}

      {loading && !event && (
        <div className="live-panel">
          <div className="live-panel-header">
            <h2>Loading live detection data from backend...</h2>
          </div>
        </div>
      )}

      {!loading && !event && (
        <div className="live-panel">
          <div className="live-panel-header">
            <div>
              <h2>No live detection event found</h2>
              <p>
                Backend returned no latest event. Capture a frame from Pi4 and
                check /api/v1/events/latest.
              </p>
            </div>
          </div>
        </div>
      )}

      {event && (
        <>
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
                {event.detections.map((detection, index) => (
                  <div
                    className="detected-card"
                    key={`${detection.class_name}-${index}`}
                  >
                    <div className="detected-icon">
                      {getDetectionIcon(detection.class_name)}
                    </div>

                    <div className="detected-content">
                      <div>
                        <h3>{detection.class_name}</h3>
                        <strong>
                          {Math.round(detection.confidence * 100)}%
                        </strong>
                      </div>

                      <div className="confidence-track">
                        <span
                          style={{
                            width: `${Math.min(
                              Math.max(detection.confidence * 100, 0),
                              100,
                            )}%`,
                          }}
                        />
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

                <div>
                  <span>Top detection</span>
                  <strong>
                    {topDetection
                      ? `${topDetection.class_name} · ${Math.round(
                          topDetection.confidence * 100,
                        )}%`
                      : "None"}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="live-panel">
            <div className="live-panel-header">
              <div>
                <h2>Pi3 worker chunk processing</h2>
                <p>
                  Pi4 frame split into 8 chunks and distributed to worker nodes.
                </p>
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

                  <p>
                    {worker.processing_ms > 0
                      ? `${worker.processing_ms} ms`
                      : "N/A"}
                  </p>
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
                      {frame.annotated_image_url ? (
                        <img
                          src={frame.annotated_image_url}
                          alt={frame.event_id}
                        />
                      ) : null}

                      <span className="live-camera-label">PI4 CAMERA</span>

                      <div
                        className={
                          frame.severity === "critical"
                            ? "mini-box danger"
                            : "mini-box warning"
                        }
                      >
                        <span>
                          {top.class_name.toUpperCase()} ·{" "}
                          {Math.round(top.confidence * 100)}%
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

              {recentFrames.length === 0 && (
                <div className="recent-frame-empty">
                  No recent frames returned by backend.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
