# Front 1.141.3 — Radio Snapshot compact et zoom temporel

## Release

- Functional commit: `c3810cefe53c83ed0063ef29d1fd19572fe1acbf`.
- Evidence commit parent / merged release: `fc61cac6f91d7371bea23aa627640f20abb1a85b`.
- Image: `bc4-front-v2:1.141.3-fc61cac`.
- OCI manifest: `sha256:79b714a938a9e9465df7070c4a2f1664cba8f6675b3fdc8785c7acff85f31727`.
- OCI version / revision: `1.141.3` / `fc61cac6f91d7371bea23aa627640f20abb1a85b`.
- Backend unchanged: `0.132.5`; catalogue `2.68.4`; decoder `1.11.2`.

## Commands and results

```text
npm test -- --run src/test/radio-snapshot.test.ts src/test/metric-graph-zoom.test.ts src/test/panel-no-drag-move.test.tsx src/test/point-sync.test.tsx
Test Files 4 passed (4); Tests 18 passed (18)

npm run typecheck
exit 0

npm run test:g55
Test Files 1 passed (1); Tests 4 passed (4)

df -BG /home/devmat/BC4
/dev/sda1 388G 366G 23G 95% /
```

No executable `R5` guard is defined in `DEPLOY.md`, root `AGENTS.md`, frontend
`AGENTS.md`, or the KPI instructions (`rg -n '\bR5\b' ...` returned no match).
The authoritative deployment gates from `DEPLOY.md` were applied.

## Content proof — Test_6 / a4b0c321c52e

Playwright command:

```text
BC4_FRONT_BASE=http://185.248.33.125:5174 \
BC4_PROOF_DIR=audit/deploy-front-1.141.3 \
node audit/bc1-radio-snapshot-zoom/playwright-proof.mjs
```

- Source series: 1,980 points.
- Full X domain: `0 → 4857.711 s`.
- Left handle: `1061.292 → 4857.711 s`.
- Right handle: `1061.292 → 4141.108 s`.
- Window pan: `1290.484 → 4339.123 s`.
- Source point count after every operation: 1,980.
- Workspace switch and browser refresh restore the panned domain exactly.
- Reset Zoom restores `0 → 4857.711 s` and clears persisted zoom.
- Graph selection: `seq 198964`, real log time `16:44:11.824`.
- Exact Snapshot values at that sequence: RSRQ LTE `-13.9 dB`, RSRP LTE
  `-101.3 dBm`, SINR LTE `1 dB`; unavailable NR values remain `N/A`.
- Snapshot metric rows: 34 px; no name/value/bar overlap; no permanent
  up/down/remove controls; pointer drag changes row order.
- API errors: 0; browser console errors: 0.

Public smoke command:

```text
node audit/deploy-front-1.141.3/public-smoke.mjs
```

`/projects`, `/kpi`, `/map`, `/rf` returned HTTP 200; `/signaling` returned
HTTP 200 and reached `/kpi`; gzip was observed; API/console errors = 0.

## Rollback

Previous immutable image retained as:
`bc4-front-v2:rollback-1.141.2-832174d-20261105T1742Z`.
Backend and database were not changed; rollback only requires repinning the
front image and recreating service `front`.
