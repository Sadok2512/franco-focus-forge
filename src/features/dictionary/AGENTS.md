# RRC Dictionary rules

- RRC Dictionary fixtures live in `src/mocks/dictionary.ts` and its adapter in `src/lib/api/dictionary.ts` (re-exported by client.ts); the mock aggregates raw observations so every displayed number traces to a response, and conversions are computed only from the API `conversion_rule`.
- Grouping (none/operator/band/operator+band) is computed in `grouping.ts` from the API `value_matrix` so histogram and table always share one dataset; without `value_matrix` only totals are shown.
- Chart and table share effective grouping, value/legend filtering, normalization and semantic color mapping from `chart-data.ts` so displayed cells and marks remain synchronized.
