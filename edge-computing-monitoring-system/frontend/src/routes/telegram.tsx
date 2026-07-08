import { createFileRoute } from "@tanstack/react-router";
import { Bot, Check, Send, Users, X } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/dashboard/StatusDot";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import { formatRelative } from "@/components/dashboard/formatters";
import { useEvents, useTelegram } from "@/lib/api";

export const Route = createFileRoute("/telegram")({
  component: Telegram,
});

function Telegram() {
  const telegramQ = useTelegram();
  const eventsQ = useEvents();
  const telegramStats = telegramQ.data;
  const detectionEvents = eventsQ.data ?? [];

  if (telegramQ.isLoading) return <LoadingBlock label="Loading Telegram bot status…" />;
  if (telegramQ.error) return <ErrorBlock error={telegramQ.error} onRetry={() => telegramQ.refetch()} />;
  if (!telegramStats) return null;

  return (
    <>
      <PageHeader
        eyebrow="Bot API · long polling"
        title="Telegram Bot"
        description="Outbound alert delivery for critical detections and infrastructure incidents."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Bot} label="Bot" value={telegramStats.botHandle} tone="info" hint="Webhook mode" />
        <StatCard icon={Send} label="Sent today" value={telegramStats.sentToday} tone="success" />
        <StatCard icon={X} label="Failed today" value={telegramStats.failedToday} tone="warning" />
        <StatCard icon={Users} label="Subscribers" value={telegramStats.subscribers} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Bot status">
          <div className="space-y-2 text-sm">
            <Row label="Status" value={<StatusBadge status={telegramStats.status} />} />
            <Row label="Last alert" value={formatRelative(telegramStats.lastAlertIso)} />
            <Row label="Avg latency" value={<span className="font-mono">210 ms</span>} />
            <Row label="Retries 24h" value={<span className="font-mono">2</span>} />
          </div>
        </Panel>

        <Panel title="Last message preview" className="lg:col-span-2">
          <div className="rounded-md border border-border/70 bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <Bot className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Edge Sentinel</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatRelative(telegramStats.lastAlertIso)}
                  </span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap font-mono text-xs leading-relaxed">
{`🚨 CRITICAL · Intruder detected
Node: pi4-cam-lobby
Confidence: 94%
Time: ${new Date(telegramStats.lastAlertIso).toLocaleString()}
Evidence: https://edge-sentinel/events/EVT-24817`}
                </pre>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Per-event delivery" className="mt-4" contentClassName="p-0">
        {eventsQ.isLoading ? (
          <LoadingBlock />
        ) : eventsQ.error ? (
          <div className="p-4"><ErrorBlock error={eventsQ.error} onRetry={() => eventsQ.refetch()} /></div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Node</th>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {detectionEvents.map((e) => (
                <tr key={e.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs">{e.id}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{e.node}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {formatRelative(e.timestamp)}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Panel>
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