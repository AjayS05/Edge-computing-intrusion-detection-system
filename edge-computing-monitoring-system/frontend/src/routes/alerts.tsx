import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Filter } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { StatCard } from "@/components/dashboard/StatCard";
import { SeverityBadge } from "@/components/dashboard/StatusDot";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import { resolveAlertIcon } from "@/components/dashboard/icons";
import { formatRelative } from "@/components/dashboard/formatters";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAlerts } from "@/lib/api";

export const Route = createFileRoute("/alerts")({
  component: Alerts,
});

function Alerts() {
  const [filter, setFilter] = useState<"all" | "threat" | "infra">("all");
  const { data, isLoading, error, refetch } = useAlerts();
  const alertItems = data ?? [];
  const rows = alertItems.filter((a) => filter === "all" || a.kind === filter);
  const critical = alertItems.filter((a) => a.severity === "critical").length;
  const warning = alertItems.filter((a) => a.severity === "warning").length;

  return (
    <>
      <PageHeader
        eyebrow="Real-time · deduped 60s"
        title="Alerts"
        description="Threat detections and infrastructure alerts across the cluster."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="size-3.5" /> Filter
            </Button>
            <Button size="sm" className="gap-2">
              <Bell className="size-3.5" /> Mark all read
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Bell} label="Active alerts" value={alertItems.length} tone="info" />
        <StatCard icon={Bell} label="Critical" value={critical} tone="destructive" />
        <StatCard icon={Bell} label="Warning" value={warning} tone="warning" />
        <StatCard icon={Bell} label="Resolved 24h" value={12} tone="success" />
      </div>

      <Panel
        title="Alert stream"
        className="mt-4"
        contentClassName="p-0"
        actions={
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="threat" className="text-xs">Threats</TabsTrigger>
              <TabsTrigger value="infra" className="text-xs">Infrastructure</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        {isLoading ? (
          <LoadingBlock label="Loading alerts…" />
        ) : error ? (
          <div className="p-4"><ErrorBlock error={error} onRetry={() => refetch()} /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No alerts.</div>
        ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((a) => {
            const Icon = resolveAlertIcon(a.iconKey);
            return (
            <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 hover:bg-muted/20">
              <div className={`grid size-10 shrink-0 place-items-center rounded-md ${
                a.severity === "critical"
                  ? "bg-destructive/10 text-destructive"
                  : a.severity === "warning"
                    ? "bg-warning/10 text-warning"
                    : "bg-success/10 text-success"
              }`}>
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{a.title}</span>
                  <SeverityBadge severity={a.severity} />
                  <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    {a.kind}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{a.description}</div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {a.id} · {a.node}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                {formatRelative(a.timestamp)}
              </div>
            </li>
            );
          })}
        </ul>
        )}
      </Panel>
    </>
  );
}