import { Box, Typography, Grid } from "@mui/material";

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
      <Box
        sx={{
          width: "100%",
        }}
      >
        {/* Dashboard Heading */}
        <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>
          Dashboard
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mb: 4 }}
        >
          Monitor your edge infrastructure in real time.
        </Typography>

        {/* Statistics */}
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Total Events" value="153" />
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Threat Alerts" value="12" />
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Active Nodes" value="8" />
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="CPU Usage" value="32%" />
          </Grid>

          {/* Recent Events */}
          <Grid item xs={12} md={8}>
            <SectionCard title="Recent Events">
              <EventTable events={recentEvents} />
            </SectionCard>
          </Grid>

          {/* System Health */}
          <Grid item xs={12} md={4}>
            <SectionCard title="System Health">
              <HealthStatus />
            </SectionCard>
          </Grid>

          {/* Sensor Nodes */}
          <Grid item xs={12} md={6}>
            <SectionCard title="Sensor Nodes">
              <NodeStatus />
            </SectionCard>
          </Grid>

          {/* Latest Alerts */}
          <Grid item xs={12} md={6}>
            <SectionCard title="Latest Alerts">
              <AlertPanel />
            </SectionCard>
          </Grid>

          {/* Camera Preview */}
          <Grid item xs={12}>
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