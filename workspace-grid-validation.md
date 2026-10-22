# BC4 workspace grid validation

## Verdict
Frontend grid correction verified with controlled browser responses; real-VM acceptance remains unverified. No publication.

| Check | Result |
| --- | --- |
| ROOT_CAUSE | Nested/fixed grids and fixed plot heights prevented the workspace setting from consistently controlling independent panels. |
| WORKSPACE_LAYOUT_SOURCE | Active workspace tab layout, interpreted by workspaceColumns. |
| GRID_CONTAINER_FIXED | WorkspaceGrid observes the available container after the catalogue, not window width. |
| FIXED_WIDTH_REMOVED | Shared minmax grid; panel width fills its track. Saved spans clamp to available columns. |
| CHART_RESPONSIVE | ECharts retains resize observers; Recharts retains ResponsiveContainer. Plot height follows grid column count, except fullscreen. |
| SIDEBAR_RESIZE | Browser drag changes available panel width without new requests. |
| SIDEBAR_COLLAPSE | Collapse/expand changes available width without new requests. |
| LAYOUT_1 | Six independent KPI panels, each 1583 px in measured workspace. |
| LAYOUT_2 | Six independent KPI panels, each 784 px. |
| LAYOUT_3 | Six independent KPI panels, each 517 px. |
| AUTO | Three columns at measured wide container; follows observed width. |
| MULTI_PANEL | Six KPI panels and separately six Metrics panels rendered. Removing one Metrics card reflows five remaining panels. |
| INDEPENDENT_GRAPHS | Changing one Metrics card to Table leaves other cards as Graph. |
| MIXED_PANELS | Graph/Table mixture contains a populated table and separate time charts. Map mixture not verified. |
| WORKSPACE_TABS | New tab empty; returning restores six panels and layout. Reload restores panels. Metrics card views restore after switching tabs. |
| API_REGRESSION | No API contracts, filters, calculations or backend changes. Browser resize/collapse produced no additional requests. |
| DATA_INTEGRITY | Controlled responses only; no production-data integrity claim. |
| PLAYWRIGHT | Passed fixture checks at 1920, 1440 and 1280 widths, no page errors. |
| BUILD | Harness reports build OK. |
| TESTS | 263 passed, 2 skipped. Targeted lint: no errors, three existing fast-refresh warnings. |
| KNOWN_LIMITATIONS | Real VM login unavailable; real-data acceptance, zoom retention, mixed Map rendering, drag ordering and fullscreen not exhaustively verified in this run. |
| NEXT_STEP | Validate against an authorized VM session before production acceptance/publication. |

## Files changed
- `src/features/kpi/workspace-grid.ts`, `WorkspaceGrid.tsx`, `PanelShell.tsx`, `workspace.css`
- `src/features/kpi/KpiWorkspace.tsx`, `MetricsWorkspace.tsx`
- `src/features/kpi/KpiGraphCard.tsx`, `MetricGraphCard.tsx`, `MetricVsTimeChart.tsx`
- `src/locales/en.json`, `src/locales/fr.json`
- `src/test/workspace-grid.test.ts`, `AGENTS.md`, `roadmap.md`

## Visual evidence
Inspection screenshots are kept under `/tmp/browser/workspace-grid/`: `layout-1.png`, `layout-2.png`, `layout-3.png`, `layout-auto.png`, `sidebar-collapsed.png`, `responsive-1920.png`, `responsive-1440.png`, `responsive-1280.png`, `metrics-three-columns.png`, `mixed-table-graph.png`. Browser fixture script and measured report are in the same temporary directory. These are development evidence, not app content or production responses.