import { createFileRoute } from "@tanstack/react-router";
import { Activity, Cpu, HardDrive, MemoryStick, Thermometer, Wifi } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge, StatusDot } from "@/components/dashboard/StatusDot";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import { Progress } from "@/components/ui/progress";
import {
  useClusterNodes,
  useCpuSeries,
  useMemorySeries,
  useTemperatureSeries,
} from "@/lib/api";

export const Route = createFileRoute("/monitoring")({
  component: Monitoring,
});

function Monitoring() {
  const nodesQ = useClusterNodes();
  const cpuQ = useCpuSeries();
  const memQ = useMemorySeries();
  const tempQ = useTemperatureSeries();

  const clusterNodes = nodesQ.data ?? [];
  const cpuSeries = cpuQ.data ?? [];
  const memSeries = memQ.data ?? [];
  const tempSeries = tempQ.data ?? [];

  const online = clusterNodes.filter((n) => n.status === "online").length;
  const offline = clusterNodes.filter((n) => n.status === "offline").length;
  const degraded = clusterNodes.filter((n) => n.status === "degraded").length;
  const avgTemp = clusterNodes.length
    ? Math.round(
        clusterNodes.filter((n) => n.status !== "offline").reduce((a, n) => a + n.temperature, 0) /
          Math.max(1, clusterNodes.length - offline),
      )
    : 0;

  return (
    <>
      <PageHeader
        eyebrow="Prometheus · scrape 15s"
        title="Cluster Monitoring"
        description="Raspberry Pi node exporter + backend/YOLO service health."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Wifi} label="Nodes online" value={`${online}/${clusterNodes.length}`} tone={offline ? "warning" : "success"} hint={`${offline} offline · ${degraded} degraded`} />
        <StatCard icon={Activity} label="Backend API" value="200 OK" tone="success" hint="p95 118ms" />
        <StatCard icon={Cpu} label="YOLO service" value="Healthy" tone="success" hint="12 fps · 82ms" />
        <StatCard icon={Thermometer} label="Avg SoC temp" value={`${avgTemp}°C`} tone={avgTemp > 70 ? "warning" : "success"} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartPanel title="CPU usage" data={cpuSeries} unit="%" state={cpuQ} />
        <ChartPanel title="Memory usage" data={memSeries} unit="%" state={memQ} />
        <ChartPanel title="SoC temperature" data={tempSeries} unit="°C" state={tempQ} />
      </div>

      <Panel title="Nodes" description="Raspberry Pi cluster · role · health" className="mt-4" contentClassName="p-0">
        {nodesQ.isLoading ? (
          <LoadingBlock />
        ) : nodesQ.error ? (
          <div className="p-4"><ErrorBlock error={nodesQ.error} onRetry={() => nodesQ.refetch()} /></div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2 font-medium">Node</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Instance</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">CPU</th>
                <th className="px-4 py-2 font-medium">RAM</th>
                <th className="px-4 py-2 font-medium">Temp</th>
                <th className="px-4 py-2 font-medium">Disk</th>
                <th className="px-4 py-2 font-medium">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {clusterNodes.map((n) => (
                <tr key={n.name} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusDot status={n.status} pulse={false} />
                      <span className="text-sm font-medium">{n.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{n.role}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{n.instance}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={n.status} /></td>
                  <td className="px-4 py-2.5"><MiniBar value={n.cpu} tone={n.cpu > 80 ? "warning" : "default"} /></td>
                  <td className="px-4 py-2.5"><MiniBar value={n.ram} tone={n.ram > 80 ? "warning" : "default"} /></td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    <span className={n.temperature > 75 ? "text-warning" : n.temperature > 70 ? "text-warning" : "text-foreground"}>
                      {n.status === "offline" ? "—" : `${n.temperature}°C`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5"><MiniBar value={n.disk} /></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {n.status === "offline" ? "—" : `${n.uptimeHours}h`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Panel>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <ServiceCard icon={Activity} name="FastAPI backend" endpoint="/health" latency="42 ms" status="online" />
        <ServiceCard icon={Cpu} name="YOLO inference" endpoint="/api/v1/infer" latency="82 ms" status="online" />
        <ServiceCard icon={HardDrive} name="SeaweedFS" endpoint="/status" latency="16 ms" status="online" />
        <ServiceCard icon={MemoryStick} name="Redis queue" endpoint=":6379" latency="3 ms" status="online" />
        <ServiceCard icon={Wifi} name="Camera stream" endpoint="rtsp://…" latency="—" status="degraded" />
        <ServiceCard icon={Activity} name="Telegram bot" endpoint="/getUpdates" latency="210 ms" status="online" />
      </div>
    </>
  );
}

function ChartPanel({
  title,
  data,
  unit,
  state,
}: {
  title: string;
  data: { t: number; master: number; camera: number; worker: number }[];
  unit: string;
  state: { isLoading: boolean; error: Error | null };
}) {
  return (
    <Panel title={title} description={`Last 30 samples · ${unit}`} contentClassName="p-2">
      {state.isLoading ? (
        <LoadingBlock />
      ) : state.error ? (
        <ErrorBlock error={state.error} />
      ) : (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -20 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey="master" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="camera" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="worker" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      )}
      <div className="flex items-center gap-3 px-2 pb-1 font-mono text-[10px] text-muted-foreground">
        <LegendDot color="var(--chart-1)" label="master" />
        <LegendDot color="var(--chart-3)" label="camera" />
        <LegendDot color="var(--chart-2)" label="worker" />
      </div>
    </Panel>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-1.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

function MiniBar({ value, tone = "default" }: { value: number; tone?: "default" | "warning" }) {
  return (
    <div className="flex items-center gap-2">
      <Progress value={value} className="h-1.5 w-20" />
      <span className={`font-mono text-xs ${tone === "warning" ? "text-warning" : ""}`}>{value}%</span>
    </div>
  );
}

function ServiceCard({
  icon: Icon,
  name,
  endpoint,
  latency,
  status,
}: {
  icon: typeof Activity;
  name: string;
  endpoint: string;
  latency: string;
  status: "online" | "offline" | "unknown" | "degraded";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-card p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          <StatusDot status={status} />
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{endpoint}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm">{latency}</div>
        <div className="font-mono text-[10px] text-muted-foreground">latency</div>
      </div>
    </div>
  );
}