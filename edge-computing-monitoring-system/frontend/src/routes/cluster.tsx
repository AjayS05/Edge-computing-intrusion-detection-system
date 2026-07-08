import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Cpu, Gauge, Network, Thermometer, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import {
  useAmdahl,
  useGustafson,
  useHpl,
  useMpi,
  useTaskDistributor,
} from "@/lib/api";

export const Route = createFileRoute("/cluster")({
  component: Cluster,
});

const bottlenecks = [
  { icon: Cpu, label: "CPU", level: "Moderate", tone: "warning", note: "pi4 saturates at 88% under YOLO batch" },
  { icon: Network, label: "Network", level: "Low", tone: "success", note: "Gigabit LAN · avg 220 Mbps" },
  { icon: Gauge, label: "Memory", level: "Low", tone: "success", note: "Peak 82% on pi4-cam-kitchen" },
  { icon: Thermometer, label: "Thermal", level: "High", tone: "destructive", note: "Throttling above 78°C on kitchen node" },
];

function Cluster() {
  const hplQ = useHpl();
  const mpiQ = useMpi();
  const amdahlQ = useAmdahl();
  const gustafsonQ = useGustafson();
  const distQ = useTaskDistributor();

  const hplResults = hplQ.data ?? [];
  const mpiRuntime = mpiQ.data ?? [];
  const amdahl = amdahlQ.data ?? [];
  const gustafson = gustafsonQ.data ?? [];
  const taskDistributor = distQ.data ?? [];

  const peakGflops = hplResults.length ? Math.max(...hplResults.map((r) => r.gflops)) : 0;
  const amdahlPeak = amdahl.length ? amdahl[amdahl.length - 1].speedup : 0;
  const gustafsonPeak = gustafson.length ? gustafson[gustafson.length - 1].speedup : 0;

  return (
    <>
      <PageHeader
        eyebrow="Benchmarks · HPL / MPI"
        title="Cluster Performance"
        description="Parallel computing analysis of the Pi cluster and the custom task distributor."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Zap} label="Peak GFLOPS" value={peakGflops ? peakGflops.toFixed(1) : "—"} tone="info" hint="HPL benchmark" />
        <StatCard icon={Gauge} label="Speedup (Amdahl)" value={amdahlPeak ? `${amdahlPeak.toFixed(1)}×` : "—"} tone="success" />
        <StatCard icon={Gauge} label="Speedup (Gustafson)" value={gustafsonPeak ? `${gustafsonPeak.toFixed(1)}×` : "—"} tone="success" />
        <StatCard icon={AlertTriangle} label="Bottleneck" value="Thermal" tone="destructive" hint="pi4-cam-kitchen" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="HPL — GFLOPS by configuration" contentClassName="p-2">
          {hplQ.isLoading ? <LoadingBlock /> : hplQ.error ? <ErrorBlock error={hplQ.error} onRetry={() => hplQ.refetch()} /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hplResults} margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="nodes" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="gflops" fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
                {hplResults.map((_, i) => (
                  <Cell key={i} fill={i === hplResults.length - 1 ? "var(--primary)" : "var(--chart-1)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="MPI runtime — serial vs parallel" contentClassName="p-2">
          {mpiQ.isLoading ? <LoadingBlock /> : mpiQ.error ? <ErrorBlock error={mpiQ.error} onRetry={() => mpiQ.refetch()} /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={mpiRuntime} margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="workload" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="serial" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="mpi" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Amdahl's Law — Speedup vs Processors" contentClassName="p-2">
          {amdahlQ.isLoading ? <LoadingBlock /> : amdahlQ.error ? <ErrorBlock error={amdahlQ.error} onRetry={() => amdahlQ.refetch()} /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={amdahl} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="p" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="speedup" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Gustafson's Law — Scaled Speedup" contentClassName="p-2">
          {gustafsonQ.isLoading ? <LoadingBlock /> : gustafsonQ.error ? <ErrorBlock error={gustafsonQ.error} onRetry={() => gustafsonQ.refetch()} /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={gustafson} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="p" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="speedup" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Task distributor comparison" description="Throughput (req/s) and end-to-end latency (ms)" className="mt-4" contentClassName="p-0">
        {distQ.isLoading ? (
          <LoadingBlock />
        ) : distQ.error ? (
          <div className="p-4"><ErrorBlock error={distQ.error} onRetry={() => distQ.refetch()} /></div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2 font-medium">Strategy</th>
                <th className="px-4 py-2 font-medium">Throughput</th>
                <th className="px-4 py-2 font-medium">Latency</th>
                <th className="px-4 py-2 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {taskDistributor.map((s) => {
                const max = Math.max(...taskDistributor.map((x) => x.throughput));
                const pct = Math.round((s.throughput / max) * 100);
                const best = s.strategy.includes("Hybrid");
                return (
                  <tr key={s.strategy} className={`border-b border-border/40 ${best ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                    <td className="px-4 py-2.5 text-sm">
                      <span className={best ? "font-semibold text-primary" : ""}>{s.strategy}</span>
                      {best && <span className="ml-2 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-primary">best</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.throughput} req/s</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.latencyMs} ms</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${best ? "bg-primary" : "bg-chart-1"}`} style={{ width: `${pct}%`, background: best ? "var(--primary)" : "var(--chart-1)" }} />
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </Panel>

      <Panel title="Bottlenecks" className="mt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {bottlenecks.map((b) => {
            const toneClass =
              b.tone === "success"
                ? "text-success bg-success/10"
                : b.tone === "warning"
                  ? "text-warning bg-warning/10"
                  : "text-destructive bg-destructive/10";
            return (
              <div key={b.label} className="rounded-md border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                  <div className={`grid size-8 place-items-center rounded-md ${toneClass}`}>
                    <b.icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{b.label}</div>
                    <div className={`font-mono text-[10px] uppercase tracking-widest ${toneClass.split(" ")[0]}`}>
                      {b.level}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{b.note}</p>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}