# Signaling Time Cursor V3 — 1.80.1

## Scope
Updated the existing opt-in `/signaling-v2`, preserving stable `/signaling` and the existing page design. No source-data, backend, inspector, GPS, dictionary or KPI changes; no publication.

## Changes
- `TimeNavigator.tsx`: blue window, independent pointer/keyboard start/end handles, bounded edge resizing; existing previous/next, zoom, reset and presets retained.
- `time-window.ts`: pure `resizeWindow` helper.
- `TimeCursor.tsx`: stop cursor-handle events propagating to the chart; cache proven-state validation outside mouse motion.
- `signaling.css`, `styles.css`: semantic navigator styling.
- `en.json`, `fr.json`: handle accessibility labels.
- `signaling-time-window.test.ts`, `signaling-navigator.test.tsx`: boundary and keyboard regression tests.
- `signaling-browser-harness.tsx`: configurable capture duration for the 546.905-second scenario.
- `package.json`, `CHANGELOG.md`, `AGENTS.md`, `roadmap.md`: version and documentation.

## Validation
51 targeted tests passed. Targeted ESLint passed (formatting rule excluded). Harness compilation reported build OK at 09:06:49 UTC on October 22, 2026. Manual typecheck not run; harness owns compilation/typechecking.

Playwright used explicitly labeled fixtures, not VM data, at 1280×1800 and resize checks at 1920×1080, 1440×900 and 1280×800. Runtime errors: zero.

| Gate | Result | Evidence / limitation |
|---|---|---|
| G1–G2 | PASS, fixture | Continuous cursor through state/event/RF grids; label 133.452 s |
| G3–G4 | PASS, fixture | Continuous handle drag; hover does not replace locked time |
| G5–G7 | PASS, fixture/unit | 0–30 initial window; 546.905 s full capture, reset, movement and preset boundary tests |
| G8–G9 | PASS, fixture | Cursor drag leaves 120–150 window unchanged; aligned RF/state grids; resizing end to 160 leaves start 120 and cursor unchanged |
| G10 | PARTIAL | Fixture message follows 245.318 to 230.318–260.318; actual message-row/payload flow NOT RUN |
| G11–G12 | NOT RUN, live | Actual event/payload/list readback requires authorized VM session |
| G13 | PASS, fixture | Request count unchanged during cursor drag and hover |
| G14 | PARTIAL | Cursor survives viewport resize; fullscreen and live split-panel/map changes NOT RUN |
| G15 | PASS, fixture | Screenshots: 0–30, 120–150, cursor 133.452 s |
| G16 | PARTIAL | 51 tests, lint, harness build OK; separate manual typecheck not run |

## Real-data blocker
Attempted the configured reader account through the actual `/login` form. The VM returned `Identifiants invalides`; no real capture was opened and no actual before screenshot was available. No credential values were printed or saved in this report. Live UE/RRC/CA, message/payload/GPS and visual approval remain blocked until current reader credentials are supplied securely.

## Screenshots
Isolated fixture screenshots were saved under `/tmp/browser/cursor-v3/` and shared as standalone files. They are expressly labeled test fixtures and do not assert real LTE/NR/CA evidence. They demonstrate the cursor and navigator, not parity with all illustrative states in the reference image.