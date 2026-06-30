import {
  Dashboard,
  Warning,
  Memory,
  Map,
  Notifications,
  Settings,
} from "@mui/icons-material";

import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Box,
} from "@mui/material";

const drawerWidth = 240;

const menuItems = [
  { text: "Dashboard", icon: <Dashboard /> },
  { text: "Events", icon: <Warning /> },
  { text: "Sensor Nodes", icon: <Memory /> },
  { text: "Map", icon: <Map /> },
  { text: "Notifications", icon: <Notifications /> },
  { text: "Settings", icon: <Settings /> },
];

function Sidebar() {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
          bgcolor: "#111827",
          borderRight: "1px solid #1E293B",
        },
      }}
    >
      <Toolbar>
        <Box>
          <Typography
            variant="h5"
            fontWeight="bold"
            color="primary.main"
          >
            Edge Monitor
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
          >
            AI Monitoring System
          </Typography>
        </Box>
      </Toolbar>

      <Divider sx={{ borderColor: "#1E293B" }} />

      <List sx={{ mt: 2 }}>
        {menuItems.map((item, index) => (
          <ListItemButton
            key={item.text}
            selected={index === 0}
            sx={{
              mx: 1,
              mb: 1,
              borderRadius: 2,

              "&.Mui-selected": {
                bgcolor: "primary.main",
                color: "white",
              },

              "&.Mui-selected .MuiListItemIcon-root": {
                color: "white",
              },

              "&:hover": {
                bgcolor: "#1E293B",
              },
            }}
          >
            <ListItemIcon
              sx={{
                color: "text.secondary",
                minWidth: 40,
              }}
            >
              {item.icon}
            </ListItemIcon>

            <ListItemText primary={item.text} />
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
}

export default Sidebar;