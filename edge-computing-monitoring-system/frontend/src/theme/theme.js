import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",

    primary: {
      main: "#3B82F6",
    },

    success: {
      main: "#22C55E",
    },

    warning: {
      main: "#F59E0B",
    },

    error: {
      main: "#EF4444",
    },

    background: {
      default: "#0B1120",
      paper: "#1E293B",
    },

    text: {
      primary: "#F8FAFC",
      secondary: "#94A3B8",
    },
  },

  shape: {
    borderRadius: 16,
  },

  typography: {
    fontFamily: "'Inter', 'Roboto', sans-serif",

    h4: {
      fontWeight: 700,
    },

    h5: {
      fontWeight: 600,
    },

    h6: {
      fontWeight: 600,
    },
  },
});

export default theme;