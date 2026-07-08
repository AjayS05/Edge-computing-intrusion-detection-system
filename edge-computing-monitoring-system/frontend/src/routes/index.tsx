import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Bell,
  Camera,
  Cpu,
  Database,
  ExternalLink,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { StatCard } from "@/components/dashboard/StatCard";
import { SeverityBadge, StatusBadge, StatusDot } from "@/components/dashboard/StatusDot";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import { classIcons } from "@/components/dashboard/icons";
import { formatRelative } from "@/components/dashboard/formatters";
import { Button } from "@/components/ui/button";
import {
  useClusterNodes,
  useEvents,
  useEventsOverTime,
  useThreatBreakdown,
} from "@/lib/api";

export const Route = createFileRoute("/")({
  component: DashboardHome,
});

function DashboardHome() {
  const nodesQ = useClusterNodes();
  const eventsQ = useEvents();
  const eotQ = useEventsOverTime();
  const breakdownQ = useThreatBreakdown();

  const clusterNodes = nodesQ.data ?? [];
  const detectionEvents = eventsQ.data ?? [];
  const eventsOverTime = eotQ.data ?? [];
  const threatTypeBreakdown = breakdownQ.data ?? [];

  const onlineNodes = clusterNodes.filter((n) => n.status === "online").length;
  const totalNodes = clusterNodes.length;
  const criticalToday = detectionEvents.filter((e) => e.severity === "critical").length;
  const latest = detectionEvents[0];

  return (
    <>
      <PageHeader
        eyebrow="Live · pulling every 5s"
        title="Operations Dashboard"
        description="End-to-end view of the edge inference pipeline: capture → inference → storage → alert."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <Activity className="size-3.5" /> Prometheus
              <ExternalLink className="size-3" />
            </Button>
            <Button size="sm" className="gap-2">
              <ShieldCheck className="size-3.5" /> Run health check
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={Activity}
          label="Backend API"
          value="Online"
          tone="success"
          hint="FastAPI · p50 42ms"
        />
        <StatCard
          icon={Cpu}
          label="YOLO Inference"
          value="Healthy"
          tone="success"
          hint="v8 · 82ms avg"
        />
        <StatCard
          icon={Send}
          label="Telegram Bot"
          value="Online"
          tone="success"
          hint="27 alerts today"
        />
        <StatCard
          icon={Camera}
          label="Camera Nodes"
          value="3 / 3"
          tone="success"
          hint="pi4-cam × 3"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={ShieldCheck}
          label="Cluster Health"
          value={totalNodes ? `${onlineNodes}/${totalNodes}` : "—"}
          tone={onlineNodes === totalNodes ? "success" : "warning"}
          hint="k3s · 1 master · 5 workers"
        />
        <StatCard
          icon={Bell}
          label="Events Today"
          value={detectionEvents.length}
          tone="info"
        />
        <StatCard
          icon={ShieldAlert}
          label="Critical Threats"
          value={criticalToday}
          tone="destructive"
        />
        <StatCard
          icon={AlertTriangle}
          label="Latest Alert"
          value={latest ? formatRelative(latest.timestamp) : "—"}
          tone="warning"
          hint={latest?.classes[0]?.name.toUpperCase()}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title="Events over last 24 hours"
          description="Detections and threat-class hits per hour"
          className="lg:col-span-2"
          contentClassName="p-2"
        >
          {eotQ.isLoading ? <LoadingBlock /> : eotQ.error ? <ErrorBlock error={eotQ.error} onRetry={() => eotQ.refetch()} /> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={eventsOverTime} margin={{ top: 12, right: 12, bottom: 4, left: -12 }}>
              <defs>
                <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="hour"
                stroke="var(--muted-foreground)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="events"
                stroke="var(--chart-1)"
                fill="url(#g1)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="threats"
                stroke="var(--destructive)"
                fill="url(#g2)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Threat class breakdown" description="Last 24h · YOLOv8 classes">
          {breakdownQ.isLoading ? <LoadingBlock /> : breakdownQ.error ? <ErrorBlock error={breakdownQ.error} onRetry={() => breakdownQ.refetch()} /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={threatTypeBreakdown}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                stroke="var(--muted-foreground)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                cursor={{ fill: "color-mix(in oklab, var(--foreground) 5%, transparent)" }}
              />
              <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title="Recent detections"
          description="Streamed from /api/v1/events"
          className="lg:col-span-2"
          contentClassName="p-0"
          actions={
            <Link to="/events" className="text-xs font-medium text-primary hover:underline">
              View all →
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 font-medium">Node</th>
                  <th className="px-4 py-2 font-medium">Class</th>
                  <th className="px-4 py-2 font-medium">Confidence</th>
                  <th className="px-4 py-2 font-medium">Severity</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {eventsQ.isLoading && (
                  <tr><td colSpan={6}><LoadingBlock /></td></tr>
                )}
                {eventsQ.error && (
                  <tr><td colSpan={6} className="p-3"><ErrorBlock error={eventsQ.error} onRetry={() => eventsQ.refetch()} /></td></tr>
                )}
                {!eventsQ.isLoading && !eventsQ.error && detectionEvents.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No events yet.</td></tr>
                )}
                {detectionEvents.slice(0, 6).map((e) => {
                  const cls = e.classes[0];
                  const Icon = classIcons[cls.name] ?? ShieldAlert;
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-border/40 transition hover:bg-muted/30"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs">{e.id}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="font-mono">{e.node}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <Icon className="size-3.5 text-muted-foreground" />
                          {cls.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {(cls.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5">
                        <SeverityBadge severity={e.severity} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {formatRelative(e.timestamp)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Cluster nodes" description="Prometheus targets" contentClassName="p-0">
          {nodesQ.isLoading ? (
            <LoadingBlock />
          ) : nodesQ.error ? (
            <div className="p-4"><ErrorBlock error={nodesQ.error} onRetry={() => nodesQ.refetch()} /></div>
          ) : (
          <ul className="divide-y divide-border/50">
            {clusterNodes.map((n) => (
              <li key={n.name} className="flex items-center gap-3 px-4 py-3">
                <StatusDot status={n.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.name}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {n.role} · {n.instance}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-xs">{n.cpu}%</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {n.temperature}°C
                  </div>
                </div>
              </li>
            ))}
          </ul>
          )}
          <div className="border-t border-border/70 bg-muted/20 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">SeaweedFS</span>
              <StatusBadge status="online" />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Prometheus</span>
              <StatusBadge status="online" />
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Pipeline"
        description="Capture → Inference → Storage → Alert"
        className="mt-4"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <PipelineStage icon={Camera} label="Capture" value="pi4-cam × 3" status="online" />
          <PipelineStage icon={Cpu} label="YOLO Infer" value="82ms · 12 fps" status="online" />
          <PipelineStage icon={Database} label="SeaweedFS" value="12,487 imgs" status="online" />
          <PipelineStage icon={Send} label="Telegram" value="27 sent" status="online" />
          <PipelineStage icon={Bell} label="Ops Alerts" value="3 critical" status="degraded" />
        </div>
      </Panel>
    </>
  );
}

function PipelineStage({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: typeof Camera;
  label: string;
  value: string;
  status: "online" | "offline" | "unknown" | "degraded";
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          <StatusDot status={status} className="size-1.5" />
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{value}</div>
      </div>
    </div>
  );
}
