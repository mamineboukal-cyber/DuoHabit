import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        // 127.0.0.1 avoids Node resolving localhost to ::1 on Windows while
        // Flask listens on 127.0.0.1.
        target: "http://127.0.0.1:5000",
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost:5173" },
    },
    setupFiles: ["./src/tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
