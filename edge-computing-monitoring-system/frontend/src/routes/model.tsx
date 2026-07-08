import { createFileRoute } from "@tanstack/react-router";
import { Boxes, FileCode2, Gauge, Layers, Target } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { StatCard } from "@/components/dashboard/StatCard";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard/QueryState";
import { classIcons } from "@/components/dashboard/icons";
import { Progress } from "@/components/ui/progress";
import { useModel } from "@/lib/api";

export const Route = createFileRoute("/model")({
  component: Model,
});

function Model() {
  const { data: modelInfo, isLoading, error, refetch } = useModel();

  if (isLoading) return <LoadingBlock label="Loading model info…" />;
  if (error) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  if (!modelInfo) return null;

  const classDist =
    modelInfo.classDistribution ??
    modelInfo.classes.map((name) => ({
      name,
      pct: Math.round(100 / Math.max(1, modelInfo.classes.length)),
    }));

  return (
    <>
      <PageHeader
        eyebrow={modelInfo.file}
        title={modelInfo.name}
        description="Trained on a custom threat-detection dataset. Deployed to the k3s inference workers."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Target} label="Confidence threshold" value={modelInfo.confidenceThreshold.toFixed(2)} tone="info" />
        <StatCard icon={Gauge} label="Inference time" value={`${modelInfo.inferenceMs} ms`} tone="success" hint="Pi5 CPU · int8" />
        <StatCard icon={Layers} label="mAP@50" value={modelInfo.mAP50.toFixed(3)} tone="success" />
        <StatCard icon={Layers} label="mAP@50-95" value={modelInfo.mAP5095.toFixed(3)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Model metadata" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Row label="Name" value={modelInfo.name} />
            <Row label="File" value={<span className="font-mono">{modelInfo.file}</span>} />
            <Row label="Architecture" value={<span className="font-mono">YOLOv8n</span>} />
            <Row label="Framework" value={<span className="font-mono">Ultralytics 8.2</span>} />
            <Row label="Threshold" value={<span className="font-mono">{modelInfo.confidenceThreshold}</span>} />
            <Row label="Runtime" value={<span className="font-mono">ONNX · int8</span>} />
          </dl>
        </Panel>

        <Panel title="Dataset summary" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Metric label="Training images" value={modelInfo.trainingImages.toLocaleString()} icon={FileCode2} />
            <Metric label="Validation images" value={modelInfo.validationImages.toLocaleString()} icon={FileCode2} />
            <Metric label="Total classes" value={modelInfo.classes.length} icon={Boxes} />
          </div>
          <div className="mt-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Class distribution (training)
            </div>
            <ul className="mt-2 space-y-2">
              {classDist.map((c) => {
                const Icon = classIcons[c.name] ?? classIcons.person;
                return (
                  <li key={c.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                    <Icon className="size-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{c.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{c.pct}%</span>
                      </div>
                      <Progress value={c.pct} className="mt-1 h-1.5" />
                    </div>
                    <span className="w-16 text-right font-mono text-xs text-muted-foreground">
                      {Math.round((modelInfo.trainingImages * c.pct) / 100)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Panel>
      </div>

      <Panel title="Supported classes" className="mt-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {modelInfo.classes.map((name) => {
            const Icon = classIcons[name] ?? classIcons.person;
            return (
              <div
                key={name}
                className="flex items-center gap-3 rounded-md border border-border/70 bg-muted/20 p-3"
              >
                <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-medium">{name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">class</div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: typeof Boxes }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1.5 font-display text-xl font-semibold">{value}</div>
    </div>
  );
}