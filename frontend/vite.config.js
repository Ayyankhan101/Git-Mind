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
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      exclude: ["node_modules/", "src/setupTests.js"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  build: {
    outDir: "build",
  },
});
