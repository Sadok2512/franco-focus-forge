// Equivalent to vitest.config.ts, with an ESM-safe root for --configLoader runner.
// Avoids writing the shared Docker-owned node_modules/.vite-temp directory.
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export default {
  root,
  cacheDir: "/tmp/bc4-kpi-vite-cache",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: { alias: { "@": root + "src" } },
};
