import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCcw,
  Server,
  Thermometer,
  Zap,
} from "lucide-react";
import {
  getClusterPerformanceOverview,
  type ClusterPerformanceNode,
  type ClusterPerformanceOverview,
  type ClusterPerformancePod,
} from "../../services/api";
import "./ClusterPerformancePage.css";

type MetricTone = "cyan" | "green" | "red" | "yellow";

export function ClusterPerformancePage() {
  const [overview, setOverview] = useState<ClusterPerformanceOverview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  async function loadClusterPerformance() {
    try {
      setApiNotice(null);

      const response = await getClusterPerformanceOverview();
      setOverview(response);
    } catch (error) {
      console.error("Cluster performance API error:", error);
      setOverview(null);
      setApiNotice(
        "Cluster performance API is not available. Check /api/v1/cluster-performance/overview.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadClusterPerformance();

    const interval = window.setInterval(() => {
      void loadClusterPerformance();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const nodes = useMemo(() => overview?.nodes ?? [], [overview]);
  const pods = useMemo(() => overview?.pods ?? [], [overview]);

  const hottestNodes = useMemo(() => {
    return [...nodes]
      .filter((node) => typeof node.temperature_c === "number")
      .sort(
        (firstNode, secondNode) =>
          (secondNode.temperature_c ?? 0) - (firstNode.temperature_c ?? 0),
      );
  }, [nodes]);

  const mostRestartedPods = useMemo(() => {
    return [...pods].sort(
      (firstPod, secondPod) => secondPod.restarts - firstPod.restarts,
    );
  }, [pods]);

  const clusterScore = overview?.cluster_score ?? 0;
  const clusterTone = getClusterScoreTone(clusterScore);

  return (
    <section className="cluster-page">
      <div className="cluster-page-header">
        <div>
          <p>K3S · PROMETHEUS · NODE EXPORTER</p>
          <h1>Cluster Performance</h1>
          <span>
            Real-time cluster health based on Kubernetes pods, Raspberry Pi node
            metrics, pod readiness, restarts, CPU, RAM, disk, and temperature.
          </span>
        </div>

        <button
          type="button"
          className="cluster-refresh-button"
          onClick={() => void loadClusterPerformance()}
        >
          <RefreshCcw size={17} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="cluster-api-notice">
          Loading cluster performance data...
        </div>
      )}

      {apiNotice && <div className="cluster-api-notice">{apiNotice}</div>}

      {overview?.errors.kubernetes && (
        <div className="cluster-api-notice">
          Kubernetes warning: {overview.errors.kubernetes}
        </div>
      )}

      <div className="cluster-stat-grid">
        <StatCard
          label="Cluster score"
          value={`${clusterScore}%`}
          sub={overview ? formatStatus(overview.status) : "Waiting for API"}
          tone={clusterTone}
          icon={<CheckCircle2 size={24} />}
        />

        <StatCard
          label="Nodes online"
          value={`${overview?.summary.online_nodes ?? 0}/${
            overview?.summary.total_nodes ?? 0
          }`}
          sub={`${overview?.summary.offline_nodes ?? 0} offline nodes`}
          tone={
            (overview?.summary.offline_nodes ?? 0) > 0 ? "yellow" : "green"
          }
          icon={<Server size={24} />}
        />

        <StatCard
          label="Pods ready"
          value={`${overview?.summary.ready_pods ?? 0}/${
            overview?.summary.total_pods ?? 0
          }`}
          sub={`${overview?.summary.running_pods ?? 0} running pods`}
          tone={getPodReadinessTone(overview)}
          icon={<Activity size={24} />}
        />

        <StatCard
          label="Pod restarts"
          value={String(overview?.summary.total_restarts ?? 0)}
          sub="Total container restarts"
          tone={(overview?.summary.total_restarts ?? 0) > 0 ? "yellow" : "green"}
          icon={<AlertTriangle size={24} />}
        />

        <StatCard
          label="Average CPU"
          value={formatPercent(overview?.resources.avg_cpu_percent)}
          sub="Cluster average"
          tone={getUsageTone(overview?.resources.avg_cpu_percent)}
          icon={<Cpu size={24} />}
        />

        <StatCard
          label="Average memory"
          value={formatPercent(overview?.resources.avg_memory_percent)}
          sub="Cluster average"
          tone={getUsageTone(overview?.resources.avg_memory_percent)}
          icon={<MemoryStick size={24} />}
        />

        <StatCard
          label="Average disk"
          value={formatPercent(overview?.resources.avg_disk_percent)}
          sub="Root filesystem usage"
          tone={getUsageTone(overview?.resources.avg_disk_percent)}
          icon={<HardDrive size={24} />}
        />

        <StatCard
          label="Max temperature"
          value={formatTemperature(overview?.resources.max_temperature_c)}
          sub="Hottest node"
          tone={getTemperatureTone(overview?.resources.max_temperature_c)}
          icon={<Thermometer size={24} />}
        />
      </div>

      <div className="cluster-workload-grid">
        <WorkloadCard
          title="Backend"
          value={overview?.workloads.backend_pods ?? 0}
          icon={<Server size={22} />}
        />

        <WorkloadCard
          title="Inference"
          value={overview?.workloads.inference_pods ?? 0}
          icon={<Zap size={22} />}
        />

        <WorkloadCard
          title="Image workers"
          value={overview?.workloads.image_worker_pods ?? 0}
          icon={<Activity size={22} />}
        />

        <WorkloadCard
          title="Telegram"
          value={overview?.workloads.telegram_pods ?? 0}
          icon={<Network size={22} />}
        />

        <WorkloadCard
          title="Storage"
          value={overview?.workloads.storage_pods ?? 0}
          icon={<HardDrive size={22} />}
        />
      </div>

      <div className="cluster-live-grid">
        <div className="cluster-panel">
          <div className="cluster-panel-header vertical">
            <h2>Node resource performance</h2>
            <p>Live Raspberry Pi metrics from Prometheus and Node Exporter.</p>
          </div>

          <NodeTable nodes={hottestNodes.length > 0 ? hottestNodes : nodes} />
        </div>

        <div className="cluster-panel">
          <div className="cluster-panel-header vertical">
            <h2>Pod reliability</h2>
            <p>Readiness, status, restart count, and scheduling node.</p>
          </div>

          <PodTable pods={mostRestartedPods} />
        </div>
      </div>

      <div className="cluster-live-grid">
        <div className="cluster-panel">
          <div className="cluster-panel-header vertical">
            <h2>Deployment evidence</h2>
            <p>Proof that the page is using live backend and K3s data.</p>
          </div>

          <EvidenceTable overview={overview} />
        </div>

        <div className="cluster-panel">
          <div className="cluster-panel-header vertical">
            <h2>Health signals</h2>
            <p>Simple interpretation of current cluster condition.</p>
          </div>

          <HealthSignalTable overview={overview} />
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: MetricTone;
  icon: ReactNode;
}) {
  return (
    <div className="cluster-stat-card">
      <div>
        <span>{label}</span>
        <strong className={tone}>{value}</strong>
        <p>{sub}</p>
      </div>

      <div className={`cluster-stat-icon ${tone}`}>{icon}</div>
    </div>
  );
}

function WorkloadCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="cluster-workload-card">
      <div className="cluster-workload-icon">{icon}</div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function NodeTable({ nodes }: { nodes: ClusterPerformanceNode[] }) {
  if (nodes.length === 0) {
    return <div className="cluster-empty">No node metrics returned.</div>;
  }

  return (
    <div className="cluster-table-wrap">
      <table className="cluster-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Status</th>
            <th>CPU</th>
            <th>Memory</th>
            <th>Disk</th>
            <th>Load</th>
            <th>Temp</th>
          </tr>
        </thead>

        <tbody>
          {nodes.map((node) => (
            <tr key={node.instance}>
              <td>
                <strong>{node.name}</strong>
                <small>{node.instance}</small>
              </td>

              <td>
                <span className={`cluster-pill ${statusClass(node.status)}`}>
                  {formatStatus(node.status)}
                </span>
              </td>

              <td>{formatPercent(node.cpu_percent)}</td>
              <td>{formatPercent(node.memory_percent)}</td>
              <td>{formatPercent(node.disk_percent)}</td>
              <td>{formatNumber(node.load1)}</td>
              <td>
                <span
                  className={`cluster-pill ${temperatureStatusClass(
                    node.temperature_c,
                  )}`}
                >
                  {formatTemperature(node.temperature_c)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PodTable({ pods }: { pods: ClusterPerformancePod[] }) {
  if (pods.length === 0) {
    return <div className="cluster-empty">No pod data returned.</div>;
  }

  return (
    <div className="cluster-table-wrap">
      <table className="cluster-table">
        <thead>
          <tr>
            <th>Pod</th>
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
                <strong>{pod.name}</strong>
                <small>{pod.namespace}</small>
              </td>

              <td>{pod.app}</td>

              <td>
                <span
                  className={`cluster-pill ${
                    pod.ready_bool ? "green" : "yellow"
                  }`}
                >
                  {pod.ready}
                </span>
              </td>

              <td>
                <span className={`cluster-pill ${statusClass(pod.status)}`}>
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

function EvidenceTable({
  overview,
}: {
  overview: ClusterPerformanceOverview | null;
}) {
  return (
    <div className="cluster-table-wrap">
      <table className="cluster-table">
        <tbody>
          <tr>
            <td>
              <strong>Backend endpoint</strong>
              <small>API route used by this page</small>
            </td>
            <td>/api/v1/cluster-performance/overview</td>
          </tr>

          <tr>
            <td>
              <strong>Namespace</strong>
              <small>Kubernetes namespace</small>
            </td>
            <td>{overview?.namespace ?? "N/A"}</td>
          </tr>

          <tr>
            <td>
              <strong>Prometheus</strong>
              <small>Metrics source</small>
            </td>
            <td>{overview?.prometheus_url ?? "N/A"}</td>
          </tr>

          <tr>
            <td>
              <strong>Last backend timestamp</strong>
              <small>Returned by backend</small>
            </td>
            <td>{overview?.timestamp ? formatDate(overview.timestamp) : "N/A"}</td>
          </tr>

          <tr>
            <td>
              <strong>Refresh interval</strong>
              <small>Frontend polling</small>
            </td>
            <td>5 seconds</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function HealthSignalTable({
  overview,
}: {
  overview: ClusterPerformanceOverview | null;
}) {
  const signals = [
    {
      name: "Node availability",
      value: `${overview?.summary.online_nodes ?? 0}/${
        overview?.summary.total_nodes ?? 0
      } online`,
      status:
        (overview?.summary.offline_nodes ?? 0) > 0 ? "yellow" : "green",
    },
    {
      name: "Pod readiness",
      value: `${overview?.summary.ready_pods ?? 0}/${
        overview?.summary.total_pods ?? 0
      } ready`,
      status:
        overview &&
        overview.summary.ready_pods === overview.summary.total_pods
          ? "green"
          : "yellow",
    },
    {
      name: "Restart pressure",
      value: `${overview?.summary.total_restarts ?? 0} restarts`,
      status:
        (overview?.summary.total_restarts ?? 0) > 0 ? "yellow" : "green",
    },
    {
      name: "Thermal condition",
      value: formatTemperature(overview?.resources.max_temperature_c),
      status: temperatureStatusClass(overview?.resources.max_temperature_c),
    },
    {
      name: "Disk pressure",
      value: formatPercent(overview?.resources.avg_disk_percent),
      status: usageStatusClass(overview?.resources.avg_disk_percent),
    },
  ];

  return (
    <div className="cluster-table-wrap">
      <table className="cluster-table">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Value</th>
            <th>State</th>
          </tr>
        </thead>

        <tbody>
          {signals.map((signal) => (
            <tr key={signal.name}>
              <td>
                <strong>{signal.name}</strong>
              </td>

              <td>{signal.value}</td>

              <td>
                <span className={`cluster-pill ${signal.status}`}>
                  {formatStatus(signal.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getClusterScoreTone(score: number): MetricTone {
  if (score >= 85) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

function getPodReadinessTone(
  overview: ClusterPerformanceOverview | null,
): MetricTone {
  if (!overview || overview.summary.total_pods === 0) return "yellow";

  if (overview.summary.ready_pods === overview.summary.total_pods) {
    return "green";
  }

  return "yellow";
}

function getUsageTone(value: number | null | undefined): MetricTone {
  if (typeof value !== "number") return "yellow";
  if (value >= 90) return "red";
  if (value >= 75) return "yellow";
  return "green";
}

function getTemperatureTone(value: number | null | undefined): MetricTone {
  if (typeof value !== "number") return "yellow";
  if (value >= 70) return "red";
  if (value >= 60) return "yellow";
  return "green";
}

function statusClass(status: string) {
  const value = status.toLowerCase();

  if (["online", "running", "ready", "healthy", "normal"].includes(value)) {
    return "green";
  }

  if (["warning", "degraded", "pending", "unknown"].includes(value)) {
    return "yellow";
  }

  if (["critical", "offline", "failed", "error"].includes(value)) {
    return "red";
  }

  return "yellow";
}

function usageStatusClass(value: number | null | undefined) {
  if (typeof value !== "number") return "yellow";
  if (value >= 90) return "red";
  if (value >= 75) return "yellow";
  return "green";
}

function temperatureStatusClass(value: number | null | undefined) {
  if (typeof value !== "number") return "yellow";
  if (value >= 70) return "red";
  if (value >= 60) return "yellow";
  return "green";
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") return "N/A";
  return `${value.toFixed(1)}%`;
}

function formatTemperature(value: number | null | undefined) {
  if (typeof value !== "number") return "N/A";
  return `${value.toFixed(1)}°C`;
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number") return "N/A";
  return value.toFixed(2);
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAge(value: number | null) {
  if (value === null || value === undefined) return "N/A";

  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;

  return `${minutes}m`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
