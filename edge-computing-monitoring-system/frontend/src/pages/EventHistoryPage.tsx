import { useEffect, useState } from "react";
import {
  getAnnotatedImageUrl,
  getEvents,
  getRawImageUrl,
  type EventItem,
  type EventsResponse,
} from "../lib/api";

export function EventHistoryPage() {
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    try {
      setRefreshing(true);
      setError(null);

      const response = await getEvents({ limit: 20 });
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  if (loading) {
    return (
      <section style={styles.panel}>
        <p style={styles.muted}>Loading event history...</p>
      </section>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <p style={styles.eyebrow}>Detection records</p>
          <h2 style={styles.title}>Event History</h2>
          <p style={styles.description}>
            Latest detection events stored by the backend.
          </p>
        </div>

        <button
          type="button"
          onClick={loadEvents}
          disabled={refreshing}
          style={styles.refreshButton}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={styles.errorBox}>
          <strong>Events API Error</strong>
          <p>{error}</p>
        </div>
      )}

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h3 style={styles.panelTitle}>Events</h3>
            <p style={styles.panelDescription}>
              Total events returned: {data?.count ?? 0}
            </p>
          </div>
        </div>

        {!data || data.events.length === 0 ? (
          <div style={styles.emptyBox}>
            <h3 style={{ marginTop: 0 }}>No events found</h3>
            <p>
              Your events API is working, but the backend has not stored any
              detection events yet.
            </p>
            <p style={styles.smallText}>
              After YOLO detects and saves an event, it should appear here
              automatically.
            </p>
          </div>
        ) : (
          <div style={styles.eventList}>
            {data.events.map((event, index) => (
              <EventCard key={getEventId(event, index)} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EventCard({ event }: { event: EventItem }) {
  const eventType =
    event.event_type ||
    event.threat_type ||
    event.class_name ||
    event.label ||
    "Unknown event";

  const timestamp = event.timestamp || event.created_at || "No timestamp";

  return (
    <article style={styles.eventCard}>
      <div style={styles.eventCardTop}>
        <div>
          <h3 style={styles.eventTitle}>{eventType}</h3>
          <p style={styles.eventMeta}>{timestamp}</p>
        </div>

        <span style={getSeverityStyle(event.severity)}>
          {event.severity || "unknown"}
        </span>
      </div>

      <div style={styles.eventDetails}>
        <Detail label="Status" value={event.status || "N/A"} />
        <Detail label="Sensor" value={event.sensor_node_id || "N/A"} />
        <Detail
          label="Confidence"
          value={
            typeof event.confidence === "number"
              ? `${Math.round(event.confidence * 100)}%`
              : "N/A"
          }
        />
      </div>

      <div style={styles.imageLinks}>
        {event.raw_image_id && (
          <a
            href={getRawImageUrl(event.raw_image_id)}
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            Open raw image
          </a>
        )}

        {event.annotated_image_id && (
          <a
            href={getAnnotatedImageUrl(event.annotated_image_id)}
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            Open annotated image
          </a>
        )}
      </div>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detail}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getEventId(event: EventItem, index: number) {
  return String(event.id || event.event_id || index);
}

function getSeverityStyle(severity?: string): React.CSSProperties {
  const value = String(severity ?? "unknown").toLowerCase();

  if (value === "critical" || value === "error") {
    return {
      ...styles.severityBadge,
      borderColor: "rgba(239, 68, 68, 0.4)",
      background: "rgba(239, 68, 68, 0.12)",
      color: "#fca5a5",
    };
  }

  if (value === "warning") {
    return {
      ...styles.severityBadge,
      borderColor: "rgba(245, 158, 11, 0.4)",
      background: "rgba(245, 158, 11, 0.12)",
      color: "#fcd34d",
    };
  }

  return {
    ...styles.severityBadge,
    borderColor: "rgba(148, 163, 184, 0.3)",
    background: "rgba(148, 163, 184, 0.1)",
    color: "#cbd5e1",
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: "22px",
  },

  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "24px",
  },

  eyebrow: {
    margin: "0 0 8px",
    color: "#22d3ee",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.22em",
  },

  title: {
    margin: 0,
    fontSize: "34px",
  },

  description: {
    margin: "10px 0 0",
    color: "#94a3b8",
    maxWidth: "780px",
    lineHeight: 1.6,
  },

  refreshButton: {
    border: "1px solid #243247",
    borderRadius: "12px",
    background: "rgba(34, 211, 238, 0.12)",
    color: "#22d3ee",
    padding: "10px 16px",
    cursor: "pointer",
  },

  errorBox: {
    border: "1px solid rgba(239, 68, 68, 0.35)",
    background: "rgba(239, 68, 68, 0.1)",
    color: "#fecaca",
    borderRadius: "16px",
    padding: "16px",
  },

  panel: {
    border: "1px solid #243247",
    borderRadius: "18px",
    background: "#0f1b2d",
    padding: "18px",
  },

  panelHeader: {
    marginBottom: "16px",
  },

  panelTitle: {
    margin: 0,
    fontSize: "20px",
  },

  panelDescription: {
    margin: "6px 0 0",
    color: "#94a3b8",
    fontSize: "13px",
  },

  muted: {
    color: "#94a3b8",
  },

  emptyBox: {
    border: "1px solid rgba(148, 163, 184, 0.15)",
    borderRadius: "14px",
    padding: "20px",
    color: "#94a3b8",
    background: "rgba(2, 9, 19, 0.35)",
  },

  smallText: {
    marginTop: "10px",
    fontSize: "13px",
    color: "#64748b",
  },

  eventList: {
    display: "grid",
    gap: "14px",
  },

  eventCard: {
    border: "1px solid rgba(148, 163, 184, 0.15)",
    borderRadius: "16px",
    background: "rgba(2, 9, 19, 0.35)",
    padding: "16px",
  },

  eventCardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
  },

  eventTitle: {
    margin: 0,
    fontSize: "18px",
  },

  eventMeta: {
    margin: "6px 0 0",
    color: "#94a3b8",
    fontFamily: "monospace",
    fontSize: "13px",
  },

  severityBadge: {
    display: "inline-flex",
    height: "fit-content",
    border: "1px solid",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "capitalize",
  },

  eventDetails: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
    marginTop: "16px",
  },

  detail: {
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "12px",
    padding: "10px",
  },

  imageLinks: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "16px",
  },

  link: {
    color: "#22d3ee",
    textDecoration: "none",
    fontSize: "14px",
  },
};