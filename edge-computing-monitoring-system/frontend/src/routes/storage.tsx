import { createFileRoute } from "@tanstack/react-router";
import { Database, Files, HardDrive, Image as ImageIcon, Upload } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/dashboard/StatusDot";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import { formatRelative } from "@/components/dashboard/formatters";
import { Progress } from "@/components/ui/progress";
import { useStorage, useEvents } from "@/lib/api";

export const Route = createFileRoute("/storage")({
  component: Storage,
});

function Storage() {
  const storageQ = useStorage();
  const eventsQ = useEvents();
  const storageStats = storageQ.data;
  const detectionEvents = eventsQ.data ?? [];
  const usedPct = storageStats
    ? Math.round((storageStats.usedGb / storageStats.totalGb) * 100)
    : 0;

  return (
    <>
      <PageHeader
        eyebrow="SeaweedFS · S3 gateway"
        title="Storage"
        description="Object store for raw + annotated frames and event metadata."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Database} label="Provider" value={storageStats?.provider ?? "—"} tone="info" hint="S3 API compatible" />
        <StatCard icon={ImageIcon} label="Raw images" value={(storageStats?.rawImages ?? 0).toLocaleString()} />
        <StatCard icon={ImageIcon} label="Annotated" value={(storageStats?.annotatedImages ?? 0).toLocaleString()} />
        <StatCard icon={Files} label="Metadata records" value={(storageStats?.metadataRecords ?? 0).toLocaleString()} />
      </div>

      {storageQ.isLoading && <div className="mt-4"><LoadingBlock label="Loading storage stats…" /></div>}
      {storageQ.error && <div className="mt-4"><ErrorBlock error={storageQ.error} onRetry={() => storageQ.refetch()} /></div>}

      {storageStats && (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Volume usage" className="lg:col-span-1">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-3xl font-semibold">{usedPct}%</span>
            <span className="font-mono text-xs text-muted-foreground">
              {storageStats.usedGb} / {storageStats.totalGb} GB
            </span>
          </div>
          <Progress value={usedPct} className="mt-3 h-2" />
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Status" value={<StatusBadge status={storageStats.status} />} />
            <Row label="Last upload" value={formatRelative(storageStats.lastUploadIso)} />
            <Row label="Replication" value={<span className="font-mono">2×</span>} />
            <Row label="Bucket" value={<span className="font-mono">edge-sentinel-frames</span>} />
          </div>
        </Panel>

        <Panel title="Health" className="lg:col-span-1">
          <ul className="space-y-3 text-sm">
            <HealthRow icon={HardDrive} label="Master volume" value="online" />
            <HealthRow icon={HardDrive} label="Replica volume A" value="online" />
            <HealthRow icon={HardDrive} label="Replica volume B" value="online" />
            <HealthRow icon={Upload} label="Upload throughput" value="12.4 MB/s" plain />
            <HealthRow icon={Database} label="Metadata DB" value="online" />
          </ul>
        </Panel>

        <Panel title="Recent uploads" contentClassName="p-0" className="lg:col-span-1">
          {eventsQ.isLoading ? (
            <LoadingBlock />
          ) : eventsQ.error ? (
            <div className="p-4"><ErrorBlock error={eventsQ.error} onRetry={() => eventsQ.refetch()} /></div>
          ) : (
          <ul className="divide-y divide-border/50">
            {detectionEvents.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="grid size-8 place-items-center rounded bg-muted/40 text-muted-foreground">
                  <ImageIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{e.id}.jpg</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {e.storagePath}
                  </div>
                </div>
                <div className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {formatRelative(e.timestamp)}
                </div>
              </li>
            ))}
          </ul>
          )}
        </Panel>
      </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function HealthRow({
  icon: Icon,
  label,
  value,
  plain,
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  plain?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1 truncate">{label}</span>
      {plain ? <span className="font-mono text-xs">{value}</span> : <StatusBadge status={value as any} />}
    </li>
  );
}