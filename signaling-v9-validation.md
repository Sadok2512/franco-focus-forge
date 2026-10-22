# BC4 V9 validation — 1.80.3

## Scope and honesty
This is a partial V9 implementation, not a claim that the complete reference is reproduced with real capture data. No production publication. No backend/API/reconstruction changes. Recorded VM-shaped evidence and fixture behavior are distinct from live verification.

## Modified files
- src/features/signaling/state-presentation.ts: evidence-only presentation, count/status mapping and geometry.
- src/features/signaling/RfTimeline.tsx: 34 px segments, 42 px state labels/tracks with 4 px gap, fit-aware 12 px labels, uncolored unknown gaps, exact evidence on selection.
- src/test/signaling-state-presentation.test.ts: nine concrete rules.
- src/locales/en.json and fr.json: new product and interval labels.
- src/styles.css: V9 semantic colors.
- package.json, CHANGELOG.md, AGENTS.md and roadmap.md: version, architecture and remaining work.

## Contract and mapping
Existing RfEvent and provenState/provenStates are unchanged. No proposed ConnectivityInterval contract has been adopted.
- UE IDLE -> Idle only with supplied proven interval.
- UE LTE -> LTE. Explicit proven component count > 1 -> LTE_A (actual count CC), with configured/activated/used qualifier. No inferred single-carrier count.
- UE NR -> NR. Explicit proven count > 1 -> NR (actual count CC), with status qualifier. No inferred N28/N78.
- RRC IDLE -> Idle mode only on supplied proven interval.
- RRC CONNECTED LTE -> LTE; activated/used proven CA -> LTE_A (Advanced). CONFIGURED alone does not establish active advanced mode.
- RRC NR technology alone -> no product-mode segment, because ENDC success and SA context are not established by that field.
- Simultaneous separately proven LTE/NR -> separate 16 px subbands to avoid overlap, not an invented combined mode. This is an explicit deviation from full-height combined V9 bands pending a validated contract.
- No session merging or filling of gaps is introduced. Adjacent same-state segments remain separate unless continuity becomes separately validated.

Recorded VM 0.74.10 example: capture 047e3f34e0af, context 54, session context:047e3f34e0af:54, bounds 1.400–24.182 s, ordered source sequences 234 → 243 → 1608 (RRA → RRC → RRD), separately supplied UE and RRC events. Tests retain this real-response-shaped case; it is not a fresh authenticated read.

## Acceptance
| Gate | Status | Evidence / limitation |
|---|---|---|
| G1 proven configurations only | PASS (fixtures) | Existing 26 evidence tests plus new mapping rules. |
| G2 complete product mode mapping | NOT RUN (complete) | LTE, explicit Idle and active LTE CA mapped/tested; ENDC and SA remain unavailable without validated mode evidence. |
| G3 no permanent NR Unknown labels | PASS (fixtures) | Removed background series; screenshots show uncolored gaps. |
| G4 no unknown -> Idle | PASS (tests) | Partial/missing proof rejected; no new intervals created. |
| G5 wider readable bands | PASS (fixtures, single technology) | 34 px segments, 42 px tracks/4 px gap and width-aware labels; simultaneous LTE/NR remain 16 px subbands. |
| G6 actual carrier counts | PASS (mapping tests), NOT RUN (live) | Dynamic count 3 verified; no counts invented. |
| G7 NR band identity | NOT RUN | No validated band evidence contract; no band names shown. |
| G8 LTE/NR coexistence | PASS (fixtures), NOT RUN (live) | Existing evidence test and independent subband geometry. No assertion of ENDC success. |
| G9 session integrity | PASS (tests) | Existing distinct-session overlap rejection remains unchanged; no merging. |
| G10 cursor/window synchronization | PASS (fixtures) | 0–30 s and 67.1–97.1 s; cursor at 15 s remains selected when outside window. |
| G11 events/messages non-regression | PASS (targeted tests), NOT RUN (full live flow) | Network allowlist, mobility, cursor/navigation tests; fixture state click selects exact evidence sequences. Full messages/payload/GPS flow not verified. |
| G12 real capture Playwright | NOT RUN | No usable authorized VM session available; no fresh login attempt in this task. |
| G13 quality | PASS (targeted) | 76 tests across 8 files; targeted eslint exit 0; harness latest build OK including typecheck. Full repository lint/tests NOT RUN. |

One existing i18next initialization warning is emitted by cursor-overlay tests; no failures. Browser fixture reported zero page errors.

## Visual evidence
Playwright screenshots: before, after 0–30 s, after 67.1–97.1 s. All are fixtures, not VM screenshots. The latter contains no state intervals because supplied fixture bounds end at 24.182 s; an empty track is the honest result. Before fixture did not contain attrs.state=CONNECTED on its RRC event; after fixture includes this required field to match the recorded VM 0.74.10 contract, so RRC appearance is not attributable to a styling-only change.

## Remaining blockers
Fresh authorized VM capture responses are required for G12 and full message/payload/GPS readback. Validated carrier-band, ENDC success and SA-context contracts are required before displaying those modes or combined configurations. Full visual equality to the mockup is not claimed; reference title and non-state track catalog remain deliberately unchanged per scope.