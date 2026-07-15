import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import {
  getMonitoringOverview,
  type MonitoringAlert,
  type MonitoringOverview,
} from "../../services/api";
import "./AlertsPage.css";

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
    void loadAlerts();

    const interval = window.setInterval(() => {
      void loadAlerts();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const alerts = data?.alerts ?? [];

  const criticalAlerts = alerts.filter(
    (alert) => alert.severity === "critical" || alert.severity === "error",
  ).length;

  const warningAlerts = alerts.filter(
    (alert) => alert.severity === "warning",
  ).length;

  const infoAlerts = alerts.filter((alert) => alert.severity === "info").length;

  if (loading) {
    return (
      <section className="alerts-page">
        <div className="alerts-panel">
          <p className="alerts-muted">Loading alerts from backend...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="alerts-page">
      <div className="alerts-page-header">
        <div>
          <p>LIVE ALERTS</p>
          <h1>Alerts</h1>
          <span>
            Real-time warning and critical alerts from Prometheus, node metrics,
            backend health, and edge detection services.
          </span>
        </div>

        
      </div>

      {error && (
        <div className="alerts-error-box">
          <strong>Alerts API Error</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="alerts-metric-grid">
        <MetricCard
          title="Total alerts"
          value={String(alerts.length)}
          status={alerts.length > 0 ? "warning" : "normal"}
          icon={<Bell size={22} />}
        />

        <MetricCard
          title="Critical"
          value={String(criticalAlerts)}
          status={criticalAlerts > 0 ? "critical" : "normal"}
          icon={<ShieldAlert size={22} />}
        />

        <MetricCard
          title="Warning"
          value={String(warningAlerts)}
          status={warningAlerts > 0 ? "warning" : "normal"}
          icon={<AlertTriangle size={22} />}
        />

        <MetricCard
          title="Cluster"
          value={data?.cluster.status ?? "unknown"}
          status={data?.cluster.status ?? "unknown"}
          icon={<CheckCircle2 size={22} />}
        />
      </div>

      <section className="alerts-panel">
        <div className="alerts-panel-header">
          <div>
            <h2>Active Alerts</h2>
            <p>
              Alerts are generated from backend monitoring rules and refreshed
              every 5 seconds.
            </p>
          </div>

          <span className="alerts-count-pill">
            {criticalAlerts} critical · {warningAlerts} warning · {infoAlerts} info
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="alerts-empty-box">
            <CheckCircle2 size={34} />
            <h3>No active alerts</h3>
            <p>Your cluster is currently healthy.</p>
          </div>
        ) : (
          <div className="alerts-list">
            {alerts.map((alert, index) => (
              <AlertCard key={`${alert.type}-${index}`} alert={alert} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function MetricCard({
  title,
  value,
  status,
  icon,
}: {
  title: string;
  value: string;
  status: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="alerts-metric-card">
      <div>
        <p>{title}</p>
        <h3>{value}</h3>
      </div>

      <div className={`alerts-metric-icon ${getStatusClass(status)}`}>
        {icon}
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: MonitoringAlert }) {
  const severityClass = getStatusClass(alert.severity);

  return (
    <article className={`alerts-alert-card ${severityClass}`}>
      <div className="alerts-alert-top">
        <div className="alerts-alert-title-wrap">
          <div className={`alerts-alert-icon ${severityClass}`}>
            {severityClass === "critical" ? (
              <ShieldAlert size={20} />
            ) : severityClass === "warning" ? (
              <AlertTriangle size={20} />
            ) : (
              <Bell size={20} />
            )}
          </div>

          <div>
            <strong>{formatAlertType(alert.type)}</strong>
            <p>{alert.message}</p>
          </div>
        </div>

        <span className={`alerts-severity-pill ${severityClass}`}>
          {alert.severity}
        </span>
      </div>

      <div className="alerts-alert-meta">
        {alert.instance && <span>Instance: {alert.instance}</span>}

        {alert.timestamp && (
          <span>Time: {formatAlertTime(alert.timestamp)}</span>
        )}
      </div>
    </article>
  );
}

function getStatusClass(status: string) {
  const value = status.toLowerCase();

  if (value === "online" || value === "normal" || value === "info") {
    return "normal";
  }

  if (value === "critical" || value === "error" || value === "offline") {
    return "critical";
  }

  if (value === "warning" || value === "degraded") {
    return "warning";
  }

  return "unknown";
}

function formatAlertType(value: string) {
  return value.replace(/_/g, " ");
}

function formatAlertTime(timestamp: number) {
  const timestampMs = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;

  return new Date(timestampMs).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
