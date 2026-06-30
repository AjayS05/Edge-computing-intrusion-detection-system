import { Grid, Typography, Box } from "@mui/material";

import Layout from "../components/Layout";
import StatCard from "../components/StatCard";
import EventTable from "../components/EventTable";
import SectionCard from "../components/SectionCard";

import NodeStatus from "../components/NodeStatus";
import HealthStatus from "../components/HealthStatus";
import AlertPanel from "../components/AlertPanel";
import CameraPreview from "../components/CameraPreview";

import { recentEvents } from "../data/mockData";

function Dashboard() {
  return (
  <Layout>
    <Box sx={{ width: "100%" }}>
      <Typography variant="h4" fontWeight="bold">
        Dashboard
      </Typography>

      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ mb: 4 }}
      >
        Monitor your edge infrastructure in real time.
      </Typography>

      <Grid container spacing={3}>

        {/* Cards */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="Total Events" value="153" />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="Threat Alerts" value="12" />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="Active Nodes" value="8" />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="CPU Usage" value="32%" />
        </Grid>

        {/* Recent Events */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <SectionCard title="Recent Events">
            <EventTable events={recentEvents} />
          </SectionCard>
        </Grid>

        {/* Health */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="System Health">
            <HealthStatus />
          </SectionCard>
        </Grid>

        {/* Nodes */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="Sensor Nodes">
            <NodeStatus />
          </SectionCard>
        </Grid>

        {/* Alerts */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="Latest Alerts">
            <AlertPanel />
          </SectionCard>
        </Grid>

        {/* Camera */}
        <Grid size={{ xs: 12 }}>
          <SectionCard title="Camera Preview">
            <CameraPreview />
          </SectionCard>
        </Grid>

      </Grid>
    </Box>
  </Layout>
);
}

export default Dashboard;