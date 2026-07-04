import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/repos": "http://localhost:8002",
      "/summary": "http://localhost:8002",
      "/chat": "http://localhost:8002",
      "/fix": "http://localhost:8002",
      "/monitor": "http://localhost:8002",
      "/ws": {
        target: "ws://localhost:8002",
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
    css: false,
  },
  build: {
    outDir: "build",
  },
});
