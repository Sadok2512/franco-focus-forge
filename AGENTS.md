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
- Remember-me selects localStorage versus sessionStorage through the HTTP auth adapter and remembers only the username; never persist passwords or extend the VM-issued token expiry. Login redirects valid existing sessions to projects.
- Network Events uses a frontend presentation allowlist in signaling/network-events.ts; other tracks, capture duration, source events and message queries remain independent of that allowlist.
- UI reads data only through `src/lib/api/client.ts` (typed mock adapter, Zod schemas in `schemas.ts`); fixtures stay isolated in `fixtures.ts` so a real backend can replace them without touching components.
- Shared filters live in URL search params on the `_app` layout (`src/lib/filters.ts`) so every module and future assistant use identical effective filters and links are shareable.
- `_app` routes are client-only (`ssr: false`) because mock auth lives in localStorage.
- maplibre-gl is excluded from Vite optimizeDeps; prebundling breaks its module worker.
- Missing measurements are `null` and rendered "N/D", never coerced to zero.
- RRC Dictionary lives in `src/features/dictionary/`, its fixtures in `src/mocks/dictionary.ts` and its adapter in `src/lib/api/dictionary.ts` (re-exported by client.ts); the mock aggregates raw observations so every displayed number traces to a response, and conversions are computed only from the API `conversion_rule`.
- Assistant IA lives in `src/features/assistant/`, its deterministic engine in `src/mocks/assistant.ts` and its adapter in `src/lib/api/assistant.ts` (re-exported by client.ts); every claim carries an evidence kind (OBSERVED/CALCULATED/INTERPRETED/UNAVAILABLE) and numbers are computed from mock points or the dictionary adapter, so unsupported questions answer UNAVAILABLE instead of inventing data.
- RRC Dictionary grouping (none/operator/band/operator+band) is computed in `src/features/dictionary/grouping.ts` from the API `value_matrix` so histogram and table always share one dataset; without `value_matrix` only totals are shown.

- RRC chart and table share effective grouping, value/legend filtering, normalization and semantic color mapping from `chart-data.ts` so displayed cells and marks remain synchronized.

## UI translations
No hardcoded UI strings: use `t('key')`. Add each new key to both `src/locales/en.json` and `src/locales/fr.json` in the same commit. English is the default. Backend-provided wording is translated by the API, not by client-side substitutions.

- Signaling cursor uses one capture-time state in SignalingPage and a single ECharts pixel overlay across all RF grids; cursor motion is local so selection never becomes a list query key or triggers details requests.
- Signaling starts its cursor at capture time zero without selecting a message; pixel overlays refresh on chart readiness and resize, and hover previews never replace the locked cursor.
- Metrics shares KPI catalog/card classes and design-system controls; presentation changes must leave metric analysis queries and capture filters unchanged.

- Signaling visible time and TimeNavigator are shared by all timeline views in SignalingPage; both /signaling and /signaling-v2 use the UE/RRC State layout with the configurable 30 s initial window (user request to match the V6 mockup). Zoom changes are local and never message/map query keys.
- Navigator edge resizing uses a pure boundary-clamping helper and capture-coordinate pointer deltas; it changes only the shared visible window, never cursor or message state.
- Signaling V2 validates supplied state intervals in state-evidence.ts only, never reconstructs them from nearby messages; both boundary sequences, capture/session identity, technology and versioned source rules are required, and carrier labels require separate explicit CA evidence. This keeps Unknown honest until the VM evidence contract is validated.
- The proven LTE context rule accepts the opening RRA or the intermediate RRC as event seq while retaining the full ordered source chain and release boundary; UE and RRC states are validated separately so RF pivot serialization cannot hide proven bands or invent states.
- Signaling timeline tracks resolve from `attrs.track` with the VM's canonical `lane` as fallback (event-track.ts), and events carrying no protocol attribute bypass the protocol layer filter; icons are mapped in event-icons.tsx from supplied types and tracks, with Lucide SVG images kept inside ECharts event groups to preserve exact message selection and time alignment.
