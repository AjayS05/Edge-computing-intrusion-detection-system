import {
  Bell,
  Boxes,
  Cpu,
  Database,
  Gauge,
  Grid2X2,
  History,
  RadioTower,
  Send,
  ShieldCheck,
} from "lucide-react";
import "./Sidebar.css";

export type PageKey =
  | "dashboard"
  | "liveDetection"
  | "eventHistory"
  | "monitoring"
  | "alerts"
  | "storage"
  | "clusterPerformance";

type SidebarProps = {
  activePage: PageKey;
  onPageChange: (page: PageKey) => void;
  onlineNodes?: number;
  totalNodes?: number;
};

const operations = [
  { key: "dashboard", label: "Dashboard", icon: Grid2X2 },
  { key: "liveDetection", label: "Live Detection", icon: RadioTower },
  { key: "eventHistory", label: "Event History", icon: History },
  { key: "monitoring", label: "Monitoring", icon: Gauge },
  { key: "alerts", label: "Alerts", icon: Bell },
] as const;

const platform = [
  { key: "storage", label: "Storage", icon: Database },
  { key: "clusterPerformance", label: "Cluster Performance", icon: Cpu },
] as const;

export function Sidebar({
  activePage,
  onPageChange,
  onlineNodes = 5,
  totalNodes = 6,
}: SidebarProps) {
  const isHealthy = onlineNodes === totalNodes;

  return (
    <aside className="sentinel-sidebar">
      <div className="sentinel-brand">
        <div className="sentinel-logo">
          <ShieldCheck size={24} />
        </div>

        <div>
          <h1>PI WATCH</h1>
          <p>V1.4.2 · K3S</p>
        </div>
      </div>

      <nav className="sentinel-nav">
        <SidebarGroup
          title="Operations"
          items={operations}
          activePage={activePage}
          onPageChange={onPageChange}
        />

        <SidebarGroup
          title="Platform"
          items={platform}
          activePage={activePage}
          onPageChange={onPageChange}
        />
      </nav>

      <div className="sentinel-health">
        <span className={isHealthy ? "health-dot healthy" : "health-dot warning"} />

        <div>
          <strong>{isHealthy ? "Cluster healthy" : "Cluster warning"}</strong>
          <p>
            {onlineNodes} / {totalNodes} nodes online
          </p>
        </div>
      </div>
    </aside>
  );
}

function SidebarGroup({
  title,
  items,
  activePage,
  onPageChange,
}: {
  title: string;
  items: readonly {
    key: PageKey;
    label: string;
    icon: React.ElementType;
  }[];
  activePage: PageKey;
  onPageChange: (page: PageKey) => void;
}) {
  return (
    <section className="sentinel-nav-group">
      <h2>{title}</h2>

      <div className="sentinel-nav-list">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.key;

          return (
            <button
              key={item.key}
              type="button"
              className={active ? "sentinel-nav-item active" : "sentinel-nav-item"}
              onClick={() => onPageChange(item.key)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
