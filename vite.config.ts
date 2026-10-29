// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { ServerResponse } from "node:http";
import { isTransientUpstreamError } from "./src/lib/upstream-unavailable";

// Backend upstream for the dev proxy. Resolution order :
//   1. VITE_BC4_API_UPSTREAM si défini (ex: http://api:8000 en compose,
//      http://localhost:8000 hors container, http://127.0.0.1:8000 ailleurs)
//   2. http://api:8000  (nom de service docker-compose, cas par défaut
//      quand le front tourne dans `bc4-front-1`).
// Le navigateur, lui, ne voit que /api/* — même origine, pas de CORS.
const API_UPSTREAM = process.env["VITE_BC4_API_UPSTREAM"] || "http://api:8000";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // 1.117.2 (audit perf 2026-10-29) : compression gzip + brotli des assets
  // publics AU BUILD TIME. Avant : bundle 662 KB uncompressed (24 chunks),
  // Nitro ne compressait pas les réponses. Après : chaque fichier
  // /assets/*.js|css est aussi émis en .gz et .br, Nitro sert la variante
  // selon Accept-Encoding du client (gain ~70 % : 662 KB → ~200 KB gzip,
  // ~170 KB br). Compression statique faite au build, zéro CPU runtime.
  nitro: {
    compressPublicAssets: { gzip: true, brotli: true },
  },
  vite: {
    optimizeDeps: { exclude: ["maplibre-gl"] },
    server: {
      proxy: {
        "/api": {
          target: API_UPSTREAM,
          changeOrigin: true,
          // 10 minutes : upload 128 Mo + ingest CSV ≈ 2 min aujourd'hui.
          // Marge large pour éviter que le proxy ne coupe la connexion.
          timeout: 600_000,
          proxyTimeout: 600_000,
          rewrite: (p: string) => p.replace(/^\/api/, ""),
          configure: (proxy) => {
            proxy.on("error", (error, _request, response) => {
              if (!isTransientUpstreamError(error) || !("writeHead" in response)) return;
              const serverResponse = response as ServerResponse;
              if (serverResponse.headersSent) return;
              serverResponse.writeHead(503, {
                "Content-Type": "application/json; charset=utf-8",
                "Retry-After": "3",
              });
              serverResponse.end(
                JSON.stringify({
                  detail: {
                    code: "UPSTREAM_UNAVAILABLE",
                    message: "Reconnexion au backend…",
                  },
                }),
              );
            });
          },
        },
        // 1.67.0 — Proxy des tuiles OSM via le dev-server quand le poste
        // utilisateur n'a pas d'accès sortant à tile.openstreetmap.org.
        // Back100 (le serveur de dev) peut y accéder ; le navigateur passe
        // par /osm/* servi en même origine.
        "/osm": {
          target: "https://tile.openstreetmap.org",
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/osm/, ""),
          headers: { "User-Agent": "BC4-SignalingView/1.67.0 (dev proxy)" },
        },
      },
    },
  },
});
