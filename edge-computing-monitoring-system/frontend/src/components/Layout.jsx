import { Box } from "@mui/material";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

const drawerWidth = 240;

function Layout({ children }) {
  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: `${drawerWidth}px`,
          minHeight: "100vh",
          bgcolor: "background.default",
        }}
      >
        <Navbar />

        <Box
  sx={{
    p: 4,
    width: "100%",
    maxWidth: "100%",
    mx: "auto",
  }}
>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default Layout;