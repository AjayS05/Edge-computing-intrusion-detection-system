import { useEffect, useState } from "react";

import { MonitoringPage } from "../pages/monitoring/MonitoringPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { EventHistoryPage } from "../pages/event-history/EventHistoryPage";
import { AlertsPage } from "../pages/alerts/AlertsPage";
import { Sidebar, type PageKey } from "../components/layout/Sidebar";
import { LiveDetectionPage } from "../pages/live-detection/LiveDetectionPage";
import { ModelDatasetPage } from "../pages/model-dataset/ModelDatasetPage";
import { ClusterPerformancePage } from "../pages/cluster-performance/ClusterPerformancePage";
import { Topbar } from "../components/layout/Topbar";
import { StoragePage } from "../pages/storage/StoragePage";
import "./App.css";
import { TelegramPage } from "../pages/Telegram/TelegramPage";

export type Theme = "light" | "dark";

const PAGE_TITLES: Record<PageKey, string> = {
  dashboard: "Dashboard",
  liveDetection: "Live Detection",
  eventHistory: "Event History",
  monitoring: "Monitoring",
  alerts: "Alerts",
  storage: "Storage",
  modelDataset: "Model & Dataset",
  telegram: "Telegram",
  clusterPerformance: "Cluster Performance",
};

function getInitialTheme(): Theme {
  const savedTheme = localStorage.getItem("edge-sentinel-theme");

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function App() {
  const [activePage, setActivePage] = useState<PageKey>("dashboard");
  const [theme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("edge-sentinel-theme", theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onPageChange={setActivePage}
        onlineNodes={5}
        totalNodes={6}
      />

      <div className="app-content">
        <Topbar pageTitle={PAGE_TITLES[activePage]} />

        <main className="app-main">
          {activePage === "dashboard" && <DashboardPage />}

          {activePage === "liveDetection" && <LiveDetectionPage />}

          {activePage === "eventHistory" && <EventHistoryPage />}

          {activePage === "monitoring" && <MonitoringPage />}

          {activePage === "alerts" && <AlertsPage />}

          {activePage === "storage" && <StoragePage/>
          }
          {activePage === "modelDataset" && <ModelDatasetPage />}
          {activePage === "clusterPerformance" && (
            <ClusterPerformancePage />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
