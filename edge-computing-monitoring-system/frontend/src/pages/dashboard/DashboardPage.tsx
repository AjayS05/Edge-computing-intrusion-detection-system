import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMonitoringOverview,
  type MonitoringAlert,
  type MonitoringNode,
  type MonitoringOverview,
} from "../../services/api";
import "./DashboardPage.css";

export function DashboardPage() {
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setError(null);

      const response = await getMonitoringOverview();
      setData(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load dashboard data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();

    const interval = window.setInterval(() => {
      void loadDashboardData();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadDashboardData]);

  const hottestNodes = useMemo(() => {
    return [...(data?.cluster.nodes ?? [])]
      .filter((node) => typeof node.temperature_c === "number")
      .sort(
        (firstNode, secondNode) =>
          (secondNode.temperature_c ?? 0) - (firstNode.temperature_c ?? 0),
      )
      .slice(0, 5);
  }, [data]);

  const latestAlerts = data?.alerts?.slice(0, 4) ?? [];

  if (loading) {
    return (
      <section className="dashboard-panel">
        <p className="dashboard-muted">Loading dashboard data...</p>
      </section>
    );
  }

  return (
    <div className="dashboard-page">
      {error && (
        <div className="dashboard-error" role="alert">
          <strong>Dashboard API Error</strong>
          <p>{error}</p>
        </div>
      )}

      <section className="dashboard-metric-grid" aria-label="Cluster overview">
        <MetricCard
          title="Backend API"
          value={data?.backend.status === "online" ? "Online" : "Offline"}
          subtitle={data?.backend.prometheus_url ?? "FastAPI service"}
          status={data?.backend.status ?? "unknown"}
        />

        <MetricCard
          title="Cluster Nodes"
          value={`${data?.summary.online_nodes ?? 0}/${
            data?.summary.total_nodes ?? 0
          }`}
          subtitle={`${data?.summary.offline_nodes ?? 0} offline`}
          status={
            (data?.summary.offline_nodes ?? 0) > 0 ? "warning" : "online"
          }
        />

        <MetricCard
          title="Max Temperature"
          value={formatTemperature(data?.summary.max_temperature_c)}
          subtitle="Highest node temperature"
          status={getTemperatureStatus(data?.summary.max_temperature_c)}
        />

        <MetricCard
          title="Active Alerts"
          value={String(
            (data?.summary.critical_alerts ?? 0) +
              (data?.summary.warning_alerts ?? 0),
          )}
          subtitle={`${data?.summary.critical_alerts ?? 0} critical · ${
            data?.summary.warning_alerts ?? 0
          } warning`}
          status={getAlertSummaryStatus(
            data?.summary.critical_alerts,
            data?.summary.warning_alerts,
          )}
        />
      </section>

      <section
        className="dashboard-metric-grid"
        aria-label="Cluster resource usage"
      >
        <MetricCard
          title="Average CPU"
          value={formatPercent(data?.summary.avg_cpu_percent)}
          subtitle="Cluster average"
          status={getUsageStatus(data?.summary.avg_cpu_percent, 70, 85)}
        />

        <MetricCard
          title="Average Memory"
          value={formatPercent(data?.summary.avg_memory_percent)}
          subtitle="Cluster average"
          status={getUsageStatus(data?.summary.avg_memory_percent, 70, 85)}
        />

        <MetricCard
          title="Average Disk"
          value={formatPercent(data?.summary.avg_disk_percent)}
          subtitle="Cluster average"
          status={getUsageStatus(data?.summary.avg_disk_percent, 75, 90)}
        />

        <MetricCard
          title="YOLO Service"
          value={formatStatus(data?.services.yolo)}
          subtitle="Inference service"
          status={String(data?.services.yolo ?? "unknown")}
        />
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h3 className="dashboard-panel-title">Hottest Nodes</h3>
            <p className="dashboard-panel-description">
              Top nodes ordered by temperature.
            </p>
          </div>

          {hottestNodes.length === 0 ? (
            <p className="dashboard-muted">No temperature data available.</p>
          ) : (
            <div className="dashboard-list">
              {hottestNodes.map((node) => (
                <NodeTemperatureRow key={node.instance} node={node} />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h3 className="dashboard-panel-title">Latest Alerts</h3>
            <p className="dashboard-panel-description">
              Current warning and critical backend alerts.
            </p>
          </div>

          {latestAlerts.length === 0 ? (
            <div className="dashboard-empty">No active alerts.</div>
          ) : (
            <div className="dashboard-list">
              {latestAlerts.map((alert, index) => (
                <AlertCard
                  key={`${alert.type}-${alert.message}-${index}`}
                  alert={alert}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-panel">
        <div className="dashboard-panel-header">
          <h3 className="dashboard-panel-title">Service Status</h3>
          <p className="dashboard-panel-description">
            Backend-connected services reported by the API.
          </p>
        </div>

        <div className="dashboard-service-grid">
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

type MetricCardProps = {
  title: string;
  value: string;
  subtitle: string;
  status: string;
};

function MetricCard({ title, value, subtitle, status }: MetricCardProps) {
  return (
    <article className="dashboard-metric-card">
      <div className="dashboard-metric-top">
        <p className="dashboard-metric-title">{title}</p>
        <StatusDot status={status} />
      </div>

      <h3 className="dashboard-metric-value">{value}</h3>
      <p className="dashboard-metric-subtitle">{subtitle}</p>
    </article>
  );
}

function NodeTemperatureRow({ node }: { node: MonitoringNode }) {
  return (
    <div className="dashboard-node-row">
      <div>
        <strong>{cleanNodeName(node.name)}</strong>
        <p className="dashboard-node-meta">{node.role}</p>
      </div>

      <div className="dashboard-node-temperature">
        <strong
          className={`dashboard-status-text ${getStatusClass(
            node.temperature_status,
          )}`}
        >
          {formatTemperature(node.temperature_c)}
        </strong>

        <p className="dashboard-node-meta">
          {formatStatus(node.temperature_status)}
        </p>
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: MonitoringAlert }) {
  const severityClass = getStatusClass(alert.severity);

  return (
    <div className={`dashboard-alert ${severityClass}`}>
      <strong>{formatLabel(alert.type)}</strong>
      <p>{alert.message}</p>
    </div>
  );
}

function ServiceStatus({ name, value }: { name: string; value: string }) {
  return (
    <div className="dashboard-service-item">
      <StatusDot status={value} />

      <div>
        <strong>{name}</strong>
        <p>{formatStatus(value)}</p>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`dashboard-status-dot ${getStatusClass(status)}`}
      title={formatStatus(status)}
      aria-label={formatStatus(status)}
    />
  );
}

function getUsageStatus(
  value: number | null | undefined,
  warningThreshold: number,
  criticalThreshold: number,
) {
  if (typeof value !== "number") {
    return "unknown";
  }

  if (value >= criticalThreshold) {
    return "critical";
  }

  if (value >= warningThreshold) {
    return "warning";
  }

  return "online";
}

function getTemperatureStatus(temperature: number | null | undefined) {
  if (typeof temperature !== "number") {
    return "unknown";
  }

  if (temperature >= 80) {
    return "critical";
  }

  if (temperature >= 60) {
    return "warning";
  }

  return "online";
}

function getAlertSummaryStatus(
  criticalAlerts: number | null | undefined,
  warningAlerts: number | null | undefined,
) {
  if ((criticalAlerts ?? 0) > 0) {
    return "critical";
  }

  if ((warningAlerts ?? 0) > 0) {
    return "warning";
  }

  return "online";
}

function getStatusClass(status: string | null | undefined) {
  const normalizedStatus = String(status ?? "unknown").toLowerCase();

  if (
    normalizedStatus === "online" ||
    normalizedStatus === "normal" ||
    normalizedStatus === "healthy" ||
    normalizedStatus === "running" ||
    normalizedStatus === "ready"
  ) {
    return "online";
  }

  if (
    normalizedStatus === "warning" ||
    normalizedStatus === "unknown" ||
    normalizedStatus === "degraded" ||
    normalizedStatus === "pending"
  ) {
    return "warning";
  }

  if (
    normalizedStatus === "critical" ||
    normalizedStatus === "error" ||
    normalizedStatus === "offline" ||
    normalizedStatus === "failed" ||
    normalizedStatus === "unhealthy"
  ) {
    return "critical";
  }

  return "warning";
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${Math.round(value)}%`;
}

function formatTemperature(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value.toFixed(1)}°C`;
}

function formatStatus(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }

  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function cleanNodeName(value: string) {
  return value.replace(":9100", "");
}
