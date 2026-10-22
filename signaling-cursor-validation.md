# BC4 — Interactive Signaling cursor validation

Previous version: 1.76.0. New version: 1.77.0.
Backend changed: FALSE. Source data and detection rules changed: FALSE.

## Verified
- Eight cursor-integrity tests and six query-cache tests passed (14/14).
- Focused ESLint passed for the cursor, RF timeline and test harness.
- Automatic preview compilation/typecheck: build OK, 2026-10-21 22:29:10 UTC.
- Isolated Playwright fixture: exact event selection 245.318 s, linked seq 1012, continuous red cursor through RF grids, tooltip and observed sample markers.
- Free click, ArrowRight to an observed sample (138 s), drag to 169.48866286792338 s, zoom 25–75%, Escape clearing the handle passed.
- Sixty mouse moves produced zero additional API calls. Elapsed automated interaction time: about 1.3 seconds; this is not a real-capture latency benchmark.
- No browser runtime errors in the final isolated run.
- Screenshot inspected: `/tmp/browser/signaling-cursor/fixture-event.png`. This is a TEST FIXTURE, not a real capture.
- Script: `/tmp/browser/signaling-cursor/check_cursor.py`; browser harness: `src/test/signaling-browser-harness.tsx`, never imported by application routes.

## Not verified / limitations
- Real Signaling route redirected to login. No usable VM session was available; the preview origin was also rejected by the VM CORS configuration in the earlier live test.
- Real-capture screenshot, message pagination/readback, ASN.1 payload and exact GPS synchronization: NOT RUN. Their frontend wiring is implemented but not claimed as end-to-end verified.
- Only existing LTE RSRP, RSRQ and SINR series are requested. NR measurements are unavailable in this contract; none are synthesized.
- Active interval highlighting requires explicit PROVEN evidence and actual start/end timestamps. No absent task or UE-state interval is inferred.
- Compact histogram retains its existing selection line; the full interactive overlay extends the RF timeline. Ribbon, compact, full-screen, brush and pan regression checks remain NOT RUN.
- GPS selection rejects previous GPS points as exact event positions. The existing map route remains intact; no center/zoom change is made on selection.
- No manual production build or typecheck was run; the platform performed those checks automatically.

## Acceptance status
G1–G5: PASS in isolated fixtures only.
G6–G7: integrity rules PASS in unit tests; live capture NOT RUN.
G8–G10: NOT RUN against the VM.
G11: zoom PASS in isolated fixture; brush/pan NOT RUN.
G12: NOT RUN.
G13: PASS for zero hover requests in fixture; real-capture performance NOT RUN.
G14: query cache tests PASS; live message-selection regression NOT RUN.
G15: focused lint, 14 tests and automatic compile PASS; full lint suite NOT RUN.

Verdict: implementation available; real-capture acceptance blocked by VM access. Restore preview CORS and sign in with a VM account before completing acceptance.