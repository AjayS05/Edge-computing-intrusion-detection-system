import { Box } from "@mui/material";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

function Layout({ children }) {
  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: "background.default",
          minHeight: "100vh",
        }}
      >
        <Navbar />

        <Box
          sx={{
            p: 4,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default Layout;