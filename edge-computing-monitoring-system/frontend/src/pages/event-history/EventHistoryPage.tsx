import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  Filter,
  Flame,
  Image,
  Search,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import "./EventHistoryPage.css"
type Severity = "normal" | "warning" | "critical";
type TelegramStatus = "sent" | "skipped" | "failed" | "pending";

type DetectionEvent = {
  event_id: string;
  timestamp: string;
  camera: string;
  processing: string;
  class_names: string[];
  confidence: number;
  severity: Severity;
  telegram_status: TelegramStatus;
  raw_image_url?: string | null;
  annotated_image_url?: string | null;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const demoEvents: DetectionEvent[] = [
  {
    event_id: "evt_2f8a91",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    camera: "Pi4 Camera",
    processing: "8/8 chunks",
    class_names: ["intruder", "person"],
    confidence: 0.94,
    severity: "critical",
    telegram_status: "sent",
    raw_image_url: "#",
    annotated_image_url: "#",
  },
  {
    event_id: "evt_1d4c7b",
    timestamp: new Date(Date.now() - 4.1 * 60 * 60 * 1000).toISOString(),
    camera: "Pi4 Camera",
    processing: "8/8 chunks",
    class_names: ["person"],
    confidence: 0.79,
    severity: "warning",
    telegram_status: "sent",
    raw_image_url: "#",
    annotated_image_url: "#",
  },
  {
    event_id: "evt_9a3e12",
    timestamp: new Date(Date.now() - 4.2 * 60 * 60 * 1000).toISOString(),
    camera: "Pi4 Camera",
    processing: "7/8 chunks",
    class_names: ["fire", "smoke"],
    confidence: 0.82,
    severity: "critical",
    telegram_status: "sent",
    raw_image_url: "#",
    annotated_image_url: "#",
  },
  {
    event_id: "evt_5c7f04",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    camera: "Pi4 Camera",
    processing: "8/8 chunks",
    class_names: ["person"],
    confidence: 0.66,
    severity: "normal",
    telegram_status: "skipped",
    raw_image_url: "#",
    annotated_image_url: "#",
  },
  {
    event_id: "evt_8b2a55",
    timestamp: new Date(Date.now() - 5.3 * 60 * 60 * 1000).toISOString(),
    camera: "Pi4 Camera",
    processing: "8/8 chunks",
    class_names: ["weapon", "person"],
    confidence: 0.91,
    severity: "critical",
    telegram_status: "sent",
    raw_image_url: "#",
    annotated_image_url: "#",
  },
  {
    event_id: "evt_3e9d17",
    timestamp: new Date(Date.now() - 5.6 * 60 * 60 * 1000).toISOString(),
    camera: "Pi4 Camera",
    processing: "8/8 chunks",
    class_names: ["liquid_spill"],
    confidence: 0.68,
    severity: "warning",
    telegram_status: "sent",
    raw_image_url: "#",
    annotated_image_url: "#",
  },
];

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", {
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
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

function getSeverity(event: any): Severity {
  const severity = String(event.severity || "").toLowerCase();

  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  if (severity === "normal") return "normal";

  const classes = getClassNames(event);

  if (
    classes.some((name) =>
      ["weapon", "fire", "smoke", "intruder"].includes(name.toLowerCase())
    )
  ) {
    return "critical";
  }

  if (classes.some((name) => ["liquid_spill"].includes(name.toLowerCase()))) {
    return "warning";
  }

  return "normal";
}

function getClassNames(event: any): string[] {
  if (Array.isArray(event.class_names)) return event.class_names;

  if (Array.isArray(event.classes)) return event.classes;

  if (Array.isArray(event.detections)) {
    return event.detections
      .map((d: any) => d.class_name || d.label || d.class || d.name)
      .filter(Boolean);
  }

  if (event.event_type) return [event.event_type];

  if (event.detected_class) return [event.detected_class];

  return ["unknown"];
}

function getConfidence(event: any) {
  if (typeof event.confidence === "number") return event.confidence;

  if (Array.isArray(event.detections) && event.detections.length > 0) {
    const scores = event.detections
      .map((d: any) => d.confidence)
      .filter((value: any) => typeof value === "number");

    if (scores.length > 0) return Math.max(...scores);
  }

  return 0;
}

function normalizeEvent(event: any, index: number): DetectionEvent {
  const rawImageUrl =
    event.raw_image_url ||
    event.raw_url ||
    (event.raw_image_id
      ? `${API_BASE_URL}/api/v1/images/raw/${event.raw_image_id}`
      : null);

  const annotatedImageUrl =
    event.annotated_image_url ||
    event.annotated_url ||
    (event.annotated_image_id
      ? `${API_BASE_URL}/api/v1/images/annotated/${event.annotated_image_id}`
      : null);

  return {
    event_id: event.event_id || event.id || `evt_${index + 1}`,
    timestamp:
      event.timestamp ||
      event.created_at ||
      event.time ||
      new Date().toISOString(),
    camera: event.camera || event.node_name || event.node || "Pi4 Camera",
    processing:
      event.processing ||
      event.chunk_status ||
      `${event.chunks_processed ?? 8}/${event.total_chunks ?? 8} chunks`,
    class_names: getClassNames(event),
    confidence: getConfidence(event),
    severity: getSeverity(event),
    telegram_status:
      event.telegram_status ||
      (event.telegram_sent === true
        ? "sent"
        : event.telegram_sent === false
        ? "skipped"
        : "pending"),
    raw_image_url: rawImageUrl,
    annotated_image_url: annotatedImageUrl,
  };
}

function classIcon(classes: string[]) {
  const joined = classes.join(" ").toLowerCase();

  if (joined.includes("fire") || joined.includes("smoke")) {
    return <Flame size={17} />;
  }

  if (joined.includes("weapon") || joined.includes("intruder")) {
    return <ShieldAlert size={17} />;
  }

  if (joined.includes("person")) {
    return <User size={17} />;
  }

  return <AlertTriangle size={17} />;
}

function openImage(url?: string | null) {
  if (!url || url === "#") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function EventHistoryPage() {
  const [events, setEvents] = useState<DetectionEvent[]>(demoEvents);
  const [search, setSearch] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvents() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/events`);

        if (!response.ok) {
          throw new Error("Events API not available");
        }

        const data = await response.json();
        const eventList = Array.isArray(data) ? data : data.events || [];

        setEvents(eventList.map(normalizeEvent));
        setApiNotice(null);
      } catch {
        setEvents(demoEvents);
        setApiNotice("Showing demo data because the events API is not available yet.");
      }
    }

    loadEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const text = [
        event.event_id,
        event.camera,
        event.processing,
        event.class_names.join(" "),
        event.severity,
        event.telegram_status,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = text.includes(search.toLowerCase());
      const matchesSeverity = criticalOnly
        ? event.severity === "critical"
        : true;

      return matchesSearch && matchesSeverity;
    });
  }, [events, search, criticalOnly]);

  function exportCsv() {
    const rows = [
      [
        "event_id",
        "timestamp",
        "camera",
        "processing",
        "classes",
        "confidence",
        "severity",
        "telegram_status",
      ],
      ...filteredEvents.map((event) => [
        event.event_id,
        event.timestamp,
        event.camera,
        event.processing,
        event.class_names.join(", "),
        `${Math.round(event.confidence * 100)}%`,
        event.severity,
        event.telegram_status,
      ]),
    ];

    const csv = rows.map((row) => row.map(String).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "event-history.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="event-history-page">
      <div className="event-history-header">
        <div>
          <p>24H WINDOW</p>
          <h1>Event History</h1>
          <span>
            Every detection event pushed to the backend, with raw and
            YOLO-annotated evidence.
          </span>
        </div>

        <div className="event-history-actions">
          <button
            className={criticalOnly ? "event-action active" : "event-action"}
            onClick={() => setCriticalOnly((value) => !value)}
          >
            <Filter size={18} />
            {criticalOnly ? "Critical only" : "Filter"}
          </button>

          <button className="event-action primary" onClick={exportCsv}>
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      {apiNotice && <div className="event-api-notice">{apiNotice}</div>}

      <div className="event-history-card">
        <div className="event-card-top">
          <h2>{filteredEvents.length} events</h2>

          <div className="event-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search id, camera, class..."
            />
          </div>
        </div>

        <div className="event-table-wrap">
          <table className="event-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Timestamp</th>
                <th>Camera</th>
                <th>Processing</th>
                <th>Class</th>
                <th>Confidence</th>
                <th>Severity</th>
                <th>Telegram</th>
                <th>Evidence</th>
              </tr>
            </thead>

            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.event_id}>
                  <td className="event-id">{event.event_id}</td>

                  <td className="event-time">
                    {formatTime(event.timestamp)}
                    <span> · {formatRelativeTime(event.timestamp)}</span>
                  </td>

                  <td className="event-node">{event.camera}</td>

                  <td>
                    <span
                      className={
                        event.processing.startsWith("8/8")
                          ? "event-processing ok"
                          : "event-processing warning"
                      }
                    >
                      {event.processing}
                    </span>
                  </td>

                  <td>
                    <div className="event-class">
                      {classIcon(event.class_names)}
                      <span>{event.class_names.join(", ")}</span>
                    </div>
                  </td>

                  <td className="event-confidence">
                    {Math.round(event.confidence * 100)}.0%
                  </td>

                  <td>
                    <span className={`event-severity ${event.severity}`}>
                      {event.severity}
                    </span>
                  </td>

                  <td>
                    <span className={`event-telegram ${event.telegram_status}`}>
                      {event.telegram_status === "sent" ? (
                        <Check size={16} />
                      ) : (
                        <X size={16} />
                      )}
                      {event.telegram_status}
                    </span>
                  </td>

                  <td>
                    <div className="event-evidence-buttons">
                      <button onClick={() => openImage(event.raw_image_url)}>
                        <Image size={15} />
                        Raw
                      </button>

                      <button
                        onClick={() => openImage(event.annotated_image_url)}
                      >
                        <Eye size={15} />
                        Annotated
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={9} className="event-empty">
                    No events found for this search/filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
