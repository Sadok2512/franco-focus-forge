# Multi-metric drag/drop V1 — validation

## Verified in the running app
- Signed in through the configured BC4 login and opened a real project.
- Capture `41c13c9b4ce0`, project `fa9301f2f3fe`, origin `10:33:22.039`.
- Added `pdsch_bitrate_cw0@0` (555 returned observations).
- Dropped `pdsch_bitrate@0` (555 observations) into that graph: two distinct curves, one Mbit/s axis.
- Dropped `cell_rsrp@0` (964 observations): existing curves remain, independent dBm right axis.
- Three series persist after page reload. No browser page errors or graph alerts in the verified flow.
- Each drop requested only the additional series. Capture, origin and physical units verified against returned metadata.
- Corrected stale leaf-unit metadata: drag payload uses the authoritative metric catalogue unit.
- Exact-timestamp rows contain no fabricated values; missing observations are not joined with continuous interpolation.
- Screenshots inspected in `/tmp/browser/multi-metric/`: one.png, two.png, three.png.

## Remaining acceptance
- Full G1–G19 browser matrix (including zoom/brush retention, event overlays, settings, map/table mixtures and third-unit separate graph) is not fully exercised.
- No server changes or publication.