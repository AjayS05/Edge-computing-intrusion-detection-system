import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/prometheus": {
        target: "http://127.0.0.1:9090",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/prometheus/, ""),
      },
    },
  },
});
