---
id: 01KWMCW3NWVD7H8ZEGBHJRJ8T0
slug: record-play-history-on-sessiond-managed-session-terminals-pr
title: Record play history on sessiond-managed session terminals (primary Korri path)
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-07-03
source: se-work
---

# Record play history on sessiond-managed session terminals (primary Korri path)

## Why it matters

The play-log recording observer only fires for owner-observed terminals (direct/live-USB launches). On sessiond-managed Korri hosts, the foreground owner hands terminal observation to sessiond after readiness (see local-foreground-launch-adapter launchResponseAfterManagedReadiness), so real device plays are never recorded. Without this, last-played/times-played stay empty for the primary deployment despite the whole model being in place.

## Acceptance Criteria

- [ ] A sessiond-managed session that ends appends one gated play entry for the correct playable id
- [ ] Duration and occurrence time are derived from the sessiond terminal (child-exited/terminated) event
- [ ] The write targets the same play-log store the library repository reads from

## Related

- `work/items/active/01KWM98ZFYY12JTNYWDJ2MD18C-play-log-recording/plan.md`
- `product/platform/library/sessiond-managed-launch-event-observer.ts`
- `product/services/device/game-stream-runner.ts`
- `product/apps/portal/api/library/play-recording-observer.ts`
