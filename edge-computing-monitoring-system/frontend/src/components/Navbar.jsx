import {
  AppBar,
  Toolbar,
  Typography,
  Chip,
  Box,
} from "@mui/material";

function Navbar() {
  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: "#111827",
        borderBottom: "1px solid #1E293B",
      }}
    >
      <Toolbar>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" fontWeight="bold">
            Edge Computing Monitoring Dashboard
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Real-time AI Intrusion Detection & Monitoring
          </Typography>
        </Box>

        <Chip
          label="System Healthy"
          color="success"
          sx={{
            fontWeight: 600,
          }}
        />
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;