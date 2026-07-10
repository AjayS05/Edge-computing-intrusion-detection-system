import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Download, Filter, Image as ImageIcon, Search, X } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { DetectionImage } from "@/components/dashboard/DetectionImage";
import { SeverityBadge } from "@/components/dashboard/StatusDot";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import { classIcons } from "@/components/dashboard/icons";
import { formatRelative } from "@/components/dashboard/formatters";
import { useEvents, type DetectionEvent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/events")({
  component: EventHistory,
});

function EventHistory() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<DetectionEvent | null>(null);
  const { data, isLoading, error, refetch } = useEvents();
  const detectionEvents = data ?? [];
  const rows = detectionEvents.filter((e) =>
    (e.id + e.node + e.classes.map((c) => c.name).join(" ")).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        eyebrow="24h window"
        title="Event History"
        description="Every detection event pushed to the backend, with raw + annotated evidence."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="size-3.5" /> Filter
            </Button>
            <Button size="sm" className="gap-2">
              <Download className="size-3.5" /> Export CSV
            </Button>
          </>
        }
      />

      <Panel
        contentClassName="p-0"
        title={`${rows.length} events`}
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search id, node, class…"
              className="h-8 w-64 pl-7 text-xs"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2 font-medium">Event ID</th>
                <th className="px-4 py-2 font-medium">Timestamp</th>
                <th className="px-4 py-2 font-medium">Node</th>
                <th className="px-4 py-2 font-medium">Class</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
                <th className="px-4 py-2 font-medium">Severity</th>
                <th className="px-4 py-2 font-medium">Telegram</th>
                <th className="px-4 py-2 font-medium text-right">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8}><LoadingBlock label="Loading events…" /></td></tr>
              )}
              {error && (
                <tr><td colSpan={8} className="p-4"><ErrorBlock error={error} onRetry={() => refetch()} /></td></tr>
              )}
              {!isLoading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    No events match your filter.
                  </td>
                </tr>
              )}
              {rows.map((e) => {
                const top = e.classes[0];
                const Icon = classIcons[top.name] ?? ImageIcon;
                return (
                  <tr
                    key={e.id}
                    onClick={() => setOpen(e)}
                    className="cursor-pointer border-b border-border/40 transition hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">{e.id}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {new Date(e.timestamp).toLocaleTimeString()} · {formatRelative(e.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.node}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Icon className="size-3.5 text-muted-foreground" />
                        {e.classes.map((c) => c.name).join(", ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {(top.confidence * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5">
                      <SeverityBadge severity={e.severity} />
                    </td>
                    <td className="px-4 py-2.5">
                      {e.telegramSent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <Check className="size-3.5" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <X className="size-3.5" /> Skipped
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setOpen(e);
                          }}
                        >
                          Raw
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setOpen(e);
                          }}
                        >
                          Annotated
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-5xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span className="font-mono text-sm">{open.id}</span>
                  <SeverityBadge severity={open.severity} />
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Raw
                  </div>
                  <DetectionImage
                    src={open.rawImage}
                    alt="raw"
                    label={`${open.node} · RAW`}
                    timestamp={open.timestamp}
                  />
                </div>
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Annotated
                  </div>
                  <DetectionImage
                    src={open.annotatedImage}
                    alt="annotated"
                    label={`${open.node} · ANNOTATED`}
                    timestamp={open.timestamp}
                    boxes={[
                      {
                        label: open.classes[0].name,
                        confidence: open.classes[0].confidence,
                        x: 0.3,
                        y: 0.22,
                        w: 0.35,
                        h: 0.58,
                        tone: open.severity as any,
                      },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Detections
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {open.classes.map((c) => (
                      <li key={c.name} className="flex items-center justify-between">
                        <span>{c.name}</span>
                        <span className="font-mono text-xs">{(c.confidence * 100).toFixed(1)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Metadata
                  </div>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    <div className="flex justify-between"><dt className="text-muted-foreground">Node</dt><dd className="font-mono">{open.node}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Timestamp</dt><dd className="font-mono">{new Date(open.timestamp).toLocaleString()}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Storage</dt><dd className="truncate font-mono">{open.storagePath}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Telegram</dt><dd className={open.telegramSent ? "text-success" : "text-muted-foreground"}>{open.telegramSent ? "Delivered" : "Skipped"}</dd></div>
                  </dl>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}