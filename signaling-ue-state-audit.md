# Signaling: time navigator and UE-state evidence audit

## Verified locally
- Default visible window: 0–30 seconds, bounded by capture duration.
- Presets: 10, 30, 60, 120 seconds; previous/next, zoom, reset, full capture and draggable navigator.
- RF, ribbon and histogram share the visible window; cursor movement does not change it.
- Isolated browser check: window navigation preserved the selected cursor and issued no additional API requests; ribbon event snapped to exactly 10 seconds; no runtime errors.
- 26 targeted tests passed; targeted lint passed; preview build log reports success.
- Browser evidence uses explicitly labelled fixtures, not an authenticated VM capture.

## Public VM audit
The VM's public `/health` and `/openapi.json` returned HTTP 200 during this check. The contract advertises signaling messages, captures, rows, timeline, points, context, details, events, procedures and export. No separate connectivity/UE-state interval endpoint is advertised.

`SignalingEvent` exposes interval bounds, sequence links and flexible `attrs`, but no required UE/session identity or session-correlation contract. The flexible attributes could carry additional evidence; their absence from OpenAPI does not establish their absence in actual capture responses. Without authorized capture payloads, it is not possible to verify whether RF events provide valid LTE/NSA/SA intervals.

An empty UE State therefore means the current response contains no displayed connectivity intervals. It must not be populated by assuming that a setup message proves an entire connection interval or that an NR measurement proves NSA/SA connectivity.

## Gate before reconstruction
LOT C is not implemented. First obtain authorized sanitized event/message/context samples and the VM's rules for UE/session identity, exact state boundaries, source sequences, failures and incomplete intervals. Review this evidence and request explicit approval before implementing reconstruction. No backend change or deployment was performed.

## Unverified
Real-capture pagination, ASN.1 payload, exact GPS linkage, session correlation, real-data performance and capture switching remain unverified without a VM session.