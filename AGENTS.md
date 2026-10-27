<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- App-wide fullscreen targets document.documentElement through the shared header control and follows fullscreenchange, so navigation and Escape preserve accurate state.
- Signaling reuses DriveRsrpLayer with a controlled active capture and separate visibility preferences; it auto-frames only when the capture has no GPS markers (fallback view), so coverage never switches captures or moves an investigation camera that is already on the trajectory. Drive RSRP requests the `cell_rsrp@0` selection because the metrics table expects `code@cell`.
- Remember-me selects localStorage versus sessionStorage through the HTTP auth adapter and remembers only the username; never persist passwords or extend the VM-issued token expiry. Login redirects valid existing sessions to projects.
- UI reads data only through `src/lib/api/client.ts` (typed mock adapter, Zod schemas in `schemas.ts`); fixtures stay isolated in `fixtures.ts` so a real backend can replace them without touching components.
- Shared filters live in URL search params on the `_app` layout (`src/lib/filters.ts`) so every module and future assistant use identical effective filters and links are shareable.
- `_app` routes are client-only (`ssr: false`) because mock auth lives in localStorage.
- maplibre-gl is excluded from Vite optimizeDeps; prebundling breaks its module worker.
- Every maplibre-gl v6 map must set an explicit bundled worker before creating the Map: `import("maplibre-gl/dist/maplibre-gl-worker.mjs?url")` then `setWorkerUrl(worker.default)` (see KpiMapOSM, SignalingMap, AssistantMap). The old `workerCount = 0` fallback is removed in v6 and leaves a blank canvas.
- Missing measurements are `null` and rendered "N/D", never coerced to zero.
- Metric map panels request proven GPS through the typed analysis adapter for the active capture and individual selection; their per-tab visualization is independent of the measurements table so changing a card never replaces that table.
- Tests always run against fixtures: `vitest.config.ts` sets `VITE_BC4_DATA=mock` before Vite loads `.env`, so the suite never depends on whichever backend the local `.env` points at.

- Superstreams only reference existing project logs by id through `src/lib/api/superstreams.ts`; managing them never copies, decodes or deletes logs.

## UI translations
No hardcoded UI strings: use `t('key')`. Add each new key to both `src/locales/en.json` and `src/locales/fr.json` in the same commit. English is the default. Backend-provided wording is translated by the API, not by client-side substitutions.

## Subdirectory rules
Subdirectories have their own `AGENTS.md` to read before changing files there: `src/features/signaling/`, `src/features/kpi/`, `src/features/dictionary/`, `src/features/assistant/`.
- AI features call Lovable AI Gateway only from server code (`src/lib/ai/*.server.ts` behind `createServerFn` in `*.functions.ts`); the RSRP diagnosis sends only app-observed status plus technician-entered metadata and the prompt forbids inventing values.
