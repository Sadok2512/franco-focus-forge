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
