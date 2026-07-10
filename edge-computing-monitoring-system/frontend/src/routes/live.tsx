import { createFileRoute } from "@tanstack/react-router";
import { Camera, Radio, RotateCw, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { DetectionImage } from "@/components/dashboard/DetectionImage";
import { SeverityBadge, StatusDot } from "@/components/dashboard/StatusDot";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import { classIcons } from "@/components/dashboard/icons";
import { formatRelative } from "@/components/dashboard/formatters";
import { Button } from "@/components/ui/button";
import { useEvents } from "@/lib/api";

export const Route = createFileRoute("/live")({
  component: LiveDetection,
});

function LiveDetection() {
  const { data, isLoading, error, refetch } = useEvents();
  const detectionEvents = data ?? [];
  const evt = detectionEvents[0];

  if (isLoading) return <LoadingBlock label="Loading live feed…" />;
  if (error) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  if (!evt) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No detection events yet.
      </div>
    );
  }

  const cls = evt.classes;

  return (
    <>
      <PageHeader
        eyebrow="Streaming · pi4-cam-lobby"
        title="Live Detection"
        description="Raw and YOLO-annotated frames from the active camera node."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <Camera className="size-3.5" /> Switch node
            </Button>
            <Button size="sm" className="gap-2">
              <RotateCw className="size-3.5" /> Force capture
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Original frame"
          description="GET /api/v1/images/raw/{id}"
          actions={
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <StatusDot status="online" className="size-1.5" /> LIVE
            </span>
          }
        >
          <DetectionImage
            src={evt.rawImage}
            alt="raw"
            label={`${evt.node} · RAW`}
            timestamp={evt.timestamp}
          />
        </Panel>

        <Panel
          title="YOLO-annotated"
          description="GET /api/v1/images/annotated/{id}"
          actions={<SeverityBadge severity={evt.severity} />}
        >
          <DetectionImage
            src={evt.annotatedImage}
            alt="annotated"
            label={`${evt.node} · ANNOTATED`}
            timestamp={evt.timestamp}
            boxes={[
              { label: cls[0].name, confidence: cls[0].confidence, x: 0.31, y: 0.22, w: 0.28, h: 0.6, tone: "critical" },
              cls[1]
                ? { label: cls[1].name, confidence: cls[1].confidence, x: 0.6, y: 0.35, w: 0.22, h: 0.45, tone: "warning" as const }
                : undefined,
            ].filter(Boolean) as any}
          />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Detected classes" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cls.map((c) => {
              const Icon = classIcons[c.name] ?? ShieldAlert;
              const pct = Math.round(c.confidence * 100);
              return (
                <div
                  key={c.name}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border/70 bg-muted/20 p-3"
                >
                  <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold">{pct}%</div>
                    <div className="font-mono text-[10px] text-muted-foreground">confidence</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Event metadata">
          <dl className="space-y-2.5 text-sm">
            <MetaRow label="Event ID" value={evt.id} mono />
            <MetaRow label="Timestamp" value={new Date(evt.timestamp).toLocaleString()} />
            <MetaRow label="Node" value={evt.node} mono />
            <MetaRow label="Severity" value={<SeverityBadge severity={evt.severity} />} />
            <MetaRow
              label="Telegram"
              value={
                <span className={evt.telegramSent ? "text-success" : "text-muted-foreground"}>
                  {evt.telegramSent ? "Sent" : "Skipped"}
                </span>
              }
            />
            <MetaRow label="Storage" value={evt.storagePath} mono />
            <MetaRow label="Received" value={formatRelative(evt.timestamp)} />
          </dl>
        </Panel>
      </div>

      <Panel title="Recent frames from all cameras" description="Last capture per node" className="mt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {detectionEvents.slice(0, 3).map((e) => (
            <div key={e.id} className="space-y-2">
              <DetectionImage
                src={e.annotatedImage}
                alt={e.id}
                label={e.node}
                boxes={[
                  {
                    label: e.classes[0].name,
                    confidence: e.classes[0].confidence,
                    x: 0.28,
                    y: 0.22,
                    w: 0.4,
                    h: 0.55,
                    tone: e.severity as any,
                  },
                ]}
              />
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono">{e.id}</span>
                <span className="text-muted-foreground">{formatRelative(e.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "truncate font-mono text-xs" : "truncate text-sm"}>{value}</dd>
    </div>
  );
}

// Silence unused import warning in case Radio isn't used elsewhere
void Radio;