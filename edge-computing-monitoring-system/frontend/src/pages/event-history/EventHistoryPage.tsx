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
import {
  getAnnotatedImageUrl,
  getEvents,
  getRawImageUrl,
  type EventItem,
} from "../../services/api";
import "./EventHistoryPage.css";

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

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleTimeString("en-GB", {
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

function getClassNames(event: EventItem): string[] {
  if (Array.isArray(event.class_names) && event.class_names.length > 0) {
    return event.class_names;
  }

  if (Array.isArray(event.classes) && event.classes.length > 0) {
    return event.classes;
  }

  if (Array.isArray(event.detections) && event.detections.length > 0) {
    const names = event.detections
      .map((detection) => {
        return (
          detection.class_name ||
          detection.label ||
          detection.class ||
          detection.name
        );
      })
      .filter((name): name is string => Boolean(name));

    if (names.length > 0) {
      return names;
    }
  }

  if (event.event_type) return [event.event_type];
  if (event.threat_type) return [event.threat_type];
  if (event.class_name) return [event.class_name];
  if (event.label) return [event.label];

  return ["unknown"];
}

function getConfidence(event: EventItem) {
  if (typeof event.confidence === "number") {
    return event.confidence;
  }

  if (Array.isArray(event.detections) && event.detections.length > 0) {
    const scores = event.detections
      .map((detection) => detection.confidence)
      .filter((value): value is number => typeof value === "number");

    if (scores.length > 0) {
      return Math.max(...scores);
    }
  }

  return 0;
}

function getSeverity(event: EventItem): Severity {
  const severity = String(event.severity || "").toLowerCase();

  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  if (severity === "normal") return "normal";

  const classes = getClassNames(event).map((name) => name.toLowerCase());

  if (
    classes.some((name) =>
      ["weapon", "fire", "smoke", "intruder"].includes(name),
    )
  ) {
    return "critical";
  }

  if (classes.some((name) => ["liquid_spill", "container"].includes(name))) {
    return "warning";
  }

  return "normal";
}

function getTelegramStatus(event: EventItem): TelegramStatus {
  const status = String(event.telegram_status || "").toLowerCase();

  if (status === "sent") return "sent";
  if (status === "skipped") return "skipped";
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";

  if (event.telegram_sent === true) return "sent";
  if (event.telegram_sent === false) return "skipped";

  return "pending";
}

function normalizeEvent(event: EventItem, index: number): DetectionEvent {
  const rawImageUrl =
    event.raw_image_url ||
    event.raw_url ||
    (event.raw_image_id !== undefined && event.raw_image_id !== null
      ? getRawImageUrl(event.raw_image_id)
      : null);

  const annotatedImageUrl =
    event.annotated_image_url ||
    event.annotated_url ||
    (event.annotated_image_id !== undefined &&
    event.annotated_image_id !== null
      ? getAnnotatedImageUrl(event.annotated_image_id)
      : null);

  return {
    event_id: String(event.event_id || event.id || `event_${index + 1}`),
    timestamp:
      event.timestamp ||
      event.created_at ||
      event.time ||
      new Date().toISOString(),
    camera:
      event.camera ||
      event.node_name ||
      event.node ||
      event.sensor_node_id ||
      "Pi4 Camera",
    processing:
      event.processing ||
      event.chunk_status ||
      `${event.chunks_processed ?? 8}/${event.total_chunks ?? 8} chunks`,
    class_names: getClassNames(event),
    confidence: getConfidence(event),
    severity: getSeverity(event),
    telegram_status: getTelegramStatus(event),
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
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function EventHistoryPage() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [search, setSearch] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvents() {
      try {
        setLoading(true);
        setApiError(null);

        const response = await getEvents({ limit: 50 });
        const eventList = Array.isArray(response.events)
          ? response.events
          : [];

        const normalizedEvents = eventList.map(normalizeEvent);
        setEvents(normalizedEvents);
      } catch (error) {
        console.error("Events API error:", error);
        setEvents([]);
        setApiError(
          error instanceof Error
            ? error.message
            : "Failed to load events from backend.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadEvents();
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

    const csv = rows
      .map((row) => row.map((value) => `"${String(value)}"`).join(","))
      .join("\n");

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
            type="button"
          >
            <Filter size={18} />
            {criticalOnly ? "Critical only" : "Filter"}
          </button>

          <button
            className="event-action primary"
            onClick={exportCsv}
            type="button"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      {apiError && <div className="event-api-notice">{apiError}</div>}

      <div className="event-history-card">
        <div className="event-card-top">
          <h2>
            {loading ? "Loading events..." : `${filteredEvents.length} events`}
          </h2>

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
                    {Math.round(event.confidence * 100)}%
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
                      <button
                        type="button"
                        onClick={() => openImage(event.raw_image_url)}
                        disabled={!event.raw_image_url}
                      >
                        <Image size={15} />
                        Raw
                      </button>

                      <button
                        type="button"
                        onClick={() => openImage(event.annotated_image_url)}
                        disabled={!event.annotated_image_url}
                      >
                        <Eye size={15} />
                        Annotated
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={9} className="event-empty">
                    No events found from backend.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={9} className="event-empty">
                    Loading event history from backend...
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
