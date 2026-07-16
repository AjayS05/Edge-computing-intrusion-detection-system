import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Bot,
  Camera,
  CheckCircle2,
  Cpu,
  GitMerge,
  Send,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import "./TelegramPage.css";
type ServiceStatus = "online" | "offline" | "unknown";
type Severity = "normal" | "warning" | "critical";
type DeliveryStatus = "sent" | "failed" | "skipped" | "retrying" | "sent_with_warning";
type ChunkStatus = "completed" | "failed" | "pending" | "retrying";

type TelegramStatus = {
  status: ServiceStatus;
  mode: "webhook" | "long_polling" | "unknown";
  bot_name: string;
  subscribers: number;
  sent_today: number;
  failed_today: number;
  retries_24h: number;
  average_latency_ms: number;
  last_alert_sent: string | null;
  last_error?: string | null;
};

type WorkerChunk = {
  chunk_id: number;
  worker_node: string;
  status: ChunkStatus;
  processing_ms: number | null;
};

type TelegramDelivery = {
  event_id: string;
  camera: string;
  frame_id: string;
  event_type: string;
  severity: Severity;
  confidence: number;
  chunks_processed: number;
  total_chunks: number;
  telegram_status: DeliveryStatus;
  timestamp: string;
  reason?: string | null;
  workers: WorkerChunk[];
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const mockStatus: TelegramStatus = {
  status: "online",
  mode: "long_polling",
  bot_name: "@edge_sentinel_bot",
  subscribers: 6,
  sent_today: 12,
  failed_today: 1,
  retries_24h: 2,
  average_latency_ms: 210,
  last_alert_sent: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
  last_error: null,
};

const mockDeliveries: TelegramDelivery[] = [
  {
    event_id: "evt_2f8a91",
    camera: "Pi4 Camera",
    frame_id: "frame_24817",
    event_type: "Intruder",
    severity: "critical",
    confidence: 0.94,
    chunks_processed: 8,
    total_chunks: 8,
    telegram_status: "sent",
    timestamp: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    reason: null,
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
  },
  {
    event_id: "evt_1d4c7b",
    camera: "Pi4 Camera",
    frame_id: "frame_24811",
    event_type: "Weapon",
    severity: "critical",
    confidence: 0.88,
    chunks_processed: 8,
    total_chunks: 8,
    telegram_status: "sent",
    timestamp: new Date(Date.now() - 13 * 60 * 1000).toISOString(),
    reason: null,
    workers: [],
  },
  {
    event_id: "evt_9a3e12",
    camera: "Pi4 Camera",
    frame_id: "frame_24805",
    event_type: "Smoke",
    severity: "warning",
    confidence: 0.76,
    chunks_processed: 7,
    total_chunks: 8,
    telegram_status: "sent_with_warning",
    timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    reason: "One worker chunk failed, merged result still detected threat",
    workers: [],
  },
  {
    event_id: "evt_5c7f04",
    camera: "Pi4 Camera",
    frame_id: "frame_24799",
    event_type: "Person",
    severity: "normal",
    confidence: 0.91,
    chunks_processed: 8,
    total_chunks: 8,
    telegram_status: "skipped",
    timestamp: new Date(Date.now() - 39 * 60 * 1000).toISOString(),
    reason: "Normal person detection, no threat alert required",
    workers: [],
  },
];

function formatRelativeTime(value: string | null) {
  if (!value) return "N/A";

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDateTime(value: string | null) {
  if (!value) return "N/A";

  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusClass(status: string) {
  if (status === "online" || status === "sent" || status === "completed") {
    return "success";
  }

  if (
    status === "warning" ||
    status === "unknown" ||
    status === "retrying" ||
    status === "sent_with_warning" ||
    status === "skipped"
  ) {
    return "warning";
  }

  if (status === "offline" || status === "failed" || status === "critical") {
    return "danger";
  }

  return "muted";
}

function deliveryLabel(status: DeliveryStatus) {
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  if (status === "retrying") return "Retrying";
  if (status === "sent_with_warning") return "Sent with warning";
  return status;
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className={`telegram-pill ${statusClass(value)}`}>
      {value === "sent" || value === "completed" || value === "online" ? (
        <CheckCircle2 size={14} />
      ) : value === "failed" || value === "offline" ? (
        <XCircle size={14} />
      ) : (
        <AlertTriangle size={14} />
      )}
      {value.replace("_", " ").toUpperCase()}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "blue";
}) {
  return (
    <div className="telegram-stat-card">
      <div>
        <p>{label}</p>
        <h3 className={tone}>{value}</h3>
        {sub && <span>{sub}</span>}
      </div>
      <div className={`telegram-stat-icon ${tone}`}>{icon}</div>
    </div>
  );
}

export function TelegramPage() {
  const [status, setStatus] = useState<TelegramStatus>(mockStatus);
  const [deliveries, setDeliveries] = useState<TelegramDelivery[]>(mockDeliveries);
  const [isLoading, setIsLoading] = useState(true);
  const [apiWarning, setApiWarning] = useState<string | null>(null);

  useEffect(() => {
    async function loadTelegramData() {
      try {
        const [statusResponse, deliveriesResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/telegram/status`),
          fetch(`${API_BASE_URL}/api/v1/telegram/deliveries`),
        ]);

        if (!statusResponse.ok || !deliveriesResponse.ok) {
          throw new Error("Telegram API not ready");
        }

        const statusData = await statusResponse.json();
        const deliveriesData = await deliveriesResponse.json();

        setStatus(statusData);
        setDeliveries(deliveriesData);
        setApiWarning(null);
      } catch {
        setStatus(mockStatus);
        setDeliveries(mockDeliveries);
        setApiWarning("Showing demo data because Telegram backend endpoints are not available yet.");
      } finally {
        setIsLoading(false);
      }
    }

    loadTelegramData();
  }, []);

  const latestDelivery = deliveries[0];

  const workers = useMemo(() => {
    if (latestDelivery?.workers?.length) return latestDelivery.workers;
    return mockDeliveries[0].workers;
  }, [latestDelivery]);

  const latestMessage = latestDelivery
    ? `🚨 ${latestDelivery.severity.toUpperCase()} THREAT ALERT

Event: ${latestDelivery.event_type} detected
Camera Node: ${latestDelivery.camera}
Frame ID: ${latestDelivery.frame_id}
Processing: ${latestDelivery.chunks_processed}/${latestDelivery.total_chunks} chunks completed
Worker Nodes: Pi3 worker cluster
Confidence: ${Math.round(latestDelivery.confidence * 100)}%
Time: ${formatDateTime(latestDelivery.timestamp)}

Evidence:
Raw Frame: Available
Annotated Frame: Available
Event ID: ${latestDelivery.event_id}`
    : "No Telegram message available yet.";

  return (
    <section className="telegram-page">
      <div className="telegram-page-header">
        <p>TELEGRAM · DISTRIBUTED ALERT DELIVERY</p>
        <h1>Telegram Bot</h1>
        <span>
          Delivers alerts when the Pi4 camera frame is processed across Pi3 worker
          nodes and a threat is detected.
        </span>
      </div>

      {apiWarning && <div className="telegram-api-warning">{apiWarning}</div>}

      {isLoading && <div className="telegram-api-warning">Loading Telegram status...</div>}

      <div className="telegram-stat-grid">
        <StatCard
          label="Bot status"
          value={status.status}
          sub={status.mode.replace("_", " ")}
          icon={<Bot size={24} />}
          tone={status.status === "online" ? "success" : "danger"}
        />

        <StatCard
          label="Sent today"
          value={status.sent_today}
          sub="Threat + health alerts"
          icon={<Send size={24} />}
          tone="success"
        />

        <StatCard
          label="Failed today"
          value={status.failed_today}
          sub={`${status.retries_24h} retries in 24h`}
          icon={<XCircle size={24} />}
          tone={status.failed_today > 0 ? "warning" : "success"}
        />

        <StatCard
          label="Subscribers"
          value={status.subscribers}
          sub="Team members"
          icon={<Users size={24} />}
          tone="blue"
        />
      </div>

      <div className="telegram-main-grid">
        <div className="telegram-panel">
          <div className="telegram-panel-header">
            <h2>Bot status</h2>
          </div>

          <div className="telegram-status-list">
            <div>
              <span>Status</span>
              <StatusPill value={status.status} />
            </div>

            <div>
              <span>Bot</span>
              <strong>{status.bot_name}</strong>
            </div>

            <div>
              <span>Last alert</span>
              <strong>{formatRelativeTime(status.last_alert_sent)}</strong>
            </div>

            <div>
              <span>Avg latency</span>
              <strong>{status.average_latency_ms} ms</strong>
            </div>

            <div>
              <span>Retries 24h</span>
              <strong>{status.retries_24h}</strong>
            </div>
          </div>
        </div>

        <div className="telegram-panel large">
          <div className="telegram-panel-header">
            <h2>Last Telegram message preview</h2>
          </div>

          <div className="telegram-message-preview">
            <div className="telegram-avatar">
              <Bot size={26} />
            </div>

            <div>
              <div className="telegram-message-title">
                <strong>Edge Sentinel</strong>
                <span>{formatRelativeTime(latestDelivery?.timestamp ?? null)}</span>
              </div>

              <pre>{latestMessage}</pre>
            </div>
          </div>
        </div>
      </div>

      <div className="telegram-main-grid">
        <div className="telegram-panel">
          <div className="telegram-panel-header">
            <h2>Distributed frame processing</h2>
          </div>

          <div className="telegram-processing-flow">
            <div>
              <Camera size={22} />
              <span>Pi4 Camera</span>
            </div>

            <div>
              <GitMerge size={22} />
              <span>Split into 8 chunks</span>
            </div>

            <div>
              <Cpu size={22} />
              <span>Processed by Pi3 workers</span>
            </div>

            <div>
              <ShieldAlert size={22} />
              <span>Threat result merged</span>
            </div>

            <div>
              <Bell size={22} />
              <span>Telegram alert sent</span>
            </div>
          </div>
        </div>

        <div className="telegram-panel large">
          <div className="telegram-panel-header">
            <h2>Latest frame result</h2>
          </div>

          <div className="telegram-frame-summary">
            <div>
              <span>Frame ID</span>
              <strong>{latestDelivery?.frame_id ?? "N/A"}</strong>
            </div>

            <div>
              <span>Camera source</span>
              <strong>{latestDelivery?.camera ?? "Pi4 Camera"}</strong>
            </div>

            <div>
              <span>Chunks processed</span>
              <strong>
                {latestDelivery?.chunks_processed ?? 0}/{latestDelivery?.total_chunks ?? 8}
              </strong>
            </div>

            <div>
              <span>Detection</span>
              <strong>{latestDelivery?.event_type ?? "No event"}</strong>
            </div>

            <div>
              <span>Confidence</span>
              <strong>
                {latestDelivery ? `${Math.round(latestDelivery.confidence * 100)}%` : "N/A"}
              </strong>
            </div>

            <div>
              <span>Telegram</span>
              <StatusPill value={latestDelivery?.telegram_status ?? "unknown"} />
            </div>
          </div>
        </div>
      </div>

      <div className="telegram-panel">
        <div className="telegram-panel-header">
          <h2>Pi3 worker chunk status</h2>
          <span>Latest processed frame</span>
        </div>

        <div className="telegram-worker-grid">
          {workers.map((worker) => (
            <div className="telegram-worker-card" key={worker.chunk_id}>
              <div>
                <span>Chunk {worker.chunk_id}</span>
                <strong>{worker.worker_node}</strong>
              </div>

              <StatusPill value={worker.status} />

              <small>
                {worker.processing_ms !== null ? `${worker.processing_ms} ms` : "N/A"}
              </small>
            </div>
          ))}
        </div>
      </div>

      <div className="telegram-main-grid">
        <div className="telegram-panel large">
          <div className="telegram-panel-header">
            <h2>Per-event Telegram delivery</h2>
          </div>

          <div className="telegram-table-wrap">
            <table className="telegram-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Camera</th>
                  <th>Chunks</th>
                  <th>Threat</th>
                  <th>Confidence</th>
                  <th>Telegram</th>
                  <th>When</th>
                </tr>
              </thead>

              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.event_id}>
                    <td>{delivery.event_id}</td>
                    <td>{delivery.camera}</td>
                    <td>
                      {delivery.chunks_processed}/{delivery.total_chunks}
                    </td>
                    <td>
                      <span className={`telegram-severity ${delivery.severity}`}>
                        {delivery.event_type}
                      </span>
                    </td>
                    <td>{Math.round(delivery.confidence * 100)}%</td>
                    <td>
                      <StatusPill value={delivery.telegram_status} />
                      {delivery.reason && <small>{delivery.reason}</small>}
                    </td>
                    <td>{formatRelativeTime(delivery.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="telegram-panel">
          <div className="telegram-panel-header">
            <h2>Notification rules</h2>
          </div>

          <div className="telegram-rules">
            <div>
              <h3>Send alert when</h3>
              <ul>
                <li>Intruder detected</li>
                <li>Weapon detected</li>
                <li>Fire or smoke detected</li>
                <li>Worker failure affects processing</li>
                <li>Backend, storage, or camera goes offline</li>
              </ul>
            </div>

            <div>
              <h3>Skip alert when</h3>
              <ul>
                <li>Normal person detection</li>
                <li>Low-confidence detection</li>
                <li>Duplicate alert inside cooldown period</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
