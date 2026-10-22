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
- Metrics shares KPI catalog/card classes and design-system controls; presentation changes must leave metric analysis queries and capture filters unchanged.

- Signaling visible time is shared by all timeline views in SignalingPage; navigator changes are local and never message/map query keys, while selected-message identity/time alone triggers follow, to preserve investigation state.
