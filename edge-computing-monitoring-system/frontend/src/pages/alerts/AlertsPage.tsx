import { useEffect, useState } from "react";
import {
  getMonitoringOverview,
  type MonitoringAlert,
  type MonitoringOverview,
} from "../../services/api";

export function AlertsPage() {
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAlerts() {
    try {
      setRefreshing(true);
      setError(null);

      const response = await getMonitoringOverview();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAlerts();

    const interval = window.setInterval(() => {
      loadAlerts();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const alerts = data?.alerts ?? [];
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical").length;
  const warningAlerts = alerts.filter((alert) => alert.severity === "warning").length;

  if (loading) {
    return (
      <section style={styles.panel}>
        <p style={styles.muted}>Loading alerts...</p>
      </section>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <p style={styles.eyebrow}>Live alerts</p>
          <h2 style={styles.title}>Alerts</h2>
          <p style={styles.description}>
            Real-time warning and critical alerts from the monitoring backend.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAlerts}
          disabled={refreshing}
          style={styles.refreshButton}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={styles.errorBox}>
          <strong>Alerts API Error</strong>
          <p>{error}</p>
        </div>
      )}

      <div style={styles.metricGrid}>
        <MetricCard title="Total Alerts" value={String(alerts.length)} status="warning" />
        <MetricCard title="Critical" value={String(criticalAlerts)} status="critical" />
        <MetricCard title="Warning" value={String(warningAlerts)} status="warning" />
        <MetricCard
          title="Cluster"
          value={data?.cluster.status ?? "unknown"}
          status={data?.cluster.status ?? "unknown"}
        />
      </div>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h3 style={styles.panelTitle}>Active Alerts</h3>
          <p style={styles.panelDescription}>
            Alerts are generated from backend monitoring rules.
          </p>
        </div>

        {alerts.length === 0 ? (
          <div style={styles.emptyBox}>
            <h3 style={{ marginTop: 0 }}>No active alerts</h3>
            <p>Your cluster is currently healthy.</p>
          </div>
        ) : (
          <div style={styles.alertList}>
            {alerts.map((alert, index) => (
              <AlertCard key={`${alert.type}-${index}`} alert={alert} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  status,
}: {
  title: string;
  value: string;
  status: string;
}) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricTop}>
        <p style={styles.metricTitle}>{title}</p>
        <span style={{ ...styles.dot, ...getDotStyle(status) }} />
      </div>

      <h3 style={styles.metricValue}>{value}</h3>
    </div>
  );
}

function AlertCard({ alert }: { alert: MonitoringAlert }) {
  return (
    <article style={{ ...styles.alertCard, ...getAlertStyle(alert.severity) }}>
      <div style={styles.alertTop}>
        <div>
          <strong style={styles.alertTitle}>{alert.type}</strong>
          <p style={styles.alertMessage}>{alert.message}</p>
        </div>

        <span style={styles.alertSeverity}>{alert.severity}</span>
      </div>

      {alert.instance && (
        <p style={styles.alertMeta}>Instance: {alert.instance}</p>
      )}

      {alert.timestamp && (
        <p style={styles.alertMeta}>
          Time: {new Date(alert.timestamp * 1000).toLocaleString()}
        </p>
      )}
    </article>
  );
}

function getDotStyle(status: string): React.CSSProperties {
  const value = status.toLowerCase();

  if (value === "online" || value === "normal") {
    return {
      background: "#22c55e",
      boxShadow: "0 0 14px rgba(34, 197, 94, 0.7)",
    };
  }

  if (value === "critical" || value === "error" || value === "offline") {
    return {
      background: "#ef4444",
      boxShadow: "0 0 14px rgba(239, 68, 68, 0.7)",
    };
  }

  return {
    background: "#f59e0b",
    boxShadow: "0 0 14px rgba(245, 158, 11, 0.7)",
  };
}

function getAlertStyle(severity: string): React.CSSProperties {
  if (severity === "critical" || severity === "error") {
    return {
      borderColor: "rgba(239, 68, 68, 0.4)",
      background: "rgba(239, 68, 68, 0.12)",
      color: "#fca5a5",
    };
  }

  if (severity === "warning") {
    return {
      borderColor: "rgba(245, 158, 11, 0.4)",
      background: "rgba(245, 158, 11, 0.12)",
      color: "#fcd34d",
    };
  }

  return {
    borderColor: "rgba(34, 211, 238, 0.4)",
    background: "rgba(34, 211, 238, 0.1)",
    color: "#67e8f9",
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

  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "16px",
  },

  metricCard: {
    border: "1px solid #243247",
    borderRadius: "18px",
    background: "#0f1b2d",
    padding: "18px",
  },

  metricTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },

  metricTitle: {
    margin: 0,
    color: "#94a3b8",
    fontSize: "14px",
  },

  metricValue: {
    margin: "18px 0 0",
    color: "#f8fafc",
    fontSize: "30px",
  },

  dot: {
    width: "11px",
    height: "11px",
    borderRadius: "999px",
    display: "inline-block",
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

  alertList: {
    display: "grid",
    gap: "14px",
  },

  alertCard: {
    border: "1px solid",
    borderRadius: "16px",
    padding: "16px",
  },

  alertTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
  },

  alertTitle: {
    textTransform: "capitalize",
  },

  alertMessage: {
    margin: "8px 0 0",
    lineHeight: 1.6,
  },

  alertSeverity: {
    height: "fit-content",
    borderRadius: "999px",
    border: "1px solid currentColor",
    padding: "5px 10px",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "capitalize",
  },

  alertMeta: {
    margin: "10px 0 0",
    fontFamily: "monospace",
    fontSize: "13px",
    opacity: 0.75,
  },
};
