import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Cpu,
  HardDrive,
  RefreshCcw,
  Server,
  ShieldAlert,
  Thermometer,
  Wifi,
  Zap,
} from "lucide-react";
import {
  getMonitoringOverview,
  type MonitoringAlert,
  type MonitoringOverview,
  type MonitoringNode,
  type TemperatureStatus,
} from "../../services/api";
import "./MonitoringPage.css";

type StatusTone = "online" | "warning" | "critical" | "unknown";

type UiNode = {
  name: string;
  instance: string;
  role: string;
  status: string;

  cpu: number | null;
  memory: number | null;
  disk: number | null;

  temperature: number | null;
  temperatureStatus: TemperatureStatus;

  networkRx: number | null;
  networkTx: number | null;

  uptimeSeconds: number | null;
};

export function MonitoringPage() {
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");

  async function loadMonitoringData() {
    try {
      setRefreshing(true);
      setError(null);

      const response = await getMonitoringOverview();

      setData(response);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load monitoring data",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadMonitoringData();

    const interval = window.setInterval(() => {
      void loadMonitoringData();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const nodes = useMemo<UiNode[]>(() => {
    return (
      data?.cluster.nodes.map((node: MonitoringNode) => {
        const nodeName = node.name || node.instance || "unknown-node";

        return {
          name: nodeName.replace(":9100", ""),
          instance: node.instance,
          role: node.role,
          status: node.status,

          cpu: node.cpu_percent ?? null,
          memory: node.memory_percent ?? null,
          disk: node.disk_percent ?? null,

          temperature: node.temperature_c ?? null,
          temperatureStatus: node.temperature_status ?? "unknown",

          networkRx: node.network_rx_bps ?? null,
          networkTx: node.network_tx_bps ?? null,

          uptimeSeconds: node.uptime_seconds ?? null,
        };
      }) ?? []
    );
  }, [data]);

  const alerts = data?.alerts ?? [];

  const totalNodes = data?.summary.total_nodes ?? nodes.length;
  const onlineNodes =
    data?.summary.online_nodes ??
    nodes.filter((node) => node.status === "online").length;

  const offlineNodes =
    data?.summary.offline_nodes ??
    nodes.filter((node) => node.status === "offline").length;

  const avgCpu = data?.summary.avg_cpu_percent ?? averageMetric(nodes, "cpu");
  const avgMemory =
    data?.summary.avg_memory_percent ?? averageMetric(nodes, "memory");
  const avgDisk = data?.summary.avg_disk_percent ?? averageMetric(nodes, "disk");
  const maxTemp =
    data?.summary.max_temperature_c ?? getMaxNodeTemperature(nodes);

  const criticalCount =
    data?.summary.critical_alerts ??
    alerts.filter(
      (alert) => alert.severity === "critical" || alert.severity === "error",
    ).length;

  const warningCount =
    data?.summary.warning_alerts ??
    alerts.filter((alert) => alert.severity === "warning").length;

  const backendStatus = data?.backend.status ?? "unknown";
  const clusterStatus = data?.cluster.status ?? "unknown";
  const prometheusHasError = hasPrometheusError(data);

  if (loading) {
    return (
      <section className="monitoring-page">
        <div className="monitoring-loading-card">
          <Activity size={24} />
          <strong>Loading monitoring data...</strong>
          <span>Reading Prometheus, backend health, and node metrics.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="monitoring-page">
      <div className="monitoring-page-header">
        <div>
          <p>LIVE MONITORING</p>
          <h1>Cluster Monitoring</h1>
          <span>
            Backend, services, Raspberry Pi nodes, CPU, RAM, disk, temperature,
            network traffic, and active alerts.
          </span>

          {lastUpdated && (
            <small className="monitoring-last-updated">
              Last updated: {lastUpdated}
            </small>
          )}
        </div>

        <button
          type="button"
          className="monitoring-refresh-button"
          onClick={() => void loadMonitoringData()}
          disabled={refreshing}
        >
          <RefreshCcw size={17} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="monitoring-api-error">
          <strong>Monitoring API Error</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="monitoring-stat-grid">
        <MetricCard
          title="Backend API"
          value={backendStatus === "online" ? "Online" : formatTitle(backendStatus)}
          status={backendStatus}
          subtitle="FastAPI backend"
          icon={<Server size={22} />}
        />

        <MetricCard
          title="Nodes online"
          value={`${onlineNodes}/${totalNodes}`}
          status={offlineNodes > 0 ? "warning" : "online"}
          subtitle={`${offlineNodes} offline`}
          icon={<CheckCircle2 size={22} />}
        />

        <MetricCard
          title="Average CPU"
          value={formatPercent(avgCpu)}
          status={statusFromPercent(avgCpu, 75, 90)}
          subtitle="Cluster CPU usage"
          icon={<Cpu size={22} />}
        />

        <MetricCard
          title="Average RAM"
          value={formatPercent(avgMemory)}
          status={statusFromPercent(avgMemory, 75, 90)}
          subtitle="Cluster memory usage"
          icon={<Activity size={22} />}
        />

        <MetricCard
          title="Disk usage"
          value={formatPercent(avgDisk)}
          status={statusFromPercent(avgDisk, 75, 90)}
          subtitle="Average root disk usage"
          icon={<HardDrive size={22} />}
        />

        <MetricCard
          title="Max temperature"
          value={maxTemp !== null ? `${maxTemp.toFixed(1)}°C` : "N/A"}
          status={statusFromTemperature(maxTemp)}
          subtitle={`${criticalCount} critical · ${warningCount} warning`}
          icon={<Thermometer size={22} />}
        />

        <MetricCard
          title="Active alerts"
          value={String(alerts.length)}
          status={alerts.length > 0 ? "warning" : "online"}
          subtitle={alerts.length > 0 ? "Needs attention" : "No active alerts"}
          icon={<Bell size={22} />}
        />

        <MetricCard
          title="Cluster status"
          value={formatTitle(clusterStatus)}
          status={clusterStatus}
          subtitle="Prometheus node health"
          icon={<ShieldAlert size={22} />}
        />
      </div>

      <div className="monitoring-main-grid">
        <section className="monitoring-panel monitoring-nodes-panel">
          <div className="monitoring-panel-header">
            <div>
              <h2>Raspberry Pi Nodes</h2>
              <p>Live metrics from Prometheus and Node Exporter.</p>
            </div>

            <span className="monitoring-count-pill">
              {nodes.length} nodes
            </span>
          </div>

          <div className="monitoring-table-wrap">
            <table className="monitoring-nodes-table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>Disk</th>
                  <th>Temp</th>
                  <th>Network</th>
                  <th>Uptime</th>
                </tr>
              </thead>

              <tbody>
                {nodes.map((node) => (
                  <tr key={node.instance}>
                    <td>
                      <div className="monitoring-node-cell">
                        <span
                          className={`monitoring-status-dot ${getStatusTone(
                            node.status,
                          )}`}
                        />
                        <div>
                          <strong>{node.name}</strong>
                          <small>{node.instance}</small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="monitoring-role-pill">
                        {node.role || "worker"}
                      </span>
                    </td>

                    <td>
                      <StatusBadge status={node.status} />
                    </td>

                    <td>
                      <ResourceBar value={node.cpu} />
                    </td>

                    <td>
                      <ResourceBar value={node.memory} />
                    </td>

                    <td>
                      <ResourceBar value={node.disk} />
                    </td>

                    <td>
                      <div className="monitoring-temp-cell">
                        <strong>
                          {node.temperature !== null
                            ? `${node.temperature.toFixed(1)}°C`
                            : "N/A"}
                        </strong>
                        <TempBadge status={node.temperatureStatus} />
                      </div>
                    </td>

                    <td>
                      <div className="monitoring-network-cell">
                        <span>↓ {formatRate(node.networkRx)}</span>
                        <span>↑ {formatRate(node.networkTx)}</span>
                      </div>
                    </td>

                    <td>{formatUptime(node.uptimeSeconds)}</td>
                  </tr>
                ))}

                {nodes.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="monitoring-empty-row">
                        No nodes returned by backend.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <AlertsPanel alerts={alerts} />
      </div>

      <div className="monitoring-service-grid">
        <MetricCard
          title="YOLO service"
          value={formatTitle(String(data?.services.yolo ?? "unknown"))}
          status={String(data?.services.yolo ?? "unknown")}
          subtitle="Inference service"
          icon={<Zap size={22} />}
        />

        <MetricCard
          title="Telegram bot"
          value={formatTitle(String(data?.services.telegram_bot ?? "unknown"))}
          status={String(data?.services.telegram_bot ?? "unknown")}
          subtitle="Telegram alert delivery"
          icon={<Bell size={22} />}
        />

        <MetricCard
          title="Prometheus"
          value={prometheusHasError ? "Error" : "Online"}
          status={prometheusHasError ? "critical" : "online"}
          subtitle="Metrics collection"
          icon={<Activity size={22} />}
        />

        <MetricCard
          title="Temperature health"
          value={
            maxTemp !== null
              ? maxTemp >= 70
                ? "Critical"
                : maxTemp >= 60
                  ? "Warning"
                  : "Normal"
              : "Unknown"
          }
          status={statusFromTemperature(maxTemp)}
          subtitle={maxTemp !== null ? `Max ${maxTemp.toFixed(1)}°C` : "No temp data"}
          icon={<Thermometer size={22} />}
        />
      </div>
    </section>
  );
}

function MetricCard({
  title,
  value,
  status,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  status: string;
  subtitle: string;
  icon: ReactNode;
}) {
  const tone = getStatusTone(status);

  return (
    <article className={`monitoring-stat-card ${tone}`}>
      <div className="monitoring-stat-top">
        <div>
          <p>{title}</p>
          <h3>{value}</h3>
        </div>

        <div className={`monitoring-stat-icon ${tone}`}>{icon}</div>
      </div>

      <span>{subtitle}</span>
    </article>
  );
}

function ResourceBar({ value }: { value: number | null }) {
  const percent = value === null ? 0 : Math.min(Math.max(value, 0), 100);
  const tone = statusFromPercent(value, 75, 90);

  return (
    <div className="monitoring-resource">
      <div className="monitoring-resource-top">
        <span>{formatPercent(value)}</span>
      </div>

      <div className="monitoring-resource-track">
        <div
          className={`monitoring-resource-fill ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: MonitoringAlert[] }) {
  return (
    <section className="monitoring-panel monitoring-alerts-panel">
      <div className="monitoring-panel-header">
        <div>
          <h2>Alerts</h2>
          <p>Temperature, CPU, RAM, disk, and cluster health alerts.</p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="monitoring-empty-state">
          <CheckCircle2 size={34} />
          <h3>No active alerts</h3>
          <p>Your cluster is currently healthy.</p>
        </div>
      ) : (
        <div className="monitoring-alert-list">
          {alerts.map((alert, index) => (
            <AlertCard
              key={`${alert.type}-${alert.instance ?? "alert"}-${index}`}
              alert={alert}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AlertCard({ alert }: { alert: MonitoringAlert }) {
  const tone = getStatusTone(alert.severity);

  return (
    <article className={`monitoring-alert-card ${tone}`}>
      <div className={`monitoring-alert-icon ${tone}`}>
        {tone === "critical" ? (
          <ShieldAlert size={20} />
        ) : tone === "warning" ? (
          <AlertTriangle size={20} />
        ) : (
          <Bell size={20} />
        )}
      </div>

      <div className="monitoring-alert-body">
        <div>
          <strong>{formatAlertTitle(alert.type, alert.severity)}</strong>
          <StatusBadge status={alert.severity} />
        </div>

        <p>{alert.message}</p>

        <div className="monitoring-alert-meta">
          {alert.instance && <span>Instance: {alert.instance}</span>}

          {alert.timestamp && (
            <span>Time: {formatTimestamp(alert.timestamp)}</span>
          )}
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = getStatusTone(status);

  return <span className={`monitoring-badge ${tone}`}>{formatTitle(status)}</span>;
}

function TempBadge({ status }: { status: TemperatureStatus }) {
  const tone = getTemperatureTone(status);

  return <span className={`monitoring-badge ${tone}`}>{formatTitle(status)}</span>;
}

function getStatusTone(status: string): StatusTone {
  const value = String(status || "").toLowerCase();

  if (value === "online" || value === "normal" || value === "info") {
    return "online";
  }

  if (value === "warning" || value === "degraded" || value === "unknown") {
    return value === "unknown" ? "unknown" : "warning";
  }

  if (
    value === "critical" ||
    value === "error" ||
    value === "offline" ||
    value === "failed"
  ) {
    return "critical";
  }

  return "unknown";
}

function getTemperatureTone(status: TemperatureStatus): StatusTone {
  if (status === "normal") return "online";
  if (status === "warning") return "warning";
  if (status === "critical") return "critical";
  return "unknown";
}

function statusFromPercent(
  value: number | null,
  warningLimit: number,
  criticalLimit: number,
): StatusTone {
  if (value === null || Number.isNaN(value)) return "unknown";
  if (value >= criticalLimit) return "critical";
  if (value >= warningLimit) return "warning";
  return "online";
}

function statusFromTemperature(value: number | null): StatusTone {
  if (value === null || Number.isNaN(value)) return "unknown";
  if (value >= 70) return "critical";
  if (value >= 60) return "warning";
  return "online";
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value.toFixed(1)}%`;
}

function formatRate(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  if (value < 1024) return `${value.toFixed(0)} B/s`;

  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`;

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB/s`;
}

function formatUptime(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function formatTitle(value: string) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function averageMetric(nodes: UiNode[], key: "cpu" | "memory" | "disk") {
  const values = nodes
    .map((node) => node[key])
    .filter((value): value is number => value !== null && !Number.isNaN(value));

  if (values.length === 0) return null;

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getMaxNodeTemperature(nodes: UiNode[]) {
  const values = nodes
    .map((node) => node.temperature)
    .filter((value): value is number => value !== null && !Number.isNaN(value));

  if (values.length === 0) return null;

  return Math.max(...values);
}

function hasPrometheusError(data: MonitoringOverview | null) {
  return Boolean(
    data?.debug?.prometheus_errors && data.debug.prometheus_errors.length > 0,
  );
}

function formatAlertTitle(type: string, severity: string) {
  const cleanType = type.replace(/_/g, " ");
  return `${severity.toUpperCase()} · ${cleanType}`;
}

function formatTimestamp(timestamp: number) {
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
