import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Les tests portent sur les fixtures : le `.env` local peut pointer
// VITE_BC4_DATA=api vers une VM réelle, ce qui rendrait les adaptateurs
// mock inaccessibles. Fixé ici avant que Vite ne charge les fichiers .env.
process.env.VITE_BC4_DATA = "mock";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
