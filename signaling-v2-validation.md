# BC4 Signaling V2 — 1.80.0 proof report

## Scope
Isolated route `/signaling-v2`, reusing the existing page with an explicit opt-in flag. Stable `/signaling` keeps its full-capture default and no navigator. Nothing was deployed. Source events, message/map filters and VM contracts were not changed.

## Verified
37 targeted tests passed across state evidence, time windows, cursor overlay, cursor integrity, network allowlist and route rendering. Latest preview check reports `build OK`. Targeted lint: zero errors, five existing-style hook dependency warnings in RfTimeline.

| Gate | Status | Evidence |
|---|---|---|
| G1 supplied UE state proof | PASS (fixture) | Rejects partial evidence, absent bounds and missing boundary sequences |
| G2 independent RRC Idle/Connected | PASS (fixture) | Only explicit supplied states; no state-machine reconstruction enabled |
| G3 LTE 4C / NR 2C | PASS (fixture) | Requires count, carrier status, component-carrier definition and separate CA proof |
| G4 NSA coexistence | PASS (fixture) | LTE and NR rendered on separate sublines without replacing LTE |
| G5 distinct sessions | PASS (fixture) | No interval pairing; ambiguous overlaps excluded |
| G6 default 30 seconds | PASS | Browser initial 0–30; stable full-capture regression test |
| G7 10/30/60/120/Fit | PASS | Preset test plus browser Fit to 300 seconds |
| G8 navigator drag | PASS | Browser drag moves start, track click retains 30-second width |
| G9 exact independent cursor | PASS | Browser selected time 245.318; cursor remains selected outside a moved window |
| G10 shared X | PASS (fixture) | RF and ribbon use same controlled window; state lanes share ECharts grid |
| G11 follow message | PASS (fixture) | 245.318 produces 230.318–260.318 without changing width |
| G12 RF missing values | PASS (existing regression tests) | No fabricated NR, no future/zero/interpolated cursor readings; RF line connectNulls stays false |
| G13 real message/payload/map selection | NOT RUN | No authenticated VM session; fixture follow only |
| G14 layout | PASS (fixture) | Screenshot inspection of 0–30, 120–150 and selected-message tooltip |
| G15 screen sizes | PASS (fixture) | 1920×1080, 1440×900, 1280×800 screenshots; cursor present after resize |
| G16 checks | PASS with warnings | 37 tests, zero targeted lint errors, automatic build/typecheck OK, no browser runtime errors |

## Evidence artifacts
Browser script: `/tmp/browser/signaling-v2/check_v2.py`.
Screenshots: `/tmp/browser/signaling-v2/0-30.png`, `120-150.png`, `follow-message.png`, `1920-1080.png`, `1440-900.png`, `1280-800.png`.
Fixtures are explicitly labelled TEST FIXTURE; they are not authentic VM captures or proof of real CA configuration.

## Fresh public VM audit — 2026-10-22
`/health` returned HTTP 200, version 0.74.4, decoder 1.3.0. `/openapi.json` returned the existing captures, message/rows, events, timeline, points, context, details, procedures and export paths. No dedicated UE/RRC state interval endpoint is advertised. The flexible event attrs can carry extra proof, but the public schema alone cannot establish the contents of private capture responses.

For a supplied interval to render, the frontend currently requires explicit state, session_id, technology LTE/NR_NSA/NR_SA, PROVEN evidence, finite start/end, both source boundary sequences and a versioned rule. Optional CA labels additionally require separately proven COMPONENT_CARRIERS and CONFIGURED/ACTIVATED/USED status. These gates are not a claim that the VM currently emits those fields.

## Limitations / stop gate
- Real UE/RRC intervals, session correlation, CA definition/configuration and authenticated messages/payload/GPS: **NOT RUN**, blocked by unavailable authorized VM capture data.
- UE/RRC reconstruction from NMF message transitions remains **disabled**, pending audit of sanitized source payloads and explicit approval.
- No resizing handles added; full-window dragging, click navigation and size selector are available.
- Alternative ribbon/histogram modes remain the existing views; the independent compact state lanes are in the RF timeline view.
- Full page panels with a real authenticated capture were not checked at the three screen sizes; the responsive screenshots are the isolated timeline harness.