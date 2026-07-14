import { useEffect, useMemo, useState } from "react";
import {
  getMonitoringOverview,
  type MonitoringAlert,
  type MonitoringOverview,
  type MonitoringNode,
  type TemperatureStatus,
} from "../../services/api";

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
      setError(err instanceof Error ? err.message : "Failed to load monitoring data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadMonitoringData();

    const interval = window.setInterval(() => {
      loadMonitoringData();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const nodes = useMemo<UiNode[]>(() => {
    return (
      data?.cluster.nodes.map((node: MonitoringNode) => {
        return {
          name: node.name.replace(":9100", ""),
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
    data?.summary.online_nodes ?? nodes.filter((node) => node.status === "online").length;
  const offlineNodes =
    data?.summary.offline_nodes ?? nodes.filter((node) => node.status === "offline").length;

  const avgCpu = data?.summary.avg_cpu_percent ?? null;
  const avgMemory = data?.summary.avg_memory_percent ?? null;
  const avgDisk = data?.summary.avg_disk_percent ?? null;
  const maxTemp = data?.summary.max_temperature_c ?? null;

  const criticalCount =
    data?.summary.critical_alerts ??
    alerts.filter((alert) => alert.severity === "critical").length;

  const warningCount =
    data?.summary.warning_alerts ??
    alerts.filter((alert) => alert.severity === "warning").length;

  if (loading) {
    return <div className="monitoring-box">Loading monitoring data...</div>;
  }

  return (
    <div className="monitoring-page">
      {error && (
        <div className="api-error">
          <strong>Monitoring API Error</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="monitoring-topbar">
        <div>
          <h3>Live Cluster Monitoring</h3>
          <p>Backend, services, Raspberry Pi nodes, CPU, RAM, disk, temperature, and alerts.</p>
          {lastUpdated && <span>Last updated: {lastUpdated}</span>}
        </div>

        <button type="button" onClick={loadMonitoringData} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="monitoring-grid">
        <MetricCard
          title="Backend API"
          value={data?.backend.status === "online" ? "Online" : "Offline"}
          status={data?.backend.status ?? "unknown"}
          subtitle="FastAPI backend"
        />

        <MetricCard
          title="Nodes Online"
          value={`${onlineNodes}/${totalNodes}`}
          status={offlineNodes > 0 ? "warning" : "online"}
          subtitle={`${offlineNodes} offline`}
        />

        <MetricCard
          title="Average CPU"
          value={avgCpu !== null ? `${avgCpu.toFixed(1)}%` : "N/A"}
          status={avgCpu !== null && avgCpu >= 80 ? "warning" : "online"}
          subtitle="Cluster CPU usage"
        />

        <MetricCard
          title="Average RAM"
          value={avgMemory !== null ? `${avgMemory.toFixed(1)}%` : "N/A"}
          status={avgMemory !== null && avgMemory >= 80 ? "warning" : "online"}
          subtitle="Cluster memory usage"
        />

        <MetricCard
          title="Disk Usage"
          value={avgDisk !== null ? `${avgDisk.toFixed(1)}%` : "N/A"}
          status={avgDisk !== null && avgDisk >= 80 ? "warning" : "online"}
          subtitle="Average root disk usage"
        />

        <MetricCard
          title="Max Temperature"
          value={maxTemp !== null ? `${maxTemp.toFixed(1)}°C` : "N/A"}
          status={maxTemp !== null && maxTemp >= 70 ? "critical" : maxTemp !== null && maxTemp >= 60 ? "warning" : "online"}
          subtitle={`${criticalCount} critical · ${warningCount} warning`}
        />

        <MetricCard
          title="Active Alerts"
          value={String(alerts.length)}
          status={alerts.length > 0 ? "warning" : "online"}
          subtitle={alerts.length > 0 ? "Needs attention" : "No active alerts"}
        />

        <MetricCard
          title="Cluster Status"
          value={data?.cluster.status ?? "Unknown"}
          status={data?.cluster.status ?? "unknown"}
          subtitle="Prometheus node health"
        />
      </div>

      <div className="monitoring-layout">
        <section className="monitoring-panel nodes-panel">
          <div className="panel-header">
            <h3>Nodes</h3>
            <p>Live node metrics from Prometheus and Node Exporter</p>
          </div>

          <div className="table-wrapper">
            <table className="nodes-table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>Disk</th>
                  <th>Temperature</th>
                  <th>Temp Status</th>
                </tr>
              </thead>

              <tbody>
                {nodes.map((node) => (
                  <tr key={node.instance}>
                    <td>
                      <div className="node-name">
                        <span className={`status-dot ${node.status}`} />
                        {node.name}
                      </div>
                    </td>

                    <td>{node.role}</td>

                    <td>
                      <StatusBadge status={node.status} />
                    </td>

                    <td>{formatPercent(node.cpu)}</td>

                    <td>{formatPercent(node.memory)}</td>

                    <td>{formatPercent(node.disk)}</td>

                    <td>
                      {node.temperature !== null ? `${node.temperature.toFixed(1)}°C` : "N/A"}
                    </td>

                    <td>
                      <TempBadge status={node.temperatureStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <AlertsPanel alerts={alerts} />
      </div>

      <div className="monitoring-grid service-grid">
        <MetricCard
          title="YOLO Service"
          value={String(data?.services.yolo ?? "Unknown")}
          status={String(data?.services.yolo ?? "unknown")}
          subtitle="Inference service"
        />

        <MetricCard
          title="Telegram Bot"
          value={String(data?.services.telegram_bot ?? "Unknown")}
          status={String(data?.services.telegram_bot ?? "unknown")}
          subtitle="Telegram alert service"
        />

        <MetricCard
          title="Prometheus"
          value={hasPrometheusError(data) ? "Error" : "Online"}
          status={hasPrometheusError(data) ? "critical" : "online"}
          subtitle="Node exporter metrics"
        />

        <MetricCard
  title="Temperature Health"
  value={
    maxTemp !== null
      ? maxTemp >= 70
        ? "Critical"
        : maxTemp >= 60
        ? "Warning"
        : "Normal"
      : "Unknown"
  }
  status={
    maxTemp !== null && maxTemp >= 70
      ? "critical"
      : maxTemp !== null && maxTemp >= 60
      ? "warning"
      : maxTemp !== null
      ? "online"
      : "unknown"
  }
  subtitle={maxTemp !== null ? `Max temp ${maxTemp.toFixed(1)}°C` : "No temperature data"}
/>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  status,
  subtitle,
}: {
  title: string;
  value: string;
  status: string;
  subtitle: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-card-top">
        <p>{title}</p>
        <span className={`status-dot ${status}`} />
      </div>

      <h2>{value}</h2>
      <span>{subtitle}</span>
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: MonitoringAlert[] }) {
  return (
    <section className="monitoring-panel alerts-panel">
      <div className="panel-header">
        <h3>Alerts</h3>
        <p>Temperature, CPU, RAM, disk, and cluster health alerts</p>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-alert">No active alerts.</div>
      ) : (
        <div className="alert-list">
          {alerts.map((alert, index) => (
            <div
              key={`${alert.type}-${alert.instance ?? "alert"}-${index}`}
              className={`alert-card ${alert.severity}`}
            >
              <strong>{formatAlertTitle(alert.type, alert.severity)}</strong>
              <p>{alert.message}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

function TempBadge({ status }: { status: TemperatureStatus }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return `${value.toFixed(1)}%`;
}

function hasPrometheusError(data: MonitoringOverview | null) {
  return Boolean(data?.debug?.prometheus_errors && data.debug.prometheus_errors.length > 0);
}


function formatAlertTitle(type: string, severity: string) {
  const cleanType = type.replace(/_/g, " ");
  return `${severity.toUpperCase()} · ${cleanType}`;
}
