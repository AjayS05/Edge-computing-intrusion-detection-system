import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getKubernetesPods,
  getMonitoringOverview,
  getTelegramStatus,
  type KubernetesPod,
  type KubernetesPodsResponse,
  type MonitoringAlert,
  type MonitoringNode,
  type MonitoringOverview,
  type TelegramStatusResponse,
} from "../../services/api";
import "./DashboardPage.css";

export function DashboardPage() {
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [podsData, setPodsData] = useState<KubernetesPodsResponse | null>(null);
  const [telegramData, setTelegramData] =
    useState<TelegramStatusResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [podsError, setPodsError] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setError(null);
      setPodsError(null);
      setTelegramError(null);

      const overviewResponse = await getMonitoringOverview();
      setData(overviewResponse);

      try {
        const podsResponse = await getKubernetesPods();
        setPodsData(podsResponse);
      } catch (podErr) {
        setPodsData(null);
        setPodsError(
          podErr instanceof Error
            ? podErr.message
            : "Failed to load Kubernetes pods",
        );
      }

      try {
        const telegramResponse = await getTelegramStatus();
        setTelegramData(telegramResponse);
      } catch (telegramErr) {
        setTelegramData(null);
        setTelegramError(
          telegramErr instanceof Error
            ? telegramErr.message
            : "Failed to load Telegram status",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard data",
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
    return [...(data?.cluster?.nodes ?? [])]
      .filter((node) => typeof node.temperature_c === "number")
      .sort(
        (firstNode, secondNode) =>
          (secondNode.temperature_c ?? 0) - (firstNode.temperature_c ?? 0),
      )
      .slice(0, 5);
  }, [data]);

  const kubernetesPods = useMemo(() => {
    const pods = podsData?.pods ?? [];

    return [...pods].sort((firstPod, secondPod) => {
      const firstIsYolo = isYoloPod(firstPod) ? 0 : 1;
      const secondIsYolo = isYoloPod(secondPod) ? 0 : 1;

      if (firstIsYolo !== secondIsYolo) {
        return firstIsYolo - secondIsYolo;
      }

      return firstPod.name.localeCompare(secondPod.name);
    });
  }, [podsData]);

  const latestAlerts = data?.alerts?.slice(0, 4) ?? [];

  const runningPods = podsData?.running_pods ?? 0;
  const totalPods = podsData?.total_pods ?? 0;

  const yoloStatus =
    podsData?.yolo_status ?? String(data?.services.yolo ?? "unknown");

  const yoloPod = podsData?.yolo_pods?.[0];

  const yoloSubtitle = yoloPod
    ? `${yoloPod.name} · ready ${yoloPod.ready}`
    : podsData
      ? "No YOLO pod found"
      : "Kubernetes pod API not loaded";

  const telegramStatus =
    telegramData?.status ?? String(data?.services.telegram_bot ?? "unknown");

  const telegramSubtitle = telegramData
    ? `${telegramData.bot_name} · ${telegramData.mode}`
    : "Telegram API not loaded";

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

      {podsError && (
        <div className="dashboard-error" role="alert">
          <strong>Kubernetes Pods API Error</strong>
          <p>{podsError}</p>
        </div>
      )}

      {telegramError && (
        <div className="dashboard-error" role="alert">
          <strong>Telegram API Error</strong>
          <p>{telegramError}</p>
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
          title="Kubernetes Pods"
          value={`${runningPods}/${totalPods}`}
          subtitle="Running pods in edge-monitoring"
          status={
            totalPods === 0
              ? "unknown"
              : runningPods === totalPods
                ? "online"
                : "warning"
          }
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
          title="Max Temperature"
          value={formatTemperature(data?.summary.max_temperature_c)}
          subtitle="Highest node temperature"
          status={getTemperatureStatus(data?.summary.max_temperature_c)}
        />
      </section>

      <section className="dashboard-metric-grid" aria-label="Service overview">
        <MetricCard
          title="YOLO Service"
          value={formatStatus(yoloStatus)}
          subtitle={yoloSubtitle}
          status={yoloStatus}
        />

        <MetricCard
          title="Telegram Bot"
          value={formatStatus(telegramStatus)}
          subtitle={telegramSubtitle}
          status={telegramStatus}
        />

        <MetricCard
          title="Images Stored"
          value="S3"
          subtitle="SeaweedFS object storage"
          status="online"
        />

        <MetricCard
          title="Detection Pipeline"
          value="Ready"
          subtitle="Pi4 camera → Pi3 workers → Pi5 backend"
          status="online"
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
            Backend-connected services reported by real backend APIs.
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

          <ServiceStatus name="YOLO" value={yoloStatus} />

          <ServiceStatus name="Telegram Bot" value={telegramStatus} />
        </div>
      </section>

      <section className="dashboard-panel dashboard-pods-panel">
        <div className="dashboard-panel-header">
          <div>
            <h3 className="dashboard-panel-title">Kubernetes Pods</h3>
            <p className="dashboard-panel-description">
              Running pods reported from the K3s Kubernetes API.
            </p>
          </div>

          <div className="dashboard-pods-count">
            <strong>
              {runningPods}/{totalPods}
            </strong>
            <span>running</span>
          </div>
        </div>

        {kubernetesPods.length === 0 ? (
          <div className="dashboard-empty">
            No Kubernetes pods returned by backend.
          </div>
        ) : (
          <PodTable pods={kubernetesPods} />
        )}
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

function PodTable({ pods }: { pods: KubernetesPod[] }) {
  return (
    <div className="dashboard-pods-table-wrap">
      <table className="dashboard-pods-table">
        <thead>
          <tr>
            <th>Pod</th>
            <th>Namespace</th>
            <th>App</th>
            <th>Ready</th>
            <th>Status</th>
            <th>Restarts</th>
            <th>Node</th>
            <th>Age</th>
          </tr>
        </thead>

        <tbody>
          {pods.map((pod) => (
            <tr key={`${pod.namespace}-${pod.name}`}>
              <td>
                <div className="dashboard-pod-name-cell">
                  <StatusDot status={pod.status} />
                  <strong>{pod.name}</strong>
                </div>
              </td>

              <td>{pod.namespace}</td>

              <td>
                <span className="dashboard-pod-app-pill">{pod.app}</span>
              </td>

              <td>
                <span
                  className={
                    pod.ready_bool
                      ? "dashboard-ready-pill online"
                      : "dashboard-ready-pill warning"
                  }
                >
                  {pod.ready}
                </span>
              </td>

              <td>
                <span
                  className={`dashboard-pod-status-pill ${getStatusClass(
                    pod.status,
                  )}`}
                >
                  {formatStatus(pod.status)}
                </span>
              </td>

              <td>{pod.restarts}</td>

              <td>{pod.node ?? "N/A"}</td>

              <td>{formatAge(pod.age_seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
    normalizedStatus === "ready" ||
    normalizedStatus === "succeeded"
  ) {
    return "online";
  }

  if (
    normalizedStatus === "warning" ||
    normalizedStatus === "unknown" ||
    normalizedStatus === "degraded" ||
    normalizedStatus === "pending" ||
    normalizedStatus === "containercreating"
  ) {
    return "warning";
  }

  if (
    normalizedStatus === "critical" ||
    normalizedStatus === "error" ||
    normalizedStatus === "offline" ||
    normalizedStatus === "failed" ||
    normalizedStatus === "unhealthy" ||
    normalizedStatus === "crashloopbackoff" ||
    normalizedStatus === "imagepullbackoff"
  ) {
    return "critical";
  }

  return "warning";
}

function isYoloPod(pod: KubernetesPod) {
  const searchableText = [
    pod.name,
    pod.app,
    pod.namespace,
    ...Object.values(pod.labels ?? {}),
  ]
    .join(" ")
    .toLowerCase();

  return (
    searchableText.includes("yolo") ||
    searchableText.includes("inference") ||
    searchableText.includes("model")
  );
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

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function cleanNodeName(value: string) {
  return value.replace(":9100", "");
}

function formatAge(value: number | null) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
