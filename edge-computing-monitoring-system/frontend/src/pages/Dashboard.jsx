import StatCard from "../components/StatCard";

import EventTable from "../components/EventTable";
import { recentEvents } from "../data/mockData";

function Dashboard() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Edge Computing Monitoring Dashboard</h1>

      <div
        style={{
          display: "flex",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        <StatCard title="Total Events" value="153" />
        <StatCard title="Threat Alerts" value="12" />
        <StatCard title="Active Nodes" value="3" />
      </div>
<h2 style={{ marginTop: "40px" }}>Recent Events</h2>

<EventTable events={recentEvents} />

    </div>
  );
}

export default Dashboard;