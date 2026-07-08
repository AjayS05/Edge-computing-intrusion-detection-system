import { useEffect, useMemo, useState } from "react";
import {
  getMonitoringOverview,
  type MonitoringAlert,
  type MonitoringNode,
  type MonitoringOverview,
} from "../lib/api";

export function DashboardPage() {
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");

  async function loadDashboardData() {
    try {
      setRefreshing(true);
      setError(null);

      const response = await getMonitoringOverview();

      setData(response);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDashboardData();

    const interval = window.setInterval(() => {
      loadDashboardData();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const hottestNodes = useMemo(() => {
    return [...(data?.cluster.nodes ?? [])]
      .filter((node) => typeof node.temperature_c === "number")
      .sort((a, b) => (b.temperature_c ?? 0) - (a.temperature_c ?? 0))
      .slice(0, 5);
  }, [data]);

  const latestAlerts = data?.alerts?.slice(0, 4) ?? [];

  if (loading) {
    return (
      <section style={styles.panel}>
        <p style={styles.muted}>Loading dashboard data...</p>
      </section>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <p style={styles.eyebrow}>Live system overview</p>
          <h2 style={styles.title}>Dashboard</h2>
          <p style={styles.description}>
            Backend, cluster health, node metrics, and active alerts from your real monitoring API.
          </p>

          {lastUpdated && (
            <p style={styles.lastUpdated}>Last updated: {lastUpdated}</p>
          )}
        </div>

        <button
          type="button"
          onClick={loadDashboardData}
          disabled={refreshing}
          style={styles.refreshButton}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={styles.errorBox}>
          <strong>Dashboard API Error</strong>
          <p>{error}</p>
        </div>
      )}

      <div style={styles.metricGrid}>
        <MetricCard
          title="Backend API"
          value={data?.backend.status === "online" ? "Online" : "Offline"}
          subtitle={data?.backend.prometheus_url ?? "FastAPI service"}
          status={data?.backend.status ?? "unknown"}
        />

        <MetricCard
          title="Cluster Nodes"
          value={`${data?.summary.online_nodes ?? 0}/${data?.summary.total_nodes ?? 0}`}
          subtitle={`${data?.summary.offline_nodes ?? 0} offline`}
          status={(data?.summary.offline_nodes ?? 0) > 0 ? "warning" : "online"}
        />

        <MetricCard
          title="Max Temperature"
          value={formatTemp(data?.summary.max_temperature_c)}
          subtitle="Highest node temperature"
          status={
            (data?.summary.max_temperature_c ?? 0) >= 80
              ? "critical"
              : (data?.summary.max_temperature_c ?? 0) >= 60
                ? "warning"
                : "online"
          }
        />

        <MetricCard
          title="Active Alerts"
          value={String((data?.summary.critical_alerts ?? 0) + (data?.summary.warning_alerts ?? 0))}
          subtitle={`${data?.summary.critical_alerts ?? 0} critical · ${data?.summary.warning_alerts ?? 0} warning`}
          status={(data?.summary.critical_alerts ?? 0) > 0 ? "critical" : (data?.summary.warning_alerts ?? 0) > 0 ? "warning" : "online"}
        />
      </div>

      <div style={styles.metricGrid}>
        <MetricCard
          title="Average CPU"
          value={formatPercent(data?.summary.avg_cpu_percent)}
          subtitle="Cluster average"
          status={
            (data?.summary.avg_cpu_percent ?? 0) >= 85
              ? "critical"
              : (data?.summary.avg_cpu_percent ?? 0) >= 70
                ? "warning"
                : "online"
          }
        />

        <MetricCard
          title="Average Memory"
          value={formatPercent(data?.summary.avg_memory_percent)}
          subtitle="Cluster average"
          status={
            (data?.summary.avg_memory_percent ?? 0) >= 85
              ? "critical"
              : (data?.summary.avg_memory_percent ?? 0) >= 70
                ? "warning"
                : "online"
          }
        />

        <MetricCard
          title="Average Disk"
          value={formatPercent(data?.summary.avg_disk_percent)}
          subtitle="Cluster average"
          status={
            (data?.summary.avg_disk_percent ?? 0) >= 90
              ? "critical"
              : (data?.summary.avg_disk_percent ?? 0) >= 75
                ? "warning"
                : "online"
          }
        />

        <MetricCard
          title="YOLO Service"
          value={String(data?.services.yolo ?? "Unknown")}
          subtitle="Inference service"
          status={String(data?.services.yolo ?? "unknown")}
        />
      </div>

      <div style={styles.twoColumn}>
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <h3 style={styles.panelTitle}>Hottest Nodes</h3>
              <p style={styles.panelDescription}>
                Top nodes ordered by temperature.
              </p>
            </div>
          </div>

          {hottestNodes.length === 0 ? (
            <p style={styles.muted}>No temperature data available.</p>
          ) : (
            <div style={styles.nodeList}>
              {hottestNodes.map((node) => (
                <NodeTemperatureRow key={node.instance} node={node} />
              ))}
            </div>
          )}
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <h3 style={styles.panelTitle}>Latest Alerts</h3>
              <p style={styles.panelDescription}>
                Current warning and critical backend alerts.
              </p>
            </div>
          </div>

          {latestAlerts.length === 0 ? (
            <div style={styles.emptyBox}>No active alerts.</div>
          ) : (
            <div style={styles.alertList}>
              {latestAlerts.map((alert, index) => (
                <AlertCard key={`${alert.type}-${index}`} alert={alert} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h3 style={styles.panelTitle}>Service Status</h3>
            <p style={styles.panelDescription}>
              Backend-connected services reported by the API.
            </p>
          </div>
        </div>

        <div style={styles.serviceGrid}>
          <ServiceStatus
            name="Backend"
            value={data?.backend.status ?? "unknown"}
          />

          <ServiceStatus
            name="Cluster"
            value={data?.cluster.status ?? "unknown"}
          />

          <ServiceStatus
            name="YOLO"
            value={String(data?.services.yolo ?? "unknown")}
          />

          <ServiceStatus
            name="Telegram Bot"
            value={String(data?.services.telegram_bot ?? "unknown")}
          />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  status,
}: {
  title: string;
  value: string;
  subtitle: string;
  status: string;
}) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricTop}>
        <p style={styles.metricTitle}>{title}</p>
        <span style={{ ...styles.dot, ...getDotStyle(status) }} />
      </div>

      <h3 style={styles.metricValue}>{value}</h3>
      <p style={styles.metricSubtitle}>{subtitle}</p>
    </div>
  );
}

function NodeTemperatureRow({ node }: { node: MonitoringNode }) {
  const temp = node.temperature_c;

  return (
    <div style={styles.nodeRow}>
      <div>
        <strong>{cleanNodeName(node.name)}</strong>
        <p style={styles.nodeMeta}>{node.role}</p>
      </div>

      <div style={{ textAlign: "right" }}>
        <strong style={getTextStatusStyle(node.temperature_status)}>
          {formatTemp(temp)}
        </strong>
        <p style={styles.nodeMeta}>{node.temperature_status}</p>
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: MonitoringAlert }) {
  return (
    <div style={{ ...styles.alertCard, ...getAlertStyle(alert.severity) }}>
      <strong>{alert.type}</strong>
      <p>{alert.message}</p>
    </div>
  );
}

function ServiceStatus({ name, value }: { name: string; value: string }) {
  return (
    <div style={styles.serviceItem}>
      <span style={{ ...styles.dot, ...getDotStyle(value) }} />
      <div>
        <strong>{name}</strong>
        <p>{value}</p>
      </div>
    </div>
  );
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") return "N/A";
  return `${Math.round(value)}%`;
}

function formatTemp(value: number | null | undefined) {
  if (typeof value !== "number") return "N/A";
  return `${value.toFixed(1)}°C`;
}

function cleanNodeName(value: string) {
  return value.replace(":9100", "");
}

function getDotStyle(status: string): React.CSSProperties {
  const normalized = status.toLowerCase();

  if (normalized === "online" || normalized === "normal") {
    return {
      background: "#22c55e",
      boxShadow: "0 0 14px rgba(34, 197, 94, 0.7)",
    };
  }

  if (normalized === "warning" || normalized === "unknown") {
    return {
      background: "#f59e0b",
      boxShadow: "0 0 14px rgba(245, 158, 11, 0.7)",
    };
  }

  return {
    background: "#ef4444",
    boxShadow: "0 0 14px rgba(239, 68, 68, 0.7)",
  };
}

function getTextStatusStyle(status: string): React.CSSProperties {
  const normalized = status.toLowerCase();

  if (normalized === "critical" || normalized === "error") {
    return { color: "#fca5a5" };
  }

  if (normalized === "warning") {
    return { color: "#fcd34d" };
  }

  return { color: "#86efac" };
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

  lastUpdated: {
    margin: "10px 0 0",
    color: "#64748b",
    fontFamily: "monospace",
    fontSize: "13px",
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
    margin: "18px 0 8px",
    color: "#f8fafc",
    fontSize: "30px",
  },

  metricSubtitle: {
    margin: 0,
    color: "#94a3b8",
    fontSize: "13px",
  },

  dot: {
    width: "11px",
    height: "11px",
    borderRadius: "999px",
    display: "inline-block",
  },

  twoColumn: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 0.8fr)",
    gap: "16px",
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

  nodeList: {
    display: "grid",
    gap: "10px",
  },

  nodeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    border: "1px solid rgba(148, 163, 184, 0.15)",
    borderRadius: "14px",
    background: "rgba(2, 9, 19, 0.35)",
    padding: "14px",
  },

  nodeMeta: {
    margin: "5px 0 0",
    color: "#94a3b8",
    fontFamily: "monospace",
    fontSize: "12px",
  },

  alertList: {
    display: "grid",
    gap: "10px",
  },

  alertCard: {
    border: "1px solid",
    borderRadius: "14px",
    padding: "14px",
  },

  emptyBox: {
    border: "1px solid rgba(148, 163, 184, 0.15)",
    borderRadius: "14px",
    padding: "14px",
    color: "#94a3b8",
  },

  serviceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "14px",
  },

  serviceItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    border: "1px solid rgba(148, 163, 184, 0.15)",
    borderRadius: "14px",
    background: "rgba(2, 9, 19, 0.35)",
    padding: "14px",
  },
};