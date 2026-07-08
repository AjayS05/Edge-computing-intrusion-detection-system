import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PROMETHEUS_API_BASE =
  import.meta.env.VITE_PROMETHEUS_API_BASE || "/prometheus";

const GRAFANA_URL =
  import.meta.env.VITE_GRAFANA_URL || "http://127.0.0.1:3000";

const REFRESH_INTERVAL_MS = Number(
  import.meta.env.VITE_REFRESH_INTERVAL_MS || 5000
);

const CHART_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#be123c",
  "#4338ca",
];

function formatDate(value) {
  if (!value) return "Unknown time";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function getConfidencePercent(item) {
  if (typeof item?.confidence_percent === "number") {
    return `${item.confidence_percent.toFixed(1)}%`;
  }

  if (typeof item?.confidence === "number") {
    return `${(item.confidence * 100).toFixed(1)}%`;
  }

  return "N/A";
}

function severityClass(severity) {
  return `severity ${String(severity || "unknown")
    .toLowerCase()
    .replaceAll(" ", "_")}`;
}

function getMetricInstanceName(metric) {
  return (
    metric.nodename ||
    metric.instance ||
    metric.node ||
    metric.job ||
    "unknown-node"
  );
}

function safeMetricKey(value) {
  return String(value || "unknown")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 80);
}

async function prometheusInstantQuery(query) {
  const url = `${PROMETHEUS_API_BASE}/api/v1/query?query=${encodeURIComponent(
    query
  )}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Prometheus query failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== "success") {
    throw new Error("Prometheus returned unsuccessful response");
  }

  return data.data.result || [];
}

async function prometheusRangeQuery(query, minutes = 10, stepSeconds = 30) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - minutes * 60;

  const url =
    `${PROMETHEUS_API_BASE}/api/v1/query_range` +
    `?query=${encodeURIComponent(query)}` +
    `&start=${start}` +
    `&end=${end}` +
    `&step=${stepSeconds}s`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Prometheus range query failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== "success") {
    throw new Error("Prometheus returned unsuccessful response");
  }

  return data.data.result || [];
}

function buildChartData(prometheusSeries) {
  const rowsByTimestamp = new Map();
  const seriesList = [];

  for (const item of prometheusSeries) {
    const instanceName = getMetricInstanceName(item.metric);
    const key = safeMetricKey(instanceName);

    if (!seriesList.some((series) => series.key === key)) {
      seriesList.push({
        key,
        label: instanceName,
      });
    }

    for (const [timestamp, value] of item.values || []) {
      const numericValue = Number(value);

      if (!Number.isFinite(numericValue)) continue;

      if (!rowsByTimestamp.has(timestamp)) {
        rowsByTimestamp.set(timestamp, {
          timestamp,
          time: new Date(timestamp * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        });
      }

      rowsByTimestamp.get(timestamp)[key] = Number(numericValue.toFixed(2));
    }
  }

  const chartData = Array.from(rowsByTimestamp.values()).sort(
    (a, b) => Number(a.timestamp) - Number(b.timestamp)
  );

  return {
    chartData,
    seriesList,
  };
}

function PrometheusLineChart({ title, description, queries, unit }) {
  const [chartData, setChartData] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [error, setError] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const queryList = Array.isArray(queries) ? queries : [queries];

  async function loadChart() {
    try {
      setError("");

      for (const query of queryList) {
        const result = await prometheusRangeQuery(query, 10, 30);

        if (result.length > 0) {
          const built = buildChartData(result);
          setChartData(built.chartData);
          setSeriesList(built.seriesList);
          setActiveQuery(query);
          return;
        }
      }

      setChartData([]);
      setSeriesList([]);
      setActiveQuery("");
      setError("No data returned for this metric.");
    } catch (err) {
      setChartData([]);
      setSeriesList([]);
      setError(err.message || "Could not load metric graph.");
    }
  }

  useEffect(() => {
    loadChart();

    const intervalId = setInterval(loadChart, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <section className="metric-chart-card">
      <div className="metric-chart-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>

      {error && <div className="metric-error">{error}</div>}

      {!error && chartData.length > 0 && seriesList.length > 0 && (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" minTickGap={24} />
              <YAxis unit={unit} />
              <Tooltip />
              <Legend />
              {seriesList.map((series, index) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {activeQuery && (
        <p className="metric-query">
          Query: <code>{activeQuery}</code>
        </p>
      )}
    </section>
  );
}

function PrometheusAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [lastChecked, setLastChecked] = useState(null);
  const [error, setError] = useState("");

  async function loadAlerts() {
    try {
      setError("");
      const newAlerts = [];

      const upQueries = [
        'up{job=~".*node.*|.*node_exporter.*|.*node-exporter.*"}',
        "up",
      ];

      let upResults = [];

      for (const query of upQueries) {
        upResults = await prometheusInstantQuery(query);
        if (upResults.length > 0) break;
      }

      const downNodes = upResults.filter((item) => Number(item.value?.[1]) === 0);

      downNodes.forEach((item) => {
        newAlerts.push({
          type: "critical",
          title: "Node down",
          message: `${getMetricInstanceName(item.metric)} is down or unreachable from Prometheus.`,
        });
      });

      const tempQueries = [
        "max by(instance) (node_hwmon_temp_celsius)",
        "max by(instance) (node_thermal_zone_temp)",
        "max by(instance) (raspberry_pi_temperature_celsius)",
      ];

      let tempResults = [];
      let tempQueryUsed = "";

      for (const query of tempQueries) {
        tempResults = await prometheusInstantQuery(query);
        if (tempResults.length > 0) {
          tempQueryUsed = query;
          break;
        }
      }

      if (tempResults.length === 0) {
        newAlerts.push({
          type: "info",
          title: "Temperature metric not available",
          message:
            "Prometheus is reachable, but no Raspberry Pi temperature metric was found.",
        });
      } else {
        tempResults.forEach((item) => {
          const temperature = Number(item.value?.[1]);
          const instance = getMetricInstanceName(item.metric);

          if (Number.isFinite(temperature) && temperature >= 70) {
            newAlerts.push({
              type: "critical",
              title: "High temperature",
              message: `${instance} is at ${temperature.toFixed(
                1
              )}°C. Check cooling/load.`,
            });
          } else if (Number.isFinite(temperature) && temperature >= 60) {
            newAlerts.push({
              type: "warning",
              title: "Temperature warning",
              message: `${instance} is at ${temperature.toFixed(
                1
              )}°C. Monitor closely.`,
            });
          }
        });
      }

      if (newAlerts.length === 0) {
        newAlerts.push({
          type: "ok",
          title: "No active monitoring alerts",
          message: "All monitored nodes appear healthy based on Prometheus data.",
        });
      }

      setAlerts(newAlerts);
      setLastChecked(new Date());
    } catch (err) {
      setError(err.message || "Could not check Prometheus alerts.");
      setAlerts([
        {
          type: "critical",
          title: "Prometheus unavailable",
          message:
            "Frontend could not query Prometheus. Check Prometheus service and Vite proxy.",
        },
      ]);
    }
  }

  useEffect(() => {
    loadAlerts();

    const intervalId = setInterval(loadAlerts, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <section className="alerts-section">
      <div className="section-title">
        <h2>Monitoring Alerts</h2>
        <p>
          Alerts based on Prometheus node status and Raspberry Pi temperature
          metrics.
        </p>
      </div>

      {error && <div className="error-box">Prometheus alert error: {error}</div>}

      <div className="alerts-grid">
        {alerts.map((alert, index) => (
          <div className={`alert-card ${alert.type}`} key={index}>
            <strong>{alert.title}</strong>
            <p>{alert.message}</p>
          </div>
        ))}
      </div>

      <p className="alert-last-check">
        Last alert check: {lastChecked ? lastChecked.toLocaleTimeString() : "Never"}
      </p>
    </section>
  );
}

function PrometheusGraphs() {
  return (
    <section className="prometheus-graphs-section">
      <div className="section-title">
        <h2>Prometheus Metrics Graphs</h2>
        <p>
          Live infrastructure graphs from Prometheus for Raspberry Pi cluster
          monitoring.
        </p>
      </div>

      <div className="charts-grid">
        <PrometheusLineChart
          title="CPU Usage"
          description="CPU usage percentage per monitored node over the last 10 minutes."
          unit="%"
          queries={[
            '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)',
          ]}
        />

        <PrometheusLineChart
          title="Memory Usage"
          description="RAM usage percentage per monitored node over the last 10 minutes."
          unit="%"
          queries={[
            "100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))",
          ]}
        />

        <PrometheusLineChart
          title="Temperature"
          description="Raspberry Pi temperature per node if temperature metric is available."
          unit="°C"
          queries={[
            "max by(instance) (node_hwmon_temp_celsius)",
            "max by(instance) (node_thermal_zone_temp)",
            "max by(instance) (raspberry_pi_temperature_celsius)",
          ]}
        />
      </div>
    </section>
  );
}
function MainDashboardOverview({ events, backendOnline }) {
  const today = new Date().toISOString().slice(0, 10);

  const eventsToday = events.filter((event) => {
    const eventDate = String(event.created_at || event.captured_at || "").slice(
      0,
      10
    );
    return eventDate === today;
  });

  const peopleDetected = eventsToday.filter(
    (event) => String(event.event_type).toLowerCase() === "person"
  ).length;

  const threatTypes = [
    "fire",
    "weapon",
    "intruder",
    "smoke",
    "liquid_spill",
    "vandalism",
  ];

  const threatsDetected = eventsToday.filter((event) =>
    threatTypes.includes(String(event.event_type).toLowerCase())
  ).length;

  const latestAlert = [...events]
    .filter((event) =>
      ["critical", "high"].includes(String(event.severity).toLowerCase())
    )
    .sort((a, b) => {
      const dateA = new Date(a.created_at || a.captured_at || 0).getTime();
      const dateB = new Date(b.created_at || b.captured_at || 0).getTime();
      return dateB - dateA;
    })[0];

  const yoloStatus = backendOnline ? "Running" : "Unknown";
  const telegramStatus = "Unknown";

  return (
    <section className="overview-section">
      <div className="section-title">
        <h2>Main Dashboard Overview</h2>
        <p>
          High-level status of backend services, Raspberry Pi cluster, and latest
          detection activity.
        </p>
      </div>

      <div className="overview-grid">
        <div className="overview-card">
          <span className="overview-label">System Status</span>

          <div className="status-row">
            <span>Backend API</span>
            <strong className={backendOnline ? "online" : "offline"}>
              {backendOnline ? "Online" : "Offline"}
            </strong>
          </div>

          <div className="status-row">
            <span>YOLO Service</span>
            <strong className={backendOnline ? "online" : "unknown-status"}>
              {yoloStatus}
            </strong>
          </div>

          <div className="status-row">
            <span>Telegram Bot</span>
            <strong className="unknown-status">{telegramStatus}</strong>
          </div>
        </div>

        <div className="overview-card">
          <span className="overview-label">Cluster Health</span>

          <div className="status-row">
            <span>Pi5 Master</span>
            <strong className="unknown-status">Check Prometheus</strong>
          </div>

          <div className="status-row">
            <span>Pi4 Sensor Node</span>
            <strong className="unknown-status">Check Prometheus</strong>
          </div>

          <div className="status-row">
            <span>Pi3 Workers</span>
            <strong className="unknown-status">Check Prometheus</strong>
          </div>
        </div>

        <div className="overview-card">
          <span className="overview-label">Detection Summary</span>

          <div className="big-number-row">
            <div>
              <strong>{eventsToday.length}</strong>
              <p>Total events today</p>
            </div>

            <div>
              <strong>{peopleDetected}</strong>
              <p>People detected</p>
            </div>

            <div>
              <strong>{threatsDetected}</strong>
              <p>Threats detected</p>
            </div>
          </div>
        </div>

        <div className="overview-card latest-alert-card">
          <span className="overview-label">Latest Alert</span>

          {latestAlert ? (
            <>
              <div className="latest-alert-title">
                <strong>{latestAlert.event_type}</strong>
                <span className={severityClass(latestAlert.severity)}>
                  {latestAlert.severity}
                </span>
              </div>

              <p>
                Camera: {latestAlert.sensor_node_id || "N/A"} | Location:{" "}
                {latestAlert.camera_location || "N/A"}
              </p>

              <p>{formatDate(latestAlert.created_at || latestAlert.captured_at)}</p>
            </>
          ) : (
            <div className="no-alert-box">
              No high or critical alert detected yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
function MainDashboard({ events, backendOnline }) {
  const [clusterSummary, setClusterSummary] = useState({
    total: 0,
    online: 0,
    offline: 0,
    pi3Online: 0,
    pi3Offline: 0,
  });

  useEffect(() => {
    async function loadClusterHealth() {
      try {
        const results = await prometheusInstantQuery("up");

        const nodes = results.filter((item) => {
          const instance = item.metric?.instance || "";
          return instance.includes(":9100");
        });

        const onlineNodes = nodes.filter(
          (item) => Number(item.value?.[1]) === 1
        );

        const offlineNodes = nodes.filter(
          (item) => Number(item.value?.[1]) === 0
        );

        const pi3Nodes = nodes.filter((item) => {
          const instance = item.metric?.instance || "";
          return (
            instance.includes("192.168.50.101") ||
            instance.includes("192.168.50.102") ||
            instance.includes("192.168.50.103") ||
            instance.includes("192.168.50.104") ||
            instance.includes("192.168.50.105") ||
            instance.includes("192.168.50.106") ||
            instance.includes("192.168.50.107") ||
            instance.includes("192.168.50.108")
          );
        });

        const pi3Online = pi3Nodes.filter(
          (item) => Number(item.value?.[1]) === 1
        ).length;

        const pi3Offline = pi3Nodes.filter(
          (item) => Number(item.value?.[1]) === 0
        ).length;

        setClusterSummary({
          total: nodes.length,
          online: onlineNodes.length,
          offline: offlineNodes.length,
          pi3Online,
          pi3Offline,
        });
      } catch {
        setClusterSummary({
          total: 0,
          online: 0,
          offline: 0,
          pi3Online: 0,
          pi3Offline: 0,
        });
      }
    }

    loadClusterHealth();

    const intervalId = setInterval(loadClusterHealth, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const eventsToday = events.filter((event) => {
    const eventDate = String(event.created_at || event.captured_at || "").slice(
      0,
      10
    );
    return eventDate === today;
  });

  const peopleDetected = eventsToday.filter(
    (event) => String(event.event_type).toLowerCase() === "person"
  ).length;

  const threatTypes = [
    "fire",
    "weapon",
    "intruder",
    "smoke",
    "liquid_spill",
    "vandalism",
  ];

  const threatsDetected = eventsToday.filter((event) =>
    threatTypes.includes(String(event.event_type).toLowerCase())
  ).length;

  const latestAlert = [...events]
    .filter((event) =>
      ["critical", "high"].includes(String(event.severity).toLowerCase())
    )
    .sort((a, b) => {
      const dateA = new Date(a.created_at || a.captured_at || 0).getTime();
      const dateB = new Date(b.created_at || b.captured_at || 0).getTime();
      return dateB - dateA;
    })[0];

  return (
    <section className="main-dashboard">
      <div className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Main Dashboard</p>
          <h2>Edge AI Security Monitoring Overview</h2>
          <p>
            Live status of backend services, Raspberry Pi cluster health, YOLO
            detections, and latest security alerts.
          </p>
        </div>

        <div className={backendOnline ? "hero-status online-bg" : "hero-status offline-bg"}>
          {backendOnline ? "System Online" : "System Offline"}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <span className="dashboard-label">System Status</span>

          <div className="dashboard-row">
            <span>Backend API</span>
            <strong className={backendOnline ? "online" : "offline"}>
              {backendOnline ? "Online" : "Offline"}
            </strong>
          </div>

          <div className="dashboard-row">
            <span>YOLO Detection</span>
            <strong className={backendOnline ? "online" : "unknown-status"}>
              {backendOnline ? "Running" : "Unknown"}
            </strong>
          </div>

          <div className="dashboard-row">
            <span>Telegram Bot</span>
            <strong className="unknown-status">Check Service</strong>
          </div>
        </div>

        <div className="dashboard-card">
          <span className="dashboard-label">Cluster Health</span>

          <div className="cluster-health-row">
            <div>
              <strong>{clusterSummary.online}</strong>
              <p>Online nodes</p>
            </div>

            <div>
              <strong>{clusterSummary.offline}</strong>
              <p>Offline nodes</p>
            </div>

            <div>
              <strong>{clusterSummary.pi3Online}/8</strong>
              <p>Pi3 workers</p>
            </div>
          </div>

          {clusterSummary.pi3Offline > 0 ? (
            <div className="mini-alert danger-mini">
              {clusterSummary.pi3Offline} Pi3 worker node(s) down
            </div>
          ) : (
            <div className="mini-alert ok-mini">
              Pi3 workers healthy
            </div>
          )}
        </div>

        <div className="dashboard-card">
          <span className="dashboard-label">Detection Summary Today</span>

          <div className="detection-summary-row">
            <div>
              <strong>{eventsToday.length}</strong>
              <p>Total events</p>
            </div>

            <div>
              <strong>{peopleDetected}</strong>
              <p>People detected</p>
            </div>

            <div>
              <strong>{threatsDetected}</strong>
              <p>Threats detected</p>
            </div>
          </div>
        </div>

        <div className="dashboard-card latest-card">
          <span className="dashboard-label">Latest Alert</span>

          {latestAlert ? (
            <>
              <div className="latest-alert-heading">
                <strong>{latestAlert.event_type}</strong>
                <span className={severityClass(latestAlert.severity)}>
                  {latestAlert.severity}
                </span>
              </div>

              <p>
                Camera: {latestAlert.sensor_node_id || "N/A"}
              </p>

              <p>
                Location: {latestAlert.camera_location || "N/A"}
              </p>

              <p>
                Time: {formatDate(latestAlert.created_at || latestAlert.captured_at)}
              </p>
            </>
          ) : (
            <div className="no-alert-box">
              No high or critical alert detected yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MonitoringPanel({ events, backendOnline, lastUpdated }) {
  const t
otalEvents = events.length;

  const criticalEvents = events.filter(
    (event) => String(event.severity).toLowerCase() === "critical"
  ).length;

  const highEvents = events.filter(
    (event) => String(event.severity).toLowerCase() === "high"
  ).length;

  const mediumEvents = events.filter(
    (event) => String(event.severity).toLowerCase() === "medium"
  ).length;

  const informationalEvents = events.filter(
    (event) => String(event.severity).toLowerCase() === "informational"
  ).length;

  const latestEvent = [...events].sort((a, b) => {
    const dateA = new Date(a.created_at || a.captured_at || 0).getTime();
    const dateB = new Date(b.created_at || b.captured_at || 0).getTime();
    return dateB - dateA;
  })[0];

  const uniqueCameras = new Set(
    events.map((event) => event.sensor_node_id).filter(Boolean)
  ).size;

  const detectionTypes = new Set(
    events.map((event) => event.event_type).filter(Boolean)
  ).size;

  return (
    <section className="monitoring-section">
      <div className="section-title">
        <h2>Application Monitoring</h2>
        <p>
          Event summary, detection status, and links to Prometheus/Grafana.
        </p>
      </div>

      <div className="monitoring-grid">
        <div className="monitor-card">
          <span className="monitor-label">Backend API</span>
          <strong className={backendOnline ? "online" : "offline"}>
            {backendOnline ? "Online" : "Offline"}
          </strong>
          <p>{API_BASE_URL}</p>
        </div>

        <div className="monitor-card">
          <span className="monitor-label">Grafana</span>
          <strong>Dashboard</strong>
          <p>
            <a href={GRAFANA_URL} target="_blank" rel="noreferrer">
              Open Grafana
            </a>
          </p>
        </div>

        <div className="monitor-card">
          <span className="monitor-label">Prometheus</span>
          <strong>Metrics API</strong>
          <p>
            <a href="/prometheus" target="_blank" rel="noreferrer">
              Open Prometheus
            </a>
          </p>
        </div>

        <div className="monitor-card">
          <span className="monitor-label">Total Events</span>
          <strong>{totalEvents}</strong>
          <p>Events stored by backend</p>
        </div>

        <div className="monitor-card danger">
          <span className="monitor-label">Critical Events</span>
          <strong>{criticalEvents}</strong>
          <p>fire, weapon, intruder</p>
        </div>

        <div className="monitor-card warning-card">
          <span className="monitor-label">High Severity</span>
          <strong>{highEvents}</strong>
          <p>Example: smoke</p>
        </div>

        <div className="monitor-card warning-card">
          <span className="monitor-label">Medium Severity</span>
          <strong>{mediumEvents}</strong>
          <p>Example: liquid spill</p>
        </div>

        <div className="monitor-card">
          <span className="monitor-label">Informational</span>
          <strong>{informationalEvents}</strong>
          <p>Example: person</p>
        </div>

        <div className="monitor-card">
          <span className="monitor-label">Camera Nodes</span>
          <strong>{uniqueCameras}</strong>
          <p>Camera nodes seen in events</p>
        </div>

        <div className="monitor-card">
          <span className="monitor-label">Detection Types</span>
          <strong>{detectionTypes}</strong>
          <p>Different YOLO classes detected</p>
        </div>

        <div className="monitor-card">
          <span className="monitor-label">Latest Event</span>
          <strong>{latestEvent?.event_type || "None"}</strong>
          <p>
            {latestEvent
              ? formatDate(latestEvent.created_at || latestEvent.captured_at)
              : "No events yet"}
          </p>
        </div>

        <div className="monitor-card">
          <span className="monitor-label">Last Refresh</span>
          <strong>{lastUpdated ? lastUpdated.toLocaleTimeString() : "Never"}</strong>
          <p>Auto-refresh every {REFRESH_INTERVAL_MS / 1000}s</p>
        </div>
      </div>
    </section>
  );
}

function EventCard({ event }) {
  const [frame, setFrame] = useState(null);
  const [frameError, setFrameError] = useState("");
  const [rawImageFailed, setRawImageFailed] = useState(false);
  const [annotatedAvailable, setAnnotatedAvailable] = useState(
    Boolean(event.annotated_image_url || event.annotated_image_key)
  );

  const frameId = event.frame_id;

  const rawImageUrl =
    event.raw_image_url || `${API_BASE_URL}/api/v1/images/raw/${frameId}`;

  const annotatedImageUrl =
    event.annotated_image_url ||
    `${API_BASE_URL}/api/v1/images/annotated/${frameId}`;

  useEffect(() => {
    if (!frameId) return;

    async function loadFrameMetadata() {
      try {
        setFrameError("");

        const response = await fetch(`${API_BASE_URL}/api/v1/frames/${frameId}`);

        if (!response.ok) {
          throw new Error(`Frame API returned ${response.status}`);
        }

        const data = await response.json();
        setFrame(data);

        if (!data.annotated_image_key) {
          setAnnotatedAvailable(false);
        }
      } catch (error) {
        setFrameError(error.message || "Could not load frame metadata");
      }
    }

    loadFrameMetadata();
  }, [frameId]);

  const detections = frame?.detections || [];

  return (
    <article className="event-card">
      <div className="event-header">
        <div>
          <h2>{event.event_type || "Unknown event"}</h2>
          <p className="muted">Frame ID: {frameId || "N/A"}</p>
        </div>

        <span className={severityClass(event.severity)}>
          {event.severity || "unknown"}
        </span>
      </div>

      <div className="event-meta">
        <div>
          <strong>Confidence</strong>
          <span>{getConfidencePercent(event)}</span>
        </div>

        <div>
          <strong>Camera Node</strong>
          <span>{event.sensor_node_id || "N/A"}</span>
        </div>

        <div>
          <strong>Location</strong>
          <span>{event.camera_location || "N/A"}</span>
        </div>

        <div>
          <strong>Timestamp</strong>
          <span>{formatDate(event.captured_at || event.created_at)}</span>
        </div>
      </div>

      <div className="images-grid">
        <div className="image-box">
          <h3>Raw Image</h3>

          {!rawImageFailed && frameId ? (
            <img
              src={rawImageUrl}
              alt={`Raw frame ${frameId}`}
              onError={() => setRawImageFailed(true)}
            />
          ) : (
            <div className="image-placeholder">Raw image failed to load</div>
          )}
        </div>

        <div className="image-box">
          <h3>Annotated Image</h3>

          {annotatedAvailable && frameId ? (
            <img
              src={annotatedImageUrl}
              alt={`Annotated frame ${frameId}`}
              onError={() => setAnnotatedAvailable(false)}
            />
          ) : (
            <div className="image-placeholder">
              No annotated image available
            </div>
          )}
        </div>
      </div>

      <div className="detections">
        <h3>Detection Details</h3>

        {frameError && (
          <p className="warning">
            Could not load frame metadata: {frameError}
          </p>
        )}

        {!frameError && detections.length === 0 && (
          <p className="muted">No bounding box details available.</p>
        )}

        {detections.length > 0 && (
          <div className="detection-list">
            {detections.map((detection, index) => (
              <div className="detection-item" key={index}>
                <div>
                  <strong>{detection.class_name || "unknown"}</strong>
                  <span className={severityClass(detection.severity)}>
                    {detection.severity || "unknown"}
                  </span>
                </div>

                <p>Confidence: {getConfidencePercent(detection)}</p>

                {detection.bounding_box && (
                  <p className="bbox">
                    Box: x_min {detection.bounding_box.x_min}, y_min{" "}
                    {detection.bounding_box.y_min}, x_max{" "}
                    {detection.bounding_box.x_max}, y_max{" "}
                    {detection.bounding_box.y_max}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function App() {
  const [events, setEvents] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  async function loadEvents() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_BASE_URL}/api/v1/events`);

      if (!response.ok) {
        throw new Error(`Events API returned ${response.status}`);
      }

      const data = await response.json();

      setBackendOnline(true);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setLastUpdated(new Date());
    } catch (error) {
      setBackendOnline(false);
      setError(error.message || "Backend offline or unavailable");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();

    const intervalId = setInterval(() => {
      loadEvents();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const dateA = new Date(a.created_at || a.captured_at || 0).getTime();
      const dateB = new Date(b.created_at || b.captured_at || 0).getTime();
      return dateB - dateA;
    });
  }, [events]);

  return (
    <main className="app">
      <section className="top-bar">
        <div>
          <h1>Edge Monitoring Dashboard</h1>
          <p>
            Raspberry Pi camera events, YOLO detections, annotated evidence,
            Prometheus graphs, and node alerts.
          </p>
        </div>

        <button onClick={loadEvents}>Refresh Now</button>
      </section>
      <MainDashboard
        events={events}
  	backendOnline={backendOnline}
      />
      <MonitoringPanel
        events={events}
        backendOnline={backendOnline}
        lastUpdated={lastUpdated}
      />

      <PrometheusAlerts />

      <PrometheusGraphs />

      <section className="section-title">
        <h2>Event Feed</h2>
        <p>Latest detected events with raw and annotated evidence images.</p>
      </section>

      {loading && <p className="info">Loading events...</p>}

      {error && (
        <div className="error-box">
          Backend offline or unavailable. Details: {error}
        </div>
      )}

      {!loading && !error && sortedEvents.length === 0 && (
        <div className="empty-box">Backend online. No events detected yet.</div>
      )}

      <section className="events-list">
        {sortedEvents.map((event) => (
          <EventCard key={event.event_id || event.frame_id} event={event} />
        ))}
      </section>
    </main>
  );
}

export default App;
