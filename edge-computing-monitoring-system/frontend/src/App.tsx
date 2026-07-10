import { useState } from "react";
import { MonitoringPage } from "./pages/MonitoringPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EventHistoryPage } from "./pages/EventHistoryPage";
import { AlertsPage } from "./pages/AlertsPage";
import { Sidebar, type PageKey } from "./components/Sidebar";
import "./App.css";
function App() {
  const [activePage, setActivePage] = useState<PageKey>("dashboard");

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onPageChange={setActivePage}
        onlineNodes={5}
        totalNodes={6}
      />

      <main className="app-main">
        {activePage === "dashboard" && <DashboardPage />}

        {activePage === "liveDetection" && (
          <>
            <h2>Live Detection</h2>
            <p>Live Detection page is ready.</p>
          </>
        )}

        {activePage === "eventHistory" && <EventHistoryPage />}

        {activePage === "monitoring" && <MonitoringPage />}

        {activePage === "alerts" && <AlertsPage />}

        {activePage === "storage" && (
          <>
            <h2>Storage</h2>
            <p>Storage page is ready.</p>
          </>
        )}

        {activePage === "telegram" && (
          <>
            <h2>Telegram</h2>
            <p>Telegram page is ready.</p>
          </>
        )}

        {activePage === "modelDataset" && (
          <>
            <h2>Model & Dataset</h2>
            <p>Model and dataset page is ready.</p>
          </>
        )}

        {activePage === "clusterPerformance" && (
          <>
            <h2>Cluster Performance</h2>
            <p>Cluster performance page is ready.</p>
          </>
        )}
      </main>
    </div>
  );
}

export default App;