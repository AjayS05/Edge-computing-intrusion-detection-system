import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Database,
  HardDrive,
  ImageIcon,
  RefreshCcw,
  Server,
  Upload,
} from "lucide-react";
import {
  getStorageStatus,
  type StorageStatusResponse,
} from "../../services/api";
import "./StoragePage.css";

const fallbackStorage: StorageStatusResponse = {
  provider: "SeaweedFS",
  compatibility: "S3 API compatible",
  bucket: "edge-sentinel-frames",
  raw_images: 18432,
  annotated_images: 18398,
  metadata_records: 18432,
  used_gb: 62.4,
  total_gb: 128,
  usage_percent: 49,
  status: "online",
  last_upload: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  replication: "2×",
  upload_throughput_mbps: 12.4,
  health: [
    { name: "Master volume", status: "online" },
    { name: "Replica volume A", status: "online" },
    { name: "Replica volume B", status: "online" },
    { name: "Upload throughput", status: "online", value: "12.4 MB/s" },
    { name: "Metadata DB", status: "online" },
  ],
  recent_uploads: [
    {
      id: "1",
      filename: "evt_2f8a91.jpg",
      path: "s3://edge-sentinel-frames/raw/evt_2f8a91.jpg",
      uploaded_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      type: "raw",
    },
    {
      id: "2",
      filename: "evt_1d4c7b.jpg",
      path: "s3://edge-sentinel-frames/annotated/evt_1d4c7b.jpg",
      uploaded_at: new Date(Date.now() - 2.2 * 60 * 60 * 1000).toISOString(),
      type: "annotated",
    },
    {
      id: "3",
      filename: "evt_9a3e12.json",
      path: "s3://edge-sentinel-frames/metadata/evt_9a3e12.json",
      uploaded_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      type: "metadata",
    },
  ],
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatRelativeTime(value: string | null) {
  if (!value) return "unknown";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="storage-metric-card">
      <div>
        <span>{label}</span>
        <strong className={accent ? "accent" : ""}>{value}</strong>
        {sub && <p>{sub}</p>}
      </div>

      <div className="storage-metric-icon">{icon}</div>
    </div>
  );
}

export function StoragePage() {
  const [storage, setStorage] =
    useState<StorageStatusResponse>(fallbackStorage);
  const [loading, setLoading] = useState(true);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  async function loadStorageStatus() {
    try {
      setLoading(true);
      const data = await getStorageStatus();
      setStorage(data);
      setApiNotice(null);
    } catch (error) {
      console.error("Storage API error:", error);
      setStorage(fallbackStorage);
      setApiNotice(
        "Showing fallback storage data because /api/v1/storage/status is not available.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStorageStatus();
  }, []);

  const usageLabel = useMemo(() => {
    return `${storage.used_gb} / ${storage.total_gb} GB`;
  }, [storage.used_gb, storage.total_gb]);

  return (
    <section className="storage-page">
      <div className="storage-page-header">
        <div>
          <p>SEAWEEDFS · S3 GATEWAY</p>
          <h1>Storage</h1>
          <span>
            Object store for raw frames, YOLO-annotated evidence, and event
            metadata.
          </span>
        </div>

        <button
          type="button"
          className="storage-refresh-button"
          onClick={() => void loadStorageStatus()}
        >
          <RefreshCcw size={17} />
          Refresh
        </button>
      </div>

      {apiNotice && <div className="storage-api-notice">{apiNotice}</div>}

      <div className="storage-metric-grid">
        <MetricCard
          label="Provider"
          value={storage.provider}
          sub={storage.compatibility}
          icon={<Database size={22} />}
          accent
        />

        <MetricCard
          label="Raw images"
          value={formatNumber(storage.raw_images)}
          icon={<ImageIcon size={22} />}
        />

        <MetricCard
          label="Annotated"
          value={formatNumber(storage.annotated_images)}
          icon={<ImageIcon size={22} />}
        />

        <MetricCard
          label="Metadata records"
          value={formatNumber(storage.metadata_records)}
          icon={<Copy size={22} />}
        />
      </div>

      <div className="storage-main-grid">
        <div className="storage-panel">
          <div className="storage-panel-header">
            <h2>Volume usage</h2>
          </div>

          <div className="storage-usage-body">
            <div className="storage-usage-top">
              <strong>{storage.usage_percent}%</strong>
              <span>{usageLabel}</span>
            </div>

            <div className="storage-progress">
              <span style={{ width: `${storage.usage_percent}%` }} />
            </div>

            <div className="storage-detail-list">
              <div>
                <span>Status</span>
                <strong className={`storage-status ${storage.status}`}>
                  <CheckCircle2 size={14} />
                  {storage.status}
                </strong>
              </div>

              <div>
                <span>Last upload</span>
                <strong>{formatRelativeTime(storage.last_upload)}</strong>
              </div>

              <div>
                <span>Replication</span>
                <strong>{storage.replication}</strong>
              </div>

              <div>
                <span>Bucket</span>
                <strong>{storage.bucket}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="storage-panel">
          <div className="storage-panel-header">
            <h2>Health</h2>
          </div>

          <div className="storage-health-list">
            {storage.health.map((item) => (
              <div className="storage-health-row" key={item.name}>
                <div>
                  {item.name.toLowerCase().includes("throughput") ? (
                    <Upload size={18} />
                  ) : item.name.toLowerCase().includes("metadata") ? (
                    <Database size={18} />
                  ) : (
                    <HardDrive size={18} />
                  )}

                  <span>{item.name}</span>
                </div>

                {item.value ? (
                  <strong>{item.value}</strong>
                ) : (
                  <strong className={`storage-status ${item.status}`}>
                    <CheckCircle2 size={14} />
                    {item.status}
                  </strong>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="storage-panel storage-recent-panel">
          <div className="storage-panel-header">
            <h2>Recent uploads</h2>
          </div>

          <div className="storage-upload-list">
            {storage.recent_uploads.map((upload) => (
              <div className="storage-upload-row" key={upload.id}>
                <div className="storage-upload-icon">
                  {upload.type === "metadata" ? (
                    <Database size={18} />
                  ) : (
                    <ImageIcon size={18} />
                  )}
                </div>

                <div className="storage-upload-main">
                  <strong>{upload.filename}</strong>
                  <span>{upload.path}</span>
                </div>

                <time>{formatRelativeTime(upload.uploaded_at)}</time>
              </div>
            ))}

            {!loading && storage.recent_uploads.length === 0 && (
              <div className="storage-empty">No recent uploads found.</div>
            )}
          </div>
        </div>
      </div>

      <div className="storage-panel storage-flow-panel">
        <div className="storage-panel-header">
          <h2>Storage pipeline</h2>
        </div>

        <div className="storage-flow">
          <div>
            <Server size={20} />
            <strong>Pi4 frame upload</strong>
            <span>Raw image enters backend</span>
          </div>

          <div>
            <ImageIcon size={20} />
            <strong>Raw frame</strong>
            <span>Saved to object storage</span>
          </div>

          <div>
            <ImageIcon size={20} />
            <strong>Annotated frame</strong>
            <span>YOLO result saved</span>
          </div>

          <div>
            <Database size={20} />
            <strong>Metadata record</strong>
            <span>Event JSON stored</span>
          </div>
        </div>
      </div>
    </section>
  );
}
