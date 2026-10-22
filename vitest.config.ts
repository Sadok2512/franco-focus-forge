import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Les tests portent sur les fixtures : ils ne doivent pas dépendre du
    // .env local (qui peut pointer VITE_BC4_DATA=api vers une VM réelle).
    env: { VITE_BC4_DATA: "mock" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
