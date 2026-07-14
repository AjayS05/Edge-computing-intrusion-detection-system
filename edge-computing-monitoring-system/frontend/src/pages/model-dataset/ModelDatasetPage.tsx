import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Flame,
  Gauge,
  Layers,
  ShieldAlert,
  Target,
  User,
  Wind,
  Droplets,
  Cpu,
  FileCode2,
  ImageIcon,
  Boxes,
} from "lucide-react";
import { getModelInfo, type ModelInfoResponse } from "../../services/api";
import "./ModelDatasetPage.css";

type ClassItem = {
  name: string;
  count: number;
  percentage: number;
};

type ModelInfo = {
  model_name: string;
  model_file: string;
  architecture: string;
  framework: string;
  runtime: string;
  confidence_threshold: number;
  inference_time_ms: number;
  map50: number;
  map5095: number;
  training_images: number;
  validation_images: number;
  classes: ClassItem[];
};

const demoModel: ModelInfo = {
  model_name: "Custom YOLOv8 Threat Detector",
  model_file: "best_k.pt",
  architecture: "YOLOv8",
  framework: "Ultralytics",
  runtime: "PyTorch / ONNX",
  confidence_threshold: 0.55,
  inference_time_ms: 38,
  map50: 0.912,
  map5095: 0.671,
  training_images: 12480,
  validation_images: 2160,
  classes: [
    { name: "person", count: 4243, percentage: 34 },
    { name: "intruder", count: 2246, percentage: 18 },
    { name: "weapon", count: 1498, percentage: 12 },
    { name: "fire", count: 1373, percentage: 11 },
    { name: "smoke", count: 1872, percentage: 15 },
    { name: "liquid_spill", count: 1248, percentage: 10 },
  ],
};

function normalizeClasses(classes: ModelInfoResponse["classes"]): ClassItem[] {
  if (!Array.isArray(classes) || classes.length === 0) {
    return demoModel.classes;
  }

  if (typeof classes[0] === "string") {
    const classNames = classes as string[];
    const percentage = Math.round(100 / classNames.length);

    return classNames.map((name) => ({
      name,
      count: 0,
      percentage,
    }));
  }

  const classItems = classes as {
    name?: string;
    count?: number;
    percentage?: number;
  }[];

  const totalCount = classItems.reduce(
    (sum, item) => sum + Number(item.count ?? 0),
    0,
  );

  return classItems.map((item) => {
    const count = Number(item.count ?? 0);

    return {
      name: item.name ?? "unknown",
      count,
      percentage:
        typeof item.percentage === "number"
          ? item.percentage
          : totalCount > 0
          ? Math.round((count / totalCount) * 100)
          : 0,
    };
  });
}

function normalizeModelInfo(data: ModelInfoResponse): ModelInfo {
  return {
    model_name: data.model_name || demoModel.model_name,
    model_file: data.model_file || demoModel.model_file,
    architecture: data.architecture || demoModel.architecture,
    framework: data.framework || demoModel.framework,
    runtime: data.runtime || demoModel.runtime,
    confidence_threshold:
      data.confidence_threshold ?? demoModel.confidence_threshold,
    inference_time_ms: data.inference_time_ms ?? demoModel.inference_time_ms,
    map50: data.map50 ?? data.map_score ?? demoModel.map50,
    map5095: data.map5095 ?? demoModel.map5095,
    training_images: data.training_images ?? demoModel.training_images,
    validation_images:
      data.validation_images ??
      data.validation_images_count ??
      demoModel.validation_images,
    classes: normalizeClasses(data.classes),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getClassIcon(name: string): ReactNode {
  const value = name.toLowerCase();

  if (value.includes("person")) return <User size={22} />;
  if (value.includes("intruder")) return <ShieldAlert size={22} />;
  if (value.includes("weapon")) return <AlertTriangle size={22} />;
  if (value.includes("fire")) return <Flame size={22} />;
  if (value.includes("smoke")) return <Wind size={22} />;
  if (value.includes("liquid")) return <Droplets size={22} />;

  return <Target size={22} />;
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  tone = "cyan",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  tone?: "cyan" | "green" | "white";
}) {
  return (
    <div className="model-metric-card">
      <div>
        <span>{label}</span>
        <strong className={tone}>{value}</strong>
        {sub && <p>{sub}</p>}
      </div>

      <div className={`model-metric-icon ${tone}`}>{icon}</div>
    </div>
  );
}

export function ModelDatasetPage() {
  const [model, setModel] = useState<ModelInfo>(demoModel);
  const [loading, setLoading] = useState(true);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  useEffect(() => {
    async function loadModelInfo() {
      try {
        const data = await getModelInfo();

        setModel(normalizeModelInfo(data));
        setApiNotice(null);
      } catch (error) {
        console.error("Model info API error:", error);
        setModel(demoModel);
        setApiNotice(
          "Showing demo data because the model info API is not available yet.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadModelInfo();
  }, []);

  if (loading) {
    return (
      <section className="model-page">
        <div className="model-panel">
          <div className="model-panel-header">
            <h2>Loading model and dataset information...</h2>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="model-page">
      <div className="model-page-header">
        <p>MODEL · DATASET</p>
        <h1>{model.model_name}</h1>
        <span>
          Custom YOLO threat-detection model trained for Pi4 camera frames and
          deployed in the edge monitoring pipeline.
        </span>
      </div>

      {apiNotice && <div className="model-api-notice">{apiNotice}</div>}

      <div className="model-metric-grid">
        <MetricCard
          label="Confidence threshold"
          value={model.confidence_threshold.toFixed(2)}
          sub="Detection cutoff"
          icon={<Target size={24} />}
          tone="cyan"
        />

        <MetricCard
          label="Inference time"
          value={`${model.inference_time_ms} ms`}
          sub="Average per frame"
          icon={<Gauge size={24} />}
          tone="green"
        />

        <MetricCard
          label="mAP@50"
          value={model.map50.toFixed(3)}
          sub="Validation score"
          icon={<Layers size={24} />}
          tone="green"
        />

        <MetricCard
          label="mAP@50-95"
          value={model.map5095.toFixed(3)}
          sub="Strict validation score"
          icon={<Boxes size={24} />}
          tone="white"
        />
      </div>

      <div className="model-main-grid">
        <div className="model-panel">
          <div className="model-panel-header">
            <h2>Model metadata</h2>
          </div>

          <div className="model-metadata-list">
            <div>
              <span>Name</span>
              <strong>{model.model_name}</strong>
            </div>

            <div>
              <span>File</span>
              <strong>{model.model_file}</strong>
            </div>

            <div>
              <span>Architecture</span>
              <strong>{model.architecture}</strong>
            </div>

            <div>
              <span>Framework</span>
              <strong>{model.framework}</strong>
            </div>

            <div>
              <span>Threshold</span>
              <strong>{model.confidence_threshold}</strong>
            </div>

            <div>
              <span>Runtime</span>
              <strong>{model.runtime}</strong>
            </div>
          </div>
        </div>

        <div className="model-panel dataset-panel">
          <div className="model-panel-header">
            <h2>Dataset summary</h2>
          </div>

          <div className="dataset-summary-cards">
            <div>
              <ImageIcon size={20} />
              <span>Training images</span>
              <strong>{formatNumber(model.training_images)}</strong>
            </div>

            <div>
              <FileCode2 size={20} />
              <span>Validation images</span>
              <strong>{formatNumber(model.validation_images)}</strong>
            </div>

            <div>
              <Boxes size={20} />
              <span>Total classes</span>
              <strong>{model.classes.length}</strong>
            </div>
          </div>

          <div className="class-distribution">
            <p>Class distribution</p>

            {model.classes.map((item) => (
              <div className="class-row" key={item.name}>
                <div className="class-name">
                  {getClassIcon(item.name)}
                  <strong>{item.name}</strong>
                </div>

                <div className="class-bar-wrap">
                  <div className="class-bar">
                    <span style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>

                <span className="class-percent">{item.percentage}%</span>
                <span className="class-count">
                  {item.count > 0 ? formatNumber(item.count) : "N/A"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="model-panel supported-panel">
        <div className="model-panel-header">
          <h2>Supported classes</h2>
        </div>

        <div className="supported-class-grid">
          {model.classes.map((item) => (
            <div className="supported-class-card" key={item.name}>
              <div>{getClassIcon(item.name)}</div>

              <section>
                <strong>{item.name}</strong>
                <span>class</span>
              </section>
            </div>
          ))}
        </div>
      </div>

      <div className="model-panel pipeline-panel">
        <div className="model-panel-header">
          <h2>Deployment pipeline</h2>
        </div>

        <div className="model-pipeline">
          <div>
            <Cpu size={22} />
            <strong>Pi4 Camera</strong>
            <span>Captures live frame</span>
          </div>

          <div>
            <Boxes size={22} />
            <strong>8 Chunks</strong>
            <span>Frame split for workers</span>
          </div>

          <div>
            <Cpu size={22} />
            <strong>Pi3 Workers</strong>
            <span>Distributed processing</span>
          </div>

          <div>
            <ShieldAlert size={22} />
            <strong>YOLO Result</strong>
            <span>Threat detected</span>
          </div>

          <div>
            <Target size={22} />
            <strong>Evidence</strong>
            <span>Metadata + images stored</span>
          </div>
        </div>
      </div>
    </section>
  );
}
