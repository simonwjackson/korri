---
id: 01KWTYBZA3RYGCDAVQ7TYEGRJB
slug: add-native-moonlight-sessiond-re-establish-hook-for-stream-o
title: Add native Moonlight/sessiond re-establish hook for stream outage recovery
origin: parked
status: To Do
priority: high
labels:
  - stream
  - adaptive
  - moonlight
  - sessiond
  - blocker
created: 2026-07-06
source: se-work
---

# Add native Moonlight/sessiond re-establish hook for stream outage recovery

## Why it matters

The adaptive outage supervisor can detect zero-throughput and return-to-signal, but without a native/sessiond re-establish hook it can only emit reconnect-failed. Full tunnel survival, cold-start-on-reconnect, and hold-last-frame continuity cannot be honestly validated or enabled until this hook exists.

## Acceptance Criteria

- [ ] Stream runtime can invoke a streamer/sessiond re-establish hook without tearing down the game session.
- [ ] Moonlight either preserves/holds the last frame or emits an explicit unsupported signal when the display cannot be held.
- [ ] Outage supervisor marks resumed only after native reconnect succeeds and fresh health samples return.
- [ ] Failure paths surface reconnect-failed with actionable reason and do not silently hang.

## Related

- `product/platform/stream/stream-outage-supervisor.ts`
- `product/platform/stream/stream-session.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `work/items/active/01KSXN94148T4616TA79KHQD9T-adaptive-stream-controller/plan.md`

## Notes

Discovered while wiring U10. Current product branch provides the platform contract and env-gated observer, but intentionally has no fake reconnect implementation.
