import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cpu,
  Gauge,
  GitMerge,
  MemoryStick,
  Network,
  Thermometer,
  Zap,
} from "lucide-react";
import "./ClusterPerformancePage.css"
type MetricTone = "cyan" | "green" | "red" | "yellow";

type HplResult = {
  label: string;
  gflops: number;
};

type RuntimeResult = {
  task: string;
  serial: number;
  mpi: number;
};

type SpeedupPoint = {
  processors: number;
  speedup: number;
};

type DistributorResult = {
  strategy: string;
  throughput: number;
  latency: number;
  score: number;
};

type Bottleneck = {
  name: string;
  level: "low" | "moderate" | "high";
  description: string;
};

type PerformanceData = {
  peak_gflops: number;
  amdahl_speedup: number;
  gustafson_speedup: number;
  main_bottleneck: string;
  hpl_results: HplResult[];
  runtime_results: RuntimeResult[];
  amdahl_points: SpeedupPoint[];
  gustafson_points: SpeedupPoint[];
  distributor_results: DistributorResult[];
  bottlenecks: Bottleneck[];
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const demoData: PerformanceData = {
  peak_gflops: 31.2,
  amdahl_speedup: 4.2,
  gustafson_speedup: 7.1,
  main_bottleneck: "Thermal",
  hpl_results: [
    { label: "1×Pi", gflops: 8.2 },
    { label: "2×Pi", gflops: 15.1 },
    { label: "3×Pi", gflops: 21.4 },
    { label: "4×Pi", gflops: 26.8 },
    { label: "5×Pi", gflops: 31.2 },
  ],
  runtime_results: [
    { task: "YOLO batch", serial: 42, mpi: 12 },
    { task: "Frame preprocess", serial: 18, mpi: 5 },
    { task: "Annotation encode", serial: 9, mpi: 3 },
    { task: "Metadata index", serial: 6, mpi: 2.5 },
  ],
  amdahl_points: [
    { processors: 1, speedup: 1 },
    { processors: 2, speedup: 1.8 },
    { processors: 3, speedup: 2.5 },
    { processors: 4, speedup: 3.1 },
    { processors: 5, speedup: 3.5 },
    { processors: 6, speedup: 3.8 },
    { processors: 8, speedup: 4.2 },
  ],
  gustafson_points: [
    { processors: 1, speedup: 1 },
    { processors: 2, speedup: 1.9 },
    { processors: 3, speedup: 2.9 },
    { processors: 4, speedup: 3.8 },
    { processors: 5, speedup: 4.7 },
    { processors: 6, speedup: 5.5 },
    { processors: 8, speedup: 7.1 },
  ],
  distributor_results: [
    { strategy: "Round-robin", throughput: 48, latency: 210, score: 57 },
    { strategy: "Least-loaded", throughput: 62, latency: 168, score: 74 },
    { strategy: "Latency-aware", throughput: 71, latency: 142, score: 85 },
    { strategy: "Custom ours", throughput: 84, latency: 118, score: 100 },
  ],
  bottlenecks: [
    {
      name: "CPU",
      level: "moderate",
      description: "Pi nodes saturate during YOLO batch processing",
    },
    {
      name: "Network",
      level: "low",
      description: "LAN transfer overhead during chunk dispatch",
    },
    {
      name: "Memory",
      level: "low",
      description: "Peak memory remains below critical limit",
    },
    {
      name: "Thermal",
      level: "high",
      description: "Thermal throttling can reduce sustained performance",
    },
  ],
};

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
  icon: React.ReactNode;
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

function BarChart({
  data,
  max,
}: {
  data: HplResult[];
  max: number;
}) {
  return (
    <div className="cluster-chart">
      <div className="chart-grid-lines">
        <span>32</span>
        <span>24</span>
        <span>16</span>
        <span>8</span>
        <span>0</span>
      </div>

      <div className="bar-chart-bars">
        {data.map((item) => (
          <div className="bar-item" key={item.label}>
            <div
              className="bar-fill"
              style={{ height: `${(item.gflops / max) * 100}%` }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupedBarChart({ data }: { data: RuntimeResult[] }) {
  const max = Math.max(...data.flatMap((item) => [item.serial, item.mpi]));

  return (
    <div className="cluster-chart runtime-chart">
      <div className="chart-grid-lines">
        <span>60</span>
        <span>45</span>
        <span>30</span>
        <span>15</span>
        <span>0</span>
      </div>

      <div className="runtime-bars">
        {data.map((item) => (
          <div className="runtime-group" key={item.task}>
            <div className="runtime-bar-pair">
              <div
                className="runtime-bar serial"
                style={{ height: `${(item.serial / max) * 100}%` }}
              />
              <div
                className="runtime-bar mpi"
                style={{ height: `${(item.mpi / max) * 100}%` }}
              />
            </div>
            <span>{item.task}</span>
          </div>
        ))}
      </div>

      <div className="runtime-legend">
        <span>
          <i className="serial" /> serial
        </span>
        <span>
          <i className="mpi" /> mpi
        </span>
      </div>
    </div>
  );
}

function LineChart({
  data,
  color,
}: {
  data: SpeedupPoint[];
  color: "cyan" | "green";
}) {
  const width = 680;
  const height = 250;
  const padding = 34;
  const maxX = 8;
  const maxY = 8;

  const points = data.map((point) => {
    const x = padding + (point.processors / maxX) * (width - padding * 2);
    const y = height - padding - (point.speedup / maxY) * (height - padding * 2);

    return { x, y, ...point };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="line-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="line-chart-svg">
        {[0, 2, 4, 6, 8].map((line) => {
          const y = height - padding - (line / maxY) * (height - padding * 2);
          return (
            <line
              key={line}
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
              className="chart-grid-line"
            />
          );
        })}

        <polyline
          points={polyline}
          className={`speed-line ${color}`}
          fill="none"
        />

        {points.map((point) => (
          <circle
            key={point.processors}
            cx={point.x}
            cy={point.y}
            r="4"
            className={`speed-dot ${color}`}
          />
        ))}

        {[1, 2, 3, 4, 5, 6, 8].map((value) => {
          const x = padding + (value / maxX) * (width - padding * 2);
          return (
            <text key={value} x={x} y={height - 8} className="chart-axis-text">
              {value}
            </text>
          );
        })}

        {[0, 2, 4, 6, 8].map((value) => {
          const y = height - padding - (value / maxY) * (height - padding * 2);
          return (
            <text key={value} x="8" y={y + 4} className="chart-axis-text">
              {value}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function BottleneckIcon({ name }: { name: string }) {
  const value = name.toLowerCase();

  if (value.includes("cpu")) return <Cpu size={24} />;
  if (value.includes("network")) return <Network size={24} />;
  if (value.includes("memory")) return <MemoryStick size={24} />;
  if (value.includes("thermal")) return <Thermometer size={24} />;

  return <AlertTriangle size={24} />;
}

export function ClusterPerformancePage() {
  const [data, setData] = useState<PerformanceData>(demoData);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  useEffect(() => {
    async function loadPerformanceData() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/performance/cluster`);

        if (!response.ok) {
          throw new Error("Cluster performance API not available");
        }

        const json = await response.json();

        setData({
          peak_gflops: json.peak_gflops ?? demoData.peak_gflops,
          amdahl_speedup: json.amdahl_speedup ?? demoData.amdahl_speedup,
          gustafson_speedup:
            json.gustafson_speedup ?? demoData.gustafson_speedup,
          main_bottleneck: json.main_bottleneck ?? demoData.main_bottleneck,
          hpl_results: json.hpl_results ?? demoData.hpl_results,
          runtime_results: json.runtime_results ?? demoData.runtime_results,
          amdahl_points: json.amdahl_points ?? demoData.amdahl_points,
          gustafson_points: json.gustafson_points ?? demoData.gustafson_points,
          distributor_results:
            json.distributor_results ?? demoData.distributor_results,
          bottlenecks: json.bottlenecks ?? demoData.bottlenecks,
        });

        setApiNotice(null);
      } catch {
        setData(demoData);
        setApiNotice(
          "Showing demo data because the cluster performance API is not available yet."
        );
      }
    }

    loadPerformanceData();
  }, []);

  return (
    <section className="cluster-page">
      <div className="cluster-page-header">
        <p>BENCHMARKS · HPL · MPI</p>
        <h1>Cluster Performance</h1>
        <span>
          Parallel computing analysis of the Raspberry Pi cluster, MPI examples,
          Amdahl’s Law, Gustafson’s Law, and custom task distribution.
        </span>
      </div>

      {apiNotice && <div className="cluster-api-notice">{apiNotice}</div>}

      <div className="cluster-stat-grid">
        <StatCard
          label="Peak GFLOPS"
          value={data.peak_gflops.toFixed(1)}
          sub="HPL benchmark"
          tone="cyan"
          icon={<Zap size={24} />}
        />

        <StatCard
          label="Speedup Amdahl"
          value={`${data.amdahl_speedup.toFixed(1)}×`}
          sub="Fixed workload"
          tone="green"
          icon={<Gauge size={24} />}
        />

        <StatCard
          label="Speedup Gustafson"
          value={`${data.gustafson_speedup.toFixed(1)}×`}
          sub="Scaled workload"
          tone="green"
          icon={<Activity size={24} />}
        />

        <StatCard
          label="Bottleneck"
          value={data.main_bottleneck}
          sub="Current limiting factor"
          tone="red"
          icon={<AlertTriangle size={24} />}
        />
      </div>

      <div className="cluster-chart-grid">
        <div className="cluster-panel">
          <div className="cluster-panel-header">
            <h2>HPL — GFLOPS by configuration</h2>
          </div>

          <BarChart data={data.hpl_results} max={32} />
        </div>

        <div className="cluster-panel">
          <div className="cluster-panel-header">
            <h2>MPI runtime — serial vs parallel</h2>
          </div>

          <GroupedBarChart data={data.runtime_results} />
        </div>

        <div className="cluster-panel">
          <div className="cluster-panel-header">
            <h2>Amdahl’s Law — Speedup vs Processors</h2>
          </div>

          <LineChart data={data.amdahl_points} color="cyan" />
        </div>

        <div className="cluster-panel">
          <div className="cluster-panel-header">
            <h2>Gustafson’s Law — Scaled Speedup</h2>
          </div>

          <LineChart data={data.gustafson_points} color="green" />
        </div>
      </div>

      <div className="cluster-panel distributor-panel">
        <div className="cluster-panel-header vertical">
          <h2>Task distributor comparison</h2>
          <p>Throughput and end-to-end latency for non-MPI distribution.</p>
        </div>

        <div className="distributor-table">
          <div className="distributor-head">
            <span>Strategy</span>
            <span>Throughput</span>
            <span>Latency</span>
            <span>Score</span>
          </div>

          {data.distributor_results.map((item) => (
            <div className="distributor-row" key={item.strategy}>
              <strong>{item.strategy}</strong>
              <span>{item.throughput} req/s</span>
              <span>{item.latency} ms</span>
              <div className="score-cell">
                <div className="score-bar">
                  <i style={{ width: `${item.score}%` }} />
                </div>
                <span>{item.score}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="cluster-panel">
        <div className="cluster-panel-header">
          <h2>Bottlenecks</h2>
        </div>

        <div className="bottleneck-grid">
          {data.bottlenecks.map((item) => (
            <div className="bottleneck-card" key={item.name}>
              <div className={`bottleneck-icon ${item.level}`}>
                <BottleneckIcon name={item.name} />
              </div>

              <div>
                <h3>{item.name}</h3>
                <span className={item.level}>{item.level}</span>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
